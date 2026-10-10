// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockIDR} from "../src/MockIDR.sol";
import {RentalItem} from "../src/RentalItem.sol";
import {Reputation} from "../src/Reputation.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";
import {IERC4907} from "../src/interfaces/IERC4907.sol";

contract RentraTest is Test {
    uint256 internal constant VALUE = 3_000_000 ether;
    uint256 internal constant RATE = 150_000 ether;
    uint256 internal constant LATE = 10_000 ether;
    uint32 internal constant GRACE = 24;

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    MockIDR internal idr;
    RentalItem internal item;
    Reputation internal reputation;
    RentalEscrow internal escrow;

    address internal owner;
    uint256 internal ownerPk;
    address internal renter;
    uint256 internal renterPk;

    bytes32 internal constant PHOTO_OUT = keccak256("photo-out");
    bytes32 internal constant PHOTO_IN = keccak256("photo-in");

    function setUp() public {
        vm.warp(1_000_000);
        (owner, ownerPk) = makeAddrAndKey("owner");
        (renter, renterPk) = makeAddrAndKey("renter");

        idr = new MockIDR();
        item = new RentalItem();
        reputation = new Reputation();
        escrow = new RentalEscrow(address(idr), address(item), address(reputation), false);
        item.setEscrow(address(escrow));
        reputation.setEscrow(address(escrow));
        reputation.setOwnerApproval(owner, true);

        _fund(renter);
        _fund(owner);
    }

    function test_unsignedReturn_keepsFundsLockedAndNoReputation() public {
        uint256 tokenId = _list(owner);
        uint64 ts = uint64(vm.getBlockTimestamp());
        uint256 id = _book(renter, tokenId, ts, ts + 1 days);
        bytes memory sig = _signHandover(id, PHOTO_OUT, ts);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, ts, sig);
        uint256 ownerBefore = idr.balanceOf(owner);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, "");
        assertEq(idr.balanceOf(owner), ownerBefore, "unsigned return must not pay rent");
        assertEq(idr.balanceOf(address(escrow)), RATE + VALUE);
        (, uint32 ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 0, "unsigned return must not earn reputation");
        vm.warp(vm.getBlockTimestamp() + 2 days);
        vm.expectRevert();
        escrow.finalizeClaim(id);
    }

    function test_reputationWaitsForSettlement() public {
        uint256 id = _returnedRental();
        (, uint32 ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 0, "claim window must finish before reputation");
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);
        (, ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 1);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.finalizeClaim(id);
    }

    function test_unapprovedOwner_cannotEarnDiscount() public {
        reputation.setOwnerApproval(owner, false);
        uint256 id = _returnedRental();
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);
        assertEq(reputation.depositFactorBps(renter), 10_000, "unapproved owner must not grant discounts");
        assertEq(reputation.maxSuccessfulValue(renter), 0);
    }

    function test_defaultListing_keepsFullDeposit() public {
        vm.prank(address(escrow));
        reputation.record(renter, 0, VALUE, owner);
        vm.prank(owner);
        uint256 tokenId = item.listItem("full collateral", VALUE, RATE, LATE, GRACE);
        assertEq(escrow.quoteDeposit(tokenId, renter), VALUE, "default listing must retain full collateral");
    }

    function test_listQuoteAndBookCancel() public {
        uint256 tokenId = _list(owner);
        assertEq(escrow.quoteDeposit(tokenId, renter), VALUE);
        assertEq(item.userOf(tokenId), address(0));
        assertTrue(item.supportsInterface(type(IERC4907).interfaceId));

        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 2 days;
        assertEq(escrow.quoteRent(tokenId, start, start + 1 hours), RATE);

        uint256 id = _book(renter, tokenId, start, end);
        uint256 total = RATE * 2 + VALUE;
        assertEq(idr.balanceOf(renter), MockIDR(address(idr)).FAUCET_AMOUNT() - total);
        assertEq(idr.balanceOf(address(escrow)), total);
        assertTrue(escrow.isLocked(tokenId));

        (,,,,,,,,,, RentalEscrow.Status status,) = escrow.rentals(id);
        assertEq(uint256(status), uint256(RentalEscrow.Status.Booked));

        bytes memory earlySig = _signHandover(id, PHOTO_OUT, start);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.handover(id, PHOTO_OUT, start, earlySig);

        vm.prank(owner);
        escrow.cancel(id);
        assertEq(idr.balanceOf(renter), idr.FAUCET_AMOUNT());
        assertEq(idr.balanceOf(address(escrow)), 0);
        assertFalse(escrow.isLocked(tokenId));

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.cancel(id);
    }

    function test_happyPath_thenReputationDiscount() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 2 days;
        uint256 id = _book(renter, tokenId, start, end);

        bytes memory sig = _signHandover(id, PHOTO_OUT, start);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, start, sig);

        assertEq(item.userOf(tokenId), renter);
        assertEq(item.userExpires(tokenId), end);

        vm.warp(end);
        assertEq(item.userOf(tokenId), renter);
        vm.warp(end + 1);
        assertEq(item.userOf(tokenId), address(0));
        vm.warp(start);

        uint256 ownerBefore = idr.balanceOf(owner);
        uint64 retTs = uint64(vm.getBlockTimestamp());
        bytes memory retSig = _signReturn(id, PHOTO_IN, retTs);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, retTs, retSig);

        assertEq(idr.balanceOf(owner), ownerBefore + RATE * 2);
        assertEq(idr.balanceOf(address(escrow)), VALUE);
        assertEq(item.userOf(tokenId), address(0));

        (uint16 score, uint32 ok, uint32 late, uint32 defaults) = reputation.scoreOf(renter);
        assertEq(ok, 0);
        assertEq(late, 0);
        assertEq(defaults, 0);
        assertEq(score, 0);
        assertEq(reputation.depositFactorBps(renter), 10_000);
        assertEq(reputation.maxSuccessfulValue(renter), 0);

        vm.warp(vm.getBlockTimestamp() + 24 hours - 1);
        vm.expectRevert(RentalEscrow.WindowOpen.selector);
        escrow.finalizeClaim(id);

        vm.warp(vm.getBlockTimestamp() + 1);
        escrow.finalizeClaim(id);
        assertEq(idr.balanceOf(renter), idr.FAUCET_AMOUNT() - RATE * 2);
        assertFalse(escrow.isLocked(tokenId));

        (score, ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 1);
        assertEq(score, 100);
        assertEq(reputation.depositFactorBps(renter), 9_000);
        assertEq(reputation.maxSuccessfulValue(renter), VALUE);

        uint256 token2 = _list(owner);
        // Same owner does not grant another discount step.
        assertEq(escrow.quoteDeposit(token2, renter), (VALUE * 9_000) / 10_000);
    }

    function test_packedSignatureHandoverAndUnilateralReturn() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);

        bytes memory packed = abi.encode(start, _signHandover(id, PHOTO_OUT, start));
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, packed);

        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, "");

        (uint16 score, uint32 ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 0);
        assertEq(score, 0);
        assertEq(escrow.lateFee(id, start), 0);
    }

    function test_lateFee_isCeiledAndCapped() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);

        assertEq(escrow.lateFee(id, end), 0);
        assertEq(escrow.lateFee(id, end + 1), LATE);
        assertEq(escrow.lateFee(id, end + 3600), LATE);
        assertEq(escrow.lateFee(id, end + 3601), LATE * 2);

        bytes memory sig = _signHandover(id, PHOTO_OUT, start);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, start, sig);

        vm.warp(end + 3 hours);
        escrow.sync(id);
        (,,,,,,,,,, RentalEscrow.Status status,) = escrow.rentals(id);
        assertEq(uint256(status), uint256(RentalEscrow.Status.Late));

        uint256 ownerBefore = idr.balanceOf(owner);
        uint64 ts = uint64(vm.getBlockTimestamp());
        bytes memory retSig = _signReturn(id, PHOTO_IN, ts);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, ts, retSig);

        assertEq(idr.balanceOf(owner), ownerBefore + RATE + LATE * 3);
        (, uint256 depositRemaining,,) = _meta(id);
        assertEq(depositRemaining, VALUE - LATE * 3);

        (, uint32 ok, uint32 late,) = reputation.scoreOf(renter);
        assertEq(ok, 0);
        assertEq(late, 0);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);
        (,, late,) = reputation.scoreOf(renter);
        assertEq(late, 1);
        assertEq(reputation.depositFactorBps(renter), 10_000);
    }

    function test_lateFeeCapsAtDeposit() public {
        vm.prank(owner);
        uint256 tokenId = item.listItem("ipfs://x", VALUE, RATE, VALUE, GRACE);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);
        assertEq(escrow.lateFee(id, end + 2 hours), VALUE);
    }

    function test_claimDefault_afterGrace_isPermanent() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);
        bytes memory sig = _signHandover(id, PHOTO_OUT, start);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, start, sig);

        vm.warp(end + uint256(GRACE) * 1 hours - 1);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.GraceNotOver.selector);
        escrow.claimDefault(id);

        vm.warp(end + uint256(GRACE) * 1 hours);
        uint256 ownerBefore = idr.balanceOf(owner);
        vm.prank(owner);
        escrow.claimDefault(id);

        assertEq(idr.balanceOf(owner), ownerBefore + RATE + VALUE);
        assertEq(idr.balanceOf(address(escrow)), 0);
        assertTrue(reputation.hasDefaulted(renter));
        assertEq(reputation.depositFactorBps(renter), 10_000);
        (,,, uint32 defaults) = reputation.scoreOf(renter);
        assertEq(defaults, 1);

        // A later clean rental does not restore the discount.
        uint256 token2 = _listOther("owner-2");
        uint64 start2 = uint64(vm.getBlockTimestamp());
        uint256 id2 = _book(renter, token2, start2, start2 + 1 days);
        _activateAndReturn(id2, token2);
        assertEq(reputation.depositFactorBps(renter), 10_000);
        assertTrue(reputation.hasDefaulted(renter));
    }

    function test_damageClaim_accept() public {
        uint256 id = _returnedRental();
        uint256 amount = 1_000_000 ether;

        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("scratch"));

        uint256 ownerBefore = idr.balanceOf(owner);
        uint256 renterBefore = idr.balanceOf(renter);
        vm.prank(renter);
        escrow.respondClaim(id, true, 0);

        // Bond is returned to the owner along with the accepted amount.
        assertEq(idr.balanceOf(owner), ownerBefore + amount + amount / 10);
        assertEq(idr.balanceOf(renter), renterBefore + (VALUE - amount));
        assertEq(idr.balanceOf(address(escrow)), 0);
        assertFalse(escrow.isLocked(_token(id)));
    }

    function test_damageClaim_counterAccepted() public {
        uint256 id = _returnedRental();
        uint256 amount = 1_000_000 ether;
        uint256 counter = 400_000 ether;

        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("dent"));

        vm.prank(renter);
        escrow.respondClaim(id, false, counter);

        uint256 ownerBefore = idr.balanceOf(owner);
        vm.prank(owner);
        escrow.acceptCounter(id);
        assertEq(idr.balanceOf(owner) - ownerBefore, counter + amount / 10);
    }

    function test_damageClaim_silentRenter_keepsFundsLocked() public {
        uint256 id = _returnedRental();
        uint256 amount = 500_000 ether;
        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("crack"));

        vm.warp(vm.getBlockTimestamp() + 24 hours - 1);
        vm.expectRevert(RentalEscrow.ResolutionRequired.selector);
        escrow.finalizeClaim(id);

        vm.warp(vm.getBlockTimestamp() + 1);
        uint256 ownerBefore = idr.balanceOf(owner);
        vm.expectRevert(RentalEscrow.ResolutionRequired.selector);
        escrow.finalizeClaim(id);
        assertEq(idr.balanceOf(owner), ownerBefore);
        assertEq(idr.balanceOf(address(escrow)), VALUE + amount / 10);
    }

    function test_damageClaim_rejectedCounter_bondSlashed() public {
        (uint256 id, address mediator) = _returnedWithMediator();
        uint256 amount = 800_000 ether;
        uint256 bond = amount / 10;

        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("stain"));
        vm.prank(renter);
        escrow.respondClaim(id, false, 0);

        vm.warp(vm.getBlockTimestamp() + 24 hours);
        uint256 renterBefore = idr.balanceOf(renter);
        uint256 ownerBefore = idr.balanceOf(owner);
        vm.prank(mediator);
        escrow.resolveClaim(id, 0, false);

        assertEq(idr.balanceOf(renter) - renterBefore, VALUE + bond);
        assertEq(idr.balanceOf(owner), ownerBefore);
    }

    function test_escalate_neverPaysOnSilence() public {
        uint256 id = _returnedRental();
        uint256 amount = 200_000 ether;
        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("ev"));
        vm.prank(renter);
        escrow.escalate(id);

        (,,,,,,,,,, RentalEscrow.Status status,) = escrow.rentals(id);
        assertEq(uint256(status), uint256(RentalEscrow.Status.Disputed));

        vm.warp(vm.getBlockTimestamp() + 24 hours);
        vm.expectRevert(RentalEscrow.ResolutionRequired.selector);
        escrow.finalizeClaim(id);
        (,,,,,,,,,, status,) = escrow.rentals(id);
        assertEq(uint256(status), uint256(RentalEscrow.Status.Disputed));
    }

    function test_claimWindow_closes() public {
        uint256 id = _returnedRental();
        vm.warp(vm.getBlockTimestamp() + 24 hours + 1);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.WindowClosed.selector);
        escrow.fileDamageClaim(id, 1000 ether, keccak256("late"));
    }

    function test_signatureReplayAndExpiry() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint256 id = _book(renter, tokenId, start, start + 2 days);
        bytes memory sig = _signHandover(id, PHOTO_OUT, start);

        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, start, sig);

        uint256 token2 = _listOther("owner-replay");
        address owner2 = item.ownerOf(token2);
        uint256 id2 = _book(renter, token2, start, start + 2 days);
        vm.prank(owner2);
        vm.expectRevert(RentalEscrow.BadSignature.selector);
        escrow.handover(id2, PHOTO_OUT, start, sig);

        uint256 token3 = _listOther("owner-expired");
        address owner3 = item.ownerOf(token3);
        uint64 oldTs = start - 2 hours;
        uint256 id3 = _book(renter, token3, start, start + 2 days);
        bytes memory expiredSig = _signHandover(id3, PHOTO_OUT, oldTs);
        vm.prank(owner3);
        vm.expectRevert(RentalEscrow.SigExpired.selector);
        escrow.handover(id3, PHOTO_OUT, oldTs, expiredSig);
    }

    function test_accessAndAvailability() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());

        vm.prank(owner);
        vm.expectRevert(RentalEscrow.CannotRentOwn.selector);
        escrow.book(tokenId, start, start + 1 days);

        uint256 id = _book(renter, tokenId, start, start + 1 days);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.ItemUnavailable.selector);
        escrow.book(tokenId, start, start + 1 days);

        vm.prank(owner);
        vm.expectRevert(RentalItem.TransferLocked.selector);
        item.transferFrom(owner, renter, tokenId);

        vm.expectRevert(RentalItem.NotEscrow.selector);
        item.setUser(tokenId, renter, start + 1 days);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.cancel(id + 99);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.cancel(id);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(RentalEscrow.NotAdmin.selector);
        escrow.setDemoMode(true);

        vm.expectRevert(RentalItem.EscrowAlreadySet.selector);
        item.setEscrow(address(1));
    }

    function test_handoverTooEarly() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp() + 1 days);
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);

        uint64 nowTs = uint64(vm.getBlockTimestamp());
        bytes memory tooEarlySig = _signHandover(id, PHOTO_OUT, nowTs);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.TooEarly.selector);
        escrow.handover(id, PHOTO_OUT, nowTs, tooEarlySig);

        vm.warp(start);
        uint64 atStart = uint64(vm.getBlockTimestamp());
        bytes memory onTimeSig = _signHandover(id, PHOTO_OUT, atStart);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, atStart, onTimeSig);
        assertEq(item.userOf(tokenId), renter);
    }

    function test_bookWithPermit() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 1 days;

        vm.prank(renter);
        idr.approve(address(escrow), 0);

        uint256 value = RATE + VALUE;
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                idr.DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, renter, address(escrow), value, idr.nonces(renter), deadline))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(renterPk, digest);

        vm.prank(renter);
        uint256 id = escrow.bookWithPermit(tokenId, start, end, value, deadline, v, r, s);
        assertEq(id, 1);
        assertEq(idr.allowance(renter, address(escrow)), 0);
    }

    function test_reputation_antiGaming() public {
        Reputation rep = new Reputation();
        rep.setEscrow(address(this));

        address a = makeAddr("a");
        address lowOwner = makeAddr("low");
        address rich = makeAddr("rich");
        rep.setOwnerApproval(rich, true);

        rep.record(a, rep.OUTCOME_OK(), 100_000 ether, lowOwner);
        assertEq(rep.depositFactorBps(a), 10_000);
        assertEq(rep.maxSuccessfulValue(a), 0);
        assertEq(rep.uniqueOwnersOf(a), 0);

        rep.record(a, rep.OUTCOME_OK(), 600_000 ether, rich);
        assertEq(rep.depositFactorBps(a), 9_000);
        assertEq(rep.maxSuccessfulValue(a), 600_000 ether);

        // Same owner again does not step the factor.
        rep.record(a, rep.OUTCOME_OK(), 600_000 ether, rich);
        assertEq(rep.depositFactorBps(a), 9_000);
        assertEq(rep.uniqueOwnersOf(a), 1);

        // 3-arg form records the outcome but grants no owner credit.
        rep.record(a, rep.OUTCOME_OK(), 3_000_000 ether);
        assertEq(rep.uniqueOwnersOf(a), 1);
        assertEq(rep.maxSuccessfulValue(a), 600_000 ether);

        address farmer = makeAddr("farmer");
        for (uint256 i = 0; i < 8; i++) {
            rep.setOwnerApproval(address(uint160(0x1000 + i)), true);
            rep.record(farmer, rep.OUTCOME_OK(), 1_000_000 ether, address(uint160(0x1000 + i)));
        }
        assertEq(rep.depositFactorBps(farmer), 3_000);
        (uint16 score,,,) = rep.scoreOf(farmer);
        assertEq(score, 800);

        rep.record(farmer, rep.OUTCOME_DEFAULT(), 1_000_000 ether, rich);
        assertEq(rep.depositFactorBps(farmer), 10_000);
        assertTrue(rep.hasDefaulted(farmer));
        uint32 defaults;
        (score,,, defaults) = rep.scoreOf(farmer);
        assertEq(defaults, 1);
        assertEq(score, 50);

        rep.record(farmer, rep.OUTCOME_OK(), 5_000_000 ether, makeAddr("after-default"));
        assertEq(rep.depositFactorBps(farmer), 10_000);

        vm.expectRevert(Reputation.BadOutcome.selector);
        rep.record(farmer, 9, 1 ether, rich);

        vm.prank(farmer);
        vm.expectRevert(Reputation.NotEscrow.selector);
        rep.record(farmer, 0, 1 ether);
    }

    function test_quoteDeposit_capsDiscountAtMaxSuccessfulValue() public {
        uint256 cheapId;
        vm.prank(owner);
        cheapId = item.listItem("ipfs://cheap", 600_000 ether, RATE, LATE, GRACE);
        uint64 start = uint64(vm.getBlockTimestamp());
        uint256 id = _book(renter, cheapId, start, start + 1 days);
        _activateAndReturn(id, cheapId);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);

        uint256 expensive = _list(owner);
        uint256 expected = (600_000 ether * 9_000) / 10_000 + (VALUE - 600_000 ether);
        assertEq(escrow.quoteDeposit(expensive, renter), expected);
    }

    function test_fiveUniqueOwners_halfDeposit() public {
        vm.prank(renter);
        idr.faucet();
        for (uint256 i = 0; i < 5; i++) {
            uint256 listed = _listOther(string.concat("owner-", vm.toString(i)));
            uint64 start = uint64(vm.getBlockTimestamp());
            uint256 id = _book(renter, listed, start, start + 1 days);
            _activateAndReturn(id, listed);
            vm.warp(vm.getBlockTimestamp() + 24 hours);
            escrow.finalizeClaim(id);
        }
        assertEq(reputation.depositFactorBps(renter), 5_000);
        uint256 tokenId = _list(owner);
        assertEq(escrow.quoteDeposit(tokenId, renter), VALUE / 2);
    }

    function test_faucetAndInvalidList() public {
        address newbie = makeAddr("newbie");
        vm.prank(newbie);
        idr.faucet();
        assertEq(idr.balanceOf(newbie), idr.FAUCET_AMOUNT());

        vm.prank(owner);
        vm.expectRevert(RentalItem.InvalidTerms.selector);
        item.listItem("ipfs://nope", 0, RATE, LATE, GRACE);
    }

    function test_ownerAcknowledgement_usesRequestTimeAndStartsRealWindow() public {
        (uint256 id, uint256 tokenId) = _requestedRental(false);
        uint256 ownerBefore = idr.balanceOf(owner);
        uint64 requestTime = uint64(vm.getBlockTimestamp());
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(owner);
        escrow.acknowledgeReturn(id);
        assertEq(idr.balanceOf(owner) - ownerBefore, RATE);
        (, uint64 returnedAt,, uint256 fee) = escrow.meta(id);
        assertEq(returnedAt, requestTime);
        assertEq(fee, 0);
        assertEq(escrow.claimDeadline(id), vm.getBlockTimestamp() + 24 hours);
        assertTrue(escrow.isLocked(tokenId));
        vm.expectRevert(RentalEscrow.WindowOpen.selector);
        escrow.finalizeClaim(id);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);
        assertFalse(escrow.isLocked(tokenId));
    }

    function test_returnRequest_cannotRepeatOrDefaultOrSelfSettle() public {
        (uint256 id,) = _requestedRental(false);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.confirmReturn(id, PHOTO_IN, "");
        vm.warp(vm.getBlockTimestamp() + 3 days);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.claimDefault(id);
        vm.prank(renter);
        escrow.proposeSettlement(id, 0);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.StaleOffer.selector);
        escrow.acceptSettlement(id, renter, 0);
        assertEq(idr.balanceOf(address(escrow)), RATE + VALUE);
    }

    function test_returnDispute_needsPartyEvidence() public {
        (uint256 id,) = _requestedRental(false);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.acknowledgeReturn(id);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.disputeReturn(id, PHOTO_OUT);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.EmptyPhoto.selector);
        escrow.disputeReturn(id, bytes32(0));
        vm.prank(owner);
        escrow.disputeReturn(id, PHOTO_OUT);
        (, bytes32 evidence) = escrow.returnRequests(id);
        assertEq(evidence, PHOTO_OUT);
        vm.expectRevert(RentalEscrow.NotMediator.selector);
        escrow.resolveReturn(id, true, 0);
        vm.prank(owner);
        escrow.acknowledgeReturn(id);
        assertEq(escrow.claimDeadline(id), vm.getBlockTimestamp() + 24 hours);
    }

    function test_mediatorRequiresConsentAndIsFrozen() public {
        uint256 tokenId = _list(owner);
        uint64 ts = uint64(vm.getBlockTimestamp());
        uint256 id = _book(renter, tokenId, ts, ts + 1 days);
        address mediator = makeAddr("mediator");
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.proposeMediator(id, mediator);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.proposeMediator(id, renter);
        vm.prank(owner);
        escrow.proposeMediator(id, mediator);
        bytes memory sig = _signHandover(id, PHOTO_OUT, ts);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.MediatorPending.selector);
        escrow.handover(id, PHOTO_OUT, ts, sig);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.NotRenter.selector);
        escrow.acceptMediator(id, mediator);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.StaleOffer.selector);
        escrow.acceptMediator(id, address(123));
        vm.prank(renter);
        escrow.acceptMediator(id, mediator);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.MediatorFrozen.selector);
        escrow.proposeMediator(id, address(123));
        // A signature made before agreeing a mediator cannot authorize different terms.
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.BadSignature.selector);
        escrow.handover(id, PHOTO_OUT, ts, sig);
        sig = _signHandover(id, PHOTO_OUT, ts);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, ts, sig);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.proposeMediator(id, address(123));
    }

    function test_mediatorReturnRuling_capsCompensationAndRecordsDamage() public {
        (uint256 id, uint256 tokenId) = _requestedRental(true);
        address mediator = makeAddr("mediator");
        vm.prank(mediator);
        vm.expectRevert(RentalEscrow.BadAmount.selector);
        escrow.resolveReturn(id, true, VALUE + 1);
        uint256 ownerBefore = idr.balanceOf(owner);
        uint256 renterBefore = idr.balanceOf(renter);
        vm.prank(mediator);
        escrow.resolveReturn(id, true, 500_000 ether);
        assertEq(idr.balanceOf(owner) - ownerBefore, RATE + 500_000 ether);
        assertEq(idr.balanceOf(renter) - renterBefore, 2_500_000 ether);
        assertEq(idr.balanceOf(address(escrow)), 0);
        assertEq(reputation.damagesOf(renter), 1);
        assertEq(reputation.depositFactorBps(renter), 10_000);
        assertFalse(escrow.isLocked(tokenId));
        vm.prank(mediator);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.resolveReturn(id, true, 0);
    }

    function test_mediatorNonReturn_onlyAfterGrace() public {
        (uint256 id,) = _requestedRental(true);
        address mediator = makeAddr("mediator");
        vm.prank(owner);
        escrow.disputeReturn(id, PHOTO_OUT);
        vm.prank(mediator);
        vm.expectRevert(RentalEscrow.GraceNotOver.selector);
        escrow.resolveReturn(id, false, 0);
        vm.warp(vm.getBlockTimestamp() + 2 days);
        vm.prank(mediator);
        vm.expectRevert(RentalEscrow.BadAmount.selector);
        escrow.resolveReturn(id, false, 1);
        uint256 before = idr.balanceOf(owner);
        vm.prank(mediator);
        escrow.resolveReturn(id, false, 0);
        assertEq(idr.balanceOf(owner) - before, RATE + VALUE);
        assertEq(idr.balanceOf(address(escrow)), 0);
        assertTrue(reputation.hasDefaulted(renter));
        assertEq(escrow.openRentalCount(), 0);
    }

    function test_signedReturn_canResolvePendingRequest() public {
        (uint256 id,) = _requestedRental(false);
        vm.prank(owner);
        escrow.disputeReturn(id, PHOTO_OUT);
        uint64 ts = uint64(vm.getBlockTimestamp());
        bytes memory sig = _signReturn(id, PHOTO_IN, ts);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, ts, sig);
        assertEq(escrow.claimDeadline(id), vm.getBlockTimestamp() + 24 hours);
    }

    function test_settlementOffers_requireExactCounterpartyAcceptance() public {
        (uint256 id,) = _requestedRental(false);
        vm.prank(renter);
        escrow.proposeSettlement(id, 0);
        vm.prank(owner);
        escrow.proposeSettlement(id, 100_000 ether);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.StaleOffer.selector);
        escrow.acceptSettlement(id, renter, 0);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.StaleOffer.selector);
        escrow.acceptSettlement(id, owner, 0);
        vm.prank(renter);
        escrow.acceptSettlement(id, owner, 100_000 ether);
        assertEq(reputation.damagesOf(renter), 1);
        assertEq(idr.balanceOf(address(escrow)), 0);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.proposeSettlement(id, 0);
    }

    function test_claimRuling_isBoundedAndCannotBeCalledByAdmin() public {
        (uint256 id, address mediator) = _returnedWithMediator();
        vm.prank(owner);
        escrow.fileDamageClaim(id, 200_000 ether, PHOTO_OUT);
        vm.expectRevert(RentalEscrow.NotMediator.selector);
        escrow.resolveClaim(id, 0, false);
        vm.prank(mediator);
        vm.expectRevert(RentalEscrow.BadAmount.selector);
        escrow.resolveClaim(id, 200_000 ether + 1, true);
        vm.prank(mediator);
        escrow.resolveClaim(id, 100_000 ether, true);
        assertEq(reputation.damagesOf(renter), 1);
        assertEq(idr.balanceOf(address(escrow)), 0);
    }

    function test_claimSettlementCounter_doesNotKeepStaleOffer() public {
        uint256 id = _returnedRental();
        vm.prank(owner);
        escrow.fileDamageClaim(id, 200_000 ether, PHOTO_OUT);
        vm.prank(owner);
        escrow.proposeSettlement(id, 100_000 ether);
        vm.prank(renter);
        escrow.respondClaim(id, false, 0);
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.StaleOffer.selector);
        escrow.acceptSettlement(id, owner, 100_000 ether);
        vm.prank(renter);
        escrow.proposeSettlement(id, 0);
        vm.prank(owner);
        escrow.acceptSettlement(id, renter, 0);
        (, uint32 ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 1);
    }

    function test_newSettlementOffer_invalidatesOldClaimCounter() public {
        uint256 id = _returnedRental();
        vm.prank(owner);
        escrow.fileDamageClaim(id, 200_000 ether, PHOTO_OUT);
        vm.prank(renter);
        escrow.respondClaim(id, false, 50_000 ether);
        vm.prank(renter);
        escrow.proposeSettlement(id, 100_000 ether);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.BadStatus.selector);
        escrow.acceptCounter(id);
        vm.prank(owner);
        escrow.acceptSettlement(id, renter, 100_000 ether);
        assertEq(idr.balanceOf(address(escrow)), 0);
    }

    function test_zeroLateFee_doesNotEarnOnTimeDiscount() public {
        vm.prank(owner);
        uint256 tokenId = item.listItem("no late charge", VALUE, RATE, 0, GRACE, 3_000);
        uint64 ts = uint64(vm.getBlockTimestamp());
        uint256 id = _book(renter, tokenId, ts, ts + 1 days);
        bytes memory sig = _signHandover(id, PHOTO_OUT, ts);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, ts, sig);
        vm.warp(vm.getBlockTimestamp() + 1 days + 1);
        ts = uint64(vm.getBlockTimestamp());
        sig = _signReturn(id, PHOTO_IN, ts);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, ts, sig);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);
        assertEq(reputation.depositFactorBps(renter), 10_000, "late with zero charge is still late");
        (, uint32 ok, uint32 late,) = reputation.scoreOf(renter);
        assertEq(ok, 0);
        assertEq(late, 1);
    }

    function test_claimDeadline_exactBoundaryClosesClaim() public {
        uint256 id = _returnedRental();
        vm.warp(escrow.claimDeadline(id));
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.WindowClosed.selector);
        escrow.fileDamageClaim(id, 1 ether, PHOTO_OUT);
        escrow.finalizeClaim(id);
    }

    function test_clockCannotChangeUntilAllRentalsClose() public {
        uint256 tokenId = _list(owner);
        uint64 ts = uint64(vm.getBlockTimestamp());
        uint256 id = _book(renter, tokenId, ts, ts + 1 days);
        vm.expectRevert(RentalEscrow.OpenRentals.selector);
        escrow.setDemoMode(true);
        vm.prank(renter);
        escrow.cancel(id);
        assertEq(escrow.openRentalCount(), 0);
        escrow.setDemoMode(true);
        assertTrue(escrow.demoMode());
    }

    function test_listingFloor_invalidAndHonored() public {
        vm.prank(owner);
        vm.expectRevert(RentalItem.InvalidTerms.selector);
        item.listItem("invalid", VALUE, RATE, LATE, GRACE, 2_999);
        vm.prank(owner);
        vm.expectRevert(RentalItem.InvalidTerms.selector);
        item.listItem("invalid", VALUE, RATE, LATE, GRACE, 10_001);
        vm.prank(address(escrow));
        reputation.record(renter, 0, VALUE, owner);
        vm.prank(owner);
        uint256 tokenId = item.listItem("floor", VALUE, RATE, LATE, GRACE, 9_500);
        assertEq(escrow.quoteDeposit(tokenId, renter), 2_850_000 ether);
    }

    function test_ownerApproval_isRestrictedAndRevocable() public {
        vm.prank(renter);
        vm.expectRevert(Reputation.NotAdmin.selector);
        reputation.setOwnerApproval(renter, true);
        vm.expectRevert(Reputation.ZeroAddress.selector);
        reputation.setOwnerApproval(address(0), true);
        reputation.setOwnerApproval(owner, false);
        vm.prank(address(escrow));
        reputation.record(renter, 0, VALUE, owner);
        assertEq(reputation.maxSuccessfulValue(renter), 0);
        assertEq(reputation.uniqueOwnersOf(renter), 0);
    }

    function testFuzz_settlementCannotSpendAnotherRental(uint96 rawAmount) public {
        (uint256 id,) = _requestedRental(false);
        uint64 ts = uint64(vm.getBlockTimestamp());
        uint256 otherId = _book(renter, _list(owner), ts, ts + 1 days);
        uint256 amount = bound(uint256(rawAmount), 0, VALUE);
        vm.prank(owner);
        escrow.proposeSettlement(id, amount);
        vm.prank(renter);
        escrow.acceptSettlement(id, owner, amount);
        assertEq(idr.balanceOf(address(escrow)), RATE + VALUE);
        assertEq(escrow.openRentalCount(), 1);
        vm.prank(renter);
        escrow.cancel(otherId);
        assertEq(idr.balanceOf(address(escrow)), 0);
        assertEq(escrow.openRentalCount(), 0);
    }

    function _requestedRental(bool withMediator) internal returns (uint256 id, uint256 tokenId) {
        tokenId = _list(owner);
        uint64 ts = uint64(vm.getBlockTimestamp());
        id = _book(renter, tokenId, ts, ts + 1 days);
        if (withMediator) _agreeMediator(id, makeAddr("mediator"));
        bytes memory sig = _signHandover(id, PHOTO_OUT, ts);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, ts, sig);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, "");
    }

    function _fund(address who) internal {
        vm.prank(who);
        idr.faucet();
        vm.prank(who);
        idr.approve(address(escrow), type(uint256).max);
    }

    function _list(address who) internal returns (uint256 tokenId) {
        vm.prank(who);
        tokenId = item.listItem("ipfs://kamera", VALUE, RATE, LATE, GRACE, 3_000);
    }

    function _listOther(string memory name) internal returns (uint256 tokenId) {
        (address who, uint256 pk) = makeAddrAndKey(name);
        _keys[who] = pk;
        _fund(who);
        reputation.setOwnerApproval(who, true);
        tokenId = _list(who);
    }

    function _book(address who, uint256 tokenId, uint64 start, uint64 end) internal returns (uint256 id) {
        vm.prank(who);
        id = escrow.book(tokenId, start, end);
    }

    function _signHandover(uint256 id, bytes32 photo, uint64 ts) internal view returns (bytes memory) {
        return _sign(renterPk, escrow.handoverDigest(id, photo, ts));
    }

    function _signReturn(uint256 id, bytes32 photo, uint64 ts) internal view returns (bytes memory) {
        return _sign(ownerPk, escrow.returnDigest(id, photo, ts));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _returnedRental() internal returns (uint256 id) {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        id = _book(renter, tokenId, start, start + 1 days);
        _activateAndReturn(id, tokenId);
    }

    function _returnedWithMediator() internal returns (uint256 id, address mediator) {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(vm.getBlockTimestamp());
        id = _book(renter, tokenId, start, start + 1 days);
        mediator = makeAddr("mediator");
        _agreeMediator(id, mediator);
        _activateAndReturn(id, tokenId);
    }

    function _agreeMediator(uint256 id, address mediator) internal {
        vm.prank(owner);
        escrow.proposeMediator(id, mediator);
        vm.prank(renter);
        escrow.acceptMediator(id, mediator);
    }

    function _activateAndReturn(uint256 id, uint256 tokenId) internal {
        address itemOwner = item.ownerOf(tokenId);
        uint64 ts = uint64(vm.getBlockTimestamp());
        bytes memory handoverSig = _signHandover(id, PHOTO_OUT, ts);
        vm.prank(itemOwner);
        escrow.handover(id, PHOTO_OUT, ts, handoverSig);
        bytes memory returnSig = _signReturnFor(itemOwner, id, PHOTO_IN, ts);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, ts, returnSig);
    }

    function _signReturnFor(address itemOwner, uint256 id, bytes32 photo, uint64 ts)
        internal
        view
        returns (bytes memory)
    {
        return _sign(_ownerKey(itemOwner), escrow.returnDigest(id, photo, ts));
    }

    function _ownerKey(address who) internal view returns (uint256 pk) {
        if (who == owner) return ownerPk;
        pk = _keys[who];
        require(pk != 0 && vm.addr(pk) == who, "missing key");
    }

    mapping(address => uint256) internal _keys;

    function _token(uint256 id) internal view returns (uint256 tokenId) {
        (tokenId,,,,,,,,,,,) = escrow.rentals(id);
    }

    function _meta(uint256 id)
        internal
        view
        returns (uint64 bookedAt, uint256 depositRemaining, uint64 returnedAt, uint256 fee)
    {
        (bookedAt, returnedAt, depositRemaining, fee) = escrow.meta(id);
    }
}

contract DemoModeTest is Test {
    MockIDR internal idr;
    RentalItem internal item;
    Reputation internal reputation;
    RentalEscrow internal escrow;
    address internal owner;
    uint256 internal ownerPk;
    address internal renter;
    uint256 internal renterPk;

    function setUp() public {
        vm.warp(1_000_000);
        (owner, ownerPk) = makeAddrAndKey("d-owner");
        (renter, renterPk) = makeAddrAndKey("d-renter");
        idr = new MockIDR();
        item = new RentalItem();
        reputation = new Reputation();
        escrow = new RentalEscrow(address(idr), address(item), address(reputation), true);
        item.setEscrow(address(escrow));
        reputation.setEscrow(address(escrow));

        vm.startPrank(renter);
        idr.faucet();
        idr.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(owner);
        idr.faucet();
        idr.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    function test_demoMode_oneDayIsTwoMinutes() public {
        uint256 tokenId = _list();
        uint64 start = uint64(vm.getBlockTimestamp());
        uint64 end = start + 1 days;
        uint256 id = _book(tokenId, start, end);
        _handover(id, start);

        // 1 logical day = 120 real seconds. userExpires is the real deadline.
        assertEq(item.userExpires(tokenId), start + 120);
        assertEq(escrow.logicalNow(id), start);

        vm.warp(start + 120);
        assertEq(item.userOf(tokenId), renter);
        assertEq(escrow.logicalNow(id), end);

        vm.warp(start + 121);
        assertEq(item.userOf(tokenId), address(0));
        assertEq(escrow.lateFee(id, escrow.logicalNow(id)), 1_000 ether);

        _return(id, uint64(vm.getBlockTimestamp()));
        (, uint32 ok, uint32 late,) = reputation.scoreOf(renter);
        assertEq(late, 0);
        assertEq(ok, 0);
        vm.warp(vm.getBlockTimestamp() + 24 hours);
        escrow.finalizeClaim(id);
        (,, late,) = reputation.scoreOf(renter);
        assertEq(late, 1);
    }

    function test_demoMode_claimWindowUsesRealTime() public {
        uint256 tokenId = _list();
        uint64 ts = uint64(vm.getBlockTimestamp());
        uint256 id = _book(tokenId, ts, ts + 1 days);
        _handover(id, ts);
        _return(id, ts);
        vm.warp(vm.getBlockTimestamp() + 120);
        vm.expectRevert(RentalEscrow.WindowOpen.selector);
        escrow.finalizeClaim(id);
        vm.prank(owner);
        escrow.fileDamageClaim(id, 1 ether, keccak256("damage"));
        assertEq(escrow.responseDeadline(id), vm.getBlockTimestamp() + 24 hours);
    }

    function test_demoMode_defaultAfterScaledGrace() public {
        uint256 tokenId = _list();
        uint64 start = uint64(vm.getBlockTimestamp());
        uint256 id = _book(tokenId, start, start + 1 days);
        _handover(id, start);

        // 1 logical day + 1 grace hour = 90_000 logical seconds = 125 real seconds.
        vm.warp(start + 124);
        vm.expectRevert(RentalEscrow.GraceNotOver.selector);
        vm.prank(owner);
        escrow.claimDefault(id);

        vm.warp(start + 125);
        vm.prank(owner);
        escrow.claimDefault(id);
        assertTrue(reputation.hasDefaulted(renter));
    }

    function _list() internal returns (uint256 tokenId) {
        vm.prank(owner);
        tokenId = item.listItem("ipfs://demo", 1_000_000 ether, 10_000 ether, 1_000 ether, 1);
    }

    function _book(uint256 tokenId, uint64 start, uint64 end) internal returns (uint256 id) {
        vm.prank(renter);
        id = escrow.book(tokenId, start, end);
    }

    function _handover(uint256 id, uint64 ts) internal {
        bytes32 photo = keccak256("out");
        bytes32 digest = escrow.handoverDigest(id, photo, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(renterPk, digest);
        vm.prank(owner);
        escrow.handover(id, photo, ts, abi.encodePacked(r, s, v));
    }

    function _return(uint256 id, uint64 ts) internal {
        bytes32 photo = keccak256("in");
        bytes32 digest = escrow.returnDigest(id, photo, ts);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);
        vm.prank(renter);
        escrow.confirmReturn(id, photo, ts, abi.encodePacked(r, s, v));
    }
}
