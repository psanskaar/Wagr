// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IBinaryMarket} from "../src/interfaces/IBinaryMarket.sol";

/// @notice Minimal on-chain double of a DreamDEX BinaryMarket clone.
///         Wired only for the fields WagrEscrow actually reads.
///         Verified against Shannon: the real contract exposes payoutNumerators()
///         not winningOutcome(). setResolved(outcome) builds the correct one-hot
///         payout vector: outcome=0 → [10_000_000, 0], outcome=1 → [0, 10_000_000].
contract MockBinaryMarket is IBinaryMarket {
    uint256[] private _payoutNums;
    bool      private _resolved;
    bool      private _voided;
    uint8     private _status;
    uint64    private _expiry;
    uint256   private _yesId;
    uint256   private _noId;
    address   private _collateral;

    constructor(address collateral_, uint64 expiry_) {
        _collateral = collateral_;
        _expiry     = expiry_;
        _status     = 1; // Trading
        _yesId      = 1;
        _noId       = 2;
    }

    // ── test helpers ──────────────────────────────────────────────────────────

    function setExpiry(uint64 e) external { _expiry = e; }

    /// @param outcome 0 = YES wins, 1 = NO wins
    function setResolved(uint8 outcome) external {
        delete _payoutNums;
        _payoutNums.push(outcome == 0 ? 10_000_000 : 0); // index 0 = YES
        _payoutNums.push(outcome == 1 ? 10_000_000 : 0); // index 1 = NO
        _resolved = true;
        _status   = 4; // Resolved
    }

    function setVoided() external {
        _voided   = true;
        _resolved = true;
        _status   = 5; // Voided
    }

    // ── IBinaryMarket ─────────────────────────────────────────────────────────

    function payoutNumerators() external view returns (uint256[] memory) { return _payoutNums; }
    function isResolved()       external view returns (bool)   { return _resolved; }
    function isVoided()         external view returns (bool)   { return _voided; }
    function status()           external view returns (uint8)  { return _status; }
    function expiry()           external view returns (uint64) { return _expiry; }
    function yesId()            external view returns (uint256){ return _yesId; }
    function noId()             external view returns (uint256){ return _noId; }
    function collateral()       external view returns (address){ return _collateral; }
}
