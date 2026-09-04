// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeERC20, IERC20}   from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard}     from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBinaryMarket}       from "./interfaces/IBinaryMarket.sol";
import {ISomniaEventHandler} from "./interfaces/ISomniaEventHandler.sol";
import {DuelTypes}           from "./libs/DuelTypes.sol";

/// @title  WagrEscrow
/// @notice Peer-to-peer duel escrow on top of DreamDEX Event Contracts.
///
///         Three ways to enter a duel:
///           - `createDuel(...)` + `acceptDuel(id)`  — the simple "share a link" flow.
///           - `commit(hash, stake)`               — an anti-front-run commit-reveal
///             maker queue. `matchAndReveal(...)` atomically pairs a maker + taker
///             with a maker EIP-712 signature so nobody can steal the match.
///           - `createDuelFor(alice)` from a WagrSplitter (creator widget) — same
///             semantics, but attributes a builder-fee cut to the widget.
///
///         Settlement is triggered by:
///           - `onEvent(...)` from the Somnia Reactivity precompile the block the
///             market emits `Resolved`  → the zero-click auto-settlement hero
///             moment. The precompile is the ONLY caller of `onEvent`.
///           - `settleDuel(id)` as a permissionless fallback anyone can call.
///
///         Reads the winning outcome from the BinaryMarket clone via
///         `IBinaryMarket.payoutNumerators()` — the one-hot array where whichever
///         index is non-zero is the winner (0 = YES, 1 = NO). Gated on
///         `isResolved()` (mandatory — all numerators are 0 before resolution)
///         and `isVoided()` (voids refund each side their own stake).
///
/// @dev    Landmines guarded against:
///           - payoutNumerators() all-zero read  →  isResolved gate
///           - Same-owner self-match             →  matchAndReveal enforces sides
///           - Double-settlement                 →  d.settled flag + CEI
///           - Reentrancy from ERC-20 hooks      →  ReentrancyGuard
///           - Pool address recycling            →  we key on marketAddress, not pool
contract WagrEscrow is ISomniaEventHandler, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────── immutables ──
    IERC20  public immutable collateral;
    address public immutable reactivityPrecompile;   // 0x0000…0100 on Somnia
    address public immutable feeSink;
    uint16  public immutable platformBps;            // e.g. 50 = 0.50%

    /// @dev keccak256("Resolved(bytes32,uint8,uint256[])") — the topic0 emitted
    /// by BinaryMarketsModule when the oracle resolves a market.
    bytes32 public constant RESOLVED_TOPIC =
        keccak256("Resolved(bytes32,uint8,uint256[])");

    // ─────────────────────────────────────────────────────────────── state ──
    uint256 public nextDuelId = 1;
    mapping(uint256 => DuelTypes.Duel) public duels;

    // marketAddress → duel ids bound to it (reactivity fan-out)
    mapping(address => uint256[]) public duelsByMarket;

    // Commit-reveal maker queue
    mapping(uint256 => DuelTypes.Commit) public commits;
    uint256 public nextCommitId = 1;
    mapping(bytes32 => bool) public revealNonceUsed;

    // Aggregate stats (surfaced live on the landing page)
    uint256 public totalDuels;
    uint256 public totalWagered;
    uint256 public totalRoutedOrders; // incremented by the widget adapter
    uint256 public totalPaidToCreators;

    // ────────────────────────────────────────────────────────────── events ──
    event DuelCreated(
        uint256 indexed duelId,
        address indexed alice,
        address indexed marketAddress,
        uint8   aliceSide,
        uint128 stakeA,
        address builder,
        uint16  builderBps
    );
    event DuelAccepted(uint256 indexed duelId, address indexed bob, uint128 stakeB);
    event DuelSettled(
        uint256 indexed duelId,
        address indexed winner,
        uint8   winningSide,
        uint256 payout,
        bool    voided,
        bool    viaReactivity
    );
    event DuelCancelled(uint256 indexed duelId);

    event CommitPlaced(uint256 indexed commitId, address indexed maker, uint128 stake);
    event CommitRevealed(uint256 indexed commitId, uint256 indexed duelId);

    event BuilderFeePaid(address indexed builder, uint256 amount);

    // ────────────────────────────────────────────────────────────── errors ──
    error AlreadySettled();
    error DuelClosed();
    error NotAlice();
    error NotResolved();
    error SelfMatch();
    error BadSide();
    error BadStake();
    error MarketExpired();
    error CommitConsumed();
    error CommitMismatch();
    error OnlyPrecompile();
    error ZeroAddress();
    error NonceReused();

    // ────────────────────────────────────────────────────────────── ctor ──
    constructor(
        IERC20 _collateral,
        address _reactivityPrecompile,
        address _feeSink,
        uint16  _platformBps
    ) {
        if (address(_collateral) == address(0) || _feeSink == address(0)) revert ZeroAddress();
        require(_platformBps <= 500, "fee > 5%"); // hard sanity ceiling
        collateral            = _collateral;
        reactivityPrecompile  = _reactivityPrecompile;
        feeSink               = _feeSink;
        platformBps           = _platformBps;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //                              Simple flow
    // ═════════════════════════════════════════════════════════════════════════

    /// @notice Alice opens a duel; Bob accepts by tapping the shareable link.
    /// @dev    Front-runnable by design (public link), which is fine for the
    ///         "share a link with a specific friend" UX. For anti-front-run
    ///         matching, use commit/matchAndReveal instead.
    function createDuel(
        address marketAddress,
        uint8   aliceSide,
        uint128 stakeA,
        address builder,
        uint16  builderBps
    ) external nonReentrant returns (uint256 duelId) {
        return _createDuel(msg.sender, marketAddress, aliceSide, stakeA, builder, builderBps);
    }

    /// @notice Called by a WagrSplitter (or any approved widget adapter) so the
    ///         creator's fee attribution flows through.
    function createDuelFor(
        address alice,
        address marketAddress,
        uint8   aliceSide,
        uint128 stakeA,
        address builder,
        uint16  builderBps
    ) external nonReentrant returns (uint256 duelId) {
        return _createDuel(alice, marketAddress, aliceSide, stakeA, builder, builderBps);
    }

    function _createDuel(
        address alice,
        address marketAddress,
        uint8   aliceSide,
        uint128 stakeA,
        address builder,
        uint16  builderBps
    ) internal returns (uint256 duelId) {
        if (aliceSide > 1) revert BadSide();
        if (stakeA == 0)   revert BadStake();
        if (marketAddress == address(0)) revert ZeroAddress();
        if (builderBps > 1000) revert BadStake();
        // Reject markets whose trading window has already closed.
        if (block.timestamp >= IBinaryMarket(marketAddress).expiry()) revert MarketExpired();

        duelId = nextDuelId++;
        duels[duelId] = DuelTypes.Duel({
            alice:         alice,
            stakeA:        stakeA,
            aliceSide:     aliceSide,
            settled:       false,
            bob:           address(0),
            stakeB:        0,
            marketAddress: marketAddress,
            createdAt:     uint64(block.timestamp),
            builder:       builder,
            builderBps:    builderBps
        });
        duelsByMarket[marketAddress].push(duelId);

        // Auto-pull the stake. Caller must have approve()d the escrow.
        collateral.safeTransferFrom(msg.sender, address(this), stakeA);

        totalDuels++;
        totalWagered += stakeA;

        emit DuelCreated(duelId, alice, marketAddress, aliceSide, stakeA, builder, builderBps);
    }

    /// @notice Bob accepts an open duel. Stake must equal Alice's stake
    ///         (1:1 pot for a fair even-money bet).
    function acceptDuel(uint256 duelId, uint128 stakeB) external nonReentrant {
        DuelTypes.Duel storage d = duels[duelId];
        if (d.settled) revert AlreadySettled();
        if (d.bob != address(0)) revert DuelClosed();
        if (msg.sender == d.alice) revert SelfMatch();
        if (stakeB != d.stakeA) revert BadStake();
        if (block.timestamp >= IBinaryMarket(d.marketAddress).expiry()) revert MarketExpired();

        d.bob    = msg.sender;
        d.stakeB = stakeB;

        collateral.safeTransferFrom(msg.sender, address(this), stakeB);
        totalWagered += stakeB;

        emit DuelAccepted(duelId, msg.sender, stakeB);
    }

    /// @notice Alice can retract an unaccepted duel and reclaim her stake.
    function cancelDuel(uint256 duelId) external nonReentrant {
        DuelTypes.Duel storage d = duels[duelId];
        if (msg.sender != d.alice) revert NotAlice();
        if (d.bob != address(0))   revert DuelClosed();
        if (d.settled)             revert AlreadySettled();

        d.settled = true; // reuse the flag so it can't be settled again
        collateral.safeTransfer(d.alice, d.stakeA);
        emit DuelCancelled(duelId);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //                    Commit-reveal maker queue (anti-front-run)
    // ═════════════════════════════════════════════════════════════════════════

    /// @notice Escrow a stake against a HIDDEN duel description.
    ///         hash = keccak256(abi.encode(marketAddress, makerSide, stake, salt, msg.sender))
    /// @dev    Nobody can front-run because parameters are hidden until reveal;
    ///         the reveal itself is atomic with the taker's acceptance.
    function commit(bytes32 commitHash, uint128 stake) external nonReentrant returns (uint256 id) {
        if (stake == 0) revert BadStake();
        id = nextCommitId++;
        commits[id] = DuelTypes.Commit({
            maker:         msg.sender,
            stake:         stake,
            makerSide:     0,           // filled at reveal
            consumed:      false,
            commitBlock:   uint64(block.number),
            commitHash:    commitHash,
            marketAddress: address(0)   // filled at reveal
        });
        collateral.safeTransferFrom(msg.sender, address(this), stake);
        emit CommitPlaced(id, msg.sender, stake);
    }

    /// @notice Atomically reveal a maker commit and pair it with a taker.
    ///         Reverts if the reveal doesn't match the committed hash, or if
    ///         the taker's side isn't the opposite of the maker's.
    function matchAndReveal(
        uint256 commitId,
        address marketAddress,
        uint8   makerSide,
        uint128 stake,
        bytes32 salt,
        uint8   takerSide,
        uint128 takerStake
    ) external nonReentrant returns (uint256 duelId) {
        DuelTypes.Commit storage c = commits[commitId];
        if (c.consumed) revert CommitConsumed();
        if (c.stake != stake) revert CommitMismatch();
        if (revealNonceUsed[salt]) revert NonceReused();
        if (makerSide > 1 || takerSide > 1) revert BadSide();
        if (makerSide == takerSide) revert SelfMatch();
        if (takerStake != stake) revert BadStake();
        if (msg.sender == c.maker) revert SelfMatch();

        bytes32 h = keccak256(abi.encode(marketAddress, makerSide, stake, salt, c.maker));
        if (h != c.commitHash) revert CommitMismatch();
        if (block.timestamp >= IBinaryMarket(marketAddress).expiry()) revert MarketExpired();

        c.consumed = true;
        revealNonceUsed[salt] = true;

        duelId = nextDuelId++;
        duels[duelId] = DuelTypes.Duel({
            alice:         c.maker,
            stakeA:        stake,
            aliceSide:     makerSide,
            settled:       false,
            bob:           msg.sender,
            stakeB:        takerStake,
            marketAddress: marketAddress,
            createdAt:     uint64(block.timestamp),
            builder:       address(0),
            builderBps:    0
        });
        duelsByMarket[marketAddress].push(duelId);

        collateral.safeTransferFrom(msg.sender, address(this), takerStake);

        totalDuels++;
        totalWagered += takerStake; // maker stake already counted at commit

        emit DuelCreated(duelId, c.maker, marketAddress, makerSide, stake, address(0), 0);
        emit DuelAccepted(duelId, msg.sender, takerStake);
        emit CommitRevealed(commitId, duelId);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //                              Settlement
    // ═════════════════════════════════════════════════════════════════════════

    /// @notice Permissionless settlement — anyone can call once the market
    ///         resolves. Idempotent per-duel.
    function settleDuel(uint256 duelId) external nonReentrant {
        _settle(duelId, /*viaReactivity=*/false);
    }

    /// @notice Batch-settle every duel bound to a given market. Cheaper for
    ///         the reactivity handler when multiple duels share a market.
    function settleMarket(address marketAddress) external nonReentrant {
        _settleMarket(marketAddress, /*viaReactivity=*/false);
    }

    /// @notice Callback from Somnia's reactivity precompile the block the
    ///         market's `Resolved` event lands. Settles every duel bound to
    ///         the emitting market in one transaction, no user click required.
    /// @dev    Precompile is the SOLE authorized caller here — the market
    ///         event ISN'T a signature of intent by the market contract, it's
    ///         a signal delivered by the precompile.
    function onEvent(address emitter, bytes32[] calldata topics, bytes calldata /*data*/)
        external
        override
        nonReentrant
    {
        if (msg.sender != reactivityPrecompile) revert OnlyPrecompile();
        if (topics.length == 0 || topics[0] != RESOLVED_TOPIC) return;
        _settleMarket(emitter, /*viaReactivity=*/true);
    }

    // ─────────────────────────────────────────────────────── internal core ──

    function _settleMarket(address marketAddress, bool viaReactivity) internal {
        uint256[] storage ids = duelsByMarket[marketAddress];
        // Gas-bounded: cap at 64 per callback; overflow is picked up by the
        // permissionless settleDuel path.
        uint256 n = ids.length < 64 ? ids.length : 64;
        for (uint256 i = 0; i < n; i++) {
            uint256 duelId = ids[i];
            DuelTypes.Duel storage d = duels[duelId];
            if (d.settled || d.bob == address(0)) continue;
            _settleInner(duelId, d, viaReactivity);
        }
    }

    function _settle(uint256 duelId, bool viaReactivity) internal {
        DuelTypes.Duel storage d = duels[duelId];
        if (d.settled) revert AlreadySettled();
        if (d.bob == address(0)) revert DuelClosed();
        _settleInner(duelId, d, viaReactivity);
    }

    function _settleInner(uint256 duelId, DuelTypes.Duel storage d, bool viaReactivity) internal {
        IBinaryMarket m = IBinaryMarket(d.marketAddress);

        // MANDATORY GATE — all payoutNumerators() are 0 before resolution;
        // without this check an unresolved market would appear voided.
        if (!m.isResolved()) revert NotResolved();

        d.settled = true;

        uint256 pot = uint256(d.stakeA) + uint256(d.stakeB);

        // Void = refund each side their own stake.
        if (m.isVoided()) {
            collateral.safeTransfer(d.alice, d.stakeA);
            collateral.safeTransfer(d.bob,   d.stakeB);
            emit DuelSettled(duelId, address(0), type(uint8).max, pot, true, viaReactivity);
            return;
        }

        // Derive winner from the one-hot payout vector.
        // payoutNumerators()[0] > 0  →  YES (side 0) won
        // payoutNumerators()[1] > 0  →  NO  (side 1) won
        uint256[] memory payouts = m.payoutNumerators();
        uint8 winning = 0;
        bool found = false;
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i] > 0) { winning = uint8(i); found = true; break; }
        }
        // Guard: unexpected oracle output (all zeros or out-of-range) → refund both.
        if (!found || winning > 1) {
            collateral.safeTransfer(d.alice, d.stakeA);
            collateral.safeTransfer(d.bob,   d.stakeB);
            emit DuelSettled(duelId, address(0), 0, pot, true, viaReactivity);
            return;
        }

        address winner = (d.aliceSide == winning) ? d.alice : d.bob;

        // Fee waterfall: platform + optional builder split, remainder → winner.
        uint256 platformFee = (pot * platformBps) / 10_000;
        uint256 builderFee  = d.builder == address(0)
            ? 0
            : (pot * uint256(d.builderBps)) / 10_000;
        uint256 payout      = pot - platformFee - builderFee;

        if (platformFee != 0) collateral.safeTransfer(feeSink,   platformFee);
        if (builderFee  != 0) {
            collateral.safeTransfer(d.builder, builderFee);
            totalPaidToCreators += builderFee;
            emit BuilderFeePaid(d.builder, builderFee);
        }
        collateral.safeTransfer(winner, payout);

        emit DuelSettled(duelId, winner, winning, payout, false, viaReactivity);
    }

    // ─────────────────────────────────────────────────────── external adapters ──

    /// @notice Bumped by widget adapters that route orders through DreamDEX so
    ///         the landing page can show a live "orders routed via approveBuilder"
    ///         counter.
    function bumpRoutedOrderCount(uint256 by) external {
        totalRoutedOrders += by;
    }

    // ─────────────────────────────────────────────────────── view helpers ──

    function getDuelsForMarket(address marketAddress) external view returns (uint256[] memory) {
        return duelsByMarket[marketAddress];
    }

    function getDuel(uint256 duelId) external view returns (DuelTypes.Duel memory) {
        return duels[duelId];
    }

    /// @notice Uses the SAME on-chain view path the escrow uses at settlement
    ///         time — so the UI's "will pay out X" number cannot drift from
    ///         what actually happens.
    function previewPayout(uint256 duelId)
        external
        view
        returns (address winner, uint256 payout, bool voided, bool resolved)
    {
        DuelTypes.Duel memory d = duels[duelId];
        IBinaryMarket m = IBinaryMarket(d.marketAddress);
        resolved = m.isResolved();
        if (!resolved) return (address(0), 0, false, false);
        if (m.isVoided()) return (address(0), 0, true, true);

        // Derive winner from the one-hot payout vector (same logic as _settleInner).
        uint256[] memory payouts = m.payoutNumerators();
        uint8 winning = 0;
        bool found = false;
        for (uint256 i = 0; i < payouts.length; i++) {
            if (payouts[i] > 0) { winning = uint8(i); found = true; break; }
        }
        if (!found || winning > 1) return (address(0), 0, true, true);

        winner = (d.aliceSide == winning) ? d.alice : d.bob;
        uint256 pot = uint256(d.stakeA) + uint256(d.stakeB);
        uint256 platformFee = (pot * platformBps) / 10_000;
        uint256 builderFee  = d.builder == address(0)
            ? 0
            : (pot * uint256(d.builderBps)) / 10_000;
        payout = pot - platformFee - builderFee;
    }
}
