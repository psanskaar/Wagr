'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { LiveCountdown } from '@/components/LiveCountdown';
import { useActiveMarkets } from '@/hooks/useActiveMarkets';
import {
    formatCountdown,
    shortAddr,
    getExplorerAddressUrl,
    sfx,
} from '@/lib/wagr';
import {
    RadioIcon,
    ZapIcon,
    ExternalLinkIcon,
    CopyIcon,
    CheckIcon,
    ArrowRightIcon,
    RefreshCwIcon,
} from '@/components/Icons';

export default function MarketsPage() {
    const { markets: allActive, loading, refresh } = useActiveMarkets();
    const [filterAsset, setFilterAsset] = useState<string>('ALL');
    const [filterTime, setFilterTime] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
    const [, setTick] = useState(0);

    // Re-render countdown every second
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const copyAddress = (addr: string) => {
        sfx.tap();
        navigator.clipboard.writeText(addr);
        setCopiedAddr(addr);
        setTimeout(() => setCopiedAddr(null), 2000);
    };

    const now = Math.floor(Date.now() / 1000);

    const filtered = allActive.filter((m) => {
        if (m.expiry <= now) return false; // Strictly active, zero expired
        if (filterAsset !== 'ALL' && m.underlying.toUpperCase() !== filterAsset.toUpperCase()) return false;
        if (filterTime !== 'ALL' && m.timeframe !== filterTime) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                m.symbol.toLowerCase().includes(q) ||
                m.address.toLowerCase().includes(q) ||
                m.description.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />

            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border">
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                <span>Live Event Contracts</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                                DreamDEX Market Explorer
                            </h1>
                            <p className="text-xs sm:text-sm text-muted mt-1 max-w-xl">
                                Active 15-minute and 1-hour binary price prediction windows deployed on Somnia Shannon testnet.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <Link
                                href="/dashboard"
                                onClick={() => sfx.tap()}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition-colors"
                            >
                                <span>My Duels</span>
                            </Link>
                            <Link
                                href="/create"
                                onClick={() => sfx.tap()}
                                className="inline-flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-deep px-4 py-2.5 text-xs font-semibold text-white transition-colors"
                            >
                                <ZapIcon className="w-3.5 h-3.5" />
                                <span>Create Custom Duel</span>
                            </Link>
                        </div>
                    </div>

                    {/* Live Sync Banner */}
                    <div className="clean-card rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="font-semibold text-white">Live Hasura Indexer Sync ({filtered.length} active binary windows)</span>
                            </div>
                            <p className="text-muted leading-relaxed">
                                Real-time order book markets on Somnia Shannon testnet. At expiry, if the oracle spot price is ≥ strike, <strong className="text-slate-200">UP</strong> wins, else <strong className="text-slate-200">DOWN</strong> wins.
                            </p>
                        </div>
                        <button
                            onClick={() => { sfx.tap(); refresh(); }}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-300 hover:text-white transition-colors self-start sm:self-auto disabled:opacity-50"
                        >
                            <RefreshCwIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand' : ''}`} />
                            <span>{loading ? 'Syncing…' : 'Sync Indexer'}</span>
                        </button>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-3 clean-card rounded-xl p-3">
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            {/* Asset Filter */}
                            <div className="flex rounded-lg bg-bg border border-border p-0.5 text-xs">
                                {(['ALL', 'BTC', 'ETH', 'SOL'] as const).map((a) => (
                                    <button
                                        key={a}
                                        onClick={() => { sfx.tap(); setFilterAsset(a); }}
                                        className={`px-3 py-1 rounded-md font-medium transition-colors ${
                                            filterAsset === a
                                                ? 'bg-surface text-white'
                                                : 'text-muted hover:text-white'
                                        }`}
                                    >
                                        {a}
                                    </button>
                                ))}
                            </div>

                            {/* Timeframe Filter */}
                            <div className="flex rounded-lg bg-bg border border-border p-0.5 text-xs">
                                {(['ALL', '1m', '5m', '15m', '1h', '4h', '24h'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => { sfx.tap(); setFilterTime(t); }}
                                        className={`px-3 py-1 rounded-md font-medium transition-colors ${
                                            filterTime === t
                                                ? 'bg-surface text-white'
                                                : 'text-muted hover:text-white'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search Input */}
                        <div className="w-full md:w-64">
                            <input
                                type="text"
                                placeholder="Search symbol or 0x address…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-lg bg-bg border border-border px-3 py-1.5 text-xs text-white placeholder-muted focus:outline-none focus:border-brand"
                            />
                        </div>
                    </div>

                    {/* Market Cards Grid */}
                    {loading && allActive.length === 0 ? (
                        <div className="clean-card rounded-xl p-16 flex flex-col items-center justify-center text-center space-y-3">
                            <div className="relative flex items-center justify-center w-8 h-8">
                                <div className="w-8 h-8 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                            </div>
                            <p className="text-xs text-muted font-medium">
                                Syncing live order books from Somnia Shannon…
                            </p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="clean-card rounded-xl p-12 text-center text-xs text-muted">
                            No active markets found matching your filters.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {filtered.map((m) => (
                                <div
                                    key={m.address}
                                    className="clean-card-interactive rounded-xl p-5 flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                                <span className="font-mono text-sm font-bold text-white">
                                                    {m.symbol}
                                                </span>
                                            </div>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                TRADING
                                            </span>
                                        </div>

                                        <p className="text-xs text-muted mb-4">
                                            {m.description}
                                        </p>

                                        <div className="space-y-2 rounded-lg bg-bg p-3 border border-border text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-muted">Strike Price:</span>
                                                <span className="font-mono font-semibold text-white">
                                                    {m.strikePrice}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted">Window Expiry:</span>
                                                <LiveCountdown expiry={m.expiry} className="font-mono font-semibold text-cyan-400" />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-border/60">
                                                <span className="text-muted">Contract:</span>
                                                <div className="flex items-center gap-1 font-mono text-[11px] text-muted">
                                                    <span>{shortAddr(m.address)}</span>
                                                    <button
                                                        onClick={() => copyAddress(m.address)}
                                                        className="hover:text-white"
                                                        title="Copy address"
                                                    >
                                                        {copiedAddr === m.address ? (
                                                            <CheckIcon className="w-3 h-3 text-emerald-400" />
                                                        ) : (
                                                            <CopyIcon className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                    <a
                                                        href={getExplorerAddressUrl(m.address)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="hover:text-white"
                                                    >
                                                        <ExternalLinkIcon className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5">
                                        <Link
                                            href={`/create?market=${m.address}`}
                                            onClick={() => sfx.tap()}
                                            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-surface hover:bg-brand hover:text-white text-xs font-semibold text-slate-200 transition-colors border border-border"
                                        >
                                            <span>Create Duel on Market</span>
                                            <ArrowRightIcon className="w-3.5 h-3.5" />
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
