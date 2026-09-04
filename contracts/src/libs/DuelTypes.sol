// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  DuelTypes - packed structs shared across Wagr contracts
library DuelTypes {
    /// @dev A live P2P duel. Fits in 4 storage slots.
    struct Duel {
        address alice;           // maker
        uint128 stakeA;
        uint8   aliceSide;       // 0 YES | 1 NO
        bool    settled;
        // slot 2
        address bob;             // taker (address(0) until accepted)
        uint128 stakeB;
        // slot 3
        address marketAddress;   // IBinaryMarket clone
        uint64  createdAt;       // block.timestamp when the commit landed
        // slot 4
        address builder;         // creator's WagrSplitter clone (address(0) for none)
        uint16  builderBps;      // 0..1000 (10 = 0.10%)
    }

    /// @dev A one-sided commitment awaiting a matching taker.
    struct Commit {
        address maker;
        uint128 stake;
        uint8   makerSide;       // 0 YES | 1 NO
        bool    consumed;
        uint64  commitBlock;
        bytes32 commitHash;      // keccak256(marketAddress ‖ makerSide ‖ stake ‖ salt ‖ maker)
        address marketAddress;
    }

    /// @dev Season row for the Merkle-root leaderboard.
    struct Season {
        address operator;        // whoever spun up the season
        address collateral;      // per-season collateral token
        uint128 pool;            // total collateral currently escrowed
        uint64  startedAt;
        uint64  closedAt;
        bytes32 payoutRoot;      // set when the season is finalized
    }
}
