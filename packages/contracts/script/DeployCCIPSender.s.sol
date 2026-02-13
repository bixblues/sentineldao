// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelCCIPSender} from "../src/SentinelCCIPSender.sol";

contract DeployCCIPSender is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address router = vm.envAddress("CCIP_ROUTER");
        address linkToken = vm.envAddress("LINK_TOKEN");

        vm.startBroadcast(deployerPrivateKey);

        SentinelCCIPSender sender = new SentinelCCIPSender(router, linkToken);

        console.log("SentinelCCIPSender deployed at:", address(sender));
        console.log("  Router:", router);
        console.log("  LINK Token:", linkToken);

        vm.stopBroadcast();
    }
}
