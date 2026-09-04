'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import {
    keccak256,
    encodeAbiParameters,
    parseAbiParameters,
    parseUnits,
    formatUnits,
    maxUint256,
    isAddress,
    type Address,
} from 'viem';
import { Nav } from '@/components/Nav';
import { Confetti } from '@/components/Confetti';
import {
    WAGR_ESCROW,
    USDSO_TOKEN,
    escrowAbi,
    erc20Abi,
    binaryMarketAbi,
    publicClient,
    KNOWN_DREAMDEX_MARKETS,
    fmtUsd,
    shortAddr,
    shortHash,
    getExplorerAddressUrl,
    formatCountdown,
    sfx,
} from '@/lib/wagr';
import { useActiveMarkets } from '@/hooks/useActiveMarkets';
import {
    ShieldCheckIcon,
    ZapIcon,
    LockIcon,
    SparklesIcon,
    CoinsIcon,
    ExternalLinkIcon,
    CheckIcon,
    CopyIcon,
    ArrowRightIcon,
    ClockIcon,
    RefreshCwIcon,
} from '@/components/Icons';

interface StoredCommitment {
    commitId: number;
    maker: Address;
    marketAddress: Address;
    marketSymbol: string;
    side: 0 | 1;
    stakeUsd: string;
    stakeBn: string; // serialized bigint string
    salt: `0x${string}`;
    commitHash: `0x${string}`;
    txHash?: string;
    createdAt: number;
    consumed?: boolean;
    marketExpiry?: number;
    matchedDuelId?: number;
}

export default function ArenaPage() {
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
    // Filter active markets
    const activeMarkets = (liveMarkets.length > 0 ? liveMarkets : KNOWN_DREAMDEX_MARKETS).filter(
        (m) => m.expiry > now
    );

    // Maker Commit Form
    const [market, setMarket] = useState<string>(
        activeMarkets[0]?.address || KNOWN_DREAMDEX_MARKETS[0].address
    );
    const [side, setSide] = useState<0 | 1>(0);
    const [stake, setStake] = useState('20');
    const [salt, setSalt] = useState<string>('');
    const [generatedCommitHash, setGeneratedCommitHash] = useState<string | null>(null);

    // Auto-select valid active market
    useEffect(() => {
        if (activeMarkets.length > 0) {
            const exists = activeMarkets.some(
                (m) => m.address.toLowerCase() === market.toLowerCase()
            );
            if (!exists) {
                setMarket(activeMarkets[0].address);
            }
        }
    }, [activeMarkets, market]);

    // TX state (Maker)
    const [isCommitting, setIsCommitting] = useState(false);
    const [commitSuccess, setCommitSuccess] = useState<boolean>(false);
    const [createdCommitId, setCreatedCommitId] = useState<number | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [celebrate, setCelebrate] = useState(false);

    // Copied feedback
    const [copiedCommitId, setCopiedCommitId] = useState<number | null>(null);
    const [copiedLinkCommitId, setCopiedLinkCommitId] = useState<number | null>(null);
    const [revealedSaltId, setRevealedSaltId] = useState<number | null>(null);

    // User's Stored Commitments
    const [myCommitments, setMyCommitments] = useState<StoredCommitment[]>([]);
    const [isLoadingPositions, setIsLoadingPositions] = useState(false);

    // Match & Reveal Form State (Taker flow)
    const [quickFillInput, setQuickFillInput] = useState('');
    const [takerCommitId, setTakerCommitId] = useState('');
    const [takerMarket, setTakerMarket] = useState('');
    const [takerMakerSide, setTakerMakerSide] = useState<0 | 1>(0);
    const [takerStake, setTakerStake] = useState('');
    const [takerSalt, setTakerSalt] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    const [isTakerApproving, setIsTakerApproving] = useState(false);
    const [matchError, setMatchError] = useState<string | null>(null);
    const [matchedDuelId, setMatchedDuelId] = useState<number | null>(null);
    const [prefilledFromUrl, setPrefilledFromUrl] = useState(false);

    // Live balance and allowance for Maker & Taker
    const { data: userBalance, refetch: refetchBalance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 3000 },
    });

    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: USDSO_TOKEN,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address ? [address, WAGR_ESCROW] : undefined,
        query: { enabled: !!address, refetchInterval: 3000 },
    });

    // Check URL query params for 1-Click Challenge Link on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const params = new URLSearchParams(window.location.search);
            const qCommitId = params.get('commitId');
            const qMarket = params.get('market');
            const qSide = params.get('side');
            const qStake = params.get('stake');
            const qSalt = params.get('salt');

            if (qCommitId && qMarket && qSalt) {
                setTakerCommitId(qCommitId.replace(/^#/, '').trim());
                setTakerMarket(qMarket.trim());
                if (qSide === '0' || qSide === '1') {
                    setTakerMakerSide(Number(qSide) as 0 | 1);
                }
                if (qStake) setTakerStake(qStake.trim());
                setTakerSalt(qSalt.trim());
                setPrefilledFromUrl(true);

                // Smooth scroll to match section
                setTimeout(() => {
                    document.getElementById('match-challenger-section')?.scrollIntoView({ behavior: 'smooth' });
                }, 300);
            }
        } catch (err) {
            console.warn('Failed to parse URL query params:', err);
        }
    }, []);

    // Generate random 32-byte salt
    const generateNewSalt = () => {
        if (typeof window !== 'undefined') {
            const randomBytes = new Uint8Array(32);
            window.crypto.getRandomValues(randomBytes);
            const hexSalt =
                '0x' +
                Array.from(randomBytes)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');
            setSalt(hexSalt);
        }
    };

    useEffect(() => {
        generateNewSalt();
    }, []);

    // Stake BigInt (Maker)
    const stakeBn = useMemo(() => {
        try {
            return parseUnits(stake || '0', 6);
        } catch {
            return 0n;
        }
    }, [stake]);

    const needsApproval =
        allowance !== undefined && stakeBn > 0n && (allowance as bigint) < stakeBn;

    // Stake BigInt (Taker)
    const takerStakeBn = useMemo(() => {
        try {
            return parseUnits(takerStake || '0', 6);
        } catch {
            return 0n;
        }
    }, [takerStake]);

    const takerNeedsApproval =
        allowance !== undefined && takerStakeBn > 0n && (allowance as bigint) < takerStakeBn;

    const takerHasInsufficientBalance =
        userBalance !== undefined && takerStakeBn > 0n && (userBalance as bigint) < takerStakeBn;

    // Calculate commit hash: keccak256(abi.encode(marketAddress, makerSide, stake, salt, maker))
    useEffect(() => {
        if (!address || !market || !salt || stakeBn <= 0n) return;
        try {
            const encoded = encodeAbiParameters(
                parseAbiParameters('address, uint8, uint128, bytes32, address'),
                [market as Address, side, stakeBn, salt as `0x${string}`, address as Address]
            );
            const h = keccak256(encoded);
            setGeneratedCommitHash(h);
        } catch {
            setGeneratedCommitHash(null);
        }
    }, [address, market, side, stakeBn, salt]);

    // Quick Fill parser for Taker (auto extracts from URL or raw text)
    const handleQuickFill = (text: string) => {
        setQuickFillInput(text);
        const trimmed = text.trim();
        if (!trimmed) return;

        // Check if URL
        if (trimmed.includes('commitId=') || trimmed.includes('/arena?')) {
            try {
                const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.com/${trimmed.replace(/^\//, '')}`);
                const qCommitId = url.searchParams.get('commitId');
                const qMarket = url.searchParams.get('market');
                const qSide = url.searchParams.get('side');
                const qStake = url.searchParams.get('stake');
                const qSalt = url.searchParams.get('salt');

                if (qCommitId) setTakerCommitId(qCommitId.replace(/^#/, '').trim());
                if (qMarket) setTakerMarket(qMarket.trim());
                if (qSide === '0' || qSide === '1') setTakerMakerSide(Number(qSide) as 0 | 1);
                if (qStake) setTakerStake(qStake.trim());
                if (qSalt) setTakerSalt(qSalt.trim());
                sfx.tap();
                return;
            } catch {}
        }

        // Check text payload format
        const idMatch = trimmed.match(/Commit ID:\s*#?(\d+)/i);
        const marketMatch = trimmed.match(/Market:\s*(0x[a-fA-F0-9]{40})/i);
        const sideMatch = trimmed.match(/Maker Side:\s*(UP|DOWN|YES|NO|0|1)/i);
        const stakeMatch = trimmed.match(/Stake:\s*([0-9.]+)/i);
        const saltMatch = trimmed.match(/Salt:\s*(0x[a-fA-F0-9]{64})/i);

        if (idMatch) setTakerCommitId(idMatch[1]);
        if (marketMatch) setTakerMarket(marketMatch[1]);
        if (sideMatch) {
            const s = sideMatch[1].toUpperCase();
            setTakerMakerSide(s === 'UP' || s === 'YES' || s === '0' ? 0 : 1);
        }
        if (stakeMatch) setTakerStake(stakeMatch[1]);
        if (saltMatch) setTakerSalt(saltMatch[1]);

        if (idMatch || marketMatch || saltMatch) {
            sfx.tap();
        }
    };

    // Load & verify my commitments from localStorage and on-chain state
    const refreshMyCommitments = async () => {
        if (!address) return;
        const storageKey = `wagr_sealed_commits_${address.toLowerCase()}`;
        try {
            setIsLoadingPositions(true);
            const raw = localStorage.getItem(storageKey);
            if (!raw) {
                setMyCommitments([]);
                setIsLoadingPositions(false);
                return;
            }
            const list: StoredCommitment[] = JSON.parse(raw);

            // Verify live on-chain status and query market expiry for each commitment
            const updated = await Promise.all(
                list.map(async (item) => {
                    try {
                        const [onChainCommit, onChainExpiry] = await Promise.all([
                            publicClient.readContract({
                                address: WAGR_ESCROW,
                                abi: escrowAbi,
                                functionName: 'commits',
                                args: [BigInt(item.commitId)],
                            }) as Promise<[Address, bigint, number, boolean, bigint, `0x${string}`, Address]>,
                            publicClient.readContract({
                                address: item.marketAddress,
                                abi: binaryMarketAbi,
                                functionName: 'expiry',
                            }) as Promise<bigint>,
                        ]);

                        return {
                            ...item,
                            consumed: onChainCommit[3], // boolean consumed
                            marketExpiry: Number(onChainExpiry),
                        };
                    } catch {
                        return item;
                    }
                })
            );

            setMyCommitments(updated);
            localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {
            console.warn('Failed to load commitments:', err);
        } finally {
            setIsLoadingPositions(false);
        }
    };

    useEffect(() => {
        refreshMyCommitments();
        const interval = setInterval(refreshMyCommitments, 5000);
        return () => clearInterval(interval);
    }, [address]);

    async function handleApprove() {
        try {
            setErrorMsg(null);
            sfx.tap();
            await writeContractAsync({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'approve',
                args: [WAGR_ESCROW, maxUint256],
            });
            await refetchAllowance();
            sfx.win();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Approval rejected');
        }
    }

    async function handleTakerApprove() {
        try {
            setMatchError(null);
            setIsTakerApproving(true);
            sfx.tap();
            await writeContractAsync({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'approve',
                args: [WAGR_ESCROW, maxUint256],
            });
            await refetchAllowance();
            sfx.win();
        } catch (err: any) {
            setMatchError(err?.shortMessage || err?.message || 'Approval rejected');
        } finally {
            setIsTakerApproving(false);
        }
    }

    async function handleCommit() {
        if (!generatedCommitHash || stakeBn <= 0n || !address) return;
        try {
            setErrorMsg(null);
            setIsCommitting(true);
            sfx.stake();

            // Read nextCommitId as baseline
            let anticipatedId = 1;
            try {
                const nextId = (await publicClient.readContract({
                    address: WAGR_ESCROW,
                    abi: escrowAbi,
                    functionName: 'nextCommitId',
                })) as bigint;
                anticipatedId = Number(nextId);
            } catch {}

            const txHash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'commit',
                args: [generatedCommitHash as `0x${string}`, stakeBn],
            });

            // Wait for receipt to extract exact on-chain commit ID
            let actualCommitId = anticipatedId;
            try {
                const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
                for (const log of receipt.logs) {
                    if (
                        log.address.toLowerCase() === WAGR_ESCROW.toLowerCase() &&
                        log.topics.length >= 2 &&
                        log.topics[1]
                    ) {
                        actualCommitId = Number(BigInt(log.topics[1]));
                        break;
                    }
                }
            } catch (waitErr) {
                console.warn('Could not read receipt event immediately, using anticipatedId:', waitErr);
            }

            // Find current market info
            const currentM = activeMarkets.find((m) => m.address.toLowerCase() === market.toLowerCase());
            const marketSymbol = currentM ? currentM.symbol : 'DreamDEX-Market';
            const marketExpiry = currentM ? currentM.expiry : Math.floor(Date.now() / 1000) + 300;

            // Store in user's commitments
            const newCommit: StoredCommitment = {
                commitId: actualCommitId,
                maker: address as Address,
                marketAddress: market as Address,
                marketSymbol,
                side,
                stakeUsd: stake,
                stakeBn: stakeBn.toString(),
                salt: salt as `0x${string}`,
                commitHash: generatedCommitHash as `0x${string}`,
                txHash,
                createdAt: Date.now(),
                consumed: false,
                marketExpiry,
            };

            const storageKey = `wagr_sealed_commits_${address.toLowerCase()}`;
            const existingRaw = localStorage.getItem(storageKey);
            const existingList: StoredCommitment[] = existingRaw ? JSON.parse(existingRaw) : [];
            const updatedList = [newCommit, ...existingList];
            localStorage.setItem(storageKey, JSON.stringify(updatedList));
            setMyCommitments(updatedList);

            setCreatedCommitId(actualCommitId);
            setCommitSuccess(true);
            setCelebrate(true);
            sfx.win();

            // Refresh balances
            refetchBalance();
            refetchAllowance();

            // Generate fresh salt for next potential commit
            generateNewSalt();
        } catch (err: any) {
            setErrorMsg(err?.shortMessage || err?.message || 'Commit failed');
        } finally {
            setIsCommitting(false);
        }
    }

    // Match & Reveal handler for takers
    async function handleMatchAndReveal() {
        if (!address || !takerCommitId || !takerMarket || !takerSalt || !takerStake) return;
        try {
            setMatchError(null);
            setIsMatching(true);
            sfx.stake();

            const cleanCommitId = BigInt(takerCommitId.trim().replace(/^#/, ''));
            const cleanMarket = takerMarket.trim() as Address;
            const cleanSalt = (takerSalt.trim().startsWith('0x')
                ? takerSalt.trim()
                : `0x${takerSalt.trim()}`) as `0x${string}`;
            const cleanStake = parseUnits(takerStake.trim(), 6);
            const takerSide = takerMakerSide === 0 ? 1 : 0;

            if (!isAddress(cleanMarket)) {
                throw new Error('Invalid market contract address.');
            }

            // 1. Check maker & expiry on-chain before executing
            try {
                const [onChainCommit, onChainExpiry] = await Promise.all([
                    publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'commits',
                        args: [cleanCommitId],
                    }) as Promise<[Address, bigint, number, boolean, bigint, `0x${string}`, Address]>,
                    publicClient.readContract({
                        address: cleanMarket,
                        abi: binaryMarketAbi,
                        functionName: 'expiry',
                    }) as Promise<bigint>,
                ]);

                if (onChainCommit[3]) {
                    throw new Error(`Commitment #${cleanCommitId} has already been matched into a duel.`);
                }

                if (onChainCommit[0].toLowerCase() === address.toLowerCase()) {
                    throw new Error('You cannot match against your own commitment (SelfMatch). Please connect a separate opponent wallet.');
                }

                const currentBlockTime = BigInt(Math.floor(Date.now() / 1000));
                if (currentBlockTime >= onChainExpiry) {
                    throw new Error('This market trading window has expired. Unmatched commitments cannot be matched after expiry.');
                }

                // Verify hash locally
                const expectedHash = keccak256(
                    encodeAbiParameters(
                        parseAbiParameters('address, uint8, uint128, bytes32, address'),
                        [cleanMarket, takerMakerSide, cleanStake, cleanSalt, onChainCommit[0]]
                    )
                );

                if (expectedHash.toLowerCase() !== onChainCommit[5].toLowerCase()) {
                    throw new Error('Parameter mismatch: The market, side, stake, or salt does not match the maker on-chain hash.');
                }
            } catch (checkErr: any) {
                if (checkErr?.message) throw checkErr;
            }

            // 2. Pre-simulate contract call to catch revert reasons cleanly
            try {
                await publicClient.simulateContract({
                    account: address,
                    address: WAGR_ESCROW,
                    abi: escrowAbi,
                    functionName: 'matchAndReveal',
                    args: [
                        cleanCommitId,
                        cleanMarket,
                        takerMakerSide,
                        cleanStake,
                        cleanSalt,
                        takerSide,
                        cleanStake,
                    ],
                });
            } catch (simErr: any) {
                console.error('Simulation failed:', simErr);
                const msg = simErr?.shortMessage || simErr?.message || '';
                if (msg.includes('MarketExpired')) {
                    throw new Error('Target market trading window has expired.');
                } else if (msg.includes('CommitMismatch')) {
                    throw new Error('Commitment hash mismatch. Verify market address, maker side, stake, and salt.');
                } else if (msg.includes('CommitConsumed')) {
                    throw new Error('This commitment was already consumed into a duel.');
                } else if (msg.includes('SelfMatch')) {
                    throw new Error('You cannot match your own commitment. Switch to an opponent wallet.');
                } else if (msg.includes('NonceReused')) {
                    throw new Error('This reveal salt has already been used.');
                } else if (msg.includes('insufficient allowance') || msg.includes('transfer amount exceeds allowance')) {
                    throw new Error('USDso allowance insufficient. Please approve USDso first.');
                } else {
                    throw new Error(simErr?.shortMessage || 'Transaction simulation reverted. Please verify input parameters.');
                }
            }

            // 3. Execute matchAndReveal transaction
            const txHash = await writeContractAsync({
                address: WAGR_ESCROW,
                abi: escrowAbi,
                functionName: 'matchAndReveal',
                args: [
                    cleanCommitId,
                    cleanMarket,
                    takerMakerSide,
                    cleanStake,
                    cleanSalt,
                    takerSide,
                    cleanStake,
                ],
            });

            // 4. Wait for receipt and extract created duelId
            let newDuelId: number | null = null;
            try {
                const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
                for (const log of receipt.logs) {
                    if (
                        log.address.toLowerCase() === WAGR_ESCROW.toLowerCase() &&
                        log.topics.length >= 3 &&
                        log.topics[2]
                    ) {
                        // CommitRevealed(commitId, duelId) or DuelCreated(duelId, ...)
                        newDuelId = Number(BigInt(log.topics[2]));
                    }
                }
            } catch (receiptErr) {
                console.warn('Could not parse created duelId from receipt:', receiptErr);
            }

            if (newDuelId) {
                setMatchedDuelId(newDuelId);
            }

            sfx.win();
            setCelebrate(true);
            refetchBalance();
            refetchAllowance();
            refreshMyCommitments();
        } catch (err: any) {
            console.error('Match failed:', err);
            setMatchError(err?.shortMessage || err?.message || 'Match and Reveal failed');
        } finally {
            setIsMatching(false);
        }
    }

    // Copy 1-Click Link
    const copy1ClickLink = (c: StoredCommitment) => {
        sfx.tap();
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wagr-app.vercel.app';
        const link = `${origin}/arena?commitId=${c.commitId}&market=${c.marketAddress}&side=${c.side}&stake=${c.stakeUsd}&salt=${c.salt}`;
        navigator.clipboard.writeText(link);
        setCopiedLinkCommitId(c.commitId);
        setTimeout(() => setCopiedLinkCommitId(null), 2500);
    };

    // Copy raw payload text
    const copyCommitPayload = (c: StoredCommitment) => {
        sfx.tap();
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wagr-app.vercel.app';
        const payload = `WAGR ANTI-MEV CHALLENGE:\nCommit ID: #${c.commitId}\nMarket: ${c.marketAddress}\nMaker Side: ${c.side === 0 ? 'UP (YES)' : 'DOWN (NO)'}\nStake: ${c.stakeUsd} USDso\nSalt: ${c.salt}\nMatch URL: ${origin}/arena?commitId=${c.commitId}&market=${c.marketAddress}&side=${c.side}&stake=${c.stakeUsd}&salt=${c.salt}`;
        navigator.clipboard.writeText(payload);
        setCopiedCommitId(c.commitId);
        setTimeout(() => setCopiedCommitId(null), 2000);
    };

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <Confetti active={celebrate} />

            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Header */}
                    <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                            <ShieldCheckIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span>Zero-Knowledge Front-Run Protection</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Anti-MEV Commit-Reveal Arena
                        </h1>
                        <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
                            On ultra-fast networks like Somnia, automated bots monitor public mempools to copy or sandwich prediction trades.
                            Wagr locks your wager into an encrypted keccak256 hash until matched, ensuring total MEV immunity.
                        </p>
                    </div>

                    {/* EXPERIMENTAL / DANGER WARNING BOX */}
                    <div className="rounded-2xl border-2 border-red-500/80 bg-red-950/40 p-5 sm:p-6 space-y-3.5 shadow-xl shadow-red-950/30">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-sm">
                                    <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                                    <span>⚠️ DANGER: EXPERIMENTAL ALPHA</span>
                                </span>
                                <span className="text-sm font-bold text-red-200">
                                    Funds Can Become Trapped in Escrow
                                </span>
                            </div>
                            <Link
                                href="/create"
                                className="inline-flex items-center gap-1 text-xs font-bold text-red-300 hover:text-white underline underline-offset-2"
                            >
                                <span>Switch to Standard Duel (Safe & Refundable)</span>
                                <ArrowRightIcon className="w-3.5 h-3.5" />
                            </Link>
                        </div>

                        <div className="space-y-2 text-xs text-red-100/90 leading-relaxed border-t border-red-500/20 pt-3">
                            <p>
                                <strong>Why your money could get stuck:</strong> This queue uses a zero-knowledge blind hash <code className="bg-red-900/60 px-1.5 py-0.5 rounded text-red-200 font-mono">keccak256(market, side, stake, salt, maker)</code>. Because parameters are sealed cryptographically, the smart contract does <em>not</em> know your market address, side, or expiry until an opponent reveals and matches your commitment.
                            </p>
                            <p>
                                In this v1 testnet smart contract, <strong>there is no on-chain cancel or auto-refund function for unrevealed hashes</strong>. If nobody accepts your challenge before the underlying DreamDEX market window closes, your deposit remains locked in the contract escrow.
                            </p>
                            <p className="font-semibold text-red-300 pt-1">
                                👉 If you want standard betting where you can cancel anytime for an instant 100% refund, please use <Link href="/create" className="text-white underline font-bold hover:text-brand-light">Create Peer Duel</Link> instead.
                            </p>
                        </div>
                    </div>

                    {/* How Anti-MEV Actually Works - Explanatory Architecture Callout */}
                    <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-surface/70 to-bg/90 p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-light flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-brand" />
                                <span>How Anti-MEV Commit-Reveal Works (Under the Hood)</span>
                            </h3>
                            <span className="text-[11px] font-mono text-muted">Somnia Shannon P2P Escrow</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="p-4 rounded-xl bg-bg/70 border border-border/60 space-y-1.5">
                                <div className="font-bold text-purple-300 flex items-center gap-1.5">
                                    <span>1. Cryptographic Blind Hash</span>
                                </div>
                                <p className="text-muted leading-relaxed">
                                    When you commit, you deposit stake with a sealed hash: <code className="text-slate-300">H(market, side, stake, salt, maker)</code>.
                                    The smart contract does <em>not</em> know your market or side yet.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-bg/70 border border-border/60 space-y-1.5">
                                <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                                    <span>2. Taker Reveal & Atomic Match</span>
                                </div>
                                <p className="text-muted leading-relaxed">
                                    Two opposing blind makers cannot auto-match because both hashes are hidden. An opponent (Taker) uses your 1-Click Link to atomically reveal parameters, take the opposite side, and create the duel.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-bg/70 border border-border/60 space-y-1.5">
                                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                                    <span>3. Somnia Auto-Settlement</span>
                                </div>
                                <p className="text-muted leading-relaxed">
                                    Once matched, the duel is registered on-chain. When DreamDEX oracle resolves the event, Somnia’s Reactivity precompile auto-settles and pays the winner with zero manual claims.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* My Sealed Commitments (Open Positions) */}
                    <div className="clean-card rounded-2xl p-6 sm:p-7 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                <CoinsIcon className="w-4 h-4 text-brand-light" />
                                <span>My Sealed Positions ({myCommitments.length})</span>
                            </h2>
                            <button
                                onClick={refreshMyCommitments}
                                disabled={isLoadingPositions}
                                className="inline-flex items-center gap-1.5 text-xs text-brand-light hover:text-white font-mono transition-colors disabled:opacity-50"
                            >
                                <RefreshCwIcon className={`w-3.5 h-3.5 ${isLoadingPositions ? 'animate-spin' : ''}`} />
                                <span>Refresh On-Chain State</span>
                            </button>
                        </div>

                        {myCommitments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted space-y-1">
                                <div>No sealed commitments placed yet from this wallet.</div>
                                <div className="text-[11px]">Use the form below to lock a zero-MEV position into escrow.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {myCommitments.map((c) => {
                                    const expiry = c.marketExpiry || 0;
                                    const isExpired = expiry > 0 && now >= expiry;

                                    return (
                                        <div
                                            key={c.commitId}
                                            className="rounded-2xl bg-bg/80 border border-border p-5 space-y-3.5"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-white">
                                                        Commit #{c.commitId}
                                                    </span>
                                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-muted">
                                                        {c.marketSymbol}
                                                    </span>
                                                </div>

                                                {/* Status & Expiry Badge */}
                                                {c.consumed ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                                        <span>⚔️ Matched into Duel</span>
                                                    </span>
                                                ) : isExpired ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                        <ClockIcon className="w-3 h-3 text-amber-400" />
                                                        <span>Window Closed (Unmatched)</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                        <span>{formatCountdown(expiry)} to match</span>
                                                    </span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                                <div className="p-2.5 rounded-xl bg-surface/50 border border-border/60">
                                                    <span className="text-[10px] text-muted uppercase">Your Pick:</span>
                                                    <div className={`font-bold mt-0.5 ${c.side === 0 ? 'text-up' : 'text-down'}`}>
                                                        {c.side === 0 ? '▲ UP (YES)' : '▼ DOWN (NO)'}
                                                    </div>
                                                </div>
                                                <div className="p-2.5 rounded-xl bg-surface/50 border border-border/60">
                                                    <span className="text-[10px] text-muted uppercase">Escrow Stake:</span>
                                                    <div className="text-white font-bold mt-0.5">
                                                        {c.stakeUsd} USDso
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expiry / Match Status Explanation */}
                                            {isExpired && !c.consumed && (
                                                <div className="rounded-xl bg-amber-950/20 border border-amber-500/30 p-2.5 text-[11px] text-amber-300/90 leading-relaxed">
                                                    The trading window ended before a challenger matched. Because zero-knowledge hashes hide market parameters from the chain, unmatched commitments stay locked in escrow. Always share your 1-Click link immediately upon placing a commitment!
                                                </div>
                                            )}

                                            {/* Secret Salt & Reveal Drawer */}
                                            <div className="rounded-xl bg-black/40 border border-border/60 p-3 text-[11px] font-mono space-y-1.5">
                                                <div className="flex items-center justify-between text-muted">
                                                    <span>Secret Salt:</span>
                                                    <button
                                                        onClick={() =>
                                                            setRevealedSaltId(revealedSaltId === c.commitId ? null : c.commitId)
                                                        }
                                                        className="text-brand-light hover:text-white underline text-[10px]"
                                                    >
                                                        {revealedSaltId === c.commitId ? 'Hide' : 'Reveal'}
                                                    </button>
                                                </div>
                                                <div className="truncate text-slate-300">
                                                    {revealedSaltId === c.commitId ? c.salt : shortHash(c.salt)}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="space-y-2 pt-1">
                                                {/* 1-Click Challenge Link Button */}
                                                {!c.consumed && !isExpired && (
                                                    <button
                                                        onClick={() => copy1ClickLink(c)}
                                                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-600 hover:to-teal-500 font-bold text-xs text-black transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                                    >
                                                        {copiedLinkCommitId === c.commitId ? (
                                                            <>
                                                                <CheckIcon className="w-4 h-4 text-black" />
                                                                <span>Copied 1-Click Challenge URL!</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ZapIcon className="w-4 h-4 text-black" />
                                                                <span>Copy 1-Click Challenge Link</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => copyCommitPayload(c)}
                                                        className="flex-1 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        {copiedCommitId === c.commitId ? (
                                                            <>
                                                                <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                                                                <span>Copied Payload!</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CopyIcon className="w-3.5 h-3.5 text-muted" />
                                                                <span>Copy Raw Payload</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    {c.txHash && (
                                                        <a
                                                            href={getExplorerAddressUrl(c.txHash)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-muted hover:text-white"
                                                            title="View Commitment Tx"
                                                        >
                                                            <ExternalLinkIcon className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Commit Creator Form (7 cols) */}
                        <div className="lg:col-span-7 clean-card rounded-2xl p-6 sm:p-7 space-y-5">
                            <h2 className="text-base font-semibold text-white flex items-center gap-2">
                                <ZapIcon className="w-4 h-4 text-brand-light" />
                                <span>Create a New Sealed Commitment</span>
                            </h2>

                            {/* Market selection */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2.5">
                                    1. Target Event Market
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {activeMarkets.length === 0 ? (
                                        <div className="col-span-1 sm:col-span-2 p-6 rounded-xl border border-border bg-bg/40 text-center space-y-2">
                                            <div className="w-5 h-5 rounded-full border-2 border-brand/30 border-t-brand animate-spin mx-auto" />
                                            <div className="text-xs text-muted">Scanning DreamDEX indexer for active windows...</div>
                                            <div className="text-[11px] text-muted-dark">New 1m, 5m, 15m windows spawn continuously</div>
                                        </div>
                                    ) : (
                                        activeMarkets.map((m) => {
                                            const isSelected = market.toLowerCase() === m.address.toLowerCase();
                                            return (
                                                <button
                                                    key={m.address}
                                                    type="button"
                                                    onClick={() => { sfx.tap(); setMarket(m.address); }}
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
                            </div>

                            {/* Side */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
                                    2. Sealed Prediction Side
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { sfx.tap(); setSide(0); }}
                                        className={`py-3.5 px-4 rounded-xl border text-center transition-all ${
                                            side === 0
                                                ? 'bg-up/15 border-up text-up font-bold shadow-up-glow'
                                                : 'bg-bg/60 border-border text-muted'
                                        }`}
                                    >
                                        ▲ UP (YES)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { sfx.tap(); setSide(1); }}
                                        className={`py-3.5 px-4 rounded-xl border text-center transition-all ${
                                            side === 1
                                                ? 'bg-down/15 border-down text-down font-bold shadow-down-glow'
                                                : 'bg-bg/60 border-border text-muted'
                                        }`}
                                    >
                                        ▼ DOWN (NO)
                                    </button>
                                </div>
                            </div>

                            {/* Stake */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted">
                                        3. Stake (USDso)
                                    </label>
                                    {userBalance !== undefined && (
                                        <span className="text-[11px] font-mono text-muted">
                                            Balance: {fmtUsd(userBalance as bigint)} USDso
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={stake}
                                    onChange={(e) => setStake(e.target.value)}
                                    className="w-full rounded-xl bg-bg border border-border px-4 py-3 font-mono text-sm font-bold text-white focus:outline-none focus:border-brand"
                                />
                            </div>

                            {/* Generated Secret Salt & Hash */}
                            <div className="rounded-2xl bg-bg/60 border border-border/80 p-4 space-y-2 text-xs">
                                <div className="flex justify-between items-center text-muted">
                                    <span>Secret Salt (Stored Locally):</span>
                                    <span className="font-mono text-slate-300 truncate max-w-[240px]">
                                        {salt ? shortHash(salt) : 'Generating...'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-muted">
                                    <span>On-Chain Commitment Hash:</span>
                                    <span className="font-mono text-purple-300 font-semibold truncate max-w-[240px]">
                                        {generatedCommitHash ? shortHash(generatedCommitHash) : '-'}
                                    </span>
                                </div>
                            </div>

                            {errorMsg && (
                                <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-xs text-down">
                                    {errorMsg}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div>
                                {!isConnected ? (
                                    <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-center text-xs text-brand-light">
                                        Connect wallet to submit a sealed commitment.
                                    </div>
                                ) : needsApproval ? (
                                    <button
                                        onClick={handleApprove}
                                        className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-deep font-bold text-xs text-white shadow-brand-glow"
                                    >
                                        Approve USDso for Commitment
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCommit}
                                        disabled={isCommitting || !generatedCommitHash}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-brand hover:from-purple-700 hover:to-brand-deep font-bold text-xs text-white shadow-brand-glow disabled:opacity-40"
                                    >
                                        {isCommitting ? 'Submitting Commitment to Shannon...' : 'Submit Sealed Commitment'}
                                    </button>
                                )}
                            </div>

                            {commitSuccess && (
                                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-xs text-emerald-300 space-y-2">
                                    <div className="font-bold flex items-center gap-1.5">
                                        <CheckIcon className="w-4 h-4 text-emerald-400" />
                                        <span>Commitment #{createdCommitId} Placed Successfully!</span>
                                    </div>
                                    <p className="text-slate-300">
                                        Your stake is locked in WagrEscrow. Tap <strong>Copy 1-Click Challenge Link</strong> above and send it to your opponent before the market window closes!
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Match & Reveal Box (5 cols) */}
                        <div
                            id="match-challenger-section"
                            className={`lg:col-span-5 clean-card rounded-2xl p-6 sm:p-7 space-y-4 transition-all ${
                                prefilledFromUrl ? 'ring-2 ring-cyan-400 shadow-cyan-500/10' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                    <ShieldCheckIcon className="w-4 h-4 text-cyan-400" />
                                    <span>Match an Open Challenger</span>
                                </h3>
                                {prefilledFromUrl && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                                        Payload Loaded
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted">
                                Paste an opponent’s 1-Click Link or payload parameters below to atomically match and reveal into a live duel.
                            </p>

                            {/* Quick Fill Box */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                    Quick Fill (Paste Link or Text Payload)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Paste URL (e.g. /arena?commitId=...) or payload text..."
                                    value={quickFillInput}
                                    onChange={(e) => handleQuickFill(e.target.value)}
                                    className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-cyan-400"
                                />
                            </div>

                            <div className="space-y-3 pt-1">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                        Maker Commit ID
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 1"
                                        value={takerCommitId}
                                        onChange={(e) => setTakerCommitId(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                        Market Address
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="0x..."
                                        value={takerMarket}
                                        onChange={(e) => setTakerMarket(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                            Maker&apos;s Side
                                        </label>
                                        <select
                                            value={takerMakerSide}
                                            onChange={(e) => setTakerMakerSide(Number(e.target.value) as 0 | 1)}
                                            className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 text-xs text-white focus:outline-none"
                                        >
                                            <option value={0}>UP (YES)</option>
                                            <option value={1}>DOWN (NO)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                            Stake (USDso)
                                        </label>
                                        <input
                                            type="number"
                                            placeholder="20"
                                            value={takerStake}
                                            onChange={(e) => setTakerStake(e.target.value)}
                                            className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold uppercase text-muted mb-1">
                                        Maker&apos;s Revealed Salt
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="0x..."
                                        value={takerSalt}
                                        onChange={(e) => setTakerSalt(e.target.value)}
                                        className="w-full rounded-xl bg-bg border border-border px-3.5 py-2.5 font-mono text-xs text-white focus:outline-none focus:border-brand"
                                    />
                                </div>

                                {/* Your Taker Side indicator */}
                                <div className="p-3 rounded-xl bg-surface/60 border border-border/80 flex items-center justify-between text-xs">
                                    <span className="text-muted">Your Assigned Side:</span>
                                    <span className={`font-bold font-mono ${takerMakerSide === 0 ? 'text-down' : 'text-up'}`}>
                                        {takerMakerSide === 0 ? '▼ DOWN (Opposing YES)' : '▲ UP (Opposing NO)'}
                                    </span>
                                </div>

                                {matchError && (
                                    <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-xs text-down leading-relaxed">
                                        {matchError}
                                    </div>
                                )}

                                {takerHasInsufficientBalance && (
                                    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-amber-300">
                                        Insufficient USDso balance. You need {takerStake} USDso to match this commitment.
                                    </div>
                                )}

                                {matchedDuelId && (
                                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-xs text-emerald-300 space-y-2">
                                        <div className="font-bold flex items-center gap-1.5">
                                            <CheckIcon className="w-4 h-4 text-emerald-400" />
                                            <span>Duel #{matchedDuelId} Created & Matched!</span>
                                        </div>
                                        <p className="text-slate-300">
                                            Both positions are now live and escrowed. When the market resolves, Somnia Reactivity will auto-settle directly to the winner.
                                        </p>
                                        <Link
                                            href={`/duel/${matchedDuelId}`}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold text-xs transition-colors"
                                        >
                                            <span>Enter Live Duel Room #{matchedDuelId}</span>
                                            <ArrowRightIcon className="w-3.5 h-3.5" />
                                        </Link>
                                    </div>
                                )}

                                {/* Taker Action Buttons */}
                                {!isConnected ? (
                                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-center text-xs text-cyan-300">
                                        Connect challenger wallet to match this commitment.
                                    </div>
                                ) : takerNeedsApproval ? (
                                    <button
                                        onClick={handleTakerApprove}
                                        disabled={isTakerApproving}
                                        className="w-full py-3 rounded-xl bg-brand hover:bg-brand-deep font-bold text-xs text-white transition-all shadow-brand-glow disabled:opacity-50"
                                    >
                                        {isTakerApproving ? 'Approving USDso...' : 'Step 1: Approve USDso for Match'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleMatchAndReveal}
                                        disabled={
                                            isMatching ||
                                            !takerCommitId ||
                                            !takerMarket ||
                                            !takerSalt ||
                                            !takerStake ||
                                            takerHasInsufficientBalance
                                        }
                                        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-600 hover:to-teal-500 font-bold text-xs text-black transition-all disabled:opacity-40 shadow-sm"
                                    >
                                        {isMatching ? 'Matching & Revealing Duel...' : 'Step 2: Match & Reveal (Lock In Duel)'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
