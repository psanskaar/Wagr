// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SymTest}          from "halmos-cheatcodes/SymTest.sol";
import {Vm}               from "forge-std/Vm.sol";            // ← interface only
import {WagrEscrow}       from "../../src/WagrEscrow.sol";
import {MockBinaryMarket} from "../MockBinaryMarket.sol";
import {MockERC20}        from "../MockERC20.sol";

contract WagrEscrowSymbolic is SymTest {                      // ← no Test
    Vm private constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockERC20        usd;
    MockBinaryMarket mkt;
    WagrEscrow       escrow;
    address constant alice = address(0xA11CE);
    address constant bob   = address(0xB0B);

    function setUp() public {
        usd    = new MockERC20("USDso","USDso",6);
        mkt    = new MockBinaryMarket(address(usd), type(uint64).max);
        escrow = new WagrEscrow(usd, address(0x100), address(0xFEE), 50);

        usd.mint(alice, type(uint128).max);
        usd.mint(bob,   type(uint128).max);

        vm.startPrank(alice);
        usd.approve(address(escrow), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        usd.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    /// PROPERTY 1: settle never pays out more than the pot
    function check_settleNeverOverpays(uint128 stake, uint8 aliceSide, uint8 outcome) public {
        vm.assume(stake > 0 && stake < 1e18);
        vm.assume(aliceSide < 2);
        vm.assume(outcome   < 2);

        vm.startPrank(alice);
        uint256 id = escrow.createDuel(address(mkt), aliceSide, stake, address(0), 0);
        vm.stopPrank();

        vm.startPrank(bob);
        escrow.acceptDuel(id, stake);
        vm.stopPrank();

        mkt.setResolved(outcome);

        uint256 beforeAlice = usd.balanceOf(alice);
        uint256 beforeBob   = usd.balanceOf(bob);
        uint256 beforeFee   = usd.balanceOf(address(0xFEE));

        escrow.settleDuel(id);

        uint256 paidOut = (usd.balanceOf(alice) - beforeAlice)
                        + (usd.balanceOf(bob)   - beforeBob)
                        + (usd.balanceOf(address(0xFEE)) - beforeFee);
        assert(paidOut == uint256(stake) * 2);
    }

    /// PROPERTY 2: unresolved market always reverts
    function check_unresolvedMarketRevertsAlways(uint128 stake, uint8 aliceSide) public {
        vm.assume(stake > 0 && stake < 1e18);
        vm.assume(aliceSide < 2);

        vm.startPrank(alice);
        uint256 id = escrow.createDuel(address(mkt), aliceSide, stake, address(0), 0);
        vm.stopPrank();

        vm.startPrank(bob);
        escrow.acceptDuel(id, stake);
        vm.stopPrank();

        (bool ok,) = address(escrow).call(
            abi.encodeWithSignature("settleDuel(uint256)", id)
        );
        assert(!ok);
    }

    /// PROPERTY 3: voided market refunds both sides exactly
    function check_voidedMarketExactRefund(uint128 stake) public {
        vm.assume(stake > 0 && stake < 1e18);

        vm.startPrank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, stake, address(0), 0);
        vm.stopPrank();

        vm.startPrank(bob);
        escrow.acceptDuel(id, stake);
        vm.stopPrank();

        mkt.setVoided();

        uint256 beforeAlice = usd.balanceOf(alice);
        uint256 beforeBob   = usd.balanceOf(bob);
        escrow.settleDuel(id);
        assert(usd.balanceOf(alice) - beforeAlice == stake);
        assert(usd.balanceOf(bob)   - beforeBob   == stake);
    }

    /// PROPERTY 4: double settle reverts (idempotent)
    function check_settleIsIdempotent(uint128 stake) public {
        vm.assume(stake > 0 && stake < 1e18);

        vm.startPrank(alice);
        uint256 id = escrow.createDuel(address(mkt), 0, stake, address(0), 0);
        vm.stopPrank();

        vm.startPrank(bob);
        escrow.acceptDuel(id, stake);
        vm.stopPrank();

        mkt.setResolved(0);
        escrow.settleDuel(id);

        (bool ok,) = address(escrow).call(
            abi.encodeWithSignature("settleDuel(uint256)", id)
        );
        assert(!ok);
    }
}