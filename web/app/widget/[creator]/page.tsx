'use client';

import React, { useState } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, maxUint256 } from 'viem';
import {
    WAGR_ESCROW,
    USDSO_TOKEN,
    escrowAbi,
    erc20Abi,
    KNOWN_DREAMDEX_MARKETS,
    fmtUsd,
    formatCountdown,
    sfx,
} from '@/lib/wagr';
import { ZapIcon, CoinsIcon, CheckIcon } from '@/components/Icons';

export default function StandaloneWidgetPage({ params }: { params: { creator: string } }) {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [side, setSide] = useState<0 | 1>(0);
    const [stake, setStake] = useState('10');
    const [status, setStatus] = useState<'idle' | 'approving' | 'wagered'>('idle');

    const activeMarket = KNOWN_DREAMDEX_MARKETS[1]; // ETH-15M-UPDOWN
    const stakeBn = parseUnits(stake || '0', 6);

    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    const needsApproval =
        allowance !== undefined && stakeBn > 0n && (allowance as bigint) < stakeBn;

    async function handleApprove() {
        try {
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
        } catch {
            setStatus('idle');
        }
    }

    async function handleWager() {
        try {
            sfx.stake();
            await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'createDuel',
                args: [
                    activeMarket.address,
                    side,
                    stakeBn,
                    '0x0000000000000000000000000000000000000000',
                    0,
                ],
            });
            setStatus('wagered');
            sfx.win();
        } catch {
            setStatus('idle');
        }
    }

    return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-3 select-none">
            <div className="w-[330px] rounded-3xl border border-border bg-surface/95 p-5 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
                <div>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-border/60">
                        <div className="flex items-center gap-1.5">
                            <div className="h-5 w-5 rounded-md bg-brand flex items-center justify-center font-black text-[10px] text-white">
                                ■
                            </div>
                            <span className="text-[11px] font-bold tracking-tight text-white uppercase">WAGR</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-mono text-brand-light font-bold">
                                @{params.creator}
                            </span>
                        </div>
                    </div>

                    {/* Market Question */}
                    <div className="mt-3">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted font-bold">
                                {activeMarket.symbol}
                            </span>
                            <span className="text-[10px] font-mono text-cyan-400">
                                {formatCountdown(activeMarket.expiry)}
                            </span>
                        </div>
                        <h2 className="mt-1 text-sm font-extrabold text-white leading-tight">
                            Will ETH close UP or DOWN?
                        </h2>
                    </div>

                    {/* Pick buttons */}
                    <div className="mt-3.5 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => { sfx.tap(); setSide(0); }}
                            className={`py-3 rounded-xl border text-center transition-all ${
                                side === 0
                                    ? 'bg-up/20 border-up text-up font-bold shadow-up-glow'
                                    : 'bg-bg border-border text-muted font-medium'
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
                                    : 'bg-bg border-border text-muted font-medium'
                            }`}
                        >
                            <div className="text-xs font-bold">▼ DOWN (NO)</div>
                        </button>
                    </div>

                    {/* Stake Selector */}
                    <div className="mt-3">
                        <div className="flex justify-between items-center text-[10px] text-muted font-semibold mb-1">
                            <span>STAKE (USDSO)</span>
                            <span>Match Pot: {fmtUsd(stakeBn * 2n)} USDso</span>
                        </div>
                        <div className="flex gap-1.5">
                            {['5', '10', '25'].map((amt) => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => { sfx.tap(); setStake(amt); }}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                                        stake === amt
                                            ? 'bg-brand text-white'
                                            : 'bg-bg border border-border text-muted'
                                    }`}
                                >
                                    ${amt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-border/60">
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
                        <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 p-2.5 text-center text-xs font-bold text-emerald-300">
                            ✓ Duel Created! Waiting for Taker
                        </div>
                    ) : needsApproval ? (
                        <button
                            onClick={handleApprove}
                            className="w-full py-3 rounded-xl bg-brand hover:bg-brand-deep text-xs font-bold text-white shadow-brand-glow"
                        >
                            Approve USDso
                        </button>
                    ) : (
                        <button
                            onClick={handleWager}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand to-cyan-500 hover:from-brand-deep hover:to-cyan-600 text-xs font-bold text-white shadow-brand-glow"
                        >
                            Wager {stake} USDso
                        </button>
                    )}

                    <div className="mt-2 text-[9px] text-muted text-center leading-tight">
                        Powered by DreamDEX CLOB · Auto-settling via Somnia Reactivity
                    </div>
                </div>
            </div>
        </div>
    );
}
