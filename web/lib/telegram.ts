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
 * Checks if a start parameter or duel ID has already been fulfilled in the current session.
 */
export function isStartParamConsumed(paramOrDuelId: string | null): boolean {
    if (!paramOrDuelId || typeof window === 'undefined') return false;
    try {
        const clean = paramOrDuelId.trim();
        const duelId = parseDuelIdFromStartParam(clean);
        if (sessionStorage.getItem(`wagr_consumed_${clean}`) === 'true') return true;
        if (duelId && sessionStorage.getItem(`wagr_consumed_${duelId}`) === 'true') return true;
    } catch {}
    return false;
}

/**
 * Marks a start parameter or duel ID as consumed and strips the hash to prevent
 * infinite redirect loops when navigating back to the homepage.
 */
export function markTelegramStartParamConsumed(paramOrDuelId?: string | null): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem('wagr_tg_start_param');
        let target = paramOrDuelId;
        if (!target) {
            const tg = (window as any).Telegram?.WebApp;
            target = tg?.initDataUnsafe?.start_param;
        }
        if (target) {
            const clean = target.trim();
            sessionStorage.setItem(`wagr_consumed_${clean}`, 'true');
            const duelId = parseDuelIdFromStartParam(clean);
            if (duelId) {
                sessionStorage.setItem(`wagr_consumed_${duelId}`, 'true');
                sessionStorage.setItem(`wagr_consumed_duel_${duelId}`, 'true');
            }
        }
        // Remove hash from window location without refreshing so tgWebAppData is not re-read
        if (
            window.location.hash &&
            (window.location.hash.includes('start_param') ||
                window.location.hash.includes('startapp') ||
                window.location.hash.includes('tgWebAppData'))
        ) {
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState(null, '', cleanUrl);
        }
    } catch {}
}

/**
 * Retrieves the startapp deep link parameter passed by Telegram.
 * E.g. t.me/WagrDuelBot/app?startapp=duel_16 -> returns "duel_16"
 * Supports Telegram Web, Mobile, Desktop, and direct URL query/hash parameters.
 * Automatically ignores parameters that have already been consumed in this session.
 */
export function getTelegramStartParam(): string | null {
    if (typeof window === 'undefined') return null;

    const validate = (candidate: string | null | undefined): string | null => {
        if (!candidate) return null;
        const clean = candidate.trim();
        if (!clean) return null;
        if (isStartParamConsumed(clean)) return null;
        return clean;
    };

    try {
        const tg = (window as any).Telegram?.WebApp;

        // 1. Check window.Telegram.WebApp.initDataUnsafe.start_param
        const tgParam = validate(tg?.initDataUnsafe?.start_param);
        if (tgParam) return tgParam;

        // 2. Check window.Telegram.WebApp.initData string directly
        if (tg?.initData) {
            try {
                const initDataParams = new URLSearchParams(tg.initData);
                const p = validate(initDataParams.get('start_param') || initDataParams.get('startapp'));
                if (p) return p;
            } catch {}
        }

        // 3. Check query parameters (both top-level and nested in tgWebAppData)
        if (window.location.search) {
            const urlParams = new URLSearchParams(window.location.search);
            const queryParam = validate(
                urlParams.get('tgWebAppStartParam') ||
                urlParams.get('startapp') ||
                urlParams.get('start_param')
            );
            if (queryParam) return queryParam;

            const urlWebAppData = urlParams.get('tgWebAppData');
            if (urlWebAppData) {
                try {
                    const innerParams = new URLSearchParams(urlWebAppData);
                    const p = validate(
                        innerParams.get('start_param') ||
                        innerParams.get('startapp') ||
                        innerParams.get('tgWebAppStartParam')
                    );
                    if (p) return p;
                } catch {}
            }
        }

        // 4. Check hash parameters (both top-level and nested in tgWebAppData for Telegram Web)
        if (window.location.hash) {
            const hashStr = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : window.location.hash;
            const hashParams = new URLSearchParams(hashStr);
            const hashParam = validate(
                hashParams.get('tgWebAppStartParam') ||
                hashParams.get('startapp') ||
                hashParams.get('start_param')
            );
            if (hashParam) return hashParam;

            // Telegram Web encodes all parameters inside tgWebAppData in the URL hash
            const hashWebAppData = hashParams.get('tgWebAppData');
            if (hashWebAppData) {
                try {
                    const innerHashParams = new URLSearchParams(hashWebAppData);
                    let p = validate(
                        innerHashParams.get('start_param') ||
                        innerHashParams.get('startapp') ||
                        innerHashParams.get('tgWebAppStartParam')
                    );
                    if (!p) {
                        try {
                            const decodedInner = new URLSearchParams(decodeURIComponent(hashWebAppData));
                            p = validate(
                                decodedInner.get('start_param') ||
                                decodedInner.get('startapp') ||
                                decodedInner.get('tgWebAppStartParam')
                            );
                        } catch {}
                    }
                    if (p) return p;
                } catch {}
            }
        }

        // 5. Fallback: Direct regex search across search, hash, and referrer (handles single & double URL encoding)
        const sourcesToScan = [
            window.location.hash,
            window.location.search,
            typeof document !== 'undefined' ? document.referrer : '',
        ];

        for (const src of sourcesToScan) {
            if (!src) continue;
            try {
                let m = src.match(/(?:start_param|startapp|tgWebAppStartParam)=([^&;]+)/i);
                if (!m) {
                    m = decodeURIComponent(src).match(/(?:start_param|startapp|tgWebAppStartParam)=([^&;]+)/i);
                }
                if (!m) {
                    try {
                        m = decodeURIComponent(decodeURIComponent(src)).match(/(?:start_param|startapp|tgWebAppStartParam)=([^&;]+)/i);
                    } catch {}
                }
                if (m && m[1]) {
                    const clean = validate(decodeURIComponent(m[1]));
                    if (clean) return clean;
                }
            } catch {}
        }

        // 6. Check sessionStorage (cached by telegram-web-app.js as initParams)
        try {
            const rawInitParams = sessionStorage.getItem('initParams');
            if (rawInitParams) {
                const parsed = JSON.parse(rawInitParams);
                const sp = validate(parsed?.tgWebAppStartParam || parsed?.start_param || parsed?.startapp);
                if (sp) return sp;
                if (parsed?.tgWebAppData) {
                    const inner = new URLSearchParams(parsed.tgWebAppData);
                    const p = validate(inner.get('start_param') || inner.get('startapp') || inner.get('tgWebAppStartParam'));
                    if (p) return p;
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
