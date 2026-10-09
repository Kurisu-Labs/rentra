// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockIDR} from "../src/MockIDR.sol";
import {RentalItem} from "../src/RentalItem.sol";
import {Reputation} from "../src/Reputation.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

/// @notice Deploy MockIDR, RentalItem, Reputation, and RentalEscrow to Ethereum Sepolia (chain id 11155111).
///         Demo mode is on: 1 logical day = 2 real minutes. Items are listed by owners after deploy.
///
///         Requires SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY. Do not commit either value.
///         forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
///         Writes deployments/sepolia.json and ../app/src/deployments/sepolia.json, then prints the addresses.
contract Deploy is Script {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;

    function run() external {
        string memory rpc = vm.envString("SEPOLIA_RPC_URL");
        require(bytes(rpc).length != 0, "SEPOLIA_RPC_URL is empty");
        require(block.chainid == SEPOLIA_CHAIN_ID, "expected Ethereum Sepolia (11155111)");

        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);

        MockIDR idr = new MockIDR();
        RentalItem item = new RentalItem();
        Reputation reputation = new Reputation();
        // Demo clock on for the hackathon recording. Turn it off with setDemoMode(false) for real time.
        RentalEscrow escrow = new RentalEscrow(address(idr), address(item), address(reputation), true);
        item.setEscrow(address(escrow));
        reputation.setEscrow(address(escrow));

        vm.stopBroadcast();

        string memory json = _deploymentJson(address(idr), address(item), address(reputation), address(escrow));
        vm.writeJson(json, "deployments/sepolia.json");
        vm.writeJson(json, "../app/src/deployments/sepolia.json");

        console2.log("chainId", block.chainid);
        console2.log("deployer", vm.addr(pk));
        console2.log("MockIDR", address(idr));
        console2.log("RentalItem", address(item));
        console2.log("Reputation", address(reputation));
        console2.log("RentalEscrow", address(escrow));
        console2.log("wrote deployments/sepolia.json");
        console2.log("wrote ../app/src/deployments/sepolia.json");
    }

    function _deploymentJson(address idr, address item, address reputation, address escrow)
        internal
        returns (string memory)
    {
        string memory contractsKey = "contracts";
        vm.serializeAddress(contractsKey, "MockIDR", idr);
        vm.serializeAddress(contractsKey, "RentalItem", item);
        vm.serializeAddress(contractsKey, "Reputation", reputation);
        string memory contractsJson = vm.serializeAddress(contractsKey, "RentalEscrow", escrow);

        string memory root = "deployment";
        vm.serializeUint(root, "chainId", SEPOLIA_CHAIN_ID);
        vm.serializeBool(root, "demoMode", true);
        return vm.serializeString(root, "contracts", contractsJson);
    }
}
