/**
 * Particle Background — Canvas 2D nhẹ (không Three.js)
 * #particle-canvas: pointer-events none, z-index -1
 */
(function (global) {
    'use strict';

    const COLORS = ['#60a5fa', '#3b82f6', '#8b5cf6', '#c026d3', '#818cf8'];
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = global.matchMedia('(max-width: 768px)').matches;

    let canvas, ctx, particles, animId, running = true;
    let w = 0, h = 0;
    let mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function createParticles(count) {
        return Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: rand(1, isMobile ? 2.2 : 2.8),
            vx: rand(-0.25, 0.25),
            vy: rand(-0.35, 0.35),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            alpha: rand(0.25, 0.75),
            pulse: rand(0, Math.PI * 2),
        }));
    }

    function resize() {
        if (!canvas) return;
        const dpr = Math.min(global.devicePixelRatio || 1, 2);
        w = global.innerWidth;
        h = global.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!particles) {
            particles = createParticles(isMobile ? 55 : 110);
        }
    }

    function draw() {
        if (!ctx || !particles) return;

        ctx.clearRect(0, 0, w, h);
        mouse.tx += (mouse.x - mouse.tx) * 0.04;
        mouse.ty += (mouse.y - mouse.ty) * 0.04;
        const parX = mouse.tx * 18;
        const parY = mouse.ty * 12;

        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += 0.02;

            if (p.x < -10) p.x = w + 10;
            if (p.x > w + 10) p.x = -10;
            if (p.y < -10) p.y = h + 10;
            if (p.y > h + 10) p.y = -10;

            const a = p.alpha * (0.75 + Math.sin(p.pulse) * 0.25);
            const px = p.x + parX * (p.r * 0.15);
            const py = p.y + parY * (p.r * 0.15);

            ctx.beginPath();
            ctx.arc(px, py, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = a;
            ctx.fill();
        });

        ctx.globalAlpha = 1;

        /* Nối hạt gần nhau — hiệu ứng mạng nhẹ */
        const maxDist = isMobile ? 90 : 120;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i];
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < maxDist) {
                    ctx.beginPath();
                    ctx.moveTo(a.x + parX * 0.1, a.y + parY * 0.1);
                    ctx.lineTo(b.x + parX * 0.1, b.y + parY * 0.1);
                    ctx.strokeStyle = 'rgba(96, 165, 250, ' + (0.12 * (1 - dist / maxDist)) + ')';
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
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

        ctx = canvas.getContext('2d', { alpha: true });
        resize();

        global.addEventListener('resize', resize, { passive: true });
        global.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / w - 0.5) * 2;
            mouse.y = (e.clientY / h - 0.5) * 2;
        }, { passive: true });

        global.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running) loop();
            else global.cancelAnimationFrame(animId);
        });

        loop();

        global.ParticleBG = {
            destroy: () => {
                running = false;
                global.cancelAnimationFrame(animId);
            },
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);