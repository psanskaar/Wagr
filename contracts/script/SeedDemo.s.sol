// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2}      from "forge-std/Script.sol";
import {WagrEscrow}            from "../src/WagrEscrow.sol";

/// @notice Seeds a pre-created duel on Shannon so the demo can open on the
///         "accept" state without needing a live wallet.
contract SeedDemo is Script {
    function run() external {
        uint256 pk         = vm.envUint("DEMO_MAKER_PK");
        address escrow     = vm.envAddress("WAGR_ESCROW");
        address marketAddr = vm.envAddress("DEMO_MARKET");
        uint128 stake      = uint128(vm.envUint("DEMO_STAKE"));
        uint8   makerSide  = uint8(vm.envUint("DEMO_MAKER_SIDE"));

        vm.startBroadcast(pk);
        uint256 id = WagrEscrow(escrow).createDuel(marketAddr, makerSide, stake, address(0), 0);
        vm.stopBroadcast();
        console2.log("Seeded duel id:", id);
    }
}
