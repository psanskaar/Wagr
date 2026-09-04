// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeERC20, IERC20}       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof}             from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {BitMaps}                 from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import {ReentrancyGuard}         from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  WagrSeason - constant-cost N-way payouts for leaderboard seasons
/// @notice A season is a fixed-duration multi-round competition (any group can
///         run one). Members ante an entry fee; each round is a DreamDEX event
///         contract; PnL rolls up to a leaderboard; the season closes with ONE
///         `commitSeasonPayouts(root)` tx, and winners `claim` permissionlessly
///         with a Merkle proof (using BitMaps to prevent double-claim in ~O(1)
///         gas).
///
///         Why Merkle: the naive `for (winner in winners) transfer(...)` is
///         O(N) gas and DoS-able by one recipient with a reverting receive().
///         With Merkle+pull, arbitrary-size winner lists settle atomically.
contract WagrSeason is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using BitMaps for BitMaps.BitMap;

    IERC20 public immutable collateral;

    struct Season {
        address operator;
        uint128 pool;
        uint64  startedAt;
        uint64  closedAt;
        uint128 entryFee;
        bytes32 payoutRoot; // set by commitSeasonPayouts; bytes32(0) = still open
    }

    mapping(uint256 => Season)             public seasons;
    mapping(uint256 => BitMaps.BitMap)     private claimed;
    mapping(uint256 => mapping(address => bool)) public entered;

    uint256 public nextSeasonId = 1;

    // Aggregate for the live counter
    uint256 public totalPaidOut;

    // ─── events ──────────────────────────────────────────────────────────────
    event SeasonCreated(uint256 indexed seasonId, address indexed operator, uint128 entryFee);
    event SeasonJoined(uint256 indexed seasonId, address indexed member, uint128 fee);
    event SeasonPayoutsCommitted(uint256 indexed seasonId, bytes32 payoutRoot, uint128 totalPool);
    event SeasonClaim(uint256 indexed seasonId, uint256 indexed index, address account, uint256 amount);

    // ─── errors ──────────────────────────────────────────────────────────────
    error NotOperator();
    error AlreadyClosed();
    error NotClosed();
    error AlreadyEntered();
    error EntryFeeMismatch();
    error BadProof();
    error AlreadyClaimed();

    constructor(IERC20 _collateral) { collateral = _collateral; }

    function createSeason(uint128 entryFee) external returns (uint256 seasonId) {
        seasonId = nextSeasonId++;
        seasons[seasonId] = Season({
            operator:  msg.sender,
            pool:      0,
            startedAt: uint64(block.timestamp),
            closedAt:  0,
            entryFee:  entryFee,
            payoutRoot:bytes32(0)
        });
        emit SeasonCreated(seasonId, msg.sender, entryFee);
    }

    function joinSeason(uint256 seasonId, uint128 fee) external nonReentrant {
        Season storage s = seasons[seasonId];
        if (s.payoutRoot != bytes32(0)) revert AlreadyClosed();
        if (fee != s.entryFee)          revert EntryFeeMismatch();
        if (entered[seasonId][msg.sender]) revert AlreadyEntered();

        entered[seasonId][msg.sender] = true;
        s.pool += fee;
        collateral.safeTransferFrom(msg.sender, address(this), fee);
        emit SeasonJoined(seasonId, msg.sender, fee);
    }

    /// @notice Operator finalizes the season by publishing a Merkle root over
    ///         `(index, account, amount)` leaves. Must be equal to or less
    ///         than the season pool — the operator cannot inflate payouts.
    function commitSeasonPayouts(uint256 seasonId, bytes32 root, uint128 totalPool)
        external
    {
        Season storage s = seasons[seasonId];
        if (msg.sender != s.operator) revert NotOperator();
        if (s.payoutRoot != bytes32(0)) revert AlreadyClosed();
        require(totalPool <= s.pool, "over-pool");
        s.payoutRoot = root;
        s.closedAt   = uint64(block.timestamp);
        emit SeasonPayoutsCommitted(seasonId, root, totalPool);
    }

    /// @notice Anyone with a valid proof can claim their share of the season.
    function claim(
        uint256 seasonId,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant {
        Season storage s = seasons[seasonId];
        if (s.payoutRoot == bytes32(0)) revert NotClosed();
        if (claimed[seasonId].get(index)) revert AlreadyClaimed();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
        if (!MerkleProof.verify(proof, s.payoutRoot, leaf)) revert BadProof();

        claimed[seasonId].set(index);
        totalPaidOut += amount;
        collateral.safeTransfer(account, amount);
        emit SeasonClaim(seasonId, index, account, amount);
    }

    function isClaimed(uint256 seasonId, uint256 index) external view returns (bool) {
        return claimed[seasonId].get(index);
    }
}
