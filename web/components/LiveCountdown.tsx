'use client';

import React, { useState, useEffect } from 'react';

interface LiveCountdownProps {
    expiry: number | bigint;
    className?: string;
}

export function LiveCountdown({ expiry, className = 'font-mono font-medium text-cyan-400' }: LiveCountdownProps) {
    const expirySec = Number(expiry);

    const calcTime = () => {
        const now = Math.floor(Date.now() / 1000);
        const diff = expirySec - now;
        if (diff <= 0) return '00:00 (Settling…)';

        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        if (hours > 0) {
            return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
        }
        return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    };

    const [formatted, setFormatted] = useState<string>(calcTime);

    useEffect(() => {
        // Initial sync
        setFormatted(calcTime());

        // Update strictly every 1000ms
        const interval = setInterval(() => {
            setFormatted(calcTime());
        }, 1000);

        return () => clearInterval(interval);
    }, [expirySec]);

    return <span className={className}>{formatted}</span>;
}
