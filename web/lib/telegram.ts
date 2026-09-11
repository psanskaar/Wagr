import {
    isTMA,
    miniAppReady,
    expandViewport,
    hapticFeedbackNotificationOccurred,
    hapticFeedbackImpactOccurred,
    openTelegramLink as sdkOpenTelegramLink,
    retrieveRawInitData,
} from '@telegram-apps/sdk-react';

export const TELEGRAM_BOT_USERNAME = 'WagrDuelBot';

/**
 * Checks if the current environment is inside a Telegram Mini App.
 * Returns false during SSR or in standard browsers.
 */
export function isTelegramWebApp(): boolean {
    if (typeof window === 'undefined') return false;

    // 1. Check SDK detection
    try {
        if (isTMA()) return true;
    } catch {
        // Fall back to direct DOM / global checks
    }

    // 2. Check window.Telegram.WebApp object
    const tg = (window as any).Telegram?.WebApp;
    if (tg && (tg.initData || tg.initDataUnsafe?.query_id || tg.initDataUnsafe?.user)) {
        return true;
    }

    // 3. Check launch parameters in location hash or search query
    try {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        if (
            hash.includes('tgWebAppData') ||
            search.includes('tgWebAppData') ||
            hash.includes('tgWebAppPlatform') ||
            search.includes('tgWebAppPlatform')
        ) {
            return true;
        }
    } catch {
        // Ignore URL access errors
    }

    // 4. Check Telegram WebView proxy bridge
    if (typeof (window as any).TelegramWebviewProxy !== 'undefined') {
        return true;
    }

    return false;
}

/**
 * Retrieves the raw signed initData string passed by Telegram for HMAC verification.
 */
export function getTelegramInitDataString(): string {
    if (typeof window === 'undefined') return '';

    // 1. Check window.Telegram.WebApp.initData (populated by telegram-web-app.js)
    try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.initData) {
            try {
                sessionStorage.setItem('wagr_tg_init_data', tg.initData);
            } catch {}
            return tg.initData;
        }
    } catch {}

    // 2. Check official SDK retrieval
    try {
        const raw = retrieveRawInitData();
        if (raw) {
            try {
                sessionStorage.setItem('wagr_tg_init_data', raw);
            } catch {}
            return raw;
        }
    } catch {}

    // 3. Check sessionStorage cache
    try {
        const cached = sessionStorage.getItem('wagr_tg_init_data');
        if (cached) return cached;
    } catch {}

    // 4. Check URL hash (preserving and parsing direct initData or tgWebAppData)
    try {
        if (window.location.hash) {
            const hashStr = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : window.location.hash;

            // Direct initData in hash
            if (hashStr.includes('hash=') && (hashStr.includes('user=') || hashStr.includes('query_id='))) {
                const hashParams = new URLSearchParams(hashStr);
                const tgData = hashParams.get('tgWebAppData');
                const result = tgData || hashStr;
                try {
                    sessionStorage.setItem('wagr_tg_init_data', result);
                } catch {}
                return result;
            }

            const hashParams = new URLSearchParams(hashStr);
            const tgData = hashParams.get('tgWebAppData');
            if (tgData) {
                try {
                    sessionStorage.setItem('wagr_tg_init_data', tgData);
                } catch {}
                return tgData;
            }
        }
    } catch {}

    // 5. Check URL search query
    try {
        if (window.location.search) {
            const searchParams = new URLSearchParams(window.location.search);
            const tgData = searchParams.get('tgWebAppData');
            if (tgData) {
                try {
                    sessionStorage.setItem('wagr_tg_init_data', tgData);
                } catch {}
                return tgData;
            }
        }
    } catch {}

    return '';
}

/**
 * Expands Telegram viewport to fullscreen and signals ready state.
 */
export function expandTelegramViewport(): void {
    if (typeof window === 'undefined') return;

    try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.ready?.();
            tg.expand?.();
        }
    } catch (err) {
        console.warn('Failed to expand Telegram WebApp:', err);
    }

    try {
        miniAppReady();
        expandViewport();
    } catch {
        // Ignored if SDK components are not mounted
    }
}

/**
 * Retrieves the startapp deep link parameter passed by Telegram.
 * E.g. t.me/WagrDuelBot/app?startapp=duel_16 -> returns "duel_16"
 * Supports Telegram Web, Mobile, Desktop, and direct URL query/hash parameters.
 */
export function getTelegramStartParam(): string | null {
    if (typeof window === 'undefined') return null;

    try {
        const tg = (window as any).Telegram?.WebApp;

        // 1. Check window.Telegram.WebApp.initDataUnsafe.start_param
        const tgParam = tg?.initDataUnsafe?.start_param;
        if (tgParam) {
            const p = String(tgParam).trim();
            if (p) {
                try { sessionStorage.setItem('wagr_tg_start_param', p); } catch {}
                return p;
            }
        }

        // 2. Check window.Telegram.WebApp.initData string directly
        if (tg?.initData) {
            try {
                const initDataParams = new URLSearchParams(tg.initData);
                const p = initDataParams.get('start_param') || initDataParams.get('startapp');
                if (p) {
                    const clean = p.trim();
                    try { sessionStorage.setItem('wagr_tg_start_param', clean); } catch {}
                    return clean;
                }
            } catch {}
        }

        // 3. Check query parameters (both top-level and nested in tgWebAppData)
        if (window.location.search) {
            const urlParams = new URLSearchParams(window.location.search);
            const queryParam =
                urlParams.get('tgWebAppStartParam') ||
                urlParams.get('startapp') ||
                urlParams.get('start_param');
            if (queryParam) {
                const clean = queryParam.trim();
                try { sessionStorage.setItem('wagr_tg_start_param', clean); } catch {}
                return clean;
            }

            const urlWebAppData = urlParams.get('tgWebAppData');
            if (urlWebAppData) {
                try {
                    const innerParams = new URLSearchParams(urlWebAppData);
                    const p = innerParams.get('start_param') || innerParams.get('startapp') || innerParams.get('tgWebAppStartParam');
                    if (p) {
                        const clean = p.trim();
                        try { sessionStorage.setItem('wagr_tg_start_param', clean); } catch {}
                        return clean;
                    }
                } catch {}
            }
        }

        // 4. Check hash parameters (both top-level and nested in tgWebAppData for Telegram Web)
        if (window.location.hash) {
            const hashStr = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : window.location.hash;
            const hashParams = new URLSearchParams(hashStr);
            const hashParam =
                hashParams.get('tgWebAppStartParam') ||
                hashParams.get('startapp') ||
                hashParams.get('start_param');
            if (hashParam) {
                const clean = hashParam.trim();
                try { sessionStorage.setItem('wagr_tg_start_param', clean); } catch {}
                return clean;
            }

            // Telegram Web encodes all parameters inside tgWebAppData in the URL hash
            const hashWebAppData = hashParams.get('tgWebAppData');
            if (hashWebAppData) {
                try {
                    const innerHashParams = new URLSearchParams(hashWebAppData);
                    const p = innerHashParams.get('start_param') || innerHashParams.get('startapp') || innerHashParams.get('tgWebAppStartParam');
                    if (p) {
                        const clean = p.trim();
                        try { sessionStorage.setItem('wagr_tg_start_param', clean); } catch {}
                        return clean;
                    }
                } catch {}
            }
        }

        // 5. Check sessionStorage (cached by telegram-web-app.js as initParams)
        try {
            const cachedParam = sessionStorage.getItem('wagr_tg_start_param');
            if (cachedParam) return cachedParam;

            const rawInitParams = sessionStorage.getItem('initParams');
            if (rawInitParams) {
                const parsed = JSON.parse(rawInitParams);
                if (parsed?.tgWebAppStartParam) return String(parsed.tgWebAppStartParam).trim();
                if (parsed?.start_param) return String(parsed.start_param).trim();
                if (parsed?.startapp) return String(parsed.startapp).trim();
                if (parsed?.tgWebAppData) {
                    const inner = new URLSearchParams(parsed.tgWebAppData);
                    const p = inner.get('start_param') || inner.get('startapp') || inner.get('tgWebAppStartParam');
                    if (p) return p.trim();
                }
            }
        } catch {}
    } catch (err) {
        console.warn('Failed to parse Telegram start parameter:', err);
    }

    return null;
}

/**
 * Parses numeric duel ID from a Telegram startapp parameter.
 * Supports "duel_16", "duel-16", "duel16", or "16".
 */
export function parseDuelIdFromStartParam(startParam: string | null): string | null {
    if (!startParam) return null;
    const clean = startParam.trim();
    const match = clean.match(/^(?:duel[_-]?)?(\d+)$/i);
    if (match) return match[1];
    const fallbackMatch = clean.match(/(?:duel[_-]?)(\d+)/i);
    return fallbackMatch ? fallbackMatch[1] : null;
}

/**
 * Generates the Telegram deep link for a specific duel.
 * Format: t.me/WagrDuelBot/app?startapp=duel_[ID]
 */
export function getTelegramDuelDeepLink(duelId: number | string | bigint): string {
    return `https://t.me/${TELEGRAM_BOT_USERNAME}/app?startapp=duel_${duelId.toString()}`;
}

/**
 * Opens native Telegram chat picker to share the duel link.
 */
export function shareTelegramDuel(duelId: number | string | bigint, customText?: string): void {
    if (typeof window === 'undefined') return;

    const deepLink = getTelegramDuelDeepLink(duelId);
    const text = customText || `Join my Wagr prediction duel #${duelId.toString()}!`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;

    try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(shareUrl);
            return;
        }
    } catch (err) {
        console.warn('Telegram openTelegramLink failed:', err);
    }

    try {
        sdkOpenTelegramLink(shareUrl);
        return;
    } catch {
        // Fallback to window.open
    }

    window.open(shareUrl, '_blank');
}

/**
 * Triggers native Telegram haptic feedback.
 */
export function telegramHaptic(type: 'success' | 'error' | 'warning' | 'impact'): void {
    if (typeof window === 'undefined') return;

    try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.HapticFeedback) {
            if (type === 'success' || type === 'error' || type === 'warning') {
                tg.HapticFeedback.notificationOccurred(type);
                return;
            } else if (type === 'impact') {
                tg.HapticFeedback.impactOccurred('medium');
                return;
            }
        }
    } catch (err) {
        console.warn('Telegram WebApp HapticFeedback failed:', err);
    }

    try {
        if (type === 'success' || type === 'error' || type === 'warning') {
            hapticFeedbackNotificationOccurred(type);
        } else if (type === 'impact') {
            hapticFeedbackImpactOccurred('medium');
        }
    } catch {
        // Ignored
    }
}
