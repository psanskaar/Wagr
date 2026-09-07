'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { Nav } from '@/components/Nav';
import {
    WAGR_SEASON,
    seasonAbi,
    publicClient,
    fmtUsd,
    shortAddr,
    getExplorerAddressUrl,
    sfx,
    fetchSeasonEntrants,
    DEFAULT_TOURNAMENTS_META,
    type TournamentMetadata,
} from '@/lib/wagr';
import {
    TrophyIcon,
    UsersIcon,
    ZapIcon,
    ArrowRightIcon,
    ClockIcon,
    CoinsIcon,
    SparklesIcon,
} from '@/components/Icons';

interface OnChainSeason {
    id: bigint;
    operator: string;
    pool: bigint;
    startedAt: bigint;
    closedAt: bigint;
    entryFee: bigint;
    payoutRoot: string;
    entrantCount: number;
}

function formatCountdown(targetMs: number): string {
    const diff = targetMs - Date.now();
    if (diff <= 0) return 'Ended';
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    if (d > 0) return `${d}d ${h}h remaining`;
    if (h > 0) return `${h}h ${m}m remaining`;
    return `${m}m remaining`;
}

export default function SeasonListPage() {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [seasons, setSeasons] = useState<OnChainSeason[]>([]);
    const [metadataMap, setMetadataMap] = useState<Record<number, TournamentMetadata>>(DEFAULT_TOURNAMENTS_META);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Form inputs
    const [nameInput, setNameInput] = useState('DreamDEX Speed Duel Cup');
    const [descInput, setDescInput] = useState('Multi-round prediction tournament on Somnia Shannon testnet. Compete for the pool across live DreamDEX binary windows.');
    const [entryFeeInput, setEntryFeeInput] = useState('50');
    const [durationHours, setDurationHours] = useState(48);
    const [targetMarketInput, setTargetMarketInput] = useState('BTC & ETH 15m Markets');
    const [payoutDateInput, setPayoutDateInput] = useState('');

    // Update default payout date when duration changes
    useEffect(() => {
        const future = new Date(Date.now() + durationHours * 3600 * 1000 + 2 * 3600 * 1000);
        setPayoutDateInput(future.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' (At Close)');
    }, [durationHours]);

    // Load tournament metadata from API + local storage
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await fetch('/api/tournaments');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.tournaments) {
                        setMetadataMap((prev) => ({
                            ...DEFAULT_TOURNAMENTS_META,
                            ...prev,
                            ...data.tournaments,
                        }));
                    }
                }
            } catch (e) {
                console.warn('Could not load /api/tournaments, using defaults:', e);
            }
        }
        loadMeta();
    }, []);

    // Load on-chain seasons and entrant counts
    useEffect(() => {
        let active = true;

        async function fetchSeasons() {
            try {
                const nextId = (await publicClient.readContract({
                    address: WAGR_SEASON,
                    abi: seasonAbi,
                    functionName: 'nextSeasonId',
                })) as bigint;

                const loaded: OnChainSeason[] = [];
                for (let i = 1n; i < nextId; i++) {
                    const s = (await publicClient.readContract({
                        address: WAGR_SEASON,
                        abi: seasonAbi,
                        functionName: 'seasons',
                        args: [i],
                    })) as any;

                    // Query real entrants for this season from Blockscout
                    const entrants = await fetchSeasonEntrants(i);

                    loaded.push({
                        id: i,
                        operator: s[0],
                        pool: s[1],
                        startedAt: s[2],
                        closedAt: s[3],
                        entryFee: s[4],
                        payoutRoot: s[5],
                        entrantCount: entrants.length,
                    });
                }

                if (active) {
                    setSeasons(loaded);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to query seasons:', err);
                if (active) setLoading(false);
            }
        }

        fetchSeasons();
        const iv = setInterval(fetchSeasons, 8000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, []);

    async function handleCreateSeason() {
        try {
            setIsCreating(true);
            sfx.stake();
            const feeBn = parseUnits(entryFeeInput || '10', 6);

            // Fetch next season ID before creating
            const nextId = (await publicClient.readContract({
                address: WAGR_SEASON,
                abi: seasonAbi,
                functionName: 'nextSeasonId',
            })) as bigint;

            const newSeasonId = Number(nextId);

            await writeContractAsync({
                address: WAGR_SEASON,
                abi: seasonAbi,
                functionName: 'createSeason',
                args: [feeBn],
            });

            // Prepare metadata
            const endsAt = Date.now() + durationHours * 3600 * 1000;
            const meta: TournamentMetadata = {
                id: newSeasonId,
                name: nameInput || `Tournament Season #${newSeasonId}`,
                description: descInput || 'Multi-round prediction tournament on Somnia Shannon testnet.',
                targetMarket: targetMarketInput || 'All DreamDEX Binary Markets',
                durationHours,
                endsAt,
                payoutDate: payoutDateInput || 'Within 24 hours of close',
                rules: `Fixed ${entryFeeInput} USDso entry. PnL scored across live binary markets. 100% of the pool settles via Merkle pull.`,
                prizeSplit: { first: 60, second: 25, third: 15 },
                createdAt: Date.now(),
            };

            // Save to API
            try {
                await fetch('/api/tournaments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(meta),
                });
            } catch (e) {
                console.warn('Failed to save to /api/tournaments:', e);
            }

            // Save locally
            setMetadataMap((prev) => ({ ...prev, [newSeasonId]: meta }));

            sfx.win();
            setShowCreateModal(false);
        } catch (err) {
            console.error('Failed to create season:', err);
        } finally {
            setIsCreating(false);
        }
    }

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border">
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                                <TrophyIcon className="w-3.5 h-3.5 text-yellow-400" />
                                <span>Multi-Round Tournament Escrow</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                                Squad Seasons & Tournaments
                            </h1>
                            <p className="text-xs sm:text-sm text-muted mt-1 max-w-xl">
                                Create and enter custom prediction tournaments with fixed USDso entry fees, real-time on-chain entrant tracking, and Merkle-proof prize pool settlement.
                            </p>
                        </div>
                        <button
                            onClick={() => { sfx.tap(); setShowCreateModal(true); }}
                            className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 px-4 py-2.5 text-xs font-semibold text-black transition-colors self-start sm:self-auto shadow-sm"
                        >
                            <TrophyIcon className="w-3.5 h-3.5 text-black" />
                            <span>Create Tournament</span>
                        </button>
                    </div>

                    {/* Seasons List */}
                    {loading ? (
                        <div className="py-16 text-center">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                            <div className="text-xs text-muted font-mono mt-3">Reading on-chain tournaments from Shannon…</div>
                        </div>
                    ) : seasons.length === 0 ? (
                        <div className="rounded-3xl border border-border bg-surface/70 p-12 text-center max-w-lg mx-auto backdrop-blur-md">
                            <TrophyIcon className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white">No Tournaments Created Yet</h3>
                            <p className="text-xs text-muted mt-2 leading-relaxed">
                                Spin up the very first on-chain prediction tournament on Somnia Shannon testnet with custom duration and payout terms.
                            </p>
                            <button
                                onClick={() => { sfx.tap(); setShowCreateModal(true); }}
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow-500 hover:bg-yellow-600 px-5 py-2.5 text-xs font-bold text-black"
                            >
                                <TrophyIcon className="w-4 h-4 text-black" />
                                <span>Create Season #1</span>
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {seasons.map((s) => {
                                const idNum = Number(s.id);
                                const meta = metadataMap[idNum] || {
                                    id: idNum,
                                    name: `Tournament Season #${s.id.toString()}`,
                                    description: 'Multi-round prediction tournament on Somnia Shannon testnet.',
                                    targetMarket: 'DreamDEX Event Contracts',
                                    durationHours: 48,
                                    endsAt: Number(s.startedAt) * 1000 + 48 * 3600 * 1000,
                                    payoutDate: 'At Tournament Close',
                                    rules: 'Standard tournament rules apply.',
                                    prizeSplit: { first: 60, second: 25, third: 15 },
                                };

                                const isOpen = s.payoutRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';
                                const countdownText = isOpen ? formatCountdown(meta.endsAt) : 'Finalized';

                                return (
                                    <div
                                        key={s.id.toString()}
                                        className="rounded-2xl border border-border bg-surface/80 p-6 backdrop-blur-md hover:border-yellow-500/40 transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            {/* Top badges */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-yellow-400 font-semibold">
                                                        Season #{s.id.toString()}
                                                    </span>
                                                    <h3 className="text-base font-bold text-white mt-0.5 leading-snug">
                                                        {meta.name}
                                                    </h3>
                                                </div>
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                                                        isOpen
                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                                    }`}
                                                >
                                                    {isOpen ? 'Open / Active' : 'Finalized'}
                                                </span>
                                            </div>

                                            {/* Target Market tag */}
                                            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
                                                <ZapIcon className="w-3.5 h-3.5 text-yellow-400" />
                                                <span>{meta.targetMarket}</span>
                                            </div>

                                            {/* Stats Box */}
                                            <div className="mt-4 space-y-2.5 bg-bg/50 rounded-xl p-4 border border-border/60 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted">Prize Pool:</span>
                                                    <span className="font-mono font-bold text-emerald-400 text-sm">
                                                        {fmtUsd(s.pool)} USDso
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted">Entry Ante:</span>
                                                    <span className="font-mono font-semibold text-white">
                                                        {fmtUsd(s.entryFee)} USDso
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted">Verified Players:</span>
                                                    <span className="font-mono font-bold text-cyan-400">
                                                        {s.entrantCount} {s.entrantCount === 1 ? 'Player' : 'Players'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-border/40">
                                                    <span className="text-muted flex items-center gap-1">
                                                        <ClockIcon className="w-3 h-3 text-muted" />
                                                        <span>Timing:</span>
                                                    </span>
                                                    <span className={`font-mono text-[11px] font-semibold ${isOpen && countdownText !== 'Ended' ? 'text-yellow-400' : 'text-muted'}`}>
                                                        {countdownText}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px]">
                                                    <span className="text-muted">Payout Schedule:</span>
                                                    <span className="text-slate-300 font-mono">
                                                        {meta.payoutDate}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6">
                                            <Link
                                                href={`/season/${s.id.toString()}`}
                                                onClick={() => sfx.tap()}
                                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-surface-hover hover:bg-yellow-500 hover:text-black py-3 text-xs font-semibold text-white transition-all border border-border shadow-sm"
                                            >
                                                <span>View Tournament & Entrants</span>
                                                <ArrowRightIcon className="w-3.5 h-3.5" />
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Enhanced Create Tournament Modal */}
                    {showCreateModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 sm:p-8 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <TrophyIcon className="w-5 h-5 text-yellow-400" />
                                        <span>Create Prediction Tournament</span>
                                    </h3>
                                    <button
                                        onClick={() => setShowCreateModal(false)}
                                        className="text-muted hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <p className="text-xs text-muted leading-relaxed">
                                    You will become the tournament operator. Participants ante the exact entry fee into the WagrSeason smart contract.
                                </p>

                                <div className="space-y-4">
                                    {/* Tournament Name */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                            Tournament Name
                                        </label>
                                        <input
                                            type="text"
                                            value={nameInput}
                                            onChange={(e) => setNameInput(e.target.value)}
                                            placeholder="e.g. DreamDEX Alpha Cup"
                                            className="w-full rounded-xl bg-bg border border-border px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-yellow-500"
                                        />
                                    </div>

                                    {/* Target Asset / Market */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                            Target Market / Focus
                                        </label>
                                        <select
                                            value={targetMarketInput}
                                            onChange={(e) => setTargetMarketInput(e.target.value)}
                                            className="w-full rounded-xl bg-bg border border-border px-4 py-2.5 text-xs text-white focus:outline-none focus:border-yellow-500"
                                        >
                                            <option value="All DreamDEX Binary Markets">All DreamDEX Binary Markets</option>
                                            <option value="BTC & ETH 15m Markets">BTC & ETH 15m Markets</option>
                                            <option value="BTC/USD 1h Markets">BTC/USD 1h Markets</option>
                                            <option value="High Volatility Sprint">High Volatility Sprint (15m)</option>
                                        </select>
                                    </div>

                                    {/* Entry Fee & Duration Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                                Entry Fee per Player (USDso)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={entryFeeInput}
                                                onChange={(e) => setEntryFeeInput(e.target.value)}
                                                className="w-full rounded-xl bg-bg border border-border px-4 py-2.5 font-mono text-base font-bold text-white focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                                Tournament Duration
                                            </label>
                                            <select
                                                value={durationHours}
                                                onChange={(e) => setDurationHours(Number(e.target.value))}
                                                className="w-full rounded-xl bg-bg border border-border px-4 py-2.5 text-xs text-white focus:outline-none focus:border-yellow-500"
                                            >
                                                <option value={24}>24 Hours (Fast Pace)</option>
                                                <option value={48}>48 Hours (Standard)</option>
                                                <option value={72}>3 Days (Weekend Cup)</option>
                                                <option value={168}>7 Days (Weekly Season)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Expected Payout Date */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                            Expected Payout Date
                                        </label>
                                        <input
                                            type="text"
                                            value={payoutDateInput}
                                            onChange={(e) => setPayoutDateInput(e.target.value)}
                                            placeholder="e.g. Sep 10, 2026 (At Close)"
                                            className="w-full rounded-xl bg-bg border border-border px-4 py-2.5 text-xs text-white focus:outline-none focus:border-yellow-500"
                                        />
                                        <span className="text-[11px] text-muted mt-1 block">
                                            When the operator will commit the final Merkle root to pay out winners.
                                        </span>
                                    </div>

                                    {/* Description / Rules */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                                            Tournament Description & Rules
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={descInput}
                                            onChange={(e) => setDescInput(e.target.value)}
                                            placeholder="Describe tournament rules, rounds, and guidelines..."
                                            className="w-full rounded-xl bg-bg border border-border px-4 py-2.5 text-xs text-white focus:outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={handleCreateSeason}
                                        disabled={isCreating}
                                        className="w-full py-3.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 font-bold text-xs text-black transition-colors disabled:opacity-50 shadow-lg"
                                    >
                                        {isCreating ? 'Deploying Tournament on Shannon…' : 'Deploy Tournament Escrow'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
