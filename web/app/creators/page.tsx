'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { keccak256, toHex, type Address } from 'viem';
import { Nav } from '@/components/Nav';
import {
    WAGR_FACTORY,
    USDSO_TOKEN,
    factoryAbi,
    splitterAbi,
    publicClient,
    fmtUsd,
    shortAddr,
    getExplorerAddressUrl,
    sfx,
} from '@/lib/wagr';
import {
    UsersIcon,
    ZapIcon,
    CopyIcon,
    CheckIcon,
    CoinsIcon,
    ExternalLinkIcon,
    SparklesIcon,
    ShieldCheckIcon,
} from '@/components/Icons';

export default function CreatorStudioPage() {
    const { address, isConnected } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [creatorHandle, setCreatorHandle] = useState('streamer');
    const [coHostAddr, setCoHostAddr] = useState('');
    const [streamerShare, setStreamerShare] = useState(80); // 80%
    const [coHostShare, setCoHostShare] = useState(20); // 20%

    // Deterministic salt & predicted address
    const [salt, setSalt] = useState<`0x${string}`>('0x0000000000000000000000000000000000000000000000000000000000000001');
    const [predictedSplitter, setPredictedSplitter] = useState<Address | null>(null);
    const [deployedSplitter, setDeployedSplitter] = useState<Address | null>(null);

    // TX state
    const [isDeploying, setIsDeploying] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [copiedEmbed, setCopiedEmbed] = useState(false);
    const [claimableAmount, setClaimableAmount] = useState<bigint>(0n);
    const [totalSplitterEarned, setTotalSplitterEarned] = useState<bigint>(0n);

    // Compute salt from handle
    useEffect(() => {
        if (!creatorHandle) return;
        const s = keccak256(toHex(creatorHandle.toLowerCase()));
        setSalt(s);
    }, [creatorHandle]);

    // Predict splitter address via factory
    useEffect(() => {
        let active = true;
        async function getPredicted() {
            try {
                const addr = (await publicClient.readContract({
                    address: WAGR_FACTORY,
                    abi: factoryAbi,
                    functionName: 'predict',
                    args: [salt],
                })) as Address;

                if (active) setPredictedSplitter(addr);
            } catch {
                // prediction fallback
            }
        }
        if (salt) getPredicted();
        return () => {
            active = false;
        };
    }, [salt]);

    // Check earnings on the active or predicted splitter
    useEffect(() => {
        const target = deployedSplitter || predictedSplitter;
        if (!target || !address) return;
        const splitterAddr: Address = target;
        const userAddr: Address = address;

        let active = true;
        async function fetchEarnings() {
            try {
                const [received, owed] = (await Promise.all([
                    publicClient.readContract({
                        address: splitterAddr,
                        abi: splitterAbi,
                        functionName: 'totalReceived',
                        args: [USDSO_TOKEN],
                    }),
                    publicClient.readContract({
                        address: splitterAddr,
                        abi: splitterAbi,
                        functionName: 'owed',
                        args: [USDSO_TOKEN, userAddr],
                    }),
                ])) as [bigint, bigint];

                if (active) {
                    setTotalSplitterEarned(received);
                    setClaimableAmount(owed);
                }
            } catch {
                // Splitter not yet deployed on Shannon
            }
        }

        fetchEarnings();
        const iv = setInterval(fetchEarnings, 5000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, [deployedSplitter, predictedSplitter, address]);

    // Deploy CREATE2 Splitter
    async function handleDeploySplitter() {
        if (!address) return;
        try {
            setIsDeploying(true);
            sfx.stake();

            const recipients = [
                {
                    to: address as Address,
                    shareBps: streamerShare * 100, // bps = % * 100
                },
            ];

            if (coHostAddr && coHostAddr.length === 42 && coHostShare > 0) {
                recipients.push({
                    to: coHostAddr as Address,
                    shareBps: coHostShare * 100,
                });
            } else {
                // 100% to creator
                recipients[0].shareBps = 10_000;
            }

            await writeContractAsync({
                address: WAGR_FACTORY,
                abi: factoryAbi,
                functionName: 'createSplitter',
                args: [salt, recipients],
            });

            setDeployedSplitter(predictedSplitter);
            sfx.win();
        } catch (err) {
            console.error('Deploy splitter failed:', err);
        } finally {
            setIsDeploying(false);
        }
    }

    // Claim Accrued Fees
    async function handleClaim() {
        const target = deployedSplitter || predictedSplitter;
        if (!target) return;
        try {
            setIsClaiming(true);
            sfx.stake();
            await writeContractAsync({
                address: target as Address,
                abi: splitterAbi,
                functionName: 'claim',
                args: [USDSO_TOKEN],
            });
            sfx.win();
            setClaimableAmount(0n);
        } catch (err) {
            console.error('Claim failed:', err);
        } finally {
            setIsClaiming(false);
        }
    }

    const embedSnippet = `<iframe src="${
        typeof window !== 'undefined' ? window.location.origin : 'https://wagr.xyz'
    }/widget/${creatorHandle}" width="340" height="460" frameborder="0" style="border-radius: 16px; overflow: hidden;" allow="clipboard-write"></iframe>`;

    const copyEmbed = () => {
        sfx.tap();
        navigator.clipboard.writeText(embedSnippet);
        setCopiedEmbed(true);
        setTimeout(() => setCopiedEmbed(false), 2000);
    };

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="pb-6 border-b border-border">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                            <UsersIcon className="w-3.5 h-3.5 text-brand-light" />
                            <span>Creator Studio & Embeds</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Streamer Prediction Widgets
                        </h1>
                        <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
                            Deploy an immutable CREATE2 fee splitter and embed live prediction cards on Twitch, Kick, YouTube, or Substack.
                            Every wager routed through your embed pays your splitter via DreamDEX’s <code className="text-slate-200 font-mono">approveBuilder</code>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Left: Splitter Configuration & Deployer (7 cols) */}
                        <div className="lg:col-span-7 space-y-6">
                            {/* Earnings Overview Card */}
                            <div className="clean-card rounded-2xl p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                                        <CoinsIcon className="w-4 h-4 text-emerald-400" />
                                        <span>Your Creator Earnings</span>
                                    </h3>
                                    {predictedSplitter && (
                                        <span className="font-mono text-xs text-muted">
                                            Splitter: {shortAddr(predictedSplitter)}
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div className="rounded-2xl bg-bg/60 p-4 border border-border/80">
                                        <div className="text-xs text-muted">Claimable Now:</div>
                                        <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                                            {fmtUsd(claimableAmount)} USDso
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-bg/60 p-4 border border-border/80">
                                        <div className="text-xs text-muted">Total Accrued Fees:</div>
                                        <div className="text-2xl font-mono font-bold text-white mt-1">
                                            {fmtUsd(totalSplitterEarned)} USDso
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleClaim}
                                    disabled={isClaiming || claimableAmount <= 0n}
                                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold text-xs text-black transition-colors disabled:opacity-40"
                                >
                                    {isClaiming ? 'Claiming Fees…' : `Claim ${fmtUsd(claimableAmount)} USDso`}
                                </button>
                            </div>

                            {/* Deploy Splitter Form */}
                            <div className="rounded-3xl border border-border bg-surface/80 p-6 sm:p-8 backdrop-blur-xl shadow-glass space-y-5">
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <SparklesIcon className="w-4 h-4 text-brand-light" />
                                    <span>Deploy Your Immutable WagrSplitter</span>
                                </h3>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                                        Creator Handle (Salt seed)
                                    </label>
                                    <div className="flex items-center rounded-xl bg-bg border border-border px-4 py-3">
                                        <span className="text-xs text-muted font-mono mr-1">@</span>
                                        <input
                                            type="text"
                                            value={creatorHandle}
                                            onChange={(e) => setCreatorHandle(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                                            className="w-full bg-transparent font-mono text-sm text-white focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                                        Optional Co-Host / Mod Address
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="0x… (optional)"
                                        value={coHostAddr}
                                        onChange={(e) => setCoHostAddr(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-4 py-3 font-mono text-xs text-white placeholder-muted focus:outline-none focus:border-brand"
                                    />
                                </div>

                                {coHostAddr && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted">Streamer Cut: {streamerShare}%</span>
                                            <span className="text-muted">Co-Host Cut: {coHostShare}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="10"
                                            max="90"
                                            step="5"
                                            value={streamerShare}
                                            onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setStreamerShare(v);
                                                setCoHostShare(100 - v);
                                            }}
                                            className="w-full accent-brand"
                                        />
                                    </div>
                                )}

                                {predictedSplitter && (
                                    <div className="rounded-xl bg-bg/50 border border-border/80 p-3 text-xs flex items-center justify-between">
                                        <span className="text-muted">Deterministic Splitter Address:</span>
                                        <span className="font-mono text-brand-light font-bold">
                                            {shortAddr(predictedSplitter)}
                                        </span>
                                    </div>
                                )}

                                <button
                                    onClick={handleDeploySplitter}
                                    disabled={isDeploying || !isConnected}
                                    className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-deep font-bold text-xs text-white shadow-brand-glow transition-all disabled:opacity-50"
                                >
                                    {isDeploying ? 'Deploying Splitter Clone on Shannon…' : 'Deploy Splitter (CREATE2)'}
                                </button>
                            </div>

                            {/* Embed HTML Code Box */}
                            <div className="rounded-3xl border border-border bg-surface/80 p-6 backdrop-blur-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                                        Embed Iframe Snippet
                                    </h4>
                                    <button
                                        onClick={copyEmbed}
                                        className="flex items-center gap-1 text-xs text-brand-light hover:text-white"
                                    >
                                        {copiedEmbed ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                        <span>{copiedEmbed ? 'Copied!' : 'Copy Code'}</span>
                                    </button>
                                </div>
                                <div className="rounded-xl bg-bg p-3.5 font-mono text-xs text-slate-300 break-all border border-border/80">
                                    {embedSnippet}
                                </div>
                            </div>
                        </div>

                        {/* Right: Live Interactive Widget Preview (5 cols) */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span>Live Viewer Embed Preview</span>
                            </div>

                            {/* Embed Container Preview */}
                            <div className="rounded-3xl border border-brand/30 bg-surface/90 p-5 backdrop-blur-xl shadow-glass space-y-4 max-w-[340px] mx-auto">
                                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                                    <div className="flex items-center gap-2">
                                        <div className="h-6 w-6 rounded-lg bg-brand flex items-center justify-center font-black text-xs text-white">
                                            ■
                                        </div>
                                        <span className="text-xs font-bold tracking-tight text-white uppercase">WAGR WIDGET</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-brand-light bg-brand/15 px-2 py-0.5 rounded border border-brand/20">
                                        @{creatorHandle}
                                    </span>
                                </div>

                                <div>
                                    <div className="text-xs font-bold text-white">
                                        Will BTC be UP at close?
                                    </div>
                                    <div className="text-[11px] text-muted mt-0.5">
                                        DreamDEX 15-Min Window · Auto-settling
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button className="py-2.5 rounded-xl bg-up/20 border border-up text-up font-bold text-xs">
                                        ▲ UP
                                    </button>
                                    <button className="py-2.5 rounded-xl bg-bg border border-border text-muted font-bold text-xs hover:border-down">
                                        ▼ DOWN
                                    </button>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Stake USDso</label>
                                    <input
                                        type="number"
                                        readOnly
                                        value="10"
                                        className="mt-1 w-full rounded-xl bg-bg border border-border px-3 py-2 font-mono text-xs text-white"
                                    />
                                </div>

                                <button className="w-full py-3 rounded-xl bg-brand font-bold text-xs text-white shadow-brand-glow">
                                    Wager 10.00 USDso
                                </button>

                                <div className="text-[10px] text-muted text-center leading-tight">
                                    Streamer cut routed automatically to splitter via <code className="text-slate-300">approveBuilder</code>.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
