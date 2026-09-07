'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits, maxUint256, type Address } from 'viem';
import { Nav } from '@/components/Nav';
import {
    WAGR_SEASON,
    USDSO_TOKEN,
    seasonAbi,
    erc20Abi,
    publicClient,
    fmtUsd,
    shortAddr,
    shortHash,
    getExplorerAddressUrl,
    sfx,
    fetchSeasonEntrants,
    fetchTournamentLeaderboard,
    buildTournamentMerkleTree,
    DEFAULT_TOURNAMENTS_META,
    type TournamentMetadata,
    type SeasonEntrant,
    type LeaderboardEntry,
} from '@/lib/wagr';
import {
    TrophyIcon,
    UsersIcon,
    CoinsIcon,
    CheckIcon,
    ExternalLinkIcon,
    ShieldCheckIcon,
    SparklesIcon,
    ClockIcon,
    ZapIcon,
    ArrowRightIcon,
} from '@/components/Icons';

interface SeasonData {
    operator: Address;
    pool: bigint;
    startedAt: bigint;
    closedAt: bigint;
    entryFee: bigint;
    payoutRoot: string;
}

function useCountdown(targetMs: number) {
    const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number; ended: boolean }>({
        d: 0,
        h: 0,
        m: 0,
        s: 0,
        ended: false,
    });

    useEffect(() => {
        function tick() {
            const diff = targetMs - Date.now();
            if (diff <= 0) {
                setTimeLeft({ d: 0, h: 0, m: 0, s: 0, ended: true });
                return;
            }
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / (1000 * 60)) % 60);
            const s = Math.floor((diff / 1000) % 60);
            setTimeLeft({ d, h, m, s, ended: false });
        }
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [targetMs]);

    return timeLeft;
}

export default function SeasonDetailPage({ params }: { params: { id: string } }) {
    const seasonId = BigInt(params.id || '1');
    const idNum = Number(seasonId);
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [season, setSeason] = useState<SeasonData | null>(null);
    const [members, setMembers] = useState<SeasonEntrant[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [meta, setMeta] = useState<TournamentMetadata>(() => {
        return (
            DEFAULT_TOURNAMENTS_META[idNum] || {
                id: idNum,
                name: `Tournament Season #${params.id}`,
                description: 'Multi-round prediction tournament on Somnia Shannon testnet.',
                targetMarket: 'All DreamDEX Binary Markets',
                durationHours: 48,
                endsAt: Date.now() + 48 * 3600 * 1000,
                payoutDate: 'At Tournament Close',
                rules: 'Standard tournament rules. Compete across active binary prediction markets.',
                prizeSplit: { first: 60, second: 25, third: 15 },
            }
        );
    });

    const [loading, setLoading] = useState(true);
    const [isJoining, setIsJoining] = useState(false);
    const [hasEntered, setHasEntered] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Operator Finalization State
    const [showFinalizeModal, setShowFinalizeModal] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizeSuccess, setFinalizeSuccess] = useState<string | null>(null);

    // Winner Claim State
    const [isClaiming, setIsClaiming] = useState(false);
    const [hasClaimed, setHasClaimed] = useState(false);

    // Live USDso Allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_SEASON] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    // Load Tournament Metadata from API
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await fetch('/api/tournaments');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.tournaments && data.tournaments[idNum]) {
                        setMeta(data.tournaments[idNum]);
                    }
                }
            } catch (e) {
                console.warn('Could not load tournament meta from API:', e);
            }
        }
        loadMeta();
    }, [idNum]);

    // Live On-Chain Data, Entrants, and Leaderboard
    useEffect(() => {
        let active = true;

        async function fetchSeasonDetails() {
            try {
                const s = (await publicClient.readContract({
                    address: WAGR_SEASON,
                    abi: seasonAbi,
                    functionName: 'seasons',
                    args: [seasonId],
                })) as any;

                if (!active) return;

                const currentSeason: SeasonData = {
                    operator: s[0],
                    pool: s[1],
                    startedAt: s[2],
                    closedAt: s[3],
                    entryFee: s[4],
                    payoutRoot: s[5],
                };
                setSeason(currentSeason);

                // Check if connected address has joined on-chain
                let userHasEntered = false;
                if (address) {
                    userHasEntered = (await publicClient.readContract({
                        address: WAGR_SEASON,
                        abi: seasonAbi,
                        functionName: 'entered',
                        args: [seasonId, address],
                    })) as boolean;
                    if (active) setHasEntered(userHasEntered);
                }

                // Query live real entrants via Blockscout API
                const entrants = await fetchSeasonEntrants(seasonId);

                // If on-chain entered is true but log hasn't indexed yet, inject user
                if (userHasEntered && address) {
                    const userLower = address.toLowerCase();
                    const found = entrants.some((e) => e.member.toLowerCase() === userLower);
                    if (!found) {
                        entrants.unshift({
                            member: address,
                            fee: currentSeason.entryFee,
                            blockNumber: 481737334n,
                            timestamp: Date.now(),
                        });
                    }
                }

                if (active) {
                    setMembers(entrants);
                    // Compute live tournament leaderboard based on duel performance
                    const lb = await fetchTournamentLeaderboard(entrants, currentSeason.pool, meta.prizeSplit);
                    setLeaderboard(lb);
                    setLoading(false);
                }

                // Check winner claim status if season is closed
                if (address && meta.claims && meta.claims[address.toLowerCase()]) {
                    const claimData = meta.claims[address.toLowerCase()];
                    try {
                        const alreadyClaimed = (await publicClient.readContract({
                            address: WAGR_SEASON,
                            abi: seasonAbi,
                            functionName: 'isClaimed',
                            args: [seasonId, BigInt(claimData.index)],
                        })) as boolean;
                        if (active) setHasClaimed(alreadyClaimed);
                    } catch {}
                }
            } catch (err) {
                console.error('Failed to query season details:', err);
                if (active) setLoading(false);
            }
        }

        fetchSeasonDetails();
        const iv = setInterval(fetchSeasonDetails, 6000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, [seasonId, address, meta.claims, meta.prizeSplit]);

    const isOpen =
        season?.payoutRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';

    const needsApproval =
        allowance !== undefined && season?.entryFee && (allowance as bigint) < season.entryFee;

    const isOperator =
        !!address && !!season && address.toLowerCase() === season.operator.toLowerCase();

    const countdown = useCountdown(meta.endsAt);

    // Prize calculations
    const poolNum = season ? Number(season.pool) / 1e6 : 0;
    const firstPrize = (poolNum * (meta.prizeSplit?.first || 60)) / 100;
    const secondPrize = (poolNum * (meta.prizeSplit?.second || 25)) / 100;
    const thirdPrize = (poolNum * (meta.prizeSplit?.third || 15)) / 100;

    // Check if user has an active winner claim
    const userClaim = address && meta.claims ? meta.claims[address.toLowerCase()] : null;

    async function handleApprove() {
        try {
            setErrorMsg(null);
            sfx.tap();
            await writeContractAsync({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'approve',
                args: [WAGR_SEASON, maxUint256],
            });
            await refetchAllowance();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Approval rejected');
        }
    }

    async function handleJoinSeason() {
        if (!season) return;
        try {
            setErrorMsg(null);
            setIsJoining(true);
            sfx.stake();
            await writeContractAsync({
                address: WAGR_SEASON,
                abi: seasonAbi,
                functionName: 'joinSeason',
                args: [seasonId, season.entryFee],
            });
            setHasEntered(true);
            sfx.win();

            // Refetch entrants immediately
            if (address) {
                setMembers((prev) => [
                    {
                        member: address,
                        fee: season.entryFee,
                        blockNumber: 0n,
                        timestamp: Date.now(),
                    },
                    ...prev.filter((p) => p.member.toLowerCase() !== address.toLowerCase()),
                ]);
            }
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Failed to join tournament');
        } finally {
            setIsJoining(false);
        }
    }

    // Operator Finalize & Commit Payouts
    async function handleCommitPayouts() {
        if (!season || !isOperator || leaderboard.length === 0) return;
        try {
            setIsFinalizing(true);
            sfx.stake();

            // Build winners from top of the leaderboard
            const topEntrants = leaderboard.slice(0, 3);
            const totalPoolBn = season.pool;
            const split = meta.prizeSplit || { first: 60, second: 25, third: 15 };

            const winners = topEntrants.map((entry, idx) => {
                let sharePct = split.first;
                if (idx === 1) sharePct = split.second;
                if (idx === 2) sharePct = split.third;
                // Compute exact amount
                const amountBn = (totalPoolBn * BigInt(sharePct)) / 100n;
                return {
                    index: idx,
                    account: entry.member,
                    amount: amountBn,
                };
            });

            // If only 1 player, give 100% of pool to #1
            if (winners.length === 1) {
                winners[0].amount = totalPoolBn;
            }

            const totalPayoutBn = winners.reduce((acc, w) => acc + w.amount, 0n);

            // Generate Merkle Tree
            const { root, claims } = buildTournamentMerkleTree(winners);

            // Call on-chain commitSeasonPayouts
            const hash = await writeContractAsync({
                address: WAGR_SEASON,
                abi: seasonAbi,
                functionName: 'commitSeasonPayouts',
                args: [seasonId, root, totalPayoutBn],
            });

            await publicClient.waitForTransactionReceipt({ hash });

            // Persist claims and payoutRoot to API
            const updatedMeta: TournamentMetadata = {
                ...meta,
                payoutDate: 'Finalized on Shannon',
                claims,
            };

            try {
                await fetch('/api/tournaments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedMeta),
                });
            } catch (e) {
                console.warn('Failed to save claims to API:', e);
            }

            setMeta(updatedMeta);
            setFinalizeSuccess(`Tournament finalized! Merkle root ${shortHash(root)} committed on-chain.`);
            sfx.bigWin();
            setShowFinalizeModal(false);
        } catch (err: any) {
            console.error('Finalize error:', err);
            setErrorMsg(err?.shortMessage || err?.message || 'Finalization failed');
        } finally {
            setIsFinalizing(false);
        }
    }

    // Winner Claim Prize
    async function handleClaimPrize() {
        if (!userClaim || !address) return;
        try {
            setIsClaiming(true);
            sfx.stake();

            const indexBn = BigInt(userClaim.index);
            const amountBn = BigInt(userClaim.amount);
            const proofHex = userClaim.proof as `0x${string}`[];

            const hash = await writeContractAsync({
                address: WAGR_SEASON,
                abi: seasonAbi,
                functionName: 'claim',
                args: [seasonId, indexBn, address, amountBn, proofHex],
            });

            await publicClient.waitForTransactionReceipt({ hash });
            setHasClaimed(true);
            sfx.bigWin();
        } catch (err: any) {
            console.error('Claim error:', err);
            setErrorMsg(err?.shortMessage || err?.message || 'Claim failed');
        } finally {
            setIsClaiming(false);
        }
    }

    if (loading) {
        return (
            <>
                <Nav />
                <main className="min-h-screen flex items-center justify-center p-4">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
                        <span className="text-xs text-muted font-mono">Loading Tournament #{params.id} from Shannon…</span>
                    </div>
                </main>
            </>
        );
    }

    if (!season || season.operator === '0x0000000000000000000000000000000000000000') {
        return (
            <>
                <Nav />
                <main className="min-h-screen flex items-center justify-center p-4">
                    <div className="text-center max-w-md">
                        <div className="rounded-2xl border border-border bg-surface p-8">
                            <h2 className="text-lg font-bold text-white">Tournament #{params.id} Not Found</h2>
                            <p className="text-xs text-muted mt-2">
                                No on-chain tournament has been deployed with this ID yet.
                            </p>
                            <Link
                                href="/season"
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-5 py-2.5 text-xs font-bold text-black"
                            >
                                <span>Browse Tournaments</span>
                            </Link>
                        </div>
                    </div>
                </main>
            </>
        );
    }

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-border">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                                        isOpen
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                    }`}
                                >
                                    {isOpen ? 'Open / In Progress' : 'Finalized (Merkle Closed)'}
                                </span>
                                <span className="font-mono text-xs text-yellow-400 font-bold">
                                    Season #{params.id}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-muted">
                                    {meta.targetMarket}
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                                {meta.name}
                            </h1>
                            <p className="text-xs text-muted mt-1.5 max-w-xl leading-relaxed">
                                {meta.description}
                            </p>
                            <p className="text-xs text-muted mt-2">
                                Tournament Operator:{' '}
                                <a
                                    href={getExplorerAddressUrl(season.operator)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-mono text-white hover:text-yellow-400 underline"
                                >
                                    {shortAddr(season.operator)}
                                </a>
                                {isOperator && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[10px] font-bold">
                                        YOU ARE OPERATOR
                                    </span>
                                )}
                            </p>
                        </div>

                        {/* Total Pool Stat */}
                        <div className="text-left sm:text-right clean-card rounded-2xl p-5 border border-emerald-500/20 bg-emerald-950/10">
                            <div className="text-xs uppercase text-muted font-semibold tracking-wider">Total Prize Pool</div>
                            <div className="text-3xl font-mono font-bold text-emerald-400 mt-1">
                                {fmtUsd(season.pool)} USDso
                            </div>
                            <div className="text-[11px] text-muted mt-1 font-mono">
                                {members.length} {members.length === 1 ? 'Contributed Ante' : 'Contributed Antes'}
                            </div>
                        </div>
                    </div>

                    {/* Winner Claim Banner (If Finalized & User Won) */}
                    {!isOpen && userClaim && (
                        <div className="rounded-3xl border border-yellow-500/50 bg-gradient-to-r from-yellow-900/40 via-surface to-yellow-900/40 p-6 sm:p-8 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="space-y-1.5 text-center sm:text-left">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-bold">
                                    <TrophyIcon className="w-4 h-4" />
                                    <span>Tournament Winner</span>
                                </div>
                                <h3 className="text-xl font-bold text-white">
                                    Congratulations! You Won {(Number(userClaim.amount) / 1e6).toFixed(2)} USDso
                                </h3>
                                <p className="text-xs text-muted max-w-lg">
                                    You placed in the top tier of the tournament leaderboard. Your share is secured in WagrSeason escrow and can be claimed below.
                                </p>
                            </div>

                            <div>
                                {hasClaimed ? (
                                    <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold text-xs">
                                        <CheckIcon className="w-4 h-4" />
                                        <span>Prize Claimed</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleClaimPrize}
                                        disabled={isClaiming}
                                        className="px-6 py-3.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-xs shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <CoinsIcon className="w-4 h-4 text-black" />
                                        <span>{isClaiming ? 'Claiming USDso…' : 'Claim Prize Payout'}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Live Timing & Action Bar */}
                    <div className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                                <ClockIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-white flex items-center gap-2">
                                    <span>Tournament Timing & Duration</span>
                                    <span className="text-[10px] text-muted font-normal">({meta.durationHours}h Schedule)</span>
                                </div>
                                <div className="text-xs text-muted mt-0.5">
                                    {isOpen ? (
                                        countdown.ended ? (
                                            <span className="text-red-400 font-semibold">Tournament window has closed. Awaiting operator settlement.</span>
                                        ) : (
                                            <span>
                                                Closes in <strong className="text-yellow-400 font-mono">{countdown.d}d {countdown.h}h {countdown.m}m {countdown.s}s</strong>
                                            </span>
                                        )
                                    ) : (
                                        <span className="text-purple-300">Tournament has finalized and payouts have been committed.</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <Link
                                href="/create"
                                onClick={() => sfx.tap()}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold shadow-brand-glow transition-all"
                            >
                                <ZapIcon className="w-3.5 h-3.5" />
                                <span>Play Tournament Duel</span>
                            </Link>
                        </div>
                    </div>

                    {/* Operator Settlement Panel (Visible Only to Operator) */}
                    {isOperator && isOpen && (
                        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-950/15 p-5 backdrop-blur-md space-y-3">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <ShieldCheckIcon className="w-4 h-4" />
                                        <span>Operator Settlement Controls</span>
                                    </h4>
                                    <p className="text-xs text-muted mt-1 max-w-xl">
                                        As operator, you can finalize this tournament. Clicking below automatically calculates the winners from the top of the live leaderboard, generates the cryptographic Merkle root, and distributes the prize pool.
                                    </p>
                                </div>

                                <button
                                    onClick={() => setShowFinalizeModal(true)}
                                    className="px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-bold shadow-md transition-all self-start sm:self-auto shrink-0"
                                >
                                    Finalize & Commit Payouts
                                </button>
                            </div>
                        </div>
                    )}

                    {finalizeSuccess && (
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                            {finalizeSuccess}
                        </div>
                    )}

                    {/* LIVE TOURNAMENT LEADERBOARD */}
                    <div className="rounded-3xl border border-border bg-surface/90 p-6 sm:p-8 backdrop-blur-xl space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-4">
                            <div>
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <TrophyIcon className="w-4 h-4 text-yellow-400" />
                                    <span>Live Tournament Leaderboard</span>
                                </h3>
                                <p className="text-xs text-muted mt-0.5">
                                    Standings update in real-time based on verified on-chain duel performance on Wagr.
                                </p>
                            </div>
                            <span className="text-[11px] font-mono text-muted self-start sm:self-auto">
                                Sorted by Net PnL & Duel Wins
                            </span>
                        </div>

                        {leaderboard.length === 0 ? (
                            <div className="py-8 text-center bg-bg/40 rounded-2xl border border-border/60">
                                <span className="text-xs text-muted">
                                    No entrant scores yet. Register above and play your first duel to claim the top spot!
                                </span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted font-bold">
                                            <th className="pb-3 pr-2">Rank</th>
                                            <th className="pb-3 px-2">Player</th>
                                            <th className="pb-3 px-2 text-center">Duels (W / L)</th>
                                            <th className="pb-3 px-2 text-center">Win Rate</th>
                                            <th className="pb-3 px-2 text-right">Net PnL</th>
                                            <th className="pb-3 pl-2 text-right">Prize Share</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                        {leaderboard.map((entry) => {
                                            const isUser = !!address && entry.member.toLowerCase() === address.toLowerCase();
                                            const rankEmoji = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;

                                            return (
                                                <tr
                                                    key={entry.member}
                                                    className={`hover:bg-bg/40 transition-colors ${
                                                        isUser ? 'bg-yellow-500/10' : ''
                                                    }`}
                                                >
                                                    <td className="py-3.5 pr-2 font-mono font-bold text-sm">
                                                        <span>{rankEmoji}</span>
                                                    </td>
                                                    <td className="py-3.5 px-2">
                                                        <div className="flex items-center gap-2">
                                                            <a
                                                                href={getExplorerAddressUrl(entry.member)}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="font-mono font-semibold text-white hover:text-yellow-400 flex items-center gap-1"
                                                            >
                                                                <span>{shortAddr(entry.member)}</span>
                                                                <ExternalLinkIcon className="w-3 h-3 text-muted" />
                                                            </a>
                                                            {isUser && (
                                                                <span className="px-1.5 py-0.5 rounded-full bg-yellow-500 text-black text-[10px] font-bold">
                                                                    YOU
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-2 text-center font-mono">
                                                        <span className="text-emerald-400 font-bold">{entry.duelsWon}W</span>
                                                        <span className="text-muted mx-1">/</span>
                                                        <span className="text-rose-400">{entry.duelsPlayed - entry.duelsWon}L</span>
                                                    </td>
                                                    <td className="py-3.5 px-2 text-center font-mono text-slate-300">
                                                        {entry.duelsPlayed > 0 ? `${entry.winRate}%` : '—'}
                                                    </td>
                                                    <td className="py-3.5 px-2 text-right font-mono font-bold">
                                                        <span
                                                            className={
                                                                entry.netPnLUsd > 0
                                                                    ? 'text-emerald-400'
                                                                    : entry.netPnLUsd < 0
                                                                    ? 'text-rose-400'
                                                                    : 'text-muted'
                                                            }
                                                        >
                                                            {entry.netPnLUsd > 0 ? `+${entry.netPnLUsd.toFixed(2)}` : entry.netPnLUsd.toFixed(2)} USDso
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 pl-2 text-right font-mono font-bold text-yellow-400">
                                                        {entry.estimatedPrizeUsd > 0
                                                            ? `${entry.estimatedPrizeUsd.toFixed(2)} USDso`
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Tournament Info & Prize Split Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="clean-card rounded-xl p-5">
                            <span className="text-xs text-muted uppercase font-semibold tracking-wider">Required Entry Ante</span>
                            <div className="mt-2 text-xl font-mono font-semibold text-white">
                                {fmtUsd(season.entryFee)} USDso
                            </div>
                            <div className="text-[11px] text-muted mt-1">Locks into WagrSeason escrow</div>
                        </div>

                        <div className="clean-card rounded-xl p-5">
                            <span className="text-xs text-muted uppercase font-semibold tracking-wider">Verified Entrants</span>
                            <div className="mt-2 text-xl font-mono font-semibold text-cyan-400">
                                {members.length} {members.length === 1 ? 'Player' : 'Players'}
                            </div>
                            <div className="text-[11px] text-muted mt-1">Verified on Shannon Explorer</div>
                        </div>

                        <div className="rounded-xl border border-border bg-surface/60 p-5 backdrop-blur-md">
                            <span className="text-xs text-muted uppercase font-bold tracking-wider">Settlement Protocol</span>
                            <div className="mt-2 text-base font-bold text-purple-300">
                                Merkle-Proof Pull
                            </div>
                            <div className="text-[11px] text-muted mt-1">BitMaps double-claim protected</div>
                        </div>
                    </div>

                    {/* Prize Distribution Box */}
                    <div className="rounded-2xl border border-border bg-surface/60 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                                <TrophyIcon className="w-3.5 h-3.5 text-yellow-400" />
                                <span>Prize Pool Breakdown</span>
                            </h3>
                            <span className="text-[11px] text-muted font-mono">100% of Escrow Pool</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-bg/60 rounded-xl p-3 border border-yellow-500/20">
                                <span className="text-[10px] text-yellow-400 font-bold block">1st Place ({meta.prizeSplit?.first || 60}%)</span>
                                <span className="text-base font-mono font-bold text-white mt-1 block">
                                    {firstPrize.toFixed(2)} USDso
                                </span>
                            </div>
                            <div className="bg-bg/60 rounded-xl p-3 border border-slate-700/40">
                                <span className="text-[10px] text-slate-300 font-bold block">2nd Place ({meta.prizeSplit?.second || 25}%)</span>
                                <span className="text-base font-mono font-bold text-white mt-1 block">
                                    {secondPrize.toFixed(2)} USDso
                                </span>
                            </div>
                            <div className="bg-bg/60 rounded-xl p-3 border border-slate-700/40">
                                <span className="text-[10px] text-amber-500 font-bold block">3rd Place ({meta.prizeSplit?.third || 15}%)</span>
                                <span className="text-base font-mono font-bold text-white mt-1 block">
                                    {thirdPrize.toFixed(2)} USDso
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Join Tournament Section (If Open) */}
                    {isOpen && (
                        <div className="rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-950/20 via-surface to-yellow-950/20 p-6 sm:p-8 backdrop-blur-xl space-y-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <TrophyIcon className="w-5 h-5 text-yellow-400" />
                                        <span>Enter {meta.name}</span>
                                    </h3>
                                    <p className="text-xs text-muted mt-1 max-w-xl leading-relaxed">
                                        Ante <strong className="text-white">{fmtUsd(season.entryFee)} USDso</strong> into the tournament escrow.
                                        Your address is registered on-chain for the season payout Merkle distribution upon tournament close.
                                    </p>
                                </div>

                                <div>
                                    {hasEntered ? (
                                        <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold shadow-sm">
                                            <CheckIcon className="w-4 h-4 text-emerald-400" />
                                            <span>Already Registered</span>
                                        </div>
                                    ) : !isConnected ? (
                                        <span className="text-xs text-brand-light">Connect wallet to enter</span>
                                    ) : needsApproval ? (
                                        <button
                                            onClick={handleApprove}
                                            className="px-5 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-xs font-bold text-black shadow-lg transition-all"
                                        >
                                            Step 1: Approve USDso
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleJoinSeason}
                                            disabled={isJoining}
                                            className="px-5 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-xs font-bold text-black shadow-lg transition-all disabled:opacity-50"
                                        >
                                            {isJoining ? 'Joining…' : `Join Tournament (${fmtUsd(season.entryFee)} USDso)`}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {errorMsg && (
                                <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-xs text-down">
                                    {errorMsg}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tournament Rules Box */}
                    <div className="rounded-2xl border border-border bg-surface/50 p-6 space-y-2 text-xs leading-relaxed text-muted">
                        <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-2">
                            <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                            <span>Tournament Format & Rules</span>
                        </h4>
                        <p>{meta.rules}</p>
                        <p className="text-[11px] pt-1">
                            • <strong>Live Scoring:</strong> All wagers placed on Wagr duels are tracked in real-time. Players with the highest Net PnL claim the top prize tiers.
                            <br />
                            • <strong>Trustless Settlement:</strong> When the tournament ends, the operator commits a cryptographic Merkle root over the top winners.
                            <br />
                            • <strong>No Double-Claim:</strong> Winners withdraw directly via on-chain Merkle proofs protected by OpenZeppelin BitMaps.
                        </p>
                    </div>

                    {/* Operator Finalize Modal */}
                    {showFinalizeModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                            <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 sm:p-8 space-y-5 shadow-2xl">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <TrophyIcon className="w-5 h-5 text-yellow-400" />
                                        <span>Finalize Tournament</span>
                                    </h3>
                                    <button
                                        onClick={() => setShowFinalizeModal(false)}
                                        className="text-muted hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <p className="text-xs text-muted leading-relaxed">
                                    This will finalize the tournament on-chain. The prize pool will be locked for the top leaderboard winners.
                                </p>

                                <div className="bg-bg/60 rounded-xl p-4 border border-border space-y-2 text-xs">
                                    <div className="text-[11px] uppercase tracking-wider text-muted font-bold">
                                        Winners from Leaderboard:
                                    </div>
                                    {leaderboard.slice(0, 3).map((w, idx) => (
                                        <div key={w.member} className="flex justify-between items-center font-mono">
                                            <span className="text-slate-300">
                                                #{idx + 1} {shortAddr(w.member)}
                                            </span>
                                            <span className="text-emerald-400 font-bold">
                                                {w.estimatedPrizeUsd.toFixed(2)} USDso
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={handleCommitPayouts}
                                        disabled={isFinalizing}
                                        className="w-full py-3.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 font-bold text-xs text-black transition-colors disabled:opacity-50 shadow-lg"
                                    >
                                        {isFinalizing ? 'Committing Merkle Root on Shannon…' : 'Confirm & Commit Payouts'}
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
