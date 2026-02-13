// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProtectedVault} from "../src/ProtectedVault.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address sentinel = vm.envAddress("SENTINEL_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        ProtectedVault vault = new ProtectedVault(sentinel);
        
        console.log("ProtectedVault deployed at:", address(vault));
        console.log("Sentinel address:", sentinel);
        
        vm.stopBroadcast();
    }
}
