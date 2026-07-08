/**
 * Particle Background — theo code user, bọc an toàn
 */
(function (global) {
    'use strict';

    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = global.matchMedia('(max-width: 768px)').matches;
    const COUNT = isMobile ? 70 : 150;
    const colors = ['#60a5fa', '#a5b4fc', '#c4b5fd', '#e0e7ff'];

    let canvas, ctx, particles = [], animId = 0, running = false;

    function resizeCanvas() {
        if (!canvas || !ctx) return;
        const dpr = Math.min(global.devicePixelRatio || 1, 1.5);
        canvas.width = global.innerWidth * dpr;
        canvas.height = global.innerHeight * dpr;
        canvas.style.width = global.innerWidth + 'px';
        canvas.style.height = global.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function Particle() {
        const w = global.innerWidth;
        const h = global.innerHeight;
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.size = Math.random() * 3 + 1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    Particle.prototype.update = function () {
        const w = global.innerWidth;
        const h = global.innerHeight;
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > w) this.speedX *= -1;
        if (this.y < 0 || this.y > h) this.speedY *= -1;
    };

    Particle.prototype.draw = function () {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    };

    function initParticles() {
        particles = [];
        for (let i = 0; i < COUNT; i++) {
            particles.push(new Particle());
        }
    }

    function animateParticles() {
        if (!running || !ctx || !canvas) return;
        const w = global.innerWidth;
        const h = global.innerHeight;
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
        }
        animId = global.requestAnimationFrame(animateParticles);
    }

    function boot() {
        if (reducedMotion) return;

        canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        canvas.style.pointerEvents = 'none';
        ctx = canvas.getContext('2d', { alpha: true });

        resizeCanvas();
        initParticles();
        running = true;
        animateParticles();

        global.addEventListener('resize', () => {
            resizeCanvas();
            initParticles();
        }, { passive: true });

        global.addEventListener('visibilitychange', () => {
            running = !document.hidden;
            if (running) animateParticles();
            else global.cancelAnimationFrame(animId);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);