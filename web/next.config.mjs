/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            '@x402/core/client': false,
            '@x402/svm/exact/client': false,
            '@x402/evm': false,
            '@react-native-async-storage/async-storage': false,
            '@farcaster/mini-app-solana': false,
            fs: false,
            net: false,
            tls: false,
        };
        config.resolve.alias = {
            ...config.resolve.alias,
            '@farcaster/mini-app-solana': false,
        };
        config.externals.push('pino-pretty', 'lokijs', 'encoding');
        return config;
    },
    async headers() {
        return [
            {
                // Widget iframe must be embeddable anywhere.
                source: '/widget/:path*',
                headers: [
                    { key: 'X-Frame-Options', value: 'ALLOWALL' },
                    { key: 'Content-Security-Policy', value: "frame-ancestors *;" },
                ],
            },
        ];
    },
};
export default nextConfig;
