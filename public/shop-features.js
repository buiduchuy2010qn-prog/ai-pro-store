/**
 * shop-features.js — Tính năng bổ sung: mật khẩu, hồ sơ, lịch sử đăng nhập, mã giảm giá
 * Dữ liệu lưu localStorage: profile_*, login_history_*, shop_coupons
 */
(function () {
    'use strict';

    const LS_COUPONS = 'shop_coupons';
    const LS_PROFILE_PREFIX = 'profile_';

    /** Mã giảm giá đang áp dụng trong modal mua hàng */
    let activePurchaseCoupon = null;

    /* ─── localStorage helpers ─── */

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function profileKey(userId) {
        return LS_PROFILE_PREFIX + userId;
    }

    function historyKey(userId) {
        return 'login_history_' + userId;
    }

    function getProfileExtra(userId) {
        return readJson(profileKey(userId), { phone: '' });
    }

    function saveProfileExtra(userId, data) {
        writeJson(profileKey(userId), data);
    }

    function getCoupons() {
        const list = readJson(LS_COUPONS, null);
        if (Array.isArray(list)) return list;
        // Mã mẫu khi chưa có dữ liệu
        const defaults = [
            { code: 'WELCOME10', percent: 10, expiresAt: '2099-12-31', createdAt: new Date().toISOString() },
            { code: 'VIP20', percent: 20, expiresAt: '2099-12-31', createdAt: new Date().toISOString() },
        ];
        writeJson(LS_COUPONS, defaults);
        return defaults;
    }

    function saveCoupons(list) {
        writeJson(LS_COUPONS, list);
    }

    /* ─── Password visibility toggle ─── */

    function initPasswordToggles() {
        document.querySelectorAll('[data-toggle-password]').forEach(btn => {
            btn.addEventListener('click', () => {
                const inputId = btn.dataset.togglePassword;
                const input = document.getElementById(inputId);
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = show ? 'fas fa-eye-slash' : 'fas fa-eye';
                }
                btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
            });
        });
    }

    /* ─── Camera chụp ảnh đăng nhập (kiểu Loket) ─── */

    const PHOTO_MAX_W = 280;
    const PHOTO_QUALITY = 0.52;
    const MAX_LOGIN_HISTORY = 30;
    const authCameras = {};
    let photoLightboxEl = null;

    function compressDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, PHOTO_MAX_W / Math.max(img.width, 1));
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function openPhotoLightbox(src) {
        if (!src) return;
        if (!photoLightboxEl) {
            photoLightboxEl = document.createElement('div');
            photoLightboxEl.id = 'login-photo-lightbox';
            photoLightboxEl.className = 'login-photo-lightbox hidden';
            photoLightboxEl.innerHTML =
                '<button type="button" class="login-photo-lightbox-close" aria-label="Đóng">&times;</button><img alt="Ảnh đăng nhập">';
            photoLightboxEl.querySelector('.login-photo-lightbox-close').onclick = () => {
                photoLightboxEl.classList.add('hidden');
            };
            photoLightboxEl.onclick = e => {
                if (e.target === photoLightboxEl) photoLightboxEl.classList.add('hidden');
            };
            document.body.appendChild(photoLightboxEl);
        }
        photoLightboxEl.querySelector('img').src = src;
        photoLightboxEl.classList.remove('hidden');
    }

    function createAuthCamera(scope) {
        const video = document.getElementById(`${scope}-camera-video`);
        const snapshot = document.getElementById(`${scope}-camera-snapshot`);
        const placeholder = document.getElementById(`${scope}-camera-placeholder`);
        const startBtn = document.getElementById(`${scope}-camera-start`);
        const captureBtn = document.getElementById(`${scope}-camera-capture`);
        const retakeBtn = document.getElementById(`${scope}-camera-retake`);
        const statusEl = document.getElementById(`${scope}-camera-status`);
        const actionLabel = scope === 'checkin' ? 'check-in' : scope === 'register' ? 'đăng ký' : 'đăng nhập';

        if (!video) return null;

        const state = { scope, stream: null, photo: null, cameraDenied: false };

        function setStatus(msg, type = '') {
            if (!statusEl) return;
            statusEl.textContent = msg;
            statusEl.className = 'login-camera-status' + (type ? ` ${type}` : '');
        }

        function toggle(el, show) {
            if (el) el.classList.toggle('hidden', !show);
        }

        async function stopStream() {
            if (state.stream) {
                state.stream.getTracks().forEach(t => t.stop());
                state.stream = null;
            }
            video.srcObject = null;
        }

        function resetUi() {
            state.photo = null;
            snapshot.src = '';
            toggle(snapshot, false);
            toggle(placeholder, true);
            toggle(video, false);
            toggle(startBtn, true);
            toggle(captureBtn, false);
            toggle(retakeBtn, false);
            if (scope === 'checkin') {
                document.getElementById('checkin-camera-save')?.classList.add('hidden');
                setStatus('Bật camera để bắt đầu chụp ảnh xác minh');
            } else {
                setStatus(`Bật camera và chụp ảnh trước khi ${actionLabel}`);
            }
        }

        function fullReset() {
            stopStream();
            state.cameraDenied = false;
            resetUi();
            if (scope === 'checkin') {
                document.getElementById('checkin-camera-save')?.classList.add('hidden');
            }
        }

        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia) {
                state.cameraDenied = true;
                setStatus('Thiết bị không hỗ trợ camera — có thể tiếp tục không ảnh', 'err');
                return;
            }
            try {
                await stopStream();
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false,
                });
                state.stream = stream;
                video.srcObject = stream;
                try { await video.play(); } catch (_) {}
                toggle(placeholder, false);
                toggle(snapshot, false);
                toggle(video, true);
                toggle(startBtn, false);
                toggle(captureBtn, true);
                toggle(retakeBtn, false);
                setStatus('Căn mặt vào khung tròn rồi bấm Chụp ảnh');
            } catch (_) {
                state.cameraDenied = true;
                setStatus('Không truy cập được camera — có thể tiếp tục không ảnh', 'err');
            }
        }

        async function capturePhoto() {
            if (!state.stream && !state.photo) return;
            if (state.photo) return;
            await waitForVideoReady();
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0);
            try {
                const compressed = await compressDataUrl(canvas.toDataURL('image/jpeg', 0.85));
                state.photo = compressed;
                snapshot.src = compressed;
                toggle(video, false);
                toggle(snapshot, true);
                toggle(captureBtn, false);
                toggle(retakeBtn, true);
                toggle(startBtn, false);
                await stopStream();
                setStatus(`Đã chụp ảnh — có thể ${actionLabel}`, 'ok');
                if (scope === 'checkin') {
                    document.getElementById('checkin-camera-save')?.classList.remove('hidden');
                    setStatus('Bấm "Lưu check-in" để ghi nhận ảnh + IP & thiết bị', 'ok');
                }
            } catch (_) {
                setStatus('Lỗi xử lý ảnh, thử chụp lại', 'err');
            }
        }

        async function retakePhoto() {
            state.photo = null;
            snapshot.src = '';
            toggle(snapshot, false);
            toggle(retakeBtn, false);
            await startCamera();
        }

        startBtn?.addEventListener('click', startCamera);
        captureBtn?.addEventListener('click', capturePhoto);
        retakeBtn?.addEventListener('click', retakePhoto);

        async function waitForVideoReady() {
            if (video.readyState >= 2) return;
            await new Promise(resolve => {
                const done = () => { video.removeEventListener('loadeddata', done); resolve(); };
                video.addEventListener('loadeddata', done);
                setTimeout(resolve, 1500);
            });
        }

        return {
            state,
            fullReset,
            stopStream,
            startCamera,
            capturePhoto,
            waitForVideoReady,
            getPhoto: () => state.photo,
            consumePhoto: () => {
                const p = state.photo;
                state.photo = null;
                return p;
            },
            validate: () => {
                if (state.photo) return { ok: true };
                if (state.cameraDenied || !navigator.mediaDevices?.getUserMedia) {
                    return { ok: true, noPhoto: true };
                }
                return {
                    ok: false,
                    message: `Cho phép camera và chụp ảnh xác nhận (kiểu Loket) trước khi ${actionLabel}.`,
                };
            },
        };
    }

    const MAX_CHECKINS = 40;

    function checkinKey(userId) {
        return 'loket_checkins_' + userId;
    }

    function getCheckins(userId) {
        return readJson(checkinKey(userId), []);
    }

    function saveCheckin(userId, photo) {
        if (!userId || !photo) return;
        const list = getCheckins(userId);
        list.unshift({
            time: new Date().toISOString(),
            device: getClientDevice(),
            ip: window._clientIp || 'Không xác định',
            photo,
            status: 'Đã check-in',
        });
        try {
            writeJson(checkinKey(userId), list.slice(0, MAX_CHECKINS));
        } catch (_) {
            const trimmed = list.slice(0, 12).map((c, i) => (i < 6 ? c : { ...c, photo: null }));
            writeJson(checkinKey(userId), trimmed);
        }
    }

    function updateCheckinBar() {
        const user = window.currentUser;
        const ipEl = document.getElementById('checkin-bar-ip');
        const devEl = document.getElementById('checkin-bar-device');
        if (ipEl) ipEl.textContent = window._clientIp || (user ? getLastLoginIp(user.id) : '—') || '—';
        if (devEl) devEl.textContent = getClientDevice();
    }

    function renderCheckinGallery(userId) {
        const grid = document.getElementById('checkin-history-grid');
        if (!grid) return;
        const list = getCheckins(userId);
        const esc = window.escapeHtml || (s => String(s ?? ''));
        if (!list.length) {
            grid.innerHTML = '<div class="profile-empty">Chưa có ảnh check-in. Chụp và lưu bên trái.</div>';
            return;
        }
        grid.innerHTML = list.map((c, i) => `
            <div class="loket-gallery-card">
                ${c.photo
                    ? `<img src="${c.photo}" class="loket-gallery-img" data-checkin-idx="${i}" alt="Check-in ${i + 1}">`
                    : '<div class="loket-gallery-img loket-gallery-empty"><i class="fas fa-user"></i></div>'}
                <div class="loket-gallery-meta">
                    <div class="loket-gallery-time">${esc(formatDateTime(c.time))}</div>
                    <div class="loket-gallery-ip"><i class="fas fa-globe mr-1"></i>${esc(c.ip)}</div>
                    <div class="loket-gallery-device text-xs">${esc(c.device)}</div>
                </div>
            </div>`).join('');
        grid.querySelectorAll('.loket-gallery-img[data-checkin-idx]').forEach(img => {
            img.addEventListener('click', () => openPhotoLightbox(img.src));
        });
    }

    function initCheckinCamera() {
        if (authCameras.checkin) return;
        const cam = createAuthCamera('checkin');
        if (!cam) return;
        authCameras.checkin = cam;
        document.getElementById('checkin-camera-save')?.addEventListener('click', () => {
            const user = window.currentUser;
            if (!user) return;
            const photo = cam.getPhoto();
            if (!photo) {
                window.toast?.('Chụp ảnh trước khi lưu check-in', true);
                return;
            }
            cam.consumePhoto();
            saveCheckin(user.id, photo);
            renderCheckinGallery(user.id);
            window.toast?.('Đã lưu check-in Loket!');
            cam.fullReset();
            setTimeout(() => cam.startCamera(), 400);
        });
    }

    async function loadCheckinView() {
        const user = window.currentUser;
        if (!user) return;
        if (typeof window.refreshUser === 'function') {
            try { await window.refreshUser(); } catch (_) {}
        }
        initCheckinCamera();
        updateCheckinBar();
        renderCheckinGallery(user.id);
        const cam = authCameras.checkin;
        if (cam && !cam.getPhoto() && !cam.state.stream && !cam.state.cameraDenied) {
            setTimeout(() => cam.startCamera(), 300);
        }
    }

    function leaveCheckinView() {
        authCameras.checkin?.fullReset?.();
    }

    /* ─── Thiết bị & IP thật cho lịch sử đăng nhập ─── */

    /** Nhận diện hệ điều hành + trình duyệt từ thiết bị đang dùng */
    function getClientDevice() {
        const ua = navigator.userAgent || '';
        let os = 'Thiết bị khác';
        if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
        else if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/Linux/i.test(ua)) os = 'Linux';

        let browser = 'Trình duyệt';
        if (/Edg\//i.test(ua)) browser = 'Edge';
        else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
        else if (/Chrome\//i.test(ua) && !/Edg|OPR/i.test(ua)) browser = 'Chrome';
        else if (/Firefox\//i.test(ua)) browser = 'Firefox';
        else if (/Safari\//i.test(ua) && !/Chrome|Chromium/i.test(ua)) browser = 'Safari';

        return `${os} · ${browser}`;
    }

    function resolveLoginIp(meta) {
        return meta?.ip || window._clientIp || 'Không xác định';
    }

    function formatDateTime(d) {
        const dt = d instanceof Date ? d : new Date(d);
        return dt.toLocaleString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    }

    function recordLoginHistory(userId, meta = {}) {
        if (!userId) return;
        const ip = resolveLoginIp(meta);
        window._clientIp = ip;
        const key = historyKey(userId);
        const history = readJson(key, []);
        history.unshift({
            time: new Date().toISOString(),
            device: getClientDevice(),
            ip,
            status: 'Thành công',
        });
        try {
            writeJson(key, history.slice(0, MAX_LOGIN_HISTORY));
        } catch (_) {
            // localStorage đầy — bỏ ảnh cũ nhất
            const trimmed = history.slice(0, MAX_LOGIN_HISTORY).map((h, i) =>
                i < 10 ? h : { ...h, photo: null }
            );
            writeJson(key, trimmed);
        }
    }

    function getLastLoginIp(userId) {
        const history = readJson(historyKey(userId), []);
        if (history[0]?.ip) return history[0].ip;
        return window._clientIp || 'Chưa có';
    }

    /* ─── Profile modal ─── */

    async function openProfileModal(tab = 'info') {
        let user = window.currentUser;
        if (!user && typeof window.refreshUser === 'function') {
            try { await window.refreshUser(); user = window.currentUser; } catch (_) {}
        }
        if (!user) {
            window.toast?.('Không tải được hồ sơ. Vui lòng đăng nhập lại.', true);
            return;
        }
        const modal = document.getElementById('profile-modal');
        if (!modal) return;
        renderProfileInfo(user);
        renderLoginHistory(user.id);
        showProfileTab(tab === 'history' ? 'history' : 'info');
        modal.classList.remove('hidden');
        document.getElementById('mobile-menu')?.classList.add('hidden');
    }

    function closeProfileModal() {
        document.getElementById('profile-modal')?.classList.add('hidden');
        cancelProfileEdit();
    }

    function gotoCheckinPage() {
        closeProfileModal();
        if (typeof window.navigateTo === 'function') {
            window.navigateTo('checkin');
        } else {
            location.hash = 'checkin';
        }
    }

    function showProfileTab(tab) {
        const isInfo = tab === 'info';
        document.getElementById('profile-tab-info')?.classList.toggle('profile-tab-active', isInfo);
        document.getElementById('profile-tab-history')?.classList.toggle('profile-tab-active', !isInfo);
        document.getElementById('profile-panel-info')?.classList.toggle('hidden', !isInfo);
        document.getElementById('profile-panel-history')?.classList.toggle('hidden', isInfo);
    }

    function renderProfileInfo(user) {
        const extra = getProfileExtra(user.id);
        const name = user.fullName || user.name || user.email || '—';
        document.getElementById('profile-display-name').textContent = name;
        document.getElementById('profile-display-email').textContent = user.email || '—';
        document.getElementById('profile-display-phone').textContent = extra.phone || 'Chưa cập nhật';
        document.getElementById('profile-display-balance').textContent =
            typeof window.formatMoney === 'function' ? window.formatMoney(user.balance) : (user.balance + 'đ');
        document.getElementById('profile-display-joined').textContent = user.createdAt || '—';
        document.getElementById('profile-display-device').textContent = getClientDevice();
        document.getElementById('profile-display-ip').textContent =
            window._clientIp || getLastLoginIp(user.id);

        document.getElementById('profile-edit-name').value = name;
        document.getElementById('profile-edit-phone').value = extra.phone || '';
    }

    function renderLoginHistory(userId) {
        const el = document.getElementById('profile-login-history-list');
        if (!el) return;
        const history = readJson(historyKey(userId), []);
        if (!history.length) {
            el.innerHTML = '<div class="profile-empty">Chưa có lịch sử đăng nhập.</div>';
            return;
        }
        const esc = window.escapeHtml || (s => String(s ?? ''));
        el.innerHTML = history.map(h => `
            <div class="profile-history-row">
                <div class="profile-history-body w-full">
                    <div class="profile-history-time"><i class="fas fa-clock text-brand-500 mr-1"></i>${esc(formatDateTime(h.time))}</div>
                    <div class="profile-history-meta">
                        <span><i class="fas fa-laptop mr-1"></i>${esc(h.device)}</span>
                        <span><i class="fas fa-globe mr-1"></i>${esc(h.ip)}</span>
                    </div>
                    <span class="profile-history-status">${esc(h.status)}</span>
                </div>
            </div>`).join('');
    }

    function startProfileEdit() {
        document.getElementById('profile-view-mode')?.classList.add('hidden');
        document.getElementById('profile-edit-mode')?.classList.remove('hidden');
        document.getElementById('profile-edit-btn')?.classList.add('hidden');
        document.getElementById('profile-save-btn')?.classList.remove('hidden');
        document.getElementById('profile-cancel-edit-btn')?.classList.remove('hidden');
    }

    function cancelProfileEdit() {
        const user = window.currentUser;
        if (user) renderProfileInfo(user);
        document.getElementById('profile-view-mode')?.classList.remove('hidden');
        document.getElementById('profile-edit-mode')?.classList.add('hidden');
        document.getElementById('profile-edit-btn')?.classList.remove('hidden');
        document.getElementById('profile-save-btn')?.classList.add('hidden');
        document.getElementById('profile-cancel-edit-btn')?.classList.add('hidden');
    }

    function saveProfileEdit() {
        const user = window.currentUser;
        if (!user) return;
        const phone = document.getElementById('profile-edit-phone')?.value.trim() || '';
        const name = document.getElementById('profile-edit-name')?.value.trim() || '';
        saveProfileExtra(user.id, { phone });
        if (name) {
            user.fullName = name;
            if (typeof window.updateHeader === 'function') window.updateHeader();
        }
        renderProfileInfo(user);
        cancelProfileEdit();
        if (typeof window.toast === 'function') window.toast('Đã lưu hồ sơ!');
    }

    function initProfileEvents() {
        const openProfile = () => openProfileModal('info');
        document.getElementById('profile-btn')?.addEventListener('click', openProfile);
        document.getElementById('nav-profile-btn')?.addEventListener('click', openProfile);
        document.getElementById('user-name-wrap')?.addEventListener('click', openProfile);
        document.getElementById('profile-modal-close')?.addEventListener('click', closeProfileModal);
        document.getElementById('profile-modal')?.addEventListener('click', e => {
            if (e.target.id === 'profile-modal') closeProfileModal();
        });
        document.getElementById('profile-tab-info')?.addEventListener('click', () => showProfileTab('info'));
        document.getElementById('profile-tab-history')?.addEventListener('click', () => showProfileTab('history'));
        document.getElementById('profile-edit-btn')?.addEventListener('click', startProfileEdit);
        document.getElementById('profile-cancel-edit-btn')?.addEventListener('click', cancelProfileEdit);
        document.getElementById('profile-save-btn')?.addEventListener('click', saveProfileEdit);
        document.getElementById('profile-logout-btn')?.addEventListener('click', () => {
            closeProfileModal();
            document.getElementById('logout-btn')?.click();
        });
        document.getElementById('profile-goto-checkin')?.addEventListener('click', gotoCheckinPage);
    }

    /* ─── Coupon validation & purchase ─── */

    function normalizeCode(code) {
        return String(code || '').trim().toUpperCase();
    }

    function validateCouponCode(code) {
        const normalized = normalizeCode(code);
        if (!normalized) return { ok: false, message: 'Nhập mã giảm giá' };
        const coupons = getCoupons();
        const found = coupons.find(c => normalizeCode(c.code) === normalized);
        if (!found) return { ok: false, message: 'Mã giảm giá không tồn tại' };
        if (found.expiresAt) {
            const exp = new Date(found.expiresAt);
            exp.setHours(23, 59, 59, 999);
            if (Date.now() > exp.getTime()) return { ok: false, message: 'Mã giảm giá đã hết hạn' };
        }
        return { ok: true, coupon: found };
    }

    function applyPurchaseCoupon() {
        const input = document.getElementById('purchase-coupon-code');
        const msgEl = document.getElementById('purchase-coupon-msg');
        const code = input?.value || '';
        const result = validateCouponCode(code);
        if (!result.ok) {
            activePurchaseCoupon = null;
            if (msgEl) {
                msgEl.textContent = result.message;
                msgEl.className = 'purchase-coupon-msg error';
                msgEl.classList.remove('hidden');
            }
            if (typeof window.updatePurchaseTotal === 'function') window.updatePurchaseTotal();
            return;
        }
        activePurchaseCoupon = result.coupon;
        if (msgEl) {
            msgEl.textContent = `Áp dụng giảm ${result.coupon.percent}%`;
            msgEl.className = 'purchase-coupon-msg success';
            msgEl.classList.remove('hidden');
        }
        if (typeof window.updatePurchaseTotal === 'function') window.updatePurchaseTotal();
        if (typeof window.toast === 'function') window.toast(`Đã áp dụng mã ${result.coupon.code}!`);
    }

    function clearPurchaseCoupon() {
        activePurchaseCoupon = null;
        const input = document.getElementById('purchase-coupon-code');
        const msgEl = document.getElementById('purchase-coupon-msg');
        if (input) input.value = '';
        if (msgEl) msgEl.classList.add('hidden');
    }

    function getPurchaseDiscountInfo() {
        if (!activePurchaseCoupon) return { percent: 0, code: '', discountAmount: 0 };
        const percent = Math.min(100, Math.max(0, Number(activePurchaseCoupon.percent) || 0));
        return {
            percent,
            code: normalizeCode(activePurchaseCoupon.code),
            discountAmount: 0,
        };
    }

    function calcPurchaseTotals(unitPrice, qty) {
        const subtotal = unitPrice * qty;
        const info = getPurchaseDiscountInfo();
        const discountAmount = info.percent > 0 ? Math.round(subtotal * info.percent / 100) : 0;
        const total = Math.max(0, subtotal - discountAmount);
        return { subtotal, discountAmount, total, percent: info.percent, code: info.code };
    }

    function renderPurchaseTotals(p, qty) {
        const totals = calcPurchaseTotals(p.price, qty);
        const fmt = window.formatMoney || (n => n + 'đ');
        document.getElementById('purchase-unit-price').textContent = fmt(p.price);
        document.getElementById('purchase-subtotal').textContent = fmt(totals.subtotal);
        const discountWrap = document.getElementById('purchase-discount-wrap');
        const discountEl = document.getElementById('purchase-discount-amount');
        if (discountWrap && discountEl) {
            if (totals.discountAmount > 0) {
                discountWrap.classList.remove('hidden');
                discountEl.textContent = '-' + fmt(totals.discountAmount) + ` (${totals.percent}%)`;
            } else {
                discountWrap.classList.add('hidden');
            }
        }
        document.getElementById('purchase-total-price').textContent = fmt(totals.total);
        return totals;
    }

    function initCouponPurchaseEvents() {
        document.getElementById('purchase-apply-coupon')?.addEventListener('click', applyPurchaseCoupon);
        document.getElementById('purchase-coupon-code')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); applyPurchaseCoupon(); }
        });
    }

    /* ─── Admin coupon management ─── */

    function renderAdminCoupons() {
        const el = document.getElementById('admin-coupons-list');
        if (!el) return;
        const coupons = getCoupons();
        const esc = window.escapeHtml || (s => String(s ?? ''));
        if (!coupons.length) {
            el.innerHTML = '<div class="profile-empty">Chưa có mã giảm giá. Tạo mã mới bên dưới.</div>';
            return;
        }
        el.innerHTML = coupons.map((c, i) => {
            const expired = c.expiresAt && Date.now() > new Date(c.expiresAt).setHours(23, 59, 59, 999);
            return `
            <div class="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div class="font-bold text-lg text-brand-600 font-mono">${esc(c.code)}</div>
                    <div class="text-sm text-slate-500 mt-1">Giảm <strong class="text-emerald-600">${c.percent}%</strong> · Hạn: ${esc(c.expiresAt || 'Không giới hạn')}</div>
                    ${expired ? '<span class="text-xs text-red-500 font-medium">Đã hết hạn</span>' : '<span class="text-xs text-emerald-600 font-medium">Đang hoạt động</span>'}
                </div>
                <button type="button" data-delete-coupon="${i}" class="btn-danger px-4 py-2 text-sm shrink-0">
                    <i class="fas fa-trash mr-1"></i>Xóa
                </button>
            </div>`;
        }).join('');
    }

    function createAdminCoupon() {
        const code = normalizeCode(document.getElementById('new-coupon-code')?.value);
        const percent = parseInt(document.getElementById('new-coupon-percent')?.value, 10);
        const expiresAt = document.getElementById('new-coupon-expires')?.value || '';
        if (!code) return window.toast?.('Nhập mã giảm giá', true);
        if (!percent || percent < 1 || percent > 100) return window.toast?.('Phần trăm giảm từ 1–100', true);
        if (!expiresAt) return window.toast?.('Chọn ngày hết hạn', true);
        const coupons = getCoupons();
        if (coupons.some(c => normalizeCode(c.code) === code)) {
            return window.toast?.('Mã đã tồn tại', true);
        }
        coupons.unshift({
            code,
            percent,
            expiresAt,
            createdAt: new Date().toISOString(),
        });
        saveCoupons(coupons);
        document.getElementById('new-coupon-code').value = '';
        document.getElementById('new-coupon-percent').value = '';
        document.getElementById('new-coupon-expires').value = '';
        renderAdminCoupons();
        window.toast?.('Đã tạo mã giảm giá!');
    }

    function deleteAdminCoupon(index) {
        const coupons = getCoupons();
        if (!coupons[index]) return;
        if (!confirm(`Xóa mã ${coupons[index].code}?`)) return;
        coupons.splice(index, 1);
        saveCoupons(coupons);
        renderAdminCoupons();
        window.toast?.('Đã xóa mã giảm giá');
    }

    function initAdminCouponEvents() {
        document.getElementById('admin-coupon-create-btn')?.addEventListener('click', createAdminCoupon);
        document.getElementById('admin-coupons-list')?.addEventListener('click', e => {
            const btn = e.target.closest('[data-delete-coupon]');
            if (btn) deleteAdminCoupon(Number(btn.dataset.deleteCoupon));
        });
    }

    /* ─── Public API ─── */

    window.ShopFeatures = {
        recordLoginHistory,
        loadCheckinView,
        leaveCheckinView,
        openPhotoLightbox,
        clearPurchaseCoupon,
        renderPurchaseTotals,
        getPurchaseDiscountInfo,
        calcPurchaseTotals,
        renderAdminCoupons,
        openProfileModal,
        closeProfileModal,
        get activeCoupon() { return activePurchaseCoupon; },
    };

    function init() {
        initPasswordToggles();
        initProfileEvents();
        initCouponPurchaseEvents();
        initAdminCouponEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();