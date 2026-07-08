/**
 * Particle Background — cực nhẹ, 20fps, không line nối
 */
(function (global) {
    'use strict';

    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = global.matchMedia('(max-width: 768px)').matches;
    const COUNT = isMobile ? 20 : 35;
    const COLORS = ['#60a5fa', '#8b5cf6', '#3b82f6'];

    let canvas, ctx, particles, running = false;
    let w = 0, h = 0;
    let lastTime = 0;
    const INTERVAL = 50;

    function createParticles() {
        return Array.from({ length: COUNT }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 1 + Math.random() * 1.5,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            a: 0.2 + Math.random() * 0.4,
        }));
    }

    function resize() {
        if (!canvas) return;
        w = global.innerWidth;
        h = global.innerHeight;
        const dpr = Math.min(global.devicePixelRatio || 1, 1.25);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        particles = createParticles();
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;
            ctx.globalAlpha = p.a;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function loop(now) {
        if (!running) return;
        if (now - lastTime >= INTERVAL) {
            lastTime = now;
            draw();
        }
        global.requestAnimationFrame(loop);
    }

    function boot() {
        if (reducedMotion) return;
        canvas = document.getElementById('particle-canvas');
        if (!canvas) return;
        canvas.style.pointerEvents = 'none';
        ctx = canvas.getContext('2d', { alpha: true });
        resize();
        running = true;
        global.requestAnimationFrame(loop);
        global.addEventListener('resize', resize, { passive: true });
        global.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running) global.requestAnimationFrame(loop);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);