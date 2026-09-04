'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { Nav } from '@/components/Nav';
import {
    WAGR_SEASON,
    USDSO_TOKEN,
    seasonAbi,
    publicClient,
    fmtUsd,
    shortAddr,
    getExplorerAddressUrl,
    sfx,
} from '@/lib/wagr';
import {
    TrophyIcon,
    UsersIcon,
    ZapIcon,
    ArrowRightIcon,
    CheckIcon,
    ExternalLinkIcon,
    CoinsIcon,
} from '@/components/Icons';

interface OnChainSeason {
    id: bigint;
    operator: string;
    pool: bigint;
    startedAt: bigint;
    closedAt: bigint;
    entryFee: bigint;
    payoutRoot: string;
}

export default function SeasonListPage() {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [seasons, setSeasons] = useState<OnChainSeason[]>([]);
    const [loading, setLoading] = useState(true);
    const [entryFeeInput, setEntryFeeInput] = useState('50');
    const [isCreating, setIsCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createdId, setCreatedId] = useState<bigint | null>(null);

    // Load on-chain seasons
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
                // Query all existing on-chain seasons
                for (let i = 1n; i < nextId; i++) {
                    const s = (await publicClient.readContract({
                        address: WAGR_SEASON,
                        abi: seasonAbi,
                        functionName: 'seasons',
                        args: [i],
                    })) as any;

                    loaded.push({
                        id: i,
                        operator: s[0],
                        pool: s[1],
                        startedAt: s[2],
                        closedAt: s[3],
                        entryFee: s[4],
                        payoutRoot: s[5],
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
        const iv = setInterval(fetchSeasons, 5000);
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
            await writeContractAsync({
                address: WAGR_SEASON,
                abi: seasonAbi,
                functionName: 'createSeason',
                args: [feeBn],
            });
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
                                Spin up a competitive tournament with a fixed USDso entry fee. Members compete across 15m and 1h DreamDEX markets.
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
                            <div className="text-xs text-muted font-mono mt-3">Reading on-chain seasons from Shannon…</div>
                        </div>
                    ) : seasons.length === 0 ? (
                        <div className="rounded-3xl border border-border bg-surface/70 p-12 text-center max-w-lg mx-auto backdrop-blur-md">
                            <TrophyIcon className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-white">No Tournaments Created Yet</h3>
                            <p className="text-xs text-muted mt-2 leading-relaxed">
                                Be the pioneer! Spin up the very first on-chain prediction tournament on Somnia Shannon testnet.
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
                                const isOpen = s.payoutRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';
                                return (
                                    <div
                                        key={s.id.toString()}
                                        className="rounded-2xl border border-border bg-surface/80 p-6 backdrop-blur-md hover:border-yellow-500/40 transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-white text-base">
                                                        Season #{s.id.toString()}
                                                    </span>
                                                </div>
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                                        isOpen
                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                                    }`}
                                                >
                                                    {isOpen ? 'Open / Active' : 'Finalized (Merkle Closed)'}
                                                </span>
                                            </div>

                                            <div className="mt-5 space-y-3 bg-bg/50 rounded-xl p-4 border border-border/60 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted">Tournament Pool:</span>
                                                    <span className="font-mono font-bold text-emerald-400 text-sm">
                                                        {fmtUsd(s.pool)} USDso
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted">Entry Fee per Player:</span>
                                                    <span className="font-mono font-semibold text-white">
                                                        {fmtUsd(s.entryFee)} USDso
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-border/40">
                                                    <span className="text-muted">Tournament Operator:</span>
                                                    <span className="font-mono text-muted">
                                                        {shortAddr(s.operator)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6">
                                            <Link
                                                href={`/season/${s.id.toString()}`}
                                                onClick={() => sfx.tap()}
                                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-surface-hover hover:bg-yellow-500 hover:text-black py-3 text-xs font-semibold text-white transition-all border border-border"
                                            >
                                                <span>View Tournament & Leaderboard</span>
                                                <ArrowRightIcon className="w-3.5 h-3.5" />
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Create Season Modal */}
                    {showCreateModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 sm:p-8 space-y-5 shadow-2xl">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <TrophyIcon className="w-5 h-5 text-yellow-400" />
                                        <span>Create Season Tournament</span>
                                    </h3>
                                    <button
                                        onClick={() => setShowCreateModal(false)}
                                        className="text-muted hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <p className="text-xs text-muted leading-relaxed">
                                    You will become the tournament operator. Participants ante the exact entry fee into WagrSeason escrow.
                                </p>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                                        Entry Fee per Player (USDso)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={entryFeeInput}
                                        onChange={(e) => setEntryFeeInput(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-4 py-3 font-mono text-base font-bold text-white focus:outline-none focus:border-yellow-500"
                                    />
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={handleCreateSeason}
                                        disabled={isCreating}
                                        className="w-full py-3.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 font-bold text-xs text-black transition-colors disabled:opacity-50"
                                    >
                                        {isCreating ? 'Deploying Season on Shannon…' : 'Deploy Tournament'}
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
