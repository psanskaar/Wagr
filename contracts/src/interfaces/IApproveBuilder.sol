// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  IApproveBuilder - the DreamDEX builder-code opt-in surface
/// @notice A user calls `approveBuilder(builder, maxFeeBpsTimes1k)` on a SpotPool
///         to allow a routing app (Wagr, in our case) to attach a per-order fee
///         when placing orders on the user's behalf. Passing 0 revokes.
///
///         The pool-wide cap is read from `getMaxBuilderFeeBpsTimes1k()` and is
///         100_000 (100 BPS = 1%) on mainnet and testnet as of Sep 2026.
///
///         DreamDEX docs:
///         https://docs.dreamdex.io/developers/contracts/functions#approvebuilder
interface IApproveBuilder {
    function approveBuilder(address builder, uint96 maxFeeBpsTimes1k) external;
    function getBuilderApproval(address user, address builder) external view returns (uint96);
    function getMaxBuilderFeeBpsTimes1k() external view returns (uint96);
}
