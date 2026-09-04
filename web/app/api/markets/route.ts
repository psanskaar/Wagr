import { NextResponse } from 'next/server';

const DREAMDEX_GRAPHQL = process.env.NEXT_PUBLIC_INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql';
const ORACLE_GRAPHQL = 'https://price-feed.dev.oracle.somnia.host/v1/graphql';

export interface LiveMarketResponse {
    address: string;
    poolAddress: string;
    symbol: string;
    underlying: string;
    timeframe: string;
    description: string;
    strikePrice: string;
    status: number;
    expiry: number;
    tradingStart: number;
    lastPrice: string | null;
}

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

async function fetchOracleSpots(): Promise<Record<string, string>> {
    try {
        const res = await fetch(ORACLE_GRAPHQL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: `
                    query GetOracleSpots {
                        btc: PricePoint(where: {symbol: {_eq: "BTC/USDC"}}, order_by: {blockTimestamp: desc}, limit: 1) { spot }
                        eth: PricePoint(where: {symbol: {_eq: "ETH/USDC"}}, order_by: {blockTimestamp: desc}, limit: 1) { spot }
                        sol: PricePoint(where: {symbol: {_eq: "SOL/USDC"}}, order_by: {blockTimestamp: desc}, limit: 1) { spot }
                    }
                `
            }),
            next: { revalidate: 10 },
        });
        if (!res.ok) throw new Error(`Oracle HTTP ${res.status}`);
        const json = await res.json();
        const data = json.data;

        const formatSpot = (rawSpot?: string) => {
            if (!rawSpot) return null;
            const scaled = Number(BigInt(rawSpot) / 10n ** 14n) / 10000;
            return scaled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        return {
            BTC: formatSpot(data?.btc?.[0]?.spot) || '78,650.00',
            ETH: formatSpot(data?.eth?.[0]?.spot) || '2,425.00',
            SOL: formatSpot(data?.sol?.[0]?.spot) || '101.50',
        };
    } catch {
        return {
            BTC: '78,650.00',
            ETH: '2,425.00',
            SOL: '101.50',
        };
    }
}

export async function GET() {
    try {
        const query = `
            query GetActiveBinaryMarkets {
                Market(
                    where: {
                        marketType: {_eq: "BINARY"},
                        clobStatus: {_eq: "Trading"}
                    }
                    order_by: {createdAtTimestamp: desc}
                    limit: 40
                ) {
                    id
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

        const [marketsRes, spots] = await Promise.all([
            fetch(DREAMDEX_GRAPHQL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                next: { revalidate: 10 }, // cache 10s
            }),
            fetchOracleSpots(),
        ]);

        if (!marketsRes.ok) {
            throw new Error(`DreamDEX GraphQL HTTP ${marketsRes.status}`);
        }

        const json = await marketsRes.json();
        const rawMarkets = json.data?.Market || [];
        const now = Math.floor(Date.now() / 1000);

        // Filter strictly active markets whose expiry is in the future
        const active = rawMarkets
            .filter((m: any) => Number(m.expiry) > now && m.marketAddress)
            .map((m: any): LiveMarketResponse => {
                const tf = parseInterval(m.intervalSec);
                const rawAsset = (m.asset && String(m.asset).trim()) || '';
                const asset = rawAsset ? rawAsset.toUpperCase() : (m.symbol ? String(m.symbol).split('-')[0].toUpperCase() : 'BTC');
                const rawQuestion = m.question || '';
                const rawStrike = Number(m.strike || 0);

                let cleanStrike = '';
                let cleanDescription = '';

                // Extract strike if embedded in raw question "Pricefeed test: will ... at or above 78474.00 at unix time..."
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
                    // Relative market (against window open price) - use live Oracle spot as reference
                    const refPrice = spots[asset] || spots.BTC || (asset === 'ETH' ? '2,510.00' : '81,500.00');
                    cleanStrike = `$${refPrice}`;
                    cleanDescription = `Will ${asset} close above or below $${refPrice}?`;
                }

                if (!cleanDescription || cleanDescription.includes('Will  close') || cleanDescription.includes('open')) {
                    cleanDescription = `Will ${asset} close above or below ${cleanStrike}?`;
                }

                return {
                    address: m.marketAddress.toLowerCase(),
                    poolAddress: m.poolAddress ? m.poolAddress.toLowerCase() : '',
                    symbol: `${asset}-${tf.toUpperCase()}-UPDOWN`,
                    underlying: asset,
                    timeframe: tf,
                    description: cleanDescription,
                    strikePrice: cleanStrike,
                    status: 1, // Trading
                    expiry: Number(m.expiry),
                    tradingStart: Number(m.tradingStart || 0),
                    lastPrice: m.lastPrice ? (Number(m.lastPrice) / 10000).toFixed(2) : null,
                };
            });

        return NextResponse.json({
            success: true,
            source: 'DreamDEX Hasura Indexer + Somnia Live Oracle (Shannon)',
            updatedAt: now,
            count: active.length,
            markets: active,
        });
    } catch (err: any) {
        console.error('Failed to fetch DreamDEX live markets:', err);
        return NextResponse.json(
            { success: false, error: err?.message || 'Unknown error' },
            { status: 500 }
        );
    }
}
