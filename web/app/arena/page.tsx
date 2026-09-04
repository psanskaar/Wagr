'use client';

import React, { useState, useEffect } from 'react';
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
} from '@/components/Icons';

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
    // Strictly filter out any markets whose window has expired
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
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Live allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    // Generate random 32-byte salt on mount
    useEffect(() => {
        const randomBytes = new Uint8Array(32);
        if (typeof window !== 'undefined') {
            window.crypto.getRandomValues(randomBytes);
            const hexSalt =
                '0x' +
                Array.from(randomBytes)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');
            setSalt(hexSalt);
        }
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
        if (!generatedCommitHash || stakeBn <= 0n) return;
        try {
            setErrorMsg(null);
            setIsCommitting(true);
            sfx.stake();
            await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'commit',
                args: [generatedCommitHash as `0x${string}`, stakeBn],
            });
            setCommitSuccess(true);
            sfx.win();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Commit failed');
        } finally {
            setIsCommitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-4xl mx-auto space-y-8">
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
                            On high-speed networks like Somnia with sub-second finality, bots can front-run raw prediction stakes.
                            Wagr’s commit-reveal queue conceals your market, side, and salt inside a cryptographic hash until atomically matched.
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
                                When a taker arrives, the parameters and salt are revealed. The contract atomically verifies the hash and enforces opposite sides before creating the duel.
                            </p>
                        </div>

                        <div className="clean-card rounded-xl p-5 space-y-2">
                            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                                Phase 3: Zero-Click Settle
                            </div>
                            <h3 className="text-sm font-semibold text-white">Reactivity Settlement</h3>
                            <p className="text-xs text-muted leading-relaxed">
                                The paired duel inherits full Somnia Reactivity auto-settlement. The block the oracle resolves, the winning wallet is credited instantly.
                            </p>
                        </div>
                    </div>

                    {/* Commit Creator Form */}
                    <div className="clean-card rounded-2xl p-6 sm:p-7 space-y-5">
                        <h2 className="text-base font-semibold text-white flex items-center gap-2">
                            <ZapIcon className="w-4 h-4 text-brand-light" />
                            <span>Create a Sealed Commitment</span>
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
                                <span>Secret Salt (Keep safe):</span>
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
                                    <span>Commitment Placed Successfully!</span>
                                </div>
                                <div>Your stake is now in the WagrEscrow commit queue with zero MEV exposure.</div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
