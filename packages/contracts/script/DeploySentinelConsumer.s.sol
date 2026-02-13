// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelConsumer} from "../src/SentinelConsumer.sol";

/// @title Deploy SentinelConsumer
/// @notice Deploys the CRE report receiver contract and registers vaults
contract DeploySentinelConsumer is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("CRE_ETH_PRIVATE_KEY");

        // Vault addresses to register
        address sepoliaVault = vm.envAddress("VAULT_SEPOLIA");
        address arbVault = vm.envAddress("VAULT_ARB_SEPOLIA");
        address baseVault = vm.envAddress("VAULT_BASE_SEPOLIA");

        vm.startBroadcast(deployerPrivateKey);

        SentinelConsumer consumer = new SentinelConsumer();
        console.log("SentinelConsumer deployed at:", address(consumer));

        // Register all vaults
        consumer.registerVault(sepoliaVault);
        consumer.registerVault(arbVault);
        consumer.registerVault(baseVault);
        console.log("Registered 3 vaults");

        // Note: setConfig() must be called separately once the
        // KeystoneForwarder address and workflow details are known.
        // For local simulation, the forwarder address is the simulation forwarder.
        // For production, it's the deployed KeystoneForwarder on the target chain.

        vm.stopBroadcast();
    }
}
