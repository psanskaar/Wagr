'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    useAccount,
    useWriteContract,
    useReadContract,
    useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits, maxUint256, parseEventLogs, type Address } from 'viem';
import { Nav } from '@/components/Nav';
import {
    WAGR_ESCROW,
    USDSO_TOKEN,
    escrowAbi,
    erc20Abi,
    publicClient,
    KNOWN_DREAMDEX_MARKETS,
    fmtUsd,
    calculatePotentialPayout,
    shortAddr,
    getExplorerTxUrl,
    formatCountdown,
    sfx,
} from '@/lib/wagr';
import { useActiveMarkets } from '@/hooks/useActiveMarkets';
import {
    ZapIcon,
    RadioIcon,
    CopyIcon,
    CheckIcon,
    ArrowRightIcon,
    ExternalLinkIcon,
    ShieldCheckIcon,
    CoinsIcon,
} from '@/components/Icons';

function CreateDuelInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const marketFromQuery = searchParams.get('market');

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
    // Strictly filter out any markets whose window has expired
    const activeMarkets = (liveMarkets.length > 0 ? liveMarkets : KNOWN_DREAMDEX_MARKETS).filter(
        (m) => m.expiry > now
    );

    // Form State
    const [selectedMarket, setSelectedMarket] = useState<string>(
        marketFromQuery ?? (activeMarkets[0]?.address || KNOWN_DREAMDEX_MARKETS[0].address)
    );
    const [customMarket, setCustomMarket] = useState<string>('');
    const [isCustom, setIsCustom] = useState<boolean>(false);
    const [side, setSide] = useState<0 | 1>(0); // 0 = UP (YES), 1 = DOWN (NO)
    const [stake, setStake] = useState<string>('10');
    const [builderAddr, setBuilderAddr] = useState<string>('');
    const [builderBps, setBuilderBps] = useState<number>(0);

    // Auto-select valid active market
    useEffect(() => {
        if (activeMarkets.length > 0) {
            const exists = activeMarkets.some(
                (m) => m.address.toLowerCase() === selectedMarket.toLowerCase()
            );
            if (!exists && !isCustom && !marketFromQuery) {
                setSelectedMarket(activeMarkets[0].address);
            }
        }
    }, [activeMarkets, selectedMarket, isCustom, marketFromQuery]);

    // TX state
    const [txStep, setTxStep] = useState<'idle' | 'approving' | 'creating' | 'done'>('idle');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [createdDuelId, setCreatedDuelId] = useState<string | null>(null);
    const [copiedLink, setCopiedLink] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Live User USDso Balance
    const { data: userBalance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 5000 },
    });

    // Live User USDso Allowance for WagrEscrow
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 4000 },
    });

    const activeMarketAddress = (isCustom ? customMarket : selectedMarket) as Address;

    // Stake calculations
    const stakeBigInt = (() => {
        try {
            return parseUnits(stake || '0', 6);
        } catch {
            return 0n;
        }
    })();

    const needsApproval =
        allowance !== undefined && stakeBigInt > 0n && (allowance as bigint) < stakeBigInt;

    const hasEnoughBalance =
        userBalance !== undefined ? (userBalance as bigint) >= stakeBigInt : true;

    const payoutCalc = calculatePotentialPayout(stakeBigInt, stakeBigInt, builderBps, 50);

    const handleQuickStake = (val: string) => {
        sfx.stake();
        setStake(val);
    };

    // Step 1: Approve USDso
    async function handleApprove() {
        try {
            setErrorMessage(null);
            setTxStep('approving');
            sfx.tap();
            const hash = await writeContractAsync({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'approve',
                args: [WAGR_ESCROW, maxUint256],
            });
            setTxHash(hash);
            await refetchAllowance();
            setTxStep('idle');
        } catch (err: any) {
            console.error('Approval failed:', err);
            setErrorMessage(err?.shortMessage || err?.message || 'Approval rejected');
            setTxStep('idle');
        }
    }

    // Step 2: Create Duel
    async function handleCreateDuel() {
        if (!activeMarketAddress || activeMarketAddress.length !== 42) {
            setErrorMessage('Please select or enter a valid BinaryMarket contract address');
            return;
        }
        if (stakeBigInt <= 0n) {
            setErrorMessage('Stake must be greater than 0 USDso');
            return;
        }

        try {
            setErrorMessage(null);
            setTxStep('creating');
            sfx.stake();

            const builderTarget =
                builderAddr && builderAddr.length === 42
                    ? (builderAddr as Address)
                    : '0x0000000000000000000000000000000000000000';

            const hash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'createDuel',
                args: [
                    activeMarketAddress,
                    side,
                    stakeBigInt,
                    builderTarget,
                    builderBps,
                ],
            });

            setTxHash(hash);

            // Wait for transaction receipt on Somnia Shannon
            let actualDuelId: string | null = null;
            try {
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                const logs = parseEventLogs({
                    abi: escrowAbi,
                    eventName: 'DuelCreated',
                    logs: receipt.logs,
                });
                if (logs && logs.length > 0 && logs[0].args?.duelId !== undefined) {
                    actualDuelId = logs[0].args.duelId.toString();
                }
            } catch (receiptErr) {
                console.warn('Could not parse receipt logs:', receiptErr);
            }

            // Fallback: read nextDuelId - 1 from WagrEscrow
            if (!actualDuelId) {
                try {
                    const nextId = await publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'nextDuelId',
                    });
                    if (nextId && BigInt(nextId as any) > 1n) {
                        actualDuelId = (BigInt(nextId as any) - 1n).toString();
                    }
                } catch (err) {
                    console.warn('Could not read nextDuelId:', err);
                }
            }

            const finalId = actualDuelId || '1';
            setCreatedDuelId(finalId);
            setTxStep('done');
            sfx.win();
        } catch (err: any) {
            console.error('Create duel failed:', err);
            setErrorMessage(err?.shortMessage || err?.message || 'Failed to create duel');
            setTxStep('idle');
        }
    }

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="text-center space-y-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted">
                            <ZapIcon className="w-3.5 h-3.5 text-brand-light" />
                            <span>1-v-1 Wager Escrow</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Create a Peer Duel
                        </h1>
                        <p className="text-xs sm:text-sm text-muted max-w-md mx-auto">
                            Pick a DreamDEX market, choose your side, and stake USDso. Share the challenge link with an opponent.
                        </p>
                        <div className="pt-1 flex items-center justify-center gap-2">
                            <span className="px-3.5 py-1.5 rounded-xl bg-surface border border-border text-xs font-bold text-white shadow-sm">
                                Create Duel
                            </span>
                            <Link
                                href="/dashboard"
                                onClick={() => sfx.tap()}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-white hover:bg-surface/50 border border-transparent hover:border-border transition-all flex items-center gap-1.5"
                            >
                                <span>My Duels (Active & Past)</span>
                                <ArrowRightIcon className="w-3 h-3 text-brand-light" />
                            </Link>
                        </div>
                    </div>

                    {/* Form Card */}
                    <div className="clean-card rounded-2xl p-6 sm:p-7 space-y-6">
                        {/* Step 1: Select Event Contract */}
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                                    <RadioIcon className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>1. Select DreamDEX Event Contract</span>
                                </label>
                                <button
                                    onClick={() => { sfx.tap(); setIsCustom(!isCustom); }}
                                    className="text-[11px] font-medium text-brand-light hover:text-white transition-colors"
                                >
                                    {isCustom ? '← Pick from active list' : '+ Enter custom clone address'}
                                </button>
                            </div>

                            {!isCustom ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {activeMarkets.length === 0 ? (
                                        <div className="col-span-1 sm:col-span-2 p-6 rounded-xl border border-border bg-bg/40 text-center space-y-2">
                                            <div className="w-5 h-5 rounded-full border-2 border-brand/30 border-t-brand animate-spin mx-auto" />
                                            <div className="text-xs text-muted">Scanning DreamDEX indexer for active windows…</div>
                                            <div className="text-[11px] text-muted-dark">New 1m, 5m, 15m windows spawn continuously</div>
                                        </div>
                                    ) : (
                                        activeMarkets.map((m) => {
                                            const isSelected = selectedMarket.toLowerCase() === m.address.toLowerCase();
                                            return (
                                                <button
                                                    key={m.address}
                                                    type="button"
                                                    onClick={() => { sfx.tap(); setSelectedMarket(m.address); }}
                                                    className={`text-left p-3.5 rounded-xl border transition-all ${
                                                        isSelected
                                                            ? 'bg-brand/15 border-brand text-white shadow-brand-glow'
                                                            : 'bg-bg/60 border-border hover:border-border-glow text-muted'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="font-mono font-bold text-xs text-white truncate">
                                                            {m.symbol}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold flex items-center gap-1">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                                                <span>{formatCountdown(m.expiry)}</span>
                                                            </span>
                                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                                                                {m.timeframe}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[11px] text-muted mt-1.5 truncate">
                                                        {m.strikePrice ? `Strike: ${m.strikePrice}` : m.description}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <input
                                        type="text"
                                        placeholder="0x… BinaryMarket clone address"
                                        value={customMarket}
                                        onChange={(e) => setCustomMarket(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-4 py-3 font-mono text-xs text-white placeholder-muted focus:outline-none focus:border-brand"
                                    />
                                    <p className="text-[11px] text-muted mt-1.5">
                                        Must be an initialized DreamDEX BinaryMarket clone on Shannon testnet.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Step 2: Choose Prediction Side */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
                                2. Choose Your Prediction
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => { sfx.tap(); setSide(0); }}
                                    className={`py-4 px-4 rounded-2xl border text-center transition-all ${
                                        side === 0
                                            ? 'bg-up/15 border-up text-up shadow-up-glow'
                                            : 'bg-bg/60 border-border hover:border-border-glow text-muted'
                                    }`}
                                >
                                    <div className="text-xl font-extrabold tracking-tight">▲ UP</div>
                                    <div className="text-xs font-semibold mt-1">YES / Bullish Close</div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { sfx.tap(); setSide(1); }}
                                    className={`py-4 px-4 rounded-2xl border text-center transition-all ${
                                        side === 1
                                            ? 'bg-down/15 border-down text-down shadow-down-glow'
                                            : 'bg-bg/60 border-border hover:border-border-glow text-muted'
                                    }`}
                                >
                                    <div className="text-xl font-extrabold tracking-tight">▼ DOWN</div>
                                    <div className="text-xs font-semibold mt-1">NO / Bearish Close</div>
                                </button>
                            </div>
                        </div>

                        {/* Step 3: Set Stake Amount */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted">
                                    3. Stake Collateral (USDso)
                                </label>
                                {isConnected && userBalance !== undefined && (
                                    <span className="text-xs text-muted">
                                        Balance:{' '}
                                        <span className="font-mono font-semibold text-emerald-400">
                                            {fmtUsd(userBalance as bigint)} USDso
                                        </span>
                                    </span>
                                )}
                            </div>

                            <div className="relative">
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={stake}
                                    onChange={(e) => setStake(e.target.value)}
                                    className="w-full rounded-2xl bg-bg border border-border px-4 py-3.5 font-mono text-lg font-bold text-white focus:outline-none focus:border-brand"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted">
                                    USDso
                                </div>
                            </div>

                            {/* Quick Stake Buttons */}
                            <div className="flex items-center gap-2 mt-2.5">
                                {['5', '10', '25', '50', '100'].map((amt) => (
                                    <button
                                        key={amt}
                                        type="button"
                                        onClick={() => handleQuickStake(amt)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                                            stake === amt
                                                ? 'bg-brand/20 text-brand-light border border-brand/40'
                                                : 'bg-bg border border-border/80 text-muted hover:text-white'
                                        }`}
                                    >
                                        ${amt}
                                    </button>
                                ))}
                            </div>

                            {!hasEnoughBalance && isConnected && (
                                <p className="text-xs text-down font-medium mt-2">
                                    Insufficient USDso balance. Get testnet USDso on the Faucet page.
                                </p>
                            )}
                        </div>

                        {/* Potential Payout Breakdown */}
                        <div className="rounded-2xl bg-bg/70 border border-border/80 p-4 space-y-2 text-xs">
                            <div className="flex justify-between text-muted">
                                <span>Total Match Pot (1:1):</span>
                                <span className="font-mono text-white font-semibold">
                                    {fmtUsd(payoutCalc.pot)} USDso
                                </span>
                            </div>
                            <div className="flex justify-between text-muted">
                                <span>Platform Protocol Fee (0.50%):</span>
                                <span className="font-mono text-muted">
                                    -{fmtUsd(payoutCalc.platformFee)} USDso
                                </span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-border/60 text-sm font-semibold">
                                <span className="text-white">Estimated Winner Payout:</span>
                                <span className="font-mono text-emerald-400">
                                    {fmtUsd(payoutCalc.netPayout)} USDso
                                </span>
                            </div>
                        </div>

                        {/* Error Notification */}
                        {errorMessage && (
                            <div className="rounded-xl border border-down/40 bg-down/10 p-3.5 text-xs text-down">
                                {errorMessage}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="pt-2">
                            {!isConnected ? (
                                <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-center text-xs text-brand-light">
                                    Connect your wallet above to create a duel on Somnia Shannon.
                                </div>
                            ) : needsApproval ? (
                                <button
                                    onClick={handleApprove}
                                    disabled={txStep === 'approving'}
                                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-brand hover:bg-brand-deep disabled:opacity-50 py-4 font-bold text-sm text-white shadow-brand-glow transition-all"
                                >
                                    <CoinsIcon className="w-4 h-4" />
                                    <span>
                                        {txStep === 'approving' ? 'Approving USDso in Wallet…' : 'Step 1: Approve USDso'}
                                    </span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleCreateDuel}
                                    disabled={txStep === 'creating' || !hasEnoughBalance || stakeBigInt <= 0n}
                                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-brand hover:bg-brand-deep disabled:opacity-40 py-4 font-bold text-sm text-white shadow-brand-glow transition-all"
                                >
                                    <ZapIcon className="w-4 h-4" />
                                    <span>
                                        {txStep === 'creating' ? 'Signing Duel Escrow…' : `Create Duel (${stake} USDso)`}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Duel Created Success Modal */}
                        {txStep === 'done' && (
                            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-5 space-y-4">
                                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                                    <CheckIcon className="w-4 h-4" />
                                    <span>Duel Successfully Created on Shannon!</span>
                                </div>
                                <p className="text-xs text-muted">
                                    Your stake is locked in WagrEscrow. Share this challenge link with your opponent:
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={typeof window !== 'undefined' ? `${window.location.origin}/duel/${createdDuelId || '1'}` : `/duel/${createdDuelId || '1'}`}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2 font-mono text-xs text-brand-light"
                                    />
                                    <button
                                        onClick={() => {
                                            sfx.tap();
                                            const link = typeof window !== 'undefined'
                                                ? `${window.location.origin}/duel/${createdDuelId || '1'}`
                                                : `/duel/${createdDuelId || '1'}`;
                                            navigator.clipboard.writeText(link);
                                            setCopiedLink(true);
                                            setTimeout(() => setCopiedLink(false), 2000);
                                        }}
                                        className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-white hover:bg-surface-hover"
                                    >
                                        {copiedLink ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <Link
                                        href={`/duel/${createdDuelId || '1'}`}
                                        onClick={() => sfx.tap()}
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2.5 text-xs font-bold text-black shadow-brand-glow transition-all"
                                    >
                                        <span>Enter Duel Room #{createdDuelId || '1'}</span>
                                        <ArrowRightIcon className="w-3.5 h-3.5" />
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Advanced / Anti-MEV Experimental Caution Box */}
                    <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-950/20 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    <span>Experimental Alpha</span>
                                </span>
                                <span className="text-xs font-bold text-white">Need Blind Mempool Front-Run Protection?</span>
                            </div>
                        </div>
                        <p className="text-xs text-amber-200/80 leading-relaxed">
                            For all standard wagers, creating a duel above is recommended because you can cancel anytime for an instant 100% refund.
                            If you are testing high-stakes wagers and require zero-knowledge mempool protection against MEV bots, you can explore our Commit-Reveal queue.
                        </p>
                        <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <span className="text-[11px] text-amber-400 font-medium">
                                ⚠️ Caution: In the v1 testnet contract, unmatched sealed commitments cannot be cancelled if the market window expires.
                            </span>
                            <Link
                                href="/arena"
                                onClick={() => sfx.tap()}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-200 transition-colors whitespace-nowrap"
                            >
                                <span>Anti-MEV Arena</span>
                                <ArrowRightIcon className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function CreateDuelPage() {
    return (
        <Suspense
            fallback={
                <>
                    <Nav />
                    <main className="wagr-gradient min-h-screen flex items-center justify-center p-4">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                            <span className="text-xs text-muted font-mono">Loading Duel Creator…</span>
                        </div>
                    </main>
                </>
            }
        >
            <CreateDuelInner />
        </Suspense>
    );
}

