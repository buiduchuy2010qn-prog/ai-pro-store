/**
 * Dark-Tech — Tilt 3D + GSAP entrance (chỉ .product-card)
 * Không đụng logic shop / API / HTML data.
 */
(function (global) {
    'use strict';

    const TILT_MAX = 10;
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tiltBound = new WeakSet();
    const entranceDone = new WeakSet();

    function runEntrance(card, index) {
        if (entranceDone.has(card)) return;
        entranceDone.add(card);
        card.classList.remove('ai-entrance-pending');

        if (reducedMotion || !global.gsap) {
            card.style.opacity = '1';
            return;
        }

        global.gsap.fromTo(card,
            { opacity: 0, y: 56 },
            {
                opacity: 1,
                y: 0,
                duration: 0.7,
                delay: Math.min(index * 0.08, 0.48),
                ease: 'power3.out',
            }
        );
    }

    function bindTilt(card) {
        if (tiltBound.has(card) || reducedMotion) return;
        tiltBound.add(card);

        let raf = 0;
        const onMove = (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            if (raf) return;
            raf = global.requestAnimationFrame(() => {
                raf = 0;
                const rotY = (x - 0.5) * TILT_MAX * 2;
                const rotX = (0.5 - y) * TILT_MAX * 2;
                card.style.transform =
                    'perspective(800px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' +
                    rotY.toFixed(2) + 'deg) translateZ(6px)';
            });
        };

        const onEnter = () => card.classList.add('ai-tilt-active');
        const onLeave = () => {
            card.classList.remove('ai-tilt-active');
            card.style.transform = '';
        };

        card.addEventListener('mouseenter', onEnter, { passive: true });
        card.addEventListener('mouseleave', onLeave, { passive: true });
        card.addEventListener('mousemove', onMove, { passive: true });
    }

    function enhanceCard(card, index) {
        if (!card.classList.contains('product-card')) return;
        card.classList.add('ai-entrance-pending');
        bindTilt(card);
        runEntrance(card, index);
    }

    function scanGrid(root) {
        const grid = root || document.getElementById('products-grid');
        if (!grid) return;
        grid.querySelectorAll('.product-card').forEach((card, i) => enhanceCard(card, i));
    }

    function initObserver() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        const obs = new MutationObserver(() => scanGrid(grid));
        obs.observe(grid, { childList: true, subtree: true });
    }

    function boot() {
        document.body.classList.add('dark-tech');
        initObserver();
        scanGrid();
        global.AiProductFX = { refresh: () => scanGrid() };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);