// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  ISomniaEventHandler - callback shape called by the Somnia reactivity precompile
/// @notice A contract subscribed via `@somnia-chain/reactivity` receives `onEvent`
///         from validators every time a matching log lands on chain.
/// @dev    Reference: https://prd.smk.somnia.host/docs/typescript/reactivity
interface ISomniaEventHandler {
    /// @param emitter The address that emitted the log matching the subscription filter.
    /// @param topics  The log's indexed topics (topic0 = event signature hash).
    /// @param data    The log's non-indexed data (abi-encoded).
    function onEvent(address emitter, bytes32[] calldata topics, bytes calldata data) external;
}
