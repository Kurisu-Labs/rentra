// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockIDR} from "../src/MockIDR.sol";
import {RentalItem} from "../src/RentalItem.sol";
import {Reputation} from "../src/Reputation.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

/// @notice Deploy MockIDR, RentalItem, Reputation, and RentalEscrow to Base Sepolia.
///         Demo mode is on: 1 logical day = 2 real minutes.
///
///         forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --private-key $PRIVATE_KEY
///         Add --verify once BASESCAN_API_KEY is set.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        MockIDR idr = new MockIDR();
        RentalItem item = new RentalItem();
        Reputation reputation = new Reputation();
        // Demo clock on for the hackathon recording. Turn it off with setDemoMode(false) for real time.
        RentalEscrow escrow = new RentalEscrow(address(idr), address(item), address(reputation), true);
        item.setEscrow(address(escrow));
        reputation.setEscrow(address(escrow));

        vm.stopBroadcast();

        console2.log("MockIDR", address(idr));
        console2.log("RentalItem", address(item));
        console2.log("Reputation", address(reputation));
        console2.log("RentalEscrow", address(escrow));
    }
}
