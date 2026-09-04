import { NextResponse } from 'next/server';
import {
    createPublicClient,
    createWalletClient,
    http,
    type Address,
    type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    WAGR_ESCROW,
    escrowAbi,
    binaryMarketAbi,
    somniaShannon,
    SHANNON_RPC,
} from '@/lib/wagr';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const duelId = BigInt(body.duelId ?? 0);

        if (duelId <= 0n) {
            return NextResponse.json(
                { success: false, error: 'Invalid duelId' },
                { status: 400 }
            );
        }

        let rawPk = process.env.KEEPER_PK || process.env.SETTLEMENT_RELAYER_PK;
        if (rawPk && !rawPk.startsWith('0x')) {
            rawPk = `0x${rawPk}`;
        }
        const keeperPk = rawPk as Hash | undefined;

        if (!keeperPk || keeperPk.length !== 66) {
            return NextResponse.json({
                success: false,
                reason: 'NO_RELAYER_KEY',
                message: 'No valid KEEPER_PK configured in .env.local for zero-click background settlement. Use manual fallback button or add KEEPER_PK.',
            });
        }

        const account = privateKeyToAccount(keeperPk);
        const publicClient = createPublicClient({
            chain: somniaShannon,
            transport: http(SHANNON_RPC),
        });

        const walletClient = createWalletClient({
            account,
            chain: somniaShannon,
            transport: http(SHANNON_RPC),
        });

        // Check if duel exists and is already settled
        const d = (await publicClient.readContract({
            address: WAGR_ESCROW,
            abi: escrowAbi,
            functionName: 'getDuel',
            args: [duelId],
        })) as any;

        if (d.settled) {
            return NextResponse.json({
                success: true,
                alreadySettled: true,
                message: `Duel #${duelId} is already settled on-chain.`,
            });
        }

        if (!d.bob || d.bob === '0x0000000000000000000000000000000000000000') {
            return NextResponse.json({
                success: false,
                error: 'Duel has no taker yet.',
            });
        }

        // Check if underlying market is resolved
        const isResolved = (await publicClient.readContract({
            address: d.marketAddress as Address,
            abi: binaryMarketAbi,
            functionName: 'isResolved',
        })) as boolean;

        if (!isResolved) {
            return NextResponse.json({
                success: false,
                error: 'Underlying DreamDEX market has not resolved yet.',
            });
        }

        // Execute zero-click settlement on behalf of players
        const hash = await walletClient.writeContract({
            address: WAGR_ESCROW,
            abi: escrowAbi,
            functionName: 'settleDuel',
            args: [duelId],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return NextResponse.json({
            success: true,
            settled: true,
            txHash: hash,
            blockNumber: Number(receipt.blockNumber),
            relayer: account.address,
        });
    } catch (err: any) {
        console.error('API settleDuel failed:', err);
        return NextResponse.json(
            { success: false, error: err?.shortMessage || err?.message || 'Settlement failed' },
            { status: 500 }
        );
    }
}
