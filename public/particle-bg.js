/**
 * Particle Background — Canvas 2D nhẹ, không chặn click
 */
(function (global) {
    'use strict';

    const COLORS = ['#60a5fa', '#3b82f6', '#8b5cf6', '#c026d3'];
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = global.matchMedia('(max-width: 768px)').matches;

    let canvas, ctx, particles, animId, running = true;
    let w = 0, h = 0;

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function createParticles(count) {
        return Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: rand(1, isMobile ? 1.8 : 2.2),
            vx: rand(-0.2, 0.2),
            vy: rand(-0.3, 0.3),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            alpha: rand(0.2, 0.6),
        }));
    }

    function resize() {
        if (!canvas) return;
        const dpr = Math.min(global.devicePixelRatio || 1, 1.5);
        w = global.innerWidth;
        h = global.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        particles = createParticles(isMobile ? 35 : 60);
    }

    function draw() {
        if (!ctx || !particles) return;
        ctx.clearRect(0, 0, w, h);

        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < -10) p.x = w + 10;
            if (p.x > w + 10) p.x = -10;
            if (p.y < -10) p.y = h + 10;
            if (p.y > h + 10) p.y = -10;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        /* Chỉ nối line trên desktop, giới hạn số lượng */
        if (!isMobile) {
            const maxDist = 100;
            let lines = 0;
            const maxLines = 80;
            outer: for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    if (lines >= maxLines) break outer;
                    const a = particles[i];
                    const b = particles[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < maxDist * maxDist) {
                        const d = Math.sqrt(dist);
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.strokeStyle = 'rgba(96, 165, 250, ' + (0.1 * (1 - d / maxDist)) + ')';
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                        lines++;
                    }
                }
            }
        }
    }

    function loop() {
        if (!running) return;
        draw();
        animId = global.requestAnimationFrame(loop);
    }

    function boot() {
        if (reducedMotion) return;

        canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        canvas.style.pointerEvents = 'none';

        ctx = canvas.getContext('2d', { alpha: true });
        resize();

        global.addEventListener('resize', resize, { passive: true });
        global.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running) loop();
            else global.cancelAnimationFrame(animId);
        });

        loop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);