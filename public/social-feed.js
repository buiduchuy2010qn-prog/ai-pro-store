/**
 * social-feed.js — MXH mini: đăng ảnh, kết bạn, chỉ bạn bè xem bảng tin
 */
(function () {
    'use strict';

    const PHOTO_MAX_W = 640;
    const PHOTO_QUALITY = 0.55;
    const MAX_IMAGE_CHARS = 520000;
    const MAX_VIDEO_CHARS = 10_000_000;
    const MAX_VIDEO_SEC = 20;
    const MAX_VIDEO_FILE_MB = 8;
    const LS_SAVE_MODE = 'social_save_mode';
    const REACTION_DEFS = [
        { key: 'like', emoji: '👍', label: 'Thích' },
        { key: 'love', emoji: '❤️', label: 'Yêu thích' },
        { key: 'haha', emoji: '😂', label: 'Haha' },
        { key: 'wow', emoji: '😮', label: 'Wow' },
        { key: 'sad', emoji: '😢', label: 'Buồn' },
        { key: 'angry', emoji: '😡', label: 'Phẫn nộ' },
    ];
    const REACTION_EMOJI = Object.fromEntries(REACTION_DEFS.map(r => [r.key, r.emoji]));
    let driveAdminBackup = false;

    let cameraStream = null;
    let pendingImage = null;
    /** Blob video quay/chọn — dùng preview & upload, không nhét data URL vào RAM */
    let pendingVideoBlob = null;
    let previewObjectUrl = null;
    /** 'image' | 'video' */
    let pendingMediaType = 'image';
    let composerMode = 'photo';
    let mediaRecorder = null;
    let recordChunks = [];
    let recordingTimer = null;
    let recordTickInterval = null;
    let recordStartedAt = 0;
    let lastRecordDurationSec = 0;
    let previewPosterUrl = null;
    /** Video đã tải lên Drive để xem trước — đăng bài dùng lại file này */
    let pendingDriveFileId = null;
    let pendingDriveStreamUrl = null;
    let searchTimer = null;
    /** 'user' = trước, 'environment' = sau */
    let cameraFacing = 'user';
    /** AudioContext im lặng — WebM chỉ video thường không phát được trên Chrome */
    let silentAudioCtx = null;
    let silentAudioCleanup = null;

    function isVideoMedia() {
        return pendingMediaType === 'video' || !!pendingVideoBlob
            || (pendingImage || '').startsWith('data:video/') || (pendingImage || '').startsWith('blob:');
    }

    function revokePreviewObjectUrl() {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }

    function setPreviewPlayOverlay(visible) {
        const btn = document.getElementById('social-preview-play');
        if (btn) btn.classList.toggle('hidden', !visible);
    }

    function hidePreviewPlayBtn() {
        setPreviewPlayOverlay(false);
    }

    function showPreviewPlayBtn() {
        setPreviewPlayOverlay(true);
    }

    function waitVideoCanPlay(vid, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            if (!vid) return reject(new Error('no video'));
            if (vid.readyState >= 3) return resolve();
            let done = false;
            const finish = (ok, err) => {
                if (done) return;
                done = true;
                vid.removeEventListener('canplay', onReady);
                vid.removeEventListener('loadeddata', onReady);
                vid.removeEventListener('error', onErr);
                clearTimeout(timer);
                ok ? resolve() : reject(err || new Error('cannot play'));
            };
            const onReady = () => finish(true);
            const onErr = () => finish(false, vid.error || new Error('decode error'));
            const timer = setTimeout(() => {
                finish(vid.readyState >= 2, vid.error || new Error('timeout'));
            }, timeoutMs);
            vid.addEventListener('canplay', onReady);
            vid.addEventListener('loadeddata', onReady);
            vid.addEventListener('error', onErr);
            if (vid.readyState < 2) vid.load();
        });
    }

    async function playPreviewVideo() {
        const vid = document.getElementById('social-preview-video');
        if (!vid || vid.classList.contains('hidden')) return;
        hidePreviewPlayBtn();
        try {
            await waitVideoCanPlay(vid);
            vid.currentTime = 0;
            vid.muted = true;
            await vid.play();
            vid.muted = false;
        } catch (_) {
            try {
                vid.muted = false;
                await vid.play();
            } catch (err) {
                console.warn('[SocialFeed] preview play:', err);
                showPreviewPlayBtn();
                window.toast?.('Không phát được — đợi vài giây rồi bấm ▶ lại (video đang tải từ Drive)', true, 4500);
            }
        }
    }

    function bindPreviewPlayButton() {
        const btn = document.getElementById('social-preview-play');
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        const run = e => {
            e.preventDefault();
            e.stopPropagation();
            playPreviewVideo();
        };
        btn.addEventListener('click', run);
        btn.addEventListener('touchend', run, { passive: false });
    }

    function getVideoDurationSec(vid) {
        const d = vid?.duration;
        if (d && Number.isFinite(d) && d > 0 && d !== Infinity) return d;
        return lastRecordDurationSec > 0 ? lastRecordDurationSec : 0;
    }

    function setupPreviewVideoElement(vid, playUrl, blob, posterUrl) {
        if (!vid || !playUrl) return;
        const frame = document.querySelector('.social-locket-frame');
        frame?.classList.add('is-video-preview');
        bindPreviewPlayButton();

        vid.pause();
        vid.onloadedmetadata = null;
        vid.onloadeddata = null;
        vid.onplaying = null;
        vid.onpause = null;
        vid.onended = null;
        vid.onerror = null;

        if (posterUrl) vid.poster = posterUrl;
        else vid.removeAttribute('poster');
        vid.src = playUrl;
        vid.muted = true;
        vid.defaultMuted = false;
        vid.controls = true;
        vid.setAttribute('playsinline', '');
        vid.setAttribute('webkit-playsinline', '');
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.classList.remove('hidden');
        showPreviewPlayBtn();

        const refreshMeta = () => {
            const dur = getVideoDurationSec(vid);
            if (blob) {
                const durPart = dur > 0
                    ? '<span><i class="fas fa-clock"></i> ' + formatDurationLabel(dur) + '</span>'
                    : '';
                setMediaInfo([
                    durPart,
                    '<span><i class="fas fa-database"></i> ' + formatFileSize(blob.size) + '</span>',
                ].filter(Boolean), true);
            }
        };

        vid.onloadedmetadata = refreshMeta;
        vid.onplaying = hidePreviewPlayBtn;
        vid.onpause = () => {
            if (vid.ended || vid.currentTime >= 0.15) showPreviewPlayBtn();
        };
        vid.onended = showPreviewPlayBtn;
        vid.onerror = () => {
            showPreviewPlayBtn();
            setComposerStatus('Bấm nút ▶ giữa khung hoặc thanh điều khiển dưới video', 'err');
        };
        refreshMeta();
        vid.load();
    }

    function captureCameraPoster() {
        const video = document.getElementById('social-camera-video');
        if (!video?.videoWidth) return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (cameraFacing === 'user') {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.82);
        } catch (_) {
            return null;
        }
    }

    function formatFileSize(bytes) {
        const n = Math.max(0, Number(bytes) || 0);
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function formatDurationClock(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m + ':' + String(r).padStart(2, '0');
    }

    function formatDurationLabel(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        if (s < 60) return s + ' giây';
        return formatDurationClock(s);
    }

    function estimateDataUrlBytes(dataUrl) {
        if (!dataUrl) return 0;
        const base64 = String(dataUrl).split(',')[1] || '';
        return Math.floor(base64.length * 0.75);
    }

    function getRecordedBytes() {
        return recordChunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
    }

    function buildMediaInfoHtml(parts) {
        return parts.filter(Boolean).join('<span class="social-media-info-sep">·</span>');
    }

    function setMediaInfo(parts, show) {
        const el = document.getElementById('social-media-info');
        if (!el) return;
        if (!show || !parts?.length) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }
        el.innerHTML = buildMediaInfoHtml(parts);
        el.classList.remove('hidden');
    }

    function clearMediaInfo() {
        setMediaInfo([], false);
    }

    function updateRecordingMediaInfo() {
        const elapsed = (Date.now() - recordStartedAt) / 1000;
        lastRecordDurationSec = Math.floor(elapsed);
        const recBadge = document.getElementById('social-rec-badge');
        if (recBadge) {
            recBadge.innerHTML = '<span class="social-rec-dot"></span> REC ' + formatDurationClock(elapsed);
        }
        const sizePart = getRecordedBytes() > 0
            ? '<span><i class="fas fa-database"></i> ' + formatFileSize(getRecordedBytes()) + '</span>'
            : '';
        setMediaInfo([
            '<span><i class="fas fa-clock"></i> ' + formatDurationLabel(elapsed) + '</span>',
            sizePart,
        ].filter(Boolean), true);
    }

    function startRecordingTicker() {
        clearInterval(recordTickInterval);
        recordStartedAt = Date.now();
        updateRecordingMediaInfo();
        recordTickInterval = setInterval(updateRecordingMediaInfo, 250);
    }

    function stopRecordingTicker() {
        clearInterval(recordTickInterval);
        recordTickInterval = null;
        recordStartedAt = 0;
    }

    function updatePreviewMediaInfo(src, mediaType) {
        const bytes = estimateDataUrlBytes(src);
        const sizePart = '<span><i class="fas fa-database"></i> ' + formatFileSize(bytes) + '</span>';
        if (mediaType !== 'video') {
            setMediaInfo([sizePart], true);
            return;
        }
        const vid = document.getElementById('social-preview-video');
        const applyDuration = () => {
            const dur = vid?.duration;
            const durPart = dur && Number.isFinite(dur)
                ? '<span><i class="fas fa-clock"></i> ' + formatDurationLabel(dur) + '</span>'
                : '';
            setMediaInfo([durPart, sizePart].filter(Boolean), true);
        };
        if (!vid) {
            setMediaInfo([sizePart], true);
            return;
        }
        vid.onloadedmetadata = applyDuration;
        if (vid.readyState >= 1) applyDuration();
        else setMediaInfo([sizePart], true);
    }

    function renderPostMediaMeta(post) {
        const imageData = post?.imageData || '';
        const mediaType = post?.mediaType || 'image';
        const isVid = mediaType === 'video' || String(imageData).startsWith('data:video/');
        const bytes = post?.mediaBytes || estimateDataUrlBytes(imageData);
        const size = formatFileSize(bytes);
        const sizeHtml = '<span><i class="fas fa-database"></i> ' + esc(size) + '</span>';
        if (!isVid) return '<div class="social-post-media-meta">' + sizeHtml + '</div>';
        return '<div class="social-post-media-meta" data-post-media-meta="video">' + sizeHtml
            + '<span class="social-post-dur" data-post-dur><i class="fas fa-clock"></i> …</span></div>';
    }

    function dataUrlToBlob(dataUrl) {
        const parts = String(dataUrl).split(',');
        const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
        const bin = atob(parts[1] || '');
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    async function uploadVideoPreviewToDrive(blob) {
        const form = new FormData();
        const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
        form.append('video', blob, `shop-video-preview-${Date.now()}.${ext}`);
        const secHeaders = window.SecurityClient
            ? await window.SecurityClient.secureHeaders()
            : {};
        const headers = { ...secHeaders };
        const token = localStorage.getItem('auth_token');
        if (token) headers.Authorization = 'Bearer ' + token;
        const res = await fetch('/api/social/video/preview', { method: 'POST', headers, body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không tải video lên Drive để xem trước');
        return data;
    }

    async function deleteDrivePreviewDraft(fileId) {
        if (!fileId) return;
        const secHeaders = window.SecurityClient
            ? await window.SecurityClient.secureHeaders()
            : {};
        const headers = { ...secHeaders };
        const token = localStorage.getItem('auth_token');
        if (token) headers.Authorization = 'Bearer ' + token;
        await fetch('/api/social/video/preview/' + encodeURIComponent(fileId), {
            method: 'DELETE',
            headers,
        }).catch(() => {});
    }

    async function uploadVideoPost(blob, caption, driveFileId) {
        const form = new FormData();
        form.append('caption', caption || '');
        if (driveFileId) {
            form.append('driveFileId', driveFileId);
        } else {
            const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
            form.append('video', blob, `shop-video-${Date.now()}.${ext}`);
        }
        const secHeaders = window.SecurityClient
            ? await window.SecurityClient.secureHeaders()
            : {};
        const headers = { ...secHeaders };
        const token = localStorage.getItem('auth_token');
        if (token) headers.Authorization = 'Bearer ' + token;
        const res = await fetch('/api/social/posts/video', { method: 'POST', headers, body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không đăng được video');
        return data;
    }

    async function prepareVideoPreviewOnDrive(blob, poster) {
        const postBtn = document.getElementById('social-post-btn');
        if (postBtn) postBtn.disabled = true;
        setComposerStatus('Đang tải video lên Google Drive...');
        try {
            const data = await uploadVideoPreviewToDrive(blob);
            pendingDriveFileId = data.driveFileId || null;
            pendingDriveStreamUrl = data.previewUrl || null;
            showPreview(pendingDriveStreamUrl, 'video', blob, poster);
            window.toast?.('Video đã lên Drive — bấm ▶ để xem lại', false, 2800);
        } finally {
            if (postBtn) postBtn.disabled = false;
        }
    }

    function bindFeedMediaMeta(root) {
        root.querySelectorAll('[data-post-media-meta="video"]').forEach(meta => {
            const card = meta.closest('[data-post-id]');
            const vid = card?.querySelector('.social-post-video');
            const durEl = meta.querySelector('[data-post-dur]');
            if (!vid || !durEl) return;
            const apply = () => {
                const dur = vid.duration;
                if (!dur || !Number.isFinite(dur)) return;
                durEl.innerHTML = '<i class="fas fa-clock"></i> ' + esc(formatDurationLabel(dur));
            };
            vid.addEventListener('loadedmetadata', apply, { once: true });
            if (vid.readyState >= 1) apply();
        });
    }

    function releaseSilentAudio() {
        if (silentAudioCleanup) {
            try { silentAudioCleanup(); } catch (_) {}
            silentAudioCleanup = null;
        }
        silentAudioCtx = null;
    }

    /** Gắn track âm thanh im lặng để container WebM/MP4 phát được sau khi quay */
    function buildRecordStream(videoStream) {
        releaseSilentAudio();
        if (!videoStream) return null;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return videoStream;
        try {
            const ctx = new AudioCtx();
            const dest = ctx.createMediaStreamDestination();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.0001;
            osc.frequency.value = 440;
            osc.connect(gain);
            gain.connect(dest);
            osc.start();
            const audioTrack = dest.stream.getAudioTracks()[0];
            if (!audioTrack) {
                ctx.close();
                return videoStream;
            }
            silentAudioCtx = ctx;
            silentAudioCleanup = () => {
                try { osc.stop(); } catch (_) {}
                try { osc.disconnect(); gain.disconnect(); } catch (_) {}
                try { audioTrack.stop(); } catch (_) {}
                if (ctx.state !== 'closed') ctx.close();
            };
            return new MediaStream([...videoStream.getVideoTracks(), audioTrack]);
        } catch (e) {
            console.warn('[SocialFeed] silent audio:', e);
            return videoStream;
        }
    }

    function getRecorderMime() {
        const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const candidates = isApple
            ? ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9']
            : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
        for (const mime of candidates) {
            if (MediaRecorder.isTypeSupported(mime)) return mime;
        }
        return '';
    }

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
            const showFlip = isPhoneDevice() && !!cameraStream && !pendingImage && !pendingVideoBlob && composerMode === 'photo';
            flipBtn.classList.toggle('is-visible', showFlip);
            flipBtn.title = cameraFacing === 'user' ? 'Chuyển camera sau' : 'Chuyển camera trước';
        }
    }

    function esc(s) {
        return (window.escapeHtml || (x => String(x ?? '')))(s);
    }

    function fmtTime(d) {
        if (typeof window.formatDateTimeVN === 'function') return window.formatDateTimeVN(d);
        const dt = new Date(d);
        return dt.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
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
        const hasMedia = !!pendingImage || !!pendingVideoBlob;
        shutter.classList.toggle('is-live', !!cameraStream && !hasMedia);
        shutter.classList.toggle('is-captured', false);
        shutter.disabled = hasMedia;
    }

    function updateComposerMode() {
        const studio = document.querySelector('.social-locket-studio');
        const frame = document.querySelector('.social-locket-frame');
        const controls = document.querySelector('.social-locket-controls');
        const hasPreview = !!pendingImage || !!pendingVideoBlob;
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

    function saveMediaToDevice(dataUrlOrBlob, label) {
        if (!dataUrlOrBlob) return;
        const isBlob = dataUrlOrBlob instanceof Blob;
        const isVid = isBlob
            ? (dataUrlOrBlob.type || '').startsWith('video/')
            : String(dataUrlOrBlob).startsWith('data:video/') || String(dataUrlOrBlob).startsWith('blob:');
        const ext = isVid
            ? ((isBlob ? dataUrlOrBlob.type : dataUrlOrBlob).includes('mp4') ? 'mp4' : 'webm')
            : 'jpg';
        let tempUrl = null;
        try {
            const a = document.createElement('a');
            a.href = isBlob ? (tempUrl = URL.createObjectURL(dataUrlOrBlob)) : dataUrlOrBlob;
            a.download = `shop-${isVid ? 'video' : 'anh'}-${label || 'luu'}-${Date.now()}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.toast?.(isVid ? 'Đã lưu video vào máy' : 'Đã lưu ảnh vào máy');
        } catch (_) {
            window.toast?.('Không lưu được — thử tải thủ công', true);
        } finally {
            if (tempUrl) URL.revokeObjectURL(tempUrl);
        }
    }

    function saveImageToDevice(dataUrl, label) {
        saveMediaToDevice(dataUrl, label);
    }

    function showPreview(src, mediaType, videoBlob, posterUrl) {
        const isVid = mediaType === 'video' || !!videoBlob
            || (src && String(src).startsWith('data:video/'))
            || (src && String(src).startsWith('/api/social/preview/'));
        pendingMediaType = isVid ? 'video' : 'image';
        pendingImage = isVid ? null : src;
        if (isVid && videoBlob) {
            pendingVideoBlob = videoBlob;
            previewPosterUrl = posterUrl || previewPosterUrl || null;
            revokePreviewObjectUrl();
            if (pendingDriveStreamUrl) {
                previewObjectUrl = null;
                pendingImage = pendingDriveStreamUrl;
            } else {
                previewObjectUrl = URL.createObjectURL(videoBlob);
                pendingImage = previewObjectUrl;
            }
        } else if (!isVid) {
            previewPosterUrl = null;
            pendingVideoBlob = null;
            pendingDriveFileId = null;
            pendingDriveStreamUrl = null;
            revokePreviewObjectUrl();
        }

        const preview = document.getElementById('social-preview');
        const previewVid = document.getElementById('social-preview-video');
        const placeholder = document.getElementById('social-preview-placeholder');
        if (preview) {
            preview.classList.toggle('hidden', isVid);
            if (!isVid) preview.src = src;
            else preview.src = '';
        }
        if (previewVid) {
            if (isVid) {
                const playUrl = pendingDriveStreamUrl || previewObjectUrl || src;
                setupPreviewVideoElement(previewVid, playUrl, pendingVideoBlob, previewPosterUrl);
            } else {
                hidePreviewPlayBtn();
                previewVid.pause?.();
                previewVid.src = '';
                previewVid.classList.add('hidden');
            }
        }
        placeholder?.classList.add('hidden');
        document.getElementById('social-post-row')?.classList.remove('hidden');
        const postBtn = document.getElementById('social-post-btn');
        const cancelBtn = document.getElementById('social-cancel-preview');
        if (postBtn) postBtn.innerHTML = isVid
            ? '<i class="fas fa-paper-plane mr-1"></i>Đăng video'
            : '<i class="fas fa-paper-plane mr-1"></i>Đăng ảnh';
        if (cancelBtn) cancelBtn.innerHTML = isVid
            ? '<i class="fas fa-times mr-1"></i>Hủy video'
            : '<i class="fas fa-times mr-1"></i>Hủy ảnh';
        updateShutterState();
        updateCameraUi();
        updateComposerMode();
        setComposerStatus(
            isVid
                ? (pendingDriveStreamUrl
                    ? 'Video trên Google Drive — bấm ▶ để xem lại, rồi Đăng hoặc Hủy'
                    : 'Bấm ▶ trên video để xem lại — Đăng, Lưu hoặc Hủy')
                : 'Đăng ảnh, Lưu vào máy, hoặc Hủy',
            'ok'
        );
        if (isVid && pendingVideoBlob) {
            const durPart = lastRecordDurationSec > 0
                ? '<span><i class="fas fa-clock"></i> ' + formatDurationLabel(lastRecordDurationSec) + '</span>'
                : '';
            setMediaInfo([
                durPart,
                '<span><i class="fas fa-database"></i> ' + formatFileSize(pendingVideoBlob.size) + '</span>',
            ].filter(Boolean), true);
        } else if (!isVid) {
            updatePreviewMediaInfo(src, pendingMediaType);
        }
        if (shouldSaveWhen('capture')) {
            saveMediaToDevice(isVid ? (pendingVideoBlob || src) : src, isVid ? 'quay' : 'chup');
        }
    }

    function clearPreview(opts = {}) {
        const keepDrive = !!opts.keepDrive;
        if (!keepDrive && pendingDriveFileId) {
            deleteDrivePreviewDraft(pendingDriveFileId);
        }
        pendingImage = null;
        pendingVideoBlob = null;
        pendingMediaType = 'image';
        lastRecordDurationSec = 0;
        previewPosterUrl = null;
        pendingDriveFileId = null;
        pendingDriveStreamUrl = null;
        revokePreviewObjectUrl();
        releaseSilentAudio();
        hidePreviewPlayBtn();
        document.querySelector('.social-locket-frame')?.classList.remove('is-video-preview');
        const preview = document.getElementById('social-preview');
        const previewVid = document.getElementById('social-preview-video');
        const placeholder = document.getElementById('social-preview-placeholder');
        if (preview) {
            preview.src = '';
            preview.classList.add('hidden');
        }
        if (previewVid) {
            previewVid.onloadedmetadata = null;
            previewVid.onloadeddata = null;
            previewVid.onerror = null;
            previewVid.pause?.();
            previewVid.removeAttribute('src');
            previewVid.load();
            previewVid.classList.add('hidden');
        }
        placeholder?.classList.remove('hidden');
        document.getElementById('social-post-row')?.classList.add('hidden');
        const postBtn = document.getElementById('social-post-btn');
        if (postBtn) postBtn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Đăng';
        updateShutterState();
        updateCameraUi();
        updateComposerMode();
        updateComposerStatusText();
        clearMediaInfo();
    }

    function updateComposerStatusText() {
        if (composerMode === 'video') {
            if (!driveAdminBackup) {
                setComposerStatus('Đăng video cần admin kết nối Google Drive — video sẽ lưu trên Drive, không vào bộ nhớ web', 'err');
                return;
            }
            setComposerStatus(
                cameraStream
                    ? (mediaRecorder?.state === 'recording' ? 'Đang quay... bấm nút đỏ để dừng' : 'Bấm nút tròn để bắt đầu quay (tối đa 20 giây)')
                    : 'Quay video — lưu trên Google Drive, bấm nút tròn',
                mediaRecorder?.state === 'recording' ? 'recording' : ''
            );
        } else {
            setComposerStatus(cameraStream ? 'Căn khung hình rồi bấm nút tròn tím' : 'Chụp ảnh gửi cho bạn bè');
        }
    }

    function stopVideoRecord() {
        clearTimeout(recordingTimer);
        recordingTimer = null;
        stopRecordingTicker();
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            try { mediaRecorder.requestData(); } catch (_) {}
            mediaRecorder.stop();
        }
        updateShutterRecordingState(false);
    }

    function updateShutterRecordingState(recording) {
        const shutter = document.getElementById('social-shutter-btn');
        const recBadge = document.getElementById('social-rec-badge');
        if (shutter) shutter.classList.toggle('is-recording', !!recording);
        if (recBadge) {
            recBadge.classList.toggle('hidden', !recording);
            if (!recording) recBadge.innerHTML = '<span class="social-rec-dot"></span> REC';
        }
        if (!recording && !pendingImage && !pendingVideoBlob) clearMediaInfo();
    }

    async function startVideoRecord() {
        if (!cameraStream) await startCamera();
        if (!cameraStream) return;
        const mime = getRecorderMime();
        if (!mime || typeof MediaRecorder === 'undefined') {
            window.toast?.('Trình duyệt không hỗ trợ quay video — chọn video từ máy', true);
            return;
        }
        recordChunks = [];
        const recordStream = buildRecordStream(cameraStream);
        if (silentAudioCtx?.state === 'suspended') {
            try { await silentAudioCtx.resume(); } catch (_) {}
        }
        try {
            mediaRecorder = new MediaRecorder(recordStream, {
                mimeType: mime,
                videoBitsPerSecond: 900000,
            });
        } catch (e) {
            releaseSilentAudio();
            window.toast?.('Không quay được video trên thiết bị này', true);
            return;
        }
        mediaRecorder.ondataavailable = e => {
            if (e.data && e.data.size) recordChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
            const blobType = mediaRecorder.mimeType || mime;
            const blob = new Blob(recordChunks, { type: blobType });
            const poster = captureCameraPoster();
            recordChunks = [];
            mediaRecorder = null;
            releaseSilentAudio();
            if (blob.size < 2048) {
                window.toast?.('Video quá ngắn — giữ nút quay ít nhất 1–2 giây', true);
                lastRecordDurationSec = 0;
                stopCameraTracksOnly();
                updateComposerStatusText();
                return;
            }
            if (blob.size > MAX_VIDEO_FILE_MB * 1024 * 1024) {
                window.toast?.('Video quá lớn — quay ngắn hơn (tối đa ~20 giây)', true);
                lastRecordDurationSec = 0;
                stopCameraTracksOnly();
                updateComposerStatusText();
                return;
            }
            stopCameraTracksOnly();
            if (driveAdminBackup) {
                try {
                    await prepareVideoPreviewOnDrive(blob, poster);
                } catch (err) {
                    console.warn('[SocialFeed] drive preview:', err);
                    window.toast?.(err.message || 'Không tải lên Drive — thử lại', true);
                    lastRecordDurationSec = 0;
                    updateComposerStatusText();
                }
            } else {
                showPreview(null, 'video', blob, poster);
            }
        };
        lastRecordDurationSec = 0;
        mediaRecorder.start();
        recordingTimer = setTimeout(() => {
            if (mediaRecorder?.state === 'recording') {
                stopVideoRecord();
                window.toast?.('Đã quay đủ 20 giây', false, 2500);
            }
        }, MAX_VIDEO_SEC * 1000);
        updateShutterRecordingState(true);
        startRecordingTicker();
        setComposerStatus('Đang quay... bấm nút đỏ để dừng', 'recording');
    }

    function stopCameraTracksOnly() {
        releaseSilentAudio();
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        const video = document.getElementById('social-camera-video');
        if (video) {
            video.srcObject = null;
            video.classList.add('hidden');
        }
    }

    async function stopCamera() {
        stopVideoRecord();
        stopCameraTracksOnly();
        if (!pendingImage && !pendingVideoBlob) {
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
            updateComposerStatusText();
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
        if (!file) return;
        const isImg = file.type.startsWith('image/');
        const isVid = file.type.startsWith('video/');
        if (!isImg && !isVid) {
            window.toast?.('Chọn file ảnh hoặc video hợp lệ', true);
            return;
        }
        if (isVid && file.size > MAX_VIDEO_FILE_MB * 1024 * 1024) {
            window.toast?.('Video quá lớn (tối đa ~' + MAX_VIDEO_FILE_MB + 'MB)', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                if (isImg) {
                    const compressed = await compressDataUrl(reader.result);
                    await stopCamera();
                    showPreview(compressed, 'image');
                } else {
                    if (file.size > MAX_VIDEO_FILE_MB * 1024 * 1024) {
                        window.toast?.('Video quá lớn để đăng', true);
                        return;
                    }
                    await stopCamera();
                    if (driveAdminBackup) {
                        try {
                            await prepareVideoPreviewOnDrive(file, null);
                        } catch (err) {
                            window.toast?.(err.message || 'Không tải video lên Drive', true);
                        }
                    } else {
                        showPreview(null, 'video', file);
                    }
                }
            } catch (err) {
                window.toast?.(err.message || 'Không đọc được file', true);
            }
        };
        reader.readAsDataURL(file);
    }

    async function publishPost() {
        const user = window.currentUser;
        if (!user) return;
        if (!pendingImage && !pendingVideoBlob) {
            window.toast?.('Chụp/quay hoặc chọn media trước', true);
            return;
        }
        const isVid = isVideoMedia();
        if (isVid && !driveAdminBackup) {
            window.toast?.('Đăng video cần Google Drive admin đã kết nối — liên hệ admin.', true, 6000);
            return;
        }
        if (!isVid && pendingImage.length > MAX_IMAGE_CHARS) {
            window.toast?.('Ảnh quá lớn — chụp lại', true);
            return;
        }
        const confirmMsg = isVid
            ? 'Đăng video này lên bảng tin?\nVideo lưu trên Google Drive — bạn bè đã kết bạn sẽ xem được.'
            : 'Đăng ảnh này lên bảng tin?\nBạn bè đã kết bạn sẽ xem được.';
        if (!confirm(confirmMsg)) return;
        const caption = document.getElementById('social-caption')?.value.trim() || '';
        const imageToPost = pendingImage;
        const videoBlob = pendingVideoBlob;
        const btn = document.getElementById('social-post-btn');
        if (btn) btn.disabled = true;
        try {
            setComposerStatus(isVid ? 'Đang tải video lên Drive...' : 'Đang đăng ảnh...');
            const res = isVid
                ? await uploadVideoPost(
                    videoBlob || dataUrlToBlob(imageToPost),
                    caption,
                    pendingDriveFileId
                )
                : await socialApi('/social/posts', {
                    method: 'POST',
                    body: JSON.stringify({ caption, imageData: imageToPost }),
                });
            if (shouldSaveWhen('post')) {
                saveImageToDevice(isVid ? (videoBlob || imageToPost) : imageToPost, 'dang');
            }
            document.getElementById('social-caption').value = '';
            clearPreview({ keepDrive: true });
            const posted = isVid ? 'video' : 'ảnh';
            if (isVid && res.driveSynced) {
                window.toast?.('Đã đăng video — lưu trên Google Drive!');
            } else if (res.driveSynced) {
                window.toast?.('Đã đăng ' + posted + ' — admin đã sao lưu lên Drive!');
            } else if (res.driveWarning && driveAdminBackup) {
                window.toast?.(
                    'Đã đăng ' + posted + ' — Drive sẽ tự đồng bộ lại sau vài phút. (' + res.driveWarning + ')',
                    true,
                    6000
                );
            } else {
                window.toast?.('Đã đăng ' + posted + ' lên bảng tin!');
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

    function renderReactionSummary(post) {
        const reactions = post.reactions || {};
        const keys = Object.keys(reactions).filter(k => reactions[k] > 0);
        if (!keys.length && !post.reactionTotal) return '';
        const chips = keys.map(k =>
            '<span class="social-reaction-chip">' + (REACTION_EMOJI[k] || k) + ' ' + reactions[k] + '</span>'
        ).join('');
        const total = post.reactionTotal || keys.reduce((s, k) => s + (reactions[k] || 0), 0);
        return '<div class="social-reaction-summary">'
            + chips
            + (total ? '<span class="social-reaction-total">' + total + ' cảm xúc</span>' : '')
            + '</div>';
    }

    function renderReactionBar(post) {
        const my = post.myReaction || '';
        const btns = REACTION_DEFS.map(r => {
            const active = my === r.key ? ' is-active' : '';
            const count = (post.reactions || {})[r.key] || 0;
            return '<button type="button" class="social-reaction-btn' + active + '"'
                + ' data-react-post="' + post.id + '" data-reaction="' + r.key + '"'
                + ' title="' + esc(r.label) + '" aria-label="' + esc(r.label) + '">'
                + '<span class="social-reaction-emoji">' + r.emoji + '</span>'
                + (count ? '<span class="social-reaction-count">' + count + '</span>' : '')
                + '</button>';
        }).join('');
        return '<div class="social-reaction-bar">' + btns + '</div>';
    }

    function renderCommentSection(post) {
        const count = post.commentCount || 0;
        return `
        <div class="social-comments" data-comments-for="${post.id}">
            <button type="button" class="social-comments-toggle" data-toggle-comments="${post.id}">
                <i class="fas fa-comment"></i>
                ${count ? count + ' bình luận' : 'Bình luận'}
            </button>
            <div class="social-comments-body hidden" data-comments-body="${post.id}">
                <div class="social-comments-list" data-comments-list="${post.id}"></div>
            </div>
            <form class="social-comment-form" data-comment-form="${post.id}">
                <input type="text" maxlength="500" class="social-comment-input"
                    placeholder="Viết bình luận..." data-comment-input="${post.id}" autocomplete="off">
                <button type="submit" class="social-comment-send" aria-label="Gửi bình luận">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </form>
        </div>`;
    }

    function renderCommentItem(c, postId) {
        const name = c.author?.fullName || c.author?.email || 'Người dùng';
        const initial = name.charAt(0).toUpperCase();
        return `
        <div class="social-comment-item" data-comment-id="${c.id}">
            <div class="social-comment-avatar">${esc(initial)}</div>
            <div class="social-comment-bubble">
                <div class="social-comment-author">${esc(name)}</div>
                <div class="social-comment-text">${esc(c.content)}</div>
                <div class="social-comment-time">${esc(fmtTime(c.createdAt))}</div>
            </div>
            ${c.isMine ? `<button type="button" class="social-comment-delete" data-delete-comment="${c.id}" data-post-id="${postId}" title="Xóa"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
    }

    async function toggleReaction(postId, reaction) {
        try {
            const res = await socialApi('/social/posts/' + postId + '/reactions', {
                method: 'POST',
                body: JSON.stringify({ reaction }),
            });
            const card = document.querySelector('[data-post-id="' + postId + '"]');
            if (!card) return;
            const bar = card.querySelector('.social-reaction-bar');
            const summary = card.querySelector('.social-reaction-summary');
            if (bar) {
                bar.outerHTML = renderReactionBar({
                    id: postId,
                    myReaction: res.myReaction,
                    reactions: res.reactions,
                    reactionTotal: res.reactionTotal,
                });
                bindReactionButtons(card);
            }
            if (summary) {
                summary.outerHTML = renderReactionSummary({
                    reactions: res.reactions,
                    reactionTotal: res.reactionTotal,
                });
            } else if (res.reactionTotal) {
                const engage = card.querySelector('.social-post-engage');
                engage?.insertAdjacentHTML('afterbegin', renderReactionSummary({
                    reactions: res.reactions,
                    reactionTotal: res.reactionTotal,
                }));
            }
        } catch (err) {
            window.toast?.(err.message, true);
        }
    }

    async function loadComments(postId, forceOpen) {
        const card = document.querySelector('[data-post-id="' + postId + '"]');
        if (!card) return;
        const body = card.querySelector('[data-comments-body="' + postId + '"]');
        const list = card.querySelector('[data-comments-list="' + postId + '"]');
        if (!body || !list) return;
        if (!forceOpen && !body.classList.contains('hidden')) {
            body.classList.add('hidden');
            return;
        }
        body.classList.remove('hidden');
        list.innerHTML = '<div class="social-comment-loading"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const { comments } = await socialApi('/social/posts/' + postId + '/comments');
            list.innerHTML = comments?.length
                ? comments.map(c => renderCommentItem(c, postId)).join('')
                : '<div class="social-comment-empty">Chưa có bình luận — hãy là người đầu tiên!</div>';
            bindCommentDeletes(card);
        } catch (err) {
            list.innerHTML = '<div class="social-comment-empty">' + esc(err.message) + '</div>';
        }
    }

    async function submitComment(postId, content) {
        const res = await socialApi('/social/posts/' + postId + '/comments', {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
        const card = document.querySelector('[data-post-id="' + postId + '"]');
        if (!card) return res;
        const toggle = card.querySelector('[data-toggle-comments="' + postId + '"]');
        if (toggle) {
            toggle.innerHTML = '<i class="fas fa-comment"></i> ' + (res.commentCount || 0) + ' bình luận';
        }
        const body = card.querySelector('[data-comments-body="' + postId + '"]');
        const list = card.querySelector('[data-comments-list="' + postId + '"]');
        if (body && list) {
            body.classList.remove('hidden');
            const empty = list.querySelector('.social-comment-empty');
            if (empty) empty.remove();
            list.insertAdjacentHTML('beforeend', renderCommentItem(res.comment, postId));
            bindCommentDeletes(card);
        }
        return res;
    }

    async function deleteComment(postId, commentId) {
        if (!confirm('Xóa bình luận này?')) return;
        try {
            const res = await socialApi('/social/posts/' + postId + '/comments/' + commentId, {
                method: 'DELETE',
            });
            const item = document.querySelector('[data-comment-id="' + commentId + '"]');
            item?.remove();
            const card = document.querySelector('[data-post-id="' + postId + '"]');
            const toggle = card?.querySelector('[data-toggle-comments="' + postId + '"]');
            if (toggle) {
                const n = res.commentCount || 0;
                toggle.innerHTML = '<i class="fas fa-comment"></i> ' + (n ? n + ' bình luận' : 'Bình luận');
            }
            const list = card?.querySelector('[data-comments-list="' + postId + '"]');
            if (list && !list.querySelector('.social-comment-item')) {
                list.innerHTML = '<div class="social-comment-empty">Chưa có bình luận — hãy là người đầu tiên!</div>';
            }
        } catch (err) {
            window.toast?.(err.message, true);
        }
    }

    function bindReactionButtons(root) {
        root.querySelectorAll('[data-react-post]').forEach(btn => {
            btn.addEventListener('click', () => {
                toggleReaction(Number(btn.dataset.reactPost), btn.dataset.reaction);
            });
        });
    }

    function bindCommentDeletes(root) {
        root.querySelectorAll('[data-delete-comment]').forEach(btn => {
            btn.addEventListener('click', () => {
                deleteComment(Number(btn.dataset.postId), Number(btn.dataset.deleteComment));
            });
        });
    }

    function bindEngagement(root) {
        bindReactionButtons(root);
        bindCommentDeletes(root);
        root.querySelectorAll('[data-toggle-comments]').forEach(btn => {
            btn.addEventListener('click', () => loadComments(Number(btn.dataset.toggleComments), true));
        });
        root.querySelectorAll('[data-comment-form]').forEach(form => {
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const postId = Number(form.dataset.commentForm);
                const input = form.querySelector('[data-comment-input="' + postId + '"]');
                const text = input?.value.trim() || '';
                if (!text) return;
                const submitBtn = form.querySelector('.social-comment-send');
                if (submitBtn) submitBtn.disabled = true;
                try {
                    await submitComment(postId, text);
                    if (input) input.value = '';
                    window.toast?.('Đã gửi bình luận', false, 1800);
                } catch (err) {
                    window.toast?.(err.message, true);
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        });
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
            el.innerHTML = '<div class="social-empty"><i class="fas fa-images"></i><p>Chưa có bài đăng. Hãy đăng ảnh/video hoặc kết bạn để xem bảng tin!</p></div>';
            return;
        }
        el.innerHTML = posts.map(p => {
            const name = p.author?.fullName || p.author?.email || 'Người dùng';
            const initial = name.charAt(0).toUpperCase();
            const isVid = p.mediaType === 'video' || String(p.imageData).startsWith('data:video/') || !!p.mediaUrl;
            const mediaSrc = p.mediaUrl || p.imageData || '';
            const driveBadge = p.driveStored
                ? '<span class="social-drive-badge" title="Video lưu trên Google Drive"><i class="fab fa-google-drive"></i> Drive</span>'
                : '';
            return `
            <article class="social-post-card" data-post-id="${p.id}">
                <div class="social-post-header">
                    <div class="social-avatar">${esc(initial)}</div>
                    <div class="social-post-meta">
                        <div class="social-post-author">${esc(name)}</div>
                        <div class="social-post-time">${esc(fmtTime(p.createdAt))}</div>
                    </div>
                    <div class="social-post-actions">
                        ${driveBadge}
                        <button type="button" class="social-save-post-btn" data-save-post="${p.id}" title="Lưu vào máy"><i class="fas fa-download"></i></button>
                        ${p.isMine ? `<button type="button" class="social-delete-btn" data-delete-post="${p.id}" title="Hủy đăng"><i class="fas fa-times-circle mr-1"></i>Hủy đăng</button>` : ''}
                    </div>
                </div>
                ${p.caption ? `<p class="social-post-caption">${esc(p.caption)}</p>` : ''}
                ${isVid
                    ? `<video src="${esc(mediaSrc)}" class="social-post-video" controls playsinline preload="metadata"></video>`
                    : `<img src="${esc(mediaSrc)}" class="social-post-img" data-lightbox="1" alt="Ảnh bài đăng">`}
                ${renderPostMediaMeta(p)}
                <div class="social-post-engage">
                    ${renderReactionSummary(p)}
                    ${renderReactionBar(p)}
                    ${renderCommentSection(p)}
                </div>
            </article>`;
        }).join('');

        el.querySelectorAll('[data-delete-post]').forEach(btn => {
            btn.addEventListener('click', () => deletePost(Number(btn.dataset.deletePost)));
        });
        el.querySelectorAll('[data-save-post]').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('[data-post-id]');
                const img = card?.querySelector('.social-post-img');
                const vid = card?.querySelector('.social-post-video');
                const src = vid?.src || img?.src;
                if (src) saveMediaToDevice(src, 'bai');
            });
        });
        el.querySelectorAll('.social-post-img[data-lightbox]').forEach(img => {
            img.addEventListener('click', () => window.ShopFeatures?.openPhotoLightbox?.(img.src));
        });
        bindFeedMediaMeta(el);
        bindEngagement(el);
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
        if (pendingImage || pendingVideoBlob) return;
        if (composerMode === 'video') {
            if (!cameraStream) {
                await startCamera();
                return;
            }
            if (mediaRecorder?.state === 'recording') {
                stopVideoRecord();
            } else {
                await startVideoRecord();
            }
            return;
        }
        if (cameraStream) {
            await captureFromCamera();
            return;
        }
        await startCamera();
    }

    function updateFramePlaceholder() {
        const icon = document.getElementById('social-placeholder-icon');
        const text = document.getElementById('social-placeholder-text');
        const shutter = document.getElementById('social-shutter-btn');
        const isVid = composerMode === 'video';
        if (icon) icon.className = isVid ? 'fas fa-video' : 'fas fa-camera';
        if (text) {
            text.textContent = isVid
                ? 'Chế độ Video — bấm nút tròn để quay'
                : 'Chế độ Ảnh — bấm nút tròn để chụp';
        }
        if (shutter) {
            shutter.setAttribute('aria-label', isVid ? 'Quay video' : 'Chụp ảnh');
        }
    }

    function setComposerMode(mode) {
        composerMode = mode === 'video' ? 'video' : 'photo';
        document.getElementById('social-mode-photo')?.classList.toggle('is-active', composerMode === 'photo');
        document.getElementById('social-mode-video')?.classList.toggle('is-active', composerMode === 'video');
        const fileBtn = document.getElementById('social-file-btn');
        if (fileBtn) {
            fileBtn.title = composerMode === 'video' ? 'Chọn video từ máy' : 'Chọn ảnh từ máy';
            fileBtn.innerHTML = composerMode === 'video'
                ? '<i class="fas fa-film"></i>'
                : '<i class="fas fa-image"></i>';
        }
        updateFramePlaceholder();
        updateComposerStatusText();
    }

    function initModeToggle() {
        document.getElementById('social-mode-photo')?.addEventListener('click', async () => {
            if (composerMode === 'photo') return;
            stopVideoRecord();
            clearPreview();
            setComposerMode('photo');
            await stopCamera();
            await startCamera().catch(() => {});
        });
        document.getElementById('social-mode-video')?.addEventListener('click', async () => {
            if (composerMode === 'video') return;
            clearPreview();
            setComposerMode('video');
            await stopCamera();
            await startCamera().catch(() => {});
        });
    }

    async function onRetakeClick() {
        clearPreview();
        await stopCamera();
        await startCamera();
    }

    function onSavePreviewClick() {
        if (!pendingImage && !pendingVideoBlob) {
            window.toast?.('Chụp hoặc chọn media trước', true);
            return;
        }
        saveMediaToDevice(pendingVideoBlob || pendingImage, 'luu');
    }

    async function cancelPreview() {
        if (!pendingImage && !pendingVideoBlob) return;
        const isVid = isVideoMedia();
        if (!confirm(isVid ? 'Hủy video này?\nSẽ không đăng lên bảng tin.' : 'Hủy ảnh này?\nSẽ không đăng lên bảng tin.')) return;
        clearPreview();
        await stopCamera();
        await startCamera();
        window.toast?.(isVid ? 'Đã hủy video' : 'Đã hủy ảnh');
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
        const folderEl = document.getElementById('social-drive-folder-name');
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
        if (folderEl) {
            const root = data.folderName || '';
            const photo = data.photoFolderName || 'Ảnh';
            const video = data.videoFolderName || 'Video';
            if (root) {
                folderEl.innerHTML = '📁 <strong>' + esc(root) + '</strong>'
                    + '<br><span class="social-drive-subfolder"><i class="fas fa-image text-violet-500"></i> ' + esc(photo) + '</span>'
                    + ' · <span class="social-drive-subfolder"><i class="fas fa-video text-rose-500"></i> ' + esc(video) + '</span>';
            } else {
                folderEl.textContent = '';
            }
            folderEl.classList.toggle('hidden', !connected || !root);
        }
        const autoSyncEl = document.getElementById('social-drive-auto-sync');
        const autoSyncText = document.getElementById('social-drive-auto-sync-text');
        const auto = data.autoSync || {};
        if (autoSyncEl && connected) {
            autoSyncEl.classList.remove('hidden');
            const intervalMin = Math.max(1, Math.round((auto.intervalSec || 120) / 60));
            let msg = 'Tự động đồng bộ 24/7 — mỗi ~' + intervalMin + ' phút';
            if (auto.lastSyncAt) {
                const last = fmtTime(new Date(auto.lastSyncAt * 1000).toISOString());
                const synced = auto.lastSynced || 0;
                msg += synced > 0
                    ? ' · Lần cuối: +' + synced + ' file (' + last + ')'
                    : ' · Lần cuối: ' + last;
            }
            if (autoSyncText) autoSyncText.textContent = msg;
        } else if (autoSyncEl) {
            autoSyncEl.classList.add('hidden');
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
            const photoLabel = data.photoFolderName ? esc(data.photoFolderName) : 'Ảnh';
            const videoLabel = data.videoFolderName ? esc(data.videoFolderName) : 'Video';
            if (info && data.method === 'oauth' && driveEmail) {
                info.innerHTML = '<i class="fab fa-google-drive mr-1"></i>Ảnh → <strong>' + photoLabel
                    + '</strong> · Video → <strong>' + videoLabel + '</strong> (tự động 24/7).';
            } else if (info) {
                info.innerHTML = '<i class="fab fa-google-drive mr-1"></i>Ảnh → <strong>' + photoLabel
                    + '</strong> · Video → <strong>' + videoLabel + '</strong> (tự động 24/7).';
            }
        } catch (_) {
            driveAdminBackup = false;
            const setup = window.currentUser?.role === 'admin' ? await loadOAuthSetup() : null;
            renderDriveConnectCard({ oauthAvailable: false }, setup);
        }
        const isAdmin = window.currentUser?.role === 'admin';
        if (hint) hint.classList.toggle('hidden', !isAdmin || driveAdminBackup);
        if (info) info.classList.toggle('hidden', !isAdmin || !driveAdminBackup);
        updateComposerStatusText();
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
        bindPreviewPlayButton();

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

    async function syncOldPhotosToDrive() {
        const btn = document.getElementById('social-drive-sync-old');
        if (btn) btn.disabled = true;
        try {
            const res = await socialApi('/social/drive/sync', { method: 'POST', body: '{}' });
            const parts = [];
            if (res.photos) parts.push(res.photos + ' ảnh');
            if (res.videos) parts.push(res.videos + ' video');
            const detail = parts.length ? ' (' + parts.join(', ') + ')' : '';
            window.toast?.('Đã đồng bộ ' + (res.synced || 0) + ' file lên Drive' + detail + '!');
            await loadDriveStatus();
        } catch (err) {
            window.toast?.(err.message || 'Không đồng bộ được ảnh cũ', true);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function initDriveConnect() {
        document.getElementById('social-drive-connect-btn')?.addEventListener('click', connectGoogleDrive);
        document.getElementById('social-drive-disconnect')?.addEventListener('click', disconnectGoogleDrive);
        document.getElementById('social-drive-sync-old')?.addEventListener('click', syncOldPhotosToDrive);
        document.getElementById('social-drive-save-oauth')?.addEventListener('click', saveOAuthConfig);
        document.getElementById('social-drive-copy-redirect')?.addEventListener('click', copyRedirectUri);
    }

    function init() {
        initFabButton();
        initSaveMode();
        initModeToggle();
        initComposerEvents();
        initDriveConnect();
        setComposerMode('photo');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();