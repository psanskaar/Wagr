import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    parseUnits,
    getAddress,
    type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    somniaShannon,
    SHANNON_RPC,
    USDSO_TOKEN,
    erc20Abi,
} from '@/lib/wagr';

/**
 * Verifies Telegram initData HMAC against the bot token.
 * Rejects forged or altered payloads with zero access.
 */
function verifyTelegramInitData(
    initData: string,
    botToken: string
): { verified: boolean; user?: any; error?: string } {
    if (!initData || !botToken) {
        return { verified: false, error: 'Missing initData or botToken' };
    }

    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        if (!hash) {
            return { verified: false, error: 'Missing hash parameter' };
        }

        urlParams.delete('hash');
        const items: string[] = [];
        for (const [key, value] of urlParams.entries()) {
            items.push(`${key}=${value}`);
        }
        items.sort();
        const dataCheckString = items.join('\n');

        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();

        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (calculatedHash !== hash) {
            return { verified: false, error: 'HMAC signature mismatch' };
        }

        const userRaw = urlParams.get('user');
        const user = userRaw ? JSON.parse(userRaw) : undefined;
        return { verified: true, user };
    } catch (err: any) {
        return { verified: false, error: err?.message || 'Verification exception' };
    }
}

/**
 * Verifies user via Privy REST API.
 * Ensures the privyUserId has a linked Telegram account and owns the target address.
 */
async function verifyPrivyTelegramUser(
    privyUserId: string,
    targetAddress: string,
    appId: string,
    appSecret: string
): Promise<{ verified: boolean; telegramUserId?: string; username?: string; error?: string }> {
    try {
        const auth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
        const res = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(privyUserId)}`, {
            headers: {
                Authorization: `Basic ${auth}`,
                'privy-app-id': appId,
            },
        });

        if (!res.ok) {
            return { verified: false, error: `Privy API returned status ${res.status}` };
        }

        const data = await res.json();
        const linkedAccounts: any[] = data?.linked_accounts || [];

        // Check 1: User must have linked Telegram account
        const tgAccount = linkedAccounts.find((acc) => acc.type === 'telegram');
        if (!tgAccount) {
            return { verified: false, error: 'Privy user does not have a linked Telegram account' };
        }

        // Check 2: User must have the target wallet address linked
        const normalizedTarget = targetAddress.toLowerCase();
        const hasMatchingWallet = linkedAccounts.some(
            (acc) =>
                acc.type === 'wallet' &&
                typeof acc.address === 'string' &&
                acc.address.toLowerCase() === normalizedTarget
        );

        if (!hasMatchingWallet) {
            return { verified: false, error: 'Target address is not linked to this Privy user account' };
        }

        const tgUserId = String(tgAccount.telegram_user_id || tgAccount.telegramUserId || '');
        const username = tgAccount.username || undefined;

        return {
            verified: true,
            telegramUserId: tgUserId,
            username,
        };
    } catch (err: any) {
        return { verified: false, error: err?.message || 'Privy verification exception' };
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { initData, privyUserId, targetAddress, claimType = 'starter' } = body;

        if (!targetAddress || typeof targetAddress !== 'string' || !targetAddress.startsWith('0x') || targetAddress.length !== 42) {
            return NextResponse.json(
                { success: false, error: 'Invalid target address' },
                { status: 400 }
            );
        }

        const checksumTarget = getAddress(targetAddress);

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
        const privyAppSecret = process.env.PRIVY_APP_SECRET;

        let isAuthVerified = false;
        let verifiedTelegramUserId: string | undefined;
        let authMethod = 'none';

        // Dual Verification Method 1: Telegram HMAC initData
        if (initData && typeof initData === 'string' && initData.length > 10 && botToken) {
            const hmacResult = verifyTelegramInitData(initData, botToken);
            if (hmacResult.verified) {
                isAuthVerified = true;
                verifiedTelegramUserId = hmacResult.user?.id ? String(hmacResult.user.id) : undefined;
                authMethod = 'telegram_hmac';
            }
        }

        // Dual Verification Method 2: Privy REST API verification
        if (!isAuthVerified && privyUserId && typeof privyUserId === 'string' && privyUserId.startsWith('did:privy:') && privyAppId && privyAppSecret) {
            const privyResult = await verifyPrivyTelegramUser(
                privyUserId,
                checksumTarget,
                privyAppId,
                privyAppSecret
            );
            if (privyResult.verified) {
                isAuthVerified = true;
                verifiedTelegramUserId = privyResult.telegramUserId;
                authMethod = 'privy_verified';
            }
        }

        if (!isAuthVerified) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Unauthorized: Telegram session data missing or invalid. Please open inside Telegram.',
                },
                { status: 401 }
            );
        }

        let rawPk = process.env.KEEPER_PK || process.env.SETTLEMENT_RELAYER_PK;
        if (rawPk && !rawPk.startsWith('0x')) {
            rawPk = `0x${rawPk}`;
        }
        if (!rawPk || rawPk.length !== 66) {
            return NextResponse.json(
                { success: false, error: 'Server funding wallet not configured (KEEPER_PK missing)' },
                { status: 500 }
            );
        }

        const publicClient = createPublicClient({
            chain: somniaShannon,
            transport: http(SHANNON_RPC),
        });

        // Pre-check user's current balances on Somnia Shannon
        let currentStt = 0n;
        let currentTusdc = 0n;
        try {
            currentStt = await publicClient.getBalance({ address: checksumTarget });
            currentTusdc = await publicClient.readContract({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [checksumTarget],
            });
        } catch (balErr) {
            console.warn('Balance pre-check notice:', balErr);
        }

        // Determine what needs to be funded based on claimType and existing balances
        let shouldSendStt = false;
        let shouldSendTusdc = false;

        if (claimType === 'stt') {
            shouldSendStt = true;
        } else if (claimType === 'tusdc') {
            shouldSendTusdc = true;
        } else if (claimType === 'both') {
            shouldSendStt = true;
            shouldSendTusdc = true;
        } else if (claimType === 'starter') {
            // Only send STT if user has < 0.5 STT
            shouldSendStt = currentStt < parseEther('0.5');
            // Only send tUSDC if user has < 200 tUSDC
            shouldSendTusdc = currentTusdc < parseUnits('200', 6);

            // If neither is required, grant is already fulfilled
            if (!shouldSendStt && !shouldSendTusdc) {
                return NextResponse.json({
                    success: true,
                    claimType,
                    sttTx: null,
                    tusdcTx: null,
                    alreadyFunded: true,
                    targetAddress: checksumTarget,
                    telegramUserId: verifiedTelegramUserId,
                    authMethod,
                    message: 'Testnet grant already active (1 STT + 500 tUSDC ready)',
                });
            }
        }

        const relayerAccount = privateKeyToAccount(rawPk as `0x${string}`);
        const client = createWalletClient({
            account: relayerAccount,
            chain: somniaShannon,
            transport: http(SHANNON_RPC),
        });

        let sttTx: string | null = null;
        let tusdcTx: string | null = null;

        // Fetch fresh pending nonce for the relayer
        let currentNonce = await publicClient.getTransactionCount({
            address: relayerAccount.address,
            blockTag: 'pending',
        });

        // 1. Send STT (gas) if needed
        if (shouldSendStt) {
            try {
                sttTx = await client.sendTransaction({
                    to: checksumTarget,
                    value: parseEther('1'),
                    nonce: currentNonce,
                });
            } catch (err: any) {
                const isNonceErr =
                    err?.message?.includes('nonce') ||
                    err?.shortMessage?.includes('nonce');
                if (isNonceErr) {
                    currentNonce = await publicClient.getTransactionCount({
                        address: relayerAccount.address,
                        blockTag: 'pending',
                    });
                    sttTx = await client.sendTransaction({
                        to: checksumTarget,
                        value: parseEther('1'),
                        nonce: currentNonce,
                    });
                } else {
                    throw err;
                }
            }

            currentNonce++;

            // Wait for STT confirmation so the nonce is committed on-chain
            try {
                await publicClient.waitForTransactionReceipt({
                    hash: sttTx as `0x${string}`,
                    timeout: 10_000,
                });
            } catch (waitErr) {
                console.warn('STT receipt wait notice:', waitErr);
            }
        }

        // 2. Send 500 tUSDC (collateral) if needed
        if (shouldSendTusdc) {
            // Re-sync nonce with pending pool to prevent collisions
            const freshNonce = await publicClient.getTransactionCount({
                address: relayerAccount.address,
                blockTag: 'pending',
            });
            const sendNonce = Math.max(currentNonce, freshNonce);

            try {
                tusdcTx = await client.writeContract({
                    address: USDSO_TOKEN,
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [checksumTarget, parseUnits('500', 6)],
                    nonce: sendNonce,
                });
            } catch (err: any) {
                const isNonceErr =
                    err?.message?.includes('nonce') ||
                    err?.shortMessage?.includes('nonce');
                if (isNonceErr) {
                    const retryNonce = await publicClient.getTransactionCount({
                        address: relayerAccount.address,
                        blockTag: 'pending',
                    });
                    tusdcTx = await client.writeContract({
                        address: USDSO_TOKEN,
                        abi: erc20Abi,
                        functionName: 'transfer',
                        args: [checksumTarget, parseUnits('500', 6)],
                        nonce: retryNonce,
                    });
                } else {
                    throw err;
                }
            }

            try {
                await publicClient.waitForTransactionReceipt({
                    hash: tusdcTx as `0x${string}`,
                    timeout: 10_000,
                });
            } catch (waitErr) {
                console.warn('tUSDC receipt wait notice:', waitErr);
            }
        }

        const grantedSummary = [
            sttTx ? '1 STT' : null,
            tusdcTx ? '500 tUSDC' : null,
        ]
            .filter(Boolean)
            .join(' + ');

        return NextResponse.json({
            success: true,
            claimType,
            sttTx,
            tusdcTx,
            targetAddress: checksumTarget,
            telegramUserId: verifiedTelegramUserId,
            authMethod,
            message: `Granted testnet funds on Somnia Shannon (${grantedSummary || 'ready'})`,
        });
    } catch (err: any) {
        console.error('Telegram fund error:', err);
        return NextResponse.json(
            {
                success: false,
                error: err?.shortMessage || err?.message || 'Funding transaction failed',
            },
            { status: 500 }
        );
    }
}
