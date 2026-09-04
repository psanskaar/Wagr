// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  IBinaryMarket - minimal view surface of a DreamDEX BinaryMarket clone
/// @notice These are the on-chain getters materialized by the SDK's
///         `client.getMarketOnchain(marketId)` and by MarketOnchain.
///         Verified against the live Shannon testnet — the contract does NOT
///         expose winningOutcome(); the winning side is derived from
///         payoutNumerators(): whichever index is non-zero is the winner
///         (index 0 = YES, index 1 = NO).
///
/// @dev    LANDMINE: NEVER read payoutNumerators() without gating on
///         isResolved() == true first. Before resolution all numerators are 0,
///         which would incorrectly appear as a voided market.
interface IBinaryMarket {
    /// @notice One-hot payout vector. Length == number of outcomes (always 2).
    ///         payoutNumerators()[0] > 0  →  YES won
    ///         payoutNumerators()[1] > 0  →  NO  won
    ///         All zeros before resolution — always gate on isResolved() first.
    function payoutNumerators() external view returns (uint256[] memory);

    /// @notice True once the oracle has resolved this market to a concrete winner.
    function isResolved() external view returns (bool);

    /// @notice True once the oracle has voided this market (no winner).
    function isVoided() external view returns (bool);

    /// @notice MarketStatus enum: 0 Listed 1 Trading 2 Locked 3 Settling 4 Resolved 5 Voided
    function status() external view returns (uint8);

    /// @notice Trading-close / settlement timestamp (seconds).
    function expiry() external view returns (uint64);

    /// @notice ERC-6909 outcome-token ids on the shared outcome-token singleton.
    function yesId() external view returns (uint256);
    function noId() external view returns (uint256);

    /// @notice The ERC-20 collateral this market settles in.
    function collateral() external view returns (address);
}
