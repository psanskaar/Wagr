// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2}       from "forge-std/Script.sol";
import {IERC20}                 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WagrEscrow}             from "../src/WagrEscrow.sol";
import {WagrSeason}             from "../src/WagrSeason.sol";
import {WagrSplitterFactory}    from "../src/WagrSplitterFactory.sol";

/// @notice `forge script script/Deploy.s.sol --rpc-url shannon --broadcast`
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address usdso = vm.envAddress("USDSO");            // testnet: DreamDEX tUSDC
        address precompile = vm.envOr(
            "REACTIVITY_PRECOMPILE",
            address(0x0000000000000000000000000000000000000100)
        );
        address feeSink = vm.envAddress("FEE_SINK");

        vm.startBroadcast(pk);
        WagrEscrow escrow             = new WagrEscrow(
            IERC20(usdso),
            precompile,
            feeSink,
            /* platformBps */ 50 // 0.50%
        );
        WagrSeason season             = new WagrSeason(IERC20(usdso));
        WagrSplitterFactory splitters = new WagrSplitterFactory();
        vm.stopBroadcast();

        console2.log("WagrEscrow           :", address(escrow));
        console2.log("WagrSeason           :", address(season));
        console2.log("WagrSplitterFactory  :", address(splitters));
        console2.log("Implementation clone :", splitters.implementation());
    }
}
