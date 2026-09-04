// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test}                 from "forge-std/Test.sol";
import {WagrSplitter}         from "../src/WagrSplitter.sol";
import {WagrSplitterFactory}  from "../src/WagrSplitterFactory.sol";
import {MockERC20}            from "./MockERC20.sol";

contract WagrSplitterTest is Test {
    MockERC20 usd;
    WagrSplitterFactory factory;

    address creator  = address(0xC1);
    address platform = address(0xA1);
    address charity  = address(0xC4);

    function setUp() public {
        usd = new MockERC20("USDso","USDso",6);
        factory = new WagrSplitterFactory();
    }

    function testCreateAndSplit() public {
        WagrSplitter.Recipient[] memory rs = new WagrSplitter.Recipient[](3);
        rs[0] = WagrSplitter.Recipient(creator,  7_000); // 70%
        rs[1] = WagrSplitter.Recipient(platform, 2_500); // 25%
        rs[2] = WagrSplitter.Recipient(charity,    500); //  5%

        bytes32 salt = keccak256("streamer1");
        address predicted = factory.predict(salt);
        address splitter  = factory.createSplitter(salt, rs);
        assertEq(splitter, predicted);

        // Simulate DreamDEX paying 1,000 USDso in builder fees to the splitter.
        usd.mint(splitter, 1_000e6);

        vm.prank(creator);  uint256 c = WagrSplitter(splitter).claim(address(usd));
        vm.prank(platform); uint256 p = WagrSplitter(splitter).claim(address(usd));
        vm.prank(charity);  uint256 h = WagrSplitter(splitter).claim(address(usd));

        assertEq(c, 700e6);
        assertEq(p, 250e6);
        assertEq(h,  50e6);
        assertEq(c + p + h, 1_000e6);
    }

    function testRejectsBadShares() public {
        WagrSplitter.Recipient[] memory rs = new WagrSplitter.Recipient[](2);
        rs[0] = WagrSplitter.Recipient(creator,  6_000);
        rs[1] = WagrSplitter.Recipient(platform, 3_000);
        bytes32 salt = keccak256("bad");
        vm.expectRevert(WagrSplitter.BadShares.selector);
        factory.createSplitter(salt, rs);
    }
}
