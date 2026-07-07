/* Phòng Thay Đồ — SVG layer renderer (tự thiết kế, không bản quyền) */
const AVATAR_CATEGORIES = [
    { id: 'background', label: 'Nền', icon: 'fa-image' },
    { id: 'hair', label: 'Tóc', icon: 'fa-user' },
    { id: 'eyes', label: 'Mắt', icon: 'fa-eye' },
    { id: 'top', label: 'Áo', icon: 'fa-shirt' },
    { id: 'bottom', label: 'Quần/Váy', icon: 'fa-person' },
    { id: 'shoes', label: 'Giày', icon: 'fa-shoe-prints' },
    { id: 'hat', label: 'Mũ', icon: 'fa-hat-cowboy' },
    { id: 'glasses', label: 'Kính', icon: 'fa-glasses' },
    { id: 'accessory', label: 'Phụ kiện', icon: 'fa-gem' },
    { id: 'makeup', label: 'Trang điểm', icon: 'fa-wand-magic-sparkles' },
    { id: 'effect', label: 'Hiệu ứng', icon: 'fa-star' },
];

const AVATAR_LAYERS = {
    'bg-sky': () => '<rect width="320" height="400" fill="#e0f2fe"/><circle cx="260" cy="60" r="35" fill="#fde68a" opacity="0.9"/>',
    'bg-pink': () => '<rect width="320" height="400" fill="#fce7f3"/><circle cx="50" cy="80" r="20" fill="#f9a8d4" opacity="0.5"/><circle cx="280" cy="120" r="28" fill="#fbcfe8" opacity="0.5"/>',
    'bg-violet': () => '<rect width="320" height="400" fill="#ede9fe"/><ellipse cx="160" cy="350" rx="140" ry="40" fill="#c4b5fd" opacity="0.4"/>',
    'bg-vip': () => '<rect width="320" height="400" fill="#1e1b4b"/><rect x="0" y="0" width="320" height="400" fill="url(#vipGrad)"/><defs><linearGradient id="vipGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fbbf24" stop-opacity="0.3"/><stop offset="100%" stop-color="#a855f7" stop-opacity="0.2"/></linearGradient></defs>',
    'bg-night': () => '<rect width="320" height="400" fill="#0f172a"/><circle cx="240" cy="70" r="4" fill="#fff"/><circle cx="80" cy="50" r="3" fill="#fff"/><circle cx="150" cy="90" r="2" fill="#fff"/><circle cx="200" cy="40" r="3" fill="#fff"/>',
    'body-male': () => '<ellipse cx="160" cy="175" rx="42" ry="48" fill="#fcd9b6"/><rect x="128" y="218" width="64" height="90" rx="18" fill="#fcd9b6"/><ellipse cx="160" cy="130" rx="38" ry="42" fill="#fcd9b6"/>',
    'body-female': () => '<ellipse cx="160" cy="175" rx="38" ry="46" fill="#fde4c8"/><path d="M122 218 Q160 250 198 218 L198 300 Q160 320 122 300 Z" fill="#fde4c8"/><ellipse cx="160" cy="128" rx="36" ry="40" fill="#fde4c8"/>',
    'eyes-brown': () => '<ellipse cx="145" cy="132" rx="8" ry="10" fill="#fff"/><ellipse cx="175" cy="132" rx="8" ry="10" fill="#fff"/><circle cx="145" cy="134" r="5" fill="#5c3d2e"/><circle cx="175" cy="134" r="5" fill="#5c3d2e"/>',
    'eyes-blue': () => '<ellipse cx="145" cy="132" rx="8" ry="10" fill="#fff"/><ellipse cx="175" cy="132" rx="8" ry="10" fill="#fff"/><circle cx="145" cy="134" r="5" fill="#2563eb"/><circle cx="175" cy="134" r="5" fill="#2563eb"/>',
    'eyes-violet': () => '<ellipse cx="145" cy="132" rx="9" ry="11" fill="#fff"/><ellipse cx="175" cy="132" rx="9" ry="11" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#7c3aed"/><circle cx="175" cy="134" r="6" fill="#7c3aed"/><circle cx="147" cy="132" r="2" fill="#fff"/><circle cx="177" cy="132" r="2" fill="#fff"/>',
    'hair-black-short': () => '<path d="M122 130 Q160 90 198 130 Q200 110 160 95 Q120 110 122 130" fill="#1f2937"/>',
    'hair-brown-long': () => '<path d="M118 140 Q160 85 202 140 L208 200 Q160 210 112 200 Z" fill="#78350f"/>',
    'hair-blue-neon': () => '<path d="M115 135 Q160 80 205 135 L210 195 Q160 205 110 195 Z" fill="#06b6d4"/><path d="M115 135 Q130 100 145 135" fill="#22d3ee" opacity="0.6"/>',
    'hair-pink-twin': () => '<path d="M125 125 Q160 88 195 125 L200 175 L185 175 L180 130 L140 130 L135 175 L120 175 Z" fill="#ec4899"/><circle cx="130" cy="160" r="18" fill="#f472b6"/><circle cx="190" cy="160" r="18" fill="#f472b6"/>',
    'top-white-tee': () => '<path d="M128 218 L108 240 L118 248 L132 230 L132 280 L188 280 L188 230 L202 248 L212 240 L192 218 Q160 235 128 218" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>',
    'top-blue-shirt': () => '<path d="M128 218 L105 242 L118 252 L132 232 L132 282 L188 282 L188 232 L202 252 L215 242 L192 218 Q160 238 128 218" fill="#3b82f6"/><rect x="155" y="250" width="10" height="20" fill="#1d4ed8"/>',
    'top-hoodie-black': () => '<path d="M125 215 L100 245 L115 255 L130 235 L130 285 L190 285 L190 235 L205 255 L220 245 L195 215 Q160 240 125 215" fill="#1f2937"/><ellipse cx="160" cy="200" rx="45" ry="20" fill="#374151"/>',
    'top-vest-male': () => '<path d="M130 220 L130 285 L190 285 L190 220 Q160 245 130 220" fill="#1e3a5f"/><path d="M130 220 L160 250 L190 220" fill="#fff"/><rect x="155" y="250" width="10" height="25" fill="#cbd5e1"/>',
    'top-blouse': () => '<path d="M126 218 L110 238 L122 248 L134 228 L134 278 L186 278 L186 228 L198 248 L210 238 L194 218 Q160 240 126 218" fill="#fda4af"/><circle cx="160" cy="255" r="6" fill="#fff" opacity="0.6"/>',
    'bottom-jeans': () => '<rect x="132" y="278" width="22" height="55" rx="6" fill="#1e40af"/><rect x="166" y="278" width="22" height="55" rx="6" fill="#1e40af"/>',
    'bottom-skirt-pink': () => '<path d="M128 278 L112 330 Q160 345 208 330 L192 278 Z" fill="#f472b6"/>',
    'bottom-gown': () => '<path d="M125 275 L95 360 Q160 380 225 360 L195 275 Z" fill="#7c3aed"/><path d="M125 275 L160 300 L195 275" fill="#a78bfa" opacity="0.5"/>',
    'bottom-suit-male': () => '<rect x="130" y="278" width="24" height="58" rx="4" fill="#0f172a"/><rect x="166" y="278" width="24" height="58" rx="4" fill="#0f172a"/><line x1="160" y1="278" x2="160" y2="336" stroke="#334155" stroke-width="2"/>',
    'shoes-sneaker': () => '<ellipse cx="143" cy="338" rx="16" ry="8" fill="#fff" stroke="#94a3b8"/><ellipse cx="177" cy="338" rx="16" ry="8" fill="#fff" stroke="#94a3b8"/>',
    'shoes-boot': () => '<rect x="128" y="328" width="30" height="16" rx="4" fill="#44403c"/><rect x="162" y="328" width="30" height="16" rx="4" fill="#44403c"/>',
    'shoes-heel': () => '<path d="M132 335 L128 345 L148 345 L145 330 Z" fill="#be123c"/><path d="M168 335 L165 330 L185 345 L172 345 Z" fill="#be123c"/>',
    'hat-bucket': () => '<ellipse cx="160" cy="108" rx="48" ry="12" fill="#f59e0b"/><path d="M118 108 L125 85 Q160 70 195 85 L202 108 Z" fill="#fbbf24"/>',
    'hat-beret': () => '<ellipse cx="160" cy="100" rx="40" ry="14" fill="#dc2626"/><circle cx="195" cy="98" r="6" fill="#b91c1c"/>',
    'glasses-round': () => '<circle cx="145" cy="132" r="14" fill="none" stroke="#334155" stroke-width="2"/><circle cx="175" cy="132" r="14" fill="none" stroke="#334155" stroke-width="2"/><line x1="159" y1="132" x2="161" y2="132" stroke="#334155" stroke-width="2"/>',
    'glasses-fashion': () => '<path d="M128 130 Q145 120 158 132 L158 138 Q145 148 128 138 Z" fill="#111" opacity="0.7"/><path d="M162 132 Q175 120 192 130 L192 138 Q175 148 162 138 Z" fill="#111" opacity="0.7"/>',
    'acc-bag': () => '<rect x="200" y="250" width="28" height="22" rx="4" fill="#a16207"/><path d="M208 250 Q214 235 220 250" fill="none" stroke="#a16207" stroke-width="3"/>',
    'acc-scarf': () => '<path d="M130 218 Q160 240 190 218 L185 235 Q160 255 135 235 Z" fill="#ef4444"/>',
    'makeup-lip-pink': () => '<path d="M150 148 Q160 155 170 148 Q160 152 150 148" fill="#f472b6" opacity="0.7"/>',
    'makeup-idol': () => '<ellipse cx="135" cy="145" rx="8" ry="5" fill="#fda4af" opacity="0.4"/><ellipse cx="185" cy="145" rx="8" ry="5" fill="#fda4af" opacity="0.4"/><path d="M150 148 Q160 156 170 148 Q160 153 150 148" fill="#e11d48" opacity="0.8"/>',
    'makeup-blush': () => '<ellipse cx="135" cy="145" rx="10" ry="6" fill="#fb7185" opacity="0.35"/><ellipse cx="185" cy="145" rx="10" ry="6" fill="#fb7185" opacity="0.35"/>',
    'fx-sparkle': () => '<text x="50" y="80" font-size="24" fill="#fbbf24">✦</text><text x="250" y="100" font-size="18" fill="#fbbf24">✦</text><text x="270" y="200" font-size="22" fill="#fde68a">✦</text>',
    'fx-hearts': () => '<text x="45" y="90" font-size="20" fill="#f472b6">♥</text><text x="255" y="85" font-size="16" fill="#fb7185">♥</text><text x="260" y="220" font-size="18" fill="#ec4899">♥</text>',
};

function buildAvatarSvg(equippedItems, gender) {
    const sorted = [...(equippedItems || [])].sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    const layers = [];
    let hasBody = false;
    for (const item of sorted) {
        const key = item.layerImage || '';
        const fn = AVATAR_LAYERS[key];
        if (fn) {
            layers.push(fn());
            if (item.category === 'body' || key.startsWith('body-')) hasBody = true;
        } else if (key.startsWith('<')) {
            layers.push(key);
        }
    }
    if (!hasBody) {
        const bodyFn = AVATAR_LAYERS[gender === 'male' ? 'body-male' : 'body-female'];
        if (bodyFn) layers.splice(1, 0, bodyFn());
    }
    if (!layers.length) {
        layers.push(AVATAR_LAYERS['bg-sky']());
        layers.push(AVATAR_LAYERS[gender === 'male' ? 'body-male' : 'body-female']());
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400" width="320" height="400">${layers.join('')}</svg>`;
}

function downloadAvatarPng(svgEl, filename) {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = filename || 'nhan-vat-shop-duc-hi.png';
            a.click();
        }, 'image/png');
    };
    img.src = url;
}

/* ─── Avatar Room State ─── */
let avatarState = { gender: 'female', equipped: [], items: {} };
let avatarCatalog = [];
let avatarOwnedIds = new Set();
let avatarCategory = 'hair';
let avatarOutfits = [];

function avatarItemBadge(item) {
    if (item.isFree || item.owned) return item.isFree
        ? '<span class="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Miễn phí</span>'
        : '<span class="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">Đã sở hữu</span>';
    return '<span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">VIP</span>';
}

function renderAvatarPreview() {
    const box = document.getElementById('avatar-preview');
    if (!box) return;
    const svg = buildAvatarSvg(avatarState.equipped, avatarState.gender);
    box.innerHTML = svg;
    const svgEl = box.querySelector('svg');
    if (svgEl) {
        svgEl.classList.add('w-full', 'h-full', 'max-h-[420px]');
        svgEl.setAttribute('id', 'avatar-svg-output');
    }
}

async function loadAvatarRoom() {
    try {
        const [current, catalog, myItems, outfits] = await Promise.all([
            api('/avatar/current'),
            api(`/avatar/items?gender=${avatarState.gender || 'female'}`),
            api('/avatar/my-items'),
            api('/avatar/outfits'),
        ]);
        avatarState = { ...current, gender: current.gender || 'female' };
        avatarCatalog = catalog.items || [];
        avatarOwnedIds = new Set((myItems.items || []).map(i => i.id));
        avatarOutfits = outfits.outfits || [];
        document.querySelectorAll('.avatar-gender-btn').forEach(btn => {
            const g = btn.dataset.gender;
            btn.className = `avatar-gender-btn px-4 py-2 rounded-xl text-sm font-medium ${g === avatarState.gender ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'}`;
        });
        renderAvatarPreview();
        renderAvatarItems();
        renderAvatarOutfits();
        renderAvatarWardrobe();
    } catch (e) {
        toast(e.message, true);
    }
}

function renderAvatarItems() {
    const grid = document.getElementById('avatar-items-grid');
    const tabs = document.getElementById('avatar-category-tabs');
    if (!grid || !tabs) return;
    tabs.innerHTML = AVATAR_CATEGORIES.map(c =>
        `<button type="button" data-avatar-cat="${c.id}" class="avatar-cat-btn shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${c.id === avatarCategory ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}">
            <i class="fas ${c.icon} mr-1"></i>${c.label}
        </button>`
    ).join('');
    const items = avatarCatalog.filter(i => i.category === avatarCategory);
    if (!items.length) {
        grid.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm col-span-full">Chưa có vật phẩm.</div>';
        return;
    }
    grid.innerHTML = items.map(item => {
        const owned = item.isFree || item.owned || avatarOwnedIds.has(item.id);
        const equipped = avatarState.equipped?.some(e => e.id === item.id);
        return `
        <div class="bg-white border rounded-xl p-3 text-center shadow-sm hover:border-brand-300 transition ${equipped ? 'ring-2 ring-brand-400' : ''}">
            <div class="text-3xl mb-1">${item.previewImage || '👕'}</div>
            <div class="text-xs font-medium line-clamp-2 min-h-[2rem]">${escapeHtml(item.name)}</div>
            <div class="mt-1">${avatarItemBadge({ ...item, owned })}</div>
            <div class="text-xs font-bold mt-1 ${item.isFree ? 'text-emerald-600' : 'text-brand-600'}">${item.isFree ? '0đ' : formatMoney(item.price)}</div>
            <div class="flex flex-col gap-1 mt-2">
                ${owned
                    ? `<button type="button" data-avatar-equip="${item.id}" class="bg-brand-600 hover:bg-brand-700 text-white text-xs py-1.5 rounded-lg">${equipped ? 'Đang mặc' : 'Dùng'}</button>`
                    : `<button type="button" data-avatar-buy="${item.id}" class="bg-amber-500 hover:bg-amber-600 text-white text-xs py-1.5 rounded-lg">Mua</button>
                       <button type="button" data-avatar-try="${item.id}" class="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs py-1 rounded-lg">Thử</button>`}
            </div>
        </div>`;
    }).join('');
}

function renderAvatarOutfits() {
    const el = document.getElementById('avatar-outfits-list');
    if (!el) return;
    if (!avatarOutfits.length) {
        el.innerHTML = '<p class="text-xs text-slate-400">Chưa có outfit đã lưu.</p>';
        return;
    }
    el.innerHTML = avatarOutfits.map(o => `
        <div class="flex items-center justify-between gap-2 bg-slate-50 border rounded-lg px-3 py-2 text-sm">
            <div>
                <div class="font-medium">${escapeHtml(o.name)}</div>
                <div class="text-xs text-slate-400">${o.gender === 'male' ? 'Nam' : 'Nữ'}</div>
            </div>
            <div class="flex gap-1 shrink-0">
                <button type="button" data-avatar-apply-outfit="${o.id}" class="text-xs bg-brand-600 text-white px-2 py-1 rounded-lg">Mặc</button>
                <button type="button" data-avatar-del-outfit="${o.id}" class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-lg">Xóa</button>
            </div>
        </div>`).join('');
}

function renderAvatarWardrobe() {
    const el = document.getElementById('avatar-wardrobe-list');
    if (!el) return;
    const owned = avatarCatalog.filter(i => i.isFree || i.owned || avatarOwnedIds.has(i.id));
    if (!owned.length) {
        el.innerHTML = '<p class="text-xs text-slate-400">Kho đồ trống.</p>';
        return;
    }
    el.innerHTML = owned.slice(0, 12).map(i =>
        `<span class="text-xs bg-white border rounded-lg px-2 py-1">${i.previewImage || '👕'} ${escapeHtml(i.name)}</span>`
    ).join('') + (owned.length > 12 ? `<span class="text-xs text-slate-400">+${owned.length - 12} món</span>` : '');
}

async function avatarSetGender(gender) {
    avatarState.gender = gender;
    const defaults = gender === 'male'
        ? { background: 'bg-sky', body: 'body-male', eyes: 'eyes-brown', hair: 'hair-black-short', top: 'top-white-tee', bottom: 'bottom-jeans', shoes: 'shoes-sneaker' }
        : { background: 'bg-pink', body: 'body-female', eyes: 'eyes-brown', hair: 'hair-brown-long', top: 'top-white-tee', bottom: 'bottom-skirt-pink', shoes: 'shoes-sneaker' };
    try {
        const r = await api('/avatar/save-current', {
            method: 'POST',
            body: JSON.stringify({ gender, items: defaults }),
        });
        avatarState = r;
        await loadAvatarRoom();
    } catch (e) {
        toast(e.message, true);
    }
}

async function avatarEquip(itemId) {
    try {
        const r = await api('/avatar/equip-item', {
            method: 'POST',
            body: JSON.stringify({ itemId, gender: avatarState.gender }),
        });
        avatarState = r;
        renderAvatarPreview();
        renderAvatarItems();
        toast('Đã trang bị!');
    } catch (e) {
        if (e.message?.includes('chưa sở hữu')) toast(e.message, true);
        else toast(e.message, true);
    }
}

async function avatarBuy(itemId) {
    try {
        const r = await api('/avatar/buy-item', { method: 'POST', body: JSON.stringify({ itemId }) });
        currentUser.balance = r.balance;
        updateHeader();
        avatarOwnedIds.add(itemId);
        toast('Mua vật phẩm thành công!');
        await loadAvatarRoom();
        await avatarEquip(itemId);
    } catch (e) {
        if (e.message?.includes('không đủ') || e.needTopup) {
            toast('Số dư không đủ, vui lòng nạp thêm', true);
            if (confirm('Đi đến trang nạp tiền?')) navigateTo('wallet');
        } else toast(e.message, true);
    }
}

function avatarTryItem(itemId) {
    const item = avatarCatalog.find(i => i.id === itemId);
    if (!item) return;
    const others = (avatarState.equipped || []).filter(e => e.category !== item.category);
    avatarState.equipped = [...others, { ...item, slot: item.category }];
    renderAvatarPreview();
    toast('Đang xem thử — mua để giữ vật phẩm này');
}

async function avatarSaveOutfit() {
    const name = prompt('Đặt tên outfit:', 'Style của tôi');
    if (!name) return;
    try {
        await api('/avatar/outfits', {
            method: 'POST',
            body: JSON.stringify({ name, gender: avatarState.gender, items: avatarState.items }),
        });
        toast('Đã lưu outfit!');
        const { outfits } = await api('/avatar/outfits');
        avatarOutfits = outfits || [];
        renderAvatarOutfits();
    } catch (e) {
        toast(e.message, true);
    }
}

async function avatarApplyOutfit(id) {
    try {
        const r = await api(`/avatar/outfits/${id}/apply`, { method: 'POST', body: '{}' });
        avatarState = r;
        renderAvatarPreview();
        renderAvatarItems();
        toast('Đã mặc outfit!');
    } catch (e) {
        toast(e.message, true);
    }
}

async function avatarDeleteOutfit(id) {
    if (!confirm('Xóa outfit này?')) return;
    try {
        await api(`/avatar/outfits/${id}`, { method: 'DELETE' });
        avatarOutfits = avatarOutfits.filter(o => o.id !== id);
        renderAvatarOutfits();
        toast('Đã xóa outfit');
    } catch (e) {
        toast(e.message, true);
    }
}

function avatarSaveImage() {
    const svg = document.getElementById('avatar-svg-output');
    if (!svg) return toast('Chưa có nhân vật để lưu', true);
    downloadAvatarPng(svg, `nhan-vat-${Date.now()}.png`);
    toast('Đang tải ảnh PNG...');
}

function avatarShareOutfit() {
    const equipped = (avatarState.equipped || []).map(e => e.name).join(', ');
    const text = `Nhân vật ${avatarState.gender === 'male' ? 'Nam' : 'Nữ'} — Shop của Đức Hi\n${equipped || 'Phòng Thay Đồ'}`;
    if (navigator.share) {
        navigator.share({ title: 'Outfit của tôi', text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => toast('Đã sao chép mô tả outfit!'));
    }
}

function initAvatarRoomEvents() {
    document.getElementById('avatar-category-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-avatar-cat]');
        if (!btn) return;
        avatarCategory = btn.dataset.avatarCat;
        renderAvatarItems();
    });
    document.getElementById('avatar-items-grid')?.addEventListener('click', e => {
        const equip = e.target.closest('[data-avatar-equip]');
        if (equip) { avatarEquip(Number(equip.dataset.avatarEquip)); return; }
        const buy = e.target.closest('[data-avatar-buy]');
        if (buy) { avatarBuy(Number(buy.dataset.avatarBuy)); return; }
        const tr = e.target.closest('[data-avatar-try]');
        if (tr) avatarTryItem(Number(tr.dataset.avatarTry));
    });
    document.getElementById('avatar-outfits-list')?.addEventListener('click', e => {
        const apply = e.target.closest('[data-avatar-apply-outfit]');
        if (apply) { avatarApplyOutfit(Number(apply.dataset.avatarApplyOutfit)); return; }
        const del = e.target.closest('[data-avatar-del-outfit]');
        if (del) avatarDeleteOutfit(Number(del.dataset.avatarDelOutfit));
    });
    document.querySelectorAll('.avatar-gender-btn').forEach(btn => {
        btn.onclick = () => avatarSetGender(btn.dataset.gender);
    });
    document.getElementById('avatar-save-outfit-btn')?.addEventListener('click', avatarSaveOutfit);
    document.getElementById('avatar-save-image-btn')?.addEventListener('click', avatarSaveImage);
    document.getElementById('avatar-share-btn')?.addEventListener('click', avatarShareOutfit);
}

/* ─── Admin Avatar ─── */
async function loadAdminAvatar() {
    try {
        const { items } = await api('/admin/avatar/items');
        const { revenue, itemsSold } = await api('/admin/avatar/revenue');
        const stats = document.getElementById('admin-avatar-stats');
        if (stats) {
            stats.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Doanh thu thay đồ</div><div class="text-xl font-bold text-emerald-600">${formatMoney(revenue)}</div></div>
                    <div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Vật phẩm đã bán</div><div class="text-xl font-bold">${itemsSold}</div></div>
                </div>`;
        }
        const el = document.getElementById('admin-avatar-list');
        if (!el) return;
        if (!items.length) {
            el.innerHTML = emptyState('Chưa có vật phẩm thay đồ.');
            return;
        }
        el.innerHTML = items.map(item => `
            <div class="bg-white border rounded-xl p-4 shadow-sm" data-avatar-admin-row="${item.id}">
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                    <div class="lg:col-span-1 text-3xl text-center">${item.previewImage || '👕'}</div>
                    <div class="lg:col-span-2">
                        <label class="text-xs text-slate-500">Tên</label>
                        <input data-av-field="name" data-av-id="${item.id}" value="${escapeHtml(item.name)}" class="border rounded-lg px-2 py-1.5 text-sm w-full mt-1">
                    </div>
                    <div class="lg:col-span-2">
                        <label class="text-xs text-slate-500">Loại</label>
                        <select data-av-field="category" data-av-id="${item.id}" class="border rounded-lg px-2 py-1.5 text-sm w-full mt-1">
                            ${AVATAR_CATEGORIES.map(c => `<option value="${c.id}" ${c.id === item.category ? 'selected' : ''}>${c.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="lg:col-span-1">
                        <label class="text-xs text-slate-500">Giới tính</label>
                        <select data-av-field="gender" data-av-id="${item.id}" class="border rounded-lg px-2 py-1.5 text-sm w-full mt-1">
                            <option value="all" ${item.gender === 'all' ? 'selected' : ''}>All</option>
                            <option value="male" ${item.gender === 'male' ? 'selected' : ''}>Nam</option>
                            <option value="female" ${item.gender === 'female' ? 'selected' : ''}>Nữ</option>
                        </select>
                    </div>
                    <div class="lg:col-span-1">
                        <label class="text-xs text-slate-500">Giá</label>
                        <input data-av-field="price" data-av-id="${item.id}" type="number" value="${item.price}" class="border rounded-lg px-2 py-1.5 text-sm w-full mt-1">
                    </div>
                    <div class="lg:col-span-1">
                        <label class="text-xs text-slate-500">Miễn phí</label>
                        <select data-av-field="isFree" data-av-id="${item.id}" class="border rounded-lg px-2 py-1.5 text-sm w-full mt-1">
                            <option value="1" ${item.isFree ? 'selected' : ''}>Có</option>
                            <option value="0" ${!item.isFree ? 'selected' : ''}>Không</option>
                        </select>
                    </div>
                    <div class="lg:col-span-2">
                        <label class="text-xs text-slate-500">Layer key</label>
                        <input data-av-field="layerImage" data-av-id="${item.id}" value="${escapeHtml(item.layerImage)}" class="border rounded-lg px-2 py-1.5 text-sm w-full mt-1">
                    </div>
                    <div class="lg:col-span-2 flex gap-2">
                        <button data-av-save="${item.id}" class="flex-1 bg-brand-600 text-white text-sm py-2 rounded-lg">Lưu</button>
                        <button data-av-del="${item.id}" class="bg-red-500 text-white text-sm px-3 py-2 rounded-lg"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="lg:col-span-12 text-xs text-slate-400">Đã bán: ${item.purchaseCount || 0} lượt</div>
                </div>
            </div>`).join('');
    } catch (e) {
        toast(e.message, true);
    }
}

function readAvatarAdminRow(id) {
    const fields = document.querySelectorAll(`[data-av-id="${id}"]`);
    const get = name => {
        const el = [...fields].find(f => f.dataset.avField === name);
        return el?.value;
    };
    return {
        name: (get('name') || '').trim(),
        category: get('category'),
        gender: get('gender'),
        price: parseInt(get('price'), 10) || 0,
        isFree: get('isFree') === '1',
        layerImage: (get('layerImage') || '').trim(),
        previewImage: document.querySelector(`[data-avatar-admin-row="${id}"]`)?.querySelector('.text-3xl')?.textContent?.trim() || '👕',
    };
}

async function saveAdminAvatarItem(id) {
    const body = readAvatarAdminRow(id);
    if (!body.name) return toast('Nhập tên vật phẩm', true);
    try {
        await api(`/admin/avatar/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('Đã cập nhật!');
        loadAdminAvatar();
    } catch (e) {
        toast(e.message, true);
    }
}

async function deleteAdminAvatarItem(id) {
    if (!confirm('Xóa vật phẩm này?')) return;
    try {
        await api(`/admin/avatar/items/${id}`, { method: 'DELETE' });
        toast('Đã xóa!');
        loadAdminAvatar();
    } catch (e) {
        toast(e.message, true);
    }
}

async function createAdminAvatarItem() {
    const name = document.getElementById('new-avatar-name')?.value.trim();
    const category = document.getElementById('new-avatar-category')?.value;
    const gender = document.getElementById('new-avatar-gender')?.value;
    const price = parseInt(document.getElementById('new-avatar-price')?.value, 10) || 0;
    const preview = document.getElementById('new-avatar-preview')?.value.trim() || '👕';
    const layer = document.getElementById('new-avatar-layer')?.value.trim() || `custom-${Date.now()}`;
    const isFree = document.getElementById('new-avatar-free')?.value === '1';
    if (!name) return toast('Nhập tên vật phẩm', true);
    try {
        await api('/admin/avatar/items', {
            method: 'POST',
            body: JSON.stringify({ name, category, gender, price, previewImage: preview, layerImage: layer, isFree }),
        });
        toast('Đã thêm vật phẩm!');
        document.getElementById('admin-avatar-form')?.classList.add('hidden');
        loadAdminAvatar();
    } catch (e) {
        toast(e.message, true);
    }
}

function initAvatarAdminEvents() {
    document.getElementById('admin-avatar-add-btn')?.addEventListener('click', () => {
        document.getElementById('admin-avatar-form')?.classList.toggle('hidden');
    });
    document.getElementById('new-avatar-save')?.addEventListener('click', createAdminAvatarItem);
    document.getElementById('admin-avatar-list')?.addEventListener('click', e => {
        const save = e.target.closest('[data-av-save]');
        if (save) { saveAdminAvatarItem(Number(save.dataset.avSave)); return; }
        const del = e.target.closest('[data-av-del]');
        if (del) deleteAdminAvatarItem(Number(del.dataset.avDel));
    });
}