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

        const botToken = process.env.TELEGRAM_BOT_TOKEN || '8711843470:AAFmZqhkADJYWi90hBn0ghzLmvAAH84lFRw';
        const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmtwrniws038s0cl5cw6ulq8v';
        const privyAppSecret = process.env.PRIVY_APP_SECRET || 'privy_app_secret_3UzTAHJGYv7v4VJy7mMfKRNvzkDXRwNZJAi2TNXuyrkwsDz8mpW5D9m4RY1NWuCycYht2SPW8WdoKhEKaHKyfg8Y';

        let isAuthVerified = false;
        let verifiedTelegramUserId: string | undefined;
        let authMethod = 'none';

        // Dual Verification Method 1: Telegram HMAC initData
        if (initData && typeof initData === 'string' && initData.length > 10) {
            const hmacResult = verifyTelegramInitData(initData, botToken);
            if (hmacResult.verified) {
                isAuthVerified = true;
                verifiedTelegramUserId = hmacResult.user?.id ? String(hmacResult.user.id) : undefined;
                authMethod = 'telegram_hmac';
            }
        }

        // Dual Verification Method 2: Privy REST API verification
        if (!isAuthVerified && privyUserId && typeof privyUserId === 'string' && privyUserId.startsWith('did:privy:')) {
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

        let rawPk = process.env.KEEPER_PK || process.env.SETTLEMENT_RELAYER_PK || '0xaf0ead65a58886482f4a7749fffaf953c8b2cba5d621163fd765fdab1c3488f4';
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

        // Idempotency: For starter grant, check if wallet already has sufficient funds
        if (claimType === 'starter') {
            try {
                const currentStt = await publicClient.getBalance({ address: checksumTarget });
                const currentTusdc = await publicClient.readContract({
                    address: USDSO_TOKEN,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [checksumTarget],
                });

                // If user already has >= 0.5 STT and >= 200 tUSDC, starter grant is already fulfilled
                if (currentStt >= parseEther('0.5') && currentTusdc >= parseUnits('200', 6)) {
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
            } catch (balErr) {
                console.warn('Balance pre-check notice:', balErr);
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

        // Send 1 STT (gas) if claimType is starter, stt, or both
        if (claimType === 'starter' || claimType === 'stt' || claimType === 'both') {
            sttTx = await client.sendTransaction({
                to: checksumTarget,
                value: parseEther('1'),
            });
        }

        // Send 500 tUSDC (collateral) if claimType is starter, tusdc, or both
        if (claimType === 'starter' || claimType === 'tusdc' || claimType === 'both') {
            tusdcTx = await client.writeContract({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [checksumTarget, parseUnits('500', 6)],
            });
        }

        return NextResponse.json({
            success: true,
            claimType,
            sttTx,
            tusdcTx,
            targetAddress: checksumTarget,
            telegramUserId: verifiedTelegramUserId,
            authMethod,
            message: `Granted testnet funds on Somnia Shannon (${
                claimType === 'stt'
                    ? '1 STT'
                    : claimType === 'tusdc'
                    ? '500 tUSDC'
                    : '1 STT + 500 tUSDC'
            })`,
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
