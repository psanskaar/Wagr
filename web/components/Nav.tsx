'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import { USDSO_TOKEN, erc20Abi, fmtUsd, sfx } from '@/lib/wagr';

export function Nav() {
    const pathname = usePathname();
    const { address, isConnected } = useAccount();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Live USDso Token Balance
    const { data: balanceData } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: {
            enabled: !!address,
            refetchInterval: 5_000,
        },
    });

    const primaryLinks = [
        { href: '/markets', label: 'Markets' },
        { href: '/create', label: 'Create Duel' },
        { href: '/arena', label: 'Anti-MEV' },
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
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                                        active
                                            ? 'text-white bg-surface'
                                            : 'text-muted hover:text-white hover:bg-surface/50'
                                    }`}
                                >
                                    {link.label}
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
                    {isConnected && balanceData !== undefined && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-border text-xs whitespace-nowrap">
                            <span className="text-muted text-[11px]">USDso:</span>
                            <span className="font-mono font-medium text-emerald-400">
                                {fmtUsd(balanceData as bigint)}
                            </span>
                        </div>
                    )}

                    {/* RainbowKit Connect Button - Compact Avatar */}
                    <ConnectButton
                        chainStatus="none"
                        showBalance={false}
                        accountStatus="avatar"
                    />

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
                                className={`block px-3 py-2 rounded-md text-sm font-medium ${
                                    active ? 'bg-surface text-white' : 'text-muted hover:text-white'
                                }`}
                            >
                                {link.label}
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
