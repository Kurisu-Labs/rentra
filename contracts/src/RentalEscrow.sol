// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {RentalItem} from "./RentalItem.sol";
import {Reputation} from "./Reputation.sol";

/// @title RentalEscrow
/// @notice Holds rent + deposit. Neither party can pull funds except through the rules below.
///
/// Handover / return signatures (EIP-712):
///   Handover(uint256 rentalId, bytes32 photoHash, uint64 timestamp, address mediator, uint256 nonce)
///   Return(uint256 rentalId, bytes32 photoHash, uint64 timestamp, uint256 nonce)
///
/// The plan's sketch omits `timestamp` from the calldata. It has to be supplied so the
/// contract can rebuild the typed hash, so both the 3-arg form (timestamp packed into the
/// bytes as `abi.encode(uint64, bytes)`) and an explicit `uint64 timestamp` overload exist.
///
/// Demo mode scales time from each rental's booking timestamp by `DEMO_SCALE` (720):
/// one logical day elapses in two real minutes. ERC-4907 `userExpires` is stored in real
/// unix time so `userOf` and a countdown both track the scaled deadline.
contract RentalEscrow is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant DEMO_SCALE = 720;
    uint256 public constant CLAIM_WINDOW = 24 hours;
    uint256 public constant RESPONSE_WINDOW = 24 hours;
    uint256 public constant SIG_WINDOW = 1 hours;
    uint256 public constant SIG_FUTURE_SKEW = 5 minutes;
    uint16 public constant BOND_BPS = 1_000; // 10% of the claimed amount
    uint16 public constant FULL_BPS = 10_000;
    uint256 public constant PROTOCOL_VERSION = 2;

    bytes32 public constant HANDOVER_TYPEHASH =
        keccak256("Handover(uint256 rentalId,bytes32 photoHash,uint64 timestamp,address mediator,uint256 nonce)");
    bytes32 public constant RETURN_TYPEHASH =
        keccak256("Return(uint256 rentalId,bytes32 photoHash,uint64 timestamp,uint256 nonce)");

    enum Status {
        Booked,
        Active,
        Returned,
        Late,
        Claimed,
        Disputed,
        Settled,
        Defaulted,
        Cancelled,
        ReturnRequested,
        ReturnDisputed
    }

    struct Rental {
        uint256 tokenId;
        address owner;
        address renter;
        uint64 start;
        uint64 end;
        uint256 rent;
        uint256 deposit;
        uint256 guarantee;
        bytes32 photoOutHash;
        bytes32 photoInHash;
        Status status;
        uint256 claimAmount;
    }

    struct Meta {
        uint64 bookedAtReal;
        uint64 returnedAtLogical;
        uint256 depositRemaining;
        uint256 lateFeeCharged;
    }

    struct Claim {
        uint256 bond;
        uint256 counterAmount;
        bytes32 evidenceHash;
        uint64 filedAt;
        bool responded;
        bool hasCounter;
    }

    struct ReturnRequest {
        uint64 requestedAtLogical;
        bytes32 ownerEvidenceHash;
    }

    struct Mediation {
        address proposed;
        address mediator;
    }

    struct SettlementOffer {
        address proposer;
        uint256 amount;
    }

    IERC20 public immutable idr;
    RentalItem public immutable item;
    Reputation public immutable reputation;
    address public admin;
    bool public demoMode;
    uint256 public openRentalCount;

    uint256 public nextRentalId = 1;
    mapping(uint256 rentalId => Rental) public rentals;
    mapping(uint256 rentalId => Meta) public meta;
    mapping(uint256 rentalId => Claim) public claims;
    mapping(uint256 tokenId => bool) public isLocked;
    mapping(uint256 tokenId => uint256 rentalId) public openRentalOf;
    mapping(address signer => uint256 nonce) public nonces;
    mapping(uint256 rentalId => ReturnRequest) public returnRequests;
    mapping(uint256 rentalId => Mediation) public mediations;
    mapping(uint256 rentalId => SettlementOffer) public settlementOffers;
    mapping(uint256 rentalId => uint64) public claimDeadline;
    mapping(uint256 rentalId => uint64) public responseDeadline;

    event Booked(uint256 indexed rentalId, uint256 indexed tokenId, address renter, uint256 deposit);
    event HandedOver(uint256 indexed rentalId, bytes32 photoOutHash, uint64 expires);
    event Returned(uint256 indexed rentalId, bytes32 photoInHash, uint256 lateFee);
    event Defaulted(uint256 indexed rentalId);
    event ClaimFiled(uint256 indexed rentalId, uint256 amount, bytes32 evidenceHash);
    event Cancelled(uint256 indexed rentalId);
    event Settled(uint256 indexed rentalId, uint256 paidToOwner);
    event ClaimCountered(uint256 indexed rentalId, uint256 counterAmount);
    event Escalated(uint256 indexed rentalId);
    event MarkedLate(uint256 indexed rentalId);
    event DemoModeSet(bool enabled);
    event ReturnRequested(uint256 indexed rentalId, bytes32 photoHash);
    event ReturnDisputed(uint256 indexed rentalId, bytes32 evidenceHash);
    event MediatorProposed(uint256 indexed rentalId, address mediator);
    event MediatorAccepted(uint256 indexed rentalId, address mediator);
    event SettlementProposed(uint256 indexed rentalId, address proposer, uint256 amount);

    error NotAdmin();
    error NotParty();
    error NotOwner();
    error NotRenter();
    error BadStatus();
    error InvalidWindow();
    error StartInPast();
    error ItemUnavailable();
    error CannotRentOwn();
    error EmptyPhoto();
    error BadSignature();
    error SigExpired();
    error TooEarly();
    error TooLate();
    error GraceNotOver();
    error WindowClosed();
    error WindowOpen();
    error BadAmount();
    error AlreadyResponded();
    error ZeroAddress();
    error ZeroPayment();
    error OpenRentals();
    error MediatorPending();
    error MediatorFrozen();
    error NotMediator();
    error ResolutionRequired();
    error StaleOffer();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address idr_, address item_, address reputation_, bool demoMode_) EIP712("Rentra", "2") {
        if (idr_ == address(0) || item_ == address(0) || reputation_ == address(0)) revert ZeroAddress();
        idr = IERC20(idr_);
        item = RentalItem(item_);
        reputation = Reputation(reputation_);
        admin = msg.sender;
        demoMode = demoMode_;
    }

    function setDemoMode(bool enabled) external onlyAdmin {
        if (openRentalCount != 0) revert OpenRentals();
        demoMode = enabled;
        emit DemoModeSet(enabled);
    }

    // ---------------------------------------------------------------------
    // Quotes
    // ---------------------------------------------------------------------

    /// @notice Base deposit is the item's declared value. Reputation scales the portion up to
    ///         the renter's highest successful rental; anything above that is charged in full.
    function quoteDeposit(uint256 tokenId, address renter) public view returns (uint256) {
        (uint256 value,,,) = item.terms(tokenId);
        uint16 factor = reputation.depositFactorBps(renter);
        uint16 floor = item.depositFloorBps(tokenId);
        if (factor < floor) factor = floor;
        if (factor >= FULL_BPS) return value;
        uint256 cap = reputation.maxSuccessfulValue(renter);
        if (cap == 0) return value;
        uint256 discounted = value <= cap ? value : cap;
        uint256 full = value - discounted;
        return (discounted * factor) / FULL_BPS + full;
    }

    /// @notice Rent is charged in whole days, rounded up. A partial day is a full day.
    function quoteRent(uint256 tokenId, uint64 start, uint64 end) public view returns (uint256) {
        if (end <= start) return 0;
        (, uint256 ratePerDay,,) = item.terms(tokenId);
        uint256 daysCount = (uint256(end - start) + 1 days - 1) / 1 days;
        return ratePerDay * daysCount;
    }

    function lateFee(uint256 rentalId, uint64 returnedAt) public view returns (uint256) {
        Rental storage r = rentals[rentalId];
        if (r.renter == address(0) || returnedAt <= r.end) return 0;
        (,, uint256 lateFeePerHour,) = item.terms(r.tokenId);
        uint256 hoursLate = (uint256(returnedAt - r.end) + 3599) / 3600;
        uint256 fee = hoursLate * lateFeePerHour;
        if (fee > r.deposit) return r.deposit;
        return fee;
    }

    /// @notice Logical clock for a rental. In demo mode, 120 real seconds = 1 logical day.
    function logicalNow(uint256 rentalId) public view returns (uint64) {
        return _logicalNow(meta[rentalId].bookedAtReal);
    }

    function handoverDigest(uint256 rentalId, bytes32 photoHash, uint64 timestamp) external view returns (bytes32) {
        return _digest(HANDOVER_TYPEHASH, rentalId, photoHash, timestamp, rentals[rentalId].renter);
    }

    function returnDigest(uint256 rentalId, bytes32 photoHash, uint64 timestamp) external view returns (bytes32) {
        return _digest(RETURN_TYPEHASH, rentalId, photoHash, timestamp, rentals[rentalId].owner);
    }

    // ---------------------------------------------------------------------
    // Booking
    // ---------------------------------------------------------------------

    function book(uint256 tokenId, uint64 start, uint64 end) external nonReentrant returns (uint256 rentalId) {
        return _book(msg.sender, tokenId, start, end);
    }

    /// @notice Single-transaction permit + book. `permitValue` must cover rent + deposit.
    function bookWithPermit(
        uint256 tokenId,
        uint64 start,
        uint64 end,
        uint256 permitValue,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 rentalId) {
        IERC20Permit(address(idr)).permit(msg.sender, address(this), permitValue, deadline, v, r, s);
        return _book(msg.sender, tokenId, start, end);
    }

    function cancel(uint256 rentalId) external nonReentrant {
        Rental storage r = rentals[rentalId];
        if (r.status != Status.Booked) revert BadStatus();
        if (msg.sender != r.renter && msg.sender != r.owner) revert NotParty();

        uint256 refund = r.rent + r.deposit + r.guarantee;
        r.status = Status.Cancelled;
        _unlock(r.tokenId);
        idr.safeTransfer(r.renter, refund);
        emit Cancelled(rentalId);
    }

    // ---------------------------------------------------------------------
    // Handover and return
    // ---------------------------------------------------------------------

    /// @notice Plan signature. `renterSig` is `abi.encode(uint64 timestamp, bytes ecdsaSig)`.
    function handover(uint256 rentalId, bytes32 photoOutHash, bytes calldata renterSig) external nonReentrant {
        (uint64 timestamp, bytes memory sig) = abi.decode(renterSig, (uint64, bytes));
        _handover(rentalId, photoOutHash, timestamp, sig);
    }

    /// @notice Same handover with the signed timestamp as its own argument.
    function handover(uint256 rentalId, bytes32 photoOutHash, uint64 timestamp, bytes calldata renterSig)
        external
        nonReentrant
    {
        _handover(rentalId, photoOutHash, timestamp, renterSig);
    }

    /// @notice Empty `ownerSig` requests acknowledgement; it cannot complete a return or release funds.
    ///         (docs/PLAN.md §8). Otherwise `ownerSig` is `abi.encode(uint64 timestamp, bytes ecdsaSig)`.
    function confirmReturn(uint256 rentalId, bytes32 photoInHash, bytes calldata ownerSig) external nonReentrant {
        if (ownerSig.length == 0) {
            _confirmReturn(rentalId, photoInHash, 0, true, ownerSig);
            return;
        }
        (uint64 timestamp, bytes memory sig) = abi.decode(ownerSig, (uint64, bytes));
        _confirmReturn(rentalId, photoInHash, timestamp, false, sig);
    }

    function confirmReturn(uint256 rentalId, bytes32 photoInHash, uint64 timestamp, bytes calldata ownerSig)
        external
        nonReentrant
    {
        _confirmReturn(rentalId, photoInHash, timestamp, ownerSig.length == 0, ownerSig);
    }

    function sync(uint256 rentalId) external {
        Rental storage r = rentals[rentalId];
        if (r.status != Status.Active) return;
        if (_logicalNow(meta[rentalId].bookedAtReal) > r.end) {
            r.status = Status.Late;
            emit MarkedLate(rentalId);
        }
    }

    function claimDefault(uint256 rentalId) external nonReentrant {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        if (r.status == Status.Active) {
            if (_logicalNow(meta[rentalId].bookedAtReal) > r.end) r.status = Status.Late;
        }
        if (r.status != Status.Active && r.status != Status.Late) revert BadStatus();

        (,,, uint32 graceHours) = item.terms(r.tokenId);
        uint64 nowLogical = _logicalNow(meta[rentalId].bookedAtReal);
        if (nowLogical < uint256(r.end) + uint256(graceHours) * 1 hours) revert GraceNotOver();

        uint256 payout = r.rent + r.deposit + r.guarantee;
        r.status = Status.Defaulted;
        meta[rentalId].depositRemaining = 0;
        _unlock(r.tokenId);
        item.setUser(r.tokenId, address(0), 0);

        if (payout > 0) idr.safeTransfer(r.owner, payout);
        (uint256 value,,,) = item.terms(r.tokenId);
        reputation.record(r.renter, reputation.OUTCOME_DEFAULT(), value, r.owner);
        emit Defaulted(rentalId);
    }

    /// @notice Both parties choose their mediator before handing over any physical item.
    function proposeMediator(uint256 rentalId, address mediator) external {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        if (r.status != Status.Booked) revert BadStatus();
        if (mediations[rentalId].mediator != address(0)) revert MediatorFrozen();
        if (mediator == r.owner || mediator == r.renter || mediator == address(this)) revert NotParty();
        mediations[rentalId].proposed = mediator;
        emit MediatorProposed(rentalId, mediator);
    }

    function acceptMediator(uint256 rentalId, address expectedMediator) external {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.renter) revert NotRenter();
        if (r.status != Status.Booked) revert BadStatus();
        Mediation storage m = mediations[rentalId];
        if (m.mediator != address(0)) revert MediatorFrozen();
        if (expectedMediator == address(0) || m.proposed != expectedMediator) revert StaleOffer();
        m.mediator = expectedMediator;
        emit MediatorAccepted(rentalId, expectedMediator);
    }

    function acknowledgeReturn(uint256 rentalId) external nonReentrant {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        _requireReturnRequest(r.status);
        _completeReturn(rentalId, r.photoInHash, returnRequests[rentalId].requestedAtLogical);
    }

    function disputeReturn(uint256 rentalId, bytes32 evidenceHash) external {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        if (r.status != Status.ReturnRequested) revert BadStatus();
        if (evidenceHash == bytes32(0)) revert EmptyPhoto();
        r.status = Status.ReturnDisputed;
        returnRequests[rentalId].ownerEvidenceHash = evidenceHash;
        emit ReturnDisputed(rentalId, evidenceHash);
    }

    /// @notice The agreed mediator can only distribute this rental's funds to its two parties.
    function resolveReturn(uint256 rentalId, bool returned, uint256 compensation) external nonReentrant {
        Rental storage r = rentals[rentalId];
        _requireMediator(rentalId);
        _requireReturnRequest(r.status);
        if (returned) {
            uint256 remaining = r.deposit - lateFee(rentalId, returnRequests[rentalId].requestedAtLogical);
            if (compensation > remaining) revert BadAmount();
            _completeReturn(rentalId, r.photoInHash, returnRequests[rentalId].requestedAtLogical);
            _payoutClaim(rentalId, compensation, true);
        } else {
            if (compensation != 0) revert BadAmount();
            (,,, uint32 graceHours) = item.terms(r.tokenId);
            if (_logicalNow(meta[rentalId].bookedAtReal) < uint256(r.end) + uint256(graceHours) * 1 hours) {
                revert GraceNotOver();
            }
            r.status = Status.Defaulted;
            meta[rentalId].depositRemaining = 0;
            _unlock(r.tokenId);
            item.setUser(r.tokenId, address(0), 0);
            reputation.record(r.renter, reputation.OUTCOME_DEFAULT(), 0, r.owner);
            idr.safeTransfer(r.owner, r.rent + r.deposit);
            emit Defaulted(rentalId);
        }
    }

    function proposeSettlement(uint256 rentalId, uint256 amount) external {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner && msg.sender != r.renter) revert NotParty();
        _requireNegotiable(r.status);
        uint256 remaining = meta[rentalId].depositRemaining;
        if (r.status == Status.ReturnRequested || r.status == Status.ReturnDisputed) {
            remaining = r.deposit - lateFee(rentalId, returnRequests[rentalId].requestedAtLogical);
        }
        if (amount > remaining) revert BadAmount();
        // A new offer replaces every previous counter, including the legacy claim counter.
        claims[rentalId].hasCounter = false;
        claims[rentalId].counterAmount = 0;
        settlementOffers[rentalId] = SettlementOffer(msg.sender, amount);
        emit SettlementProposed(rentalId, msg.sender, amount);
    }

    function acceptSettlement(uint256 rentalId, address proposer, uint256 amount) external nonReentrant {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner && msg.sender != r.renter) revert NotParty();
        _requireNegotiable(r.status);
        SettlementOffer memory offer = settlementOffers[rentalId];
        if (
            offer.proposer == address(0) || offer.proposer == msg.sender || offer.proposer != proposer
                || offer.amount != amount
        ) {
            revert StaleOffer();
        }
        if (r.status == Status.ReturnRequested || r.status == Status.ReturnDisputed) {
            _completeReturn(rentalId, r.photoInHash, returnRequests[rentalId].requestedAtLogical);
        }
        _payoutClaim(rentalId, amount, true);
    }

    function resolveClaim(uint256 rentalId, uint256 amount, bool returnBond) external nonReentrant {
        Rental storage r = rentals[rentalId];
        _requireMediator(rentalId);
        if (r.status != Status.Claimed && r.status != Status.Disputed) revert BadStatus();
        if (amount > r.claimAmount || amount > meta[rentalId].depositRemaining) revert BadAmount();
        _payoutClaim(rentalId, amount, returnBond);
    }

    // ---------------------------------------------------------------------
    // Damage claim (bonded offer / counter / agreed mediation). No juror pool in the MVP.
    // ---------------------------------------------------------------------

    function fileDamageClaim(uint256 rentalId, uint256 amount, bytes32 evidenceHash) external nonReentrant {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        if (r.status != Status.Returned) revert BadStatus();
        if (amount == 0 || amount > meta[rentalId].depositRemaining) revert BadAmount();
        if (evidenceHash == bytes32(0)) revert EmptyPhoto();

        if (block.timestamp >= claimDeadline[rentalId]) revert WindowClosed();

        uint256 bond = (amount * BOND_BPS) / FULL_BPS;
        if (bond == 0) revert BadAmount();

        r.status = Status.Claimed;
        r.claimAmount = amount;
        claims[rentalId] = Claim({
            bond: bond,
            counterAmount: 0,
            evidenceHash: evidenceHash,
            filedAt: uint64(block.timestamp),
            responded: false,
            hasCounter: false
        });
        delete settlementOffers[rentalId];
        responseDeadline[rentalId] = uint64(block.timestamp + RESPONSE_WINDOW);

        idr.safeTransferFrom(r.owner, address(this), bond);
        emit ClaimFiled(rentalId, amount, evidenceHash);
    }

    function respondClaim(uint256 rentalId, bool accept, uint256 counterAmount) external nonReentrant {
        Rental storage r = rentals[rentalId];
        Claim storage c = claims[rentalId];
        if (msg.sender != r.renter) revert NotRenter();
        if (r.status != Status.Claimed) revert BadStatus();
        if (c.responded) revert AlreadyResponded();

        if (block.timestamp >= responseDeadline[rentalId]) revert WindowClosed();

        c.responded = true;
        if (accept) {
            _payoutClaim(rentalId, r.claimAmount, true);
            return;
        }
        if (counterAmount >= r.claimAmount) revert BadAmount();
        c.hasCounter = true;
        c.counterAmount = counterAmount;
        delete settlementOffers[rentalId];
        emit ClaimCountered(rentalId, counterAmount);
    }

    function acceptCounter(uint256 rentalId) external nonReentrant {
        Rental storage r = rentals[rentalId];
        Claim storage c = claims[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        if (r.status != Status.Claimed && r.status != Status.Disputed) revert BadStatus();
        if (!c.hasCounter) revert BadStatus();
        _payoutClaim(rentalId, c.counterAmount, true);
    }

    /// @notice Escalation never implies consent to a payout.
    function escalate(uint256 rentalId) external {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner && msg.sender != r.renter) revert NotParty();
        if (r.status != Status.Claimed) revert BadStatus();
        r.status = Status.Disputed;
        emit Escalated(rentalId);
    }

    /// @notice Only an uncontested acknowledged return can settle automatically.
    function finalizeClaim(uint256 rentalId) external nonReentrant {
        Rental storage r = rentals[rentalId];
        if (r.status == Status.Returned) {
            if (block.timestamp < claimDeadline[rentalId]) revert WindowOpen();
            _payoutClaim(rentalId, 0, true);
            return;
        }
        if (r.status == Status.Claimed || r.status == Status.Disputed) revert ResolutionRequired();
        revert BadStatus();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _book(address renter, uint256 tokenId, uint64 start, uint64 end) internal returns (uint256 rentalId) {
        address owner = item.ownerOf(tokenId);
        if (renter == owner) revert CannotRentOwn();
        if (end <= start) revert InvalidWindow();
        if (start + 5 minutes < block.timestamp) revert StartInPast();
        if (isLocked[tokenId]) revert ItemUnavailable();

        uint256 rent = quoteRent(tokenId, start, end);
        uint256 deposit = quoteDeposit(tokenId, renter);
        uint256 total = rent + deposit;
        if (total == 0) revert ZeroPayment();

        rentalId = nextRentalId++;
        rentals[rentalId] = Rental({
            tokenId: tokenId,
            owner: owner,
            renter: renter,
            start: start,
            end: end,
            rent: rent,
            deposit: deposit,
            guarantee: 0,
            photoOutHash: bytes32(0),
            photoInHash: bytes32(0),
            status: Status.Booked,
            claimAmount: 0
        });
        meta[rentalId].bookedAtReal = uint64(block.timestamp);
        meta[rentalId].depositRemaining = deposit;
        isLocked[tokenId] = true;
        openRentalCount += 1;
        openRentalOf[tokenId] = rentalId;

        idr.safeTransferFrom(renter, address(this), total);
        emit Booked(rentalId, tokenId, renter, deposit);
    }

    function _handover(uint256 rentalId, bytes32 photoOutHash, uint64 timestamp, bytes memory renterSig) internal {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.owner) revert NotOwner();
        if (r.status != Status.Booked) revert BadStatus();
        if (mediations[rentalId].proposed != address(0) && mediations[rentalId].mediator == address(0)) {
            revert MediatorPending();
        }
        if (photoOutHash == bytes32(0)) revert EmptyPhoto();

        uint64 nowLogical = _logicalNow(meta[rentalId].bookedAtReal);
        if (nowLogical + 5 minutes < r.start) revert TooEarly();
        if (nowLogical >= r.end) revert TooLate();

        _consumeSig(HANDOVER_TYPEHASH, rentalId, photoOutHash, timestamp, r.renter, renterSig);

        r.photoOutHash = photoOutHash;
        r.status = Status.Active;
        uint64 realExpires = _toRealDeadline(meta[rentalId].bookedAtReal, r.end);
        item.setUser(r.tokenId, r.renter, realExpires);
        emit HandedOver(rentalId, photoOutHash, realExpires);
    }

    function _confirmReturn(
        uint256 rentalId,
        bytes32 photoInHash,
        uint64 timestamp,
        bool unilateral,
        bytes memory ownerSig
    ) internal {
        Rental storage r = rentals[rentalId];
        if (msg.sender != r.renter) revert NotRenter();
        if (r.status == Status.Active && _logicalNow(meta[rentalId].bookedAtReal) > r.end) {
            r.status = Status.Late;
        }
        bool requested = r.status == Status.ReturnRequested || r.status == Status.ReturnDisputed;
        if (r.status != Status.Active && r.status != Status.Late && !requested) revert BadStatus();
        if (photoInHash == bytes32(0)) revert EmptyPhoto();

        if (unilateral) {
            if (requested) revert BadStatus();
            r.photoInHash = photoInHash;
            r.status = Status.ReturnRequested;
            returnRequests[rentalId].requestedAtLogical = _logicalNow(meta[rentalId].bookedAtReal);
            emit ReturnRequested(rentalId, photoInHash);
            return;
        }
        _consumeSig(RETURN_TYPEHASH, rentalId, photoInHash, timestamp, r.owner, ownerSig);
        _completeReturn(
            rentalId,
            photoInHash,
            requested ? returnRequests[rentalId].requestedAtLogical : _logicalNow(meta[rentalId].bookedAtReal)
        );
    }

    function _completeReturn(uint256 rentalId, bytes32 photoInHash, uint64 nowLogical) internal {
        Rental storage r = rentals[rentalId];
        uint256 fee = lateFee(rentalId, nowLogical);
        uint256 remaining = r.deposit - fee;

        r.photoInHash = photoInHash;
        r.status = Status.Returned;
        meta[rentalId].returnedAtLogical = nowLogical;
        meta[rentalId].depositRemaining = remaining;
        meta[rentalId].lateFeeCharged = fee;
        claimDeadline[rentalId] = uint64(block.timestamp + CLAIM_WINDOW);
        delete settlementOffers[rentalId];

        item.setUser(r.tokenId, address(0), 0);

        uint256 toOwner = r.rent + fee;
        if (toOwner > 0) idr.safeTransfer(r.owner, toOwner);

        emit Returned(rentalId, photoInHash, fee);
    }

    function _payoutClaim(uint256 rentalId, uint256 amount, bool returnBond) internal {
        Rental storage r = rentals[rentalId];
        Claim storage c = claims[rentalId];
        uint256 remaining = meta[rentalId].depositRemaining;
        if (amount > remaining) revert BadAmount();

        uint256 rest = remaining - amount;
        uint256 bond = c.bond;
        meta[rentalId].depositRemaining = 0;
        c.bond = 0;
        r.status = Status.Settled;
        delete settlementOffers[rentalId];
        _unlock(r.tokenId);
        (uint256 value,,,) = item.terms(r.tokenId);
        uint8 outcome = amount > 0
            ? reputation.OUTCOME_DAMAGE()
            : meta[rentalId].returnedAtLogical > r.end ? reputation.OUTCOME_LATE() : reputation.OUTCOME_OK();
        reputation.record(r.renter, outcome, value, r.owner);

        if (amount > 0) idr.safeTransfer(r.owner, amount);
        if (rest > 0) idr.safeTransfer(r.renter, rest);
        if (bond > 0) idr.safeTransfer(returnBond ? r.owner : r.renter, bond);
        emit Settled(rentalId, amount);
    }

    function _unlock(uint256 tokenId) internal {
        openRentalCount -= 1;
        isLocked[tokenId] = false;
        openRentalOf[tokenId] = 0;
    }

    function _requireMediator(uint256 rentalId) internal view {
        if (msg.sender != mediations[rentalId].mediator || msg.sender == address(0)) revert NotMediator();
    }

    function _requireReturnRequest(Status status) internal pure {
        if (status != Status.ReturnRequested && status != Status.ReturnDisputed) revert BadStatus();
    }

    function _requireNegotiable(Status status) internal pure {
        if (
            status != Status.ReturnRequested && status != Status.ReturnDisputed && status != Status.Claimed
                && status != Status.Disputed
        ) revert BadStatus();
    }

    function _consumeSig(
        bytes32 typehash,
        uint256 rentalId,
        bytes32 photoHash,
        uint64 timestamp,
        address signer,
        bytes memory signature
    ) internal {
        uint64 nowTs = uint64(block.timestamp);
        if (timestamp > nowTs + SIG_FUTURE_SKEW) revert SigExpired();
        if (nowTs > timestamp + SIG_WINDOW) revert SigExpired();

        bytes32 digest = _digest(typehash, rentalId, photoHash, timestamp, signer);
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != signer) revert BadSignature();
        nonces[signer] += 1;
    }

    function _digest(bytes32 typehash, uint256 rentalId, bytes32 photoHash, uint64 timestamp, address signer)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = typehash == HANDOVER_TYPEHASH
            ? keccak256(
                abi.encode(typehash, rentalId, photoHash, timestamp, mediations[rentalId].mediator, nonces[signer])
            )
            : keccak256(abi.encode(typehash, rentalId, photoHash, timestamp, nonces[signer]));
        return _hashTypedDataV4(structHash);
    }

    function _logicalNow(uint64 anchorReal) internal view returns (uint64) {
        if (!demoMode || anchorReal == 0) return uint64(block.timestamp);
        if (block.timestamp <= anchorReal) return anchorReal;
        uint256 logical = uint256(anchorReal) + (block.timestamp - anchorReal) * DEMO_SCALE;
        if (logical > type(uint64).max) return type(uint64).max;
        return uint64(logical);
    }

    function _toRealDeadline(uint64 anchorReal, uint64 logicalTarget) internal view returns (uint64) {
        if (!demoMode || anchorReal == 0) return logicalTarget;
        if (logicalTarget <= anchorReal) return uint64(block.timestamp);
        uint256 delta = uint256(logicalTarget) - uint256(anchorReal);
        uint256 realDelta = (delta + DEMO_SCALE - 1) / DEMO_SCALE;
        uint256 deadline = uint256(anchorReal) + realDelta;
        if (deadline > type(uint64).max) return type(uint64).max;
        return uint64(deadline);
    }
}
