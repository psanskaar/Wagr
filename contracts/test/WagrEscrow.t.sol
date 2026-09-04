// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2}   from "forge-std/Test.sol";
import {WagrEscrow}       from "../src/WagrEscrow.sol";
import {DuelTypes}        from "../src/libs/DuelTypes.sol";
import {MockBinaryMarket} from "./MockBinaryMarket.sol";
import {MockERC20}        from "./MockERC20.sol";

contract WagrEscrowTest is Test {
    MockERC20 usd;
    MockBinaryMarket mkt;
    WagrEscrow escrow;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address carol = address(0xCA401);
    address feeSink = address(0xFEE);
    address precompile = address(0x0000000000000000000000000000000000000100);

    function setUp() public {
        usd = new MockERC20("USDso", "USDso", 6);
        mkt = new MockBinaryMarket(address(usd), uint64(block.timestamp + 15 minutes));
        escrow = new WagrEscrow(usd, precompile, feeSink, 50); // 0.50%

        usd.mint(alice, 1_000_000e6);
        usd.mint(bob,   1_000_000e6);
        usd.mint(carol, 1_000_000e6);

        vm.prank(alice); usd.approve(address(escrow), type(uint256).max);
        vm.prank(bob);   usd.approve(address(escrow), type(uint256).max);
        vm.prank(carol); usd.approve(address(escrow), type(uint256).max);
    }

    // ────────────────────────────────────────────────────────── happy paths ──

    function testCreateAndAcceptDuel() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        assertEq(id, 1);

        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);

        DuelTypes.Duel memory d = escrow.getDuel(id);
        assertEq(d.alice, alice);
        assertEq(d.bob,   bob);
        assertEq(d.stakeA, 100e6);
        assertEq(d.stakeB, 100e6);
    }

    function testSettlementAliceWinsYes() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);

        mkt.setResolved(0); // YES wins

        uint256 aliceBefore = usd.balanceOf(alice);
        uint256 sinkBefore  = usd.balanceOf(feeSink);
        escrow.settleDuel(id);

        // pot 200; platform 50bps = 1; alice gets 199
        assertEq(usd.balanceOf(alice) - aliceBefore, 199e6);
        assertEq(usd.balanceOf(feeSink) - sinkBefore, 1e6);
    }

    function testSettlementBobWinsNo() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);
        mkt.setResolved(1); // NO wins

        uint256 bobBefore = usd.balanceOf(bob);
        escrow.settleDuel(id);
        assertEq(usd.balanceOf(bob) - bobBefore, 199e6);
    }

    function testVoidRefundsBothSides() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);
        mkt.setVoided();

        uint256 aliceBefore = usd.balanceOf(alice);
        uint256 bobBefore   = usd.balanceOf(bob);
        escrow.settleDuel(id);
        assertEq(usd.balanceOf(alice) - aliceBefore, 100e6);
        assertEq(usd.balanceOf(bob)   - bobBefore,   100e6);
    }

    function testBuilderFeeSplit() public {
        address builder = address(0xB111DE2);
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, builder, 100); // 1%
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);
        mkt.setResolved(0);

        uint256 aliceBefore   = usd.balanceOf(alice);
        uint256 builderBefore = usd.balanceOf(builder);
        escrow.settleDuel(id);

        // pot 200; platform 1 (50bps); builder 2 (100bps); alice 197.
        assertEq(usd.balanceOf(builder) - builderBefore, 2e6);
        assertEq(usd.balanceOf(alice)   - aliceBefore, 197e6);
    }

    // ─────────────────────────────────────────────────────── landmine tests ──

    function testUnresolvedMarketReverts() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);

        // Market not resolved yet. winningOutcome() returns 0 by default.
        vm.expectRevert(WagrEscrow.NotResolved.selector);
        escrow.settleDuel(id);
    }

    function testCannotDoubleSettle() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);
        mkt.setResolved(0);
        escrow.settleDuel(id);
        vm.expectRevert(WagrEscrow.AlreadySettled.selector);
        escrow.settleDuel(id);
    }

    function testCannotSelfMatch() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(alice);
        vm.expectRevert(WagrEscrow.SelfMatch.selector);
        escrow.acceptDuel(id, 100e6);
    }

    function testCannotAcceptWithWrongStake() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        vm.expectRevert(WagrEscrow.BadStake.selector);
        escrow.acceptDuel(id, 99e6);
    }

    function testCannotCreateOnExpiredMarket() public {
        vm.warp(block.timestamp + 20 minutes);
        vm.prank(alice);
        vm.expectRevert(WagrEscrow.MarketExpired.selector);
        escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
    }

    function testCancelReturnsStake() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        uint256 before_ = usd.balanceOf(alice);
        vm.prank(alice);
        escrow.cancelDuel(id);
        assertEq(usd.balanceOf(alice) - before_, 100e6);
    }

    function testStrangerCannotCancel() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        vm.expectRevert(WagrEscrow.NotAlice.selector);
        escrow.cancelDuel(id);
    }

    // ────────────────────────────────────────────────── commit-reveal path ──

    function testCommitRevealFlow() public {
        bytes32 salt = keccak256("secret");
        uint8   side = 0;
        uint128 stake = 100e6;
        bytes32 h = keccak256(abi.encode(address(mkt), side, stake, salt, alice));

        vm.prank(alice);
        uint256 cid = escrow.commit(h, stake);

        vm.prank(bob);
        uint256 did = escrow.matchAndReveal(cid, address(mkt), side, stake, salt, 1, stake);
        assertEq(did, 1);

        mkt.setResolved(0);
        escrow.settleDuel(did);
    }

    function testCommitRevealRejectsSameSide() public {
        bytes32 salt = keccak256("secret");
        bytes32 h    = keccak256(abi.encode(address(mkt), uint8(0), uint128(100e6), salt, alice));
        vm.prank(alice); uint256 cid = escrow.commit(h, 100e6);
        vm.prank(bob);
        vm.expectRevert(WagrEscrow.SelfMatch.selector);
        escrow.matchAndReveal(cid, address(mkt), 0, 100e6, salt, 0, 100e6);
    }

    function testCommitRevealRejectsWrongHash() public {
        bytes32 salt = keccak256("secret");
        bytes32 h    = keccak256(abi.encode(address(mkt), uint8(0), uint128(100e6), salt, alice));
        vm.prank(alice); uint256 cid = escrow.commit(h, 100e6);
        vm.prank(bob);
        vm.expectRevert(WagrEscrow.CommitMismatch.selector);
        escrow.matchAndReveal(cid, address(mkt), 1, 100e6, salt, 0, 100e6);
    }

    // ───────────────────────────────────────────────── reactivity handler ──

    function testOnEventOnlyPrecompile() public {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = escrow.RESOLVED_TOPIC();
        vm.expectRevert(WagrEscrow.OnlyPrecompile.selector);
        escrow.onEvent(address(mkt), topics, "");
    }

    function testOnEventAutoSettles() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);
        mkt.setResolved(0);

        bytes32[] memory topics = new bytes32[](1);
        topics[0] = escrow.RESOLVED_TOPIC();

        uint256 before_ = usd.balanceOf(alice);
        vm.prank(precompile);
        escrow.onEvent(address(mkt), topics, "");
        assertEq(usd.balanceOf(alice) - before_, 199e6);

        DuelTypes.Duel memory d = escrow.getDuel(id);
        assertTrue(d.settled);
    }

    function testOnEventBatchSettlesManyDuels() public {
        vm.prank(alice);
        uint256 id1 = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);   escrow.acceptDuel(id1, 100e6);

        vm.prank(carol);
        uint256 id2 = escrow.createDuel(address(mkt), 1, 50e6, address(0), 0);
        vm.prank(bob);   escrow.acceptDuel(id2, 50e6);

        mkt.setResolved(0);

        bytes32[] memory topics = new bytes32[](1);
        topics[0] = escrow.RESOLVED_TOPIC();
        vm.prank(precompile);
        escrow.onEvent(address(mkt), topics, "");

        assertTrue(escrow.getDuel(id1).settled);
        assertTrue(escrow.getDuel(id2).settled);
    }

    // ──────────────────────────────────────────────────────── preview view ──

    function testPreviewPayoutMatchesActual() public {
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, 100e6, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, 100e6);
        mkt.setResolved(0);

        (address w, uint256 p, bool v, bool r) = escrow.previewPayout(id);
        assertEq(w, alice); assertEq(p, 199e6); assertFalse(v); assertTrue(r);

        uint256 aliceBefore = usd.balanceOf(alice);
        escrow.settleDuel(id);
        assertEq(usd.balanceOf(alice) - aliceBefore, p);
    }
}
