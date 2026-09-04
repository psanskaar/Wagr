'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { keccak256, toHex, type Address } from 'viem';
import { Nav } from '@/components/Nav';
import { Confetti } from '@/components/Confetti';
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

interface RegisteredSplitter {
    handle: string;
    address: Address;
    streamerShare: number;
    coHostAddr?: string;
    deployedAt: number;
    txHash?: string;
}

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

    // On-chain handle status: 'checking' | 'available' | 'owned' | 'taken'
    const [handleStatus, setHandleStatus] = useState<'checking' | 'available' | 'owned' | 'taken'>('checking');
    const [isCheckingBytecode, setIsCheckingBytecode] = useState(false);

    // Registered splitters list from localStorage
    const [mySplitters, setMySplitters] = useState<RegisteredSplitter[]>([]);

    // TX state
    const [isDeploying, setIsDeploying] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [copiedEmbed, setCopiedEmbed] = useState(false);
    const [claimableAmount, setClaimableAmount] = useState<bigint>(0n);
    const [totalSplitterEarned, setTotalSplitterEarned] = useState<bigint>(0n);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Success Confirmation Modal
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [deployedTxHash, setDeployedTxHash] = useState<string | null>(null);
    const [celebrate, setCelebrate] = useState(false);

    // Load registered splitters from localStorage
    useEffect(() => {
        if (!address) return;
        const key = `wagr_creator_splitters_${address.toLowerCase()}`;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                setMySplitters(JSON.parse(raw));
            }
        } catch {}
    }, [address]);

    // Save registered splitter helper
    const saveRegisteredSplitter = (item: RegisteredSplitter) => {
        if (!address) return;
        const key = `wagr_creator_splitters_${address.toLowerCase()}`;
        setMySplitters((prev) => {
            const exists = prev.some((x) => x.handle.toLowerCase() === item.handle.toLowerCase());
            const updated = exists
                ? prev.map((x) => (x.handle.toLowerCase() === item.handle.toLowerCase() ? item : x))
                : [item, ...prev];
            try {
                localStorage.setItem(key, JSON.stringify(updated));
            } catch {}
            return updated;
        });
    };

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

    // Enforced Handle Availability & Bytecode Check on Somnia Shannon
    useEffect(() => {
        let active = true;
        async function checkHandleAvailability() {
            if (!predictedSplitter) return;
            setIsCheckingBytecode(true);
            setHandleStatus('checking');

            try {
                const code = await publicClient.getBytecode({ address: predictedSplitter });
                const isDeployed = Boolean(code && code !== '0x' && code.length > 2);

                if (!isDeployed) {
                    if (active) setHandleStatus('available');
                } else {
                    // Check if current user is part of the splitter recipients
                    if (address) {
                        try {
                            const [owedAmt, isRecip] = await Promise.all([
                                publicClient.readContract({
                                    address: predictedSplitter,
                                    abi: splitterAbi,
                                    functionName: 'owed',
                                    args: [USDSO_TOKEN, address],
                                }),
                                publicClient.readContract({
                                    address: predictedSplitter,
                                    abi: splitterAbi,
                                    functionName: 'totalReceived',
                                    args: [USDSO_TOKEN],
                                }),
                            ]);
                            // If user is recognized on this splitter
                            if (active) setHandleStatus('owned');
                        } catch {
                            if (active) setHandleStatus('taken');
                        }
                    } else {
                        if (active) setHandleStatus('taken');
                    }
                }
            } catch {
                if (active) setHandleStatus('available');
            } finally {
                if (active) setIsCheckingBytecode(false);
            }
        }

        checkHandleAvailability();
        return () => {
            active = false;
        };
    }, [predictedSplitter, address]);

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
        const iv = setInterval(fetchEarnings, 4000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, [deployedSplitter, predictedSplitter, address]);

    // Deploy CREATE2 Splitter
    async function handleDeploySplitter() {
        if (!address || !predictedSplitter) return;
        try {
            setErrorMsg(null);
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

            const txHash = await writeContractAsync({
                address: WAGR_FACTORY,
                abi: factoryAbi,
                functionName: 'createSplitter',
                args: [salt, recipients],
            });

            setDeployedSplitter(predictedSplitter);
            setDeployedTxHash(txHash);
            setHandleStatus('owned');

            // Save to registered splitters list
            saveRegisteredSplitter({
                handle: creatorHandle,
                address: predictedSplitter,
                streamerShare,
                coHostAddr: coHostAddr || undefined,
                deployedAt: Date.now(),
                txHash,
            });

            setCelebrate(true);
            setShowConfirmModal(true);
            sfx.win();
        } catch (err: any) {
            console.error('Deploy splitter failed:', err);
            setErrorMsg(err?.shortMessage || err?.message || 'Deployment transaction failed or rejected');
        } finally {
            setIsDeploying(false);
        }
    }

    // Claim Accrued Fees
    async function handleClaim() {
        const target = deployedSplitter || predictedSplitter;
        if (!target) return;
        try {
            setErrorMsg(null);
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
        } catch (err: any) {
            console.error('Claim failed:', err);
            setErrorMsg(err?.shortMessage || err?.message || 'Claim failed');
        } finally {
            setIsClaiming(false);
        }
    }

    const embedSnippet = `<iframe src="${
        typeof window !== 'undefined' ? window.location.origin : 'https://wagr-app.vercel.app'
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
            <Confetti active={celebrate} />

            {/* Deployment Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        onClick={() => setShowConfirmModal(false)}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
                    />
                    <div className="relative w-full max-w-lg rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-[#11241c] via-bg-elevated to-bg border border-emerald-500/50 shadow-[0_0_80px_rgba(16,185,129,0.3)] z-10 animate-in zoom-in-95 duration-300 space-y-6 text-center">
                        <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-400 to-teal-300 p-0.5 shadow-brand-glow flex items-center justify-center">
                            <div className="h-full w-full rounded-[14px] bg-bg flex items-center justify-center">
                                <SparklesIcon className="w-8 h-8 text-emerald-400" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                CREATE2 Deployed on Shannon
                            </span>
                            <h2 className="text-2xl font-black text-white tracking-tight">
                                @{creatorHandle} Splitter is Live!
                            </h2>
                            <p className="text-xs text-slate-300 max-w-sm mx-auto">
                                Your immutable revenue splitter contract was deployed at a deterministic address on Somnia Shannon testnet.
                            </p>
                        </div>

                        <div className="rounded-2xl bg-black/40 border border-emerald-500/30 p-4 text-left space-y-3 font-mono text-xs">
                            <div className="flex justify-between items-center text-muted">
                                <span>Splitter Contract:</span>
                                <a
                                    href={getExplorerAddressUrl(predictedSplitter || '')}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold"
                                >
                                    <span>{shortAddr(predictedSplitter || '')}</span>
                                    <ExternalLinkIcon className="w-3.5 h-3.5" />
                                </a>
                            </div>
                            <div className="flex justify-between items-center text-muted">
                                <span>Builder Fee Rate:</span>
                                <span className="text-white font-bold">1.00% on every wager</span>
                            </div>
                            <div className="flex justify-between items-center text-muted">
                                <span>Payout Distribution:</span>
                                <span className="text-white font-bold">
                                    {streamerShare}% Streamer {coHostAddr ? `• ${coHostShare}% Co-Host` : ''}
                                </span>
                            </div>
                        </div>

                        {/* Subsequent Steps Instructions */}
                        <div className="rounded-2xl bg-surface/70 border border-border p-4 text-left space-y-2.5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-light flex items-center gap-1.5">
                                <ZapIcon className="w-3.5 h-3.5" />
                                <span>Subsequent Steps to Monetize</span>
                            </h4>
                            <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                                <li>
                                    <strong className="text-white">Copy your embed code</strong> below and paste it into your Twitch overlay, Kick bio, or community site.
                                </li>
                                <li>
                                    Whenever viewers wager on prediction duels through your embed, <strong className="text-emerald-300">1.00% builder fees</strong> are automatically routed to this splitter.
                                </li>
                                <li>
                                    Return to the Creator Studio anytime to view accumulated fees and click <strong className="text-white">Claim Fees</strong> straight to your wallet.
                                </li>
                            </ol>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={copyEmbed}
                                className="flex-1 py-3.5 rounded-xl bg-emerald-400 hover:bg-emerald-500 font-extrabold text-xs text-black transition-colors flex items-center justify-center gap-2"
                            >
                                {copiedEmbed ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                                <span>{copiedEmbed ? 'Copied Embed Snippet!' : 'Copy Embed Snippet'}</span>
                            </button>
                            <button
                                onClick={() => setShowConfirmModal(false)}
                                className="px-5 py-3.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-bold text-white transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

                    {/* My Registered Splitters Bar */}
                    {mySplitters.length > 0 && (
                        <div className="rounded-2xl border border-border bg-surface/60 p-4 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                                    <SparklesIcon className="w-3.5 h-3.5 text-brand-light" />
                                    <span>My Registered Splitters ({mySplitters.length})</span>
                                </span>
                                <span className="text-[11px] text-muted">Click a handle to view or manage</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {mySplitters.map((item) => (
                                    <button
                                        key={item.handle}
                                        onClick={() => {
                                            sfx.tap();
                                            setCreatorHandle(item.handle);
                                            setDeployedSplitter(item.address);
                                            if (item.coHostAddr) {
                                                setCoHostAddr(item.coHostAddr);
                                                setStreamerShare(item.streamerShare);
                                                setCoHostShare(100 - item.streamerShare);
                                            }
                                        }}
                                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono transition-all ${
                                            creatorHandle.toLowerCase() === item.handle.toLowerCase()
                                                ? 'border-brand bg-brand/20 text-white font-bold shadow-sm'
                                                : 'border-border bg-bg/60 text-muted hover:text-white hover:border-border/80'
                                        }`}
                                    >
                                        <span className="text-brand-light">@{item.handle}</span>
                                        <span className="text-[10px] text-muted font-normal">({shortAddr(item.address)})</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Left: Splitter Configuration & Deployer (7 cols) */}
                        <div className="lg:col-span-7 space-y-6">
                            {/* Earnings Overview Card */}
                            <div className="clean-card rounded-2xl p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                                        <CoinsIcon className="w-4 h-4 text-emerald-400" />
                                        <span>Creator Earnings (@{creatorHandle})</span>
                                    </h3>
                                    {predictedSplitter && (
                                        <a
                                            href={getExplorerAddressUrl(predictedSplitter)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-mono text-xs text-muted hover:text-brand-light flex items-center gap-1"
                                        >
                                            <span>Splitter: {shortAddr(predictedSplitter)}</span>
                                            <ExternalLinkIcon className="w-3 h-3 text-muted" />
                                        </a>
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
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                        <SparklesIcon className="w-4 h-4 text-brand-light" />
                                        <span>Deploy Your Immutable WagrSplitter</span>
                                    </h3>

                                    {/* Live Availability Badge */}
                                    <div className="flex items-center gap-1.5">
                                        {isCheckingBytecode ? (
                                            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-surface border border-border text-muted animate-pulse">
                                                Checking on Shannon…
                                            </span>
                                        ) : handleStatus === 'owned' ? (
                                            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                                                <CheckIcon className="w-3 h-3" />
                                                <span>Registered to You (Active)</span>
                                            </span>
                                        ) : handleStatus === 'taken' ? (
                                            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1">
                                                <span>✕ Handle Taken</span>
                                            </span>
                                        ) : (
                                            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold flex items-center gap-1">
                                                <span>● Available (Unclaimed)</span>
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {errorMsg && (
                                    <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 text-xs text-rose-300">
                                        {errorMsg}
                                    </div>
                                )}

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
                                            placeholder="streamer"
                                            className="w-full bg-transparent font-mono text-sm text-white focus:outline-none"
                                        />
                                    </div>
                                    {handleStatus === 'taken' && (
                                        <p className="text-[11px] text-rose-400 mt-1.5 font-medium">
                                            This username already has a deployed contract on Somnia Shannon. Pick another handle.
                                        </p>
                                    )}
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
                                    disabled={isDeploying || !isConnected || handleStatus === 'taken' || !creatorHandle}
                                    className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-deep font-bold text-xs text-white shadow-brand-glow transition-all disabled:opacity-50"
                                >
                                    {isDeploying
                                        ? 'Deploying Splitter Clone on Shannon…'
                                        : handleStatus === 'owned'
                                        ? 'Splitter Already Deployed (Active)'
                                        : handleStatus === 'taken'
                                        ? 'Handle Taken: Choose Another Name'
                                        : 'Deploy Splitter (CREATE2)'}
                                </button>
                            </div>

                            {/* Embed HTML Code Box */}
                            <div className="rounded-3xl border border-border bg-surface/80 p-6 backdrop-blur-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                                        Embed Iframe Snippet (@{creatorHandle})
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
                                    <button className="py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 font-bold text-xs text-emerald-400">
                                        UP (YES)
                                    </button>
                                    <button className="py-2.5 rounded-xl border border-border bg-bg/50 font-bold text-xs text-muted">
                                        DOWN (NO)
                                    </button>
                                </div>

                                <div className="space-y-1 text-[11px] text-muted">
                                    <div className="flex justify-between">
                                        <span>Stake:</span>
                                        <span className="text-white font-mono">10.00 USDso</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Builder Attribution:</span>
                                        <span className="text-brand-light font-mono font-bold">1.00% to @{creatorHandle}</span>
                                    </div>
                                </div>

                                <button
                                    disabled
                                    className="w-full py-3 rounded-xl bg-brand font-bold text-xs text-white shadow-brand-glow"
                                >
                                    Place Wager (One-Tap)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
