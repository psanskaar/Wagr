// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test}             from "forge-std/Test.sol";
import {StdInvariant}     from "forge-std/StdInvariant.sol";
import {WagrEscrow}       from "../src/WagrEscrow.sol";
import {DuelTypes}        from "../src/libs/DuelTypes.sol";
import {MockBinaryMarket} from "./MockBinaryMarket.sol";
import {MockERC20}        from "./MockERC20.sol";

/// @notice INVARIANT: for every duel that has NOT been settled, its stakeA +
///         stakeB are still held by the escrow. Consequence: nobody can
///         siphon collateral out of open duels through any sequence of calls.
contract WagrEscrowInvariant is StdInvariant, Test {
    MockERC20 usd;
    MockBinaryMarket mkt;
    WagrEscrow escrow;
    Handler h;

    function setUp() public {
        usd = new MockERC20("USDso","USDso",6);
        mkt = new MockBinaryMarket(address(usd), uint64(block.timestamp + 1 days));
        escrow = new WagrEscrow(usd, address(0x100), address(0xFEE), 50);
        h = new Handler(escrow, usd, mkt);
        targetContract(address(h));
    }

    function invariant_openDuelsFullyBacked() public view {
        uint256 owed;
        uint256 next = escrow.nextDuelId();
        for (uint256 i = 1; i < next; i++) {
            DuelTypes.Duel memory d = escrow.getDuel(i);
            if (!d.settled) owed += uint256(d.stakeA) + uint256(d.stakeB);
        }
        // Escrow balance must cover every open duel's stakes.
        assertGe(usd.balanceOf(address(escrow)), owed);
    }
}

contract Handler is Test {
    WagrEscrow immutable escrow;
    MockERC20  immutable usd;
    MockBinaryMarket immutable mkt;

    address[3] users = [address(0xA1), address(0xA2), address(0xA3)];

    constructor(WagrEscrow e, MockERC20 u, MockBinaryMarket m) {
        escrow = e; usd = u; mkt = m;
        for (uint256 i = 0; i < users.length; i++) {
            usd.mint(users[i], 1_000_000e6);
            vm.prank(users[i]); usd.approve(address(escrow), type(uint256).max);
        }
    }

    function createDuel(uint256 who, uint8 side, uint128 stake) external {
        who   = who % users.length;
        side  = side % 2;
        stake = uint128(bound(stake, 1, 1_000e6));
        vm.prank(users[who]);
        try escrow.createDuel(address(mkt), side, stake, address(0), 0) {} catch {}
    }

    function acceptDuel(uint256 who, uint256 duelId) external {
        who    = who % users.length;
        uint256 next = escrow.nextDuelId();
        if (next <= 1) return;
        duelId = bound(duelId, 1, next - 1);
        DuelTypes.Duel memory d = escrow.getDuel(duelId);
        vm.prank(users[who]);
        try escrow.acceptDuel(duelId, d.stakeA) {} catch {}
    }

    function resolve(uint8 outcome) external {
        outcome = outcome % 2;
        try mkt.setResolved(outcome) {} catch {}
    }

    function settle(uint256 duelId) external {
        uint256 next = escrow.nextDuelId();
        if (next <= 1) return;
        duelId = bound(duelId, 1, next - 1);
        try escrow.settleDuel(duelId) {} catch {}
    }
}
