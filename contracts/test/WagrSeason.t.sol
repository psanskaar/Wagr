// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test}       from "forge-std/Test.sol";
import {WagrSeason} from "../src/WagrSeason.sol";
import {MockERC20}  from "./MockERC20.sol";

contract WagrSeasonTest is Test {
    MockERC20 usd;
    WagrSeason season;
    address op    = address(0x0D);
    address a     = address(0xA);
    address b     = address(0xB);
    address c     = address(0xC);

    function setUp() public {
        usd = new MockERC20("USDso","USDso",6);
        season = new WagrSeason(usd);
        usd.mint(a, 1_000e6); usd.mint(b, 1_000e6); usd.mint(c, 1_000e6);
        vm.prank(a); usd.approve(address(season), type(uint256).max);
        vm.prank(b); usd.approve(address(season), type(uint256).max);
        vm.prank(c); usd.approve(address(season), type(uint256).max);
    }

    function _leaf(uint256 index, address who, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, who, amount))));
    }

    function testMerkleClaimHappyPath() public {
        vm.prank(op); uint256 sid = season.createSeason(100e6);
        vm.prank(a); season.joinSeason(sid, 100e6);
        vm.prank(b); season.joinSeason(sid, 100e6);
        vm.prank(c); season.joinSeason(sid, 100e6);

        // Winners: A 200, C 100, pool 300 total
        bytes32 la = _leaf(0, a, 200e6);
        bytes32 lc = _leaf(1, c, 100e6);
        // Simple 2-leaf tree
        bytes32 root = la < lc
            ? keccak256(abi.encodePacked(la, lc))
            : keccak256(abi.encodePacked(lc, la));

        vm.prank(op); season.commitSeasonPayouts(sid, root, 300e6);

        bytes32[] memory proofA = new bytes32[](1); proofA[0] = lc;
        bytes32[] memory proofC = new bytes32[](1); proofC[0] = la;

        uint256 aBefore = usd.balanceOf(a);
        season.claim(sid, 0, a, 200e6, proofA);
        assertEq(usd.balanceOf(a) - aBefore, 200e6);

        uint256 cBefore = usd.balanceOf(c);
        season.claim(sid, 1, c, 100e6, proofC);
        assertEq(usd.balanceOf(c) - cBefore, 100e6);
    }

    function testDoubleClaimReverts() public {
        vm.prank(op); uint256 sid = season.createSeason(100e6);
        vm.prank(a); season.joinSeason(sid, 100e6);

        bytes32 leaf = _leaf(0, a, 100e6);
        vm.prank(op); season.commitSeasonPayouts(sid, leaf, 100e6);
        bytes32[] memory proof = new bytes32[](0);
        season.claim(sid, 0, a, 100e6, proof);
        vm.expectRevert(WagrSeason.AlreadyClaimed.selector);
        season.claim(sid, 0, a, 100e6, proof);
    }

    function testBadProofReverts() public {
        vm.prank(op); uint256 sid = season.createSeason(100e6);
        vm.prank(a); season.joinSeason(sid, 100e6);
        bytes32 leaf = _leaf(0, a, 100e6);
        vm.prank(op); season.commitSeasonPayouts(sid, leaf, 100e6);
        bytes32[] memory proof = new bytes32[](1); proof[0] = bytes32(uint256(1));
        vm.expectRevert(WagrSeason.BadProof.selector);
        season.claim(sid, 0, a, 100e6, proof);
    }
}
