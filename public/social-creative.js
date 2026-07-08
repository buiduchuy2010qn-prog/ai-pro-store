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

    const STUDIO_SECTIONS = [
        {
            id: 'general',
            title: 'General',
            isNew: true,
            pills: [
                { id: 'text', label: 'Aa Văn bản', cls: 'pill-gray', icon: 'fa-font', mode: 'caption' },
                { id: 'color', label: 'Màu sắc', cls: 'pill-purple', icon: 'fa-palette', mode: 'widget' },
                { id: 'spotify', label: 'Spotify', cls: 'pill-green', icon: 'fa-spotify', mode: 'widget' },
                { id: 'music', label: 'Apple Music', cls: 'pill-pink', icon: 'fa-apple', mode: 'widget' },
                { id: 'weather', label: '31°C', cls: 'pill-blue', icon: 'fa-cloud-sun', dynamic: 'weather', mode: 'widget' },
                { id: 'review', label: 'Review', cls: 'pill-yellow', icon: 'fa-star', mode: 'widget' },
                { id: 'time', label: '', cls: 'pill-gray', icon: 'fa-clock', dynamic: 'time', mode: 'widget' },
                { id: 'streak', label: '🔥 1', cls: 'pill-orange', mode: 'widget' },
                { id: 'poll', label: 'Bình chọn', cls: 'pill-purple', mode: 'widget' },
                { id: 'location', label: 'Vị trí', cls: 'pill-teal', icon: 'fa-location-dot', dynamic: 'location', mode: 'location' },
            ],
        },
        {
            id: 'caption-season',
            title: 'Caption Season',
            isNew: true,
            pills: [
                { id: 'cap1', label: 'GEM AI', cls: 'pill-brown', caption: 'Gemini Pro ✨', mode: 'caption' },
                { id: 'cap2', label: 'GPT PRO', cls: 'pill-green', caption: 'ChatGPT Plus 🚀', mode: 'caption' },
                { id: 'cap3', label: 'CLAUDE', cls: 'pill-orange', caption: 'Claude AI 🤖', mode: 'caption' },
                { id: 'cap4', label: 'GROK', cls: 'pill-red', caption: 'Grok AI ⚡', mode: 'caption' },
                { id: 'cap5', label: 'SALE 50%', cls: 'pill-pink', caption: 'Khuyến mãi 50% 🔥', mode: 'caption' },
                { id: 'cap6', label: 'VIP', cls: 'pill-indigo', caption: 'Tài khoản VIP 💎', mode: 'caption' },
            ],
        },
        {
            id: 'suggest',
            title: 'Suggest Caption',
            pills: [
                { id: 's1', label: 'Caption', cls: 'pill-purple', caption: 'Trải nghiệm AI tuyệt vời ✨', mode: 'caption' },
                { id: 's2', label: 'Caption', cls: 'pill-orange', caption: 'Mua tài khoản chính hãng 🚀', mode: 'caption' },
                { id: 's3', label: 'Caption', cls: 'pill-red', caption: 'Khuyến mãi hôm nay 🔥', mode: 'caption' },
                { id: 's4', label: 'Caption', cls: 'pill-teal', caption: 'Gemini · ChatGPT · Claude', mode: 'caption' },
                { id: 's5', label: 'Caption', cls: 'pill-pink', caption: 'Shop Đức Hi — uy tín 💯', mode: 'caption' },
                { id: 's6', label: 'Caption', cls: 'pill-blue', caption: 'Nạp nhanh VietQR ⚡', mode: 'caption' },
            ],
        },
        {
            id: 'decorative',
            title: 'Decorative by Locket',
            pills: [
                { id: 'd1', label: 'PRIDE', cls: 'pill-purple', mode: 'widget' },
                { id: 'd2', label: 'Good morning ☀️', cls: 'pill-orange', caption: 'Good morning ☀️', mode: 'caption' },
                { id: 'd3', label: 'Goodnight 🌙', cls: 'pill-indigo', caption: 'Goodnight 🌙', mode: 'caption' },
                { id: 'd4', label: 'Miss you', cls: 'pill-red', caption: 'Miss you 💕', mode: 'caption' },
                { id: 'd5', label: 'Party Time!', cls: 'pill-green', caption: 'Party Time! 🎉', mode: 'caption' },
                { id: 'd6', label: 'OOTD', cls: 'pill-pink', mode: 'widget' },
            ],
        },
        {
            id: 'decorative-dio',
            title: 'Decorative by Dio',
            isNew: true,
            pills: [
                { id: 'dio1', label: 'Wedding Time!', cls: 'pill-pink', caption: 'Wedding Time! 💒', mode: 'caption' },
                { id: 'dio2', label: 'Cảm thấy hạnh phúc', cls: 'pill-orange', caption: 'Cảm thấy hạnh phúc ✨', mode: 'caption' },
                { id: 'dio3', label: 'Coffee Time!', cls: 'pill-brown', caption: 'Coffee Time! ☕', mode: 'caption' },
                { id: 'dio4', label: 'Locket Time!', cls: 'pill-purple', caption: 'Locket Time! 📸', mode: 'caption' },
                { id: 'dio5', label: 'Cinema Time!', cls: 'pill-indigo', caption: 'Cinema Time! 🎬', mode: 'caption' },
                { id: 'dio6', label: 'Chilling Time!', cls: 'pill-teal', caption: 'Chilling Time! 😎', mode: 'caption' },
                { id: 'dio7', label: 'Shopping Time!', cls: 'pill-green', caption: 'Shopping Time! 🛍️', mode: 'caption' },
                { id: 'dio8', label: 'Dinner Time!', cls: 'pill-red', caption: 'Dinner Time! 🍽️', mode: 'caption' },
            ],
        },
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
        studioPills: new Set(),
        studioOpen: false,
        locationLabel: null,
        captionDisplayMode: 'input',
        studioCaptionPill: null,
    };

    let studioTickInterval = null;
    let locationFetchPromise = null;

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
        const inline = document.getElementById('social-caption-inline');
        if (!el) return;
        if (document.querySelector('.social-locket-frame.has-preview')) {
            el.classList.add('hidden');
            return;
        }
        const text = (inline?.value || input?.value || '').trim();
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

    function currentClock() {
        return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    function findStudioPill(id) {
        for (const sec of STUDIO_SECTIONS) {
            const p = sec.pills.find(x => x.id === id);
            if (p) return p;
        }
        return null;
    }

    function getPillMode(p) {
        if (p.mode) return p.mode;
        if (p.dynamic === 'location') return 'location';
        if (p.caption) return 'caption';
        return 'widget';
    }

    function isWidgetPill(p) {
        return getPillMode(p) === 'widget';
    }

    function pillDynamicLabel(p) {
        if (p.dynamic === 'time') return currentClock();
        if (p.dynamic === 'weather') return '31°C';
        if (p.dynamic === 'location') return state.locationLabel || p.label || 'Vị trí';
        return p.label || p.caption || p.id;
    }

    function formatViAddress(data) {
        const a = data?.address || {};
        const ward = a.suburb || a.neighbourhood || a.village || a.hamlet || a.road || '';
        const district = a.city_district || a.county || a.town || a.municipality || a.city || '';
        const province = a.state || a.region || '';
        const parts = [ward, district, province].filter(Boolean);
        if (parts.length) return parts.join(', ');
        const display = String(data?.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
        return display.slice(0, 3).join(', ') || 'Vị trí hiện tại';
    }

    function fetchRealLocation() {
        if (locationFetchPromise) return locationFetchPromise;
        locationFetchPromise = new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Thiết bị không hỗ trợ GPS'));
                return;
            }
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const { latitude, longitude } = pos.coords;
                try {
                    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=vi`;
                    const res = await fetch(url, {
                        headers: { 'Accept-Language': 'vi', 'Accept': 'application/json' },
                    });
                    const data = await res.json();
                    resolve(formatViAddress(data));
                } catch (_) {
                    resolve(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                }
            }, (err) => {
                reject(new Error(err?.message || 'Không lấy được vị trí — bật quyền GPS'));
            }, { enableHighAccuracy: true, timeout: 14000, maximumAge: 60000 });
        }).finally(() => {
            locationFetchPromise = null;
        });
        return locationFetchPromise;
    }

    function focusCaptionInput(selectAll) {
        closeStudio();
        const input = document.getElementById('social-caption-inline');
        if (!input) return;
        requestAnimationFrame(() => {
            input.focus();
            if (selectAll && input.value) input.select();
        });
    }

    function updateLocationPillUi(label, loading) {
        document.querySelectorAll('[data-social-studio-pill="location"]').forEach(el => {
            if (loading) {
                el.innerHTML = '<i class="fas fa-location-dot mr-1"></i>Đang lấy...';
                el.disabled = true;
                return;
            }
            el.disabled = false;
            const text = label || 'Vị trí';
            const short = text.length > 28 ? text.slice(0, 26) + '…' : text;
            el.innerHTML = `<i class="fas fa-location-dot mr-1"></i>${escapeHtml(short)}`;
        });
    }

    function pillButtonHtml(p) {
        const label = p.dynamic === 'time' ? currentClock() : (p.label || '');
        let iconHtml = '';
        if (p.icon === 'fa-spotify') iconHtml = '<i class="fab fa-spotify mr-1"></i>';
        else if (p.icon === 'fa-apple') iconHtml = '<i class="fab fa-apple mr-1"></i>';
        else if (p.icon) iconHtml = `<i class="fas ${p.icon} mr-1"></i>`;
        return `<button type="button" class="locket-studio-pill ${p.cls}" data-social-studio-pill="${p.id}" data-caption="${escapeHtml(p.caption || '')}">${iconHtml}${escapeHtml(label)}</button>`;
    }

    function buildSocialStudio() {
        if (document.getElementById('social-caption-studio')) return;

        const sections = STUDIO_SECTIONS.map(sec => `
            <section class="locket-studio-section" data-section="${sec.id}">
                <div class="locket-studio-section-head">
                    <span class="locket-studio-section-title">${sec.title}</span>
                    ${sec.isNew ? '<span class="locket-studio-new">New</span>' : ''}
                </div>
                <div class="locket-studio-pills">${sec.pills.map(pillButtonHtml).join('')}</div>
            </section>`).join('');

        const host = document.getElementById('view-social') || document.body;
        host.insertAdjacentHTML('beforeend', `
            <div id="social-studio-backdrop" class="locket-studio-backdrop" aria-hidden="true"></div>
            <aside id="social-caption-studio" class="locket-studio social-caption-studio" aria-hidden="true">
                <div class="locket-studio-header">
                    <div class="locket-studio-logo"><i class="fas fa-wand-magic-sparkles"></i></div>
                    <span class="locket-studio-title">CUSTOMIZE STUDIO</span>
                    <span class="locket-studio-badge">Free</span>
                    <button type="button" class="locket-studio-close" id="social-studio-close" aria-label="Đóng">&times;</button>
                </div>
                <div class="locket-studio-body pretty-scrollbar">${sections}</div>
            </aside>`);

        document.getElementById('social-studio-close')?.addEventListener('click', closeStudio);
        document.getElementById('social-studio-backdrop')?.addEventListener('click', closeStudio);
        document.querySelectorAll('[data-social-studio-pill]').forEach(pill => {
            pill.addEventListener('click', () => onStudioPillClick(pill));
        });
    }

    function setCaptionInputs(text) {
        const inline = document.getElementById('social-caption-inline');
        const drawer = document.getElementById('social-caption');
        if (inline) inline.value = text;
        if (drawer) {
            drawer.value = text;
            drawer.dispatchEvent(new Event('input', { bubbles: true }));
        }
        updateCaptionOverlay();
        renderCaptionDisplay();
    }

    function renderCaptionDisplay() {
        const pillEl = document.getElementById('social-caption-pill-overlay');
        const barEl = document.getElementById('social-frame-caption-bar');
        const frame = document.querySelector('.social-locket-frame');
        const isPreview = frame?.classList.contains('has-preview');
        if (!pillEl || !isPreview) {
            pillEl?.classList.add('hidden');
            frame?.classList.remove('is-pill-caption', 'is-input-caption');
            return;
        }

        const showStudioPill = state.captionDisplayMode === 'pill'
            && state.studioCaptionPill?.text;

        if (showStudioPill) {
            pillEl.textContent = state.studioCaptionPill.text;
            pillEl.className = 'social-caption-pill-overlay ' + (state.studioCaptionPill.cls || 'pill-purple');
            pillEl.classList.remove('hidden');
            pillEl.setAttribute('aria-hidden', 'false');
            barEl?.classList.add('hidden');
            frame?.classList.add('is-pill-caption');
            frame?.classList.remove('is-input-caption');
            return;
        }

        pillEl.classList.add('hidden');
        pillEl.setAttribute('aria-hidden', 'true');
        barEl?.classList.remove('hidden');
        frame?.classList.add('is-input-caption');
        frame?.classList.remove('is-pill-caption');
    }

    function useInputCaptionMode() {
        state.captionDisplayMode = 'input';
        state.studioCaptionPill = null;
        document.querySelectorAll('[data-social-studio-pill].is-selected').forEach(el => {
            const p = findStudioPill(el.dataset.socialStudioPill);
            if (p && getPillMode(p) === 'caption') el.classList.remove('is-selected');
        });
        renderCaptionDisplay();
    }

    function useStudioCaptionPill(id, text, cls) {
        state.captionDisplayMode = 'pill';
        state.studioCaptionPill = { id, text, cls: cls || 'pill-purple' };
        document.querySelectorAll('[data-social-studio-pill]').forEach(el => {
            el.classList.toggle('is-selected', el.dataset.socialStudioPill === id);
        });
        setCaptionInputs(text);
        closeStudio();
        renderCaptionDisplay();
    }

    async function onStudioPillClick(pill) {
        const id = pill.dataset.socialStudioPill;
        const p = findStudioPill(id);
        if (!p) return;
        const mode = getPillMode(p);

        if (mode === 'caption') {
            const caption = pill.dataset.caption || '';
            if (caption) {
                useStudioCaptionPill(id, caption, p.cls);
                return;
            }
            useInputCaptionMode();
            focusCaptionInput(false);
            return;
        }

        if (mode === 'location') {
            if (state.locationLabel) {
                state.locationLabel = null;
                pill.classList.remove('is-selected');
                useInputCaptionMode();
                setCaptionInputs('');
                updateLocationPillUi('Vị trí', false);
                return;
            }
            updateLocationPillUi(null, true);
            try {
                const addr = await fetchRealLocation();
                state.locationLabel = addr;
                useInputCaptionMode();
                setCaptionInputs(addr);
                pill.classList.add('is-selected');
                updateLocationPillUi(addr, false);
                focusCaptionInput(true);
            } catch (err) {
                updateLocationPillUi('Vị trí', false);
                window.toast?.(err.message || 'Không lấy được vị trí', true);
            }
            return;
        }

        if (state.studioPills.has(id)) {
            state.studioPills.delete(id);
            pill.classList.remove('is-selected');
        } else {
            state.studioPills.add(id);
            pill.classList.add('is-selected');
        }
        renderDecoOverlay();
        syncStudioTicker();
    }

    function buildDecoChip(p) {
        const label = pillDynamicLabel(p);
        let iconHtml = '';
        if (p.icon === 'fa-spotify') iconHtml = '<i class="fab fa-spotify"></i> ';
        else if (p.icon === 'fa-apple') iconHtml = '<i class="fab fa-apple"></i> ';
        else if (p.icon) iconHtml = `<i class="fas ${p.icon}"></i> `;
        return `<span class="social-deco-chip ${p.cls}">${iconHtml}${escapeHtml(label)}</span>`;
    }

    function renderDecoOverlay() {
        const box = document.getElementById('social-deco-overlay');
        if (!box) return;
        const top = [];
        const bottom = [];
        state.studioPills.forEach(pid => {
            const p = findStudioPill(pid);
            if (!p || !isWidgetPill(p)) return;
            const chip = buildDecoChip(p);
            if (p.dynamic && p.dynamic !== 'location') bottom.push(chip);
            else top.push(chip);
        });
        const hasDeco = top.length > 0 || bottom.length > 0;
        box.innerHTML = (top.length ? `<div class="social-deco-top">${top.join('')}</div>` : '')
            + (bottom.length ? `<div class="social-deco-bottom">${bottom.join('')}</div>` : '');
        box.classList.toggle('hidden', !hasDeco);
        box.setAttribute('aria-hidden', hasDeco ? 'false' : 'true');
    }

    function updateDynamicStudioPills() {
        document.querySelectorAll('[data-social-studio-pill="time"]').forEach(el => {
            el.innerHTML = `<i class="fas fa-clock mr-1"></i>${currentClock()}`;
        });
        document.querySelectorAll('[data-social-studio-pill="weather"]').forEach(el => {
            el.innerHTML = '<i class="fas fa-cloud-sun mr-1"></i>31°C';
        });
    }

    function hasDynamicStudioSelection() {
        return [...state.studioPills].some(id => {
            const p = findStudioPill(id);
            return p?.dynamic && p.dynamic !== 'location';
        });
    }

    function syncStudioTicker() {
        if (state.studioOpen || hasDynamicStudioSelection()) startStudioTicker();
        else stopStudioTicker();
    }

    function startStudioTicker() {
        updateDynamicStudioPills();
        renderDecoOverlay();
        if (studioTickInterval) return;
        studioTickInterval = setInterval(() => {
            updateDynamicStudioPills();
            renderDecoOverlay();
        }, 1000);
    }

    function stopStudioTicker() {
        if (studioTickInterval) {
            clearInterval(studioTickInterval);
            studioTickInterval = null;
        }
    }

    function openStudio() {
        const hasPreview = document.querySelector('.social-locket-studio.has-preview');
        if (!hasPreview) {
            window.toast?.('Chụp hoặc chọn ảnh trước, rồi bấm nút ✨ để thêm caption', true);
            return;
        }
        buildSocialStudio();
        state.studioOpen = true;
        updateDynamicStudioPills();
        if (state.locationLabel) updateLocationPillUi(state.locationLabel, false);
        document.getElementById('social-studio-backdrop')?.classList.add('is-open');
        document.getElementById('social-caption-studio')?.classList.add('is-open');
        document.getElementById('social-caption-studio')?.setAttribute('aria-hidden', 'false');
        syncStudioTicker();
    }

    function closeStudio() {
        state.studioOpen = false;
        document.getElementById('social-studio-backdrop')?.classList.remove('is-open');
        document.getElementById('social-caption-studio')?.classList.remove('is-open');
        document.getElementById('social-caption-studio')?.setAttribute('aria-hidden', 'true');
        syncStudioTicker();
    }

    function clearStudioDecorations() {
        state.studioPills.clear();
        state.locationLabel = null;
        state.captionDisplayMode = 'input';
        state.studioCaptionPill = null;
        document.querySelectorAll('[data-social-studio-pill].is-selected').forEach(p => p.classList.remove('is-selected'));
        updateLocationPillUi('Vị trí', false);
        renderDecoOverlay();
        renderCaptionDisplay();
        stopStudioTicker();
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
            decorations: [...state.studioPills],
            locationLabel: state.locationLabel || null,
            studioCaption: state.studioCaptionPill ? { ...state.studioCaptionPill } : null,
            captionDisplayMode: state.captionDisplayMode,
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
            buildSocialStudio();
            bindUi();
            document.querySelector('.social-frame-option[data-frame="none"]')?.classList.add('is-active');
            document.querySelector('.social-bg-option[data-bg="none"]')?.classList.add('is-active');
            document.querySelector('.social-caption-preset-btn[data-caption-preset="classic"]')?.classList.add('is-active');
        },

        onPreviewShown() {
            document.querySelector('.social-locket-studio')?.classList.add('is-editing');
            applyFrameClass();
            updateCaptionOverlay();
            renderCaptionDisplay();
            syncStudioTicker();
        },

        onPreviewCleared() {
            closeStudio();
            clearStudioDecorations();
            document.querySelector('.social-locket-studio')?.classList.remove('is-editing');
            state.frameId = 'none';
            state.customFrameUrl = null;
            state.audienceIds.clear();
            applyFrameClass();
            const overlay = document.getElementById('social-caption-overlay');
            if (overlay) overlay.classList.add('hidden');
        },

        openStudio,
        closeStudio,
        isStudioOpen() { return state.studioOpen; },
        syncCaptionOverlay: updateCaptionOverlay,
        renderCaptionDisplay,
        useInputCaptionMode,
        focusCaptionInput,

        applyFeedCaptionPill(el, post) {
            if (!el) return;
            const studioCap = post?.postMeta?.studioCaption;
            if (!post?.caption) {
                el.textContent = '';
                el.classList.add('hidden');
                return;
            }
            el.textContent = post.caption;
            el.classList.remove('hidden');
            if (studioCap?.cls) {
                el.className = 'locket-feed-caption-pill is-studio-colored ' + studioCap.cls;
            } else {
                el.className = 'locket-feed-caption-pill is-typed-caption';
            }
        },

        onCameraStart() {
            applyCameraBackground();
        },

        setFriendsList(friends) {
            state.friends = friends || [];
            renderAudienceFriends();
        },

        async prepareImageForPost(dataUrl) {
            const caption = document.getElementById('social-caption-inline')?.value?.trim()
                || document.getElementById('social-caption')?.value?.trim() || '';
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

        getDecorationBadgeHtml(pillId, createdAt, postMeta) {
            const p = findStudioPill(pillId);
            if (!p) return '';
            let label = pillDynamicLabel(p);
            if (p.dynamic === 'time' && createdAt) {
                const t = new Date(createdAt);
                if (!isNaN(t)) {
                    label = t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                }
            }
            if (p.dynamic === 'location' && postMeta?.locationLabel) {
                label = postMeta.locationLabel;
            }
            const icon = p.icon ? `<i class="fas ${p.icon}"></i> ` : '';
            const cls = p.dynamic === 'weather' ? 'badge-warm' : (p.cls?.includes('purple') ? 'badge-purple' : '');
            return `<span class="locket-feed-badge ${cls}">${icon}${escapeHtml(label)}</span>`;
        },
    };
})();