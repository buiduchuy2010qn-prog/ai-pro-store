/**
 * Shop Carousel — cuộn ngang thủ công (KHÔNG tự chạy)
 * Chỉ thêm class + hiệu ứng 3D khi scroll/kéo.
 */
(function (global) {
    'use strict';

    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let viewport = null;
    let track = null;
    let gridObserver = null;
    let cardCount = 0;
    let scrollPending = false;

    function update3D() {
        if (!viewport || !track || reducedMotion) return;
        const vpRect = viewport.getBoundingClientRect();
        const center = vpRect.left + vpRect.width / 2;

        track.querySelectorAll('.product-card').forEach((card) => {
            const rect = card.getBoundingClientRect();
            const cardCenter = rect.left + rect.width / 2;
            const norm = (cardCenter - center) / (vpRect.width * 0.45);
            const clamped = Math.max(-1.2, Math.min(1.2, norm));
            const rotateY = clamped * -16;
            const scale = 1 - Math.abs(clamped) * 0.07;
            card.style.transform =
                'perspective(900px) rotateY(' + rotateY.toFixed(1) + 'deg) scale(' + scale.toFixed(3) + ')';
            card.classList.toggle('is-center', Math.abs(clamped) < 0.35);
        });
    }

    function schedule3D() {
        if (scrollPending) return;
        scrollPending = true;
        global.requestAnimationFrame(() => {
            scrollPending = false;
            update3D();
        });
    }

    function clearCarousel() {
        cardCount = 0;
        if (track) {
            track.classList.remove('carousel-track');
            track.querySelectorAll('.product-card').forEach((c) => {
                c.style.transform = '';
                c.classList.remove('is-center');
            });
        }
        if (viewport) viewport.classList.remove('carousel-ready');
    }

    function enhanceGrid() {
        track = document.getElementById('products-grid');
        viewport = document.getElementById('products-carousel-viewport');
        if (!track || !viewport) return;

        const loading = track.querySelector(':scope > .anim-shimmer');
        const empty = track.querySelector(':scope > .empty-state');
        const cards = track.querySelectorAll(':scope > .product-card');

        if (loading || empty || !cards.length) {
            clearCarousel();
            return;
        }

        if (cardCount === cards.length && track.classList.contains('carousel-track')) {
            schedule3D();
            return;
        }

        cardCount = cards.length;
        track.classList.add('carousel-track');
        viewport.classList.add('carousel-ready');
        schedule3D();
    }

    function initObserver() {
        track = document.getElementById('products-grid');
        if (!track) return;
        gridObserver = new MutationObserver(enhanceGrid);
        gridObserver.observe(track, { childList: true, subtree: false });
        enhanceGrid();
    }

    function boot() {
        document.body.classList.remove('bright-blue');
        document.body.classList.add('shop-carousel-theme');

        viewport = document.getElementById('products-carousel-viewport');
        if (viewport) {
            viewport.addEventListener('scroll', schedule3D, { passive: true });
        }
        global.addEventListener('resize', schedule3D, { passive: true });

        initObserver();
        global.ShopCarousel = { refresh: enhanceGrid };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);