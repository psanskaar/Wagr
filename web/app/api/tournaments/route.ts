import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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
    createdAt: number;
    claims?: Record<string, { index: number; account: string; amount: string; proof: string[] }>;
}

const DEFAULT_METADATA: Record<number, TournamentMetadata> = {
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

const DATA_FILE = path.join(process.cwd(), 'tournaments-data.json');

function loadTournaments(): Record<number, TournamentMetadata> {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf-8');
            const data = JSON.parse(raw);
            return { ...DEFAULT_METADATA, ...data };
        }
    } catch (e) {
        console.warn('Failed to read tournaments-data.json, using defaults:', e);
    }
    return { ...DEFAULT_METADATA };
}

function saveTournaments(data: Record<number, TournamentMetadata>) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.warn('Failed to save tournaments-data.json:', e);
    }
}

export async function GET() {
    const data = loadTournaments();
    return NextResponse.json({ success: true, tournaments: data });
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as TournamentMetadata;
        if (!body || !body.id) {
            return NextResponse.json({ success: false, error: 'Invalid tournament payload' }, { status: 400 });
        }

        const current = loadTournaments();
        current[body.id] = {
            ...body,
            createdAt: body.createdAt || Date.now(),
        };
        saveTournaments(current);

        return NextResponse.json({ success: true, tournament: current[body.id] });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
    }
}
