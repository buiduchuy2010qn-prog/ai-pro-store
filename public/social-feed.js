/**
 * social-feed.js — MXH mini: đăng ảnh, kết bạn, chỉ bạn bè xem bảng tin
 */
(function () {
    'use strict';

    const PHOTO_MAX_W = 640;
    const PHOTO_QUALITY = 0.55;
    const MAX_IMAGE_CHARS = 520000;

    let cameraStream = null;
    let pendingImage = null;
    let searchTimer = null;
    /** 'user' = trước, 'environment' = sau */
    let cameraFacing = 'user';

    function isPhoneDevice() {
        const ua = navigator.userAgent || '';
        return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia('(max-width: 767px)').matches;
    }

    function updateCameraUi() {
        const video = document.getElementById('social-camera-video');
        const flipBtn = document.getElementById('social-flip-camera');
        if (video) {
            video.classList.toggle('mirror-front', cameraFacing === 'user');
        }
        if (flipBtn) {
            const showFlip = isPhoneDevice() && !!cameraStream && !pendingImage;
            flipBtn.classList.toggle('is-visible', showFlip);
            flipBtn.title = cameraFacing === 'user' ? 'Chuyển camera sau' : 'Chuyển camera trước';
        }
    }

    function esc(s) {
        return (window.escapeHtml || (x => String(x ?? '')))(s);
    }

    function fmtTime(d) {
        const dt = new Date(d);
        return dt.toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    async function socialApi(path, opts = {}) {
        if (typeof window.api === 'function') return window.api(path, opts);
        const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
        const token = localStorage.getItem('auth_token');
        if (token) headers.Authorization = 'Bearer ' + token;
        const res = await fetch('/api' + path, { ...opts, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Lỗi hệ thống');
        return data;
    }

    function compressDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let maxW = PHOTO_MAX_W;
                let q = PHOTO_QUALITY;
                let out = '';

                const render = () => {
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, maxW / Math.max(img.width, 1));
                    canvas.width = Math.max(1, Math.round(img.width * scale));
                    canvas.height = Math.max(1, Math.round(img.height * scale));
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    return canvas.toDataURL('image/jpeg', q);
                };

                out = render();
                while (out.length > MAX_IMAGE_CHARS) {
                    if (q > 0.32) {
                        q -= 0.07;
                    } else if (maxW > 360) {
                        maxW = Math.round(maxW * 0.82);
                        q = PHOTO_QUALITY;
                    } else {
                        break;
                    }
                    out = render();
                }
                if (out.length > MAX_IMAGE_CHARS) {
                    reject(new Error('Ảnh vẫn quá lớn sau khi nén — thử chụp lại hoặc chọn ảnh nhỏ hơn'));
                    return;
                }
                resolve(out);
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function setComposerStatus(msg, type) {
        const el = document.getElementById('social-composer-status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'social-composer-status' + (type ? ' ' + type : '');
    }

    function updateShutterState() {
        const shutter = document.getElementById('social-shutter-btn');
        if (!shutter) return;
        shutter.classList.toggle('is-live', !!cameraStream && !pendingImage);
        shutter.classList.toggle('is-captured', false);
        shutter.disabled = !!pendingImage;
    }

    function updateComposerMode() {
        const studio = document.querySelector('.social-locket-studio');
        const frame = document.querySelector('.social-locket-frame');
        const controls = document.querySelector('.social-locket-controls');
        const hasPreview = !!pendingImage;
        studio?.classList.toggle('has-preview', hasPreview);
        frame?.classList.toggle('has-preview', hasPreview);
        if (controls) controls.classList.toggle('hidden', hasPreview);
    }

    function showPreview(src) {
        pendingImage = src;
        const preview = document.getElementById('social-preview');
        const placeholder = document.getElementById('social-preview-placeholder');
        if (preview) {
            preview.src = src;
            preview.classList.remove('hidden');
        }
        placeholder?.classList.add('hidden');
        document.getElementById('social-post-row')?.classList.remove('hidden');
        updateShutterState();
        updateCameraUi();
        updateComposerMode();
        setComposerStatus('Sẵn sàng đăng — thêm chú thích rồi bấm Gửi ảnh', 'ok');
    }

    function clearPreview() {
        pendingImage = null;
        const preview = document.getElementById('social-preview');
        const placeholder = document.getElementById('social-preview-placeholder');
        if (preview) {
            preview.src = '';
            preview.classList.add('hidden');
        }
        placeholder?.classList.remove('hidden');
        document.getElementById('social-post-row')?.classList.add('hidden');
        updateShutterState();
        updateCameraUi();
        updateComposerMode();
        setComposerStatus(cameraStream ? 'Căn khung hình rồi bấm nút tròn tím' : 'Chụp ảnh gửi cho bạn bè');
    }

    async function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        const video = document.getElementById('social-camera-video');
        if (video) {
            video.srcObject = null;
            video.classList.add('hidden');
        }
        if (!pendingImage) {
            document.getElementById('social-preview-placeholder')?.classList.remove('hidden');
        }
        updateShutterState();
        updateCameraUi();
    }

    function cameraErrorMessage(err) {
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
            return 'Trình duyệt chặn camera — bấm biểu tượng 🔒 trên thanh địa chỉ và cho phép Camera';
        }
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            return 'Không tìm thấy webcam trên máy';
        }
        if (name === 'NotReadableError' || name === 'TrackStartError') {
            return 'Camera đang được app khác dùng — đóng app đó rồi thử lại';
        }
        if (name === 'SecurityError') {
            return 'Trang cần HTTPS để dùng camera — thử tải lại trang';
        }
        return 'Không mở được camera — thử bấm Chọn ảnh hoặc cho phép quyền Camera';
    }

    async function requestCameraStream() {
        const facing = cameraFacing;
        const constraints = facing === 'environment'
            ? [
                { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
                { video: { facingMode: 'environment' }, audio: false },
                { video: { facingMode: 'user' }, audio: false },
                { video: true, audio: false },
            ]
            : [
                { video: { facingMode: { exact: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
                { video: { facingMode: 'user' }, audio: false },
                { video: true, audio: false },
            ];
        let lastErr;
        for (const c of constraints) {
            try {
                return await navigator.mediaDevices.getUserMedia(c);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr;
    }

    async function flipCamera() {
        if (!isPhoneDevice()) return;
        cameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
        if (cameraStream) {
            await startCamera();
        } else {
            updateCameraUi();
        }
        window.toast?.(cameraFacing === 'environment' ? 'Camera sau' : 'Camera trước', false, 1800);
    }

    async function startCamera() {
        const video = document.getElementById('social-camera-video');
        if (!video) return;
        if (!window.isSecureContext) {
            window.toast?.('Camera chỉ hoạt động trên HTTPS', true);
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            window.toast?.('Trình duyệt không hỗ trợ camera — dùng Chọn ảnh', true);
            return;
        }
        try {
            await stopCamera();
            setComposerStatus('Đang mở camera...');
            cameraStream = await requestCameraStream();
            video.srcObject = cameraStream;
            video.setAttribute('playsinline', '');
            video.muted = true;
            await video.play();
            video.classList.remove('hidden');
            document.getElementById('social-preview-placeholder')?.classList.add('hidden');
            document.getElementById('social-preview')?.classList.add('hidden');
            updateShutterState();
            updateCameraUi();
            const camLabel = cameraFacing === 'environment' ? 'camera sau' : 'camera trước';
            setComposerStatus(`Đang dùng ${camLabel} — bấm nút tròn để chụp`, 'ok');
        } catch (err) {
            console.warn('[SocialFeed] camera:', err);
            await stopCamera();
            const msg = cameraErrorMessage(err);
            setComposerStatus(msg, 'err');
            window.toast?.(msg, true, 6000);
        }
    }

    async function captureFromCamera() {
        const video = document.getElementById('social-camera-video');
        if (!video || !cameraStream) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (cameraFacing === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        try {
            const compressed = await compressDataUrl(canvas.toDataURL('image/jpeg', 0.85));
            await stopCamera();
            showPreview(compressed);
        } catch (_) {
            window.toast?.('Lỗi xử lý ảnh', true);
        }
    }

    async function handleFileSelect(file) {
        if (!file || !file.type.startsWith('image/')) {
            window.toast?.('Chọn file ảnh hợp lệ', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const compressed = await compressDataUrl(reader.result);
                await stopCamera();
                showPreview(compressed);
            } catch (_) {
                window.toast?.('Không đọc được ảnh', true);
            }
        };
        reader.readAsDataURL(file);
    }

    async function publishPost() {
        const user = window.currentUser;
        if (!user) return;
        if (!pendingImage) {
            window.toast?.('Chọn hoặc chụp ảnh trước', true);
            return;
        }
        if (pendingImage.length > MAX_IMAGE_CHARS) {
            window.toast?.('Ảnh quá lớn — bấm Chụp lại hoặc chọn ảnh khác', true);
            return;
        }
        const caption = document.getElementById('social-caption')?.value.trim() || '';
        const btn = document.getElementById('social-post-btn');
        if (btn) btn.disabled = true;
        try {
            await socialApi('/social/posts', {
                method: 'POST',
                body: JSON.stringify({ caption, imageData: pendingImage }),
            });
            document.getElementById('social-caption').value = '';
            clearPreview();
            window.toast?.('Đã gửi ảnh cho bạn bè!');
            const panel = document.getElementById('social-feed-panel');
            const histBtn = document.getElementById('social-history-toggle');
            if (panel?.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                histBtn?.classList.add('is-open');
                panel.dataset.loaded = '1';
            }
            await loadFeed();
            setTimeout(() => startCamera().catch(() => {}), 400);
        } catch (err) {
            window.toast?.(err.message, true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function deletePost(postId) {
        if (!confirm('Xóa bài đăng này?')) return;
        try {
            await socialApi('/social/posts/' + postId, { method: 'DELETE' });
            window.toast?.('Đã xóa bài đăng');
            await loadFeed();
        } catch (err) {
            window.toast?.(err.message, true);
        }
    }

    function renderFeed(posts) {
        const el = document.getElementById('social-feed-list');
        if (!el) return;
        if (!posts.length) {
            el.innerHTML = '<div class="social-empty"><i class="fas fa-images"></i><p>Chưa có bài đăng. Hãy đăng ảnh hoặc kết bạn để xem bảng tin!</p></div>';
            return;
        }
        el.innerHTML = posts.map(p => {
            const name = p.author?.fullName || p.author?.email || 'Người dùng';
            const initial = name.charAt(0).toUpperCase();
            return `
            <article class="social-post-card" data-post-id="${p.id}">
                <div class="social-post-header">
                    <div class="social-avatar">${esc(initial)}</div>
                    <div class="social-post-meta">
                        <div class="social-post-author">${esc(name)}</div>
                        <div class="social-post-time">${esc(fmtTime(p.createdAt))}</div>
                    </div>
                    ${p.isMine ? `<button type="button" class="social-delete-btn" data-delete-post="${p.id}" title="Xóa"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>
                ${p.caption ? `<p class="social-post-caption">${esc(p.caption)}</p>` : ''}
                <img src="${p.imageData}" class="social-post-img" data-lightbox="1" alt="Ảnh bài đăng">
            </article>`;
        }).join('');

        el.querySelectorAll('[data-delete-post]').forEach(btn => {
            btn.addEventListener('click', () => deletePost(Number(btn.dataset.deletePost)));
        });
        el.querySelectorAll('.social-post-img[data-lightbox]').forEach(img => {
            img.addEventListener('click', () => window.ShopFeatures?.openPhotoLightbox?.(img.src));
        });
    }

    async function loadFeed() {
        const el = document.getElementById('social-feed-list');
        if (el) el.innerHTML = '<div class="social-loading"><i class="fas fa-spinner fa-spin"></i> Đang tải bảng tin...</div>';
        try {
            const { posts } = await socialApi('/social/feed');
            renderFeed(posts || []);
        } catch (err) {
            if (el) el.innerHTML = '<div class="social-empty"><p>' + esc(err.message) + '</p></div>';
        }
    }

    function friendActionBtn(user) {
        const st = user.friendshipStatus;
        if (st === 'friends') return '<span class="social-tag friends"><i class="fas fa-user-check"></i> Bạn bè</span>';
        if (st === 'outgoing') return '<span class="social-tag pending">Đã gửi lời mời</span>';
        if (st === 'incoming') {
            return `<button type="button" class="social-mini-btn accept" data-respond="${user.friendshipId}" data-action="accept">Chấp nhận</button>
                    <button type="button" class="social-mini-btn reject" data-respond="${user.friendshipId}" data-action="reject">Từ chối</button>`;
        }
        return `<button type="button" class="social-mini-btn primary" data-add-friend="${user.id}">Kết bạn</button>`;
    }

    function renderUserRow(u, showActions = true) {
        const name = u.fullName || u.user?.fullName || u.email || u.user?.email || '—';
        const email = u.email || u.user?.email || '';
        const id = u.id || u.user?.id;
        const friendshipId = u.friendshipId;
        const status = u.friendshipStatus;
        return `
        <div class="social-user-row">
            <div class="social-user-info">
                <div class="social-user-name">${esc(name)}</div>
                <div class="social-user-email">${esc(email)}</div>
            </div>
            <div class="social-user-actions">
                ${showActions ? friendActionBtn({ id, friendshipId, friendshipStatus: status }) : ''}
            </div>
        </div>`;
    }

    async function sendFriendRequest(userId) {
        try {
            await socialApi('/social/friends/request', {
                method: 'POST',
                body: JSON.stringify({ userId }),
            });
            window.toast?.('Đã gửi lời mời kết bạn!');
            await loadFriendsPanel();
            const q = document.getElementById('social-search')?.value.trim();
            if (q) await runSearch(q);
        } catch (err) {
            window.toast?.(err.message, true);
        }
    }

    async function respondFriendship(fid, action) {
        try {
            await socialApi('/social/friends/respond', {
                method: 'POST',
                body: JSON.stringify({ friendshipId: fid, action }),
            });
            window.toast?.(action === 'accept' ? 'Đã kết bạn!' : 'Đã từ chối lời mời');
            await loadFriendsPanel();
            await loadFeed();
            const q = document.getElementById('social-search')?.value.trim();
            if (q) await runSearch(q);
        } catch (err) {
            window.toast?.(err.message, true);
        }
    }

    async function runSearch(q) {
        const el = document.getElementById('social-search-results');
        if (!el) return;
        if (!q || q.length < 2) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = '<div class="social-loading small"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const { users } = await socialApi('/social/users/search?q=' + encodeURIComponent(q));
            if (!users.length) {
                el.innerHTML = '<div class="social-hint">Không tìm thấy người dùng</div>';
                return;
            }
            el.innerHTML = users.map(u => renderUserRow(u)).join('');
            bindFriendButtons(el);
        } catch (err) {
            el.innerHTML = '<div class="social-hint">' + esc(err.message) + '</div>';
        }
    }

    function bindFriendButtons(root) {
        root.querySelectorAll('[data-add-friend]').forEach(btn => {
            btn.addEventListener('click', () => sendFriendRequest(Number(btn.dataset.addFriend)));
        });
        root.querySelectorAll('[data-respond]').forEach(btn => {
            btn.addEventListener('click', () => respondFriendship(Number(btn.dataset.respond), btn.dataset.action));
        });
    }

    async function loadFriendsPanel() {
        const friendsEl = document.getElementById('social-friends-list');
        const incomingEl = document.getElementById('social-pending-in');
        const outgoingEl = document.getElementById('social-pending-out');
        try {
            const data = await socialApi('/social/friends');
            if (incomingEl) {
                incomingEl.innerHTML = data.incoming?.length
                    ? data.incoming.map(item => renderUserRow({
                        user: item.user,
                        friendshipId: item.friendshipId,
                        friendshipStatus: 'incoming',
                    }, true)).join('')
                    : '<div class="social-hint">Không có lời mời mới</div>';
                bindFriendButtons(incomingEl);
            }
            if (outgoingEl) {
                outgoingEl.innerHTML = data.outgoing?.length
                    ? data.outgoing.map(item => `
                        <div class="social-user-row">
                            <div class="social-user-info">
                                <div class="social-user-name">${esc(item.user.fullName)}</div>
                                <div class="social-user-email">${esc(item.user.email)}</div>
                            </div>
                            <span class="social-tag pending">Đang chờ</span>
                        </div>`).join('')
                    : '';
            }
            if (friendsEl) {
                friendsEl.innerHTML = data.friends?.length
                    ? data.friends.map(item => `
                        <div class="social-user-row">
                            <div class="social-user-info">
                                <div class="social-user-name">${esc(item.user.fullName)}</div>
                                <div class="social-user-email">${esc(item.user.email)}</div>
                            </div>
                            <span class="social-tag friends"><i class="fas fa-heart"></i></span>
                        </div>`).join('')
                    : '<div class="social-hint">Chưa có bạn bè — tìm email để kết bạn</div>';
            }
            const badge = document.getElementById('social-pending-badge');
            if (badge) {
                const n = (data.incoming || []).length;
                badge.textContent = n;
                badge.classList.toggle('hidden', n === 0);
            }
            const countEl = document.getElementById('social-friend-count-num');
            if (countEl) countEl.textContent = String((data.friends || []).length);
        } catch (err) {
            if (friendsEl) friendsEl.innerHTML = '<div class="social-hint">' + esc(err.message) + '</div>';
        }
    }

    async function onShutterClick() {
        if (pendingImage) return;
        if (cameraStream) {
            await captureFromCamera();
            return;
        }
        await startCamera();
    }

    async function onRetakeClick() {
        clearPreview();
        await stopCamera();
        await startCamera();
    }

    function toggleHistoryPanel() {
        const panel = document.getElementById('social-feed-panel');
        const btn = document.getElementById('social-history-toggle');
        if (!panel || !btn) return;
        const open = panel.classList.toggle('hidden');
        btn.classList.toggle('is-open', !open);
        if (!open && !panel.dataset.loaded) {
            panel.dataset.loaded = '1';
            loadFeed();
        }
    }

    function initFabButton() {
        document.getElementById('social-fab-btn')?.addEventListener('click', () => {
            if (typeof window.navigateTo === 'function') {
                window.navigateTo('social');
            } else {
                location.hash = 'social';
            }
            document.getElementById('mobile-menu')?.classList.add('hidden');
        });
    }

    function initComposerEvents() {
        document.getElementById('social-file-btn')?.addEventListener('click', () => {
            document.getElementById('social-file-input')?.click();
        });
        document.getElementById('social-file-input')?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = '';
        });
        document.getElementById('social-shutter-btn')?.addEventListener('click', onShutterClick);
        document.getElementById('social-retake-btn')?.addEventListener('click', onRetakeClick);
        document.getElementById('social-retake-inline')?.addEventListener('click', onRetakeClick);
        document.getElementById('social-flip-camera')?.addEventListener('click', flipCamera);
        document.getElementById('social-post-btn')?.addEventListener('click', publishPost);
        document.getElementById('social-history-toggle')?.addEventListener('click', toggleHistoryPanel);

        const searchInput = document.getElementById('social-search');
        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            const q = searchInput.value.trim();
            searchTimer = setTimeout(() => runSearch(q), 350);
        });
    }

    async function loadView() {
        const user = window.currentUser;
        if (!user) {
            window.toast?.('Đăng nhập để dùng bảng tin ảnh', true);
            return;
        }
        clearPreview();
        await stopCamera();
        await loadFriendsPanel();
        setTimeout(() => startCamera().catch(() => {}), 500);
    }

    function leaveView() {
        stopCamera();
        clearPreview();
    }

    window.SocialFeed = { loadView, leaveView };

    function init() {
        initFabButton();
        initComposerEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();