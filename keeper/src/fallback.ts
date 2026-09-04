/**
 * Fallback settlement poller.
 *
 * If the reactivity subscription drops, or the market emits Resolved through
 * a path that doesn't match the filter, this process notices within one poll
 * interval and calls `settleDuel(id)` permissionlessly. Belt AND suspenders.
 *
 * Keeps the "zero-click for the user" property even when the primary path
 * hiccups — the WORST case is one extra block of latency, not a stuck payout.
 */
import 'dotenv/config';
import {
    createPublicClient,
    createWalletClient,
    http,
    parseAbi,
    type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

const ESCROW  = process.env.WAGR_ESCROW as Address;
const PK      = process.env.KEEPER_PK   as `0x${string}`;
const RPC     = process.env.HTTP_RPC_URL ?? 'https://api.infra.testnet.somnia.network';
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5_000);

if (!ESCROW || !PK) throw new Error('WAGR_ESCROW and KEEPER_PK required');

const escrowAbi = parseAbi([
    'function nextDuelId() view returns (uint256)',
    'function getDuel(uint256) view returns ((address alice,uint128 stakeA,uint8 aliceSide,bool settled,address bob,uint128 stakeB,address marketAddress,uint64 createdAt,address builder,uint16 builderBps))',
    'function settleDuel(uint256)',
]);
const marketAbi = parseAbi([
    'function isResolved() view returns (bool)',
]);

async function main() {
    const account = privateKeyToAccount(PK);
    const publicClient = createPublicClient({ chain: somniaShannon, transport: http(RPC) });
    const walletClient = createWalletClient({ account, chain: somniaShannon, transport: http(RPC) });
    console.log('[wagr-fallback] running as', account.address);

    for (;;) {
        try {
            const next = await publicClient.readContract({
                address: ESCROW, abi: escrowAbi, functionName: 'nextDuelId',
            }) as bigint;
            for (let i = 1n; i < next; i++) {
                const d = await publicClient.readContract({
                    address: ESCROW, abi: escrowAbi, functionName: 'getDuel', args: [i],
                }) as any;
                if (d.settled || d.bob === '0x0000000000000000000000000000000000000000') continue;
                const resolved = await publicClient.readContract({
                    address: d.marketAddress as Address, abi: marketAbi, functionName: 'isResolved',
                }) as boolean;
                if (!resolved) continue;
                console.log(`[wagr-fallback] settling duel ${i}`);
                await walletClient.writeContract({
                    address: ESCROW, abi: escrowAbi, functionName: 'settleDuel', args: [i],
                });
            }
        } catch (e) {
            console.error('[wagr-fallback] tick failed:', e);
        }
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
