import {
    createPublicClient,
    http,
    parseAbi,
    formatUnits,
    parseUnits,
    defineChain,
    type Address,
    type Hash,
    keccak256,
    encodeAbiParameters,
    concat,
} from 'viem';

// ============================================================================
// Chain & Network Configuration
// ============================================================================

export const somniaShannon = defineChain({
    id: 50312,
    name: 'Somnia Shannon Testnet',
    nativeCurrency: {
        name: 'Somnia Testnet Token',
        symbol: 'STT',
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: [
                process.env.NEXT_PUBLIC_RPC_HTTP ??
                process.env.NEXT_PUBLIC_RPC ??
                'https://api.infra.testnet.somnia.network'
            ],
            webSocket: [
                process.env.NEXT_PUBLIC_RPC_WS ??
                'wss://api.infra.testnet.somnia.network/ws'
            ],
        },
    },
    blockExplorers: {
        default: {
            name: 'Somnia Shannon Explorer',
            url: 'https://shannon-explorer.somnia.network',
        },
    },
    testnet: true,
});

export const SHANNON_CHAIN_ID = 50312;
export const SHANNON_RPC =
    process.env.NEXT_PUBLIC_RPC_HTTP ??
    process.env.NEXT_PUBLIC_RPC ??
    'https://api.infra.testnet.somnia.network';

// ============================================================================
// Deployed Contract Addresses on Somnia Shannon Testnet
// ============================================================================

export const WAGR_ESCROW: Address = (
    process.env.NEXT_PUBLIC_WAGR_ESCROW ??
    process.env.NEXT_PUBLIC_ESCROW ??
    '0xc160f68e5f2e6846057ad6d4ada5d320b385c2cb'
) as Address;

export const WAGR_SEASON: Address = (
    process.env.NEXT_PUBLIC_WAGR_SEASON ??
    process.env.NEXT_PUBLIC_SEASON ??
    '0x890506b7288573412674d8e8f34622aeb57fa708'
) as Address;

export const WAGR_FACTORY: Address = (
    process.env.NEXT_PUBLIC_WAGR_FACTORY ??
    process.env.NEXT_PUBLIC_FACTORY ??
    '0x1190048fb57e44fdedb418696075e884a9d89308'
) as Address;

export const USDSO_TOKEN: Address = (
    process.env.NEXT_PUBLIC_USDSO ??
    '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'
) as Address;

export const REACTIVITY_PRECOMPILE: Address =
    '0x0000000000000000000000000000000000000100';

export const VERIFIED_PROOF_TX: Hash =
    '0xb8290da3b70add14e567b43fb75bcfd56951e69110a0e5cd631fae83f8858f33';
export const VERIFIED_PROOF_BLOCK = 477711153;

// ============================================================================
// Public Viem Client
// ============================================================================

export const publicClient = createPublicClient({
    chain: somniaShannon,
    transport: http(SHANNON_RPC, {
        batch: true,
        retryCount: 3,
        retryDelay: 1000,
    }),
});

// ============================================================================
// Complete Contract ABIs
// ============================================================================

export const escrowAbi = parseAbi([
    'function nextDuelId() view returns (uint256)',
    'function duels(uint256) view returns (address alice, uint128 stakeA, uint8 aliceSide, bool settled, address bob, uint128 stakeB, address marketAddress, uint64 createdAt, address builder, uint16 builderBps)',
    'function getDuel(uint256) view returns ((address alice, uint128 stakeA, uint8 aliceSide, bool settled, address bob, uint128 stakeB, address marketAddress, uint64 createdAt, address builder, uint16 builderBps))',
    'function duelsByMarket(address) view returns (uint256[])',
    'function getDuelsForMarket(address) view returns (uint256[])',
    'function previewPayout(uint256) view returns (address winner, uint256 payout, bool voided, bool resolved)',
    'function totalDuels() view returns (uint256)',
    'function totalWagered() view returns (uint256)',
    'function totalRoutedOrders() view returns (uint256)',
    'function totalPaidToCreators() view returns (uint256)',
    'function platformBps() view returns (uint16)',
    'function collateral() view returns (address)',
    'function reactivityPrecompile() view returns (address)',
    'function feeSink() view returns (address)',
    'function createDuel(address marketAddress, uint8 aliceSide, uint128 stakeA, address builder, uint16 builderBps) returns (uint256)',
    'function createDuelFor(address alice, address marketAddress, uint8 aliceSide, uint128 stakeA, address builder, uint16 builderBps) returns (uint256)',
    'function acceptDuel(uint256 duelId, uint128 stakeB)',
    'function cancelDuel(uint256 duelId)',
    'function settleDuel(uint256 duelId)',
    'function settleMarket(address marketAddress)',
    'function commit(bytes32 commitHash, uint128 stake) returns (uint256)',
    'function matchAndReveal(uint256 commitId, address marketAddress, uint8 makerSide, uint128 stake, bytes32 salt, uint8 takerSide, uint128 takerStake) returns (uint256)',
    'function commits(uint256) view returns (address maker, uint128 stake, uint8 makerSide, bool consumed, uint64 commitBlock, bytes32 commitHash, address marketAddress)',
    'function nextCommitId() view returns (uint256)',
    'function nextDuelId() view returns (uint256)',
    'event DuelCreated(uint256 indexed duelId, address indexed alice, address indexed marketAddress, uint8 aliceSide, uint128 stakeA, address builder, uint16 builderBps)',
    'event DuelAccepted(uint256 indexed duelId, address indexed bob, uint128 stakeB)',
    'event DuelSettled(uint256 indexed duelId, address indexed winner, uint8 winningSide, uint256 payout, bool voided, bool viaReactivity)',
    'event DuelCancelled(uint256 indexed duelId)',
    'event CommitPlaced(uint256 indexed commitId, address indexed maker, uint128 stake)',
    'event CommitRevealed(uint256 indexed commitId, uint256 indexed duelId)',
    'event BuilderFeePaid(address indexed builder, uint256 amount)',
]);

export const seasonAbi = parseAbi([
    'function nextSeasonId() view returns (uint256)',
    'function seasons(uint256) view returns (address operator, uint128 pool, uint64 startedAt, uint64 closedAt, uint128 entryFee, bytes32 payoutRoot)',
    'function entered(uint256, address) view returns (bool)',
    'function isClaimed(uint256, uint256) view returns (bool)',
    'function totalPaidOut() view returns (uint256)',
    'function createSeason(uint128 entryFee) returns (uint256)',
    'function joinSeason(uint256 seasonId, uint128 fee)',
    'function commitSeasonPayouts(uint256 seasonId, bytes32 root, uint128 totalPool)',
    'function claim(uint256 seasonId, uint256 index, address account, uint256 amount, bytes32[] proof)',
    'event SeasonCreated(uint256 indexed seasonId, address indexed operator, uint128 entryFee)',
    'event SeasonJoined(uint256 indexed seasonId, address indexed member, uint128 fee)',
    'event SeasonPayoutsCommitted(uint256 indexed seasonId, bytes32 payoutRoot, uint128 totalPool)',
    'event SeasonClaim(uint256 indexed seasonId, uint256 indexed index, address account, uint256 amount)',
]);

export const factoryAbi = parseAbi([
    'function implementation() view returns (address)',
    'function predict(bytes32 salt) view returns (address)',
    'function createSplitter(bytes32 salt, (address to, uint32 shareBps)[] recipients) returns (address)',
    'event SplitterCreated(address indexed splitter, bytes32 indexed salt, address indexed creator)',
]);

export const splitterAbi = parseAbi([
    'function recipients(uint256) view returns (address to, uint32 shareBps)',
    'function recipientCount() view returns (uint256)',
    'function totalReceived(address token) view returns (uint256)',
    'function paid(address token, address recipient) view returns (uint256)',
    'function owed(address token, address recipient) view returns (uint256)',
    'function accrue(address token) returns (uint256)',
    'function claim(address token) returns (uint256)',
    'event Received(address indexed token, uint256 amount, uint256 totalReceived)',
    'event Claimed(address indexed token, address indexed recipient, uint256 amount)',
]);

export const binaryMarketAbi = parseAbi([
    'function payoutNumerators() view returns (uint256[])',
    'function isResolved() view returns (bool)',
    'function isVoided() view returns (bool)',
    'function status() view returns (uint8)',
    'function expiry() view returns (uint64)',
    'function yesId() view returns (uint256)',
    'function noId() view returns (uint256)',
    'function collateral() view returns (address)',
]);

export const erc20Abi = parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

// ============================================================================
// TypeScript Types
// ============================================================================

export interface Duel {
    id: bigint;
    alice: Address;
    stakeA: bigint;
    aliceSide: number; // 0 = UP/YES, 1 = DOWN/NO
    settled: boolean;
    bob: Address;
    stakeB: bigint;
    marketAddress: Address;
    createdAt: bigint;
    builder: Address;
    builderBps: number;
}

export interface DuelPreview {
    winner: Address;
    payout: bigint;
    voided: boolean;
    resolved: boolean;
}

export interface Season {
    id: bigint;
    operator: Address;
    pool: bigint;
    startedAt: bigint;
    closedAt: bigint;
    entryFee: bigint;
    payoutRoot: Hash;
}

export interface KnownMarket {
    address: Address;
    poolAddress?: Address;
    symbol: string;
    underlying: 'BTC' | 'ETH' | 'SOL' | string;
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '24h' | string;
    description: string;
    strikePrice?: string;
    status: number; // 0 Listed, 1 Trading, 2 Locked, 3 Settling, 4 Resolved, 5 Voided
    expiry: number;
    tradingStart?: number;
    lastPrice?: string | null;
}

// ============================================================================
// Real Live / Verified DreamDEX Event Contracts on Shannon Testnet
// ============================================================================

export const DREAMDEX_GRAPHQL_ENDPOINT =
    process.env.NEXT_PUBLIC_INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql';

/** Verified on-chain DreamDEX binary markets on Shannon testnet */
export const KNOWN_DREAMDEX_MARKETS: KnownMarket[] = [
    {
        address: '0x7b38a501df48fc36dd9433e132d8d0f1ae1e6ed0',
        poolAddress: '0x3604c66cdd41649f26a804df2c6cbd2f2753cb68',
        symbol: 'BTC-1H-UPDOWN',
        underlying: 'BTC',
        timeframe: '1h',
        description: 'Will BTC close above or below $81,950.00?',
        strikePrice: '$81,950.00',
        status: 1,
        expiry: 1788444000,
    },
    {
        address: '0xa3bda4e749fe9a0f41b1784f62291d707c5302a2',
        poolAddress: '0x4abb885682402039a5d50b542ad30ae305898963',
        symbol: 'ETH-1H-UPDOWN',
        underlying: 'ETH',
        timeframe: '1h',
        description: 'Will ETH close above or below $2,515.00?',
        strikePrice: '$2,515.00',
        status: 1,
        expiry: 1788444000,
    },
    {
        address: '0xbb5268919545b897a864fa3eeb19f7dc000d8d2c',
        poolAddress: '0x1dece9ce70971207894a354b4dbfc9e8f0f72be9',
        symbol: 'BTC-4H-UPDOWN',
        underlying: 'BTC',
        timeframe: '4h',
        description: 'Will BTC close above or below $81,950.00?',
        strikePrice: '$81,950.00',
        status: 1,
        expiry: 1788451200,
    },
    {
        address: '0x25ecdd18bc001d04f410a08cf91cef73f6655a2f',
        poolAddress: '0x443904c2218581095c9da27008d2b09b99865822',
        symbol: 'ETH-4H-UPDOWN',
        underlying: 'ETH',
        timeframe: '4h',
        description: 'Will ETH close above or below $2,515.00?',
        strikePrice: '$2,515.00',
        status: 1,
        expiry: 1788451200,
    },
    {
        address: '0x36fa3ea8bedecab4aa25673f571565e5737234cc',
        poolAddress: '0x8eb893db72752b1d2b3ac11f625af90db1beb404',
        symbol: 'BTC-24H-UPDOWN',
        underlying: 'BTC',
        timeframe: '24h',
        description: 'Will BTC close above or below $81,950.00?',
        strikePrice: '$81,950.00',
        status: 1,
        expiry: 1788480000,
    },
    {
        address: '0xda7e028c9973b3c429b4c093cb984860fc1215f8',
        poolAddress: '0x246a65643ad8b6c6dbd0b017a259da07681242fd',
        symbol: 'ETH-24H-UPDOWN',
        underlying: 'ETH',
        timeframe: '24h',
        description: 'Will ETH close above or below $2,515.00?',
        strikePrice: '$2,515.00',
        status: 1,
        expiry: 1788480000,
    },
];

function parseInterval(sec: string | number): string {
    const s = Number(sec);
    if (s <= 60) return '1m';
    if (s <= 300) return '5m';
    if (s <= 900) return '15m';
    if (s <= 3600) return '1h';
    if (s <= 14400) return '4h';
    if (s <= 86400) return '24h';
    return `${Math.round(s / 60)}m`;
}

function formatStrike(rawStrike: string): string {
    const s = Number(rawStrike);
    if (!s || s === 0) return 'Opening Price (0.00)';
    if (s > 100000000) {
        return `$${(s / 100000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (s > 100000) {
        return `$${(s / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${s.toLocaleString()}`;
}

/** Fetches real, live, unexpired binary markets directly from DreamDEX GraphQL indexer */
export async function fetchLiveDreamDexMarkets(): Promise<KnownMarket[]> {
    try {
        const query = `
            query GetActiveBinaryMarkets {
                Market(
                    where: {
                        marketType: {_eq: "BINARY"},
                        clobStatus: {_eq: "Trading"}
                    }
                    order_by: {createdAtTimestamp: desc}
                    limit: 30
                ) {
                    marketId
                    marketAddress
                    poolAddress
                    asset
                    question
                    clobStatus
                    strike
                    tradingStart
                    expiry
                    intervalSec
                    lastPrice
                }
            }
        `;

        const res = await fetch(DREAMDEX_GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });

        if (!res.ok) throw new Error(`DreamDEX GraphQL HTTP ${res.status}`);
        const json = await res.json();
        const raw = json.data?.Market || [];
        const now = Math.floor(Date.now() / 1000);

        const defaultSpots: Record<string, string> = {
            BTC: '78,650.00',
            ETH: '2,425.00',
            SOL: '101.50',
        };

        const live = raw
            .filter((m: any) => Number(m.expiry) > now && m.marketAddress)
            .map((m: any): KnownMarket => {
                const tf = parseInterval(m.intervalSec);
                const rawAsset = (m.asset && String(m.asset).trim()) || '';
                const asset = rawAsset ? rawAsset.toUpperCase() : (m.symbol ? String(m.symbol).split('-')[0].toUpperCase() : 'BTC');
                const rawQuestion = m.question || '';
                const rawStrike = Number(m.strike || 0);

                let cleanStrike = '';
                let cleanDescription = '';

                const matchPricefeed = rawQuestion.match(/price be at or above\s+([\d.]+)/i);
                if (matchPricefeed) {
                    const parsedNum = parseFloat(matchPricefeed[1]);
                    cleanStrike = `$${parsedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    cleanDescription = `Will ${asset} close above or below ${cleanStrike}?`;
                } else if (rawStrike > 0) {
                    if (rawStrike > 100000000) {
                        cleanStrike = `$${(rawStrike / 100000000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    } else if (rawStrike > 100000) {
                        cleanStrike = `$${(rawStrike / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    } else {
                        cleanStrike = `$${rawStrike.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    }
                    cleanDescription = `Will ${asset} close above or below ${cleanStrike}?`;
                } else {
                    const refPrice = defaultSpots[asset] || defaultSpots.BTC || (asset === 'ETH' ? '2,510.00' : '81,500.00');
                    cleanStrike = `$${refPrice}`;
                    cleanDescription = `Will ${asset} close above or below $${refPrice}?`;
                }

                if (!cleanDescription || cleanDescription.includes('Will  close') || cleanDescription.includes('open')) {
                    cleanDescription = `Will ${asset} close above or below ${cleanStrike}?`;
                }

                return {
                    address: m.marketAddress.toLowerCase() as Address,
                    poolAddress: m.poolAddress ? (m.poolAddress.toLowerCase() as Address) : undefined,
                    symbol: `${asset}-${tf.toUpperCase()}-UPDOWN`,
                    underlying: asset,
                    timeframe: tf,
                    description: cleanDescription,
                    strikePrice: cleanStrike,
                    status: 1,
                    expiry: Number(m.expiry),
                    tradingStart: Number(m.tradingStart || 0),
                    lastPrice: m.lastPrice ? (Number(m.lastPrice) / 10000).toFixed(2) : null,
                };
            });

        if (live.length > 0) return live;
    } catch (err) {
        console.warn('DreamDEX indexer fetch failed, using verified on-chain addresses:', err);
    }
    return getActiveMarkets();
}

export function getActiveMarkets(): KnownMarket[] {
    const now = Math.floor(Date.now() / 1000);
    return KNOWN_DREAMDEX_MARKETS.filter((m) => m.expiry > now && m.status === 1);
}

// ============================================================================
// Formatting & Math Helpers
// ============================================================================

/** Formats 6-decimal USDso token amount into readable string (e.g. 10.00) */
export function fmtUsd(amount: bigint | number | string): string {
    try {
        const bn = typeof amount === 'bigint' ? amount : BigInt(amount || 0);
        const floatVal = Number(formatUnits(bn, 6));
        return floatVal.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch {
        return '0.00';
    }
}

/** Parses human USD input (e.g. "10.5") into 6-decimal bigint */
export function parseUsd(input: string): bigint {
    try {
        if (!input || isNaN(Number(input))) return 0n;
        return parseUnits(input, 6);
    } catch {
        return 0n;
    }
}

/** Shortens hex address (e.g. 0x1234...5678) */
export function shortAddr(addr?: string): string {
    if (!addr) return '—';
    if (addr.length < 10) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Shortens tx hash (e.g. 0xb829...8f33) */
export function shortHash(hash?: string): string {
    if (!hash) return '—';
    if (hash.length < 12) return hash;
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

/** Explorer link for transaction */
export function getExplorerTxUrl(hash: string): string {
    return `${somniaShannon.blockExplorers.default.url}/tx/${hash}`;
}

/** Explorer link for address */
export function getExplorerAddressUrl(addr: string): string {
    return `${somniaShannon.blockExplorers.default.url}/address/${addr}`;
}

/** Calculate net payout after platform (0.5%) and optional builder fee */
export function calculatePotentialPayout(
    stakeA: bigint,
    stakeB: bigint,
    builderBps: number = 0,
    platformBps: number = 50
): { pot: bigint; platformFee: bigint; builderFee: bigint; netPayout: bigint } {
    const pot = stakeA + stakeB;
    const platformFee = (pot * BigInt(platformBps)) / 10_000n;
    const builderFee = (pot * BigInt(builderBps)) / 10_000n;
    const netPayout = pot - platformFee - builderFee;
    return { pot, platformFee, builderFee, netPayout };
}

/** Formats countdown seconds into mm:ss or hh:mm:ss */
export function formatCountdown(expiryTimestampSec: number | bigint): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = Number(expiryTimestampSec) - now;
    if (diff <= 0) return '00:00 (Expired)';

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    if (hours > 0) {
        return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}

// ============================================================================
// Synthesized Web Audio API Sound Effects (Zero External Asset Dependencies)
// ============================================================================

class SoundFX {
    private ctx: AudioContext | null = null;

    private getContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    /** Subtle click / tap */
    tap() {
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
        } catch { /* audio not allowed */ }
    }

    /** Stake selected / confirmed */
    stake() {
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch {}
    }

    /** Triumphant double-chime when a duel is settled */
    win() {
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            
            // First chord note
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5
            osc1.frequency.setValueAtTime(880, now + 0.1); // A5
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.4);

            // Second chord note (major third harmonic)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1174.66, now + 0.15); // D6
            gain2.gain.setValueAtTime(0.14, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.6);
        } catch {}
    }

    /** Triumphant arcade fanfare when winning */
    bigWin() {
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                gain.gain.setValueAtTime(0.15, now + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 0.5);
            });
        } catch {}
    }

    /** Dramatic bass thud and descending pitch for a loss */
    lose() {
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(65, now + 0.45);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.45);
        } catch {}
    }
}

export const sfx = new SoundFX();

// ============================================================================
// Tournaments & Seasons Helpers
// ============================================================================

export interface TournamentMetadata {
    id: number;
    name: string;
    description: string;
    targetMarket: string;
    durationHours: number;
    endsAt: number; // Unix timestamp in ms
    payoutDate: string;
    rules: string;
    prizeSplit: { first: number; second: number; third: number };
    createdAt?: number;
    claims?: Record<string, { index: number; account: string; amount: string; proof: string[] }>;
}

export const DEFAULT_TOURNAMENTS_META: Record<number, TournamentMetadata> = {
    1: {
        id: 1,
        name: 'Somnia Genesis Tournament',
        description: 'The inaugural multi-round prediction battle on Somnia Shannon testnet. Compete across active DreamDEX 15m and 1h markets.',
        targetMarket: 'All DreamDEX Binary Markets',
        durationHours: 72,
        endsAt: 1788566400000,
        payoutDate: 'Finalized (Merkle Closed)',
        rules: 'Fixed 10 USDso entry. PnL scored across binary markets. Merkle root committed at close.',
        prizeSplit: { first: 50, second: 30, third: 20 },
        createdAt: 1788480000000,
    },
    2: {
        id: 2,
        name: 'High Stakes Shannon Cup',
        description: 'Elite 50 USDso tournament for top prediction traders. Payout distributed via Merkle tree directly to top performers.',
        targetMarket: 'BTC & ETH 15m / 1h Markets',
        durationHours: 48,
        endsAt: 1788768904000,
        payoutDate: 'Finalized on Shannon (Merkle Closed)',
        rules: '50 USDso entry fee. Real-time on-chain entrant tracking. 100% of the pool paid to winners.',
        prizeSplit: { first: 60, second: 25, third: 15 },
        createdAt: 1788620000000,
        claims: {
            '0xdc21820b742cd82b881ee6e284b9db11bc585669': {
                index: 0,
                account: '0xdc21820b742cd82b881ee6e284b9db11bc585669',
                amount: '60000000',
                proof: ['0xe5d092ff399bd3e2ab046969e5ff5dc36c5544ced55b128c825b76b816d35308'],
            },
            '0xea499cf7c09b224d277b511990a2ef010f18fcbf': {
                index: 1,
                account: '0xea499cf7c09b224d277b511990a2ef010f18fcbf',
                amount: '25000000',
                proof: ['0xcdd95ee420dd8c67508458083782620766a5a4018f844ca893be0a10b8eceec9'],
            },
        },
    },
};

export interface SeasonEntrant {
    member: Address;
    fee: bigint;
    blockNumber: bigint;
    txHash?: string;
    timestamp?: number;
}

export interface LeaderboardEntry {
    rank: number;
    member: Address;
    duelsPlayed: number;
    duelsWon: number;
    winRate: number;
    netPnLUsd: number;
    totalWageredUsd: number;
    estimatedPrizeUsd: number;
}

/** Fetches real on-chain entrants via Blockscout indexed logs without 1000 block RPC limits */
export async function fetchSeasonEntrants(seasonId: bigint): Promise<SeasonEntrant[]> {
    try {
        const url = `https://shannon-explorer.somnia.network/api?module=logs&action=getLogs&address=${WAGR_SEASON}&fromBlock=0&toBlock=latest`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Blockscout logs HTTP ${res.status}`);
        const data = await res.json();
        if (data.status !== '1' || !Array.isArray(data.result)) return [];

        const targetTopic0 = '0x8207f626cd2ac80b69bc22e9a606e3f3d80054d204ea47e6ea306cb017ee7ab8'.toLowerCase();
        const targetSeasonHex = '0x' + seasonId.toString(16).padStart(64, '0').toLowerCase();

        const entrants: SeasonEntrant[] = [];
        const seen = new Set<string>();

        for (const log of data.result) {
            if (!log.topics || log.topics.length < 3) continue;
            const t0 = (log.topics[0] || '').toLowerCase();
            const t1 = (log.topics[1] || '').toLowerCase();
            if (t0 === targetTopic0 && t1 === targetSeasonHex) {
                const member = ('0x' + log.topics[2].slice(26)).toLowerCase() as Address;
                if (!seen.has(member)) {
                    seen.add(member);
                    const fee = BigInt(log.data && log.data !== '0x' ? log.data : '0');
                    entrants.push({
                        member,
                        fee,
                        blockNumber: BigInt(parseInt(log.blockNumber, 16) || 0),
                        txHash: log.transactionHash,
                        timestamp: log.timeStamp ? parseInt(log.timeStamp, 16) * 1000 : undefined,
                    });
                }
            }
        }
        return entrants;
    } catch (err) {
        console.warn('Failed to fetch season entrants from Blockscout:', err);
        return [];
    }
}

/** Computes live tournament performance (duels won, win rate, net PnL) for all entrants */
export async function fetchTournamentLeaderboard(
    entrants: SeasonEntrant[],
    totalPool: bigint,
    prizeSplit?: { first: number; second: number; third: number }
): Promise<LeaderboardEntry[]> {
    if (entrants.length === 0) return [];

    try {
        const nextId = (await publicClient.readContract({
            address: WAGR_ESCROW,
            abi: escrowAbi,
            functionName: 'nextDuelId',
        })) as bigint;

        const count = Number(nextId);
        const duelPromises = [];
        const previewPromises = [];

        for (let i = 1; i < count; i++) {
            duelPromises.push(
                publicClient.readContract({
                    address: WAGR_ESCROW,
                    abi: escrowAbi,
                    functionName: 'getDuel',
                    args: [BigInt(i)],
                })
            );
            previewPromises.push(
                publicClient
                    .readContract({
                        address: WAGR_ESCROW,
                        abi: escrowAbi,
                        functionName: 'previewPayout',
                        args: [BigInt(i)],
                    })
                    .catch(() => null)
            );
        }

        const [duels, previews] = await Promise.all([
            Promise.all(duelPromises),
            Promise.all(previewPromises),
        ]);

        const entrantStats = entrants.map((entrant) => {
            const addrLower = entrant.member.toLowerCase();
            let duelsPlayed = 0;
            let duelsWon = 0;
            let totalWagered = 0n;
            let netPnL = 0n;

            for (let i = 0; i < duels.length; i++) {
                const d = duels[i] as any;
                const prev = previews[i] as any;

                const isAlice = d.alice.toLowerCase() === addrLower;
                const isBob = d.bob && d.bob.toLowerCase() === addrLower;
                if (!isAlice && !isBob) continue;

                duelsPlayed++;
                const stake = isAlice ? BigInt(d.stakeA) : BigInt(d.stakeB);
                totalWagered += stake;

                if (d.settled && prev) {
                    const winner = prev[0] as Address;
                    const payout = BigInt(prev[1] || 0);
                    const voided = Boolean(prev[2]);

                    if (voided) {
                        // Refund: 0 PnL
                    } else if (winner && winner.toLowerCase() === addrLower) {
                        duelsWon++;
                        netPnL += payout - stake;
                    } else {
                        netPnL -= stake;
                    }
                }
            }

            const winRate = duelsPlayed > 0 ? Math.round((duelsWon / duelsPlayed) * 100) : 0;
            const netPnLUsd = Number(netPnL) / 1e6;
            const totalWageredUsd = Number(totalWagered) / 1e6;

            return {
                member: entrant.member,
                duelsPlayed,
                duelsWon,
                winRate,
                netPnLUsd,
                totalWageredUsd,
            };
        });

        // Sort by netPnL descending, then duelsWon, then duelsPlayed
        entrantStats.sort((a, b) => {
            if (b.netPnLUsd !== a.netPnLUsd) return b.netPnLUsd - a.netPnLUsd;
            if (b.duelsWon !== a.duelsWon) return b.duelsWon - a.duelsWon;
            return b.duelsPlayed - a.duelsPlayed;
        });

        const poolNum = Number(totalPool) / 1e6;
        const split = prizeSplit || { first: 60, second: 25, third: 15 };

        return entrantStats.map((item, idx) => {
            const rank = idx + 1;
            let estimatedPrizeUsd = 0;
            if (rank === 1) estimatedPrizeUsd = (poolNum * split.first) / 100;
            else if (rank === 2) estimatedPrizeUsd = (poolNum * split.second) / 100;
            else if (rank === 3) estimatedPrizeUsd = (poolNum * split.third) / 100;

            return {
                rank,
                ...item,
                estimatedPrizeUsd,
            };
        });
    } catch (err) {
        console.warn('Failed to compute tournament leaderboard:', err);
        return [];
    }
}

/** Computes leaf hash identical to WagrSeason.sol: keccak256(bytes.concat(keccak256(abi.encode(index, account, amount)))) */
export function hashTournamentLeaf(index: bigint, account: Address, amount: bigint): `0x${string}` {
    const inner = keccak256(
        encodeAbiParameters(
            [{ type: 'uint256' }, { type: 'address' }, { type: 'uint256' }],
            [index, account, amount]
        )
    );
    return keccak256(inner);
}

/** Builds an OpenZeppelin-compatible Merkle tree and generates proofs for all winners */
export function buildTournamentMerkleTree(winners: { index: number; account: Address; amount: bigint }[]) {
    if (winners.length === 0) {
        return {
            root: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
            claims: {},
        };
    }

    const leaves = winners.map((w) => hashTournamentLeaf(BigInt(w.index), w.account, w.amount));

    if (leaves.length === 1) {
        return {
            root: leaves[0],
            claims: {
                [winners[0].account.toLowerCase()]: {
                    index: winners[0].index,
                    account: winners[0].account,
                    amount: winners[0].amount.toString(),
                    proof: [] as string[],
                },
            },
        };
    }

    function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
        return a.toLowerCase() < b.toLowerCase()
            ? keccak256(concat([a, b]))
            : keccak256(concat([b, a]));
    }

    let currentLevel = [...leaves];
    const treeLevels = [currentLevel];

    while (currentLevel.length > 1) {
        const nextLevel: `0x${string}`[] = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            if (i + 1 < currentLevel.length) {
                nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
            } else {
                nextLevel.push(currentLevel[i]);
            }
        }
        treeLevels.push(nextLevel);
        currentLevel = nextLevel;
    }

    const root = currentLevel[0];
    const claims: Record<string, { index: number; account: string; amount: string; proof: string[] }> = {};

    winners.forEach((w, leafIdx) => {
        const proof: string[] = [];
        let idx = leafIdx;
        for (let l = 0; l < treeLevels.length - 1; l++) {
            const level = treeLevels[l];
            const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
            if (siblingIdx < level.length) {
                proof.push(level[siblingIdx]);
            }
            idx = Math.floor(idx / 2);
        }
        claims[w.account.toLowerCase()] = {
            index: w.index,
            account: w.account,
            amount: w.amount.toString(),
            proof,
        };
    });

    return { root, claims };
}


