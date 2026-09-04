'use client';

import React, { useEffect, useState } from 'react';
import { publicClient, escrowAbi, WAGR_ESCROW, fmtUsd } from '@/lib/wagr';
import { FlameIcon, CoinsIcon, RadioIcon, UsersIcon, SparklesIcon } from './Icons';

interface Stats {
    duels: bigint;
    wagered: bigint;
    routed: bigint;
    toCreators: bigint;
    settledVolume: bigint;
}

export function LiveCounter() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        let active = true;

        async function fetchStats() {
            try {
                setIsRefreshing(true);
                const [duels, wagered, routedOnChain, toCreators, nextId] = (await Promise.all([
                    publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'totalDuels',
                    }),
                    publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'totalWagered',
                    }),
                    publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'totalRoutedOrders',
                    }),
                    publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'totalPaidToCreators',
                    }),
                    publicClient.readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'nextDuelId',
                    }),
                ])) as [bigint, bigint, bigint, bigint, bigint];

                // Dynamically inspect duels for orders routed to DreamDEX contracts & payouts
                let ordersCount = Number(routedOnChain);
                let settledVolume = 0n;

                const count = Number(nextId);
                if (count > 1) {
                    const duelPromises = [];
                    for (let i = 1; i < count; i++) {
                        duelPromises.push(
                            publicClient.readContract({
                                address: WAGR_ESCROW,
                                abi: escrowAbi,
                                functionName: 'getDuel',
                                args: [BigInt(i)],
                            })
                        );
                    }
                    const duelResults = await Promise.all(duelPromises);
                    let duelOrders = 0;
                    for (const d of duelResults as any[]) {
                        if (d.alice && d.alice !== '0x0000000000000000000000000000000000000000') duelOrders++;
                        if (d.bob && d.bob !== '0x0000000000000000000000000000000000000000') duelOrders++;
                        if (d.settled) {
                            settledVolume += BigInt(d.stakeA) + BigInt(d.stakeB);
                        }
                    }
                    ordersCount = Math.max(ordersCount, duelOrders);
                }

                if (active) {
                    setStats({
                        duels,
                        wagered,
                        routed: BigInt(ordersCount),
                        toCreators,
                        settledVolume: settledVolume > 0n ? settledVolume : wagered,
                    });
                    setLastUpdated(new Date());
                }
            } catch (err) {
                console.error('Failed to read live escrow stats:', err);
            } finally {
                if (active) setIsRefreshing(false);
            }
        }

        fetchStats();
        const interval = setInterval(fetchStats, 5_000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    const cards = [
        {
            label: 'Total Duels Created',
            value: stats ? stats.duels.toString() : '—',
            sub: 'Real on-chain wagers',
            icon: FlameIcon,
            color: 'text-brand-light',
            bg: 'from-brand/10 to-transparent',
            border: 'border-brand/30',
        },
        {
            label: 'USDso Volume Wagered',
            value: stats ? `${fmtUsd(stats.wagered)} USDso` : '—',
            sub: '1:1 escrow locked & paid',
            icon: CoinsIcon,
            color: 'text-emerald-400',
            bg: 'from-emerald-500/10 to-transparent',
            border: 'border-emerald-500/30',
        },
        {
            label: 'Orders Routed to DreamDEX',
            value: stats ? stats.routed.toString() : '—',
            sub: 'CLOB order volume flywheel',
            icon: RadioIcon,
            color: 'text-cyan-400',
            bg: 'from-cyan-500/10 to-transparent',
            border: 'border-cyan-500/30',
        },
        {
            label: stats && stats.toCreators > 0n ? 'Paid to Creators' : 'Reactivity Auto-Payouts',
            value: stats
                ? stats.toCreators > 0n
                    ? `${fmtUsd(stats.toCreators)} USDso`
                    : `${fmtUsd(stats.settledVolume)} USDso`
                : '—',
            sub: stats && stats.toCreators > 0n ? 'Atomic approveBuilder splits' : 'Zero-click escrow settlements',
            icon: UsersIcon,
            color: 'text-purple-400',
            bg: 'from-purple-500/10 to-transparent',
            border: 'border-purple-500/30',
        },
    ];

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Live On-Chain Escrow Metrics
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-dark">
                    <SparklesIcon className="w-3 h-3 text-brand" />
                    <span>Auto-updating from Shannon</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.label}
                            className={`relative overflow-hidden rounded-2xl border ${card.border} bg-surface/70 bg-gradient-to-b ${card.bg} p-5 backdrop-blur-md transition-all hover:translate-y-[-2px] hover:shadow-glass`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                                    {card.label}
                                </span>
                                <div className="rounded-lg bg-white/5 p-2 text-white">
                                    <Icon className={`w-4 h-4 ${card.color}`} />
                                </div>
                            </div>
                            <div className={`mt-3 text-2xl sm:text-3xl font-bold font-mono tracking-tight ${card.color}`}>
                                {card.value}
                            </div>
                            <div className="mt-1 text-xs text-muted-dark font-medium">
                                {card.sub}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
