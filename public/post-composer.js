/**
 * post-composer.js — Đăng bài (Post Composer) độc lập
 * Lưu bài viết vào localStorage, hiển thị feed lịch sử
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'shop_user_posts';
    const MAX_CHARS = 2000;
    const MAX_IMAGE_MB = 2;
    const MAX_VIDEO_MB = 4;

    const TAGS = [
        { id: 'gemini', label: 'Gemini', icon: 'fa-wand-magic-sparkles' },
        { id: 'chatgpt', label: 'ChatGPT', icon: 'fa-robot' },
        { id: 'claude', label: 'Claude', icon: 'fa-brain' },
        { id: 'grok', label: 'Grok', icon: 'fa-bolt' },
        { id: 'promo', label: 'Khuyến mãi', icon: 'fa-tags' },
        { id: 'news', label: 'Tin tức', icon: 'fa-newspaper' },
        { id: 'qa', label: 'Hỏi đáp', icon: 'fa-circle-question' },
    ];

    const EMOJIS = ['😀', '😂', '❤️', '🔥', '👍', '🎉', '✨', '💯', '🚀', '💡', '📸', '🎬', '💬', '⭐', '🙏', '😍'];

    let state = {
        tags: new Set(),
        mediaFile: null,
        mediaPreviewUrl: null,
        mediaType: null,
        activeTab: 'compose',
    };

    function $(id) { return document.getElementById(id); }

    function getPosts() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (_) {
            return [];
        }
    }

    function savePosts(posts) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
        } catch (err) {
            window.toast?.('Không lưu được — bộ nhớ đầy, thử xóa bài cũ', true);
            throw err;
        }
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderContent(text) {
        let html = escapeHtml(text);
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        return html;
    }

    function formatTime(iso) {
        if (typeof window.formatDateTimeVN === 'function') return window.formatDateTimeVN(iso);
        const d = new Date(iso);
        return d.toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    function wrapSelection(textarea, before, after) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        const selected = val.slice(start, end);
        const wrapped = before + (selected || 'văn bản') + after;
        textarea.value = val.slice(0, start) + wrapped + val.slice(end);
        const pos = start + before.length + (selected || 'văn bản').length + after.length;
        textarea.focus();
        textarea.setSelectionRange(pos, pos);
        updateCharCount();
    }

    function updateCharCount() {
        const ta = $('post-compose-text');
        const counter = $('post-char-count');
        if (!ta || !counter) return;
        const len = ta.value.length;
        counter.textContent = `${len} / ${MAX_CHARS}`;
        counter.classList.toggle('is-warn', len > MAX_CHARS * 0.9 && len <= MAX_CHARS);
        counter.classList.toggle('is-over', len > MAX_CHARS);
    }

    function buildModal() {
        if ($('post-composer-overlay')) return;

        const tagChips = TAGS.map(t =>
            `<button type="button" class="post-tag-chip" data-tag="${t.id}"><i class="fas ${t.icon} mr-1"></i>${t.label}</button>`
        ).join('');

        const emojiBtns = EMOJIS.map(e =>
            `<button type="button" class="post-emoji-btn" data-emoji="${e}">${e}</button>`
        ).join('');

        const html = `
<div id="post-composer-overlay" class="post-composer-overlay" aria-hidden="true">
    <div class="post-composer-modal" role="dialog" aria-labelledby="post-composer-title" aria-modal="true">
        <div class="post-composer-header">
            <h2 id="post-composer-title" class="post-composer-title"><i class="fas fa-pen-to-square mr-1"></i> Đăng bài</h2>
            <button type="button" id="post-composer-close" class="post-composer-close" aria-label="Đóng">&times;</button>
        </div>
        <div class="post-composer-tabs">
            <button type="button" class="post-composer-tab is-active" data-pc-tab="compose"><i class="fas fa-edit mr-1"></i>Soạn bài</button>
            <button type="button" class="post-composer-tab" data-pc-tab="feed"><i class="fas fa-list mr-1"></i>Bài đã đăng <span id="post-feed-count"></span></button>
        </div>
        <div class="post-composer-body">
            <div id="post-panel-compose" class="post-composer-panel is-active">
                <div class="post-compose-toolbar" style="position:relative">
                    <button type="button" class="post-format-btn" data-format="bold" title="In đậm"><i class="fas fa-bold"></i></button>
                    <button type="button" class="post-format-btn" data-format="italic" title="In nghiêng"><i class="fas fa-italic"></i></button>
                    <button type="button" class="post-emoji-trigger" id="post-emoji-trigger" title="Emoji"><i class="far fa-smile"></i></button>
                    <div id="post-emoji-popover" class="post-emoji-popover">${emojiBtns}</div>
                </div>
                <textarea id="post-compose-text" class="post-compose-textarea" maxlength="${MAX_CHARS}" placeholder="Chia sẻ trải nghiệm AI, mẹo dùng Gemini/ChatGPT, khuyến mãi..."></textarea>
                <div id="post-char-count" class="post-char-count">0 / ${MAX_CHARS}</div>
                <input type="file" id="post-media-input" accept="image/*,video/*" class="hidden">
                <div id="post-media-zone" class="post-media-zone" tabindex="0" role="button" aria-label="Thêm ảnh hoặc video">
                    <i class="fas fa-image"></i>
                    <p>Thêm ảnh hoặc video — kéo thả hoặc bấm để chọn</p>
                </div>
                <div id="post-media-preview" class="post-media-preview">
                    <button type="button" id="post-media-remove" class="post-media-remove" aria-label="Xóa media"><i class="fas fa-times"></i></button>
                    <div id="post-media-preview-inner"></div>
                </div>
                <div class="post-tags-section">
                    <div class="post-tags-label"><i class="fas fa-hashtag"></i> Chủ đề / Tag</div>
                    <div class="post-tags-list">${tagChips}</div>
                </div>
            </div>
            <div id="post-panel-feed" class="post-composer-panel">
                <div id="post-feed-list" class="post-feed-list"></div>
            </div>
        </div>
        <div id="post-compose-footer" class="post-compose-footer">
            <button type="button" id="post-submit-btn" class="post-submit-btn">
                <i class="fas fa-paper-plane"></i> Đăng bài
            </button>
        </div>
    </div>
</div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        bindEvents();
    }

    function setTab(tab) {
        state.activeTab = tab;
        document.querySelectorAll('.post-composer-tab').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.pcTab === tab);
        });
        $('post-panel-compose')?.classList.toggle('is-active', tab === 'compose');
        $('post-panel-feed')?.classList.toggle('is-active', tab === 'feed');
        $('post-compose-footer')?.classList.toggle('hidden', tab !== 'compose');
        if (tab === 'feed') renderFeed();
    }

    function clearMedia() {
        if (state.mediaPreviewUrl) URL.revokeObjectURL(state.mediaPreviewUrl);
        state.mediaFile = null;
        state.mediaPreviewUrl = null;
        state.mediaType = null;
        const preview = $('post-media-preview');
        const inner = $('post-media-preview-inner');
        if (inner) inner.innerHTML = '';
        preview?.classList.remove('is-visible');
        const input = $('post-media-input');
        if (input) input.value = '';
    }

    function setMedia(file) {
        if (!file) return;
        const isImg = file.type.startsWith('image/');
        const isVid = file.type.startsWith('video/');
        if (!isImg && !isVid) {
            window.toast?.('Chỉ hỗ trợ ảnh hoặc video', true);
            return;
        }
        const maxMb = isImg ? MAX_IMAGE_MB : MAX_VIDEO_MB;
        if (file.size > maxMb * 1024 * 1024) {
            window.toast?.(`File quá lớn — tối đa ${maxMb}MB`, true);
            return;
        }
        clearMedia();
        state.mediaFile = file;
        state.mediaType = isImg ? 'image' : 'video';
        state.mediaPreviewUrl = URL.createObjectURL(file);
        const inner = $('post-media-preview-inner');
        if (inner) {
            inner.innerHTML = isImg
                ? `<img src="${state.mediaPreviewUrl}" alt="Preview">`
                : `<video src="${state.mediaPreviewUrl}" controls playsinline></video>`;
        }
        $('post-media-preview')?.classList.add('is-visible');
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Không đọc được file'));
            reader.readAsDataURL(file);
        });
    }

    async function compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const maxW = 960;
                let w = img.width;
                let h = img.height;
                if (w > maxW) {
                    h = Math.round(h * maxW / w);
                    w = maxW;
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.78));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ảnh lỗi')); };
            img.src = url;
        });
    }

    async function resetCompose() {
        const ta = $('post-compose-text');
        if (ta) ta.value = '';
        state.tags.clear();
        document.querySelectorAll('.post-tag-chip').forEach(c => c.classList.remove('is-selected'));
        clearMedia();
        updateCharCount();
    }

    async function submitPost() {
        const text = ($('post-compose-text')?.value || '').trim();
        if (!text && !state.mediaFile) {
            window.toast?.('Nhập nội dung hoặc thêm ảnh/video', true);
            return;
        }
        if (text.length > MAX_CHARS) {
            window.toast?.(`Nội dung tối đa ${MAX_CHARS} ký tự`, true);
            return;
        }

        const btn = $('post-submit-btn');
        if (btn) btn.disabled = true;

        try {
            let mediaData = null;
            let mediaMime = null;
            if (state.mediaFile) {
                if (state.mediaType === 'image') {
                    mediaData = await compressImage(state.mediaFile);
                    mediaMime = 'image/jpeg';
                } else {
                    mediaData = await readFileAsDataUrl(state.mediaFile);
                    mediaMime = state.mediaFile.type || 'video/mp4';
                }
            }

            const user = window.currentUser;
            const post = {
                id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                content: text,
                tags: [...state.tags],
                mediaType: state.mediaType,
                mediaData,
                mediaMime,
                authorName: user?.fullName || user?.name || user?.email || 'Bạn',
                authorId: user?.id || null,
                createdAt: new Date().toISOString(),
            };

            const posts = getPosts();
            posts.unshift(post);
            savePosts(posts);

            await resetCompose();
            updateFeedCount();
            window.toast?.('Đã đăng bài thành công!');
            setTab('feed');
        } catch (err) {
            window.toast?.(err.message || 'Không đăng được bài', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function deletePost(id) {
        if (!confirm('Xóa bài viết này?')) return;
        const posts = getPosts().filter(p => p.id !== id);
        savePosts(posts);
        renderFeed();
        updateFeedCount();
        window.toast?.('Đã xóa bài viết');
    }

    function renderFeed() {
        const list = $('post-feed-list');
        if (!list) return;
        const posts = getPosts();
        if (!posts.length) {
            list.innerHTML = `<div class="post-feed-empty"><i class="fas fa-inbox"></i><p>Chưa có bài nào — hãy soạn và đăng bài đầu tiên!</p></div>`;
            return;
        }
        list.innerHTML = posts.map(p => {
            const tagLabels = (p.tags || []).map(tid => {
                const t = TAGS.find(x => x.id === tid);
                return t ? `<span class="post-feed-tag">${escapeHtml(t.label)}</span>` : '';
            }).join('');
            const mediaHtml = p.mediaData
                ? `<div class="post-feed-media">${p.mediaType === 'video'
                    ? `<video src="${p.mediaData}" controls playsinline></video>`
                    : `<img src="${p.mediaData}" alt="Ảnh bài đăng">`}</div>`
                : '';
            return `<article class="post-feed-card" data-post-id="${p.id}">
                <div class="post-feed-card-header">
                    <span class="post-feed-author"><i class="fas fa-user-circle mr-1"></i>${escapeHtml(p.authorName)}</span>
                    <span class="post-feed-time">${escapeHtml(formatTime(p.createdAt))}</span>
                </div>
                ${tagLabels ? `<div class="post-feed-tags">${tagLabels}</div>` : ''}
                ${p.content ? `<div class="post-feed-content">${renderContent(p.content)}</div>` : ''}
                ${mediaHtml}
                <div class="post-feed-actions">
                    <button type="button" class="post-feed-delete" data-delete-post="${p.id}"><i class="fas fa-trash-alt mr-1"></i>Xóa</button>
                </div>
            </article>`;
        }).join('');
    }

    function updateFeedCount() {
        const el = $('post-feed-count');
        if (!el) return;
        const n = getPosts().length;
        el.textContent = n ? `(${n})` : '';
    }

    function open() {
        if (!window.currentUser) {
            window.toast?.('Đăng nhập để đăng bài', true);
            return;
        }
        buildModal();
        updateFeedCount();
        const overlay = $('post-composer-overlay');
        overlay?.classList.add('is-open');
        overlay?.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTab('compose');
        $('post-compose-text')?.focus();
    }

    function close() {
        const overlay = $('post-composer-overlay');
        overlay?.classList.remove('is-open');
        overlay?.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        $('post-emoji-popover')?.classList.remove('is-open');
    }

    function bindEvents() {
        $('post-composer-close')?.addEventListener('click', close);
        $('post-composer-overlay')?.addEventListener('click', e => {
            if (e.target.id === 'post-composer-overlay') close();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && $('post-composer-overlay')?.classList.contains('is-open')) close();
        });

        document.querySelectorAll('.post-composer-tab').forEach(btn => {
            btn.addEventListener('click', () => setTab(btn.dataset.pcTab));
        });

        $('post-compose-text')?.addEventListener('input', updateCharCount);

        document.querySelectorAll('.post-format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = $('post-compose-text');
                if (!ta) return;
                if (btn.dataset.format === 'bold') wrapSelection(ta, '**', '**');
                else wrapSelection(ta, '*', '*');
            });
        });

        $('post-emoji-trigger')?.addEventListener('click', e => {
            e.stopPropagation();
            $('post-emoji-popover')?.classList.toggle('is-open');
        });
        document.addEventListener('click', () => $('post-emoji-popover')?.classList.remove('is-open'));
        $('post-emoji-popover')?.addEventListener('click', e => {
            const btn = e.target.closest('.post-emoji-btn');
            if (!btn) return;
            const ta = $('post-compose-text');
            if (ta) {
                const emoji = btn.dataset.emoji;
                const pos = ta.selectionStart;
                ta.value = ta.value.slice(0, pos) + emoji + ta.value.slice(pos);
                ta.focus();
                ta.selectionStart = ta.selectionEnd = pos + emoji.length;
                updateCharCount();
            }
            $('post-emoji-popover')?.classList.remove('is-open');
        });

        $('post-media-zone')?.addEventListener('click', () => $('post-media-input')?.click());
        $('post-media-zone')?.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('post-media-input')?.click(); }
        });
        $('post-media-input')?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (file) setMedia(file);
        });
        $('post-media-zone')?.addEventListener('dragover', e => {
            e.preventDefault();
            e.currentTarget.classList.add('is-dragover');
        });
        $('post-media-zone')?.addEventListener('dragleave', e => e.currentTarget.classList.remove('is-dragover'));
        $('post-media-zone')?.addEventListener('drop', e => {
            e.preventDefault();
            e.currentTarget.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) setMedia(file);
        });
        $('post-media-remove')?.addEventListener('click', clearMedia);

        document.querySelectorAll('.post-tag-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const id = chip.dataset.tag;
                if (state.tags.has(id)) {
                    state.tags.delete(id);
                    chip.classList.remove('is-selected');
                } else {
                    state.tags.add(id);
                    chip.classList.add('is-selected');
                }
            });
        });

        $('post-submit-btn')?.addEventListener('click', submitPost);

        $('post-feed-list')?.addEventListener('click', e => {
            const btn = e.target.closest('[data-delete-post]');
            if (btn) deletePost(btn.dataset.deletePost);
        });
    }

    function init() {
        buildModal();
        updateFeedCount();
        $('nav-post-composer-btn')?.addEventListener('click', open);
        $('nav-post-composer-btn-mobile')?.addEventListener('click', open);
    }

    window.PostComposer = { open, close, getPosts, renderFeed };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();