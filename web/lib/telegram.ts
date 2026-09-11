import {
    isTMA,
    miniAppReady,
    expandViewport,
    hapticFeedbackNotificationOccurred,
    hapticFeedbackImpactOccurred,
    openTelegramLink as sdkOpenTelegramLink,
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

    try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.initData) return tg.initData;

        if (window.location.hash) {
            const hashStr = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : window.location.hash;
            const hashParams = new URLSearchParams(hashStr);
            const tgData = hashParams.get('tgWebAppData');
            if (tgData) return tgData;
        }

        if (window.location.search) {
            const searchParams = new URLSearchParams(window.location.search);
            const tgData = searchParams.get('tgWebAppData');
            if (tgData) return tgData;
        }
    } catch {
        // Ignore parsing errors
    }

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
 * E.g. t.me/WagrDuelBot/app?startapp=duel_123 -> returns "duel_123"
 */
export function getTelegramStartParam(): string | null {
    if (typeof window === 'undefined') return null;

    try {
        const tg = (window as any).Telegram?.WebApp;
        const tgParam = tg?.initDataUnsafe?.start_param;
        if (tgParam) return String(tgParam);

        // Check query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const queryParam =
            urlParams.get('tgWebAppStartParam') ||
            urlParams.get('startapp') ||
            urlParams.get('start_param');
        if (queryParam) return queryParam;

        // Check hash parameters
        if (window.location.hash) {
            const hashStr = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : window.location.hash;
            const hashParams = new URLSearchParams(hashStr);
            const hashParam =
                hashParams.get('tgWebAppStartParam') ||
                hashParams.get('startapp') ||
                hashParams.get('start_param');
            if (hashParam) return hashParam;
        }
    } catch (err) {
        console.warn('Failed to parse Telegram start parameter:', err);
    }

    return null;
}

/**
 * Parses numeric duel ID from a Telegram startapp parameter.
 * Supports "duel_123", "duel-123", or "123".
 */
export function parseDuelIdFromStartParam(startParam: string | null): string | null {
    if (!startParam) return null;
    const match = startParam.match(/^(?:duel[_-]?)?(\d+)$/i);
    return match ? match[1] : null;
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
