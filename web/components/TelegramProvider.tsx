'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    isTelegramWebApp,
    expandTelegramViewport,
    getTelegramStartParam,
    parseDuelIdFromStartParam,
} from '@/lib/telegram';

export function TelegramProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const hasHandledDeepLink = useRef(false);

    useEffect(() => {
        // Strictly only execute if running inside Telegram Mini App
        if (!isTelegramWebApp()) return;

        // 1. Expand viewport to fullscreen
        expandTelegramViewport();

        // 2. Read startapp parameter and route directly to duel room
        if (!hasHandledDeepLink.current) {
            const startParam = getTelegramStartParam();
            const duelId = parseDuelIdFromStartParam(startParam);

            if (duelId) {
                hasHandledDeepLink.current = true;
                const targetPath = `/duel/${duelId}`;
                if (pathname !== targetPath) {
                    router.replace(targetPath);
                }
            }
        }
    }, [pathname, router]);

    return <>{children}</>;
}
