'use client';

import React, { useState, useEffect } from 'react';
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
} from '@/lib/wagr';
import {
    TrophyIcon,
    UsersIcon,
    CoinsIcon,
    CheckIcon,
    ExternalLinkIcon,
    ShieldCheckIcon,
    SparklesIcon,
} from '@/components/Icons';

interface SeasonData {
    operator: Address;
    pool: bigint;
    startedAt: bigint;
    closedAt: bigint;
    entryFee: bigint;
    payoutRoot: string;
}

interface MemberEvent {
    member: Address;
    fee: bigint;
    blockNumber: bigint;
}

export default function SeasonDetailPage({ params }: { params: { id: string } }) {
    const seasonId = BigInt(params.id || '1');
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [season, setSeason] = useState<SeasonData | null>(null);
    const [members, setMembers] = useState<MemberEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [isJoining, setIsJoining] = useState(false);
    const [hasEntered, setHasEntered] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Live USDso Allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_SEASON] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

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

                setSeason({
                    operator: s[0],
                    pool: s[1],
                    startedAt: s[2],
                    closedAt: s[3],
                    entryFee: s[4],
                    payoutRoot: s[5],
                });

                // Check if connected address has joined
                if (address) {
                    const isJoined = (await publicClient.readContract({
                        address: WAGR_SEASON,
                        abi: seasonAbi,
                        functionName: 'entered',
                        args: [seasonId, address],
                    })) as boolean;
                    if (active) setHasEntered(isJoined);
                }

                // Query live SeasonJoined events for real member list
                try {
                    const logs = await publicClient.getContractEvents({
                        address: WAGR_SEASON,
                        abi: seasonAbi,
                        eventName: 'SeasonJoined',
                        args: { seasonId: seasonId },
                        fromBlock: 0n,
                    });

                    if (active && logs) {
                        const parsedMembers: MemberEvent[] = logs.map((log: any) => ({
                            member: log.args.member,
                            fee: log.args.fee,
                            blockNumber: log.blockNumber,
                        }));
                        setMembers(parsedMembers);
                    }
                } catch {
                    // Log query fallback
                }

                if (active) setLoading(false);
            } catch (err) {
                console.error('Failed to query season details:', err);
                if (active) setLoading(false);
            }
        }

        fetchSeasonDetails();
        const iv = setInterval(fetchSeasonDetails, 4000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, [seasonId, address]);

    const isOpen =
        season?.payoutRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';

    const needsApproval =
        allowance !== undefined && season?.entryFee && (allowance as bigint) < season.entryFee;

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
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Failed to join season');
        } finally {
            setIsJoining(false);
        }
    }

    if (loading) {
        return (
            <>
                <Nav />
                <main className="min-h-screen flex items-center justify-center p-4">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
                        <span className="text-xs text-muted font-mono">Loading Season #{params.id} from Shannon…</span>
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
                            <h2 className="text-lg font-bold text-white">Season #{params.id} Not Found</h2>
                            <p className="text-xs text-muted mt-2">
                                No on-chain season has been deployed with this ID yet.
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
                                    {isOpen ? 'Open / Accepting Players' : 'Finalized (Merkle Closed)'}
                                </span>
                                <span className="font-mono text-xs text-muted">ID #{params.id}</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                                Tournament Season #{params.id}
                            </h1>
                            <p className="text-xs text-muted mt-1">
                                Operator:{' '}
                                <a
                                    href={getExplorerAddressUrl(season.operator)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-mono text-white hover:text-yellow-400 underline"
                                >
                                    {shortAddr(season.operator)}
                                </a>
                            </p>
                        </div>

                        {/* Total Pool Stat */}
                        <div className="text-left sm:text-right clean-card rounded-xl p-4">
                            <div className="text-xs uppercase text-muted font-semibold tracking-wider">Total Prize Pool</div>
                            <div className="text-2xl font-mono font-bold text-emerald-400 mt-0.5">
                                {fmtUsd(season.pool)} USDso
                            </div>
                        </div>
                    </div>

                    {/* Tournament Info Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="clean-card rounded-xl p-5">
                            <span className="text-xs text-muted uppercase font-semibold tracking-wider">Required Entry Fee</span>
                            <div className="mt-2 text-lg font-mono font-semibold text-white">
                                {fmtUsd(season.entryFee)} USDso
                            </div>
                            <div className="text-[11px] text-muted mt-1">Matches exact entry ante</div>
                        </div>

                        <div className="clean-card rounded-xl p-5">
                            <span className="text-xs text-muted uppercase font-semibold tracking-wider">On-Chain Entrants</span>
                            <div className="mt-2 text-lg font-mono font-semibold text-cyan-400">
                                {members.length} {members.length === 1 ? 'Player' : 'Players'}
                            </div>
                            <div className="text-[11px] text-muted mt-1">Verified on Shannon</div>
                        </div>

                        <div className="rounded-2xl border border-border bg-surface/60 p-5 backdrop-blur-md">
                            <span className="text-xs text-muted uppercase font-bold tracking-wider">Settlement Mechanism</span>
                            <div className="mt-2 text-sm font-bold text-purple-300">
                                Merkle-Proof Pull
                            </div>
                            <div className="text-[11px] text-muted mt-1">BitMaps double-claim safe</div>
                        </div>
                    </div>

                    {/* Join Tournament Section */}
                    {isOpen && (
                        <div className="rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-950/20 via-surface to-yellow-950/20 p-6 sm:p-8 backdrop-blur-xl space-y-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <TrophyIcon className="w-5 h-5 text-yellow-400" />
                                        <span>Enter Season #{params.id}</span>
                                    </h3>
                                    <p className="text-xs text-muted mt-1 max-w-xl">
                                        Ante <strong className="text-white">{fmtUsd(season.entryFee)} USDso</strong> into the tournament escrow.
                                        Your address will be registered on-chain for the season payout Merkle distribution.
                                    </p>
                                </div>

                                <div>
                                    {hasEntered ? (
                                        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                                            <CheckIcon className="w-4 h-4" />
                                            <span>Already Entered</span>
                                        </div>
                                    ) : !isConnected ? (
                                        <span className="text-xs text-brand-light">Connect wallet to join</span>
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

                    {/* Real On-Chain Members Feed (No Placeholder Data!) */}
                    <div className="rounded-3xl border border-border bg-surface/80 p-6 sm:p-8 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <UsersIcon className="w-4 h-4 text-cyan-400" />
                                <span>Verified Entrants ({members.length})</span>
                            </h3>
                            <span className="text-[11px] text-muted">Real on-chain logs</span>
                        </div>

                        {members.length === 0 ? (
                            <div className="py-8 text-center bg-bg/40 rounded-2xl border border-border/60">
                                <span className="text-xs text-muted">
                                    No players have joined this season yet. Be the first to join the pool above!
                                </span>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60">
                                {members.map((m, idx) => (
                                    <div
                                        key={m.member + idx}
                                        className="py-3 flex items-center justify-between text-xs"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-muted text-xs">#{idx + 1}</span>
                                            <a
                                                href={getExplorerAddressUrl(m.member)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="font-mono font-semibold text-white hover:text-brand-light flex items-center gap-1"
                                            >
                                                <span>{shortAddr(m.member)}</span>
                                                <ExternalLinkIcon className="w-3 h-3 text-muted" />
                                            </a>
                                            {address && m.member.toLowerCase() === address.toLowerCase() && (
                                                <span className="px-1.5 py-0.5 rounded bg-brand/20 text-brand-light text-[10px] font-bold">
                                                    YOU
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-mono text-emerald-400 font-semibold">
                                                +{fmtUsd(m.fee)} USDso
                                            </span>
                                            <span className="font-mono text-[10px] text-muted">
                                                Block #{m.blockNumber.toString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
