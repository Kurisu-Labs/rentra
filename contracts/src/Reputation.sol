// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Reputation
/// @notice Non-transferable rental history. A good record lowers the deposit factor.
///         There is no transfer function: the score is bound to the address that earned it.
///
/// Anti-gaming (see docs/PLAN.md §3.5):
/// - Only a successful rental at or above `MIN_COUNTABLE_VALUE`, from an owner this renter
///   has not already counted, reduces the deposit factor.
/// - The discount applies only up to the highest value successfully rented (`maxSuccessfulValue`).
///   Escrow enforces that cap in `quoteDeposit`. Cheap rentals cannot unlock a full discount
///   on an expensive item.
/// - One default locks the factor at 100% permanently. Later good rentals do not unlock it.
contract Reputation {
    uint8 public constant OUTCOME_OK = 0;
    uint8 public constant OUTCOME_LATE = 1;
    uint8 public constant OUTCOME_DEFAULT = 2;

    /// @dev Rp500.000. Below this, a rental is recorded but does not earn a discount.
    uint256 public constant MIN_COUNTABLE_VALUE = 500_000 ether;
    uint16 public constant FULL_BPS = 10_000;
    uint16 public constant MIN_FACTOR_BPS = 3_000;
    /// @dev 10% off per qualifying unique owner. Five owners => 50% deposit (demo script).
    uint16 public constant STEP_BPS = 1_000;

    address public admin;
    address public escrow;

    struct Stats {
        uint32 ok;
        uint32 late;
        uint32 defaults;
        uint16 score;
        uint16 uniqueOwners;
        uint256 maxSuccessfulValue;
        bool defaulted;
    }

    mapping(address renter => Stats) private _stats;
    mapping(address renter => mapping(address owner => bool)) public countedOwner;

    event Recorded(
        address indexed renter,
        uint8 outcome,
        uint256 valueIDR,
        address indexed owner,
        uint16 score,
        uint16 depositFactorBps
    );
    event EscrowSet(address indexed escrow);

    error NotAdmin();
    error NotEscrow();
    error EscrowAlreadySet();
    error ZeroAddress();
    error BadOutcome();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setEscrow(address escrow_) external onlyAdmin {
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (escrow_ == address(0)) revert ZeroAddress();
        escrow = escrow_;
        emit EscrowSet(escrow_);
    }

    /// @notice Plan signature. Records the outcome without unique-owner credit.
    function record(address renter, uint8 outcome, uint256 valueIDR) external {
        _record(renter, outcome, valueIDR, address(0));
    }

    /// @notice Escrow entrypoint. `owner` is required so the unique-owner rule can be enforced.
    function record(address renter, uint8 outcome, uint256 valueIDR, address owner) external {
        _record(renter, outcome, valueIDR, owner);
    }

    function scoreOf(address renter) external view returns (uint16 score, uint32 ok, uint32 late, uint32 defaults) {
        Stats storage s = _stats[renter];
        return (s.score, s.ok, s.late, s.defaults);
    }

    /// @notice 10000 = pay the full base deposit. Floor is 3000 (30%) unless the renter has defaulted.
    function depositFactorBps(address renter) public view returns (uint16) {
        Stats storage s = _stats[renter];
        if (s.defaulted) return FULL_BPS;
        uint256 reduction = uint256(s.uniqueOwners) * STEP_BPS;
        if (reduction >= FULL_BPS - MIN_FACTOR_BPS) return MIN_FACTOR_BPS;
        return uint16(FULL_BPS - reduction);
    }

    function maxSuccessfulValue(address renter) external view returns (uint256) {
        return _stats[renter].maxSuccessfulValue;
    }

    function hasDefaulted(address renter) external view returns (bool) {
        return _stats[renter].defaulted;
    }

    function uniqueOwnersOf(address renter) external view returns (uint16) {
        return _stats[renter].uniqueOwners;
    }

    function _record(address renter, uint8 outcome, uint256 valueIDR, address owner) internal {
        if (msg.sender != escrow) revert NotEscrow();
        if (renter == address(0)) revert ZeroAddress();
        if (outcome > OUTCOME_DEFAULT) revert BadOutcome();

        Stats storage s = _stats[renter];
        if (outcome == OUTCOME_OK) {
            s.ok += 1;
            if (
                !s.defaulted && valueIDR >= MIN_COUNTABLE_VALUE && owner != address(0)
                    && !countedOwner[renter][owner]
            ) {
                countedOwner[renter][owner] = true;
                s.uniqueOwners += 1;
            }
            if (valueIDR >= MIN_COUNTABLE_VALUE && valueIDR > s.maxSuccessfulValue) {
                s.maxSuccessfulValue = valueIDR;
            }
        } else if (outcome == OUTCOME_LATE) {
            s.late += 1;
        } else {
            s.defaults += 1;
            s.defaulted = true;
        }

        s.score = _score(s);
        emit Recorded(renter, outcome, valueIDR, owner, s.score, depositFactorBps(renter));
    }

    function _score(Stats storage s) internal view returns (uint16) {
        uint256 raw = uint256(s.ok) * 100 + uint256(s.late) * 20;
        if (raw > 1000) raw = 1000;
        if (s.defaults > 0) {
            raw /= 10 * uint256(s.defaults);
            if (raw > 50) raw = 50;
        }
        return uint16(raw);
    }
}
