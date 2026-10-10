// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockIDR} from "../src/MockIDR.sol";
import {RentalItem} from "../src/RentalItem.sol";
import {Reputation} from "../src/Reputation.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

/// @notice Deploy MockIDR, RentalItem, Reputation, and RentalEscrow to Ethereum Sepolia (chain id 11155111).
///         Real-time clock by default. RENTRA_DEMO_MODE=true accelerates rental deadlines only.
///
///         Requires SEPOLIA_RPC_URL and a CLI signer (--account/--sender), or legacy DEPLOYER_PRIVATE_KEY.
///         Writes only an unverified candidate. Promote manifests after RPC verification succeeds.
contract Deploy is Script {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;

    function run() external {
        string memory rpc = vm.envString("SEPOLIA_RPC_URL");
        require(bytes(rpc).length != 0, "SEPOLIA_RPC_URL is empty");
        require(block.chainid == SEPOLIA_CHAIN_ID, "expected Ethereum Sepolia (11155111)");

        string memory rawKey = vm.envOr("DEPLOYER_PRIVATE_KEY", string(""));
        uint256 pk = bytes(rawKey).length == 0 ? 0 : vm.parseUint(rawKey);
        address deployer = pk == 0 ? msg.sender : vm.addr(pk);
        bool demoMode = vm.envOr("RENTRA_DEMO_MODE", false);
        if (pk == 0) vm.startBroadcast(deployer);
        else vm.startBroadcast(pk);

        MockIDR idr = new MockIDR();
        RentalItem item = new RentalItem();
        Reputation reputation = new Reputation();
        RentalEscrow escrow = new RentalEscrow(address(idr), address(item), address(reputation), demoMode);
        item.setEscrow(address(escrow));
        reputation.setEscrow(address(escrow));

        vm.stopBroadcast();

        string memory json =
            _deploymentJson(address(idr), address(item), address(reputation), address(escrow), deployer, demoMode);
        vm.writeJson(json, "deployments/sepolia.candidate.json");

        console2.log("chainId", block.chainid);
        console2.log("deployer", deployer);
        console2.log("MockIDR", address(idr));
        console2.log("RentalItem", address(item));
        console2.log("Reputation", address(reputation));
        console2.log("RentalEscrow", address(escrow));
        console2.log("wrote unverified deployments/sepolia.candidate.json");
        console2.log("run app deployment verification before promoting these addresses");
    }

    function _deploymentJson(
        address idr,
        address item,
        address reputation,
        address escrow,
        address deployer,
        bool demoMode
    ) internal returns (string memory) {
        string memory contractsKey = "contracts";
        vm.serializeAddress(contractsKey, "MockIDR", idr);
        vm.serializeAddress(contractsKey, "RentalItem", item);
        vm.serializeAddress(contractsKey, "Reputation", reputation);
        string memory contractsJson = vm.serializeAddress(contractsKey, "RentalEscrow", escrow);

        string memory root = "deployment";
        vm.serializeUint(root, "chainId", SEPOLIA_CHAIN_ID);
        vm.serializeUint(root, "protocolVersion", 2);
        vm.serializeAddress(root, "deployer", deployer);
        vm.serializeBool(root, "demoMode", demoMode);
        return vm.serializeString(root, "contracts", contractsJson);
    }
}
