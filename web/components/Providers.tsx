'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
    getDefaultConfig,
    RainbowKitProvider,
    darkTheme,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { WagmiProvider, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { somniaShannon, SHANNON_RPC } from '@/lib/wagr';
import { isTelegramWebApp } from '@/lib/telegram';
import { TelegramPrivyProvider } from './TelegramPrivyProvider';
import { TelegramProvider } from './TelegramProvider';

const wagmiConfig = getDefaultConfig({
    appName: 'Wagr | DreamDEX Prediction Layer',
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'b8a1dfe22b484063b1dc02c788b34b85',
    chains: [somniaShannon],
    transports: {
        [somniaShannon.id]: http(SHANNON_RPC),
    },
    ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
    const [isTelegram, setIsTelegram] = useState(false);

    useEffect(() => {
        setIsTelegram(isTelegramWebApp());
    }, []);

    const queryClient = useMemo(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        refetchOnWindowFocus: false,
                        staleTime: 3_000,
                    },
                },
            }),
        []
    );

    // If inside Telegram Mini App, activate Privy's embedded MPC wallet setup
    if (isTelegram) {
        return (
            <QueryClientProvider client={queryClient}>
                <TelegramPrivyProvider>{children}</TelegramPrivyProvider>
            </QueryClientProvider>
        );
    }

    // Standard browser: 100% untouched RainbowKit & Wagmi configuration
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={darkTheme({
                        accentColor: '#7C5CFF',
                        accentColorForeground: '#FFFFFF',
                        borderRadius: 'medium',
                        fontStack: 'system',
                        overlayBlur: 'small',
                    })}
                >
                    <TelegramProvider>{children}</TelegramProvider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
