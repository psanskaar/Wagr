// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Clones}        from "@openzeppelin/contracts/proxy/Clones.sol";
import {WagrSplitter}  from "./WagrSplitter.sol";

/// @title  WagrSplitterFactory - CREATE2 clones of the WagrSplitter template
/// @notice A creator can deterministically compute their splitter address
///         before deploy — useful to embed in a streamer's page ahead of time.
contract WagrSplitterFactory {
    address public immutable implementation;

    event SplitterCreated(address indexed splitter, bytes32 indexed salt, address indexed creator);

    constructor() {
        implementation = address(new WagrSplitter());
    }

    function createSplitter(
        bytes32 salt,
        WagrSplitter.Recipient[] calldata recipients
    ) external returns (address splitter) {
        splitter = Clones.cloneDeterministic(implementation, salt);
        WagrSplitter(splitter).initialize(recipients);
        emit SplitterCreated(splitter, salt, msg.sender);
    }

    function predict(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }
}
