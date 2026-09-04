'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, maxUint256, keccak256, toHex, isAddress, type Address } from 'viem';
import {
    WAGR_ESCROW,
    WAGR_FACTORY,
    USDSO_TOKEN,
    escrowAbi,
    factoryAbi,
    erc20Abi,
    publicClient,
    KNOWN_DREAMDEX_MARKETS,
    fmtUsd,
    formatCountdown,
    sfx,
} from '@/lib/wagr';
import { useActiveMarkets } from '@/hooks/useActiveMarkets';
import {
    ZapIcon,
    CoinsIcon,
    CheckIcon,
    CopyIcon,
    ExternalLinkIcon,
    ClockIcon,
    ArrowRightIcon,
} from '@/components/Icons';

export default function StandaloneWidgetPage({ params }: { params: { creator: string } }) {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const { markets: liveMarkets } = useActiveMarkets();
    const [, setTick] = useState(0);

    // Re-render countdown every second
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(iv);
    }, []);

    const now = Math.floor(Date.now() / 1000);
    // Filter strictly active markets whose trading window is open
    const activeMarkets = (liveMarkets.length > 0 ? liveMarkets : KNOWN_DREAMDEX_MARKETS).filter(
        (m) => m.expiry > now
    );

    const [selectedMarketAddr, setSelectedMarketAddr] = useState<string>(
        activeMarkets[0]?.address || KNOWN_DREAMDEX_MARKETS[0].address
    );
    const [isSelectingMarket, setIsSelectingMarket] = useState(false);

    // Auto-select valid active market
    useEffect(() => {
        if (activeMarkets.length > 0) {
            const exists = activeMarkets.some(
                (m) => m.address.toLowerCase() === selectedMarketAddr.toLowerCase()
            );
            if (!exists) {
                setSelectedMarketAddr(activeMarkets[0].address);
            }
        }
    }, [activeMarkets, selectedMarketAddr]);

    const activeMarket =
        activeMarkets.find((m) => m.address.toLowerCase() === selectedMarketAddr.toLowerCase()) ||
        activeMarkets[0] ||
        KNOWN_DREAMDEX_MARKETS[0];

    const [side, setSide] = useState<0 | 1>(0);
    const [stake, setStake] = useState('10');
    const [status, setStatus] = useState<'idle' | 'approving' | 'creating' | 'wagered'>('idle');
    const [createdDuelId, setCreatedDuelId] = useState<string | null>(null);
    const [copiedLink, setCopiedLink] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const stakeBn = (() => {
        try {
            return parseUnits(stake || '0', 6);
        } catch {
            return 0n;
        }
    })();

    // User USDso Token Balance
    const { data: userBalance, refetch: refetchBalance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    // User USDso Allowance for WagrEscrow
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    const needsApproval =
        allowance !== undefined && stakeBn > 0n && (allowance as bigint) < stakeBn;

    const hasInsufficientBalance =
        userBalance !== undefined && stakeBn > 0n && (userBalance as bigint) < stakeBn;

    async function handleApprove() {
        try {
            setErrorMessage(null);
            setStatus('approving');
            sfx.tap();
            await writeContractAsync({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'approve',
                args: [WAGR_ESCROW, maxUint256],
            });
            await refetchAllowance();
            setStatus('idle');
            sfx.win();
        } catch (err: any) {
            setErrorMessage(err?.shortMessage || err?.message || 'Approval rejected');
            setStatus('idle');
        }
    }

    async function handleWager() {
        if (!activeMarket?.address || stakeBn <= 0n) return;
        try {
            setErrorMessage(null);
            setStatus('creating');
            sfx.stake();

            // Resolve Creator's Splitter Address
            let builderAddr: Address = '0x0000000000000000000000000000000000000000';
            let builderBps = 0;

            if (params.creator) {
                if (isAddress(params.creator)) {
                    builderAddr = params.creator as Address;
                    builderBps = 100; // 1.00%
                } else {
                    try {
                        const salt = keccak256(toHex(params.creator.toLowerCase()));
                        builderAddr = (await publicClient.readContract({
                            address: WAGR_FACTORY,
                            abi: factoryAbi,
                            functionName: 'predict',
                            args: [salt],
                        })) as Address;
                        builderBps = 100; // 1.00% creator builder fee
                    } catch {
                        // Fallback
                    }
                }
            }

            const txHash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'createDuel',
                args: [
                    activeMarket.address as Address,
                    side,
                    stakeBn,
                    builderAddr,
                    builderBps,
                ],
            });

            // Parse created duelId from receipt logs
            let actualDuelId = '1';
            try {
                const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
                for (const log of receipt.logs) {
                    if (
                        log.address.toLowerCase() === WAGR_ESCROW.toLowerCase() &&
                        log.topics.length >= 2 &&
                        log.topics[1]
                    ) {
                        actualDuelId = Number(BigInt(log.topics[1])).toString();
                        break;
                    }
                }
            } catch (waitErr) {
                console.warn('Could not read receipt event immediately:', waitErr);
            }

            setCreatedDuelId(actualDuelId);
            setStatus('wagered');
            sfx.win();
            refetchBalance();
            refetchAllowance();
        } catch (err: any) {
            console.error('Wager failed:', err);
            setErrorMessage(err?.shortMessage || err?.message || 'Failed to place wager');
            setStatus('idle');
        }
    }

    const copyChallengeLink = () => {
        sfx.tap();
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wagr-app.vercel.app';
        const link = `${origin}/duel/${createdDuelId || '1'}`;
        navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-3 select-none">
            <div className="w-[340px] rounded-3xl border border-border bg-surface/95 p-5 shadow-2xl backdrop-blur-xl flex flex-col justify-between relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute -top-12 -right-12 w-28 h-28 bg-brand/20 rounded-full blur-2xl pointer-events-none" />

                <div>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-border/60">
                        <div className="flex items-center gap-1.5">
                            <div className="h-6 w-6 rounded-lg bg-brand flex items-center justify-center font-black text-xs text-white shadow-sm">
                                W
                            </div>
                            <div className="flex flex-col leading-none">
                                <span className="text-xs font-black tracking-tight text-white uppercase">WAGR</span>
                                <span className="text-[9px] text-muted">Streamer Duel</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-mono text-brand-light font-bold truncate max-w-[110px]">
                                @{params.creator}
                            </span>
                        </div>
                    </div>

                    {/* Market Switcher Selector */}
                    <div className="mt-3 relative">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase text-muted mb-1">
                            <span>Event Market</span>
                            <button
                                type="button"
                                onClick={() => setIsSelectingMarket(!isSelectingMarket)}
                                className="text-brand-light hover:text-white transition-colors underline font-mono"
                            >
                                {isSelectingMarket ? 'Close' : 'Switch Market ▾'}
                            </button>
                        </div>

                        {/* Selected Market Header Pill */}
                        <div
                            onClick={() => setIsSelectingMarket(!isSelectingMarket)}
                            className="p-2.5 rounded-xl bg-bg border border-border/80 hover:border-brand/60 cursor-pointer transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-xs text-white">
                                    {activeMarket?.symbol || 'DreamDEX Window'}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold flex items-center gap-1">
                                    <ClockIcon className="w-2.5 h-2.5" />
                                    <span>{activeMarket ? formatCountdown(activeMarket.expiry) : '00:00'}</span>
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-300 mt-1 truncate">
                                {activeMarket?.strikePrice
                                    ? `Strike: ${activeMarket.strikePrice}`
                                    : activeMarket?.description || 'Will price close UP or DOWN?'}
                            </div>
                        </div>

                        {/* Dropdown list of available live markets */}
                        {isSelectingMarket && (
                            <div className="absolute top-full left-0 right-0 z-30 mt-1.5 p-1.5 rounded-2xl bg-bg/95 border border-border shadow-2xl backdrop-blur-xl max-h-48 overflow-y-auto space-y-1">
                                {activeMarkets.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-muted">
                                        No active windows currently.
                                    </div>
                                ) : (
                                    activeMarkets.map((m) => {
                                        const isSelected = m.address.toLowerCase() === selectedMarketAddr.toLowerCase();
                                        return (
                                            <button
                                                key={m.address}
                                                type="button"
                                                onClick={() => {
                                                    sfx.tap();
                                                    setSelectedMarketAddr(m.address);
                                                    setIsSelectingMarket(false);
                                                }}
                                                className={`w-full text-left p-2 rounded-xl text-xs transition-colors flex items-center justify-between ${
                                                    isSelected
                                                        ? 'bg-brand/20 text-white font-bold border border-brand/40'
                                                        : 'hover:bg-surface text-slate-300'
                                                }`}
                                            >
                                                <div className="truncate pr-2">
                                                    <div className="font-mono text-xs">{m.symbol}</div>
                                                    <div className="text-[10px] text-muted truncate">
                                                        {m.strikePrice ? `Strike: ${m.strikePrice}` : m.description}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-mono text-cyan-300 whitespace-nowrap">
                                                    {formatCountdown(m.expiry)}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pick Side buttons */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => { sfx.tap(); setSide(0); }}
                            className={`py-3 rounded-xl border text-center transition-all ${
                                side === 0
                                    ? 'bg-up/20 border-up text-up font-bold shadow-up-glow'
                                    : 'bg-bg border-border text-muted font-medium hover:border-border-glow'
                            }`}
                        >
                            <div className="text-xs font-bold">▲ UP (YES)</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => { sfx.tap(); setSide(1); }}
                            className={`py-3 rounded-xl border text-center transition-all ${
                                side === 1
                                    ? 'bg-down/20 border-down text-down font-bold shadow-down-glow'
                                    : 'bg-bg border-border text-muted font-medium hover:border-border-glow'
                            }`}
                        >
                            <div className="text-xs font-bold">▼ DOWN (NO)</div>
                        </button>
                    </div>

                    {/* Stake Selector */}
                    <div className="mt-3">
                        <div className="flex justify-between items-center text-[10px] text-muted font-semibold mb-1">
                            <span>STAKE (USDSO)</span>
                            {userBalance !== undefined ? (
                                <span className="font-mono">Bal: {fmtUsd(userBalance as bigint)} USDso</span>
                            ) : (
                                <span>Pot: {fmtUsd(stakeBn * 2n)} USDso</span>
                            )}
                        </div>
                        <div className="flex gap-1.5">
                            {['5', '10', '25', '50'].map((amt) => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => { sfx.tap(); setStake(amt); }}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                                        stake === amt
                                            ? 'bg-brand text-white shadow-sm'
                                            : 'bg-bg border border-border text-muted hover:text-white'
                                    }`}
                                >
                                    ${amt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="mt-2 rounded-xl bg-down/10 border border-down/30 p-2 text-[11px] text-down leading-tight">
                        {errorMessage}
                    </div>
                )}

                {/* Actions & Result */}
                <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                    {!isConnected ? (
                        <div className="flex justify-center">
                            <ConnectButton.Custom>
                                {({ openConnectModal }) => (
                                    <button
                                        onClick={openConnectModal}
                                        className="w-full py-3 rounded-xl bg-brand hover:bg-brand-deep text-xs font-bold text-white shadow-brand-glow"
                                    >
                                        Connect Wallet to Wager
                                    </button>
                                )}
                            </ConnectButton.Custom>
                        </div>
                    ) : status === 'wagered' ? (
                        <div className="space-y-2">
                            <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 p-2.5 text-center space-y-1">
                                <div className="text-xs font-bold text-emerald-300 flex items-center justify-center gap-1">
                                    <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Duel #{createdDuelId} Created!</span>
                                </div>
                                <div className="text-[10px] text-emerald-200/80">
                                    1.00% creator builder fee allocated to @{params.creator}
                                </div>
                            </div>

                            <div className="flex gap-1.5">
                                <button
                                    onClick={copyChallengeLink}
                                    className="flex-1 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    {copiedLink ? (
                                        <>
                                            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                                            <span>Link Copied!</span>
                                        </>
                                    ) : (
                                        <>
                                            <CopyIcon className="w-3.5 h-3.5 text-muted" />
                                            <span>Copy Chat Link</span>
                                        </>
                                    )}
                                </button>
                                <a
                                    href={`/duel/${createdDuelId || '1'}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-2 rounded-xl bg-brand hover:bg-brand-deep text-xs font-bold text-white flex items-center justify-center gap-1 shadow-brand-glow"
                                    title="Open Duel Room"
                                >
                                    <span>Room</span>
                                    <ArrowRightIcon className="w-3 h-3" />
                                </a>
                            </div>

                            <button
                                onClick={() => {
                                    setStatus('idle');
                                    setCreatedDuelId(null);
                                }}
                                className="w-full text-center text-[10px] text-muted hover:text-white pt-1 transition-colors"
                            >
                                Place Another Duel
                            </button>
                        </div>
                    ) : hasInsufficientBalance ? (
                        <button
                            disabled
                            className="w-full py-3 rounded-xl bg-surface border border-border text-xs font-bold text-muted cursor-not-allowed opacity-60"
                        >
                            Insufficient USDso Balance
                        </button>
                    ) : needsApproval ? (
                        <button
                            onClick={handleApprove}
                            disabled={status === 'approving'}
                            className="w-full py-3 rounded-xl bg-brand hover:bg-brand-deep text-xs font-bold text-white shadow-brand-glow disabled:opacity-50"
                        >
                            {status === 'approving' ? 'Approving USDso...' : 'Step 1: Approve USDso'}
                        </button>
                    ) : (
                        <button
                            onClick={handleWager}
                            disabled={status === 'creating' || stakeBn <= 0n}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand to-cyan-500 hover:from-brand-deep hover:to-cyan-600 text-xs font-bold text-white shadow-brand-glow disabled:opacity-50"
                        >
                            {status === 'creating' ? 'Creating Duel...' : `Wager ${stake} USDso (Duel)`}
                        </button>
                    )}

                    <div className="text-[9px] text-muted text-center leading-tight">
                        Streamer fee: 1.00% · Auto-settling via Somnia Reactivity
                    </div>
                </div>
            </div>
        </div>
    );
}
