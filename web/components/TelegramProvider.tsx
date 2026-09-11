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
        // Expand viewport if in Telegram
        if (isTelegramWebApp()) {
            expandTelegramViewport();
        }

        // Read startapp parameter and route directly to duel room
        const checkAndRoute = () => {
            if (hasHandledDeepLink.current) return;
            const startParam = getTelegramStartParam();
            const duelId = parseDuelIdFromStartParam(startParam);

            if (duelId) {
                const targetPath = `/duel/${duelId}`;
                if (pathname !== targetPath) {
                    hasHandledDeepLink.current = true;
                    try {
                        router.replace(targetPath);
                    } catch {
                        window.location.replace(targetPath);
                    }
                } else {
                    hasHandledDeepLink.current = true;
                }
            }
        };

        checkAndRoute();
        const intervalId = setInterval(checkAndRoute, 150);
        const timeoutId = setTimeout(() => clearInterval(intervalId), 3000);

        window.addEventListener('hashchange', checkAndRoute);
        window.addEventListener('focus', checkAndRoute);

        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            window.removeEventListener('hashchange', checkAndRoute);
            window.removeEventListener('focus', checkAndRoute);
        };
    }, [pathname, router]);

    return <>{children}</>;
}
