'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { LiveCounter } from '@/components/LiveCounter';
import { LiveCountdown } from '@/components/LiveCountdown';
import { useActiveMarkets } from '@/hooks/useActiveMarkets';
import {
    fmtUsd,
    formatCountdown,
    getExplorerTxUrl,
    VERIFIED_PROOF_TX,
    sfx,
} from '@/lib/wagr';
import {
    ZapIcon,
    RadioIcon,
    ArrowRightIcon,
    ShieldCheckIcon,
    TrophyIcon,
    UsersIcon,
    ExternalLinkIcon,
    SparklesIcon,
    CheckIcon,
} from '@/components/Icons';
import {
    getTelegramStartParam,
    parseDuelIdFromStartParam,
    isStartParamConsumed,
    markTelegramStartParamConsumed,
} from '@/lib/telegram';

export default function HomePage() {
    const [demoSide, setDemoSide] = useState<'UP' | 'DOWN'>('UP');
    const [demoStake, setDemoStake] = useState('25');
    const { markets: activeMarkets, loading: marketsLoading } = useActiveMarkets();
    const topMarkets = activeMarkets.slice(0, 4);
    const [incomingDuelId, setIncomingDuelId] = useState<string | null>(null);

    useEffect(() => {
        const checkStartParam = () => {
            const startParam = getTelegramStartParam();
            const duelId = parseDuelIdFromStartParam(startParam);
            if (duelId && !isStartParamConsumed(duelId)) {
                markTelegramStartParamConsumed(duelId);
                setIncomingDuelId(duelId);
                const target = `/duel/${duelId}`;
                if (typeof window !== 'undefined' && window.location.pathname !== target) {
                    window.location.replace(target);
                }
            }
        };

        checkStartParam();
        const interval = setInterval(checkStartParam, 150);
        const timeout = setTimeout(() => clearInterval(interval), 1500);

        window.addEventListener('hashchange', checkStartParam);
        window.addEventListener('focus', checkStartParam);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('hashchange', checkStartParam);
            window.removeEventListener('focus', checkStartParam);
        };
    }, []);

    if (incomingDuelId) {
        return (
            <div className="min-h-screen bg-bg text-slate-200 flex flex-col items-center justify-center p-6 text-center">
                <div className="h-10 w-10 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Joining Duel #{incomingDuelId}...</h2>
                <p className="text-sm text-muted mb-6">Redirecting you to the live prediction room on Somnia Shannon.</p>
                <a
                    href={`/duel/${incomingDuelId}`}
                    className="px-5 py-2.5 rounded-lg bg-brand hover:bg-brand-deep text-white text-sm font-semibold transition-colors shadow-sm"
                >
                    Click here to enter Duel #{incomingDuelId}
                </a>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />

            <main className="wagr-bg px-4 pt-12 pb-24 sm:px-6">
                <div className="max-w-5xl mx-auto space-y-20">
                    {/* ================================================================= */}
                    {/* HERO SECTION                                                      */}
                    {/* ================================================================= */}
                    <div className="text-center pt-8 sm:pt-14 max-w-3xl mx-auto space-y-6">
                        {/* Subtitle pill */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-xs text-muted">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                            <span>Social Prediction Layer on DreamDEX & Somnia</span>
                        </div>

                        {/* Clean, balanced headline */}
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight sm:leading-tight">
                            Peer-to-peer predictions.{' '}
                            <span className="text-brand-light">Zero clicks to settle.</span>
                        </h1>

                        {/* Plain English explanation */}
                        <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto leading-relaxed">
                            Turn any DreamDEX event contract into a shareable 1-v-1 duel. When the price window closes, payout triggers automatically in the background - the winner receives their funds directly with zero claim buttons.
                        </p>

                        {/* Action buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                            <Link
                                href="/create"
                                onClick={() => sfx.tap()}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-brand hover:bg-brand-deep px-6 py-3 text-sm font-semibold text-white transition-colors shadow-sm"
                            >
                                <ZapIcon className="w-4 h-4" />
                                <span>Create a Duel</span>
                            </Link>
                            <Link
                                href="/markets"
                                onClick={() => sfx.tap()}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-surface hover:bg-surface-hover border border-border px-6 py-3 text-sm font-medium text-slate-200 transition-colors"
                            >
                                <RadioIcon className="w-4 h-4 text-muted" />
                                <span>Explore Live Markets</span>
                            </Link>
                        </div>

                        {/* Verified Shannon Receipt Ticker */}
                        <div className="pt-4 flex items-center justify-center gap-2 text-xs text-muted">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Verified on Shannon Block #477711153</span>
                            <span className="text-muted-dark">·</span>
                            <a
                                href={getExplorerTxUrl(VERIFIED_PROOF_TX)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-light hover:underline inline-flex items-center gap-1"
                            >
                                <span>Proof TX</span>
                                <ExternalLinkIcon className="w-3 h-3" />
                            </a>
                        </div>
                    </div>

                    {/* ================================================================= */}
                    {/* LIVE PROTOCOL METRICS                                             */}
                    {/* ================================================================= */}
                    <div className="clean-card rounded-xl p-6 sm:p-8">
                        <LiveCounter />
                    </div>

                    {/* ================================================================= */}
                    {/* INTERACTIVE DUEL DEMO: HOW IT ACTUALLY WORKS                      */}
                    {/* ================================================================= */}
                    <div className="space-y-6">
                        <div className="text-center max-w-xl mx-auto">
                            <span className="text-xs font-semibold uppercase tracking-wider text-brand-light">
                                Interactive Preview
                            </span>
                            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                                How a Wagr Duel Works
                            </h2>
                            <p className="text-sm text-muted mt-2">
                                You pick a side, set your stake, and share the challenge link. Your opponent matches the pot. When the market settles, the winner is credited in the exact same block.
                            </p>
                        </div>

                        {/* Interactive Face-Off Mockup */}
                        <div className="clean-card rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto">
                            <div className="grid grid-cols-1 md:grid-cols-11 gap-6 items-center">
                                {/* Alice (You) */}
                                <div className="md:col-span-5 rounded-xl bg-bg p-5 border border-border space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-full bg-brand/30 flex items-center justify-center font-bold text-xs text-brand-light">
                                                A
                                            </div>
                                            <span className="text-xs font-medium text-white">Alice (You)</span>
                                        </div>
                                        <span className="text-[10px] font-semibold uppercase text-brand-light bg-brand/10 px-2 py-0.5 rounded">
                                            Challenger
                                        </span>
                                    </div>

                                    <div>
                                        <div className="text-xs text-muted mb-1.5">Pick Your Direction:</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { sfx.tap(); setDemoSide('UP'); }}
                                                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                                                    demoSide === 'UP'
                                                        ? 'bg-up/20 text-up border border-up/40'
                                                        : 'bg-surface text-muted border border-border'
                                                }`}
                                            >
                                                ▲ UP (YES)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { sfx.tap(); setDemoSide('DOWN'); }}
                                                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                                                    demoSide === 'DOWN'
                                                        ? 'bg-down/20 text-down border border-down/40'
                                                        : 'bg-surface text-muted border border-border'
                                                }`}
                                            >
                                                ▼ DOWN (NO)
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                                        <span className="text-muted">Your Stake:</span>
                                        <span className="font-mono font-semibold text-white">{demoStake}.00 USDso</span>
                                    </div>
                                </div>

                                {/* Center VS */}
                                <div className="md:col-span-1 text-center font-bold text-xs text-muted">
                                    VS
                                </div>

                                {/* Bob (Challenger) */}
                                <div className="md:col-span-5 rounded-xl bg-bg p-5 border border-border space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-full bg-cyan-500/30 flex items-center justify-center font-bold text-xs text-cyan-400">
                                                B
                                            </div>
                                            <span className="text-xs font-medium text-white">Bob (Opponent)</span>
                                        </div>
                                        <span className="text-[10px] font-semibold uppercase text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                                            Accepts Link
                                        </span>
                                    </div>

                                    <div>
                                        <div className="text-xs text-muted mb-1.5">Opposite Pick (Enforced):</div>
                                        <div className="py-2 px-3 rounded-lg bg-surface border border-border text-xs font-semibold text-center text-slate-300">
                                            {demoSide === 'UP' ? '▼ DOWN (NO)' : '▲ UP (YES)'}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                                        <span className="text-muted">Matched Stake:</span>
                                        <span className="font-mono font-semibold text-white">{demoStake}.00 USDso</span>
                                    </div>
                                </div>
                            </div>

                            {/* Settlement Banner Callout */}
                            <div className="mt-6 rounded-xl bg-surface border border-border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                <div>
                                    <span className="font-semibold text-white">Market Closes: </span>
                                    <span className="text-muted">BTC 15-Min Window on DreamDEX</span>
                                </div>
                                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                    <SparklesIcon className="w-4 h-4" />
                                    <span>Winner receives ${(Number(demoStake) * 2 * 0.995).toFixed(2)} USDso automatically</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ================================================================= */}
                    {/* 3-STEP EXPLANATION                                                */}
                    {/* ================================================================= */}
                    <div className="space-y-8">
                        <div className="text-center max-w-xl mx-auto">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                                Simple & Frictionless
                            </span>
                            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                                How It Works in 3 Steps
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="clean-card rounded-xl p-6 space-y-3">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center font-bold text-sm text-brand-light">
                                    1
                                </div>
                                <h3 className="text-base font-semibold text-white">Pick a Market</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Select any active 15-minute or 1-hour binary contract from DreamDEX. Or paste any custom event contract address.
                                </p>
                            </div>

                            <div className="clean-card rounded-xl p-6 space-y-3">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center font-bold text-sm text-brand-light">
                                    2
                                </div>
                                <h3 className="text-base font-semibold text-white">Stake & Challenge</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Choose UP or DOWN and deposit your USDso into WagrEscrow. Copy the one-tap challenge link and send it to your opponent.
                                </p>
                            </div>

                            <div className="clean-card rounded-xl p-6 space-y-3">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center font-bold text-sm text-brand-light">
                                    3
                                </div>
                                <h3 className="text-base font-semibold text-white">Zero-Click Automated Payout</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    When the market resolves, Wagr&apos;s automated settlement relayer triggers payout instantly. Funds route straight to the winner&apos;s wallet with zero manual claiming.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ================================================================= */}
                    {/* LIVE ACTIVE MARKETS (NO EXPIRED MARKETS)                          */}
                    {/* ================================================================= */}
                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-bold text-white">
                                    Active DreamDEX Markets
                                </h2>
                                <p className="text-xs text-muted mt-1">
                                    Live tradeable binary windows currently open on Somnia Shannon testnet.
                                </p>
                            </div>
                            <Link
                                href="/markets"
                                onClick={() => sfx.tap()}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-light hover:text-white"
                            >
                                <span>View all markets</span>
                                <ArrowRightIcon className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        {marketsLoading && topMarkets.length === 0 ? (
                            <div className="clean-card rounded-xl p-10 flex flex-col items-center justify-center text-center space-y-3 border border-border">
                                <div className="relative flex items-center justify-center w-8 h-8">
                                    <div className="w-8 h-8 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                                </div>
                                <p className="text-xs text-muted font-medium">
                                    Syncing active DreamDEX order books from Somnia Shannon…
                                </p>
                            </div>
                        ) : topMarkets.length === 0 ? (
                            <div className="clean-card rounded-xl p-8 text-center text-xs text-muted">
                                No active trading windows found at this moment.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {topMarkets.map((m) => (
                                    <div
                                        key={m.address}
                                        className="clean-card-interactive rounded-xl p-5 flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="font-mono text-xs font-bold text-white">
                                                    {m.symbol}
                                                </span>
                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    LIVE
                                                </span>
                                            </div>

                                            <div className="space-y-1.5 text-xs">
                                                <div className="flex justify-between text-muted">
                                                    <span>Strike Price:</span>
                                                    <span className="font-mono font-medium text-white">{m.strikePrice}</span>
                                                </div>
                                                <div className="flex justify-between text-muted">
                                                    <span>Window Closes:</span>
                                                    <LiveCountdown expiry={m.expiry} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-5 pt-3 border-t border-border">
                                            <Link
                                                href={`/create?market=${m.address}`}
                                                onClick={() => sfx.tap()}
                                                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface hover:bg-brand hover:text-white text-xs font-medium text-slate-200 transition-colors border border-border"
                                            >
                                                <span>Create Duel</span>
                                                <ArrowRightIcon className="w-3.5 h-3.5" />
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ================================================================= */}
                    {/* CORE PRODUCT PILLARS                                              */}
                    {/* ================================================================= */}
                    <div className="space-y-6 pt-4">
                        <div className="text-center max-w-xl mx-auto">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                                Protocol Architecture
                            </span>
                            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                                Built for Social Prediction
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="clean-card rounded-xl p-5 space-y-2.5">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-light">
                                    <SparklesIcon className="w-4 h-4" />
                                </div>
                                <h3 className="text-sm font-semibold text-white">Reactivity Settlement</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Somnia’s native reactivity precompile <code className="text-slate-300 font-mono text-[11px]">0x00…0100</code> auto-executes the escrow the second the oracle emits <code className="text-slate-300 font-mono text-[11px]">Resolved</code>.
                                </p>
                            </div>

                            <div className="clean-card rounded-xl p-5 space-y-2.5">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-light">
                                    <ShieldCheckIcon className="w-4 h-4" />
                                </div>
                                <h3 className="text-sm font-semibold text-white">Anti-MEV Arena</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Sealed commitments prevent bots from front-running prediction picks on high-speed sub-second blocks.
                                </p>
                            </div>

                            <div className="clean-card rounded-xl p-5 space-y-2.5">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-light">
                                    <UsersIcon className="w-4 h-4" />
                                </div>
                                <h3 className="text-sm font-semibold text-white">Creator Splitters</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Streamers deploy CREATE2 splitter clones. Every wager placed through their embed routes builder fees automatically.
                                </p>
                            </div>

                            <div className="clean-card rounded-xl p-5 space-y-2.5">
                                <div className="h-8 w-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-light">
                                    <TrophyIcon className="w-4 h-4" />
                                </div>
                                <h3 className="text-sm font-semibold text-white">Squad Tournaments</h3>
                                <p className="text-xs text-muted leading-relaxed">
                                    Multi-round seasons with fixed entry fees, pooled prize pots, and Merkle-proof payouts with double-claim safety.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ================================================================= */}
                    {/* FAQ SECTION: EXPLAINING KEY QUESTIONS                             */}
                    {/* ================================================================= */}
                    <div className="clean-card rounded-2xl p-6 sm:p-8 space-y-6">
                        <div className="text-center max-w-lg mx-auto">
                            <h2 className="text-xl font-bold text-white">Frequently Asked Questions</h2>
                            <p className="text-xs text-muted mt-1">Everything you need to know about Wagr on Somnia</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                            <div className="space-y-1.5">
                                <h3 className="font-semibold text-white">Do I have to pay gas to claim my winnings?</h3>
                                <p className="text-muted leading-relaxed">
                                    No. Somnia Reactivity triggers contract settlement automatically when the price window expires. Your wallet balance increases with zero clicks and zero gas fees on your end.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="font-semibold text-white">What tokens do I need?</h3>
                                <p className="text-muted leading-relaxed">
                                    Wagers are denominated in USDso (testnet USDC). A tiny fraction of STT is used for gas to create or accept a duel. You can get testnet STT and USDso on our Faucet page.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="font-semibold text-white">Can I cancel my duel if nobody accepts?</h3>
                                <p className="text-muted leading-relaxed">
                                    Yes. As long as your duel has not been accepted by an opponent, you can cancel at any time and immediately reclaim 100% of your staked USDso.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <h3 className="font-semibold text-white">Where do the price feeds come from?</h3>
                                <p className="text-muted leading-relaxed">
                                    All prediction events run on DreamDEX Event Contracts, which settle via decentralized high-frequency price oracles on Somnia Network.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
