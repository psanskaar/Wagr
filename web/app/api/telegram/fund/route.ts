import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
    createWalletClient,
    http,
    parseEther,
    parseUnits,
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

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { initData, targetAddress, claimType = 'starter' } = body;

        if (!targetAddress || typeof targetAddress !== 'string' || !targetAddress.startsWith('0x') || targetAddress.length !== 42) {
            return NextResponse.json(
                { success: false, error: 'Invalid target address' },
                { status: 400 }
            );
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            return NextResponse.json(
                { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured on server' },
                { status: 500 }
            );
        }

        const { verified, user, error: verifyError } = verifyTelegramInitData(initData, botToken);
        if (!verified) {
            return NextResponse.json(
                { success: false, error: `Unauthorized: ${verifyError}` },
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
                to: targetAddress as Address,
                value: parseEther('1'),
            });
        }

        // Send 500 tUSDC (collateral) if claimType is starter, tusdc, or both
        if (claimType === 'starter' || claimType === 'tusdc' || claimType === 'both') {
            tusdcTx = await client.writeContract({
                address: USDSO_TOKEN,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [targetAddress as Address, parseUnits('500', 6)],
            });
        }

        return NextResponse.json({
            success: true,
            claimType,
            sttTx,
            tusdcTx,
            targetAddress,
            telegramUserId: user?.id,
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
