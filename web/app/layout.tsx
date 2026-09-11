import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { Providers } from '@/components/Providers';

const inter = Inter({
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-sans',
});

export const metadata: Metadata = {
    metadataBase: new URL(
        process.env.NEXT_PUBLIC_APP_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://wagr-app.vercel.app')
    ),
    title: 'WAGR: Peer-to-Peer Prediction Layer on DreamDEX & Somnia',
    description:
        'Shareable 1-v-1 prediction duels and creator widgets built on DreamDEX Event Contracts. Zero-click auto-settlement powered by Somnia Reactivity.',
    keywords: [
        'Somnia',
        'DreamDEX',
        'Event Contracts',
        'Prediction Markets',
        'DeFi',
        'Reactivity',
        'Web3 Gaming',
        'P2P Duels',
    ],
    openGraph: {
        title: 'WAGR: Peer-to-Peer Prediction Layer on DreamDEX & Somnia',
        description:
            'Turn any DreamDEX event contract into a shareable duel. Zero clicks to pay out with Somnia Reactivity.',
        type: 'website',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`dark ${inter.variable}`}>
            <head>
                <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
            </head>
            <body className="bg-bg text-slate-100 font-sans antialiased selection:bg-brand/30 selection:text-white">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
