'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { type Address } from 'viem';
import { Confetti } from './Confetti';
import { fmtUsd, shortAddr, sfx } from '@/lib/wagr';
import {
    TrophyIcon,
    ZapIcon,
    SparklesIcon,
    CheckIcon,
    CopyIcon,
    ArrowRightIcon,
    CoinsIcon,
} from './Icons';

export interface OutcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
    isWinner: boolean;
    duelId: number;
    payout: bigint;
    stake: bigint;
    opponentAddress?: Address;
    marketSymbol?: string;
    isSettled?: boolean;
    isSettling?: boolean;
    onSettle?: () => void;
}

export function OutcomeModal({
    isOpen,
    onClose,
    isWinner,
    duelId,
    payout,
    stake,
    opponentAddress,
    marketSymbol,
    isSettled = true,
    isSettling = false,
    onSettle,
}: OutcomeModalProps) {
    const [copied, setCopied] = useState(false);
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        if (!isOpen) return;

        // Trigger dopamine sound
        if (isWinner) {
            sfx.bigWin();
        } else {
            sfx.lose();
        }

        // Ticker count-up animation for winning payout
        if (isWinner && payout > 0n) {
            const target = Number(payout) / 1e6;
            let start = 0;
            const duration = 1200; // 1.2s
            const startTime = performance.now();

            const step = (now: number) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = start + (target - start) * eased;
                setCounter(current);

                if (progress < 1) {
                    requestAnimationFrame(step);
                }
            };
            requestAnimationFrame(step);
        }
    }, [isOpen, isWinner, payout]);

    if (!isOpen) return null;

    const netProfit = payout > stake ? payout - stake : 0n;

    const handleShare = () => {
        sfx.tap();
        if (typeof window !== 'undefined') {
            const text = isWinner
                ? `🏆 Just won ${fmtUsd(payout)} USDso in a 1-v-1 prediction duel on @WagrApp! Direct push payout, zero manual claim vouchers required. Who wants next? ${window.location.origin}/duel/${duelId}`
                : `💀 Just got clipped in duel #${duelId} on @WagrApp. Running it back immediately! ${window.location.origin}/create`;
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Confetti cannon for winners */}
            {isWinner && <Confetti active={isOpen} />}

            {/* Backdrop with frosted blur */}
            <div
                onClick={onClose}
                className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
            />

            {/* Modal Card */}
            <div
                className={`relative w-full max-w-lg rounded-3xl p-6 sm:p-8 overflow-hidden shadow-2xl transition-all animate-in zoom-in-95 duration-300 border ${
                    isWinner
                        ? 'border-emerald-500/60 bg-gradient-to-b from-[#0e241b] via-bg-elevated to-bg ring-4 ring-emerald-500/20 shadow-[0_0_90px_rgba(16,185,129,0.35)]'
                        : 'border-rose-500/50 bg-gradient-to-b from-[#260e15] via-bg-elevated to-bg ring-4 ring-rose-500/20 shadow-[0_0_90px_rgba(244,63,94,0.3)]'
                }`}
            >
                {/* Ambient Radial Spotlight */}
                <div
                    className={`absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
                        isWinner ? 'bg-emerald-500/25' : 'bg-rose-500/20'
                    }`}
                />

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-muted hover:text-white transition-colors z-10"
                >
                    ✕
                </button>

                <div className="relative z-10 text-center space-y-6">
                    {/* Hero Graphic */}
                    <div className="relative mx-auto flex items-center justify-center">
                        {isWinner ? (
                            <div className="relative">
                                {/* Rotating Golden Sunburst */}
                                <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-tr from-amber-400/20 to-emerald-400/30 blur-md animate-pulse" />
                                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl bg-gradient-to-tr from-amber-500 via-emerald-400 to-teal-300 p-0.5 shadow-brand-glow flex items-center justify-center">
                                    <div className="h-full w-full rounded-[22px] bg-bg flex items-center justify-center">
                                        <TrophyIcon className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="absolute inset-0 -m-4 rounded-full bg-rose-500/20 blur-md animate-pulse" />
                                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl bg-gradient-to-tr from-rose-600 to-red-400 p-0.5 shadow-2xl flex items-center justify-center">
                                    <div className="h-full w-full rounded-[22px] bg-bg flex items-center justify-center">
                                        <span className="text-4xl sm:text-5xl">💀</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Headings */}
                    <div className="space-y-1.5">
                        <div
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${
                                isWinner
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                                    : 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                            }`}
                        >
                            {isWinner
                                ? isSettled
                                    ? '🎉 100% PROFIT DEPOSITED'
                                    : '🎯 ORACLE RESOLVED — YOU WON'
                                : isSettled
                                ? '💀 MATCH SETTLED'
                                : '⚡ ORACLE RESOLVED'}
                        </div>

                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">
                            {isWinner
                                ? isSettled
                                    ? 'Victory Secured!'
                                    : 'Oracle Resolved: You Won!'
                                : 'Defeated This Round'}
                        </h2>

                        <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
                            {isWinner
                                ? isSettled
                                    ? 'Your prediction hit the target! The payout was pushed directly into your wallet — zero manual claim vouchers required.'
                                    : 'DreamDEX oracle confirmed your prediction! Click below to execute settlement and push the pot to your wallet.'
                                : 'The DreamDEX window swung against your side this time. The next price window is already forming.'}
                        </p>
                    </div>

                    {/* Giant Payout Display */}
                    {isWinner ? (
                        <div className="rounded-2xl bg-black/40 border border-emerald-500/30 p-5 space-y-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/80">
                                Total Payout Deposited
                            </span>
                            <div className="font-mono text-3xl sm:text-4xl font-extrabold text-emerald-400 drop-shadow-[0_0_25px_rgba(52,211,153,0.6)]">
                                +{counter > 0 ? counter.toFixed(2) : fmtUsd(payout)} USDso
                            </div>
                            <div className="text-[11px] text-muted flex items-center justify-center gap-2 pt-1 font-mono">
                                <span>Stake: {fmtUsd(stake)}</span>
                                <span>•</span>
                                <span className="text-emerald-300 font-semibold">
                                    Net Win: +{fmtUsd(netProfit)} USDso
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl bg-black/40 border border-rose-500/30 p-5 space-y-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400/80">
                                Stake Lost in Duel #{duelId}
                            </span>
                            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-rose-400">
                                -{fmtUsd(stake)} USDso
                            </div>
                            {opponentAddress && (
                                <div className="text-[11px] text-muted font-mono pt-1">
                                    Won by {shortAddr(opponentAddress)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-3 pt-2">
                        {isWinner ? (
                            <>
                                {!isSettled && onSettle ? (
                                    <button
                                        onClick={onSettle}
                                        disabled={isSettling}
                                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 font-extrabold text-xs sm:text-sm text-black shadow-brand-glow transition-all flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-50"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                        <span>
                                            {isSettling
                                                ? 'Executing Settlement…'
                                                : `Execute Payout (${fmtUsd(payout)} USDso)`}
                                        </span>
                                    </button>
                                ) : (
                                    <Link
                                        href="/create"
                                        onClick={() => {
                                            sfx.tap();
                                            onClose();
                                        }}
                                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 font-extrabold text-xs sm:text-sm text-black shadow-brand-glow transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
                                    >
                                        <ZapIcon className="w-4 h-4" />
                                        <span>Challenge Next Opponent</span>
                                    </Link>
                                )}

                                <button
                                    onClick={handleShare}
                                    className="w-full py-3 rounded-2xl border border-border bg-surface hover:bg-surface-hover text-xs font-bold text-white transition-colors flex items-center justify-center gap-2"
                                >
                                    {copied ? (
                                        <>
                                            <CheckIcon className="w-4 h-4 text-emerald-400" />
                                            <span>Brag Link Copied to Clipboard!</span>
                                        </>
                                    ) : (
                                        <>
                                            <CopyIcon className="w-4 h-4" />
                                            <span>Copy Brag Post for Twitter / X</span>
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    href="/create"
                                    onClick={() => {
                                        sfx.tap();
                                        onClose();
                                    }}
                                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 hover:from-rose-700 hover:to-orange-600 font-black text-xs sm:text-sm text-white shadow-brand-glow transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
                                >
                                    <ZapIcon className="w-4 h-4" />
                                    <span>Run It Back (Revenge Duel) 🔥</span>
                                </Link>

                                <Link
                                    href="/markets"
                                    onClick={() => {
                                        sfx.tap();
                                        onClose();
                                    }}
                                    className="w-full py-3 rounded-2xl border border-border bg-surface hover:bg-surface-hover text-xs font-bold text-white transition-colors flex items-center justify-center gap-2"
                                >
                                    <span>Browse Live DreamDEX Windows</span>
                                    <ArrowRightIcon className="w-4 h-4" />
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
