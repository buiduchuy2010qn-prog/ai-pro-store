/**
 * social-creative.js — Khung viền, caption màu, nền camera, quyền xem bạn bè
 * Tích hợp với SocialFeed (social-feed.js)
 */
(function () {
    'use strict';

    const FRAME_IDS = ['none', 'polaroid', 'neon', 'vintage', 'gold', 'aesthetic', 'film', 'minimal', 'rainbow', 'heart', 'custom'];

    const CAPTION_PRESETS = [
        { id: 'classic', label: 'Cổ điển', style: 'classic', color: '#ffffff', font: 'inherit', size: 16, position: 'bottom' },
        { id: 'neon', label: 'Neon', style: 'neon', color: '#e879f9', font: 'Impact, sans-serif', size: 18, position: 'center' },
        { id: 'outline', label: 'Viền chữ', style: 'outline', color: '#ffffff', font: 'Arial Black, sans-serif', size: 17, position: 'bottom' },
        { id: 'gradient', label: 'Gradient', style: 'gradient', color: '#ffffff', font: 'Georgia, serif', size: 18, position: 'center' },
        { id: 'bubble', label: 'Bong bóng', style: 'bubble', color: '#1e293b', font: 'system-ui, sans-serif', size: 15, position: 'bottom' },
        { id: 'minimal', label: 'Tối giản', style: 'minimal', color: '#ffffff', font: 'system-ui, sans-serif', size: 14, position: 'top' },
    ];

    const BG_PRESETS = [
        { id: 'none', label: 'Không' },
        { id: 'vintage', label: 'Vintage' },
        { id: 'polaroid', label: 'Polaroid' },
        { id: 'neon', label: 'Neon' },
        { id: 'aesthetic', label: 'Aesthetic' },
        { id: 'bokeh', label: 'Bokeh' },
        { id: 'warm', label: 'Ấm' },
        { id: 'cool', label: 'Lạnh' },
    ];

    let state = {
        frameId: 'none',
        customFrameUrl: null,
        captionStyle: { ...CAPTION_PRESETS[0] },
        bgId: 'none',
        bgOn: false,
        bgOpacity: 0.4,
        visibility: 'all_friends',
        audienceIds: new Set(),
        friends: [],
    };

    /** Vẽ khung viền lên canvas (ảnh) */
    function drawFrameOnCanvas(ctx, w, h, frameId, customImg) {
        if (frameId === 'none') return;
        if (frameId === 'custom' && customImg) {
            ctx.drawImage(customImg, 0, 0, w, h);
            return;
        }
        const pad = Math.round(Math.min(w, h) * 0.04);
        ctx.save();
        switch (frameId) {
            case 'polaroid':
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(ctx.canvas, pad, pad, w - pad * 2, h - pad * 2 - pad * 3);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, h - pad * 3, w, pad * 3);
                break;
            case 'neon':
                ctx.strokeStyle = '#c084fc';
                ctx.lineWidth = pad;
                ctx.shadowColor = '#a855f7';
                ctx.shadowBlur = pad * 2;
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                break;
            case 'vintage':
                ctx.strokeStyle = '#d4a574';
                ctx.lineWidth = pad * 1.2;
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                ctx.fillStyle = 'rgba(212, 165, 116, 0.12)';
                ctx.fillRect(0, 0, w, h);
                break;
            case 'gold':
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = pad;
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                break;
            case 'aesthetic':
                ctx.strokeStyle = '#f9a8d4';
                ctx.lineWidth = pad;
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                break;
            case 'film':
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 0, pad * 2, h);
                ctx.fillRect(w - pad * 2, 0, pad * 2, h);
                break;
            case 'minimal':
                ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                ctx.lineWidth = Math.max(2, pad * 0.5);
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                break;
            case 'rainbow': {
                const g = ctx.createLinearGradient(0, 0, w, h);
                g.addColorStop(0, '#f472b6');
                g.addColorStop(0.5, '#a78bfa');
                g.addColorStop(1, '#38bdf8');
                ctx.strokeStyle = g;
                ctx.lineWidth = pad;
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                break;
            }
            case 'heart':
                ctx.strokeStyle = '#fb7185';
                ctx.lineWidth = pad;
                ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
                break;
            default:
                break;
        }
        ctx.restore();
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Không tải được ảnh'));
            img.src = src;
        });
    }

    /** Áp khung + caption vào ảnh data URL trước khi đăng */
    async function bakeImage(dataUrl, captionText) {
        const img = await loadImage(dataUrl);
        const pad = Math.round(Math.min(img.width, img.height) * 0.04);
        let w = img.width;
        let h = img.height;
        if (state.frameId === 'polaroid') h += pad * 3;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (state.frameId === 'polaroid') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, pad, pad, w - pad * 2, img.height - pad * 2);
        } else {
            ctx.drawImage(img, 0, 0);
        }
        if (state.frameId === 'custom' && state.customFrameUrl) {
            const frameImg = await loadImage(state.customFrameUrl);
            ctx.drawImage(frameImg, 0, 0, w, h);
        } else if (state.frameId !== 'none' && state.frameId !== 'polaroid') {
            drawFrameOnCanvas(ctx, w, h, state.frameId);
        }
        drawCaptionOnCanvas(ctx, w, h, captionText);
        return canvas.toDataURL('image/jpeg', 0.88);
    }

    function drawCaptionOnCanvas(ctx, w, h, text) {
        if (!text || !text.trim()) return;
        const st = state.captionStyle;
        const size = Math.round((st.size || 16) * (w / 400));
        ctx.font = `bold ${size}px ${st.font || 'system-ui'}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = st.color || '#fff';
        const lines = wrapText(ctx, text, w * 0.85);
        let y = h * 0.12;
        if (st.position === 'center') y = h * 0.5 - (lines.length * size) / 2;
        if (st.position === 'bottom') y = h * 0.82 - lines.length * size;
        lines.forEach((line, i) => {
            if (st.style === 'outline') {
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 3;
                ctx.strokeText(line, w / 2, y + i * (size + 4));
            }
            ctx.fillText(line, w / 2, y + i * (size + 4));
        });
    }

    function wrapText(ctx, text, maxW) {
        const words = text.split(' ');
        const lines = [];
        let line = '';
        words.forEach(w => {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && line) {
                lines.push(line);
                line = w;
            } else line = test;
        });
        if (line) lines.push(line);
        return lines.length ? lines : [text];
    }

    function applyFrameClass() {
        const frame = document.querySelector('.social-locket-frame');
        if (!frame) return;
        FRAME_IDS.forEach(id => frame.classList.remove('has-frame-' + id));
        if (state.frameId && state.frameId !== 'none') {
            frame.classList.add('has-frame-' + state.frameId);
        }
        let overlay = document.getElementById('social-custom-frame-overlay');
        if (state.frameId === 'custom' && state.customFrameUrl) {
            if (!overlay) {
                overlay = document.createElement('img');
                overlay.id = 'social-custom-frame-overlay';
                overlay.className = 'social-custom-frame-overlay';
                overlay.alt = '';
                frame.appendChild(overlay);
            }
            overlay.src = state.customFrameUrl;
            overlay.classList.remove('hidden');
        } else if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    function updateCaptionOverlay() {
        const el = document.getElementById('social-caption-overlay');
        const input = document.getElementById('social-caption');
        if (!el) return;
        const text = (input?.value || '').trim();
        const st = state.captionStyle;
        el.textContent = text;
        el.className = 'social-caption-overlay style-' + (st.style || 'classic')
            + ' pos-' + (st.position || 'bottom');
        el.style.fontFamily = st.font || 'inherit';
        el.style.fontSize = (st.size || 16) + 'px';
        if (st.style !== 'gradient') el.style.color = st.color || '#fff';
        el.classList.toggle('hidden', !text);
    }

    function applyCameraBackground() {
        const layer = document.getElementById('social-camera-bg-layer');
        if (!layer) return;
        layer.dataset.bg = state.bgOn && state.bgId !== 'none' ? state.bgId : 'none';
        layer.classList.toggle('is-on', state.bgOn && state.bgId !== 'none');
        layer.style.setProperty('--social-bg-opacity', String(state.bgOpacity));
    }

    function renderAudienceFriends() {
        const box = document.getElementById('social-audience-friends');
        const search = document.getElementById('social-audience-search');
        if (!box) return;
        const q = (search?.value || '').toLowerCase().trim();
        const list = state.friends.filter(f => {
            const name = (f.fullName || f.name || '').toLowerCase();
            const email = (f.email || '').toLowerCase();
            return !q || name.includes(q) || email.includes(q);
        });
        box.innerHTML = list.length
            ? list.map(f => {
                const id = f.id || f.userId;
                const checked = state.audienceIds.has(id) ? ' checked' : '';
                const label = f.fullName || f.name || f.email || 'Bạn bè';
                return '<label class="social-audience-friend">'
                    + '<input type="checkbox" data-audience-id="' + id + '"' + checked + '>'
                    + '<span>' + escapeHtml(label) + '</span></label>';
            }).join('')
            : '<span class="text-sm text-slate-400">Chưa có bạn bè — kết bạn để chọn</span>';
        box.querySelectorAll('[data-audience-id]').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = Number(cb.dataset.audienceId);
                if (cb.checked) state.audienceIds.add(id);
                else state.audienceIds.delete(id);
            });
        });
    }

    function escapeHtml(s) {
        return (window.escapeHtml || (x => String(x ?? '')))(s);
    }

    function bindUi() {
        document.querySelectorAll('.social-frame-option').forEach(btn => {
            btn.addEventListener('click', () => {
                state.frameId = btn.dataset.frame || 'none';
                document.querySelectorAll('.social-frame-option').forEach(b =>
                    b.classList.toggle('is-active', b === btn));
                applyFrameClass();
            });
        });

        document.getElementById('social-frame-upload')?.addEventListener('click', () => {
            document.getElementById('social-frame-file')?.click();
        });

        document.getElementById('social-frame-file')?.addEventListener('change', e => {
            const file = e.target.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => {
                state.customFrameUrl = reader.result;
                state.frameId = 'custom';
                document.querySelectorAll('.social-frame-option').forEach(b =>
                    b.classList.toggle('is-active', b.dataset.frame === 'custom'));
                applyFrameClass();
                window.toast?.('Đã thêm khung tuỳ chỉnh');
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        document.querySelectorAll('.social-caption-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = CAPTION_PRESETS.find(p => p.id === btn.dataset.captionPreset);
                if (preset) {
                    state.captionStyle = { ...preset };
                    document.getElementById('social-caption-color').value = preset.color;
                    document.getElementById('social-caption-size').value = preset.size;
                    document.getElementById('social-caption-position').value = preset.position;
                }
                document.querySelectorAll('.social-caption-preset-btn').forEach(b =>
                    b.classList.toggle('is-active', b === btn));
                updateCaptionOverlay();
            });
        });

        ['social-caption', 'social-caption-color', 'social-caption-size', 'social-caption-position'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                state.captionStyle.color = document.getElementById('social-caption-color')?.value || '#fff';
                state.captionStyle.size = Number(document.getElementById('social-caption-size')?.value || 16);
                state.captionStyle.position = document.getElementById('social-caption-position')?.value || 'bottom';
                updateCaptionOverlay();
            });
        });

        document.querySelectorAll('.social-bg-option').forEach(btn => {
            btn.addEventListener('click', () => {
                state.bgId = btn.dataset.bg || 'none';
                document.querySelectorAll('.social-bg-option').forEach(b =>
                    b.classList.toggle('is-active', b === btn));
                applyCameraBackground();
            });
        });

        document.getElementById('social-bg-toggle')?.addEventListener('click', () => {
            state.bgOn = !state.bgOn;
            document.getElementById('social-bg-toggle')?.classList.toggle('is-on', state.bgOn);
            applyCameraBackground();
        });

        document.getElementById('social-bg-opacity')?.addEventListener('input', e => {
            state.bgOpacity = Number(e.target.value) / 100;
            document.getElementById('social-bg-opacity-val').textContent = e.target.value + '%';
            applyCameraBackground();
        });

        document.querySelectorAll('input[name="social-visibility"]').forEach(r => {
            r.addEventListener('change', () => {
                state.visibility = r.value;
                const open = state.visibility === 'selected';
                document.getElementById('social-audience-friends')?.classList.toggle('is-open', open);
                document.getElementById('social-audience-search')?.classList.toggle('hidden', !open);
                if (open) renderAudienceFriends();
            });
        });

        document.getElementById('social-audience-search')?.addEventListener('input', renderAudienceFriends);
    }

    function getPostMeta() {
        return {
            frameId: state.frameId,
            customFrameUrl: state.frameId === 'custom' ? state.customFrameUrl : null,
            captionStyle: { ...state.captionStyle },
            bgId: state.bgId,
        };
    }

    function getAudiencePayload() {
        return {
            visibility: state.visibility,
            audienceUserIds: state.visibility === 'selected' ? [...state.audienceIds] : [],
        };
    }

    function renderFeedCaptionOverlay(post) {
        const meta = post.postMeta || {};
        const st = meta.captionStyle;
        const text = post.caption || '';
        if (!text || !st) return '';
        return '<div class="social-post-caption-overlay style-' + escapeHtml(st.style || 'classic')
            + ' pos-' + escapeHtml(st.position || 'bottom') + '" style="'
            + 'font-family:' + escapeHtml(st.font || 'inherit') + ';'
            + 'font-size:' + (st.size || 14) + 'px;'
            + (st.style !== 'gradient' ? 'color:' + escapeHtml(st.color || '#fff') : '')
            + '">' + escapeHtml(text) + '</div>';
    }

    function feedMediaWrapClass(post) {
        const fid = post.postMeta?.frameId;
        return fid && fid !== 'none' ? ' has-frame-' + fid : '';
    }

    function visibilityBadge(post) {
        const v = post.visibility || 'all_friends';
        if (v === 'selected') return '<span class="social-post-visibility-badge"><i class="fas fa-user-lock"></i> Bạn chọn</span>';
        return '<span class="social-post-visibility-badge"><i class="fas fa-users"></i> Tất cả bạn bè</span>';
    }

    window.SocialCreative = {
        init() {
            bindUi();
            document.querySelector('.social-frame-option[data-frame="none"]')?.classList.add('is-active');
            document.querySelector('.social-bg-option[data-bg="none"]')?.classList.add('is-active');
            document.querySelector('.social-caption-preset-btn[data-caption-preset="classic"]')?.classList.add('is-active');
        },

        onPreviewShown() {
            document.querySelector('.social-locket-studio')?.classList.add('is-editing');
            applyFrameClass();
            updateCaptionOverlay();
        },

        onPreviewCleared() {
            document.querySelector('.social-locket-studio')?.classList.remove('is-editing');
            state.frameId = 'none';
            state.customFrameUrl = null;
            state.audienceIds.clear();
            applyFrameClass();
            const overlay = document.getElementById('social-caption-overlay');
            if (overlay) overlay.classList.add('hidden');
        },

        onCameraStart() {
            applyCameraBackground();
        },

        setFriendsList(friends) {
            state.friends = friends || [];
            renderAudienceFriends();
        },

        async prepareImageForPost(dataUrl) {
            const caption = document.getElementById('social-caption')?.value?.trim() || '';
            if (state.frameId === 'none' && !caption) return dataUrl;
            try {
                return await bakeImage(dataUrl, caption);
            } catch (_) {
                return dataUrl;
            }
        },

        getPostExtras() {
            return {
                postMeta: getPostMeta(),
                ...getAudiencePayload(),
            };
        },

        renderFeedMediaWrap(post, mediaHtml) {
            const wrapClass = 'social-post-media-wrap' + feedMediaWrapClass(post);
            const custom = post.postMeta?.customFrameUrl;
            const frameOverlay = custom && post.postMeta?.frameId === 'custom'
                ? '<img src="' + escapeHtml(custom) + '" class="social-custom-frame-overlay" alt="">'
                : '';
            const cap = renderFeedCaptionOverlay(post);
            return '<div class="' + wrapClass + '">' + mediaHtml + frameOverlay + cap + '</div>';
        },

        visibilityBadge,
    };
})();