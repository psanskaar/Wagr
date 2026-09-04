import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                bg: {
                    DEFAULT: '#090A0F',
                    elevated: '#0E1118',
                    card: '#121622',
                },
                surface: {
                    DEFAULT: '#0E1118',
                    hover: '#141824',
                    active: '#1A2030',
                },
                border: {
                    DEFAULT: '#1C2230',
                    subtle: '#141822',
                    glow: '#2E384D',
                },
                brand: {
                    DEFAULT: '#7C5CFF',
                    deep: '#6344E0',
                    light: '#9B82FF',
                    glow: 'rgba(124, 92, 255, 0.15)',
                },
                up: {
                    DEFAULT: '#10B981',
                    light: '#34D399',
                },
                down: {
                    DEFAULT: '#EF4444',
                    light: '#F87171',
                },
                muted: {
                    DEFAULT: '#8A94A6',
                    dark: '#556070',
                },
            },
            fontFamily: {
                sans: [
                    'var(--font-sans)',
                    'Inter',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Segoe UI"',
                    'Roboto',
                    'sans-serif',
                ],
                mono: [
                    'ui-monospace',
                    'SFMono-Regular',
                    'Menlo',
                    'Monaco',
                    'Consolas',
                    'monospace',
                ],
            },
        },
    },
    plugins: [],
};
export default config;
