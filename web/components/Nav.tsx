'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useBalance } from 'wagmi';
import { USDSO_TOKEN, erc20Abi, fmtUsd, shortAddr, sfx } from '@/lib/wagr';
import { isTelegramWebApp } from '@/lib/telegram';
import { useTelegramWallet } from './TelegramPrivyProvider';
import { SparklesIcon, CheckIcon, CopyIcon } from './Icons';

export function Nav() {
    const pathname = usePathname();
    const { address, isConnected } = useAccount();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isTelegram, setIsTelegram] = useState(false);
    const [walletModalOpen, setWalletModalOpen] = useState(false);
    const [copiedAddr, setCopiedAddr] = useState(false);

    useEffect(() => {
        setIsTelegram(isTelegramWebApp());
    }, []);

    const tgWallet = useTelegramWallet();
    const activeAddress = (isTelegram ? (tgWallet.isReady ? tgWallet.walletAddress : undefined) : address) as `0x${string}` | undefined;
    const isWalletConnected = isTelegram ? tgWallet.isReady : isConnected;

    const { data: sttBalanceData, refetch: refetchStt } = useBalance({
        address: activeAddress,
        query: {
            enabled: !!activeAddress,
            refetchInterval: 5_000,
        },
    });

    // Live USDso Token Balance
    const { data: balanceData } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: activeAddress ? [activeAddress] : undefined,
        query: {
            enabled: !!activeAddress,
            refetchInterval: 5_000,
        },
    });

    const primaryLinks: { href: string; label: string; badge?: string }[] = [
        { href: '/markets', label: 'Markets' },
        { href: '/create', label: 'Create Duel' },
        { href: '/season', label: 'Tournaments' },
        { href: '/creators', label: 'Creator Studio' },
    ];

    return (
        <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
                {/* Brand */}
                <div className="flex items-center gap-8">
                    <Link
                        href="/"
                        onClick={() => sfx.tap()}
                        className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white font-bold text-sm shadow-sm">
                            W
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-white text-base tracking-tight leading-none">
                                WAGR
                            </span>
                            <span className="text-[10px] text-muted font-medium tracking-wide">
                                on DreamDEX
                            </span>
                        </div>
                    </Link>

                    {/* Desktop Navigation Links */}
                    <nav className="hidden md:flex items-center gap-1">
                        {primaryLinks.map((link) => {
                            const active = pathname === link.href || pathname.startsWith(link.href + '/');
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => sfx.tap()}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                                        active
                                            ? 'text-white bg-surface'
                                            : 'text-muted hover:text-white hover:bg-surface/50'
                                    }`}
                                >
                                    <span>{link.label}</span>
                                    {link.badge && (
                                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-tight">
                                            {link.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Right Side */}
                <div className="flex items-center gap-3">
                    {/* Live Network Indicator */}
                    <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-border text-xs text-muted whitespace-nowrap">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="font-mono text-[11px]">Shannon</span>
                    </div>

                    {/* Faucet Link */}
                    <Link
                        href="/faucet"
                        onClick={() => sfx.tap()}
                        className="hidden sm:inline-flex items-center text-xs font-medium text-muted hover:text-white px-2.5 py-1 whitespace-nowrap"
                    >
                        Faucet & Dev
                    </Link>

                    {/* USDso Balance if connected */}
                    {isWalletConnected && balanceData !== undefined && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-border text-xs whitespace-nowrap">
                            <span className="text-muted text-[11px]">USDso:</span>
                            <span className="font-mono font-medium text-emerald-400">
                                {fmtUsd(balanceData as bigint)}
                            </span>
                        </div>
                    )}

                    {/* Wallet Display: Telegram Embedded Wallet in Telegram, RainbowKit Connect Button in Browsers */}
                    {isTelegram ? (
                        <div className="relative">
                            {!tgWallet.isReady || !tgWallet.walletAddress ? (
                                /* Explicit separate loading indicators for initialization and wallet creation phases */
                                tgWallet.status === 'initializing' ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border/80 text-xs font-mono text-muted select-none">
                                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                        <span>Initializing session…</span>
                                    </div>
                                ) : tgWallet.status === 'authenticating' ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border/80 text-xs font-mono text-slate-300 select-none">
                                        <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                                        <span>Authenticating…</span>
                                    </div>
                                ) : tgWallet.status === 'creating_wallet' ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-brand/50 text-xs font-mono text-brand-light select-none">
                                        <span className="h-2 w-2 rounded-full bg-brand animate-ping" />
                                        <span>Creating embedded wallet…</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300 select-none">
                                        <span className="h-2 w-2 rounded-full bg-rose-400" />
                                        <span>Wallet error</span>
                                    </div>
                                )
                            ) : (
                                <button
                                    onClick={() => {
                                        sfx.tap();
                                        setWalletModalOpen(!walletModalOpen);
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border hover:border-brand/60 text-xs font-mono transition-all shadow-sm"
                                >
                                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                    <span className="text-white font-bold">{shortAddr(tgWallet.walletAddress)}</span>
                                    {balanceData !== undefined && (
                                        <span className="hidden sm:inline text-emerald-400 font-sans font-medium text-[11px]">
                                            {fmtUsd(balanceData as bigint)}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Telegram Wallet Flyout Panel (strictly only mounted when ready) */}
                            {walletModalOpen && tgWallet.isReady && tgWallet.walletAddress && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setWalletModalOpen(false)}
                                    />
                                    <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-bg/95 border border-border p-4 shadow-2xl backdrop-blur-xl z-50 space-y-4 animate-in zoom-in-95 duration-200">
                                        <div className="flex items-center justify-between pb-2 border-b border-border">
                                            <div className="flex items-center gap-1.5">
                                                <SparklesIcon className="w-4 h-4 text-brand-light" />
                                                <span className="text-xs font-bold text-white">Telegram Embedded Wallet</span>
                                            </div>
                                            <button
                                                onClick={() => setWalletModalOpen(false)}
                                                className="text-muted hover:text-white text-xs p-1"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <div className="space-y-1">
                                            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Address</span>
                                            <div className="flex items-center justify-between p-2 rounded-xl bg-surface border border-border text-xs font-mono text-slate-300">
                                                <span>{shortAddr(tgWallet.walletAddress)}</span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => {
                                                            sfx.tap();
                                                            if (tgWallet.walletAddress) {
                                                                navigator.clipboard.writeText(tgWallet.walletAddress);
                                                                setCopiedAddr(true);
                                                                setTimeout(() => setCopiedAddr(false), 2000);
                                                            }
                                                        }}
                                                        className="p-1 rounded hover:bg-white/10 text-muted hover:text-white"
                                                        title="Copy Address"
                                                    >
                                                        {copiedAddr ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Balances */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="p-2.5 rounded-xl bg-surface border border-border">
                                                <span className="text-muted text-[11px] block">STT Gas</span>
                                                <span className="font-mono font-bold text-white">
                                                    {sttBalanceData ? Number(sttBalanceData.formatted).toFixed(2) : '0.00'}
                                                </span>
                                            </div>
                                            <div className="p-2.5 rounded-xl bg-surface border border-border">
                                                <span className="text-muted text-[11px] block">USDso Collateral</span>
                                                <span className="font-mono font-bold text-emerald-400">
                                                    {balanceData !== undefined ? fmtUsd(balanceData as bigint) : '0.00'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Refill Buttons */}
                                        <div className="space-y-1.5 pt-1">
                                            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Testnet Faucet Refills</span>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    disabled={tgWallet.isFunding}
                                                    onClick={async () => {
                                                        sfx.tap();
                                                        await tgWallet.refillStt();
                                                        refetchStt();
                                                    }}
                                                    className="w-full py-2 px-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-[11px] font-bold text-white transition-colors disabled:opacity-50"
                                                >
                                                    {tgWallet.isFunding ? 'Refilling…' : '+ 1 STT (Gas)'}
                                                </button>
                                                <button
                                                    disabled={tgWallet.isFunding}
                                                    onClick={async () => {
                                                        sfx.tap();
                                                        await tgWallet.refillTusdc();
                                                    }}
                                                    className="w-full py-2 px-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-[11px] font-bold text-emerald-400 transition-colors disabled:opacity-50"
                                                >
                                                    {tgWallet.isFunding ? 'Refilling…' : '+ 500 tUSDC'}
                                                </button>
                                            </div>
                                            <button
                                                disabled={tgWallet.isFunding}
                                                onClick={async () => {
                                                    sfx.tap();
                                                    await tgWallet.refillBoth();
                                                    refetchStt();
                                                }}
                                                className="w-full py-2 rounded-xl bg-gradient-to-r from-brand to-teal-400 text-[11px] font-bold text-black transition-all hover:opacity-95 disabled:opacity-50"
                                            >
                                                {tgWallet.isFunding ? 'Refilling Both…' : 'Refill Both (1 STT + 500 tUSDC)'}
                                            </button>
                                        </div>

                                        {/* Non-custodial Key Export */}
                                        <div className="pt-2 border-t border-border">
                                            <button
                                                onClick={() => {
                                                    sfx.tap();
                                                    tgWallet.exportKey();
                                                }}
                                                className="w-full py-2 rounded-xl border border-border/80 bg-surface hover:bg-surface-hover text-[11px] font-medium text-slate-300 transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                <span>Export Private Key</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <ConnectButton
                            chainStatus="none"
                            showBalance={false}
                            accountStatus="avatar"
                        />
                    )}

                    {/* Mobile Hamburger Toggle */}
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="md:hidden p-2 rounded-lg bg-surface border border-border text-muted hover:text-white"
                        aria-label="Toggle navigation"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {mobileOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mobile Dropdown */}
            {mobileOpen && (
                <div className="md:hidden border-t border-border bg-bg/95 backdrop-blur-xl px-4 py-3 space-y-1">
                    {primaryLinks.map((link) => {
                        const active = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => {
                                    sfx.tap();
                                    setMobileOpen(false);
                                }}
                                className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium ${
                                    active ? 'bg-surface text-white' : 'text-muted hover:text-white'
                                }`}
                            >
                                <span>{link.label}</span>
                                {link.badge && (
                                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-tight">
                                        {link.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                    <Link
                        href="/faucet"
                        onClick={() => {
                            sfx.tap();
                            setMobileOpen(false);
                        }}
                        className="block px-3 py-2 rounded-md text-sm font-medium text-muted hover:text-white"
                    >
                        Faucet & Dev
                    </Link>
                </div>
            )}
        </header>
    );
}
