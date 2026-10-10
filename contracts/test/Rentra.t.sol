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

        _fund(renter);
        _fund(owner);
    }

    function test_listQuoteAndBookCancel() public {
        uint256 tokenId = _list(owner);
        assertEq(escrow.quoteDeposit(tokenId, renter), VALUE);
        assertEq(item.userOf(tokenId), address(0));
        assertTrue(item.supportsInterface(type(IERC4907).interfaceId));

        uint64 start = uint64(block.timestamp);
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
        uint64 start = uint64(block.timestamp);
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
        uint64 retTs = uint64(block.timestamp);
        bytes memory retSig = _signReturn(id, PHOTO_IN, retTs);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, retTs, retSig);

        assertEq(idr.balanceOf(owner), ownerBefore + RATE * 2);
        assertEq(idr.balanceOf(address(escrow)), VALUE);
        assertEq(item.userOf(tokenId), address(0));

        (uint16 score, uint32 ok, uint32 late, uint32 defaults) = reputation.scoreOf(renter);
        assertEq(ok, 1);
        assertEq(late, 0);
        assertEq(defaults, 0);
        assertEq(score, 100);
        assertEq(reputation.depositFactorBps(renter), 9_000);
        assertEq(reputation.maxSuccessfulValue(renter), VALUE);

        vm.warp(block.timestamp + 24 hours - 1);
        vm.expectRevert(RentalEscrow.WindowOpen.selector);
        escrow.finalizeClaim(id);

        vm.warp(block.timestamp + 1);
        escrow.finalizeClaim(id);
        assertEq(idr.balanceOf(renter), idr.FAUCET_AMOUNT() - RATE * 2);
        assertFalse(escrow.isLocked(tokenId));

        uint256 token2 = _list(owner);
        // Same owner does not grant another discount step.
        assertEq(escrow.quoteDeposit(token2, renter), (VALUE * 9_000) / 10_000);
    }

    function test_packedSignatureHandoverAndUnilateralReturn() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(block.timestamp);
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);

        bytes memory packed = abi.encode(start, _signHandover(id, PHOTO_OUT, start));
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, packed);

        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, "");

        (uint16 score, uint32 ok,,) = reputation.scoreOf(renter);
        assertEq(ok, 1);
        assertEq(score, 100);
        assertEq(escrow.lateFee(id, start), 0);
    }

    function test_lateFee_isCeiledAndCapped() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(block.timestamp);
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
        uint64 ts = uint64(block.timestamp);
        bytes memory retSig = _signReturn(id, PHOTO_IN, ts);
        vm.prank(renter);
        escrow.confirmReturn(id, PHOTO_IN, ts, retSig);

        assertEq(idr.balanceOf(owner), ownerBefore + RATE + LATE * 3);
        (, uint256 depositRemaining,,) = _meta(id);
        assertEq(depositRemaining, VALUE - LATE * 3);

        (, uint32 ok, uint32 late,) = reputation.scoreOf(renter);
        assertEq(ok, 0);
        assertEq(late, 1);
        assertEq(reputation.depositFactorBps(renter), 10_000);
    }

    function test_lateFeeCapsAtDeposit() public {
        vm.prank(owner);
        uint256 tokenId = item.listItem("ipfs://x", VALUE, RATE, VALUE, GRACE);
        uint64 start = uint64(block.timestamp);
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);
        assertEq(escrow.lateFee(id, end + 2 hours), VALUE);
    }

    function test_claimDefault_afterGrace_isPermanent() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(block.timestamp);
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
        uint64 start2 = uint64(block.timestamp);
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

    function test_damageClaim_silentRenter_ownerWins() public {
        uint256 id = _returnedRental();
        uint256 amount = 500_000 ether;
        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("crack"));

        vm.warp(block.timestamp + 24 hours - 1);
        vm.expectRevert(RentalEscrow.WindowOpen.selector);
        escrow.finalizeClaim(id);

        vm.warp(block.timestamp + 1);
        uint256 ownerBefore = idr.balanceOf(owner);
        escrow.finalizeClaim(id);
        assertEq(idr.balanceOf(owner) - ownerBefore, amount + amount / 10);
    }

    function test_damageClaim_rejectedCounter_bondSlashed() public {
        uint256 id = _returnedRental();
        uint256 amount = 800_000 ether;
        uint256 bond = amount / 10;

        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("stain"));
        vm.prank(renter);
        escrow.respondClaim(id, false, 0);

        vm.warp(block.timestamp + 24 hours);
        uint256 renterBefore = idr.balanceOf(renter);
        uint256 ownerBefore = idr.balanceOf(owner);
        escrow.finalizeClaim(id);

        assertEq(idr.balanceOf(renter) - renterBefore, VALUE + bond);
        assertEq(idr.balanceOf(owner), ownerBefore);
    }

    function test_escalate_thenTimeoutFavorsSilentClaim() public {
        uint256 id = _returnedRental();
        uint256 amount = 200_000 ether;
        vm.prank(owner);
        escrow.fileDamageClaim(id, amount, keccak256("ev"));
        vm.prank(renter);
        escrow.escalate(id);

        (,,,,,,,,,, RentalEscrow.Status status,) = escrow.rentals(id);
        assertEq(uint256(status), uint256(RentalEscrow.Status.Disputed));

        vm.warp(block.timestamp + 24 hours);
        escrow.finalizeClaim(id);
        (,,,,,,,,,, status,) = escrow.rentals(id);
        assertEq(uint256(status), uint256(RentalEscrow.Status.Settled));
    }

    function test_claimWindow_closes() public {
        uint256 id = _returnedRental();
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.WindowClosed.selector);
        escrow.fileDamageClaim(id, 1000 ether, keccak256("late"));
    }

    function test_signatureReplayAndExpiry() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(block.timestamp);
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
        uint64 start = uint64(block.timestamp);

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
        uint64 start = uint64(block.timestamp + 1 days);
        uint64 end = start + 1 days;
        uint256 id = _book(renter, tokenId, start, end);

        uint64 nowTs = uint64(block.timestamp);
        bytes memory tooEarlySig = _signHandover(id, PHOTO_OUT, nowTs);
        vm.prank(owner);
        vm.expectRevert(RentalEscrow.TooEarly.selector);
        escrow.handover(id, PHOTO_OUT, nowTs, tooEarlySig);

        vm.warp(start);
        uint64 atStart = uint64(block.timestamp);
        bytes memory onTimeSig = _signHandover(id, PHOTO_OUT, atStart);
        vm.prank(owner);
        escrow.handover(id, PHOTO_OUT, atStart, onTimeSig);
        assertEq(item.userOf(tokenId), renter);
    }

    function test_bookWithPermit() public {
        uint256 tokenId = _list(owner);
        uint64 start = uint64(block.timestamp);
        uint64 end = start + 1 days;

        vm.prank(renter);
        idr.approve(address(escrow), 0);

        uint256 value = RATE + VALUE;
        uint256 deadline = block.timestamp + 1 hours;
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
        assertEq(rep.maxSuccessfulValue(a), 3_000_000 ether);

        address farmer = makeAddr("farmer");
        for (uint256 i = 0; i < 8; i++) {
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
        uint64 start = uint64(block.timestamp);
        uint256 id = _book(renter, cheapId, start, start + 1 days);
        _activateAndReturn(id, cheapId);

        uint256 expensive = _list(owner);
        uint256 expected = (600_000 ether * 9_000) / 10_000 + (VALUE - 600_000 ether);
        assertEq(escrow.quoteDeposit(expensive, renter), expected);
    }

    function test_fiveUniqueOwners_halfDeposit() public {
        vm.prank(renter);
        idr.faucet();
        for (uint256 i = 0; i < 5; i++) {
            uint256 listed = _listOther(string.concat("owner-", vm.toString(i)));
            uint64 start = uint64(block.timestamp);
            uint256 id = _book(renter, listed, start, start + 1 days);
            _activateAndReturn(id, listed);
            vm.warp(block.timestamp + 1);
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

    function test_defaultListing_keepsFullDeposit() public {
        vm.prank(address(escrow));
        reputation.record(renter, 0, VALUE, owner);
        vm.prank(owner);
        uint256 tokenId = item.listItem("full collateral", VALUE, RATE, LATE, GRACE);
        assertEq(escrow.quoteDeposit(tokenId, renter), VALUE, "default listing must retain full collateral");
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
        uint64 start = uint64(block.timestamp);
        id = _book(renter, tokenId, start, start + 1 days);
        _activateAndReturn(id, tokenId);
    }

    function _activateAndReturn(uint256 id, uint256 tokenId) internal {
        address itemOwner = item.ownerOf(tokenId);
        uint64 ts = uint64(block.timestamp);
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

    function _meta(uint256 id) internal view returns (uint64 bookedAt, uint256 depositRemaining, uint64 returnedAt, uint256 fee) {
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
        uint64 start = uint64(block.timestamp);
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

        _return(id, uint64(block.timestamp));
        (, uint32 ok, uint32 late,) = reputation.scoreOf(renter);
        assertEq(late, 1);
        assertEq(ok, 0);
    }

    function test_demoMode_defaultAfterScaledGrace() public {
        uint256 tokenId = _list();
        uint64 start = uint64(block.timestamp);
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
