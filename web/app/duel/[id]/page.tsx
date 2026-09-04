'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits, maxUint256, type Address } from 'viem';
import { Nav } from '@/components/Nav';
import { Confetti } from '@/components/Confetti';
import { OutcomeModal } from '@/components/OutcomeModal';
import {
    WAGR_ESCROW,
    USDSO_TOKEN,
    escrowAbi,
    erc20Abi,
    binaryMarketAbi,
    publicClient,
    fmtUsd,
    shortAddr,
    getExplorerTxUrl,
    getExplorerAddressUrl,
    formatCountdown,
    sfx,
    VERIFIED_PROOF_TX,
    VERIFIED_PROOF_BLOCK,
} from '@/lib/wagr';
import {
    ZapIcon,
    RadioIcon,
    CopyIcon,
    CheckIcon,
    ExternalLinkIcon,
    SparklesIcon,
    CoinsIcon,
    ShieldCheckIcon,
    TrophyIcon,
    LockIcon,
    ClockIcon,
} from '@/components/Icons';

interface DuelState {
    alice: Address;
    stakeA: bigint;
    aliceSide: number; // 0 = UP, 1 = DOWN
    settled: boolean;
    bob: Address;
    stakeB: bigint;
    marketAddress: Address;
    createdAt: bigint;
    builder: Address;
    builderBps: number;
}

interface PreviewState {
    winner: Address;
    payout: bigint;
    voided: boolean;
    resolved: boolean;
}

export default function DuelRoomPage({ params }: { params: { id: string } }) {
    const duelId = BigInt(params.id || '1');
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [duel, setDuel] = useState<DuelState | null>(null);
    const [preview, setPreview] = useState<PreviewState | null>(null);
    const [marketExpiry, setMarketExpiry] = useState<number | null>(null);
    const [marketStatus, setMarketStatus] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    // TX states
    const [isAccepting, setIsAccepting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isSettling, setIsSettling] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Celebration & Outcome Modal
    const [celebrate, setCelebrate] = useState(false);
    const [showOutcomeModal, setShowOutcomeModal] = useState(false);
    const [hasAutoOpenedModal, setHasAutoOpenedModal] = useState(false);
    const [autoSettleTriggered, setAutoSettleTriggered] = useState(false);
    const [, setTick] = useState(0);

    // Live User USDso Allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    // Re-render countdown
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(iv);
    }, []);

    // Polling Duel State from Shannon
    useEffect(() => {
        let active = true;

        async function fetchDuelData() {
            try {
                const d = (await publicClient.readContract({
                    address: WAGR_ESCROW,
                    abi: escrowAbi,
                    functionName: 'getDuel',
                    args: [duelId],
                })) as any;

                if (!active) return;

                const wasSettled = duel?.settled ?? false;
                setDuel(d);
                setLoading(false);

                // Check for settlement transition -> celebrate!
                if (!wasSettled && d.settled) {
                    setCelebrate(true);
                    sfx.win();
                }

                // If marketAddress exists, inspect preview & expiry
                if (d.marketAddress && d.marketAddress !== '0x0000000000000000000000000000000000000000') {
                    try {
                        const [p, exp, st] = (await Promise.all([
                            publicClient.readContract({
                                address: WAGR_ESCROW,
                                abi: escrowAbi,
                                functionName: 'previewPayout',
                                args: [duelId],
                            }),
                            publicClient.readContract({
                                address: d.marketAddress,
                                abi: binaryMarketAbi,
                                functionName: 'expiry',
                            }),
                            publicClient.readContract({
                                address: d.marketAddress,
                                abi: binaryMarketAbi,
                                functionName: 'status',
                            }),
                        ])) as [any, bigint, number];

                        if (active) {
                            setPreview({
                                winner: p[0],
                                payout: p[1],
                                voided: p[2],
                                resolved: p[3],
                            });
                            setMarketExpiry(Number(exp));
                            setMarketStatus(Number(st));
                        }
                    } catch {
                        // BinaryMarket read fallback
                    }
                }
            } catch (err) {
                console.error('Failed to query duel #', duelId, err);
                if (active) setLoading(false);
            }
        }

        fetchDuelData();
        const interval = setInterval(fetchDuelData, 3000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [duelId, duel?.settled]);

    const isAlice = address && duel?.alice?.toLowerCase() === address.toLowerCase();
    const isBob = address && duel?.bob?.toLowerCase() === address.toLowerCase();
    const hasBob = !!duel?.bob && duel.bob !== '0x0000000000000000000000000000000000000000';
    const isParticipant = Boolean(isAlice || isBob);
    const isUnmatched = !hasBob;
    const isSettled = duel?.settled ?? false;

    const isUserWinner =
        !!preview?.winner && !!address && preview.winner.toLowerCase() === address.toLowerCase();
    const isUserLoser =
        Boolean(isParticipant && preview?.winner && !isUserWinner);

    // Automatically pop up the outcome modal the moment the oracle gives the outcome
    useEffect(() => {
        if (preview?.resolved && isParticipant && !hasAutoOpenedModal) {
            setHasAutoOpenedModal(true);
            setShowOutcomeModal(true);
        }
    }, [preview?.resolved, isParticipant, hasAutoOpenedModal]);

    // Zero-click background settlement relayer: attempt auto-settle as soon as market resolves
    useEffect(() => {
        if (preview?.resolved && hasBob && !isSettled && !autoSettleTriggered) {
            setAutoSettleTriggered(true);
            fetch('/api/settle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duelId: Number(duelId) }),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) {
                        console.log('Zero-click automated payout confirmed:', data.txHash);
                    }
                })
                .catch((err) => {
                    console.warn('Background auto-settle skipped, manual fallback available:', err);
                });
        }
    }, [preview?.resolved, hasBob, isSettled, autoSettleTriggered, duelId]);

    const now = Math.floor(Date.now() / 1000);
    const isMarketExpired =
        (marketExpiry !== null && now >= marketExpiry) ||
        (preview?.resolved ?? false) ||
        marketStatus === 4;

    const isOpen = isUnmatched && !isSettled && !isMarketExpired;
    const isExpiredUnmatched = isUnmatched && isMarketExpired && !isSettled;
    const isRefundedUnmatched = isUnmatched && isSettled;

    const needsApproval =
        allowance !== undefined && duel?.stakeA && (allowance as bigint) < duel.stakeA;

    // Actions
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

    async function handleAccept() {
        if (!duel) return;
        try {
            setErrorMsg(null);
            setIsAccepting(true);
            sfx.stake();
            await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'acceptDuel',
                args: [duelId, duel.stakeA],
            });
            sfx.win();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Accept failed');
        } finally {
            setIsAccepting(false);
        }
    }

    async function handleCancel() {
        try {
            setErrorMsg(null);
            setIsCancelling(true);
            sfx.tap();
            const hash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'cancelDuel',
                args: [duelId],
            });
            await publicClient.waitForTransactionReceipt({ hash });
            sfx.win();
            const d = (await publicClient.readContract({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'getDuel',
                args: [duelId],
            })) as any;
            setDuel(d);
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Cancel failed');
        } finally {
            setIsCancelling(false);
        }
    }

    async function handleSettle() {
        try {
            setErrorMsg(null);
            setIsSettling(true);
            sfx.tap();
            const hash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'settleDuel',
                args: [duelId],
            });
            await publicClient.waitForTransactionReceipt({ hash });
            setCelebrate(true);
            setShowOutcomeModal(true);
            const d = (await publicClient.readContract({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'getDuel',
                args: [duelId],
            })) as any;
            setDuel(d);
        } catch (err: any) {
            console.error('Settlement failed:', err);
            setErrorMsg(err?.shortMessage || err?.message || 'Settlement failed. Oracle might still be reporting.');
        } finally {
            setIsSettling(false);
        }
    }

    const copyShareLink = () => {
        sfx.tap();
        if (typeof window !== 'undefined') {
            navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) {
        return (
            <>
                <Nav />
                <main className="min-h-screen flex items-center justify-center p-4">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                        <span className="text-xs text-muted font-mono">Querying Duel #{params.id} on Shannon…</span>
                    </div>
                </main>
            </>
        );
    }

    if (!duel || duel.alice === '0x0000000000000000000000000000000000000000') {
        return (
            <>
                <Nav />
                <main className="min-h-screen flex items-center justify-center p-4">
                    <div className="text-center max-w-md">
                        <div className="rounded-2xl border border-border bg-surface p-8">
                            <h2 className="text-lg font-bold text-white">Duel #{params.id} Not Found</h2>
                            <p className="text-xs text-muted mt-2">
                                No duel exists on Shannon with this ID yet. Create a fresh duel to get started.
                            </p>
                            <Link
                                href="/create"
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-xs font-semibold text-white"
                            >
                                <ZapIcon className="w-4 h-4" />
                                <span>Create Duel</span>
                            </Link>
                        </div>
                    </div>
                </main>
            </>
        );
    }

    const statusPill = isRefundedUnmatched
        ? { text: 'Expired & Refunded', color: 'bg-slate-500/10 text-slate-300 border-slate-500/30' }
        : isExpiredUnmatched
        ? { text: 'Expired — No Opponent', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
        : isSettled
        ? { text: 'Settled on Shannon', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
        : isOpen
        ? { text: 'Open for Taker', color: 'bg-brand/10 text-brand-light border-brand/30' }
        : marketStatus === 4
        ? { text: 'Oracle Resolved', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' }
        : { text: 'Active Trading Window', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <Confetti active={celebrate} />
            <OutcomeModal
                isOpen={showOutcomeModal}
                onClose={() => setShowOutcomeModal(false)}
                isWinner={isUserWinner}
                duelId={Number(duelId)}
                payout={preview?.payout ?? (duel.stakeA + duel.stakeB)}
                stake={isAlice ? duel.stakeA : duel.stakeB}
                opponentAddress={isAlice ? duel.bob : duel.alice}
                isSettled={isSettled}
                isSettling={isSettling}
                onSettle={handleSettle}
            />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-3xl mx-auto space-y-6">
                    {/* Top Status & Share Bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${statusPill.color}`}>
                                {statusPill.text}
                            </span>
                            <span className="font-mono text-xs text-muted">Duel #{params.id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={copyShareLink}
                                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover px-3 py-1.5 text-xs font-medium text-white transition-colors"
                            >
                                {copied ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                <span>{copied ? 'Copied Link!' : 'Share Challenge Link'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Banner for Expired & Refunded (Unmatched) */}
                    {isRefundedUnmatched && (
                        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-5">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-slate-400" />
                                        <h3 className="text-sm font-bold text-white">
                                            Duel Expired with No Opponent — Full Stake Returned
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-300">
                                        The DreamDEX trading window closed without a challenger. The maker&apos;s full betting amount of <strong className="text-white">{fmtUsd(duel.stakeA)} USDso</strong> was returned to {isAlice ? 'your wallet' : shortAddr(duel.alice)} with zero platform fees.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={getExplorerAddressUrl(WAGR_ESCROW)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors"
                                    >
                                        <span>View Escrow on Explorer</span>
                                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Banner for Expired Without Opponents (Pending Reclaim) */}
                    {isExpiredUnmatched && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5">
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                        <h3 className="text-sm font-bold text-white">
                                            Trading Window Closed — No Opponent Joined
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-300">
                                        The DreamDEX prediction window closed without a taker. The maker&apos;s full betting amount of <strong className="text-amber-300">{fmtUsd(duel.stakeA)} USDso</strong> is available to be returned with zero platform fees.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isAlice ? (
                                        <button
                                            onClick={handleCancel}
                                            disabled={isCancelling}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-black transition-colors disabled:opacity-50"
                                        >
                                            <span>{isCancelling ? 'Returning to Wallet…' : `Reclaim ${fmtUsd(duel.stakeA)} USDso`}</span>
                                        </button>
                                    ) : (
                                        <span className="text-xs text-muted font-mono px-3 py-1.5 rounded-lg bg-surface border border-border">
                                            Maker Can Reclaim
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Settled Matched Duel Banner */}
                    {isSettled && hasBob && (
                        <div
                            className={`rounded-2xl border p-5 transition-all ${
                                isUserWinner
                                    ? 'border-emerald-500/40 bg-emerald-950/25 shadow-[0_0_35px_rgba(16,185,129,0.15)]'
                                    : isUserLoser
                                    ? 'border-rose-500/40 bg-rose-950/25 shadow-[0_0_35px_rgba(244,63,94,0.15)]'
                                    : 'border-slate-700/50 bg-slate-900/30'
                            }`}
                        >
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`h-2.5 w-2.5 rounded-full ${
                                                isUserWinner
                                                    ? 'bg-emerald-400 animate-pulse'
                                                    : isUserLoser
                                                    ? 'bg-rose-500'
                                                    : 'bg-slate-400'
                                            }`}
                                        />
                                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                            {isUserWinner ? (
                                                <>
                                                    <SparklesIcon className="w-4 h-4 text-emerald-400" />
                                                    <span>🎉 You Won! Received {fmtUsd(preview?.payout || duel.stakeA + duel.stakeB)} USDso</span>
                                                </>
                                            ) : isUserLoser ? (
                                                <>
                                                    <span>💀</span>
                                                    <span>Round Lost — Winner: {shortAddr(preview?.winner)} ({fmtUsd(preview?.payout || duel.stakeA + duel.stakeB)} USDso)</span>
                                                </>
                                            ) : preview?.voided ? (
                                                <span>Market Voided — Stakes Refunded</span>
                                            ) : (
                                                <span>Settled — Winner: {shortAddr(preview?.winner)} ({fmtUsd(preview?.payout || 0)} USDso)</span>
                                            )}
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-300">
                                        {isUserWinner
                                            ? `The prediction resolved in your favor! The ${fmtUsd(preview?.payout || duel.stakeA + duel.stakeB)} USDso pot was paid directly into your wallet on Shannon.`
                                            : isUserLoser
                                            ? `The prediction resolved against your side. Your ${fmtUsd(isAlice ? duel.stakeA : duel.stakeB)} USDso stake was awarded to ${shortAddr(preview?.winner)}.`
                                            : `Underlying DreamDEX market closed. Wager settled directly via WagrEscrow.`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    <button
                                        onClick={() => setShowOutcomeModal(true)}
                                        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-black transition-all shadow-sm ${
                                            isUserWinner
                                                ? 'bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-300 hover:from-amber-500 hover:to-teal-400 text-black shadow-brand-glow'
                                                : isUserLoser
                                                ? 'bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 hover:from-rose-700 hover:to-orange-600 text-white shadow-brand-glow'
                                                : 'bg-surface hover:bg-surface-hover border border-border text-white'
                                        }`}
                                    >
                                        {isUserWinner ? (
                                            <>
                                                <TrophyIcon className="w-3.5 h-3.5" />
                                                <span>View Victory Celebration</span>
                                            </>
                                        ) : isUserLoser ? (
                                            <>
                                                <span>💀</span>
                                                <span>View Defeat & Revenge 🔥</span>
                                            </>
                                        ) : (
                                            <span>View Outcome</span>
                                        )}
                                    </button>
                                    <a
                                        href={getExplorerAddressUrl(WAGR_ESCROW)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border px-3.5 py-2 text-xs font-semibold text-white transition-colors"
                                    >
                                        <span>Escrow Explorer</span>
                                        <ExternalLinkIcon className="w-3.5 h-3.5 text-muted" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VS Battle Arena Card */}
                    <div className="clean-card rounded-2xl p-6 sm:p-7 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-11 gap-5 items-center">
                            {/* Alice (Maker) Card */}
                            <div className="md:col-span-5 rounded-xl bg-bg p-5 border border-border flex flex-col justify-between h-full">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                                            Challenger (Maker)
                                        </span>
                                        {isAlice && (
                                            <span className="px-2 py-0.5 rounded bg-brand/20 text-brand-light text-[10px] font-bold">
                                                YOU
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand to-purple-400 flex items-center justify-center font-bold text-xs text-white">
                                            A
                                        </div>
                                        <a
                                            href={getExplorerAddressUrl(duel.alice)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-xs font-semibold text-white hover:text-brand-light flex items-center gap-1"
                                        >
                                            <span>{shortAddr(duel.alice)}</span>
                                            <ExternalLinkIcon className="w-3 h-3 text-muted" />
                                        </a>
                                    </div>

                                    {/* Prediction Pick */}
                                    <div className="mt-6">
                                        <div className="text-xs text-muted">Prediction Pick:</div>
                                        <div className={`mt-1 text-2xl font-extrabold tracking-tight ${duel.aliceSide === 0 ? 'text-up' : 'text-down'}`}>
                                            {duel.aliceSide === 0 ? '▲ UP (YES)' : '▼ DOWN (NO)'}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 pt-4 border-t border-border/60 flex items-baseline justify-between">
                                    <span className="text-xs text-muted">Escrow Stake:</span>
                                    <span className="font-mono font-bold text-lg text-white">
                                        {fmtUsd(duel.stakeA)} USDso
                                    </span>
                                </div>
                            </div>

                            {/* Center VS Element */}
                            <div className="md:col-span-1 flex flex-col items-center justify-center">
                                <div className="h-11 w-11 rounded-full bg-gradient-to-tr from-brand-deep to-brand shadow-brand-glow flex items-center justify-center font-black text-sm text-white">
                                    VS
                                </div>
                                <div className="text-[10px] font-mono text-muted uppercase mt-2">
                                    1:1 Pot
                                </div>
                            </div>

                            {/* Bob (Taker) Card */}
                            <div className="md:col-span-5 rounded-2xl border border-border/80 bg-bg/60 p-6 flex flex-col justify-between h-full">
                                <div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                                            Opponent (Taker)
                                        </span>
                                        {isBob && (
                                            <span className="px-2 py-0.5 rounded bg-brand/20 text-brand-light text-[10px] font-bold">
                                                YOU
                                            </span>
                                        )}
                                    </div>

                                    {isUnmatched ? (
                                        <div className="mt-3 py-6 text-center">
                                            {isMarketExpired ? (
                                                <div className="space-y-1">
                                                    <span className="text-xs font-bold text-amber-400">
                                                        Trading Window Closed
                                                    </span>
                                                    <p className="text-[11px] text-muted">
                                                        No opponent matched before the DreamDEX window expired.
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-medium text-muted">
                                                    Waiting for challenger to accept…
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center font-bold text-xs text-black">
                                                    B
                                                </div>
                                                <a
                                                    href={getExplorerAddressUrl(duel.bob)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="font-mono text-xs font-semibold text-white hover:text-brand-light flex items-center gap-1"
                                                >
                                                    <span>{shortAddr(duel.bob)}</span>
                                                    <ExternalLinkIcon className="w-3 h-3 text-muted" />
                                                </a>
                                            </div>

                                            {/* Opposite Pick */}
                                            <div className="mt-6">
                                                <div className="text-xs text-muted">Prediction Pick:</div>
                                                <div className={`mt-1 text-2xl font-extrabold tracking-tight ${1 - duel.aliceSide === 0 ? 'text-up' : 'text-down'}`}>
                                                    {1 - duel.aliceSide === 0 ? '▲ UP (YES)' : '▼ DOWN (NO)'}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="mt-6 pt-4 border-t border-border/60 flex items-baseline justify-between">
                                    <span className="text-xs text-muted">Required Stake:</span>
                                    <span className="font-mono font-bold text-lg text-white">
                                        {fmtUsd(duel.stakeA)} USDso
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Telemetry Bar: Market & Pot Details */}
                        <div className="mt-8 pt-6 border-t border-border/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div className="rounded-xl bg-bg/50 p-3.5 border border-border/60">
                                <div className="text-muted">DreamDEX Market:</div>
                                <div className="font-mono font-semibold text-white mt-1 flex items-center gap-1">
                                    <span>{shortAddr(duel.marketAddress)}</span>
                                    <a
                                        href={getExplorerAddressUrl(duel.marketAddress)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="hover:text-brand-light"
                                    >
                                        <ExternalLinkIcon className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>

                            <div className="rounded-xl bg-bg/50 p-3.5 border border-border/60">
                                <div className="text-muted">Total Pot (Wagered):</div>
                                <div className="font-mono font-bold text-white text-sm mt-1">
                                    {fmtUsd(duel.stakeA + (duel.bob !== '0x0000000000000000000000000000000000000000' ? duel.stakeB : duel.stakeA))} USDso
                                </div>
                            </div>

                            <div className="rounded-xl bg-bg/50 p-3.5 border border-border/60">
                                <div className="text-muted">Window Expiry Countdown:</div>
                                <div className="font-mono font-semibold text-cyan-400 mt-1">
                                    {marketExpiry ? formatCountdown(marketExpiry) : 'Live Window'}
                                </div>
                            </div>
                        </div>

                        {/* Error Notification */}
                        {errorMsg && (
                            <div className="mt-4 rounded-xl border border-down/40 bg-down/10 p-3 text-xs text-down">
                                {errorMsg}
                            </div>
                        )}

                        {/* Actions for Takers & Maker */}
                        <div className="mt-6 pt-4">
                            {isOpen && !isAlice && (
                                <div>
                                    {!isConnected ? (
                                        <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-center text-xs text-brand-light">
                                            Connect wallet above to accept this challenge for {fmtUsd(duel.stakeA)} USDso.
                                        </div>
                                    ) : needsApproval ? (
                                        <button
                                            onClick={handleApprove}
                                            className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-deep font-bold text-sm text-white shadow-brand-glow transition-all"
                                        >
                                            Step 1: Approve USDso to Match Wager
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleAccept}
                                            disabled={isAccepting}
                                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand to-cyan-500 hover:from-brand-deep hover:to-cyan-600 font-bold text-sm text-white shadow-brand-glow transition-all disabled:opacity-50"
                                        >
                                            {isAccepting ? 'Matching Wager in Contract…' : `Accept Duel for ${fmtUsd(duel.stakeA)} USDso`}
                                        </button>
                                    )}
                                </div>
                            )}

                            {isOpen && isAlice && (
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-bg/60 p-4">
                                    <div className="text-xs text-muted">
                                        Your duel is live and awaiting an opponent. You can cancel and reclaim your full stake if unaccepted.
                                    </div>
                                    <button
                                        onClick={handleCancel}
                                        disabled={isCancelling}
                                        className="rounded-xl border border-down/40 bg-down/10 hover:bg-down/20 text-down px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 self-end sm:self-auto"
                                    >
                                        {isCancelling ? 'Cancelling…' : 'Cancel Duel'}
                                    </button>
                                </div>
                            )}

                            {/* Expired Without Opponents (Pending Reclaim) */}
                            {isExpiredUnmatched && (
                                <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 space-y-3">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                                <h4 className="font-bold text-white text-sm">
                                                    Trading Window Closed — No Opponent Joined
                                                </h4>
                                            </div>
                                            <p className="text-xs text-slate-300">
                                                The DreamDEX market closed without a challenger. The maker&apos;s full betting amount of{' '}
                                                <strong className="text-amber-300">{fmtUsd(duel.stakeA)} USDso</strong> is safely held in WagrEscrow.
                                                {isAlice ? ' Click below to return your funds directly to your wallet.' : ' Only the creator can reclaim the deposited funds.'}
                                            </p>
                                        </div>
                                        {isAlice ? (
                                            <button
                                                onClick={handleCancel}
                                                disabled={isCancelling}
                                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-500 font-bold text-xs text-black shadow-lg transition-all disabled:opacity-50"
                                            >
                                                <CoinsIcon className="w-4 h-4" />
                                                <span>{isCancelling ? 'Returning Funds…' : `Reclaim Full Stake (${fmtUsd(duel.stakeA)} USDso)`}</span>
                                            </button>
                                        ) : (
                                            <span className="text-xs text-muted font-mono px-4 py-2 rounded-xl bg-surface border border-border">
                                                Awaiting Maker Reclaim
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Expired and Already Refunded */}
                            {isRefundedUnmatched && (
                                <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="text-xs text-slate-300">
                                        This duel expired without an opponent. The full betting amount of <strong className="text-white">{fmtUsd(duel.stakeA)} USDso</strong> has been returned to {isAlice ? 'your wallet' : shortAddr(duel.alice)}.
                                    </div>
                                    <span className="text-xs font-semibold text-slate-400 font-mono px-3 py-1 rounded bg-surface border border-border self-end sm:self-auto">
                                        Stake Returned
                                    </span>
                                </div>
                            )}

                            {/* Matched Duel Settlement Action Card */}
                            {hasBob && !isSettled && (
                                <div
                                    className={`rounded-2xl border p-5 sm:p-6 space-y-4 transition-all ${
                                        preview?.resolved
                                            ? 'border-emerald-500/50 bg-emerald-950/25 shadow-brand-glow'
                                            : 'border-cyan-500/30 bg-cyan-950/15'
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="space-y-1.5 max-w-xl">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`h-2.5 w-2.5 rounded-full ${
                                                        preview?.resolved
                                                            ? 'bg-emerald-400 animate-pulse'
                                                            : 'bg-cyan-400 animate-ping'
                                                    }`}
                                                />
                                                <h4 className="font-bold text-white text-sm sm:text-base">
                                                    {preview?.resolved
                                                        ? 'Market Resolved by DreamDEX Oracle'
                                                        : 'Trading Window In Progress'}
                                                </h4>
                                                {!preview?.resolved && marketExpiry && (
                                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold">
                                                        {formatCountdown(marketExpiry)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-300 leading-relaxed">
                                                {preview?.resolved
                                                    ? `Oracle resolution confirmed! Winner verified: ${shortAddr(
                                                          preview.winner
                                                      )} (${
                                                          address &&
                                                          preview.winner.toLowerCase() ===
                                                              address.toLowerCase()
                                                              ? '🎉 YOU WON!'
                                                              : 'Opponent won'
                                                      }). Payout of ${fmtUsd(
                                                          preview.payout
                                                      )} USDso is ready. Click below to execute settlement.`
                                                    : 'Both players have deposited their stakes into WagrEscrow. The DreamDEX price window is currently live. When the price window closes and the oracle resolves the outcome, the settlement button will unlock.'}
                                            </p>
                                        </div>

                                        {preview?.resolved ? (
                                            <button
                                                onClick={handleSettle}
                                                disabled={isSettling}
                                                className="w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 font-bold text-xs text-black shadow-brand-glow transition-all disabled:opacity-50"
                                            >
                                                <SparklesIcon className="w-4 h-4" />
                                                <span>
                                                    {isSettling
                                                        ? 'Executing Settlement…'
                                                        : `Settle Duel & Pay Winner (${fmtUsd(
                                                              duel.stakeA + duel.stakeB
                                                          )} USDso)`}
                                                </span>
                                            </button>
                                        ) : (
                                            <button
                                                disabled={true}
                                                className="w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-border/80 bg-surface/60 text-muted font-semibold text-xs cursor-not-allowed opacity-60"
                                            >
                                                <LockIcon className="w-4 h-4 text-muted" />
                                                <span>Awaiting Market Resolution…</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
