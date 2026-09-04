'use client';

import { useState, useEffect, useCallback } from 'react';
import { KnownMarket, getActiveMarkets, fetchLiveDreamDexMarkets } from '@/lib/wagr';

export function useActiveMarkets() {
    const [markets, setMarkets] = useState<KnownMarket[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            // Try fetching from internal API route first (which has server caching)
            const res = await fetch('/api/markets');
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.markets) && data.markets.length > 0) {
                    setMarkets(data.markets);
                    setError(null);
                    setLoading(false);
                    return;
                }
            }
            // Fallback to direct client-side fetch from indexer
            const live = await fetchLiveDreamDexMarkets();
            if (live.length > 0) {
                setMarkets(live);
                setError(null);
            }
        } catch (err: any) {
            console.warn('Error loading live DreamDEX markets:', err);
            setError(err?.message || 'Failed to fetch live markets');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        // Refresh every 12 seconds to catch newly spawned DreamDEX windows
        const interval = setInterval(refresh, 12000);
        return () => clearInterval(interval);
    }, [refresh]);

    return { markets, loading, error, refresh };
}
