/**
 * social-feed.js — MXH mini: đăng ảnh, kết bạn, chỉ bạn bè xem bảng tin
 */
(function () {
    'use strict';

    const PHOTO_MAX_W = 640;
    const PHOTO_QUALITY = 0.55;
    const MAX_IMAGE_CHARS = 520000;
    const LS_SAVE_MODE = 'social_save_mode';
    let driveAdminBackup = false;

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

    function getSaveMode() {
        return localStorage.getItem(LS_SAVE_MODE) || 'off';
    }

    function shouldSaveWhen(when) {
        const mode = getSaveMode();
        if (mode === 'off') return false;
        if (mode === 'both') return true;
        return mode === when;
    }

    function saveImageToDevice(dataUrl, label) {
        if (!dataUrl) return;
        try {
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `shop-anh-${label || 'luu'}-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.toast?.('Đã lưu ảnh vào máy');
        } catch (_) {
            window.toast?.('Không lưu được ảnh — thử giữ ảnh để tải thủ công', true);
        }
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
        setComposerStatus('Đăng ảnh, Lưu ảnh vào máy, hoặc Hủy', 'ok');
        if (shouldSaveWhen('capture')) {
            saveImageToDevice(src, 'chup');
        }
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
        if (!confirm('Đăng ảnh này lên bảng tin?\nBạn bè đã kết bạn sẽ xem được.')) {
            return;
        }
        const caption = document.getElementById('social-caption')?.value.trim() || '';
        const imageToPost = pendingImage;
        const btn = document.getElementById('social-post-btn');
        if (btn) btn.disabled = true;
        try {
            const res = await socialApi('/social/posts', {
                method: 'POST',
                body: JSON.stringify({ caption, imageData: imageToPost }),
            });
            if (shouldSaveWhen('post')) {
                saveImageToDevice(imageToPost, 'dang');
            }
            document.getElementById('social-caption').value = '';
            clearPreview();
            if (res.driveSynced) {
                window.toast?.('Đã đăng ảnh — admin đã sao lưu lên Drive!');
            } else if (res.driveWarning && driveAdminBackup) {
                window.toast?.('Đã đăng ảnh nhưng Drive admin: ' + res.driveWarning, true, 5000);
            } else {
                window.toast?.('Đã đăng ảnh lên bảng tin!');
            }
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
        if (!confirm('Hủy đăng ảnh này?\nBạn bè sẽ không xem được nữa.')) return;
        try {
            await socialApi('/social/posts/' + postId, { method: 'DELETE' });
            window.toast?.('Đã hủy đăng ảnh');
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
                    <div class="social-post-actions">
                        <button type="button" class="social-save-post-btn" data-save-post="${p.id}" title="Lưu ảnh vào máy"><i class="fas fa-download"></i></button>
                        ${p.isMine ? `<button type="button" class="social-delete-btn" data-delete-post="${p.id}" title="Hủy đăng"><i class="fas fa-times-circle mr-1"></i>Hủy đăng</button>` : ''}
                    </div>
                </div>
                ${p.caption ? `<p class="social-post-caption">${esc(p.caption)}</p>` : ''}
                <img src="${p.imageData}" class="social-post-img" data-lightbox="1" alt="Ảnh bài đăng">
            </article>`;
        }).join('');

        el.querySelectorAll('[data-delete-post]').forEach(btn => {
            btn.addEventListener('click', () => deletePost(Number(btn.dataset.deletePost)));
        });
        el.querySelectorAll('[data-save-post]').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('[data-post-id]');
                const img = card?.querySelector('.social-post-img');
                if (img?.src) saveImageToDevice(img.src, 'bai');
            });
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

    function onSavePreviewClick() {
        if (!pendingImage) {
            window.toast?.('Chụp hoặc chọn ảnh trước', true);
            return;
        }
        saveImageToDevice(pendingImage, 'luu');
    }

    async function cancelPreview() {
        if (!pendingImage) return;
        if (!confirm('Hủy ảnh này?\nSẽ không đăng lên bảng tin.')) return;
        clearPreview();
        await stopCamera();
        await startCamera();
        window.toast?.('Đã hủy ảnh');
    }

    function initSaveMode() {
        const sel = document.getElementById('social-save-mode');
        if (!sel) return;
        sel.value = getSaveMode();
        sel.addEventListener('change', () => {
            localStorage.setItem(LS_SAVE_MODE, sel.value);
            const labels = {
                off: 'Không tự lưu ảnh vào máy',
                capture: 'Sẽ lưu khi chụp/chọn ảnh',
                post: 'Sẽ lưu khi đăng thành công',
                both: 'Sẽ lưu khi chụp và khi đăng',
            };
            window.toast?.(labels[sel.value] || 'Đã đổi chế độ lưu ảnh', false, 2800);
        });

    }

    function handleDriveCallbackParams() {
        const params = new URLSearchParams(window.location.search);
        const drive = params.get('drive');
        if (!drive) return;
        if (drive === 'connected') {
            window.toast?.('Đã kết nối Google Drive thành công!');
        } else if (drive === 'error') {
            const detail = params.get('drive_msg');
            window.toast?.(
                detail || 'Không kết nối được Google Drive — thử lại hoặc kiểm tra cấu hình OAuth.',
                true,
                8000
            );
        }
        const hash = window.location.hash || '';
        history.replaceState(null, '', window.location.pathname + hash);
    }

    async function connectGoogleDrive() {
        const btn = document.getElementById('social-drive-connect-btn');
        if (btn) btn.disabled = true;
        try {
            const data = await socialApi('/social/drive/connect');
            if (data.authUrl) {
                window.location.href = data.authUrl;
                return;
            }
            window.toast?.('Không lấy được liên kết Google', true);
        } catch (err) {
            window.toast?.(err.message || 'Lỗi kết nối Google Drive', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function disconnectGoogleDrive() {
        if (!confirm('Ngắt kết nối Google Drive?\nẢnh mới sẽ không sao lưu lên Drive cho đến khi kết nối lại.')) return;
        try {
            await socialApi('/social/drive/disconnect', { method: 'POST', body: '{}' });
            window.toast?.('Đã ngắt kết nối Google Drive');
            await loadDriveStatus();
        } catch (err) {
            window.toast?.(err.message, true);
        }
    }

    function renderDriveConnectCard(data, setup) {
        const card = document.getElementById('social-drive-connect-card');
        const isAdmin = window.currentUser?.role === 'admin';
        if (card) card.classList.toggle('hidden', !isAdmin);

        const connectedBox = document.getElementById('social-drive-connected');
        const disconnectedBox = document.getElementById('social-drive-disconnected');
        const emailEl = document.getElementById('social-drive-email');
        const atEl = document.getElementById('social-drive-connected-at');
        const connectBtn = document.getElementById('social-drive-connect-btn');
        const setupBox = document.getElementById('social-drive-oauth-setup');
        const readyHint = document.getElementById('social-drive-ready-hint');
        const redirectInput = document.getElementById('social-drive-redirect-uri');
        const clientIdInput = document.getElementById('social-drive-client-id');

        if (!isAdmin) return;

        const connected = !!data.connected;
        const credTest = setup?.credentialTest;
        const credOk = credTest ? credTest.ok !== false : true;
        const oauthReady = !!data.oauthAvailable && credOk;
        if (connectedBox) connectedBox.classList.toggle('hidden', !connected);
        if (disconnectedBox) disconnectedBox.classList.toggle('hidden', connected);
        if (emailEl) emailEl.textContent = data.googleEmail || 'Tài khoản Google';
        if (atEl) {
            atEl.textContent = data.connectedAt
                ? 'Kết nối lúc ' + fmtTime(data.connectedAt)
                : '';
            atEl.classList.toggle('hidden', !data.connectedAt);
        }
        if (setupBox) setupBox.classList.toggle('hidden', oauthReady);
        if (readyHint) readyHint.classList.toggle('hidden', !oauthReady);
        if (connectBtn) {
            connectBtn.classList.toggle('hidden', !oauthReady);
            connectBtn.disabled = !oauthReady;
        }
        if (setup && redirectInput) redirectInput.value = setup.redirectUri || '';
        if (setup && clientIdInput && setup.clientId) clientIdInput.value = setup.clientId;

        const test = setup?.credentialTest;
        if (test && !oauthReady && isAdmin) {
            const setupBox = document.getElementById('social-drive-oauth-setup');
            let testEl = document.getElementById('social-drive-cred-test');
            if (!testEl && setupBox) {
                testEl = document.createElement('p');
                testEl.id = 'social-drive-cred-test';
                testEl.className = 'social-drive-cred-test';
                setupBox.appendChild(testEl);
            }
            if (testEl) {
                testEl.textContent = test.message || '';
                testEl.classList.toggle('is-error', test.ok === false);
                testEl.classList.toggle('is-ok', test.ok === true);
            }
        }
    }

    async function loadOAuthSetup() {
        try {
            return await socialApi('/social/drive/oauth-setup');
        } catch (_) {
            return {
                redirectUri: 'https://ai-pro-store.onrender.com/api/social/drive/callback',
                clientId: '',
                hasClientSecret: false,
                configured: false,
            };
        }
    }

    async function saveOAuthConfig() {
        const clientId = document.getElementById('social-drive-client-id')?.value.trim() || '';
        const clientSecret = document.getElementById('social-drive-client-secret')?.value.trim() || '';
        const btn = document.getElementById('social-drive-save-oauth');
        if (!clientId || !clientSecret) {
            window.toast?.('Nhập đủ Client ID và Client Secret từ Google Cloud', true);
            return;
        }
        if (btn) btn.disabled = true;
        try {
            const res = await socialApi('/social/drive/oauth-setup', {
                method: 'POST',
                body: JSON.stringify({ clientId, clientSecret }),
            });
            document.getElementById('social-drive-client-secret').value = '';
            window.toast?.('Đã lưu OAuth — bấm Kết nối Google Drive!');
            await loadDriveStatus();
            if (res.setup) renderDriveConnectCard({ oauthAvailable: true, connected: false, isAdmin: true }, res.setup);
        } catch (err) {
            window.toast?.(err.message || 'Không lưu được OAuth', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function copyRedirectUri() {
        const input = document.getElementById('social-drive-redirect-uri');
        const text = input?.value || '';
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            window.toast?.('Đã sao chép Redirect URI!');
        }).catch(() => {
            window.toast?.('Không sao chép được — chọn và copy thủ công', true);
        });
    }

    async function loadDriveStatus() {
        const hint = document.getElementById('social-drive-hint');
        const info = document.getElementById('social-drive-info');
        try {
            const [data, setup] = await Promise.all([
                socialApi('/social/drive/status'),
                window.currentUser?.role === 'admin' ? loadOAuthSetup() : Promise.resolve(null),
            ]);
            driveAdminBackup = !!data.configured;
            renderDriveConnectCard(data, setup);
            const driveEmail = data.googleEmail || data.backupGoogleEmail;
            if (info && data.method === 'oauth' && driveEmail) {
                info.innerHTML = '<i class="fab fa-google-drive mr-1"></i>Ảnh đăng được sao lưu tự động lên <strong>Drive ' + esc(driveEmail) + '</strong>.';
            } else if (info) {
                info.innerHTML = '<i class="fab fa-google-drive mr-1"></i>Ảnh đăng được sao lưu tự động lên <strong>Drive admin</strong> để quản lý.';
            }
        } catch (_) {
            driveAdminBackup = false;
            const setup = window.currentUser?.role === 'admin' ? await loadOAuthSetup() : null;
            renderDriveConnectCard({ oauthAvailable: false }, setup);
        }
        if (hint) hint.classList.toggle('hidden', driveAdminBackup);
        if (info) info.classList.toggle('hidden', !driveAdminBackup);
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
        document.getElementById('social-cancel-preview')?.addEventListener('click', cancelPreview);
        document.getElementById('social-flip-camera')?.addEventListener('click', flipCamera);
        document.getElementById('social-post-btn')?.addEventListener('click', publishPost);
        document.getElementById('social-save-btn')?.addEventListener('click', onSavePreviewClick);
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
        handleDriveCallbackParams();
        clearPreview();
        await stopCamera();
        await Promise.all([loadFriendsPanel(), loadDriveStatus()]);
        setTimeout(() => startCamera().catch(() => {}), 500);
    }

    function leaveView() {
        stopCamera();
        clearPreview();
    }

    window.SocialFeed = { loadView, leaveView };

    function initDriveConnect() {
        document.getElementById('social-drive-connect-btn')?.addEventListener('click', connectGoogleDrive);
        document.getElementById('social-drive-disconnect')?.addEventListener('click', disconnectGoogleDrive);
        document.getElementById('social-drive-save-oauth')?.addEventListener('click', saveOAuthConfig);
        document.getElementById('social-drive-copy-redirect')?.addEventListener('click', copyRedirectUri);
    }

    function init() {
        initFabButton();
        initSaveMode();
        initComposerEvents();
        initDriveConnect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();