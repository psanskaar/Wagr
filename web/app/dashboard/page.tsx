'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract } from 'wagmi';
import { type Address } from 'viem';
import { Nav } from '@/components/Nav';
import { OutcomeModal } from '@/components/OutcomeModal';
import {
    WAGR_ESCROW,
    escrowAbi,
    publicClient,
    fmtUsd,
    shortAddr,
    getExplorerAddressUrl,
    sfx,
} from '@/lib/wagr';
import {
    TrophyIcon,
    ZapIcon,
    SparklesIcon,
    CoinsIcon,
    RadioIcon,
    ExternalLinkIcon,
    ArrowRightIcon,
    CopyIcon,
    CheckIcon,
    ShieldCheckIcon,
} from '@/components/Icons';

interface UserDuelItem {
    duelId: number;
    isAlice: boolean;
    isBob: boolean;
    roleText: string;
    stake: bigint;
    totalPot: bigint;
    userSide: 'UP' | 'DOWN';
    opponentSide: 'UP' | 'DOWN';
    settled: boolean;
    hasBob: boolean;
    opponentAddress: Address;
    marketAddress: Address;
    createdAt: number;
    preview: {
        winner: Address;
        payout: bigint;
        voided: boolean;
        resolved: boolean;
    } | null;
    isWon: boolean;
    isLost: boolean;
    isRefunded: boolean;
    statusBadge: {
        text: string;
        color: string;
    };
}

export default function DashboardPage() {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [duels, setDuels] = useState<UserDuelItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'active' | 'past' | 'all'>('active');
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [selectedOutcomeDuel, setSelectedOutcomeDuel] = useState<UserDuelItem | null>(null);

    // Fetch all duels for connected user
    useEffect(() => {
        let active = true;

        async function fetchUserDuels() {
            if (!address) {
                if (active) {
                    setDuels([]);
                    setLoading(false);
                }
                return;
            }

            try {
                setLoading(true);
                const nextId = (await publicClient.readContract({
                    address: WAGR_ESCROW,
                    abi: escrowAbi,
                    functionName: 'nextDuelId',
                })) as bigint;

                const count = Number(nextId);
                if (count <= 1) {
                    if (active) {
                        setDuels([]);
                        setLoading(false);
                    }
                    return;
                }

                const duelPromises = [];
                const previewPromises = [];
                for (let i = 1; i < count; i++) {
                    duelPromises.push(
                        publicClient.readContract({
                            address: WAGR_ESCROW,
                            abi: escrowAbi,
                            functionName: 'getDuel',
                            args: [BigInt(i)],
                        })
                    );
                    previewPromises.push(
                        publicClient
                            .readContract({
                                address: WAGR_ESCROW,
                                abi: escrowAbi,
                                functionName: 'previewPayout',
                                args: [BigInt(i)],
                            })
                            .catch(() => null)
                    );
                }

                const [duelResults, previewResults] = await Promise.all([
                    Promise.all(duelPromises),
                    Promise.all(previewPromises),
                ]);

                if (!active) return;

                const userItems: UserDuelItem[] = [];
                const lowerUser = address.toLowerCase();

                for (let i = 0; i < duelResults.length; i++) {
                    const d = duelResults[i] as any;
                    const prev = previewResults[i] as any;
                    const duelId = i + 1;

                    const isAlice = d.alice.toLowerCase() === lowerUser;
                    const isBob = d.bob && d.bob.toLowerCase() === lowerUser;

                    if (!isAlice && !isBob) continue;

                    const hasBob =
                        !!d.bob && d.bob !== '0x0000000000000000000000000000000000000000';
                    const stake = isAlice ? BigInt(d.stakeA) : BigInt(d.stakeB);
                    const totalPot = hasBob
                        ? BigInt(d.stakeA) + BigInt(d.stakeB)
                        : BigInt(d.stakeA);

                    const aliceSideStr: 'UP' | 'DOWN' = d.aliceSide === 0 ? 'UP' : 'DOWN';
                    const bobSideStr: 'UP' | 'DOWN' = d.aliceSide === 0 ? 'DOWN' : 'UP';

                    const userSide = isAlice ? aliceSideStr : bobSideStr;
                    const opponentSide = isAlice ? bobSideStr : aliceSideStr;
                    const opponentAddress = isAlice
                        ? (d.bob as Address)
                        : (d.alice as Address);

                    let isWon = false;
                    let isLost = false;
                    let isRefunded = false;

                    const previewData = prev
                        ? {
                              winner: prev[0] as Address,
                              payout: BigInt(prev[1]),
                              voided: Boolean(prev[2]),
                              resolved: Boolean(prev[3]),
                          }
                        : null;

                    if (d.settled) {
                        if (!hasBob || previewData?.voided) {
                            isRefunded = true;
                        } else if (
                            previewData?.winner &&
                            previewData.winner.toLowerCase() === lowerUser
                        ) {
                            isWon = true;
                        } else {
                            isLost = true;
                        }
                    }

                    // Status Badge
                    let statusBadge = {
                        text: 'Open (Waiting for Opponent)',
                        color: 'bg-brand/10 text-brand-light border-brand/30',
                    };

                    if (d.settled) {
                        if (isRefunded) {
                            statusBadge = {
                                text: 'Refunded (No Opponent)',
                                color: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
                            };
                        } else if (isWon) {
                            statusBadge = {
                                text: 'Settled: YOU WON',
                                color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                            };
                        } else {
                            statusBadge = {
                                text: 'Settled: Opponent Won',
                                color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                            };
                        }
                    } else if (hasBob) {
                        if (previewData?.resolved) {
                            statusBadge = {
                                text: 'Oracle Resolved (Ready to Settle)',
                                color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
                            };
                        } else {
                            statusBadge = {
                                text: 'Live Match in Progress',
                                color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
                            };
                        }
                    }

                    userItems.push({
                        duelId,
                        isAlice,
                        isBob,
                        roleText: isAlice ? 'Challenger (Maker)' : 'Acceptor (Taker)',
                        stake,
                        totalPot,
                        userSide,
                        opponentSide,
                        settled: d.settled,
                        hasBob,
                        opponentAddress,
                        marketAddress: d.marketAddress,
                        createdAt: Number(d.createdAt),
                        preview: previewData,
                        isWon,
                        isLost,
                        isRefunded,
                        statusBadge,
                    });
                }

                // Sort latest first
                userItems.sort((a, b) => b.duelId - a.duelId);
                setDuels(userItems);
                setLoading(false);
            } catch (err) {
                console.error('Failed to load user duels:', err);
                if (active) setLoading(false);
            }
        }

        fetchUserDuels();
        const iv = setInterval(fetchUserDuels, 6000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, [address]);

    // Quick Actions
    async function handleSettle(duelId: number) {
        try {
            setStatusMsg(null);
            setActionLoadingId(duelId);
            sfx.tap();
            const hash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'settleDuel',
                args: [BigInt(duelId)],
            });
            await publicClient.waitForTransactionReceipt({ hash });
            sfx.win();
            setStatusMsg(`Duel #${duelId} settled successfully! Winnings transferred.`);
        } catch (err: any) {
            console.error('Settlement error:', err);
            setStatusMsg(err?.shortMessage || err?.message || 'Settlement failed');
        } finally {
            setActionLoadingId(null);
        }
    }

    async function handleCancel(duelId: number) {
        try {
            setStatusMsg(null);
            setActionLoadingId(duelId);
            sfx.tap();
            const hash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'cancelDuel',
                args: [BigInt(duelId)],
            });
            await publicClient.waitForTransactionReceipt({ hash });
            sfx.win();
            setStatusMsg(`Duel #${duelId} cancelled. Full stake refunded.`);
        } catch (err: any) {
            console.error('Cancel error:', err);
            setStatusMsg(err?.shortMessage || err?.message || 'Cancellation failed');
        } finally {
            setActionLoadingId(null);
        }
    }

    const copyChallengeLink = (duelId: number) => {
        sfx.tap();
        if (typeof window !== 'undefined') {
            const url = `${window.location.origin}/duel/${duelId}`;
            navigator.clipboard.writeText(url);
            setCopiedId(duelId);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    // Derived lists
    const activeDuels = duels.filter((d) => !d.settled);
    const pastDuels = duels.filter((d) => d.settled);
    const displayedDuels =
        activeTab === 'active' ? activeDuels : activeTab === 'past' ? pastDuels : duels;

    // Metrics summary
    const totalPlayed = duels.length;
    const totalWon = duels.filter((d) => d.isWon).length;
    const settledMatches = duels.filter((d) => d.settled && d.hasBob && !d.isRefunded);
    const winRate =
        settledMatches.length > 0
            ? Math.round((totalWon / settledMatches.length) * 100)
            : 0;
    const totalWageredBn = duels.reduce((acc, d) => acc + d.stake, 0n);
    const activeStakesBn = activeDuels.reduce((acc, d) => acc + d.stake, 0n);

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                                <TrophyIcon className="w-3.5 h-3.5 text-brand" />
                                <span>Player Dashboard</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                                My Prediction Duels
                            </h1>
                            <p className="text-xs sm:text-sm text-muted mt-1">
                                Real-time status of your active wagers, match history, and zero-click settlements.
                            </p>
                        </div>
                        <Link
                            href="/create"
                            onClick={() => sfx.tap()}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-deep px-4 py-2.5 text-xs font-bold text-white shadow-brand-glow transition-all"
                        >
                            <ZapIcon className="w-4 h-4" />
                            <span>Create New Duel</span>
                        </Link>
                    </div>

                    {/* Stats Overview */}
                    {isConnected && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="clean-card rounded-xl p-4 sm:p-5">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                                    Total Duels
                                </span>
                                <div className="mt-2 text-2xl font-bold font-mono text-white">
                                    {totalPlayed}
                                </div>
                                <span className="text-[11px] text-muted">On Shannon testnet</span>
                            </div>

                            <div className="clean-card rounded-xl p-4 sm:p-5">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                                    Win Rate
                                </span>
                                <div className="mt-2 text-2xl font-bold font-mono text-emerald-400">
                                    {settledMatches.length > 0 ? `${winRate}%` : '—'}
                                </div>
                                <span className="text-[11px] text-muted">
                                    {totalWon} won of {settledMatches.length} matched
                                </span>
                            </div>

                            <div className="clean-card rounded-xl p-4 sm:p-5">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                                    Total Wagered
                                </span>
                                <div className="mt-2 text-2xl font-bold font-mono text-cyan-400">
                                    {fmtUsd(totalWageredBn)}
                                </div>
                                <span className="text-[11px] text-muted">USDso across all duels</span>
                            </div>

                            <div className="clean-card rounded-xl p-4 sm:p-5">
                                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                                    Active in Escrow
                                </span>
                                <div className="mt-2 text-2xl font-bold font-mono text-brand-light">
                                    {fmtUsd(activeStakesBn)}
                                </div>
                                <span className="text-[11px] text-muted">
                                    {activeDuels.length} active wagers
                                </span>
                            </div>
                        </div>
                    )}

                    {statusMsg && (
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3.5 text-xs text-emerald-300 flex items-center justify-between">
                            <span>{statusMsg}</span>
                            <button
                                onClick={() => setStatusMsg(null)}
                                className="text-muted hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 border-b border-border pb-3">
                        <button
                            onClick={() => {
                                sfx.tap();
                                setActiveTab('active');
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'active'
                                    ? 'bg-surface text-white border border-border shadow-sm'
                                    : 'text-muted hover:text-white'
                            }`}
                        >
                            <span>Active Duels</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-brand/20 text-brand-light font-mono">
                                {activeDuels.length}
                            </span>
                        </button>

                        <button
                            onClick={() => {
                                sfx.tap();
                                setActiveTab('past');
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'past'
                                    ? 'bg-surface text-white border border-border shadow-sm'
                                    : 'text-muted hover:text-white'
                            }`}
                        >
                            <span>Past Duels</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-slate-300 font-mono">
                                {pastDuels.length}
                            </span>
                        </button>

                        <button
                            onClick={() => {
                                sfx.tap();
                                setActiveTab('all');
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'all'
                                    ? 'bg-surface text-white border border-border shadow-sm'
                                    : 'text-muted hover:text-white'
                            }`}
                        >
                            <span>All</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-slate-300 font-mono">
                                {duels.length}
                            </span>
                        </button>
                    </div>

                    {/* Content Section */}
                    {!isConnected ? (
                        <div className="clean-card rounded-2xl p-12 text-center space-y-4">
                            <div className="h-12 w-12 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto text-brand-light">
                                <ZapIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-bold text-white">Wallet Not Connected</h3>
                            <p className="text-xs text-muted max-w-sm mx-auto">
                                Connect your Somnia Shannon wallet to view and manage your active prediction duels.
                            </p>
                        </div>
                    ) : loading && duels.length === 0 ? (
                        <div className="clean-card rounded-2xl p-12 text-center space-y-3">
                            <div className="w-8 h-8 rounded-full border-2 border-brand/30 border-t-brand animate-spin mx-auto" />
                            <p className="text-xs text-muted font-mono">
                                Fetching your on-chain duels from WagrEscrow…
                            </p>
                        </div>
                    ) : displayedDuels.length === 0 ? (
                        <div className="clean-card rounded-2xl p-12 text-center space-y-4">
                            <div className="h-12 w-12 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto text-muted">
                                <CoinsIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-bold text-white">
                                {activeTab === 'active'
                                    ? 'No Active Duels'
                                    : activeTab === 'past'
                                    ? 'No Past Duels'
                                    : 'No Duels Found'}
                            </h3>
                            <p className="text-xs text-muted max-w-sm mx-auto">
                                {activeTab === 'active'
                                    ? 'You currently have no open or live duels awaiting resolution.'
                                    : 'You haven’t completed any prediction duels yet.'}
                            </p>
                            <Link
                                href="/create"
                                onClick={() => sfx.tap()}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-brand hover:bg-brand-deep px-4 py-2.5 text-xs font-bold text-white shadow-brand-glow"
                            >
                                <ZapIcon className="w-4 h-4" />
                                <span>Create a Duel</span>
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {displayedDuels.map((item) => {
                                const isSettlingThis = actionLoadingId === item.duelId;
                                return (
                                    <div
                                        key={item.duelId}
                                        className="clean-card rounded-2xl p-5 sm:p-6 transition-all hover:border-border/80 space-y-4"
                                    >
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                                            <div className="flex items-center gap-2.5">
                                                <span className="font-mono font-bold text-sm text-white">
                                                    Duel #{item.duelId}
                                                </span>
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${item.statusBadge.color}`}
                                                >
                                                    {item.statusBadge.text}
                                                </span>
                                                <span className="text-xs text-muted font-medium">
                                                    ({item.roleText})
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                                {!item.hasBob && !item.settled && (
                                                    <button
                                                        onClick={() => copyChallengeLink(item.duelId)}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-xs font-medium text-white transition-colors"
                                                    >
                                                        {copiedId === item.duelId ? (
                                                            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : (
                                                            <CopyIcon className="w-3.5 h-3.5" />
                                                        )}
                                                        <span>{copiedId === item.duelId ? 'Copied' : 'Share Link'}</span>
                                                    </button>
                                                )}
                                                {item.settled && item.hasBob && (
                                                    <button
                                                        onClick={() => {
                                                            sfx.tap();
                                                            setSelectedOutcomeDuel(item);
                                                        }}
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                            item.isWon
                                                                ? 'bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-300 text-black hover:opacity-90 shadow-brand-glow'
                                                                : 'border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                                                        }`}
                                                    >
                                                        {item.isWon ? <TrophyIcon className="w-3.5 h-3.5" /> : <span>💀</span>}
                                                        <span>{item.isWon ? 'Victory Card' : 'Defeat Breakdown'}</span>
                                                    </button>
                                                )}
                                                <Link
                                                    href={`/duel/${item.duelId}`}
                                                    onClick={() => sfx.tap()}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-white transition-colors"
                                                >
                                                    <span>View Room</span>
                                                    <ArrowRightIcon className="w-3.5 h-3.5" />
                                                </Link>
                                            </div>
                                        </div>

                                        {/* Main Body Grid */}
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                                            <div className="space-y-1">
                                                <span className="text-muted">Your Prediction:</span>
                                                <div
                                                    className={`font-bold text-base flex items-center gap-1 ${
                                                        item.userSide === 'UP' ? 'text-up' : 'text-down'
                                                    }`}
                                                >
                                                    <span>{item.userSide === 'UP' ? '▲ UP (YES)' : '▼ DOWN (NO)'}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <span className="text-muted">Your Stake / Pot:</span>
                                                <div className="font-mono font-bold text-sm text-white">
                                                    {fmtUsd(item.stake)} USDso
                                                    <span className="text-muted font-normal text-xs ml-1">
                                                        (Pot: {fmtUsd(item.totalPot)})
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <span className="text-muted">Opponent:</span>
                                                <div className="font-mono font-medium text-white flex items-center gap-1">
                                                    {item.hasBob ? (
                                                        <>
                                                            <span>{shortAddr(item.opponentAddress)}</span>
                                                            <span
                                                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                                                    item.opponentSide === 'UP'
                                                                        ? 'text-up bg-up/10'
                                                                        : 'text-down bg-down/10'
                                                                }`}
                                                            >
                                                                {item.opponentSide}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-amber-400">Waiting for Taker</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <span className="text-muted">DreamDEX Market:</span>
                                                <div className="font-mono text-muted hover:text-white flex items-center gap-1">
                                                    <a
                                                        href={getExplorerAddressUrl(item.marketAddress)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="hover:underline flex items-center gap-1 truncate"
                                                    >
                                                        <span>{shortAddr(item.marketAddress)}</span>
                                                        <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bottom Action Triggers if Actionable */}
                                        {/* 1. Settle Ready */}
                                        {!item.settled && item.hasBob && item.preview?.resolved && (
                                            <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/30">
                                                <span className="text-xs text-emerald-300">
                                                    Market resolved! Click to execute settlement and claim payout.
                                                </span>
                                                <button
                                                    onClick={() => handleSettle(item.duelId)}
                                                    disabled={isSettlingThis}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-black shadow-brand-glow transition-all disabled:opacity-50"
                                                >
                                                    <SparklesIcon className="w-3.5 h-3.5" />
                                                    <span>
                                                        {isSettlingThis
                                                            ? 'Settling…'
                                                            : `Settle & Transfer Pot (${fmtUsd(item.totalPot)} USDso)`}
                                                    </span>
                                                </button>
                                            </div>
                                        )}

                                        {/* 2. Unmatched & Alice can Cancel / Reclaim */}
                                        {!item.settled && !item.hasBob && item.isAlice && (
                                            <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                <span className="text-xs text-muted">
                                                    Duel is unmatched. You can cancel and immediately reclaim your full stake.
                                                </span>
                                                <button
                                                    onClick={() => handleCancel(item.duelId)}
                                                    disabled={isSettlingThis}
                                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-down/40 bg-down/10 hover:bg-down/20 text-xs font-semibold text-down transition-colors disabled:opacity-50"
                                                >
                                                    <span>
                                                        {isSettlingThis
                                                            ? 'Cancelling…'
                                                            : `Cancel Duel & Reclaim (${fmtUsd(item.stake)} USDso)`}
                                                    </span>
                                                </button>
                                            </div>
                                        )}

                                        {/* 3. Settled details */}
                                        {item.settled && (
                                            <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted">
                                                <div>
                                                    {item.isWon ? (
                                                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                                                            <span>🎉 Won Pot:</span>
                                                            <span className="font-mono">
                                                                +{fmtUsd(item.preview?.payout ?? item.totalPot)} USDso
                                                            </span>
                                                        </span>
                                                    ) : item.isRefunded ? (
                                                        <span className="text-slate-300 font-semibold">
                                                            Stake Refunded: {fmtUsd(item.stake)} USDso
                                                        </span>
                                                    ) : (
                                                        <span className="text-rose-400 font-medium">
                                                            Lost: -{fmtUsd(item.stake)} USDso
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="font-mono text-[11px]">
                                                    WagrEscrow Verified
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
            {selectedOutcomeDuel && (
                <OutcomeModal
                    isOpen={!!selectedOutcomeDuel}
                    onClose={() => setSelectedOutcomeDuel(null)}
                    isWinner={selectedOutcomeDuel.isWon}
                    duelId={selectedOutcomeDuel.duelId}
                    payout={selectedOutcomeDuel.preview?.payout ?? selectedOutcomeDuel.totalPot}
                    stake={selectedOutcomeDuel.stake}
                    opponentAddress={selectedOutcomeDuel.opponentAddress}
                />
            )}
        </div>
    );
}
