/**
 * Shop Carousel — horizontal scroll (an toàn, không infinite loop)
 */
(function (global) {
    'use strict';

    const SPEED = 0.5;
    const GAP = 24;
    const SETS = 2;
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let viewport = null;
    let track = null;
    let gridObserver = null;
    let setWidth = 0;
    let offset = 0;
    let cardStep = 0;
    let rafId = 0;
    let frame = 0;
    let running = false;
    let dragging = false;
    let built = false;
    let isBuilding = false;
    let sourceCount = 0;
    let dragStartX = 0;
    let dragStartOffset = 0;

    function getCards() {
        return track ? [...track.querySelectorAll('.product-card')] : [];
    }

    function measureLayout(count) {
        const cards = getCards();
        if (!cards.length || !count) return;
        let w = 0;
        for (let i = 0; i < count; i++) {
            w += cards[i].offsetWidth + GAP;
        }
        setWidth = Math.max(w - GAP, 1);
        cardStep = cards[0].offsetWidth + GAP;
    }

    /** 3D theo toán học — không gọi getBoundingClientRect mỗi frame */
    function update3D() {
        if (!viewport || !track || !cardStep) return;
        const vpW = viewport.clientWidth;
        const center = vpW / 2;
        const trackPad = 32;

        getCards().forEach((card, i) => {
            const cardCenter = -offset + trackPad + i * cardStep + cardStep * 0.5 - GAP * 0.5;
            const norm = (cardCenter - center) / (vpW * 0.45);
            const clamped = Math.max(-1.2, Math.min(1.2, norm));
            const rotateY = clamped * -18;
            const scale = 1 - Math.abs(clamped) * 0.08;

            if (!dragging) {
                card.style.transform =
                    'perspective(900px) rotateY(' + rotateY.toFixed(1) + 'deg) scale(' + scale.toFixed(3) + ')';
            }
            card.classList.toggle('is-center', Math.abs(clamped) < 0.35);
        });
    }

    function applyTransform() {
        if (!track) return;
        track.style.transform = 'translate3d(' + (-offset) + 'px, 0, 0)';
        frame++;
        if (frame % 2 === 0) update3D();
    }

    function normalizeOffset() {
        if (setWidth <= 0) return;
        while (offset >= setWidth * 2) offset -= setWidth;
        while (offset < setWidth) offset += setWidth;
    }

    function tick() {
        if (!running || reducedMotion || document.hidden) {
            rafId = 0;
            running = false;
            return;
        }
        if (!dragging) {
            offset += SPEED;
            normalizeOffset();
            applyTransform();
        }
        rafId = global.requestAnimationFrame(tick);
    }

    function startLoop() {
        if (running || reducedMotion || !built) return;
        running = true;
        rafId = global.requestAnimationFrame(tick);
    }

    function stopLoop() {
        running = false;
        if (rafId) global.cancelAnimationFrame(rafId);
        rafId = 0;
    }

    function onDragStart(clientX) {
        if (!built || reducedMotion) return;
        dragging = true;
        dragStartX = clientX;
        dragStartOffset = offset;
        viewport.classList.add('is-dragging');
    }

    function onDragMove(clientX) {
        if (!dragging) return;
        offset = dragStartOffset - (clientX - dragStartX);
        normalizeOffset();
        applyTransform();
        update3D();
    }

    function onDragEnd() {
        if (!dragging) return;
        dragging = false;
        viewport.classList.remove('is-dragging');
    }

    function isInteractiveTarget(el) {
        return el && el.closest('button, a, input, [data-buy], .product-card-buy');
    }

    function bindDrag() {
        if (!viewport) return;
        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || isInteractiveTarget(e.target)) return;
            onDragStart(e.clientX);
        });
        viewport.addEventListener('mousemove', (e) => onDragMove(e.clientX));
        viewport.addEventListener('mouseup', onDragEnd);
        viewport.addEventListener('mouseleave', () => { if (dragging) onDragEnd(); });
        viewport.addEventListener('touchstart', (e) => {
            if (isInteractiveTarget(e.target)) return;
            onDragStart(e.touches[0].clientX);
        }, { passive: true });
        viewport.addEventListener('touchmove', (e) => onDragMove(e.touches[0].clientX), { passive: true });
        viewport.addEventListener('touchend', onDragEnd);
    }

    function destroyCarousel() {
        built = false;
        sourceCount = 0;
        setWidth = 0;
        cardStep = 0;
        offset = 0;
        stopLoop();
        if (track) {
            track.style.transform = '';
            track.classList.remove('carousel-track');
        }
        if (viewport) viewport.classList.remove('carousel-viewport');
        getCards().forEach((c) => {
            c.style.transform = '';
            c.classList.remove('is-center');
        });
    }

    function buildCarousel() {
        if (isBuilding) return;

        track = document.getElementById('products-grid');
        viewport = document.getElementById('products-carousel-viewport');
        if (!track || !viewport) return;

        const originals = [...track.querySelectorAll(':scope > .product-card')];
        if (!originals.length) {
            destroyCarousel();
            return;
        }

        isBuilding = true;
        if (gridObserver) gridObserver.disconnect();
        stopLoop();
        destroyCarousel();

        sourceCount = originals.length;
        const fragment = document.createDocumentFragment();
        for (let s = 0; s < SETS; s++) {
            originals.forEach((card) => fragment.appendChild(card.cloneNode(true)));
        }

        track.innerHTML = '';
        track.appendChild(fragment);
        track.classList.add('carousel-track');
        viewport.classList.add('carousel-viewport');

        global.requestAnimationFrame(() => {
            measureLayout(sourceCount);
            offset = setWidth;
            built = true;
            isBuilding = false;
            applyTransform();
            update3D();

            if (gridObserver) {
                gridObserver.observe(track, { childList: true, subtree: false });
            }

            const section = document.getElementById('view-products');
            if (section && !section.classList.contains('hidden')) startLoop();
        });
    }

    function onGridChange() {
        if (isBuilding) return;

        const grid = document.getElementById('products-grid');
        if (!grid) return;

        if (grid.querySelector(':scope > .anim-shimmer') || grid.querySelector(':scope > .empty-state')) {
            if (gridObserver) gridObserver.disconnect();
            destroyCarousel();
            isBuilding = false;
            if (gridObserver) gridObserver.observe(grid, { childList: true, subtree: false });
            return;
        }

        const cards = grid.querySelectorAll(':scope > .product-card');
        if (!cards.length) {
            destroyCarousel();
            return;
        }

        /* Đã build xong — bỏ qua mutation do chính carousel gây ra */
        if (built && grid.classList.contains('carousel-track') && cards.length === sourceCount * SETS) {
            return;
        }

        buildCarousel();
    }

    function initObserver() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        gridObserver = new MutationObserver(onGridChange);
        gridObserver.observe(grid, { childList: true, subtree: false });
        onGridChange();
    }

    function watchVisibility() {
        const section = document.getElementById('view-products');
        if (!section) return;
        new MutationObserver(() => {
            if (section.classList.contains('hidden')) stopLoop();
            else if (built) startLoop();
        }).observe(section, { attributes: true, attributeFilter: ['class'] });
    }

    function boot() {
        document.body.classList.remove('bright-blue');
        document.body.classList.add('shop-carousel-theme');
        viewport = document.getElementById('products-carousel-viewport');
        bindDrag();
        initObserver();
        watchVisibility();

        global.addEventListener('visibilitychange', () => {
            if (document.hidden) stopLoop();
            else if (built) startLoop();
        });

        global.ShopCarousel = { refresh: onGridChange, destroy: destroyCarousel };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);