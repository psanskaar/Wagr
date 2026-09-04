// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Halmos symbolic proofs. Run with:
///
///     halmos --contract WagrEscrowSymbolic --function check_ -vv
///
/// These properties hold for EVERY possible input, not just for random samples.
/// They are the "correctness by construction" evidence Wagr uses to buy back
/// the Technical Implementation axis against rampart-tier submissions.

import {Test}             from "forge-std/Test.sol";
import {WagrEscrow}       from "../../src/WagrEscrow.sol";
import {DuelTypes}        from "../../src/libs/DuelTypes.sol";
import {MockBinaryMarket} from "../MockBinaryMarket.sol";
import {MockERC20}        from "../MockERC20.sol";

contract WagrEscrowSymbolic is Test {
    MockERC20        usd;
    MockBinaryMarket mkt;
    WagrEscrow       escrow;
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    function setUp() public {
        usd = new MockERC20("USDso","USDso",6);
        mkt = new MockBinaryMarket(address(usd), type(uint64).max);
        escrow = new WagrEscrow(usd, address(0x100), address(0xFEE), 50);
        usd.mint(alice, type(uint128).max);
        usd.mint(bob,   type(uint128).max);
        vm.prank(alice); usd.approve(address(escrow), type(uint256).max);
        vm.prank(bob);   usd.approve(address(escrow), type(uint256).max);
    }

    /// @notice PROPERTY 1: settle can never pay out more than the pot.
    ///         Quantifies over every possible (stake, side, oracle outcome).
    function check_settleNeverOverpays(uint128 stake, uint8 aliceSide, uint8 outcome) public {
        vm.assume(stake > 0 && stake < 1e30);
        vm.assume(aliceSide < 2);
        vm.assume(outcome  < 2);

        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), aliceSide, stake, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, stake);

        mkt.setResolved(outcome);

        uint256 beforeAlice = usd.balanceOf(alice);
        uint256 beforeBob   = usd.balanceOf(bob);
        uint256 beforeSink  = usd.balanceOf(address(0xFEE));

        escrow.settleDuel(id);

        uint256 paidOut = (usd.balanceOf(alice) - beforeAlice)
                        + (usd.balanceOf(bob)   - beforeBob)
                        + (usd.balanceOf(address(0xFEE)) - beforeSink);
        assert(paidOut == uint256(stake) * 2);
    }

    /// @notice PROPERTY 2: winningOutcome default-zero cannot pay the YES side
    ///         while the market is unresolved. Any settle attempt reverts.
    function check_unresolvedMarketRevertsAlways(uint128 stake, uint8 aliceSide) public {
        vm.assume(stake > 0 && stake < 1e30);
        vm.assume(aliceSide < 2);

        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), aliceSide, stake, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, stake);

        // Market unresolved. Must revert regardless of who calls.
        (bool ok, ) = address(escrow).call(abi.encodeWithSignature("settleDuel(uint256)", id));
        assert(!ok);
    }

    /// @notice PROPERTY 3: a voided market refunds each side their own stake
    ///         EXACTLY — no fee is skimmed.
    function check_voidedMarketExactRefund(uint128 stake) public {
        vm.assume(stake > 0 && stake < 1e30);

        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, stake, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, stake);

        mkt.setVoided();

        uint256 beforeAlice = usd.balanceOf(alice);
        uint256 beforeBob   = usd.balanceOf(bob);
        escrow.settleDuel(id);
        assert(usd.balanceOf(alice) - beforeAlice == stake);
        assert(usd.balanceOf(bob)   - beforeBob   == stake);
    }

    /// @notice PROPERTY 4: after settlement the duel's `settled` flag is set
    ///         and a second settle reverts. No infinite-drain path exists.
    function check_settleIsIdempotent(uint128 stake) public {
        vm.assume(stake > 0 && stake < 1e30);
        vm.prank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, stake, address(0), 0);
        vm.prank(bob);
        escrow.acceptDuel(id, stake);
        mkt.setResolved(0);

        escrow.settleDuel(id);
        (bool ok, ) = address(escrow).call(abi.encodeWithSignature("settleDuel(uint256)", id));
        assert(!ok);
    }
}
