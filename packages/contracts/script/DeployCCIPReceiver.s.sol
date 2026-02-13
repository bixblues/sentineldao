// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelCCIPReceiver} from "../src/SentinelCCIPReceiver.sol";

contract DeployCCIPReceiver is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address router = vm.envAddress("CCIP_ROUTER");
        address vault = vm.envAddress("VAULT_ADDRESS");
        uint64 allowedSourceChainSelector = uint64(vm.envUint("SOURCE_CHAIN_SELECTOR"));
        address allowedSender = vm.envAddress("ALLOWED_SENDER");

        vm.startBroadcast(deployerPrivateKey);

        SentinelCCIPReceiver receiver = new SentinelCCIPReceiver(
            router,
            vault,
            allowedSourceChainSelector,
            allowedSender
        );

        console.log("SentinelCCIPReceiver deployed at:", address(receiver));
        console.log("  Router:", router);
        console.log("  Vault:", vault);
        console.log("  Allowed source chain selector:", allowedSourceChainSelector);
        console.log("  Allowed sender:", allowedSender);

        vm.stopBroadcast();
    }
}
