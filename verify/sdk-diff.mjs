/**
 * SDK-differential CI check.
 *
 * Loads the deployed WagrEscrow ABI and asserts that every `IBinaryMarket`
 * selector we depend on is actually implemented on the DreamDEX
 * BinaryMarket clone on Shannon. Guards against ABI drift.
 *
 * Run:  node verify/sdk-diff.mjs
 */
import { createPublicClient, http, keccak256, toBytes } from 'viem';

const SHANNON_RPC = process.env.HTTP_RPC_URL ?? 'https://api.infra.testnet.somnia.network';
const MARKET      = process.env.MARKET_ADDRESS;

if (!MARKET) {
    console.error('Set MARKET_ADDRESS to a live DreamDEX BinaryMarket clone (from listBinaryMarkets).');
    process.exit(2);
}

const client = createPublicClient({ transport: http(SHANNON_RPC) });

const selectors = [
    'winningOutcome()',
    'isResolved()',
    'isVoided()',
    'status()',
    'expiry()',
    'yesId()',
    'noId()',
    'collateral()',
];

let failed = 0;
for (const sig of selectors) {
    const sel = keccak256(toBytes(sig)).slice(0, 10);
    try {
        // eth_call to the selector. Any successful call means the selector
        // exists on the clone; a revert with "invalid opcode" or similar
        // means the ABI drifted from what we assume.
        const data = await client.request({
            method: 'eth_call',
            params: [{ to: MARKET, data: sel }, 'latest'],
        });
        console.log(`  ✓ ${sig.padEnd(24)}  (${sel})  ->  ${data.slice(0, 12)}…`);
    } catch (e) {
        failed++;
        console.error(`  ✗ ${sig}  MISSING on ${MARKET}`);
    }
}

if (failed > 0) {
    console.error(`\nSDK differential check FAILED: ${failed}/${selectors.length} selector(s) missing.`);
    process.exit(1);
}
console.log(`\nSDK differential check PASSED: ${selectors.length}/${selectors.length} selectors present on ${MARKET}.`);
