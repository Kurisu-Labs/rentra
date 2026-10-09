// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title MockIDR
/// @notice Testnet rupiah stablecoin. 1e18 units = Rp1. Anyone may drip the faucet on Ethereum Sepolia.
///         Production would swap this for a regulated rupiah stablecoin (see docs/PLAN.md roadmap).
contract MockIDR is ERC20, ERC20Permit {
    /// @notice Rp10.000.000 per drip, so a demo booking does not need many transactions.
    uint256 public constant FAUCET_AMOUNT = 10_000_000 ether;

    event FaucetDrip(address indexed to, uint256 amount);

    constructor() ERC20("Mock Indonesian Rupiah", "mIDR") ERC20Permit("Mock Indonesian Rupiah") {}

    /// @notice Mint mock rupiah to the caller. Uncapped on purpose: this token has no value.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetDrip(msg.sender, FAUCET_AMOUNT);
    }
}
