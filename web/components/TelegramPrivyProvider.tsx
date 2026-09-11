'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import {
    PrivyProvider,
    usePrivy,
    useLoginWithTelegram,
    useWallets,
    useCreateWallet,
    getEmbeddedConnectedWallet,
} from '@privy-io/react-auth';
import { WagmiProvider, createConfig, useSetActiveWallet } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { somniaShannon, SHANNON_RPC } from '@/lib/wagr';
import {
    expandTelegramViewport,
    getTelegramInitDataString,
    getTelegramStartParam,
    parseDuelIdFromStartParam,
} from '@/lib/telegram';
import { useRouter, usePathname } from 'next/navigation';

export type TelegramWalletStatus =
    | 'initializing'    // Phase 1: Privy SDK ready state is false
    | 'authenticating'  // Authenticating Telegram user session
    | 'creating_wallet' // Phase 2: Privy ready is true, but embedded wallet is creating / waiting to appear in wallets list
    | 'ready'           // Phase 3: Both Privy ready AND embedded wallet confirmed in wallets list with address
    | 'error';

export interface TelegramWalletContextType {
    walletAddress?: string;
    isReady: boolean;
    status: TelegramWalletStatus;
    statusLabel: string;
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
    isReady: false,
    status: 'initializing',
    statusLabel: 'Initializing session…',
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

    // Privy core authentication state
    const { ready: privyReady, authenticated, exportWallet } = usePrivy();
    const { login: loginTelegram, state: telegramState } = useLoginWithTelegram();

    // Privy connected wallets list
    const { wallets, ready: walletsReady } = useWallets();
    const { createWallet } = useCreateWallet();
    const { setActiveWallet } = useSetActiveWallet();

    const [isFunding, setIsFunding] = useState(false);
    const [fundSuccess, setFundSuccess] = useState<string | null>(null);
    const [fundError, setFundError] = useState<string | null>(null);

    const hasHandledDeepLink = useRef(false);
    const hasAttemptedStarterGrant = useRef(false);
    const hasTriggeredLogin = useRef(false);
    const isCreatingWallet = useRef(false);

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

    // Sequential Phase 1 -> Phase 2 -> Phase 3 evaluation
    // Condition 1: Privy's ready state must be true
    // Condition 2: Embedded wallet has finished being created and appears in wallets list
    const { status, statusLabel, confirmedAddress, embeddedWallet } = useMemo(() => {
        // Phase 1: Privy SDK still loading
        if (!privyReady) {
            return {
                status: 'initializing' as TelegramWalletStatus,
                statusLabel: 'Initializing session…',
                confirmedAddress: undefined,
                embeddedWallet: null,
            };
        }

        // Authenticating Telegram identity
        if (!authenticated) {
            return {
                status: 'authenticating' as TelegramWalletStatus,
                statusLabel: 'Authenticating with Telegram…',
                confirmedAddress: undefined,
                embeddedWallet: null,
            };
        }

        // Search for embedded wallet inside wallets list
        const foundEmbedded =
            getEmbeddedConnectedWallet(wallets) ||
            wallets.find((w) => w.walletClientType === 'privy') ||
            null;

        // Phase 2: Authenticated, but embedded wallet is creating or hasn't appeared in wallets list
        if (!foundEmbedded || !foundEmbedded.address) {
            return {
                status: 'creating_wallet' as TelegramWalletStatus,
                statusLabel: 'Creating embedded wallet…',
                confirmedAddress: undefined,
                embeddedWallet: null,
            };
        }

        // Phase 3: Both conditions confirmed!
        return {
            status: 'ready' as TelegramWalletStatus,
            statusLabel: 'Connected',
            confirmedAddress: foundEmbedded.address,
            embeddedWallet: foundEmbedded,
        };
    }, [privyReady, authenticated, wallets]);

    // Auto-login with Telegram when Privy is ready
    useEffect(() => {
        if (!privyReady) return;
        if (!authenticated && !hasTriggeredLogin.current && telegramState.status === 'initial') {
            hasTriggeredLogin.current = true;
            loginTelegram().catch((err: any) => {
                console.warn('Privy Telegram auto-login error:', err);
                hasTriggeredLogin.current = false;
            });
        }
    }, [privyReady, authenticated, telegramState.status, loginTelegram]);

    // Ensure wallet creation is triggered if not yet present in wallets list
    useEffect(() => {
        if (
            privyReady &&
            authenticated &&
            walletsReady &&
            !embeddedWallet &&
            !isCreatingWallet.current
        ) {
            isCreatingWallet.current = true;
            createWallet()
                .catch((err: any) => {
                    // Safe to ignore if already being created automatically by Privy
                    console.warn('Privy createWallet notice:', err?.message || err);
                })
                .finally(() => {
                    isCreatingWallet.current = false;
                });
        }
    }, [privyReady, authenticated, walletsReady, embeddedWallet, createWallet]);

    // Sync active wallet to Wagmi once Phase 3 is confirmed
    useEffect(() => {
        if (status === 'ready' && embeddedWallet) {
            setActiveWallet(embeddedWallet).catch((err: any) => {
                console.warn('Privy setActiveWallet notice:', err);
            });
        }
    }, [status, embeddedWallet, setActiveWallet]);

    // Faucet claim function: only called when confirmedAddress is valid
    const requestFunds = async (claimType: 'starter' | 'stt' | 'tusdc' | 'both', target?: string) => {
        const dest = target || confirmedAddress;
        if (!dest) return;

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
                    targetAddress: dest,
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

    // Auto starter grant: ONLY triggered after both conditions are confirmed
    useEffect(() => {
        if (status === 'ready' && confirmedAddress && !hasAttemptedStarterGrant.current) {
            hasAttemptedStarterGrant.current = true;
            requestFunds('starter', confirmedAddress);
        }
    }, [status, confirmedAddress]);

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
        if (!confirmedAddress) return;
        try {
            await exportWallet({ address: confirmedAddress });
        } catch (err: any) {
            console.warn('Export wallet canceled or failed:', err);
        }
    };

    const clearFundMessage = () => {
        setFundSuccess(null);
        setFundError(null);
    };

    const isReady = status === 'ready' && !!confirmedAddress;

    return (
        <TelegramWalletContext.Provider
            value={{
                walletAddress: isReady ? confirmedAddress : undefined,
                isReady,
                status,
                statusLabel,
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
            <WagmiProvider
                config={privyWagmiConfig}
                setActiveWalletForWagmi={({ wallets }) => {
                    return (
                        getEmbeddedConnectedWallet(wallets) ||
                        wallets.find((w) => w.walletClientType === 'privy') ||
                        wallets[0]
                    );
                }}
            >
                <TelegramPrivyInner>{children}</TelegramPrivyInner>
            </WagmiProvider>
        </PrivyProvider>
    );
}
