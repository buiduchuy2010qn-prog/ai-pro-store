/* Anime dress-up SVG renderer — Phòng Thay Đồ */
const DR_SKIN = '#fde8d8';
const DR_SKIN_SH = '#e8c4a8';
const DR_HAIR = {
    black: '#2d2a32', brown: '#6b4423', pink: '#e879a9', blue: '#7dd3fc',
    silver: '#d4d4d8', blonde: '#fde68a', purple: '#c4b5fd', red: '#fca5a5',
};

function drDefs(uid) {
    const p = uid || 'dr';
    return `<defs>
        <linearGradient id="${p}skin" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#fff8f0"/><stop offset="100%" stop-color="${DR_SKIN_SH}"/></linearGradient>
        <linearGradient id="${p}hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="60%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient>
        <radialGradient id="${p}eye" cx="35%" cy="35%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#e0e7ff"/></radialGradient>
        <filter id="${p}soft"><feGaussianBlur stdDeviation="0.6"/></filter>
    </defs>`;
}

function drAnimeEyes(key) {
    const colors = {
        'dec-eyes-blue': '#3b82f6', 'dec-eyes-brown': '#5c3d2e', 'dec-eyes-purple': '#7c3aed',
        'dec-eyes-pink': '#ec4899', 'dec-eyes-gold': '#f59e0b', 'dec-eyes-green': '#22c55e',
        'dec-eyes-red': '#ef4444', 'dec-eyes-sparkle': '#38bdf8', 'dec-eyes-gradient': '#8b5cf6',
        'dec-eyes-cool': '#334155',
    };
    const c = colors[key] || '#6366f1';
    if (key === 'dec-eyes-cool') {
        return `<path d="M132 136 Q142 140 152 136" fill="none" stroke="#374151" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M168 136 Q178 140 188 136" fill="none" stroke="#374151" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    return `
        <ellipse cx="142" cy="138" rx="15" ry="17" fill="url(#dreye)"/><ellipse cx="178" cy="138" rx="15" ry="17" fill="url(#dreye)"/>
        <ellipse cx="142" cy="140" rx="11" ry="13" fill="${c}"/><ellipse cx="178" cy="140" rx="11" ry="13" fill="${c}"/>
        <circle cx="146" cy="134" r="4.5" fill="#fff" opacity="0.95"/><circle cx="182" cy="134" r="4.5" fill="#fff" opacity="0.95"/>
        <circle cx="139" cy="143" r="2" fill="#fff" opacity="0.7"/><circle cx="175" cy="143" r="2" fill="#fff" opacity="0.7"/>
        <path d="M132 128 Q142 122 152 128" fill="none" stroke="#4b5563" stroke-width="1.8"/>
        <path d="M168 128 Q178 122 188 128" fill="none" stroke="#4b5563" stroke-width="1.8"/>`;
}

function drExpr(key) {
    const m = {
        'dec-expr-smile': '<path d="M148 158 Q160 166 172 158" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round"/>',
        'dec-expr-happy': '<path d="M146 156 Q160 172 174 156" fill="none" stroke="#c2410c" stroke-width="2.5" stroke-linecap="round"/>',
        'dec-expr-shy': '<ellipse cx="128" cy="152" rx="10" ry="6" fill="#fda4af" opacity="0.45"/><ellipse cx="192" cy="152" rx="10" ry="6" fill="#fda4af" opacity="0.45"/><path d="M152 162 Q160 166 168 162" fill="none" stroke="#c2410c" stroke-width="1.5"/>',
        'dec-expr-cool': '<line x1="152" y1="162" x2="168" y2="162" stroke="#374151" stroke-width="2" stroke-linecap="round"/>',
        'dec-expr-cute': '<path d="M150 158 Q160 164 170 158" fill="#f9a8d4" opacity="0.55"/>',
        'dec-expr-wink': '<path d="M146 156 Q160 168 174 156" fill="none" stroke="#c2410c" stroke-width="2"/><path d="M172 132 Q182 136 190 132" fill="none" stroke="#374151" stroke-width="2"/>',
    };
    return m[key] || m['dec-expr-cute'];
}

function drBodyFemale() {
    return `
        <path d="M150 272 L146 358 Q154 364 162 358 L164 272 Z" fill="url(#drskin)"/>
        <path d="M156 272 L158 358 Q166 364 174 358 L170 272 Z" fill="url(#drskin)"/>
        <path d="M126 200 Q160 222 194 200 L198 272 Q160 284 122 272 Z" fill="url(#drskin)"/>
        <path d="M126 204 Q100 232 104 262 L116 258 Q112 232 130 212 Z" fill="url(#drskin)"/>
        <path d="M194 204 Q220 232 216 262 L204 258 Q208 232 190 212 Z" fill="url(#drskin)"/>
        <path d="M152 176 L168 176 L166 202 L154 202 Z" fill="url(#drskin)"/>
        <ellipse cx="160" cy="138" rx="42" ry="48" fill="url(#drskin)"/>
        <ellipse cx="120" cy="140" rx="6" ry="9" fill="${DR_SKIN_SH}" opacity="0.35"/>
        <ellipse cx="200" cy="140" rx="6" ry="9" fill="${DR_SKIN_SH}" opacity="0.35"/>`;
}

function drBodyMale() {
    return `
        <path d="M148 272 L144 358 Q152 364 160 358 L162 272 Z" fill="url(#drskin)"/>
        <path d="M158 272 L160 358 Q168 364 176 358 L172 272 Z" fill="url(#drskin)"/>
        <path d="M124 198 Q160 218 196 198 L200 272 Q160 282 120 272 Z" fill="url(#drskin)"/>
        <path d="M124 202 Q98 228 102 258 L114 254 Q110 230 128 210 Z" fill="url(#drskin)"/>
        <path d="M196 202 Q222 228 218 258 L206 254 Q210 230 192 210 Z" fill="url(#drskin)"/>
        <path d="M150 174 L170 174 L168 200 L152 200 Z" fill="url(#drskin)"/>
        <ellipse cx="160" cy="136" rx="40" ry="46" fill="url(#drskin)"/>`;
}

function drHair(key) {
    const m = key.match(/dec-hair-(\w+)-(\w+)/);
    const color = m ? (DR_HAIR[m[1]] || DR_HAIR.pink) : DR_HAIR.silver;
    const style = m ? m[2] : 'long';
    if (style === 'twintail') return `
        <path d="M118 138 Q160 72 202 138 L208 200 Q195 220 185 195 L180 135 L140 135 L135 195 Q125 220 112 200 Z" fill="${color}"/>
        <circle cx="128" cy="175" r="20" fill="${color}"/><circle cx="192" cy="175" r="20" fill="${color}"/>
        <path d="M125 125 Q160 88 195 125 Q175 148 160 140 Q145 148 125 125" fill="${color}" opacity="0.85"/>`;
    if (style === 'bun') return `
        <ellipse cx="160" cy="98" rx="32" ry="24" fill="${color}"/>
        <ellipse cx="160" cy="112" rx="40" ry="20" fill="${color}"/>
        <path d="M122 130 Q160 95 198 130 L200 185 Q160 195 118 185 Z" fill="${color}"/>`;
    if (style === 'short') return `
        <path d="M122 132 Q160 88 198 132 Q196 118 160 102 Q124 118 122 132" fill="${color}"/>`;
    if (key.includes('m-') || key.includes('layer') || key.includes('spiky')) {
        return `<path d="M122 128 Q160 88 198 128 Q195 108 160 96 Q125 108 122 128" fill="${color}"/>`;
    }
    return `
        <path d="M112 142 Q160 68 208 142 L214 235 Q200 295 160 305 Q120 295 106 235 Z" fill="${color}"/>
        <path d="M106 180 Q92 260 98 330 Q128 318 112 200" fill="${color}" opacity="0.75"/>
        <path d="M214 180 Q228 260 222 330 Q192 318 208 200" fill="${color}" opacity="0.75"/>
        <path d="M122 125 Q160 82 198 125 Q180 152 160 144 Q140 152 122 125" fill="${color}" opacity="0.9"/>`;
}

function drBg(key) {
    const bgs = {
        'dec-bg-sakura': `<rect width="320" height="400" fill="#fdf2f8"/><circle cx="55" cy="70" r="14" fill="#fda4af" opacity="0.5"/><circle cx="255" cy="55" r="11" fill="#fb7185" opacity="0.4"/><circle cx="200" cy="110" r="9" fill="#f9a8d4" opacity="0.45"/><circle cx="90" cy="130" r="8" fill="#fecdd3" opacity="0.35"/>`,
        'dec-bg-tokyo': `<rect width="320" height="400" fill="#0f172a"/><rect x="35" y="190" width="28" height="130" fill="#1e293b"/><rect x="85" y="150" width="38" height="170" fill="#334155"/><rect x="195" y="175" width="32" height="145" fill="#1e293b"/><circle cx="255" cy="48" r="22" fill="#fde68a" opacity="0.85"/>`,
        'dec-bg-school': `<rect width="320" height="400" fill="#dbeafe"/><rect x="75" y="140" width="170" height="110" fill="#f8fafc" stroke="#94a3b8" stroke-width="1"/><rect x="125" y="190" width="70" height="55" fill="#93c5fd" opacity="0.35"/>`,
        'dec-bg-shrine': `<rect width="320" height="400" fill="#fef9c3"/><rect x="118" y="175" width="84" height="65" fill="#dc2626"/><path d="M95 175 L160 125 L225 175" fill="#b91c1c"/>`,
        'dec-bg-fireworks': `<rect width="320" height="400" fill="#1e1b4b"/><circle cx="160" cy="95" r="4" fill="#fbbf24"/><circle cx="135" cy="85" r="3" fill="#f472b6"/><circle cx="185" cy="88" r="3" fill="#60a5fa"/>`,
        'dec-bg-harajuku': `<rect width="320" height="400" fill="#fef08a"/><rect x="0" y="0" width="70" height="400" fill="#f472b6" opacity="0.18"/><rect x="250" y="0" width="70" height="400" fill="#60a5fa" opacity="0.18"/>`,
        'dec-bg-park': `<rect width="320" height="400" fill="#bbf7d0"/><ellipse cx="160" cy="355" rx="155" ry="42" fill="#86efac" opacity="0.6"/>`,
        'dec-bg-snow': `<rect width="320" height="400" fill="#f0f9ff"/><circle cx="48" cy="55" r="5" fill="#fff"/><circle cx="210" cy="38" r="4" fill="#fff"/>`,
        'dec-bg-tea': `<rect width="320" height="400" fill="#ecfdf5"/><rect x="50" y="245" width="220" height="10" fill="#a16207" opacity="0.25" rx="2"/>`,
        'dec-bg-idol-room': `<rect width="320" height="400" fill="#faf5ff"/><rect x="0" y="295" width="320" height="105" fill="#e9d5ff" opacity="0.45"/>`,
    };
    return bgs[key] || bgs['dec-bg-sakura'];
}

function drClothes(key) {
    if (key.includes('kimono') || key.includes('yukata')) return `<path d="M115 198 Q160 228 205 198 L212 310 Q160 332 108 310 Z" fill="#fda4af"/><path d="M115 198 L160 238 L205 198" stroke="#fff" stroke-width="2" opacity="0.4" fill="none"/>`;
    if (key.includes('uniform') || key.includes('school')) return `<path d="M126 200 L126 278 L194 278 L194 200 Q160 224 126 200" fill="#1e3a5f"/><rect x="154" y="228" width="12" height="38" fill="#dc2626"/>`;
    if (key.includes('idol') || key.includes('princess')) return `<path d="M122 200 L108 224 L120 232 L132 212 L132 285 L188 285 L188 212 L200 232 L212 224 L198 200 Q160 228 122 200" fill="#f472b6"/><circle cx="160" cy="248" r="10" fill="#fff" opacity="0.45"/>`;
    if (key.includes('hoodie') || key.includes('street')) return `<path d="M120 198 L95 228 L112 238 L128 218 L128 282 L192 282 L192 218 L208 238 L225 228 L200 198 Q160 222 120 198" fill="#374151"/>`;
    if (key.includes('skirt') || key.includes('pastel')) return `<path d="M126 276 L106 338 Q160 355 214 338 L194 276 Z" fill="#c4b5fd"/>`;
    if (key.includes('pants') || key.includes('hakama')) return `<rect x="130" y="276" width="24" height="62" rx="5" fill="#1e3a5f"/><rect x="166" y="276" width="24" height="62" rx="5" fill="#1e3a5f"/>`;
    if (key.includes('vest') || key.includes('suit')) return `<path d="M128 200 L128 280 L192 280 L192 200 Q160 228 128 200" fill="#0f172a"/><path d="M128 200 L160 240 L192 200" fill="#f8fafc" opacity="0.5"/>`;
    return `<path d="M126 200 L126 278 L194 278 L194 200 Q160 224 126 200" fill="#a78bfa"/>`;
}

function drShoes(key) {
    if (key.includes('heel') || key.includes('loafer')) return `<ellipse cx="152" cy="358" rx="17" ry="8" fill="#1e3a5f"/><ellipse cx="168" cy="358" rx="17" ry="8" fill="#1e3a5f"/>`;
    if (key.includes('geta')) return `<rect x="142" y="350" width="36" height="8" fill="#a16207" rx="2"/><rect x="168" y="350" width="36" height="8" fill="#a16207" rx="2"/>`;
    return `<ellipse cx="152" cy="358" rx="18" ry="9" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/><ellipse cx="168" cy="358" rx="18" ry="9" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`;
}

function drAcc(key) {
    if (key.includes('ribbon') || key.includes('sakura')) return `<ellipse cx="195" cy="115" rx="14" ry="8" fill="#f472b6"/><circle cx="195" cy="115" r="5" fill="#fda4af"/>`;
    if (key.includes('fan')) return `<ellipse cx="225" cy="250" rx="18" ry="12" fill="#fda4af" opacity="0.7"/><line x1="225" y1="250" x2="225" y2="275" stroke="#a16207" stroke-width="2"/>`;
    if (key.includes('umbrella')) return `<path d="M200 220 Q230 200 260 220" fill="none" stroke="#f472b6" stroke-width="3"/><line x1="230" y1="220" x2="230" y2="280" stroke="#64748b" stroke-width="2"/>`;
    if (key.includes('headphones') || key.includes('mic')) return `<ellipse cx="115" cy="130" rx="12" ry="14" fill="#374151"/><ellipse cx="205" cy="130" rx="12" ry="14" fill="#374151"/><path d="M115 130 Q160 115 205 130" stroke="#374151" stroke-width="3" fill="none"/>`;
    if (key.includes('bag') || key.includes('school')) return `<rect x="205" y="248" width="32" height="26" rx="5" fill="#1e3a5f"/><path d="M212 248 Q220 232 228 248" fill="none" stroke="#1e3a5f" stroke-width="3"/>`;
    if (key.includes('glasses') || key.includes('round')) return `<circle cx="142" cy="138" r="16" fill="none" stroke="#374151" stroke-width="2"/><circle cx="178" cy="138" r="16" fill="none" stroke="#374151" stroke-width="2"/><line x1="158" y1="138" x2="162" y2="138" stroke="#374151" stroke-width="2"/>`;
    return `<circle cx="220" cy="255" r="10" fill="#fbbf24" opacity="0.8"/>`;
}

function drFx(key) {
    if (key.includes('sakura')) return `<circle cx="45" cy="65" r="6" fill="#fda4af" opacity="0.7"/><circle cx="265" cy="85" r="5" fill="#fb7185" opacity="0.6"/><circle cx="180" cy="45" r="4" fill="#f9a8d4" opacity="0.5"/>`;
    if (key.includes('sparkle') || key.includes('star') || key.includes('idol')) return `<polygon points="50,70 53,78 61,78 55,83 57,91 50,86 43,91 45,83 39,78 47,78" fill="#fbbf24" opacity="0.8"/><polygon points="255,75 257,80 262,80 258,83 259,88 255,85 251,88 252,83 248,80 253,80" fill="#fde68a" opacity="0.7"/>`;
    if (key.includes('heart')) return `<path d="M45 78 Q45 70 52 70 Q58 70 58 78 Q58 86 52 92 Q45 86 45 78" fill="#f472b6" opacity="0.65"/>`;
    if (key.includes('snow')) return `<circle cx="50" cy="60" r="3" fill="#fff" opacity="0.8"/><circle cx="260" cy="80" r="2.5" fill="#fff" opacity="0.7"/>`;
    return `<circle cx="250" cy="70" r="4" fill="#fbbf24" opacity="0.6"/>`;
}

function drMakeup(key) {
    return `<ellipse cx="128" cy="152" rx="11" ry="6" fill="#fda4af" opacity="0.4"/><ellipse cx="192" cy="152" rx="11" ry="6" fill="#fda4af" opacity="0.4"/>
        <path d="M150 160 Q160 166 170 160" fill="#f472b6" opacity="0.65"/>`;
}

function drRenderLayer(key, gender) {
    if (!key) return '';
    if (key.startsWith('dec-bg-')) return drBg(key);
    if (key.startsWith('dec-body-f')) return drBodyFemale();
    if (key.startsWith('dec-body-m')) return drBodyMale();
    if (key === 'dec-body-f-idol' || key === 'dec-body-f-kimono' || key === 'dec-body-f-school' || key === 'dec-body-f-harajuku' || key === 'dec-body-f-princess') return drBodyFemale();
    if (key.startsWith('dec-body-')) return gender === 'male' ? drBodyMale() : drBodyFemale();
    if (key.startsWith('dec-eyes-')) return drAnimeEyes(key);
    if (key.startsWith('dec-expr-')) return drExpr(key);
    if (key.startsWith('dec-hair-')) return drHair(key);
    if (key.startsWith('dec-top-') || key.startsWith('dec-bottom-')) return drClothes(key);
    if (key.startsWith('dec-shoes-')) return drShoes(key);
    if (key.startsWith('dec-acc-')) return drAcc(key);
    if (key.startsWith('dec-fx-')) return drFx(key);
    if (key.startsWith('dec-mu-')) return drMakeup(key);
    return '';
}

function drBuildSvg(equipped, gender) {
    const sorted = [...(equipped || [])].sort((a, b) => (a.layerOrder || 99) - (b.layerOrder || 99));
    const layers = [];
    let hasBody = false;
    for (const item of sorted) {
        const svg = drRenderLayer(item.layerImage, gender);
        if (svg) { layers.push(svg); if (item.category === 'body') hasBody = true; }
    }
    if (!hasBody) layers.splice(1, 0, gender === 'male' ? drBodyMale() : drBodyFemale());
    if (!layers.length) { layers.push(drBg('dec-bg-sakura')); layers.push(drBodyFemale()); }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400">${drDefs('dr')}${layers.join('')}</svg>`;
}

function drItemThumb(layerKey, category) {
    const inner = drRenderLayer(layerKey, 'female') || drRenderLayer(layerKey, 'male') || `<rect x="100" y="100" width="120" height="120" fill="#fce7f3" rx="12"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 60 160 200" width="56" height="56">${drDefs('t')}${inner}</svg>`;
}

function drSvgToPng(svgEl) {
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