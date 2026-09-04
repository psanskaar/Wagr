/**
 * Wagr reactivity subscriber.
 *
 *   1. Reads every BinaryMarket the escrow has ever had a duel on
 *      (via `WagrEscrow.duelsByMarket`).
 *   2. Registers ONE Solidity reactivity subscription per market whose
 *      filter is `emitter = market, topic0 = Resolved`.
 *   3. When the market emits Resolved, the Somnia validators call
 *      `WagrEscrow.onEvent(...)` at the precompile's expense — which
 *      pays the winner in the same block. NO KEEPER CALL, NO USER CLICK.
 *
 * See https://prd.smk.somnia.host/docs/typescript/reactivity for the shape.
 */
import 'dotenv/config';
import {
    createPublicClient,
    createWalletClient,
    http,
    webSocket,
    parseAbi,
    keccak256,
    toBytes,
    type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SomniaMarkets } from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';
import {
    createReactivity,
    unwrap,
    DEFAULT_SUBSCRIPTION_OPTIONS,
} from '@somnia-chain/markets-sdk/reactivity';

const ESCROW           = process.env.WAGR_ESCROW as Address;
const OWNER_PK         = process.env.SUBSCRIPTION_OWNER_PK as `0x${string}`;
const WS_RPC           = process.env.WS_RPC_URL ?? 'wss://api.infra.testnet.somnia.network/ws';
const INDEXER          = process.env.INDEXER_URL ?? 'https://dev.smk.somnia.host/v1/graphql';

if (!ESCROW || !OWNER_PK) throw new Error('WAGR_ESCROW and SUBSCRIPTION_OWNER_PK required');

const RESOLVED_TOPIC = keccak256(toBytes('Resolved(bytes32,uint8,uint256[])'));

const escrowAbi = parseAbi([
    'function nextDuelId() view returns (uint256)',
    'function getDuel(uint256) view returns ((address alice,uint128 stakeA,uint8 aliceSide,bool settled,address bob,uint128 stakeB,address marketAddress,uint64 createdAt,address builder,uint16 builderBps))',
    'function getDuelsForMarket(address) view returns (uint256[])',
]);

async function main() {
    const account = privateKeyToAccount(OWNER_PK);
    console.log('[wagr-keeper] subscription owner:', account.address);

    const publicClient = createPublicClient({
        chain: somniaShannon,
        transport: webSocket(WS_RPC),
    });
    const walletClient = createWalletClient({
        account,
        chain: somniaShannon,
        transport: http(),
    });

    const exchange = new SomniaMarkets({
        indexerUrl: INDEXER,
        chain: somniaShannon,
        wsRpcUrl: WS_RPC,
        privateKey: OWNER_PK,
        addresses: (await import('@somnia-chain/markets-sdk')).SOMNIA_TESTNET_ADDRESSES,
    });
    const reactivity = createReactivity(exchange.client, { wallet: walletClient });

    // Discover markets we already have duels against by scanning the escrow.
    const next = await publicClient.readContract({
        address: ESCROW, abi: escrowAbi, functionName: 'nextDuelId',
    }) as bigint;

    const markets = new Set<Address>();
    for (let i = 1n; i < next; i++) {
        const d = await publicClient.readContract({
            address: ESCROW, abi: escrowAbi, functionName: 'getDuel', args: [i],
        }) as any;
        if (d.marketAddress !== '0x0000000000000000000000000000000000000000') {
            markets.add(d.marketAddress as Address);
        }
    }
    console.log(`[wagr-keeper] subscribing to ${markets.size} market(s)`);

    for (const market of markets) {
        const hash = unwrap(await reactivity.subscribe({
            handlerContractAddress: ESCROW,
            filter: { emitter: market, eventTopics: [RESOLVED_TOPIC] },
            options: DEFAULT_SUBSCRIPTION_OPTIONS,
        }));
        console.log(`  ✓ market=${market}  subscription tx=${hash}`);
    }

    // Also watch for newly-created duels via the DuelCreated event and
    // register subscriptions for markets we haven't seen before.
    publicClient.watchContractEvent({
        address: ESCROW,
        abi: parseAbi([
            'event DuelCreated(uint256 indexed duelId,address indexed alice,address indexed marketAddress,uint8 aliceSide,uint128 stakeA,address builder,uint16 builderBps)',
        ]),
        eventName: 'DuelCreated',
        onLogs: async (logs) => {
            for (const log of logs) {
                const market = (log.args as any).marketAddress as Address;
                if (markets.has(market)) continue;
                markets.add(market);
                try {
                    const hash = unwrap(await reactivity.subscribe({
                        handlerContractAddress: ESCROW,
                        filter: { emitter: market, eventTopics: [RESOLVED_TOPIC] },
                        options: DEFAULT_SUBSCRIPTION_OPTIONS,
                    }));
                    console.log(`[wagr-keeper] new market=${market} sub=${hash}`);
                } catch (e) {
                    console.error(`[wagr-keeper] subscribe failed for ${market}:`, e);
                }
            }
        },
    });

    // Idle forever.
    await new Promise(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
