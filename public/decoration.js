/* Cuộc Thi Trang Trí — Japanese anime SVG renderer */
const DECO_CATEGORIES = [
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
const DECO_THEMES = {
    japanese_cute: 'Nhật Bản dễ thương', idol: 'Anime Idol', kimono: 'Kimono',
    harajuku: 'Harajuku', school: 'School style', yukata: 'Yukata lễ hội',
    streetwear: 'Streetwear Nhật', sakura: 'Sakura', tokyo_night: 'Tokyo ban đêm',
    tea_house: 'Quán trà Nhật', festival: 'Lễ hội pháo hoa', princess: 'Công chúa anime',
};
const HAIR_COLORS = {
    black: '#1f2937', brown: '#78350f', pink: '#ec4899', blue: '#38bdf8',
    silver: '#94a3b8', blonde: '#fde68a', purple: '#a78bfa', red: '#f87171',
};

function decoGenericHair(key) {
    const m = key.match(/dec-hair-(\w+)-(\w+)/);
    if (!m) return '';
    const color = HAIR_COLORS[m[1]] || '#ec4899';
    const style = m[2];
    if (style === 'twintail') return `<path d="M125 125 Q160 85 195 125 L200 175 L185 175 L180 130 L140 130 L135 175 L120 175 Z" fill="${color}"/><circle cx="130" cy="160" r="16" fill="${color}"/><circle cx="190" cy="160" r="16" fill="${color}"/>`;
    if (style === 'bun') return `<ellipse cx="160" cy="100" rx="30" ry="22" fill="${color}"/><ellipse cx="160" cy="115" rx="38" ry="18" fill="${color}"/>`;
    if (style === 'short') return `<path d="M125 130 Q160 95 195 130 Q195 115 160 100 Q125 115 125 130" fill="${color}"/>`;
    if (style === 'long') return `<path d="M118 140 Q160 82 202 140 L208 210 Q160 220 112 210 Z" fill="${color}"/>`;
    if (style === 'idol') return `<path d="M120 128 Q160 78 200 128 L205 188 Q160 198 115 188 Z" fill="${color}"/><circle cx="160" cy="95" r="8" fill="${color}" opacity="0.5"/>`;
    return `<path d="M120 130 Q160 88 200 130 L202 185 Q160 195 118 185 Z" fill="${color}"/>`;
}

function decoGenericMaleHair(key) {
    const color = key.includes('silver') ? '#94a3b8' : key.includes('blue') ? '#38bdf8' : '#1f2937';
    if (key.includes('spiky')) return `<path d="M130 120 L140 90 L155 115 L160 85 L165 115 L180 90 L190 120 Q160 105 130 120" fill="${color}"/>`;
    return `<path d="M128 125 Q160 95 192 125 Q190 110 160 100 Q130 110 128 125" fill="${color}"/>`;
}

const DECO_LAYERS = {
    'dec-bg-sakura': () => '<rect width="320" height="400" fill="#fce7f3"/><circle cx="60" cy="80" r="12" fill="#fda4af" opacity="0.6"/><circle cx="250" cy="60" r="10" fill="#fb7185" opacity="0.5"/><circle cx="200" cy="120" r="8" fill="#f9a8d4" opacity="0.5"/>',
    'dec-bg-shrine': () => '<rect width="320" height="400" fill="#fef3c7"/><rect x="120" y="180" width="80" height="60" fill="#dc2626"/><path d="M100 180 L160 140 L220 180" fill="#b91c1c"/>',
    'dec-bg-tokyo': () => '<rect width="320" height="400" fill="#0f172a"/><rect x="40" y="200" width="30" height="120" fill="#1e293b"/><rect x="90" y="160" width="40" height="160" fill="#334155"/><rect x="200" y="180" width="35" height="140" fill="#1e293b"/><circle cx="250" cy="50" r="20" fill="#fde68a" opacity="0.8"/>',
    'dec-bg-school': () => '<rect width="320" height="400" fill="#dbeafe"/><rect x="80" y="150" width="160" height="100" fill="#f8fafc" stroke="#94a3b8"/><rect x="130" y="200" width="60" height="50" fill="#60a5fa" opacity="0.3"/>',
    'dec-bg-fireworks': () => '<rect width="320" height="400" fill="#1e1b4b"/><circle cx="160" cy="100" r="3" fill="#fbbf24"/><circle cx="140" cy="90" r="2" fill="#f472b6"/><circle cx="180" cy="95" r="2" fill="#60a5fa"/>',
    'dec-bg-tea': () => '<rect width="320" height="400" fill="#ecfdf5"/><rect x="60" y="250" width="200" height="8" fill="#a16207" opacity="0.4"/>',
    'dec-bg-park': () => '<rect width="320" height="400" fill="#bbf7d0"/><ellipse cx="160" cy="350" rx="150" ry="40" fill="#86efac"/>',
    'dec-bg-idol-room': () => '<rect width="320" height="400" fill="#fdf4ff"/><rect x="0" y="300" width="320" height="100" fill="#e9d5ff" opacity="0.5"/>',
    'dec-bg-harajuku': () => '<rect width="320" height="400" fill="#fef08a"/><rect x="0" y="0" width="80" height="400" fill="#f472b6" opacity="0.2"/><rect x="240" y="0" width="80" height="400" fill="#60a5fa" opacity="0.2"/>',
    'dec-bg-snow': () => '<rect width="320" height="400" fill="#f0f9ff"/><circle cx="50" cy="60" r="4" fill="#fff"/><circle cx="200" cy="40" r="3" fill="#fff"/><circle cx="280" cy="100" r="4" fill="#fff"/>',
    'dec-body-f-idol': () => '<ellipse cx="160" cy="175" rx="36" ry="44" fill="#fde4c8"/><ellipse cx="160" cy="128" rx="34" ry="38" fill="#fde4c8"/><rect x="130" y="215" width="60" height="85" rx="16" fill="#fde4c8"/>',
    'dec-body-f-kimono': () => '<ellipse cx="160" cy="128" rx="34" ry="38" fill="#fde4c8"/><path d="M120 215 Q160 240 200 215 L210 310 Q160 330 110 310 Z" fill="#fde4c8"/>',
    'dec-body-f-school': () => '<ellipse cx="160" cy="128" rx="32" ry="36" fill="#fde4c8"/><rect x="132" y="212" width="56" height="88" rx="14" fill="#fde4c8"/>',
    'dec-body-f-harajuku': () => '<ellipse cx="160" cy="128" rx="33" ry="37" fill="#fde4c8"/><path d="M125 215 L135 305 L185 305 L195 215 Z" fill="#fde4c8"/>',
    'dec-body-f-princess': () => '<ellipse cx="160" cy="126" rx="35" ry="39" fill="#fde4c8"/><path d="M118 212 Q160 250 202 212 L205 300 Q160 318 115 300 Z" fill="#fde4c8"/>',
    'dec-body-m-school': () => '<ellipse cx="160" cy="128" rx="34" ry="38" fill="#fcd9b6"/><rect x="128" y="215" width="64" height="90" rx="14" fill="#fcd9b6"/>',
    'dec-body-m-street': () => '<ellipse cx="160" cy="128" rx="35" ry="39" fill="#fcd9b6"/><rect x="126" y="212" width="68" height="92" rx="12" fill="#fcd9b6"/>',
    'dec-body-m-idol': () => '<ellipse cx="160" cy="126" rx="36" ry="40" fill="#fcd9b6"/><rect x="127" y="210" width="66" height="95" rx="16" fill="#fcd9b6"/>',
    'dec-eyes-blue': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#2563eb"/><circle cx="175" cy="134" r="6" fill="#2563eb"/><circle cx="147" cy="131" r="2" fill="#fff"/>',
    'dec-eyes-brown': () => '<ellipse cx="145" cy="132" rx="9" ry="11" fill="#fff"/><ellipse cx="175" cy="132" rx="9" ry="11" fill="#fff"/><circle cx="145" cy="134" r="5" fill="#5c3d2e"/><circle cx="175" cy="134" r="5" fill="#5c3d2e"/>',
    'dec-eyes-purple': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#7c3aed"/><circle cx="175" cy="134" r="6" fill="#7c3aed"/>',
    'dec-eyes-sparkle': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#38bdf8"/><circle cx="175" cy="134" r="6" fill="#38bdf8"/><text x="141" y="128" font-size="8" fill="#fff">✦</text><text x="171" y="128" font-size="8" fill="#fff">✦</text>',
    'dec-eyes-cool': () => '<path d="M135 130 Q145 136 155 130" fill="none" stroke="#334155" stroke-width="2"/><path d="M165 130 Q175 136 185 130" fill="none" stroke="#334155" stroke-width="2"/>',
    'dec-eyes-pink': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#ec4899"/><circle cx="175" cy="134" r="6" fill="#ec4899"/>',
    'dec-eyes-gold': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#f59e0b"/><circle cx="175" cy="134" r="6" fill="#f59e0b"/>',
    'dec-eyes-green': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#22c55e"/><circle cx="175" cy="134" r="6" fill="#22c55e"/>',
    'dec-eyes-red': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#ef4444"/><circle cx="175" cy="134" r="6" fill="#ef4444"/>',
    'dec-eyes-gradient': () => '<ellipse cx="145" cy="132" rx="10" ry="12" fill="#fff"/><ellipse cx="175" cy="132" rx="10" ry="12" fill="#fff"/><circle cx="145" cy="134" r="6" fill="#a78bfa"/><circle cx="175" cy="134" r="6" fill="#38bdf8"/>',
    'dec-expr-smile': () => '<path d="M150 152 Q160 160 170 152" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round"/>',
    'dec-expr-happy': () => '<path d="M148 150 Q160 165 172 150" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round"/>',
    'dec-expr-shy': () => '<ellipse cx="135" cy="148" rx="8" ry="5" fill="#fda4af" opacity="0.5"/><ellipse cx="185" cy="148" rx="8" ry="5" fill="#fda4af" opacity="0.5"/><path d="M152 154 Q160 158 168 154" fill="none" stroke="#d97706" stroke-width="1.5"/>',
    'dec-expr-cool': () => '<line x1="150" y1="154" x2="170" y2="154" stroke="#334155" stroke-width="2" stroke-linecap="round"/>',
    'dec-expr-cute': () => '<path d="M150 152 Q160 158 170 152" fill="#f472b6" opacity="0.6"/>',
    'dec-expr-calm': () => '<path d="M152 154 L168 154" fill="none" stroke="#92400e" stroke-width="1.5"/>',
    'dec-expr-wink': () => '<path d="M148 150 Q160 162 172 150" fill="none" stroke="#d97706" stroke-width="2"/><path d="M168 130 Q178 134 188 130" fill="none" stroke="#334155" stroke-width="2"/>',
    'dec-top-idol-dress': () => '<path d="M126 218 L110 240 L122 248 L134 228 L134 285 L186 285 L186 228 L198 248 L210 240 L194 218 Q160 242 126 218" fill="#f472b6"/><circle cx="160" cy="255" r="8" fill="#fff" opacity="0.5"/>',
    'dec-top-kimono-sakura': () => '<path d="M120 215 Q160 245 200 215 L205 300 Q160 320 115 300 Z" fill="#fda4af"/><path d="M120 215 L160 250 L200 215" fill="#fff" opacity="0.3"/>',
    'dec-top-f-uniform': () => '<path d="M128 218 L128 282 L192 282 L192 218 Q160 240 128 218" fill="#1e3a5f"/><rect x="155" y="240" width="10" height="30" fill="#dc2626"/>',
    'dec-top-m-uniform': () => '<path d="M128 218 L128 285 L192 285 L192 218 Q160 242 128 218" fill="#1e3a5f"/><rect x="155" y="245" width="10" height="25" fill="#334155"/>',
    'dec-bottom-skirt-pastel': () => '<path d="M128 278 L110 335 Q160 350 210 335 L192 278 Z" fill="#c4b5fd"/>',
    'dec-bottom-m-pants': () => '<rect x="132" y="278" width="22" height="58" rx="5" fill="#1e3a5f"/><rect x="166" y="278" width="22" height="58" rx="5" fill="#1e3a5f"/>',
    'dec-shoes-loafer': () => '<ellipse cx="143" cy="338" rx="15" ry="7" fill="#1e3a5f"/><ellipse cx="177" cy="338" rx="15" ry="7" fill="#1e3a5f"/>',
    'dec-shoes-sneaker-white': () => '<ellipse cx="143" cy="338" rx="16" ry="8" fill="#fff" stroke="#cbd5e1"/><ellipse cx="177" cy="338" rx="16" ry="8" fill="#fff" stroke="#cbd5e1"/>',
    'dec-fx-sakura-fall': () => '<text x="40" y="60" font-size="14" fill="#fda4af">❀</text><text x="260" y="90" font-size="12" fill="#fb7185">❀</text><text x="180" y="50" font-size="10" fill="#f9a8d4">❀</text>',
    'dec-fx-stars': () => '<text x="50" y="70" font-size="16" fill="#fbbf24">★</text><text x="250" y="80" font-size="14" fill="#fde68a">★</text>',
    'dec-fx-hearts': () => '<text x="45" y="75" font-size="14" fill="#f472b6">♥</text><text x="255" y="85" font-size="12" fill="#fb7185">♥</text>',
    'dec-fx-fireworks': () => '<text x="160" y="60" font-size="20" fill="#fbbf24">✦</text><text x="140" y="80" font-size="14" fill="#f472b6">✦</text>',
    'dec-mu-blush': () => '<ellipse cx="135" cy="146" rx="9" ry="5" fill="#fda4af" opacity="0.45"/><ellipse cx="185" cy="146" rx="9" ry="5" fill="#fda4af" opacity="0.45"/>',
    'dec-mu-lip-pink': () => '<path d="M150 150 Q160 156 170 150 Q160 153 150 150" fill="#f472b6" opacity="0.7"/>',
    'dec-mu-idol': () => '<ellipse cx="135" cy="146" rx="8" ry="4" fill="#fda4af" opacity="0.4"/><ellipse cx="185" cy="146" rx="8" ry="4" fill="#fda4af" opacity="0.4"/><path d="M150 150 Q160 157 170 150" fill="#e11d48" opacity="0.7"/>',
};

function renderDecoLayer(key) {
    if (!key) return '';
    const fn = DECO_LAYERS[key];
    if (fn) return fn();
    if (key.startsWith('dec-hair-m-') || key.includes('m-layer') || key.includes('m-idol') || key.includes('m-spiky')) return decoGenericMaleHair(key);
    if (key.startsWith('dec-hair-')) return decoGenericHair(key);
    if (key.startsWith('dec-top-') || key.startsWith('dec-bottom-') || key.startsWith('dec-shoes-')) {
        const color = key.includes('pink') ? '#f472b6' : key.includes('blue') ? '#3b82f6' : key.includes('red') ? '#dc2626' : '#a78bfa';
        if (key.includes('top')) return `<path d="M128 218 L128 282 L192 282 L192 218 Q160 240 128 218" fill="${color}"/>`;
        if (key.includes('bottom')) return `<path d="M128 278 L112 330 Q160 345 208 330 L192 278 Z" fill="${color}"/>`;
        return `<ellipse cx="143" cy="338" rx="15" ry="7" fill="${color}"/><ellipse cx="177" cy="338" rx="15" ry="7" fill="${color}"/>`;
    }
    if (key.startsWith('dec-acc-')) return `<text x="220" y="260" font-size="20">${key.includes('ribbon') ? '🎀' : key.includes('fan') ? '🪭' : '✨'}</text>`;
    if (key.startsWith('dec-fx-')) return '<text x="250" y="70" font-size="14" fill="#fbbf24">✦</text>';
    if (key.startsWith('dec-mu-')) return '<ellipse cx="135" cy="146" rx="8" ry="4" fill="#fda4af" opacity="0.4"/>';
    if (key.startsWith('dec-expr-')) return '<path d="M150 152 Q160 158 170 152" fill="none" stroke="#d97706" stroke-width="2"/>';
    return '';
}

function buildDecoSvg(equipped, gender) {
    const sorted = [...(equipped || [])].sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    const layers = [];
    let hasBody = false;
    for (const item of sorted) {
        const svg = renderDecoLayer(item.layerImage);
        if (svg) {
            layers.push(svg);
            if (item.category === 'body') hasBody = true;
        }
    }
    if (!hasBody) {
        const bodyKey = gender === 'male' ? 'dec-body-m-school' : 'dec-body-f-idol';
        layers.splice(1, 0, renderDecoLayer(bodyKey));
    }
    if (!layers.length) {
        layers.push(renderDecoLayer('dec-bg-sakura'));
        layers.push(renderDecoLayer(gender === 'male' ? 'dec-body-m-school' : 'dec-body-f-idol'));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400" width="320" height="400">${layers.join('')}</svg>`;
}

function decoSvgToDataUrl(svgEl) {
    const svgData = new XMLSerializer().serializeToString(svgEl);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}

function decoSvgToPngDataUrl(svgEl) {
    return new Promise((resolve, reject) => {
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 800;
        const ctx = canvas.getContext('2d');
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            ctx.fillStyle = '#fffef9';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
    });
}

let decoState = { gender: 'female', theme: 'japanese_cute', equipped: [], items: {} };
let decoCatalog = [];
let decoCategory = 'hair';
let decoSubmissions = [];
let decoLeaderboard = null;

function renderDecoPreview() {
    const box = document.getElementById('deco-preview');
    if (!box) return;
    box.innerHTML = buildDecoSvg(decoState.equipped, decoState.gender);
    const svg = box.querySelector('svg');
    if (svg) { svg.classList.add('w-full', 'h-full', 'max-h-[440px]'); svg.id = 'deco-svg-output'; }
}

async function loadDecorationRoom() {
    try {
        const [itemsRes, draftRes, subsRes, lbRes] = await Promise.all([
            api(`/decoration/items?gender=${decoState.gender}`),
            api('/decoration/draft').catch(() => ({ draft: null })),
            api('/decoration/my-submissions').catch(() => ({ submissions: [] })),
            api('/decoration/leaderboard'),
        ]);
        decoCatalog = itemsRes.items || [];
        decoSubmissions = subsRes.submissions || [];
        decoLeaderboard = lbRes;
        if (draftRes.draft?.items && Object.keys(draftRes.draft.items).length) {
            decoState.gender = draftRes.draft.gender || decoState.gender;
            decoState.theme = draftRes.draft.theme || decoState.theme;
            decoState.items = draftRes.draft.items;
            decoState.equipped = buildEquippedFromIds(draftRes.draft.items);
        } else if (!decoState.equipped.length) {
            resetDecoDefaults();
        }
        document.getElementById('deco-theme-select').value = decoState.theme;
        document.querySelectorAll('.deco-gender-btn').forEach(btn => {
            btn.className = `deco-gender-btn px-4 py-2 rounded-xl text-sm font-medium transition ${btn.dataset.gender === decoState.gender ? 'bg-pink-500 text-white shadow-md' : 'bg-white/80 text-pink-700 border border-pink-200'}`;
        });
        renderDecoPreview();
        renderDecoItems();
        renderDecoSubmissions();
        renderDecoLeaderboard();
    } catch (e) { toast(e.message, true); }
}

function buildEquippedFromIds(itemIds) {
    const equipped = [];
    for (const [cat, id] of Object.entries(itemIds || {})) {
        const item = decoCatalog.find(i => i.id === id);
        if (item) equipped.push({ ...item, slot: cat });
    }
    equipped.sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    return equipped;
}

function resetDecoDefaults() {
    const defaults = decoState.gender === 'male'
        ? { background: 'dec-bg-school', body: 'dec-body-m-school', eyes: 'dec-eyes-brown', expression: 'dec-expr-cool', hair: 'dec-hair-m-layer', top: 'dec-top-m-uniform', bottom: 'dec-bottom-m-pants', shoes: 'dec-shoes-sneaker-white' }
        : { background: 'dec-bg-sakura', body: 'dec-body-f-idol', eyes: 'dec-eyes-blue', expression: 'dec-expr-cute', hair: 'dec-hair-pink-long', top: 'dec-top-idol-dress', bottom: 'dec-bottom-skirt-pastel', shoes: 'dec-shoes-loafer' };
    decoState.items = {};
    decoState.equipped = [];
    for (const [cat, key] of Object.entries(defaults)) {
        const item = decoCatalog.find(i => i.layerImage === key) || decoCatalog.find(i => i.category === cat);
        if (item) { decoState.items[cat] = item.id; decoState.equipped.push({ ...item, slot: cat }); }
    }
    decoState.equipped.sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
}

function renderDecoItems() {
    const grid = document.getElementById('deco-items-grid');
    const tabs = document.getElementById('deco-category-tabs');
    if (!grid || !tabs) return;
    tabs.innerHTML = DECO_CATEGORIES.map(c =>
        `<button type="button" data-deco-cat="${c.id}" class="deco-cat-btn shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${c.id === decoCategory ? 'bg-pink-500 text-white shadow' : 'bg-white/90 text-pink-600 border border-pink-200 hover:bg-pink-50'}"><i class="fas ${c.icon} mr-1"></i>${c.label}</button>`
    ).join('');
    let items = decoCatalog.filter(i => i.category === decoCategory);
    if (decoState.theme) items = items.filter(i => i.theme === decoState.theme || i.theme === 'japanese_cute' || decoCategory === 'body' || decoCategory === 'background');
    if (!items.length) { grid.innerHTML = '<div class="col-span-full text-center py-10 text-pink-300 text-sm">Chưa có vật phẩm.</div>'; return; }
    grid.innerHTML = items.map(item => {
        const on = decoState.equipped.some(e => e.id === item.id);
        return `<button type="button" data-deco-equip="${item.id}" class="deco-item-card group bg-white/95 border-2 rounded-2xl p-3 text-center shadow-sm hover:shadow-md hover:scale-[1.02] transition-all ${on ? 'border-pink-400 ring-2 ring-pink-200' : 'border-pink-100'}">
            <div class="text-3xl mb-1 group-hover:scale-110 transition-transform">${item.image || '👘'}</div>
            <div class="text-[11px] font-medium text-pink-800 line-clamp-2 min-h-[2rem]">${escapeHtml(item.name)}</div>
            ${on ? '<div class="text-[10px] text-pink-500 mt-1">✓ Đang dùng</div>' : ''}
        </button>`;
    }).join('');
}

function decoEquipItem(itemId) {
    const item = decoCatalog.find(i => i.id === itemId);
    if (!item) return;
    if (item.gender !== 'all' && item.gender !== decoState.gender) return toast('Vật phẩm không phù hợp giới tính', true);
    decoState.items[item.category] = item.id;
    decoState.equipped = decoState.equipped.filter(e => e.category !== item.category);
    decoState.equipped.push({ ...item, slot: item.category });
    decoState.equipped.sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    renderDecoPreview();
    renderDecoItems();
}

async function decoSaveDraft() {
    const svg = document.getElementById('deco-svg-output');
    let preview = '';
    if (svg) { try { preview = await decoSvgToPngDataUrl(svg); } catch { preview = decoSvgToDataUrl(svg); } }
    try {
        await api('/decoration/save-draft', { method: 'POST', body: JSON.stringify({ gender: decoState.gender, theme: decoState.theme, items: decoState.items, previewImage: preview }) });
        toast('Đã lưu bản nháp!');
    } catch (e) { toast(e.message, true); }
}

async function decoSubmitEntry() {
    if (!confirm('Bạn đồng ý quy định cuộc thi?\n\n• Đúng chủ đề Nhật Bản/anime\n• Không phản cảm, không nội dung người lớn\n• Admin có quyền từ chối\n• Tiền thưởng do admin quyết định')) return;
    const title = prompt('Tên bài dự thi:', 'Nhân vật của tôi');
    if (!title) return;
    const description = prompt('Mô tả ngắn (tuỳ chọn):', '') || '';
    const btn = document.getElementById('deco-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Đang gửi...';
    const svg = document.getElementById('deco-svg-output');
    let preview = '';
    try {
        if (svg) preview = await decoSvgToPngDataUrl(svg);
        await api('/decoration/submit', { method: 'POST', body: JSON.stringify({ title, description, gender: decoState.gender, theme: decoState.theme, items: decoState.items, previewImage: preview }) });
        toast('🌸 Gửi bài thành công! Admin sẽ chấm điểm sớm.');
        const { submissions } = await api('/decoration/my-submissions');
        decoSubmissions = submissions || [];
        renderDecoSubmissions();
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Gửi bài chấm điểm'; }
}

function renderDecoSubmissions() {
    const el = document.getElementById('deco-my-submissions');
    if (!el) return;
    if (!decoSubmissions.length) { el.innerHTML = '<p class="text-xs text-pink-400">Chưa gửi bài nào.</p>'; return; }
    const statusMap = { pending_review: 'Chờ chấm', approved: 'Đã duyệt', rejected: 'Từ chối' };
    const statusColor = { pending_review: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700' };
    el.innerHTML = decoSubmissions.slice(0, 5).map(s => `
        <div class="flex gap-3 bg-white/90 border border-pink-100 rounded-xl p-2 text-sm">
            ${s.previewImage ? `<img src="${s.previewImage}" class="w-12 h-14 object-cover rounded-lg border" alt="">` : '<div class="w-12 h-14 bg-pink-50 rounded-lg flex items-center justify-center text-xl">👘</div>'}
            <div class="flex-1 min-w-0">
                <div class="font-medium truncate">${escapeHtml(s.title)}</div>
                <span class="text-[10px] px-2 py-0.5 rounded-full ${statusColor[s.status] || ''}">${statusMap[s.status] || s.status}</span>
                ${s.score ? `<span class="text-xs text-pink-600 ml-1">${s.score}đ</span>` : ''}
                ${s.rewardAmount ? `<span class="text-xs text-emerald-600">+${formatMoney(s.rewardAmount)}</span>` : ''}
            </div>
        </div>`).join('');
}

function renderDecoLeaderboard() {
    const el = document.getElementById('deco-leaderboard');
    if (!el || !decoLeaderboard) return;
    const top = decoLeaderboard.topScores || [];
    if (!top.length) { el.innerHTML = '<p class="text-xs text-pink-400">Chưa có bài được chấm.</p>'; return; }
    el.innerHTML = top.slice(0, 5).map((s, i) => `
        <div class="flex items-center gap-2 text-sm py-1">
            <span class="w-5 h-5 rounded-full bg-pink-100 text-pink-600 text-xs flex items-center justify-center font-bold">${i + 1}</span>
            <span class="flex-1 truncate">${escapeHtml(s.userName || s.title)}</span>
            <span class="font-bold text-pink-600">${s.score}đ</span>
        </div>`).join('');
}

async function decoSetGender(gender) {
    decoState.gender = gender;
    const { items } = await api(`/decoration/items?gender=${gender}`);
    decoCatalog = items || [];
    resetDecoDefaults();
    renderDecoPreview();
    renderDecoItems();
    document.querySelectorAll('.deco-gender-btn').forEach(btn => {
        btn.className = `deco-gender-btn px-4 py-2 rounded-xl text-sm font-medium transition ${btn.dataset.gender === gender ? 'bg-pink-500 text-white shadow-md' : 'bg-white/80 text-pink-700 border border-pink-200'}`;
    });
}

function initDecorationEvents() {
    document.getElementById('deco-category-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-deco-cat]');
        if (btn) { decoCategory = btn.dataset.decoCat; renderDecoItems(); }
    });
    document.getElementById('deco-items-grid')?.addEventListener('click', e => {
        const card = e.target.closest('[data-deco-equip]');
        if (card) decoEquipItem(Number(card.dataset.decoEquip));
    });
    document.querySelectorAll('.deco-gender-btn').forEach(btn => { btn.onclick = () => decoSetGender(btn.dataset.gender); });
    document.getElementById('deco-theme-select')?.addEventListener('change', e => { decoState.theme = e.target.value; renderDecoItems(); });
    document.getElementById('deco-save-draft-btn')?.addEventListener('click', decoSaveDraft);
    document.getElementById('deco-reset-btn')?.addEventListener('click', () => { resetDecoDefaults(); renderDecoPreview(); renderDecoItems(); toast('Đã làm lại!'); });
    document.getElementById('deco-submit-btn')?.addEventListener('click', decoSubmitEntry);
    document.getElementById('deco-save-image-btn')?.addEventListener('click', async () => {
        const svg = document.getElementById('deco-svg-output');
        if (!svg) return;
        try {
            const data = await decoSvgToPngDataUrl(svg);
            const a = document.createElement('a'); a.href = data; a.download = `trang-tri-${Date.now()}.png`; a.click();
            toast('Đã tải ảnh!');
        } catch { toast('Lỗi tạo ảnh', true); }
    });
}

/* ─── Admin Decoration ─── */
async function loadAdminDecoration() {
    await Promise.all([loadAdminDecoSubmissions(), loadAdminDecoItems()]);
}

async function loadAdminDecoSubmissions() {
    try {
        const { submissions } = await api('/admin/decoration/submissions');
        const el = document.getElementById('admin-deco-submissions');
        if (!el) return;
        if (!submissions.length) { el.innerHTML = emptyState('Chưa có bài dự thi.'); return; }
        const sm = { pending_review: 'Chờ chấm', approved: 'Đã duyệt', rejected: 'Từ chối' };
        el.innerHTML = submissions.map(s => `
            <div class="bg-white border rounded-xl p-4 shadow-sm" data-deco-sub-row="${s.id}">
                <div class="flex flex-col lg:flex-row gap-4">
                    ${s.previewImage ? `<img src="${s.previewImage}" class="w-32 h-40 object-cover rounded-xl border shrink-0" alt="">` : '<div class="w-32 h-40 bg-pink-50 rounded-xl flex items-center justify-center text-4xl shrink-0">👘</div>'}
                    <div class="flex-1 min-w-0">
                        <div class="font-bold text-lg">${escapeHtml(s.title)}</div>
                        <div class="text-sm text-slate-500">${escapeHtml(s.userName)} • ${escapeHtml(s.userEmail)}</div>
                        <div class="text-xs text-slate-400 mt-1">${escapeHtml(s.createdAt)} • ${s.gender === 'male' ? 'Nam' : 'Nữ'} • ${escapeHtml(s.themeLabel || s.theme)}</div>
                        <p class="text-sm mt-2 text-slate-600">${escapeHtml(s.description || '')}</p>
                        <span class="inline-block mt-2 text-xs px-2 py-1 rounded-full ${s.status === 'pending_review' ? 'bg-amber-100 text-amber-700' : s.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">${sm[s.status]}</span>
                        ${s.score ? `<span class="text-sm ml-2 font-bold text-pink-600">${s.score}/100</span>` : ''}
                        ${s.rewardAmount ? `<span class="text-sm ml-2 text-emerald-600">+${formatMoney(s.rewardAmount)}</span>` : ''}
                        ${s.adminNote ? `<p class="text-xs text-slate-500 mt-1">Ghi chú: ${escapeHtml(s.adminNote)}</p>` : ''}
                    </div>
                    ${s.status === 'pending_review' ? `<div class="flex flex-col gap-2 shrink-0 lg:w-48">
                        <input data-deco-score="${s.id}" type="number" min="1" max="100" placeholder="Điểm 1-100" class="border rounded-lg px-3 py-2 text-sm">
                        <input data-deco-reward="${s.id}" type="number" min="0" step="1000" placeholder="Tiền thưởng" class="border rounded-lg px-3 py-2 text-sm">
                        <input data-deco-note="${s.id}" type="text" placeholder="Nhận xét" class="border rounded-lg px-3 py-2 text-sm">
                        <button data-deco-approve="${s.id}" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2 rounded-lg font-medium">Duyệt & thưởng</button>
                        <button data-deco-reject="${s.id}" class="bg-red-500 hover:bg-red-600 text-white text-sm py-2 rounded-lg">Từ chối</button>
                    </div>` : ''}
                </div>
            </div>`).join('');
    } catch (e) { toast(e.message, true); }
}

async function loadAdminDecoItems() {
    try {
        const { items } = await api('/admin/decoration/items');
        const el = document.getElementById('admin-deco-items-list');
        const countEl = document.getElementById('admin-deco-item-count');
        if (countEl) countEl.textContent = `${items.length} vật phẩm`;
        if (!el) return;
        el.innerHTML = `<p class="text-sm text-slate-500 mb-3">Tổng <strong>${items.length}</strong> vật phẩm trang trí. Cuộn để xem hoặc thêm mới.</p>
            <div class="space-y-2 max-h-96 overflow-y-auto">${items.slice(0, 30).map(i =>
                `<div class="flex items-center gap-3 bg-slate-50 border rounded-lg px-3 py-2 text-sm">
                    <span class="text-xl">${i.image || '👘'}</span>
                    <span class="flex-1 truncate font-medium">${escapeHtml(i.name)}</span>
                    <span class="text-xs text-slate-400">${i.category}</span>
                    <span class="text-xs ${i.isActive ? 'text-emerald-600' : 'text-red-500'}">${i.isActive ? 'ON' : 'OFF'}</span>
                </div>`).join('')}${items.length > 30 ? `<p class="text-xs text-slate-400 text-center">+${items.length - 30} vật phẩm khác</p>` : ''}</div>`;
    } catch (e) { toast(e.message, true); }
}

function initAdminDecorationEvents() {
    document.getElementById('admin-deco-submissions')?.addEventListener('click', async e => {
        const approve = e.target.closest('[data-deco-approve]');
        if (approve) {
            const id = Number(approve.dataset.decoApprove);
            const score = parseInt(document.querySelector(`[data-deco-score="${id}"]`)?.value, 10);
            const reward = parseInt(document.querySelector(`[data-deco-reward="${id}"]`)?.value, 10) || 0;
            const note = document.querySelector(`[data-deco-note="${id}"]`)?.value?.trim() || '';
            if (!score || score < 1 || score > 100) return toast('Nhập điểm từ 1-100', true);
            if (!confirm(`Duyệt bài #${id} — ${score}điểm, thưởng ${formatMoney(reward)}?`)) return;
            try {
                await api(`/admin/decoration/submissions/${id}/review`, { method: 'POST', body: JSON.stringify({ score, rewardAmount: reward, adminNote: note }) });
                toast('Đã duyệt và thưởng!');
                loadAdminDecoSubmissions();
            } catch (err) { toast(err.message, true); }
            return;
        }
        const reject = e.target.closest('[data-deco-reject]');
        if (reject) {
            const id = Number(reject.dataset.decoReject);
            const note = prompt('Lý do từ chối:', 'Bài không phù hợp chủ đề') || '';
            try {
                await api(`/admin/decoration/submissions/${id}/reject`, { method: 'POST', body: JSON.stringify({ adminNote: note }) });
                toast('Đã từ chối bài.');
                loadAdminDecoSubmissions();
            } catch (err) { toast(err.message, true); }
        }
    });
}