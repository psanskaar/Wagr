'use client';

import React, { useState } from 'react';
import { Nav } from '@/components/Nav';
import {
    WAGR_ESCROW,
    WAGR_SEASON,
    WAGR_FACTORY,
    USDSO_TOKEN,
    REACTIVITY_PRECOMPILE,
    VERIFIED_PROOF_TX,
    VERIFIED_PROOF_BLOCK,
    SHANNON_CHAIN_ID,
    SHANNON_RPC,
    getExplorerTxUrl,
    getExplorerAddressUrl,
    shortAddr,
    sfx,
} from '@/lib/wagr';
import {
    CoinsIcon,
    CopyIcon,
    CheckIcon,
    ExternalLinkIcon,
    ShieldCheckIcon,
    SparklesIcon,
    ZapIcon,
} from '@/components/Icons';

export default function FaucetAndDocsPage() {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copy = (val: string, key: string) => {
        sfx.tap();
        navigator.clipboard.writeText(val);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    async function addSomniaToWallet() {
        sfx.tap();
        if (typeof window !== 'undefined' && (window as any).ethereum) {
            try {
                await (window as any).ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: '0xC488', // 50312 in hex
                            chainName: 'Somnia Shannon Testnet',
                            nativeCurrency: {
                                name: 'STT',
                                symbol: 'STT',
                                decimals: 18,
                            },
                            rpcUrls: ['https://api.infra.testnet.somnia.network'],
                            blockExplorerUrls: ['https://shannon-explorer.somnia.network'],
                        },
                    ],
                });
            } catch (err) {
                console.error(err);
            }
        }
    }

    const contracts = [
        { name: 'WagrEscrow', role: 'P2P Duel Escrow, Commit Queue & Reactivity Handler', address: WAGR_ESCROW },
        { name: 'WagrSeason', role: 'Multi-Round Tournament Escrow & Merkle Claims', address: WAGR_SEASON },
        { name: 'WagrSplitterFactory', role: 'CREATE2 Immutable Creator Splitter Deployer', address: WAGR_FACTORY },
        { name: 'USDso (tUSDC)', role: 'DreamDEX Collateral (6 decimals)', address: USDSO_TOKEN },
        { name: 'Reactivity Precompile', role: 'Somnia Reactivity Event Dispatcher', address: REACTIVITY_PRECOMPILE },
    ];

    const castCommands = [
        {
            title: '1. Inspect Duel #1 on Shannon',
            desc: 'Verifies duel state: Alice vs Bob stakes, market address, and settled flag.',
            cmd: `cast call ${WAGR_ESCROW} "getDuel(uint256)((address,uint128,uint8,bool,address,uint128,address,uint64,address,uint16))" 1 --rpc-url ${SHANNON_RPC}`,
        },
        {
            title: '2. Verify Zero-Click Settlement by Precompile',
            desc: 'Inspect the DuelSettled event showing viaReactivity=true, called by 0x00..0100.',
            cmd: `cast logs --address ${WAGR_ESCROW} "DuelSettled(uint256,address,uint8,uint256,bool,bool)" --from-block 477711000 --to-block 477711500 --rpc-url ${SHANNON_RPC}`,
        },
        {
            title: '3. Read Aggregate On-Chain Volume',
            desc: 'Query total USDso volume escrowed and settled by Wagr on Shannon.',
            cmd: `cast call ${WAGR_ESCROW} "totalWagered()(uint256)" --rpc-url ${SHANNON_RPC}`,
        },
    ];

    return (
        <div className="min-h-screen bg-bg text-slate-200">
            <Nav />
            <main className="wagr-bg px-4 py-10 sm:px-6">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="pb-6 border-b border-border">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-muted mb-2">
                            <CoinsIcon className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Developer & Judge Portal</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            Shannon Testnet & Contract Explorer
                        </h1>
                        <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl">
                            Everything needed to test on Somnia Shannon, add network parameters to your wallet,
                            and run independent CLI verification commands for hackathon evaluation.
                        </p>
                    </div>

                    {/* Network Quick Setup Card */}
                    <div className="clean-card rounded-2xl p-6 space-y-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                    <SparklesIcon className="w-4 h-4 text-brand-light" />
                                    <span>Somnia Shannon Testnet Parameters</span>
                                </h3>
                                <p className="text-xs text-muted mt-1">
                                    High-performance EVM with sub-second finality and native Reactivity precompile.
                                </p>
                            </div>
                            <button
                                onClick={addSomniaToWallet}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand-deep px-3.5 py-2 text-xs font-semibold text-white transition-colors"
                            >
                                <ZapIcon className="w-3.5 h-3.5" />
                                <span>Add Shannon to Wallet</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                            <div className="rounded-xl bg-bg/60 p-3 border border-border/60">
                                <span className="text-muted">Network Name:</span>
                                <div className="font-mono font-bold text-white mt-0.5">Somnia Shannon</div>
                            </div>
                            <div className="rounded-xl bg-bg/60 p-3 border border-border/60">
                                <span className="text-muted">Chain ID:</span>
                                <div className="font-mono font-bold text-emerald-400 mt-0.5">{SHANNON_CHAIN_ID} (0xC488)</div>
                            </div>
                            <div className="rounded-xl bg-bg/60 p-3 border border-border/60">
                                <span className="text-muted">Gas Currency:</span>
                                <div className="font-mono font-bold text-white mt-0.5">STT (18 decimals)</div>
                            </div>
                            <div className="rounded-xl bg-bg/60 p-3 border border-border/60">
                                <span className="text-muted">RPC Endpoint:</span>
                                <div className="font-mono font-bold text-cyan-400 mt-0.5 truncate">api.infra.testnet…</div>
                            </div>
                        </div>

                        <div className="pt-2 flex items-center gap-3">
                            <a
                                href="https://testnet.somnia.network/"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-light hover:text-white underline"
                            >
                                <span>Official Somnia Faucet & Explorer</span>
                                <ExternalLinkIcon className="w-3 h-3" />
                            </a>
                        </div>
                    </div>

                    {/* Deployed Contracts Table */}
                    <div className="rounded-3xl border border-border bg-surface/80 p-6 sm:p-8 backdrop-blur-xl space-y-4">
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                            <span>Deployed Contract Addresses</span>
                        </h3>
                        <div className="divide-y divide-border/60 text-xs">
                            {contracts.map((c) => (
                                <div key={c.name} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <div className="font-bold text-white">{c.name}</div>
                                        <div className="text-[11px] text-muted">{c.role}</div>
                                    </div>
                                    <div className="flex items-center gap-2 font-mono">
                                        <span className="text-slate-300">{shortAddr(c.address)}</span>
                                        <button
                                            onClick={() => copy(c.address, c.name)}
                                            className="p-1 rounded hover:bg-white/10 text-muted hover:text-white"
                                            title="Copy address"
                                        >
                                            {copiedKey === c.name ? <CheckIcon className="w-3.5 h-3.5 text-emerald-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                        </button>
                                        <a
                                            href={getExplorerAddressUrl(c.address)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-1 rounded hover:bg-white/10 text-muted hover:text-white"
                                            title="View on Shannon Explorer"
                                        >
                                            <ExternalLinkIcon className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Judge Verification Cast-Calls */}
                    <div className="rounded-3xl border border-border bg-surface/80 p-6 sm:p-8 backdrop-blur-xl space-y-6">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-purple-400" />
                                <span>Hackathon Judge Reproducer Commands</span>
                            </h3>
                            <p className="text-xs text-muted mt-1">
                                Run these one-liners directly in your terminal using Foundry <code className="text-slate-300">cast</code> to verify contract state on Shannon.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {castCommands.map((item, idx) => (
                                <div key={idx} className="rounded-2xl bg-bg/70 border border-border/80 p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="font-bold text-xs text-white">{item.title}</div>
                                        <button
                                            onClick={() => copy(item.cmd, `cast-${idx}`)}
                                            className="flex items-center gap-1 text-[11px] text-brand-light hover:text-white"
                                        >
                                            {copiedKey === `cast-${idx}` ? <CheckIcon className="w-3 h-3 text-emerald-400" /> : <CopyIcon className="w-3 h-3" />}
                                            <span>{copiedKey === `cast-${idx}` ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-muted">{item.desc}</p>
                                    <div className="font-mono text-xs text-slate-300 bg-bg p-2.5 rounded-lg border border-border/60 overflow-x-auto">
                                        {item.cmd}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
