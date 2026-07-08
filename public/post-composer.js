/**
 * post-composer.js — Đăng bài kiểu Locket Dio
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'shop_user_posts';
    const MAX_CAPTION = 500;
    const MAX_IMAGE_MB = 2;
    const MAX_VIDEO_MB = 4;

    const STUDIO_SECTIONS = [
        {
            id: 'general',
            title: 'General',
            isNew: true,
            pills: [
                { id: 'text', label: 'Aa Văn bản', cls: 'pill-gray', icon: 'fa-font' },
                { id: 'color', label: 'Màu sắc', cls: 'pill-purple', icon: 'fa-palette' },
                { id: 'spotify', label: 'Spotify', cls: 'pill-green', icon: 'fa-spotify' },
                { id: 'music', label: 'Apple Music', cls: 'pill-pink', icon: 'fa-apple' },
                { id: 'weather', label: '31°C', cls: 'pill-blue', icon: 'fa-cloud-sun' },
                { id: 'review', label: 'Review', cls: 'pill-yellow', icon: 'fa-star' },
                { id: 'time', label: '', cls: 'pill-gray', icon: 'fa-clock', dynamic: 'time' },
                { id: 'streak', label: '🔥 1', cls: 'pill-orange' },
                { id: 'poll', label: 'Bình chọn', cls: 'pill-purple' },
                { id: 'location', label: 'Vị trí', cls: 'pill-teal', icon: 'fa-location-dot' },
            ],
        },
        {
            id: 'caption-season',
            title: 'Caption Season',
            isNew: true,
            pills: [
                { id: 'cap1', label: 'GEM AI', cls: 'pill-brown' },
                { id: 'cap2', label: 'GPT PRO', cls: 'pill-green' },
                { id: 'cap3', label: 'CLAUDE', cls: 'pill-orange' },
                { id: 'cap4', label: 'GROK', cls: 'pill-red' },
                { id: 'cap5', label: 'SALE 50%', cls: 'pill-pink' },
                { id: 'cap6', label: 'VIP', cls: 'pill-indigo' },
            ],
        },
        {
            id: 'suggest',
            title: 'Suggest Caption',
            pills: [
                { id: 's1', label: 'Caption', cls: 'pill-purple', caption: 'Trải nghiệm AI tuyệt vời ✨' },
                { id: 's2', label: 'Caption', cls: 'pill-orange', caption: 'Mua tài khoản chính hãng 🚀' },
                { id: 's3', label: 'Caption', cls: 'pill-red', caption: 'Khuyến mãi hôm nay 🔥' },
                { id: 's4', label: 'Caption', cls: 'pill-teal', caption: 'Gemini · ChatGPT · Claude' },
                { id: 's5', label: 'Caption', cls: 'pill-pink', caption: 'Shop Đức Hi — uy tín 💯' },
                { id: 's6', label: 'Caption', cls: 'pill-blue', caption: 'Nạp nhanh VietQR ⚡' },
            ],
        },
        {
            id: 'decorative',
            title: 'Decorative by Locket',
            pills: [
                { id: 'd1', label: 'PRIDE', cls: 'pill-purple' },
                { id: 'd2', label: 'Good morning ☀️', cls: 'pill-orange' },
                { id: 'd3', label: 'Goodnight 🌙', cls: 'pill-indigo' },
                { id: 'd4', label: 'Miss you', cls: 'pill-red' },
                { id: 'd5', label: 'Party Time!', cls: 'pill-green' },
                { id: 'd6', label: 'OOTD', cls: 'pill-pink' },
                { id: 'd7', label: 'Gemini 💎', cls: 'pill-blue' },
                { id: 'd8', label: 'ChatGPT 🤖', cls: 'pill-teal' },
            ],
        },
    ];

    let state = {
        caption: '',
        mediaFile: null,
        mediaPreviewUrl: null,
        mediaType: null,
        cameraStream: null,
        visibility: 'all',
        selectedFriendIds: new Set(),
        studioPills: new Set(),
        studioMeta: {},
        friends: [],
    };

    function $(id) { return document.getElementById(id); }

    function escapeHtml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getPosts() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (_) {
            return [];
        }
    }

    function savePosts(posts) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    }

    function formatTime(iso) {
        if (typeof window.formatDateTimeVN === 'function') return window.formatDateTimeVN(iso);
        return new Date(iso).toLocaleString('vi-VN');
    }

    function currentClock() {
        return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    function buildShell() {
        if ($('locket-post-overlay')) return;

        const studioSections = STUDIO_SECTIONS.map(sec => {
            const pills = sec.pills.map(p => {
                const label = p.dynamic === 'time' ? currentClock() : p.label;
                let iconHtml = '';
                if (p.icon === 'fa-spotify') iconHtml = '<i class="fab fa-spotify mr-1"></i>';
                else if (p.icon === 'fa-apple') iconHtml = '<i class="fab fa-apple mr-1"></i>';
                else if (p.icon) iconHtml = `<i class="fas ${p.icon} mr-1"></i>`;
                return `<button type="button" class="locket-studio-pill ${p.cls}" data-studio-pill="${p.id}" data-caption="${escapeHtml(p.caption || '')}">${iconHtml}${escapeHtml(label)}</button>`;
            }).join('');
            return `<section class="locket-studio-section" data-section="${sec.id}">
                <div class="locket-studio-section-head">
                    <span class="locket-studio-section-title">${sec.title}</span>
                    ${sec.isNew ? '<span class="locket-studio-new">New</span>' : ''}
                </div>
                <div class="locket-studio-pills">${pills}</div>
            </section>`;
        }).join('');

        document.body.insertAdjacentHTML('beforeend', `
<div id="locket-post-overlay" class="locket-post-overlay" aria-hidden="true">
    <div class="locket-compose">
        <header class="locket-header">
            <span class="locket-header-title" id="locket-send-to-label">Gửi đến...</span>
            <button type="button" class="locket-header-btn" id="locket-history-btn" title="Bài đã đăng"><i class="fas fa-clock-rotate-left"></i></button>
        </header>
        <div class="locket-preview-wrap">
            <div class="locket-preview" id="locket-preview">
                <video id="locket-preview-video" class="locket-preview-media" autoplay playsinline muted></video>
                <img id="locket-preview-img" class="locket-preview-media" alt="">
                <div id="locket-preview-placeholder" class="locket-preview-placeholder">
                    <i class="fas fa-camera"></i>
                    <span>Chạm để chụp / chọn ảnh</span>
                </div>
                <button type="button" id="locket-camera-btn" class="locket-preview-camera-btn" title="Bật camera"><i class="fas fa-camera"></i></button>
                <div id="locket-deco-overlay" class="locket-deco-overlay"></div>
                <div class="locket-caption-pill">
                    <input type="text" id="locket-caption" class="locket-caption-input" maxlength="${MAX_CAPTION}" placeholder="Nhập tin nhắn..." autocomplete="off">
                </div>
            </div>
        </div>
        <div class="locket-actions">
            <button type="button" class="locket-action-x" id="locket-close" aria-label="Đóng"><i class="fas fa-times"></i></button>
            <button type="button" class="locket-action-send" id="locket-send" aria-label="Gửi"><i class="fas fa-paper-plane"></i></button>
            <button type="button" class="locket-action-fx" id="locket-studio-open" aria-label="Tuỳ chỉnh"><i class="fas fa-wand-magic-sparkles"></i></button>
        </div>
        <div class="locket-recipients">
            <div class="locket-recipients-scroll" id="locket-recipients-scroll"></div>
        </div>
    </div>
    <input type="file" id="locket-media-input" accept="image/*,video/*" class="hidden">
</div>
<div id="locket-studio-backdrop" class="locket-studio-backdrop" aria-hidden="true"></div>
<aside id="locket-studio" class="locket-studio" aria-hidden="true">
    <div class="locket-studio-header">
        <div class="locket-studio-logo"><i class="fas fa-wand-magic-sparkles"></i></div>
        <span class="locket-studio-title">CUSTOMIZE STUDIO</span>
        <span class="locket-studio-badge">Free</span>
        <button type="button" class="locket-studio-close" id="locket-studio-close">&times;</button>
    </div>
    <div class="locket-studio-body">${studioSections}</div>
</aside>
<div id="locket-history-sheet" class="locket-history-sheet" aria-hidden="true">
    <div class="locket-history-panel">
        <div class="locket-history-head">
            <h3><i class="fas fa-list mr-1"></i> Bài đã đăng</h3>
            <button type="button" class="locket-studio-close" id="locket-history-close">&times;</button>
        </div>
        <div id="locket-history-list" class="locket-history-list"></div>
    </div>
</div>`);

        bindEvents();
    }

    function stopCamera() {
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(t => t.stop());
            state.cameraStream = null;
        }
        const vid = $('locket-preview-video');
        if (vid) {
            vid.pause();
            vid.srcObject = null;
            vid.classList.remove('is-visible');
        }
    }

    function clearMedia() {
        stopCamera();
        if (state.mediaPreviewUrl && state.mediaType !== 'camera') {
            URL.revokeObjectURL(state.mediaPreviewUrl);
        }
        state.mediaFile = null;
        state.mediaPreviewUrl = null;
        state.mediaType = null;
        $('locket-preview-img')?.classList.remove('is-visible');
        $('locket-preview-video')?.classList.remove('is-visible');
        $('locket-preview-placeholder')?.classList.remove('is-hidden');
        const input = $('locket-media-input');
        if (input) input.value = '';
    }

    function showMediaPreview(type) {
        $('locket-preview-placeholder')?.classList.add('is-hidden');
        if (type === 'image') {
            $('locket-preview-img')?.classList.add('is-visible');
        } else {
            $('locket-preview-video')?.classList.add('is-visible');
        }
    }

    async function startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            $('locket-media-input')?.click();
            return;
        }
        try {
            clearMedia();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false,
            });
            state.cameraStream = stream;
            state.mediaType = 'camera';
            const vid = $('locket-preview-video');
            if (vid) {
                vid.srcObject = stream;
                vid.muted = true;
                await vid.play();
                showMediaPreview('video');
            }
        } catch (_) {
            $('locket-media-input')?.click();
        }
    }

    function setMediaFile(file) {
        if (!file) return;
        const isImg = file.type.startsWith('image/');
        const isVid = file.type.startsWith('video/');
        if (!isImg && !isVid) {
            window.toast?.('Chỉ hỗ trợ ảnh hoặc video', true);
            return;
        }
        const max = isImg ? MAX_IMAGE_MB : MAX_VIDEO_MB;
        if (file.size > max * 1024 * 1024) {
            window.toast?.(`File tối đa ${max}MB`, true);
            return;
        }
        clearMedia();
        state.mediaFile = file;
        state.mediaType = isImg ? 'image' : 'video';
        state.mediaPreviewUrl = URL.createObjectURL(file);
        if (isImg) {
            const img = $('locket-preview-img');
            if (img) img.src = state.mediaPreviewUrl;
            showMediaPreview('image');
        } else {
            const vid = $('locket-preview-video');
            if (vid) {
                vid.srcObject = null;
                vid.src = state.mediaPreviewUrl;
                vid.controls = true;
                vid.muted = false;
            }
            showMediaPreview('video');
        }
    }

    async function captureCameraFrame() {
        const vid = $('locket-preview-video');
        if (!vid?.videoWidth) return null;
        const canvas = document.createElement('canvas');
        canvas.width = vid.videoWidth;
        canvas.height = vid.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(vid, 0, 0);
        return new Promise(resolve => {
            canvas.toBlob(b => resolve(b), 'image/jpeg', 0.82);
        });
    }

    async function readFileAsDataUrl(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(new Error('Lỗi đọc file'));
            r.readAsDataURL(file);
        });
    }

    async function compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const maxW = 800;
                let w = img.width, h = img.height;
                if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/jpeg', 0.78));
            };
            img.onerror = () => reject(new Error('Ảnh lỗi'));
            img.src = url;
        });
    }

    function renderRecipients() {
        const scroll = $('locket-recipients-scroll');
        if (!scroll) return;

        const items = [
            { id: 'private', type: 'visibility', label: 'Riêng tư', icon: 'fa-lock', selected: state.visibility === 'private' },
            { id: 'all', type: 'visibility', label: 'Tất cả', icon: 'fa-user-group', selected: state.visibility === 'all' },
        ];

        state.friends.forEach(f => {
            const id = f.id || f.userId;
            items.push({
                id: String(id),
                type: 'friend',
                label: (f.fullName || f.name || f.email || 'Bạn').split(' ')[0],
                avatar: f.avatarUrl,
                selected: state.visibility === 'selected' && state.selectedFriendIds.has(id),
            });
        });

        scroll.innerHTML = items.map(item => {
            const avatar = item.avatar
                ? `<img src="${escapeHtml(item.avatar)}" alt="">`
                : `<i class="fas ${item.icon || 'fa-user'}"></i>`;
            return `<button type="button" class="locket-recipient${item.selected ? ' is-selected' : ''}" data-recipient-type="${item.type}" data-recipient-id="${escapeHtml(item.id)}">
                <div class="locket-recipient-ring"><div class="locket-recipient-avatar">${avatar}</div></div>
                <span class="locket-recipient-name">${escapeHtml(item.label)}</span>
            </button>`;
        }).join('');

        updateSendToLabel();
    }

    function updateSendToLabel() {
        const el = $('locket-send-to-label');
        if (!el) return;
        if (state.visibility === 'private') el.textContent = 'Gửi riêng tư';
        else if (state.visibility === 'all') el.textContent = 'Gửi đến tất cả';
        else if (state.selectedFriendIds.size === 1) {
            const f = state.friends.find(x => (x.id || x.userId) === [...state.selectedFriendIds][0]);
            el.textContent = 'Gửi đến ' + (f?.fullName || f?.name || 'bạn bè');
        } else if (state.selectedFriendIds.size > 1) {
            el.textContent = `Gửi đến ${state.selectedFriendIds.size} người`;
        } else el.textContent = 'Gửi đến...';
    }

    async function loadFriends() {
        state.friends = [];
        try {
            if (typeof window.api === 'function') {
                const data = await window.api('/social/friends');
                state.friends = (data.friends || []).map(item => ({
                    id: item.user?.id,
                    fullName: item.user?.fullName,
                    name: item.user?.fullName,
                    email: item.user?.email,
                })).filter(f => f.id);
            }
        } catch (_) { /* no friends API */ }
        renderRecipients();
    }

    function renderDecoOverlay() {
        const box = $('locket-deco-overlay');
        if (!box) return;
        const chips = [];
        state.studioPills.forEach(pid => {
            STUDIO_SECTIONS.forEach(sec => {
                const p = sec.pills.find(x => x.id === pid);
                if (p) {
                    const label = p.dynamic === 'time' ? currentClock() : (p.label || p.caption || pid);
                    chips.push(`<span class="locket-deco-chip ${p.cls}">${escapeHtml(label)}</span>`);
                }
            });
        });
        box.innerHTML = chips.join('');
    }

    function openStudio() {
        $('locket-studio-backdrop')?.classList.add('is-open');
        $('locket-studio')?.classList.add('is-open');
        $('locket-studio')?.setAttribute('aria-hidden', 'false');
        const timePill = document.querySelector('[data-studio-pill][data-studio-pill="time"], [data-studio-pill="time"]');
        if (timePill) timePill.textContent = '';
        document.querySelectorAll('[data-studio-pill="time"]').forEach(el => {
            el.innerHTML = `<i class="fas fa-clock mr-1"></i>${currentClock()}`;
        });
    }

    function closeStudio() {
        $('locket-studio-backdrop')?.classList.remove('is-open');
        $('locket-studio')?.classList.remove('is-open');
        $('locket-studio')?.setAttribute('aria-hidden', 'true');
    }

    function renderHistory() {
        const list = $('locket-history-list');
        if (!list) return;
        const posts = getPosts();
        if (!posts.length) {
            list.innerHTML = '<div class="locket-history-empty">Chưa có bài nào</div>';
            return;
        }
        list.innerHTML = posts.map(p => {
            const vis = p.visibility === 'private' ? 'Riêng tư' : p.visibility === 'all' ? 'Tất cả' : 'Bạn chọn';
            return `<div class="locket-history-card">
                <p>${escapeHtml(p.caption || '(Không có chữ)')}</p>
                <div class="locket-history-meta">${escapeHtml(formatTime(p.createdAt))} · ${vis}${p.decorations?.length ? ' · ' + p.decorations.length + ' sticker' : ''}</div>
            </div>`;
        }).join('');
    }

    function openHistory() {
        renderHistory();
        $('locket-history-sheet')?.classList.add('is-open');
        $('locket-history-sheet')?.setAttribute('aria-hidden', 'false');
    }

    function closeHistory() {
        $('locket-history-sheet')?.classList.remove('is-open');
        $('locket-history-sheet')?.setAttribute('aria-hidden', 'true');
    }

    async function submitPost() {
        const caption = ($('locket-caption')?.value || '').trim();
        const hasMedia = state.mediaFile || state.mediaType === 'camera';
        if (!caption && !hasMedia) {
            window.toast?.('Thêm ảnh hoặc nhập tin nhắn', true);
            return;
        }

        const btn = $('locket-send');
        if (btn) btn.disabled = true;

        try {
            let mediaData = null;
            let mediaMime = null;
            let finalType = state.mediaType;

            if (state.mediaType === 'camera') {
                const blob = await captureCameraFrame();
                if (blob) {
                    mediaData = await readFileAsDataUrl(blob);
                    mediaMime = 'image/jpeg';
                    finalType = 'image';
                }
            } else if (state.mediaFile) {
                if (state.mediaType === 'image') {
                    mediaData = await compressImage(state.mediaFile);
                    mediaMime = 'image/jpeg';
                } else {
                    mediaData = await readFileAsDataUrl(state.mediaFile);
                    mediaMime = state.mediaFile.type;
                }
            }

            const user = window.currentUser;
            const post = {
                id: 'lp_' + Date.now(),
                caption,
                mediaType: finalType,
                mediaData,
                mediaMime,
                visibility: state.visibility,
                audienceIds: state.visibility === 'selected' ? [...state.selectedFriendIds] : [],
                decorations: [...state.studioPills],
                authorName: user?.fullName || user?.email || 'Bạn',
                createdAt: new Date().toISOString(),
            };

            const posts = getPosts();
            posts.unshift(post);
            savePosts(posts);

            window.toast?.('Đã gửi bài thành công! ✨');
            resetComposer();
            close();
        } catch (err) {
            window.toast?.(err.message || 'Không gửi được', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function resetComposer() {
        $('locket-caption').value = '';
        state.caption = '';
        state.visibility = 'all';
        state.selectedFriendIds.clear();
        state.studioPills.clear();
        state.studioMeta = {};
        document.querySelectorAll('.locket-studio-pill.is-selected').forEach(p => p.classList.remove('is-selected'));
        clearMedia();
        renderDecoOverlay();
        renderRecipients();
    }

    function open() {
        if (!window.currentUser) {
            window.toast?.('Đăng nhập để đăng bài', true);
            return;
        }
        buildShell();
        resetComposer();
        loadFriends();
        const overlay = $('locket-post-overlay');
        overlay?.classList.add('is-open');
        overlay?.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => startCamera().catch(() => {}), 300);
    }

    function close() {
        closeStudio();
        closeHistory();
        clearMedia();
        $('locket-post-overlay')?.classList.remove('is-open');
        $('locket-post-overlay')?.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function bindEvents() {
        $('locket-close')?.addEventListener('click', close);
        $('locket-send')?.addEventListener('click', submitPost);
        $('locket-studio-open')?.addEventListener('click', openStudio);
        $('locket-studio-close')?.addEventListener('click', closeStudio);
        $('locket-studio-backdrop')?.addEventListener('click', closeStudio);
        $('locket-history-btn')?.addEventListener('click', openHistory);
        $('locket-history-close')?.addEventListener('click', closeHistory);
        $('locket-history-sheet')?.addEventListener('click', e => {
            if (e.target.id === 'locket-history-sheet') closeHistory();
        });

        $('locket-preview-placeholder')?.addEventListener('click', () => $('locket-media-input')?.click());
        $('locket-camera-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            startCamera();
        });
        $('locket-media-input')?.addEventListener('change', e => {
            const f = e.target.files?.[0];
            if (f) setMediaFile(f);
        });

        $('locket-recipients-scroll')?.addEventListener('click', e => {
            const btn = e.target.closest('.locket-recipient');
            if (!btn) return;
            const type = btn.dataset.recipientType;
            const id = btn.dataset.recipientId;

            if (type === 'visibility') {
                state.visibility = id;
                state.selectedFriendIds.clear();
            } else if (type === 'friend') {
                const fid = Number(id);
                state.visibility = 'selected';
                if (state.selectedFriendIds.has(fid)) state.selectedFriendIds.delete(fid);
                else state.selectedFriendIds.add(fid);
                if (!state.selectedFriendIds.size) state.visibility = 'all';
            }
            renderRecipients();
        });

        document.querySelectorAll('[data-studio-pill]').forEach(pill => {
            pill.addEventListener('click', () => {
                const id = pill.dataset.studioPill;
                const caption = pill.dataset.caption;
                if (caption) {
                    const input = $('locket-caption');
                    if (input) input.value = caption;
                }
                if (state.studioPills.has(id)) {
                    state.studioPills.delete(id);
                    pill.classList.remove('is-selected');
                } else {
                    state.studioPills.add(id);
                    pill.classList.add('is-selected');
                }
                renderDecoOverlay();
            });
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if ($('locket-studio')?.classList.contains('is-open')) closeStudio();
                else if ($('locket-history-sheet')?.classList.contains('is-open')) closeHistory();
                else if ($('locket-post-overlay')?.classList.contains('is-open')) close();
            }
        });
    }

    function init() {
        buildShell();
        $('nav-post-composer-btn')?.addEventListener('click', open);
        $('nav-post-composer-btn-mobile')?.addEventListener('click', open);
    }

    window.PostComposer = { open, close, getPosts };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();