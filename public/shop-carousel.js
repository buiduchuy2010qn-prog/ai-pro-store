/**
 * Shop Carousel — 3D infinite horizontal scroll
 * Không sửa logic API / mua hàng. Chỉ transform #products-grid sau khi render.
 */
(function (global) {
    'use strict';

    const SPEED = 0.6;
    const GAP = 24;
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let viewport = null;
    let track = null;
    let setWidth = 0;
    let offset = 0;
    let rafId = 0;
    let running = false;
    let paused = false;
    let dragging = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let built = false;

    function getCards() {
        if (!track) return [];
        return [...track.querySelectorAll('.product-card')];
    }

    function measureSetWidth(cardsPerSet) {
        const cards = getCards();
        if (!cards.length || !cardsPerSet) return 0;
        let w = 0;
        for (let i = 0; i < cardsPerSet; i++) {
            w += cards[i].offsetWidth + GAP;
        }
        return Math.max(w - GAP, 1);
    }

    function update3D() {
        if (!viewport || !track) return;
        const vpRect = viewport.getBoundingClientRect();
        const center = vpRect.left + vpRect.width / 2;
        let closest = null;
        let closestDist = Infinity;

        getCards().forEach((card) => {
            const rect = card.getBoundingClientRect();
            const cardCenter = rect.left + rect.width / 2;
            const norm = (cardCenter - center) / (vpRect.width * 0.45);
            const clamped = Math.max(-1.2, Math.min(1.2, norm));
            const rotateY = clamped * -22;
            const scale = 1 - Math.abs(clamped) * 0.1;
            const translateZ = (1 - Math.abs(clamped)) * 30;

            if (!dragging) {
                card.style.transform =
                    'perspective(900px) rotateY(' + rotateY.toFixed(1) + 'deg) ' +
                    'scale(' + scale.toFixed(3) + ') translateZ(' + translateZ.toFixed(0) + 'px)';
            }

            const dist = Math.abs(cardCenter - center);
            card.classList.toggle('is-center', dist < rect.width * 0.35);
            if (dist < closestDist) {
                closestDist = dist;
                closest = card;
            }
        });
    }

    function applyTransform() {
        if (!track) return;
        track.style.transform = 'translate3d(' + (-offset) + 'px, 0, 0)';
        update3D();
    }

    function normalizeOffset() {
        if (setWidth <= 0) return;
        while (offset >= setWidth * 2) offset -= setWidth;
        while (offset < setWidth) offset += setWidth;
    }

    function tick() {
        if (!running || paused || dragging || reducedMotion) {
            rafId = global.requestAnimationFrame(tick);
            return;
        }
        offset += SPEED;
        normalizeOffset();
        applyTransform();
        rafId = global.requestAnimationFrame(tick);
    }

    function startLoop() {
        if (running) return;
        running = true;
        rafId = global.requestAnimationFrame(tick);
    }

    function stopLoop() {
        running = false;
        if (rafId) global.cancelAnimationFrame(rafId);
    }

    function onDragStart(clientX) {
        if (!built || reducedMotion) return;
        dragging = true;
        paused = true;
        dragStartX = clientX;
        dragStartOffset = offset;
        viewport.classList.add('is-dragging');
    }

    function onDragMove(clientX) {
        if (!dragging) return;
        offset = dragStartOffset - (clientX - dragStartX);
        normalizeOffset();
        applyTransform();
    }

    function onDragEnd() {
        if (!dragging) return;
        dragging = false;
        viewport.classList.remove('is-dragging');
        paused = false;
    }

    function bindDrag() {
        if (!viewport) return;

        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            onDragStart(e.clientX);
        });
        global.addEventListener('mousemove', (e) => onDragMove(e.clientX));
        global.addEventListener('mouseup', onDragEnd);

        viewport.addEventListener('touchstart', (e) => {
            onDragStart(e.touches[0].clientX);
        }, { passive: true });
        viewport.addEventListener('touchmove', (e) => {
            onDragMove(e.touches[0].clientX);
        }, { passive: true });
        viewport.addEventListener('touchend', onDragEnd);

        viewport.addEventListener('mouseenter', () => { paused = true; });
        viewport.addEventListener('mouseleave', () => {
            if (!dragging) paused = false;
        });
    }

    function destroyCarousel() {
        built = false;
        setWidth = 0;
        offset = 0;
        stopLoop();
        if (track) track.style.transform = '';
        getCards().forEach((c) => { c.style.transform = ''; c.classList.remove('is-center'); });
    }

    function buildCarousel() {
        track = document.getElementById('products-grid');
        viewport = document.getElementById('products-carousel-viewport');
        if (!track || !viewport) return;

        const originals = [...track.querySelectorAll(':scope > .product-card')];
        if (originals.length < 1) {
            destroyCarousel();
            return;
        }

        destroyCarousel();

        const fragment = document.createDocumentFragment();
        const sets = originals.length === 1 ? 5 : 3;
        for (let s = 0; s < sets; s++) {
            originals.forEach((card) => {
                const clone = card.cloneNode(true);
                clone.style.animationDelay = '';
                fragment.appendChild(clone);
            });
        }
        track.innerHTML = '';
        track.appendChild(fragment);

        track.classList.add('carousel-track');
        viewport.classList.add('carousel-viewport');

        const cardsPerSet = originals.length;
        global.requestAnimationFrame(() => {
            setWidth = measureSetWidth(cardsPerSet);
            offset = setWidth;
            built = true;
            applyTransform();
            startLoop();
        });
    }

    function onGridChange() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        const hasProducts = grid.querySelector(':scope > .product-card');
        const isLoading = grid.querySelector(':scope > .anim-shimmer');
        const isEmpty = grid.querySelector(':scope > .empty-state');

        if (isEmpty || isLoading || !hasProducts) {
            destroyCarousel();
            grid.classList.remove('carousel-track');
            if (viewport) viewport.classList.remove('carousel-viewport');
            return;
        }

        buildCarousel();
    }

    function initObserver() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;
        new MutationObserver(onGridChange).observe(grid, { childList: true, subtree: false });
        onGridChange();
    }

    function boot() {
        document.body.classList.remove('bright-blue');
        document.body.classList.add('shop-carousel-theme');
        viewport = document.getElementById('products-carousel-viewport');
        bindDrag();
        initObserver();

        global.ShopCarousel = {
            refresh: onGridChange,
            destroy: destroyCarousel,
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);