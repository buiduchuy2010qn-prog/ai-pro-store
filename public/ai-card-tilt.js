/**
 * Bright Blue UI Polish — tilt 3D + entrance + view transitions
 * Chỉ lớp phủ UI, không đụng logic shop.
 */
(function (global) {
    'use strict';

    const TILT_MAX = 9;
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tiltBound = new WeakSet();
    const tagged = new WeakSet();

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
                    'perspective(820px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' +
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

    function tagCard(card, index) {
        if (!card.classList.contains('product-card') || tagged.has(card)) return;
        tagged.add(card);

        card.classList.add('ai-card');
        if (!reducedMotion) {
            card.classList.add('bb-enter');
            card.style.animationDelay = Math.min(index * 0.07, 0.42) + 's';
        }

        const logo = card.querySelector('.product-card-visual > i, .product-card-visual > img');
        if (logo) logo.classList.add('ai-logo');

        bindTilt(card);
    }

    function scanGrid() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        grid.querySelectorAll('.product-card').forEach((card, i) => tagCard(card, i));
    }

    function initViewTransitions() {
        const app = document.getElementById('app');
        if (!app) return;

        const sections = app.querySelectorAll('section[id^="view-"]');
        const trigger = (sec) => {
            if (sec.classList.contains('hidden')) return;
            sec.classList.remove('bb-view-active');
            void sec.offsetWidth;
            sec.classList.add('bb-view-active');
        };

        sections.forEach((sec) => {
            trigger(sec);
            new MutationObserver(() => trigger(sec)).observe(sec, {
                attributes: true,
                attributeFilter: ['class'],
            });
        });
    }

    function boot() {
        document.body.classList.add('bright-blue');

        const grid = document.getElementById('products-grid');
        if (grid) {
            new MutationObserver(scanGrid).observe(grid, { childList: true, subtree: true });
        }

        scanGrid();
        initViewTransitions();

        global.BrightBlueFX = {
            refresh: scanGrid,
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);