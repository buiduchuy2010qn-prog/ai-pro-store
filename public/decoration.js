/* Phòng Thay Đồ Nhân Vật — UI (158+ vật phẩm) */
const DR_CATEGORIES = [
    { id: 'body', label: 'Nhân vật', icon: 'fa-user' },
    { id: 'background', label: 'Nền', icon: 'fa-image' },
    { id: 'hair', label: 'Tóc', icon: 'fa-user' },
    { id: 'eyes', label: 'Mắt', icon: 'fa-eye' },
    { id: 'expression', label: 'Biểu cảm', icon: 'fa-face-smile' },
    { id: 'makeup', label: 'Trang điểm', icon: 'fa-wand-magic-sparkles' },
    { id: 'top', label: 'Áo', icon: 'fa-shirt' },
    { id: 'bottom', label: 'Quần/Váy', icon: 'fa-person' },
    { id: 'shoes', label: 'Giày', icon: 'fa-shoe-prints' },
    { id: 'accessory', label: 'Phụ kiện', icon: 'fa-gem' },
    { id: 'effect', label: 'Hiệu ứng', icon: 'fa-star' },
];

let drState = { gender: 'female', theme: 'japanese_cute', equipped: [], items: {} };
let drCatalog = [];
let drCategory = 'hair';
let drOutfits = [];

function drBuildEquipped(itemIds) {
    const equipped = [];
    for (const [, id] of Object.entries(itemIds || {})) {
        const item = drCatalog.find(i => i.id === id);
        if (item) equipped.push({ ...item, slot: item.category });
    }
    equipped.sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    return equipped;
}

function drResetDefaults() {
    const defaults = drState.gender === 'male'
        ? { background: 'dec-bg-school', body: 'dec-body-m-school', eyes: 'dec-eyes-brown', expression: 'dec-expr-cool', hair: 'dec-hair-black-layer', top: 'dec-top-m-uniform', bottom: 'dec-bottom-m-pants', shoes: 'dec-shoes-sneaker-white' }
        : { background: 'dec-bg-sakura', body: 'dec-body-f-idol', eyes: 'dec-eyes-blue', expression: 'dec-expr-cute', hair: 'dec-hair-silver-long', top: 'dec-top-idol-dress', bottom: 'dec-bottom-skirt-pastel', shoes: 'dec-shoes-loafer' };
    drState.items = {};
    drState.equipped = [];
    for (const [cat, key] of Object.entries(defaults)) {
        const item = drCatalog.find(i => i.layerImage === key) || drCatalog.find(i => i.category === cat);
        if (item) { drState.items[cat] = item.id; drState.equipped.push({ ...item, slot: cat }); }
    }
    drState.equipped.sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
}

function drRenderPreview() {
    const box = document.getElementById('dr-preview');
    if (!box) return;
    box.innerHTML = drBuildSvg(drState.equipped, drState.gender);
    const svg = box.querySelector('svg');
    if (svg) { svg.classList.add('w-full', 'h-full', 'max-h-[480px]'); svg.id = 'dr-svg-output'; }
}

async function loadDressRoom() {
    try {
        const [itemsRes, draftRes, outfitsRes] = await Promise.all([
            api(`/decoration/items?gender=${drState.gender}`),
            api('/decoration/draft').catch(() => ({ draft: null })),
            api('/decoration/outfits').catch(() => ({ outfits: [] })),
        ]);
        drCatalog = itemsRes.items || [];
        drOutfits = outfitsRes.outfits || [];
        if (draftRes.draft?.items && Object.keys(draftRes.draft.items).length) {
            drState.gender = draftRes.draft.gender || drState.gender;
            drState.theme = draftRes.draft.theme || drState.theme;
            drState.items = draftRes.draft.items;
            drState.equipped = drBuildEquipped(drState.items);
        } else if (!drState.equipped.length) drResetDefaults();
        const themeEl = document.getElementById('dr-theme-select');
        if (themeEl) themeEl.value = drState.theme;
        document.querySelectorAll('.dr-gender-btn').forEach(btn => {
            btn.className = `dr-gender-btn px-4 py-2 rounded-xl text-sm font-medium transition ${btn.dataset.gender === drState.gender ? 'bg-pink-500 text-white shadow-md' : 'bg-white/80 text-pink-700 border border-pink-200'}`;
        });
        drRenderPreview();
        drRenderItems();
        drRenderOutfits();
    } catch (e) { toast(e.message, true); }
}

const loadDecorationRoom = loadDressRoom;
const loadAvatarRoom = loadDressRoom;

function drRenderItems() {
    const grid = document.getElementById('dr-items-grid');
    const tabs = document.getElementById('dr-category-tabs');
    if (!grid || !tabs) return;
    tabs.innerHTML = DR_CATEGORIES.map(c =>
        `<button type="button" data-dr-cat="${c.id}" class="dr-cat-btn shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${c.id === drCategory ? 'bg-pink-500 text-white shadow' : 'bg-white/90 text-pink-600 border border-pink-200 hover:bg-pink-50'}"><i class="fas ${c.icon} mr-1"></i>${c.label}</button>`
    ).join('');
    let items = drCatalog.filter(i => i.category === drCategory);
    if (drState.theme && !['body', 'background'].includes(drCategory)) {
        items = items.filter(i => i.theme === drState.theme || i.theme === 'japanese_cute');
    }
    if (!items.length) { grid.innerHTML = '<div class="col-span-full text-center py-10 text-pink-300 text-sm">Chưa có vật phẩm.</div>'; return; }
    grid.innerHTML = items.map(item => {
        const on = drState.equipped.some(e => e.id === item.id);
        const thumb = drItemThumb(item.layerImage, item.category);
        return `<button type="button" data-dr-equip="${item.id}" class="dr-item-card group bg-white/95 border-2 rounded-2xl p-2 text-center shadow-sm hover:shadow-lg hover:scale-[1.03] transition-all duration-200 ${on ? 'border-pink-400 ring-2 ring-pink-200' : 'border-pink-100'}">
            <div class="w-14 h-14 mx-auto mb-1 rounded-xl bg-gradient-to-br from-pink-50 to-violet-50 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform">${thumb}</div>
            <div class="text-[10px] font-medium text-pink-800 line-clamp-2 min-h-[2rem] leading-tight">${escapeHtml(item.name)}</div>
            ${on ? '<div class="text-[9px] text-pink-500 mt-0.5 font-semibold">✓ Đang mặc</div>' : ''}
        </button>`;
    }).join('');
}

function drEquip(itemId) {
    const item = drCatalog.find(i => i.id === itemId);
    if (!item) return;
    if (item.gender !== 'all' && item.gender !== drState.gender) return toast('Vật phẩm không phù hợp giới tính', true);
    drState.items[item.category] = item.id;
    drState.equipped = drState.equipped.filter(e => e.category !== item.category);
    drState.equipped.push({ ...item, slot: item.category });
    drState.equipped.sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    drRenderPreview();
    drRenderItems();
}

async function drSetGender(gender) {
    drState.gender = gender;
    const { items } = await api(`/decoration/items?gender=${gender}`);
    drCatalog = items || [];
    drResetDefaults();
    drRenderPreview();
    drRenderItems();
    document.querySelectorAll('.dr-gender-btn').forEach(btn => {
        btn.className = `dr-gender-btn px-4 py-2 rounded-xl text-sm font-medium transition ${btn.dataset.gender === gender ? 'bg-pink-500 text-white shadow-md' : 'bg-white/80 text-pink-700 border border-pink-200'}`;
    });
}

async function drSaveDraft() {
    const svg = document.getElementById('dr-svg-output');
    let preview = '';
    if (svg) { try { preview = await drSvgToPng(svg); } catch (_) {} }
    try {
        await api('/decoration/save-draft', { method: 'POST', body: JSON.stringify({ gender: drState.gender, theme: drState.theme, items: drState.items, previewImage: preview }) });
        toast('Đã lưu tiến độ!');
    } catch (e) { toast(e.message, true); }
}

async function drSaveOutfit() {
    const name = prompt('Tên outfit:', 'Outfit của tôi');
    if (!name) return;
    const svg = document.getElementById('dr-svg-output');
    let preview = '';
    if (svg) { try { preview = await drSvgToPng(svg); } catch (_) {} }
    try {
        await api('/decoration/outfits', { method: 'POST', body: JSON.stringify({ name, gender: drState.gender, theme: drState.theme, items: drState.items, previewImage: preview }) });
        toast('Đã lưu outfit!');
        const { outfits } = await api('/decoration/outfits');
        drOutfits = outfits || [];
        drRenderOutfits();
    } catch (e) { toast(e.message, true); }
}

function drRenderOutfits() {
    const el = document.getElementById('dr-outfits-list');
    if (!el) return;
    if (!drOutfits.length) { el.innerHTML = '<p class="text-xs text-pink-400">Chưa có outfit đã lưu.</p>'; return; }
    el.innerHTML = drOutfits.map(o => `
        <div class="flex items-center gap-2 bg-white/90 border border-pink-100 rounded-xl p-2 text-sm">
            ${o.previewImage ? `<img src="${o.previewImage}" class="w-10 h-12 object-cover rounded-lg border shrink-0" alt="">` : '<div class="w-10 h-12 bg-pink-50 rounded-lg shrink-0"></div>'}
            <div class="flex-1 min-w-0">
                <div class="font-medium truncate text-xs">${escapeHtml(o.name)}</div>
                <div class="text-[10px] text-pink-400">${o.gender === 'male' ? 'Nam' : 'Nữ'}</div>
            </div>
            <button type="button" data-dr-apply="${o.id}" class="text-[10px] bg-pink-500 text-white px-2 py-1 rounded-lg shrink-0">Mặc</button>
            <button type="button" data-dr-del-outfit="${o.id}" class="text-[10px] text-red-500 px-1 shrink-0">×</button>
        </div>`).join('');
}

async function drApplyOutfit(id) {
    try {
        const r = await api(`/decoration/outfits/${id}/apply`, { method: 'POST', body: '{}' });
        drState.gender = r.gender;
        drState.theme = r.theme;
        drState.items = r.items;
        drState.equipped = r.equipped || drBuildEquipped(r.items);
        document.getElementById('dr-theme-select').value = drState.theme;
        drRenderPreview();
        drRenderItems();
        toast('Đã mặc outfit!');
    } catch (e) { toast(e.message, true); }
}

async function drDeleteOutfit(id) {
    if (!confirm('Xóa outfit này?')) return;
    try {
        await api(`/decoration/outfits/${id}`, { method: 'DELETE' });
        drOutfits = drOutfits.filter(o => o.id !== id);
        drRenderOutfits();
        toast('Đã xóa outfit');
    } catch (e) { toast(e.message, true); }
}

function drShare() {
    const names = drState.equipped.map(e => e.name).join(', ');
    const text = `Outfit ${drState.gender === 'male' ? 'Nam' : 'Nữ'} — Phòng Thay Đồ Shop Đức Hi\n${names}`;
    if (navigator.share) navigator.share({ title: 'Outfit của tôi', text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => toast('Đã sao chép mô tả outfit!'));
}

function initDressRoomEvents() {
    document.getElementById('dr-category-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-dr-cat]');
        if (btn) { drCategory = btn.dataset.drCat; drRenderItems(); }
    });
    document.getElementById('dr-items-grid')?.addEventListener('click', e => {
        const card = e.target.closest('[data-dr-equip]');
        if (card) drEquip(Number(card.dataset.drEquip));
    });
    document.getElementById('dr-outfits-list')?.addEventListener('click', e => {
        const apply = e.target.closest('[data-dr-apply]');
        if (apply) { drApplyOutfit(Number(apply.dataset.drApply)); return; }
        const del = e.target.closest('[data-dr-del-outfit]');
        if (del) drDeleteOutfit(Number(del.dataset.drDelOutfit));
    });
    document.querySelectorAll('.dr-gender-btn').forEach(btn => { btn.onclick = () => drSetGender(btn.dataset.gender); });
    document.getElementById('dr-theme-select')?.addEventListener('change', e => { drState.theme = e.target.value; drRenderItems(); });
    document.getElementById('dr-reset-btn')?.addEventListener('click', () => { drResetDefaults(); drRenderPreview(); drRenderItems(); toast('Đã làm lại!'); });
    document.getElementById('dr-save-outfit-btn')?.addEventListener('click', drSaveOutfit);
    document.getElementById('dr-save-image-btn')?.addEventListener('click', async () => {
        const svg = document.getElementById('dr-svg-output');
        if (!svg) return;
        try {
            const data = await drSvgToPng(svg);
            const a = document.createElement('a'); a.href = data; a.download = `phong-thay-do-${Date.now()}.png`; a.click();
            toast('Đã tải ảnh!');
        } catch { toast('Lỗi tạo ảnh', true); }
    });
    document.getElementById('dr-share-btn')?.addEventListener('click', drShare);
}

const initDecorationEvents = initDressRoomEvents;

async function loadAdminDressRoom() {
    try {
        const { items } = await api('/admin/decoration/items');
        const stats = document.getElementById('admin-dr-stats');
        const d = await api('/admin/dashboard').catch(() => ({}));
        if (stats) {
            stats.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    <div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Vật phẩm</div><div class="text-xl font-bold text-pink-600">${items.length}</div></div>
                    <div class="bg-white border rounded-xl p-4"><div class="text-xs text-slate-500">Outfit đã lưu</div><div class="text-xl font-bold">${d.savedOutfits || 0}</div></div>
                </div>`;
        }
        const el = document.getElementById('admin-dr-items-list');
        if (!el) return;
        el.innerHTML = items.map(i => `
            <div class="flex items-center gap-3 bg-slate-50 border rounded-lg px-3 py-2 text-sm" data-admin-dr-row="${i.id}">
                <div class="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center overflow-hidden shrink-0">${drItemThumb(i.layerImage, i.category)}</div>
                <input data-dr-field="name" data-dr-id="${i.id}" value="${escapeHtml(i.name)}" class="flex-1 border rounded-lg px-2 py-1 text-sm min-w-0">
                <select data-dr-field="category" data-dr-id="${i.id}" class="border rounded-lg px-2 py-1 text-xs hidden sm:block">
                    ${DR_CATEGORIES.map(c => `<option value="${c.id}" ${c.id === i.category ? 'selected' : ''}>${c.label}</option>`).join('')}
                </select>
                <select data-dr-field="isActive" data-dr-id="${i.id}" class="border rounded-lg px-2 py-1 text-xs">
                    <option value="1" ${i.isActive ? 'selected' : ''}>Bật</option>
                    <option value="0" ${!i.isActive ? 'selected' : ''}>Tắt</option>
                </select>
                <button data-dr-save="${i.id}" class="bg-brand-600 text-white text-xs px-2 py-1 rounded-lg shrink-0">Lưu</button>
            </div>`).join('');
    } catch (e) { toast(e.message, true); }
}

const loadAdminDecoration = loadAdminDressRoom;

function initAdminDressRoomEvents() {
    document.getElementById('admin-dr-items-list')?.addEventListener('click', async e => {
        const save = e.target.closest('[data-dr-save]');
        if (!save) return;
        const id = Number(save.dataset.drSave);
        const get = f => document.querySelector(`[data-dr-id="${id}"][data-dr-field="${f}"]`)?.value;
        try {
            await api(`/admin/decoration/items/${id}`, { method: 'PATCH', body: JSON.stringify({
                name: (get('name') || '').trim(), category: get('category'), isActive: get('isActive') === '1',
            }) });
            toast('Đã cập nhật!');
            loadAdminDressRoom();
        } catch (err) { toast(err.message, true); }
    });
}

const initAdminDecorationEvents = initAdminDressRoomEvents;