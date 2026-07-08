/**
 * Bright & Trust Blue — 3D Tilt cho .ai-card (Vanilla JS, cực nhẹ)
 * Gắn class .ai-card / .ai-logo lên DOM có sẵn, không sửa logic shop.
 */
(function (global) {
    'use strict';

    const TILT_MAX = 9;
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const enhanced = new WeakSet();

    function bindTilt(card) {
        if (enhanced.has(card) || reducedMotion) return;
        enhanced.add(card);

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
                    rotY.toFixed(2) + 'deg) translateZ(5px)';
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

    function tagCard(card) {
        if (!card.classList.contains('product-card')) return;
        card.classList.add('ai-card');

        const logo = card.querySelector('.product-card-visual > i, .product-card-visual > img');
        if (logo) logo.classList.add('ai-logo');

        bindTilt(card);
    }

    function scanGrid() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        grid.querySelectorAll('.product-card').forEach(tagCard);
    }

    function boot() {
        document.body.classList.add('bright-blue');
        const grid = document.getElementById('products-grid');
        if (grid) {
            new MutationObserver(scanGrid).observe(grid, { childList: true, subtree: true });
        }
        scanGrid();
        global.BrightBlueFX = { refresh: scanGrid };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);