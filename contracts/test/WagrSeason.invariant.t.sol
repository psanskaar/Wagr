// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, StdInvariant} from "forge-std/Test.sol";
import {WagrSeason}         from "../src/WagrSeason.sol";
import {MockERC20}          from "./MockERC20.sol";

/// @notice INVARIANT: totalPaidOut <= total-ever-joined for every season.
contract WagrSeasonInvariant is StdInvariant, Test {
    MockERC20 usd;
    WagrSeason season;
    Handler h;

    function setUp() public {
        usd = new MockERC20("USDso","USDso",6);
        season = new WagrSeason(usd);
        h = new Handler(season, usd);
        targetContract(address(h));
    }

    function invariant_neverOverPay() public view {
        assertLe(season.totalPaidOut(), h.totalDeposited());
    }
}

contract Handler is Test {
    WagrSeason immutable s;
    MockERC20  immutable usd;
    uint256    public   totalDeposited;
    address[3] users = [address(0xA1), address(0xA2), address(0xA3)];
    uint256[]  seasonIds;

    constructor(WagrSeason _s, MockERC20 _usd) {
        s = _s; usd = _usd;
        for (uint256 i = 0; i < users.length; i++) {
            usd.mint(users[i], 1_000_000e6);
            vm.prank(users[i]); usd.approve(address(s), type(uint256).max);
        }
    }

    function newSeason(uint128 fee) external {
        fee = uint128(bound(fee, 1, 1_000e6));
        uint256 sid = s.createSeason(fee);
        seasonIds.push(sid);
    }

    function join(uint256 idx, uint256 who) external {
        if (seasonIds.length == 0) return;
        uint256 sid = seasonIds[idx % seasonIds.length];
        who = who % users.length;
        (,,,,uint128 fee,) = s.seasons(sid);
        vm.prank(users[who]);
        try s.joinSeason(sid, fee) { totalDeposited += fee; } catch {}
    }
}
