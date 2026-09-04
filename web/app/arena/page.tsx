'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import {
    keccak256,
    encodeAbiParameters,
    parseAbiParameters,
    parseUnits,
    maxUint256,
    type Address,
} from 'viem';
import { Nav } from '@/components/Nav';
import { Confetti } from '@/components/Confetti';
import {
    WAGR_ESCROW,
    USDSO_TOKEN,
    escrowAbi,
    erc20Abi,
    publicClient,
    KNOWN_DREAMDEX_MARKETS,
    fmtUsd,
    shortAddr,
    shortHash,
    getExplorerAddressUrl,
    formatCountdown,
    sfx,
} from '@/lib/wagr';
import { useActiveMarkets } from '@/hooks/useActiveMarkets';
import {
    ShieldCheckIcon,
    ZapIcon,
    LockIcon,
    SparklesIcon,
    CoinsIcon,
    ExternalLinkIcon,
    CheckIcon,
    CopyIcon,
    ArrowRightIcon,
} from '@/components/Icons';

interface StoredCommitment {
    commitId: number;
    maker: Address;
    marketAddress: Address;
    marketSymbol: string;
    side: 0 | 1;
    stakeUsd: string;
    stakeBn: string; // serialized bigint string
    salt: `0x${string}`;
    commitHash: `0x${string}`;
    txHash?: string;
    createdAt: number;
    consumed?: boolean;
}

export default function ArenaPage() {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const { markets: liveMarkets } = useActiveMarkets();
    const [, setTick] = useState(0);

    // Re-render countdown every second
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(iv);
    }, []);

    const now = Math.floor(Date.now() / 1000);
    // Filter active markets
    const activeMarkets = (liveMarkets.length > 0 ? liveMarkets : KNOWN_DREAMDEX_MARKETS).filter(
        (m) => m.expiry > now
    );

    // Maker Commit Form
    const [market, setMarket] = useState<string>(
        activeMarkets[0]?.address || KNOWN_DREAMDEX_MARKETS[0].address
    );
    const [side, setSide] = useState<0 | 1>(0);
    const [stake, setStake] = useState('20');
    const [salt, setSalt] = useState<string>('');
    const [generatedCommitHash, setGeneratedCommitHash] = useState<string | null>(null);

    // Auto-select valid active market
    useEffect(() => {
        if (activeMarkets.length > 0) {
            const exists = activeMarkets.some(
                (m) => m.address.toLowerCase() === market.toLowerCase()
            );
            if (!exists) {
                setMarket(activeMarkets[0].address);
            }
        }
    }, [activeMarkets, market]);

    // TX state
    const [isCommitting, setIsCommitting] = useState(false);
    const [commitSuccess, setCommitSuccess] = useState<boolean>(false);
    const [createdCommitId, setCreatedCommitId] = useState<number | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [celebrate, setCelebrate] = useState(false);

    // Copied feedback
    const [copiedCommitId, setCopiedCommitId] = useState<number | null>(null);
    const [revealedSaltId, setRevealedSaltId] = useState<number | null>(null);

    // User's Stored Commitments
    const [myCommitments, setMyCommitments] = useState<StoredCommitment[]>([]);
    const [isLoadingPositions, setIsLoadingPositions] = useState(false);

    // Match & Reveal Form State (Taker flow)
    const [takerCommitId, setTakerCommitId] = useState('');
    const [takerMarket, setTakerMarket] = useState('');
    const [takerMakerSide, setTakerMakerSide] = useState<0 | 1>(0);
    const [takerStake, setTakerStake] = useState('');
    const [takerSalt, setTakerSalt] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    const [matchError, setMatchError] = useState<string | null>(null);
    const [matchedDuelId, setMatchedDuelId] = useState<number | null>(null);

    // Live allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    // Generate random 32-byte salt
    const generateNewSalt = () => {
        if (typeof window !== 'undefined') {
            const randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
            const hexSalt =
                '0x' +
                Array.from(randomBytes)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');
            setSalt(hexSalt);
        }
    };

    useEffect(() => {
        generateNewSalt();
    }, []);

    // Stake BigInt
    const stakeBn = (() => {
        try {
            return parseUnits(stake || '0', 6);
        } catch {
            return 0n;
        }
    })();

    const needsApproval =
        allowance !== undefined && stakeBn > 0n && (allowance as bigint) < stakeBn;

    // Calculate commit hash: keccak256(abi.encode(marketAddress, makerSide, stake, salt, maker))
    useEffect(() => {
        if (!address || !market || !salt || stakeBn <= 0n) return;
        try {
            const encoded = encodeAbiParameters(
                parseAbiParameters('address, uint8, uint128, bytes32, address'),
                [market as Address, side, stakeBn, salt as `0x${string}`, address as Address]
            );
            const h = keccak256(encoded);
            setGeneratedCommitHash(h);
        } catch {
            setGeneratedCommitHash(null);
        }
    }, [address, market, side, stakeBn, salt]);

    // Load & verify my commitments from localStorage and on-chain state
    const refreshMyCommitments = async () => {
        if (!address) return;
        const storageKey = `wagr_sealed_commits_${address.toLowerCase()}`;
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) {
                setMyCommitments([]);
                return;
            }
            const list: StoredCommitment[] = JSON.parse(raw);

            // Verify live on-chain status for each commitment
            const updated = await Promise.all(
                list.map(async (item) => {
                    try {
                        const onChain = (await publicClient.readContract({
                            address: WAGR_ESCROW,
                            abi: escrowAbi,
                            functionName: 'commits',
                            args: [BigInt(item.commitId)],
                        })) as [Address, bigint, number, boolean, bigint, `0x${string}`, Address];

                        return {
                            ...item,
                            consumed: onChain[3], // boolean consumed
                        };
                    } catch {
                        return item;
                    }
                })
            );

            setMyCommitments(updated);
            localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {
            console.warn('Failed to load commitments:', err);
        }
    };

    useEffect(() => {
        refreshMyCommitments();
        const interval = setInterval(refreshMyCommitments, 6000);
        return () => clearInterval(interval);
    }, [address]);

    async function handleApprove() {
        try {
            setErrorMsg(null);
            sfx.tap();
            await writeContractAsync({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'approve',
                args: [WAGR_ESCROW, maxUint256],
            });
            await refetchAllowance();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Approval rejected');
        }
    }

    async function handleCommit() {
        if (!generatedCommitHash || stakeBn <= 0n || !address) return;
        try {
            setErrorMsg(null);
            setIsCommitting(true);
            sfx.stake();

            // Read current nextCommitId before transaction to record accurately
            let anticipatedId = 1;
            try {
                const nextId = (await publicClient.readContract({
                    address: WAGR_ESCROW,
                    abi: escrowAbi,
                    functionName: 'nextCommitId',
                })) as bigint;
                anticipatedId = Number(nextId);
            } catch {}

            const txHash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'commit',
                args: [generatedCommitHash as `0x${string}`, stakeBn],
            });

            // Find current market info
            const currentM = activeMarkets.find((m) => m.address.toLowerCase() === market.toLowerCase());
            const marketSymbol = currentM ? currentM.symbol : 'DreamDEX-Market';

            // Store in user's commitments
            const newCommit: StoredCommitment = {
                commitId: anticipatedId,
                maker: address as Address,
                marketAddress: market as Address,
                marketSymbol,
                side,
                stakeUsd: stake,
                stakeBn: stakeBn.toString(),
                salt: salt as `0x${string}`,
                commitHash: generatedCommitHash as `0x${string}`,
                txHash,
                createdAt: Date.now(),
                consumed: false,
            };

            const storageKey = `wagr_sealed_commits_${address.toLowerCase()}`;
            const existingRaw = localStorage.getItem(storageKey);
            const existingList: StoredCommitment[] = existingRaw ? JSON.parse(existingRaw) : [];
            const updatedList = [newCommit, ...existingList];
            localStorage.setItem(storageKey, JSON.stringify(updatedList));
            setMyCommitments(updatedList);

            setCreatedCommitId(anticipatedId);
            setCommitSuccess(true);
            setCelebrate(true);
            sfx.win();

            // Generate fresh salt for next potential commit
            generateNewSalt();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Commit failed');
        } finally {
            setIsCommitting(false);
        }
    }

    // Match & Reveal handler for takers
    async function handleMatchAndReveal() {
        if (!address || !takerCommitId || !takerMarket || !takerSalt || !takerStake) return;
        try {
            setMatchError(null);
            setIsMatching(true);
            sfx.stake();

            const parsedStake = parseUnits(takerStake, 6);
            const takerSide = takerMakerSide === 0 ? 1 : 0;

            const txHash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'matchAndReveal',
                args: [
                    BigInt(takerCommitId),
                    takerMarket as Address,
                    takerMakerSide,
                    parsedStake,
                    takerSalt as `0x${string}`,
                    takerSide,
                    parsedStake,
                ],
            });

            sfx.win();
            setCelebrate(true);
            refreshMyCommitments();
        } catch (err: any) {
            console.error('Match failed:', err);
            setMatchError(err?.shortMessage || err?.message || 'Match and Reveal failed');
        } finally {
            setIsMatching(false);
        }
    }

    const copyCommitPayload = (c: StoredCommitment) => {
        sfx.tap();
        const payload = `WAGR ANTI-MEV CHALLENGE:\nCommit ID: #${c.commitId}\nMarket: ${c.marketAddress}\nMaker Side: ${c.side === 0 ? 'UP (YES)' : 'DOWN (NO)'}\nStake: ${c.stakeUsd} USDso\nSalt: ${c.salt}\nMatch URL: ${typeof window !== 'undefined' ? window.location.origin : 'https://wagr-app.vercel.app'}/arena`;
        navigator.clipboard.writeText(payload);
        setCopiedCommitId(c.commitId);
        setTimeout(() => setCopiedCommitId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <Confetti active={celebrate} />

            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Header */}
                    <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                            <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span>Anti-Front-Run Cryptographic Queue</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Anti-MEV Commit-Reveal Arena
                        </h1>
                        <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
                            On ultra-fast networks like Somnia, automated arbitrage bots copy-trade raw orders.
                            Wagr’s commit-reveal queue locks your wager into a sealed hash until matched, ensuring complete MEV protection.
                        </p>
                    </div>

                    {/* How it Works Diagram */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="clean-card rounded-xl p-5 space-y-2">
                            <div className="text-[11px] font-semibold text-brand uppercase tracking-wider">
                                Phase 1: Sealed Commitment
                            </div>
                            <h3 className="text-sm font-semibold text-white">Hash & Escrow</h3>
                            <p className="text-xs text-muted leading-relaxed">
                                Maker deposits stake into WagrEscrow with <code className="text-slate-300">commitHash = H(market, side, stake, salt, maker)</code>. Zero parameter leakage.
                            </p>
                        </div>

                        <div className="clean-card rounded-xl p-5 space-y-2">
                            <div className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
                                Phase 2: Atomic Match
                            </div>
                            <h3 className="text-sm font-semibold text-white">Reveal & Pair</h3>
                            <p className="text-xs text-muted leading-relaxed">
                                When a challenger accepts, the parameters and salt are revealed. The contract atomically verifies the hash and enforces opposite sides before creating the duel.
                            </p>
                        </div>

                        <div className="clean-card rounded-xl p-5 space-y-2">
                            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                                Phase 3: Zero-Click Settle
                            </div>
                            <h3 className="text-sm font-semibold text-white">Reactivity Settlement</h3>
                            <p className="text-xs text-muted leading-relaxed">
                                The paired duel inherits full Somnia Reactivity auto-settlement. The moment the oracle resolves, payout is routed directly to the winner with zero manual claim buttons.
                            </p>
                        </div>
                    </div>

                    {/* My Sealed Commitments (Open Positions) */}
                    <div className="clean-card rounded-2xl p-6 sm:p-7 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                <CoinsIcon className="w-4 h-4 text-brand-light" />
                                <span>My Sealed Positions ({myCommitments.length})</span>
                            </h2>
                            <button
                                onClick={refreshMyCommitments}
                                className="text-xs text-brand-light hover:text-white font-mono"
                            >
                                ↻ Refresh On-Chain State
                            </button>
                        </div>

                        {myCommitments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted space-y-1">
                                <div>No sealed commitments placed yet from this wallet.</div>
                                <div className="text-[11px]">Use the form below to lock a zero-MEV position in escrow.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {myCommitments.map((c) => (
                                    <div
                                        key={c.commitId}
                                        className="rounded-2xl bg-bg/80 border border-border p-5 space-y-3.5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-sm text-white">
                                                    Commit #{c.commitId}
                                                </span>
                                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-muted">
                                                    {c.marketSymbol}
                                                </span>
                                            </div>

                                            {/* Status Badge */}
                                            {c.consumed ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                                    <span>⚔️ Matched into Duel</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                    <span>🟢 Awaiting Taker in Escrow</span>
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                            <div className="p-2.5 rounded-xl bg-surface/50 border border-border/60">
                                                <span className="text-[10px] text-muted uppercase">Your Pick:</span>
                                                <div className={`font-bold mt-0.5 ${c.side === 0 ? 'text-up' : 'text-down'}`}>
                                                    {c.side === 0 ? '▲ UP (YES)' : '▼ DOWN (NO)'}
                                                </div>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-surface/50 border border-border/60">
                                                <span className="text-[10px] text-muted uppercase">Escrow Stake:</span>
                                                <div className="text-white font-bold mt-0.5">
                                                    {c.stakeUsd} USDso
                                                </div>
                                            </div>
                                        </div>

                                        {/* Secret Salt & Reveal Drawer */}
                                        <div className="rounded-xl bg-black/40 border border-border/60 p-3 text-[11px] font-mono space-y-1.5">
                                            <div className="flex items-center justify-between text-muted">
                                                <span>Secret Salt:</span>
                                                <button
                                                    onClick={() =>
                                                        setRevealedSaltId(revealedSaltId === c.commitId ? null : c.commitId)
                                                    }
                                                    className="text-brand-light hover:text-white underline text-[10px]"
                                                >
                                                    {revealedSaltId === c.commitId ? 'Hide' : 'Reveal'}
                                                </button>
                                            </div>
                                            <div className="truncate text-slate-300">
                                                {revealedSaltId === c.commitId ? c.salt : shortHash(c.salt)}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2 pt-1">
                                            <button
                                                onClick={() => copyCommitPayload(c)}
                                                className="flex-1 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                {copiedCommitId === c.commitId ? (
                                                    <>
                                                        <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                                                        <span>Copied Details!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CopyIcon className="w-3.5 h-3.5 text-muted" />
                                                        <span>Copy Match Payload</span>
                                                    </>
                                                )}
                                            </button>

                                            {c.txHash && (
                                                <a
                                                    href={getExplorerAddressUrl(c.txHash)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="p-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-muted hover:text-white"
                                                    title="View Commitment Tx"
                                                >
                                                    <ExternalLinkIcon className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Commit Creator Form (7 cols) */}
                        <div className="lg:col-span-7 clean-card rounded-2xl p-6 sm:p-7 space-y-5">
                            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                <ZapIcon className="w-4 h-4 text-brand-light" />
                                <span>Create a New Sealed Commitment</span>
                            </h2>

                            {/* Market selection */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
                                    1. Target Event Market
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {activeMarkets.length === 0 ? (
                                        <div className="col-span-1 sm:col-span-2 p-6 rounded-xl border border-border bg-bg/40 text-center space-y-2">
                                            <div className="w-5 h-5 rounded-full border-2 border-brand/30 border-t-brand animate-spin mx-auto" />
                                            <div className="text-xs text-muted">Scanning DreamDEX indexer for active windows…</div>
                                            <div className="text-[11px] text-muted-dark">New 1m, 5m, 15m windows spawn continuously</div>
                                        </div>
                                    ) : (
                                        activeMarkets.map((m) => {
                                            const isSelected = market.toLowerCase() === m.address.toLowerCase();
                                            return (
                                                <button
                                                    key={m.address}
                                                    type="button"
                                                    onClick={() => { sfx.tap(); setMarket(m.address); }}
                                                    className={`text-left p-3.5 rounded-xl border transition-all ${
                                                        isSelected
                                                            ? 'bg-brand/15 border-brand text-white shadow-brand-glow'
                                                            : 'bg-bg/60 border-border hover:border-border-glow text-muted'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="font-mono font-bold text-xs text-white truncate">
                                                            {m.symbol}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold flex items-center gap-1">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                                                <span>{formatCountdown(m.expiry)}</span>
                                                            </span>
                                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                                                                {m.timeframe}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[11px] text-muted mt-1.5 truncate">
                                                        {m.strikePrice ? `Strike: ${m.strikePrice}` : m.description}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Side */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                                    2. Sealed Prediction Side
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { sfx.tap(); setSide(0); }}
                                        className={`py-3.5 px-4 rounded-xl border text-center transition-all ${
                                            side === 0
                                                ? 'bg-up/15 border-up text-up font-bold shadow-up-glow'
                                                : 'bg-bg/60 border-border text-muted'
                                        }`}
                                    >
                                        ▲ UP (YES)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { sfx.tap(); setSide(1); }}
                                        className={`py-3.5 px-4 rounded-xl border text-center transition-all ${
                                            side === 1
                                                ? 'bg-down/15 border-down text-down font-bold shadow-down-glow'
                                                : 'bg-bg/60 border-border text-muted'
                                        }`}
                                    >
                                        ▼ DOWN (NO)
                                    </button>
                                </div>
                            </div>

                            {/* Stake */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                                    3. Stake (USDso)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={stake}
                                    onChange={(e) => setStake(e.target.value)}
                                    className="w-full rounded-xl bg-bg border border-border px-4 py-3 font-mono text-sm font-bold text-white focus:outline-none focus:border-brand"
                                />
                            </div>

                            {/* Generated Secret Salt & Hash */}
                            <div className="rounded-2xl bg-bg/60 border border-border/80 p-4 space-y-2 text-xs">
                                <div className="flex justify-between items-center text-muted">
                                    <span>Secret Salt (Stored Locally):</span>
                                    <span className="font-mono text-slate-300 truncate max-w-[240px]">
                                        {salt ? shortHash(salt) : 'Generating…'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-muted">
                                    <span>On-Chain Commitment Hash:</span>
                                    <span className="font-mono text-purple-300 font-semibold truncate max-w-[240px]">
                                        {generatedCommitHash ? shortHash(generatedCommitHash) : '—'}
                                    </span>
                                </div>
                            </div>

                            {errorMsg && (
                                <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-xs text-down">
                                    {errorMsg}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div>
                                {!isConnected ? (
                                    <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-center text-xs text-brand-light">
                                        Connect wallet to submit a sealed commitment.
                                    </div>
                                ) : needsApproval ? (
                                    <button
                                        onClick={handleApprove}
                                        className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-deep font-bold text-xs text-white shadow-brand-glow"
                                    >
                                        Approve USDso for Commitment
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCommit}
                                        disabled={isCommitting || !generatedCommitHash}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-brand hover:from-purple-700 hover:to-brand-deep font-bold text-xs text-white shadow-brand-glow disabled:opacity-40"
                                    >
                                        {isCommitting ? 'Submitting Commitment to Shannon…' : 'Submit Sealed Commitment'}
                                    </button>
                                )}
                            </div>

                            {commitSuccess && (
                                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-xs text-emerald-300 space-y-1">
                                    <div className="font-bold flex items-center gap-1.5">
                                        <CheckIcon className="w-4 h-4 text-emerald-400" />
                                        <span>Commitment #{createdCommitId} Placed Successfully!</span>
                                    </div>
                                    <div>
                                        Your stake is now in the WagrEscrow commit queue. View it above under <strong>My Sealed Positions</strong>.
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Match & Reveal Box (5 cols) */}
                        <div className="lg:col-span-5 clean-card rounded-2xl p-6 sm:p-7 space-y-4">
                            <div>
                                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                    <ShieldCheckIcon className="w-4 h-4 text-cyan-400" />
                                    <span>Match an Open Challenger</span>
                                </h3>
                                <p className="text-xs text-muted mt-1">
                                    Have a challenger&apos;s secret payload? Paste their Commit ID and parameters below to atomically match into a live duel.
                                </p>
                            </div>

                            <div className="space-y-3 pt-2">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                        Maker Commit ID
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 1"
                                        value={takerCommitId}
                                        onChange={(e) => setTakerCommitId(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                        Market Address
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="0x…"
                                        value={takerMarket}
                                        onChange={(e) => setTakerMarket(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                            Maker&apos;s Side
                                        </label>
                                        <select
                                            value={takerMakerSide}
                                            onChange={(e) => setTakerMakerSide(Number(e.target.value) as 0 | 1)}
                                            className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 text-xs text-white focus:outline-none"
                                        >
                                            <option value={0}>UP (YES)</option>
                                            <option value={1}>DOWN (NO)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                            Stake (USDso)
                                        </label>
                                        <input
                                            type="number"
                                            placeholder="20"
                                            value={takerStake}
                                            onChange={(e) => setTakerStake(e.target.value)}
                                            className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                        Maker&apos;s Revealed Salt
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="0x…"
                                        value={takerSalt}
                                        onChange={(e) => setTakerSalt(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                    />
                                </div>

                                {matchError && (
                                    <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-xs text-down">
                                        {matchError}
                                    </div>
                                )}

                                <button
                                    onClick={handleMatchAndReveal}
                                    disabled={isMatching || !takerCommitId || !takerMarket || !takerSalt || !takerStake}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-600 hover:to-teal-500 font-bold text-xs text-black transition-all disabled:opacity-40"
                                >
                                    {isMatching ? 'Matching & Revealing…' : 'Match & Reveal (Atomic Duel)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
