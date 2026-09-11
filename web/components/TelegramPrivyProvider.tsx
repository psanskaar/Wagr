'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import {
    PrivyProvider,
    usePrivy,
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
    | 'creating_wallet' // Phase 2: Authenticated, but embedded wallet is creating / provisioning
    | 'ready'           // Phase 3: Both Privy ready AND embedded wallet confirmed with address
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
    retryLogin: () => void;
    retryCreateWallet: () => void;
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
    retryLogin: () => {},
    retryCreateWallet: () => {},
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
    const { ready: privyReady, authenticated, user, exportWallet, getAccessToken, login } = usePrivy();

    // Privy connected wallets list
    const { wallets, ready: walletsReady } = useWallets();
    const { createWallet } = useCreateWallet();
    const { setActiveWallet } = useSetActiveWallet();

    const [isFunding, setIsFunding] = useState(false);
    const [fundSuccess, setFundSuccess] = useState<string | null>(null);
    const [fundError, setFundError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const hasHandledDeepLink = useRef(false);
    const hasAttemptedStarterGrant = useRef(false);
    const hasAttemptedAutoLogin = useRef(false);
    const isCreatingWallet = useRef(false);

    // Expand viewport to fullscreen on load
    useEffect(() => {
        expandTelegramViewport();
    }, []);

    // Handle deep link routing if startapp=duel_[ID] was passed (preserving hash for Privy)
    useEffect(() => {
        if (!hasHandledDeepLink.current) {
            const startParam = getTelegramStartParam();
            const duelId = parseDuelIdFromStartParam(startParam);
            if (duelId) {
                hasHandledDeepLink.current = true;
                const targetPath = `/duel/${duelId}`;
                if (pathname !== targetPath) {
                    const hash = typeof window !== 'undefined' ? window.location.hash : '';
                    router.replace(targetPath + hash);
                }
            }
        }
    }, [pathname, router]);

    // Multi-source wallet address resolution:
    // 1. From ConnectedWallet in wallets array
    // 2. From user.wallet (Privy provisions primary embedded wallet directly on user object)
    // 3. From user.linkedAccounts array
    const { confirmedAddress, embeddedWallet } = useMemo(() => {
        if (!privyReady || !authenticated) {
            return { confirmedAddress: undefined, embeddedWallet: null };
        }

        // Check wallets list
        const foundFromWallets =
            getEmbeddedConnectedWallet(wallets) ||
            wallets.find((w) => w.walletClientType === 'privy') ||
            wallets[0] ||
            null;

        if (foundFromWallets?.address) {
            return {
                confirmedAddress: foundFromWallets.address,
                embeddedWallet: foundFromWallets,
            };
        }

        // Check primary user wallet
        if (user?.wallet?.address) {
            return {
                confirmedAddress: user.wallet.address,
                embeddedWallet: foundFromWallets,
            };
        }

        // Check linked accounts
        const linkedPrivy = user?.linkedAccounts?.find(
            (acc: any) => acc.type === 'wallet' && acc.walletClientType === 'privy'
        );
        if ((linkedPrivy as any)?.address) {
            return {
                confirmedAddress: (linkedPrivy as any).address,
                embeddedWallet: foundFromWallets,
            };
        }

        return { confirmedAddress: undefined, embeddedWallet: null };
    }, [privyReady, authenticated, wallets, user]);

    // Compute status and status label
    const { status, statusLabel } = useMemo(() => {
        if (!privyReady) {
            return {
                status: 'initializing' as TelegramWalletStatus,
                statusLabel: 'Initializing session…',
            };
        }

        if (actionError) {
            return {
                status: 'error' as TelegramWalletStatus,
                statusLabel: actionError,
            };
        }

        if (!authenticated) {
            return {
                status: 'authenticating' as TelegramWalletStatus,
                statusLabel: 'Authenticating with Telegram…',
            };
        }

        if (!confirmedAddress) {
            return {
                status: 'creating_wallet' as TelegramWalletStatus,
                statusLabel: 'Creating embedded wallet…',
            };
        }

        return {
            status: 'ready' as TelegramWalletStatus,
            statusLabel: 'Connected',
        };
    }, [privyReady, authenticated, confirmedAddress, actionError]);

    // Allow Privy's native TMA seamless authentication to authenticate without conflicting popups
    useEffect(() => {
        if (privyReady && !authenticated) {
            console.log('[Privy TMA] Awaiting native seamless Telegram authentication...');
        }
    }, [privyReady, authenticated]);

    // Trigger wallet creation if authenticated but wallet does not exist yet
    useEffect(() => {
        if (
            !privyReady ||
            !authenticated ||
            confirmedAddress ||
            isCreatingWallet.current
        ) {
            return;
        }

        isCreatingWallet.current = true;
        console.log('[Privy TMA] Authenticated user has no wallet. Creating embedded wallet...');

        createWallet()
            .then((newWallet) => {
                console.log('[Privy TMA] Wallet created successfully:', newWallet?.address);
                setActionError(null);
            })
            .catch((err: any) => {
                const msg = err?.message || String(err);
                console.warn('[Privy TMA] createWallet notice:', msg);
                // "already has a wallet" is not an error
                if (!msg.toLowerCase().includes('already')) {
                    setActionError('Wallet creation in progress…');
                }
            })
            .finally(() => {
                isCreatingWallet.current = false;
            });
    }, [privyReady, authenticated, confirmedAddress, createWallet]);

    // Sync active wallet to Wagmi once confirmed
    useEffect(() => {
        if (status === 'ready' && embeddedWallet) {
            setActiveWallet(embeddedWallet).catch((err: any) => {
                console.warn('[Privy TMA] setActiveWallet notice:', err);
            });
        }
    }, [status, embeddedWallet, setActiveWallet]);

    // Faucet claim function: executed when confirmedAddress is valid and user is ready
    const requestFunds = async (claimType: 'starter' | 'stt' | 'tusdc' | 'both', target?: string) => {
        const dest = target || confirmedAddress;
        if (!dest) return;

        const initData = getTelegramInitDataString();
        const privyUserId = user?.id;

        // Ensure we have at least one valid authentication anchor
        if (!initData && !privyUserId) {
            setFundError('Telegram session data missing. Cannot verify claim.');
            return;
        }

        setIsFunding(true);
        setFundError(null);
        try {
            let privyToken: string | undefined;
            if (getAccessToken) {
                try {
                    privyToken = (await getAccessToken()) || undefined;
                } catch {}
            }

            const res = await fetch('/api/telegram/fund', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: initData || undefined,
                    privyUserId: privyUserId || undefined,
                    privyToken,
                    targetAddress: dest,
                    claimType,
                }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.message) {
                    setFundSuccess(data.message);
                } else {
                    const label =
                        claimType === 'stt'
                            ? '1 STT (gas)'
                            : claimType === 'tusdc'
                            ? '500 tUSDC'
                            : '1 STT + 500 tUSDC';
                    setFundSuccess(`Testnet grant added: ${label}`);
                }
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

    const retryLogin = () => {
        setActionError(null);
        if (login) {
            try {
                login();
            } catch (err: any) {
                console.warn('[Privy TMA] Manual login error:', err);
                setActionError(err?.message || 'Login attempt failed');
            }
        }
    };

    const retryCreateWallet = () => {
        setActionError(null);
        isCreatingWallet.current = false;
        createWallet()
            .then((w) => {
                console.log('[Privy TMA] Wallet created:', w?.address);
            })
            .catch((err: any) => {
                console.warn('[Privy TMA] Retry createWallet error:', err);
                setActionError(err?.message || 'Could not create wallet');
            });
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
                retryLogin,
                retryCreateWallet,
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
