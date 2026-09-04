'use client';

import React, { useEffect, useRef } from 'react';

export function Confetti({ active }: { active: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!active) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#7C5CFF', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'];
        const particles: Array<{
            x: number;
            y: number;
            vx: number;
            vy: number;
            color: string;
            size: number;
            rotation: number;
            vRot: number;
            life: number;
        }> = [];

        for (let i = 0; i < 90; i++) {
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 3,
                vx: (Math.random() - 0.5) * 14,
                vy: (Math.random() - 0.7) * 16,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 8 + 4,
                rotation: Math.random() * 360,
                vRot: (Math.random() - 0.5) * 10,
                life: 1,
            });
        }

        let animationFrameId: number;
        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = false;

            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.35; // gravity
                p.vx *= 0.98;
                p.rotation += p.vRot;
                p.life -= 0.012;

                if (p.life > 0) {
                    alive = true;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = Math.max(0, p.life);
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    ctx.restore();
                }
            });

            if (alive) {
                animationFrameId = requestAnimationFrame(render);
            }
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [active]);

    if (!active) return null;

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none fixed inset-0 z-50 h-full w-full"
        />
    );
}
