'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { PrivyProvider, usePrivy, useLoginWithTelegram } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { somniaShannon, SHANNON_RPC } from '@/lib/wagr';
import {
    expandTelegramViewport,
    getTelegramInitDataString,
    getTelegramStartParam,
    parseDuelIdFromStartParam,
} from '@/lib/telegram';
import { useRouter, usePathname } from 'next/navigation';

export interface TelegramWalletContextType {
    walletAddress?: string;
    isFunding: boolean;
    fundSuccess: string | null;
    fundError: string | null;
    clearFundMessage: () => void;
    refillStt: () => Promise<void>;
    refillTusdc: () => Promise<void>;
    refillBoth: () => Promise<void>;
    exportKey: () => Promise<void>;
}

const TelegramWalletContext = createContext<TelegramWalletContextType>({
    walletAddress: undefined,
    isFunding: false,
    fundSuccess: null,
    fundError: null,
    clearFundMessage: () => {},
    refillStt: async () => {},
    refillTusdc: async () => {},
    refillBoth: async () => {},
    exportKey: async () => {},
});

export const useTelegramWallet = () => useContext(TelegramWalletContext);

// Configure Wagmi through Privy's native connector
const privyWagmiConfig = createConfig({
    chains: [somniaShannon],
    transports: {
        [somniaShannon.id]: http(SHANNON_RPC),
    },
    ssr: true,
});

function TelegramPrivyInner({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { ready, authenticated, user, exportWallet } = usePrivy();
    const { login: loginTelegram, state: telegramState } = useLoginWithTelegram();

    const [isFunding, setIsFunding] = useState(false);
    const [fundSuccess, setFundSuccess] = useState<string | null>(null);
    const [fundError, setFundError] = useState<string | null>(null);

    const hasHandledDeepLink = useRef(false);
    const hasAttemptedStarterGrant = useRef(false);

    // Expand viewport to fullscreen on load
    useEffect(() => {
        expandTelegramViewport();
    }, []);

    // Handle deep link routing if startapp=duel_[ID] was passed
    useEffect(() => {
        if (!hasHandledDeepLink.current) {
            const startParam = getTelegramStartParam();
            const duelId = parseDuelIdFromStartParam(startParam);
            if (duelId) {
                hasHandledDeepLink.current = true;
                const targetPath = `/duel/${duelId}`;
                if (pathname !== targetPath) {
                    router.replace(targetPath);
                }
            }
        }
    }, [pathname, router]);

    // Auto-login with Telegram credentials inside Mini App
    useEffect(() => {
        if (!ready) return;
        if (!authenticated && telegramState.status === 'initial') {
            loginTelegram().catch((err: any) => {
                console.warn('Privy Telegram auto-login error:', err);
            });
        }
    }, [ready, authenticated, telegramState.status, loginTelegram]);

    const walletAddress = user?.wallet?.address;

    // Faucet claim function
    const requestFunds = async (claimType: 'starter' | 'stt' | 'tusdc' | 'both') => {
        if (!walletAddress) return;
        const initData = getTelegramInitDataString();
        if (!initData) {
            setFundError('Telegram session data missing. Cannot verify claim.');
            return;
        }

        setIsFunding(true);
        setFundError(null);
        try {
            const res = await fetch('/api/telegram/fund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData,
                    targetAddress: walletAddress,
                    claimType,
                }),
            });
            const data = await res.json();
            if (data.success) {
                const label =
                    claimType === 'stt'
                        ? '1 STT (gas)'
                        : claimType === 'tusdc'
                        ? '500 tUSDC'
                        : '1 STT + 500 tUSDC';
                setFundSuccess(`Testnet grant added: ${label}`);
            } else {
                setFundError(data.error || 'Failed to claim tokens');
            }
        } catch (err: any) {
            setFundError(err?.message || 'Network error claiming funds');
        } finally {
            setIsFunding(false);
        }
    };

    // Auto starter grant on initial wallet connection
    useEffect(() => {
        if (walletAddress && !hasAttemptedStarterGrant.current) {
            hasAttemptedStarterGrant.current = true;
            requestFunds('starter');
        }
    }, [walletAddress]);

    const refillStt = async () => {
        await requestFunds('stt');
    };

    const refillTusdc = async () => {
        await requestFunds('tusdc');
    };

    const refillBoth = async () => {
        await requestFunds('both');
    };

    const exportKey = async () => {
        if (!walletAddress) return;
        try {
            await exportWallet({ address: walletAddress });
        } catch (err: any) {
            console.warn('Export wallet canceled or failed:', err);
        }
    };

    const clearFundMessage = () => {
        setFundSuccess(null);
        setFundError(null);
    };

    return (
        <TelegramWalletContext.Provider
            value={{
                walletAddress,
                isFunding,
                fundSuccess,
                fundError,
                clearFundMessage,
                refillStt,
                refillTusdc,
                refillBoth,
                exportKey,
            }}
        >
            {/* Notification banner for testnet airdrop */}
            {fundSuccess && (
                <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 p-4 rounded-2xl bg-emerald-950/95 border border-emerald-500/50 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                            <div className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                                <span>🎉 Testnet Grant Received</span>
                            </div>
                            <p className="text-[11px] text-slate-200">
                                {fundSuccess}. Test duels on Somnia Shannon testnet freely!
                            </p>
                        </div>
                        <button
                            onClick={clearFundMessage}
                            className="text-slate-400 hover:text-white text-xs p-1"
                            aria-label="Close message"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {fundError && (
                <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 p-4 rounded-2xl bg-rose-950/95 border border-rose-500/50 text-white shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5">
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                            <div className="font-bold text-xs text-rose-400">Funding Notice</div>
                            <p className="text-[11px] text-slate-200">{fundError}</p>
                        </div>
                        <button
                            onClick={clearFundMessage}
                            className="text-slate-400 hover:text-white text-xs p-1"
                            aria-label="Close message"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {children}
        </TelegramWalletContext.Provider>
    );
}

export function TelegramPrivyProvider({ children }: { children: React.ReactNode }) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

    return (
        <PrivyProvider
            appId={appId}
            config={{
                loginMethods: ['telegram'],
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: 'users-without-wallets',
                    },
                    showWalletUIs: false,
                },
                defaultChain: somniaShannon,
                supportedChains: [somniaShannon],
            }}
        >
            <WagmiProvider config={privyWagmiConfig}>
                <TelegramPrivyInner>{children}</TelegramPrivyInner>
            </WagmiProvider>
        </PrivyProvider>
    );
}
