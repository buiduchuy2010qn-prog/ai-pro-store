/* Phòng Thay Đồ — stick-base + layered anime decorations */
const DR_SKIN = '#fde8d8';
const DR_SKIN_SH = '#d4a88a';
const DR_HAIR = {
    black: '#2d2a32', brown: '#6b4423', pink: '#e879a9', blue: '#7dd3fc',
    silver: '#c8cad0', blonde: '#fde68a', purple: '#c4b5fd', red: '#fca5a5',
};

const DR_CX = 160;
const DR_RIG = { cx: DR_CX, headY: 106, headRx: 30, headRy: 34, neckY: 136, shoulderY: 168, waistY: 252, hipY: 262, ankleY: 348, footY: 354 };

const DR_BODY_PRESETS = {
    'dec-body-f-idol': { head: 'dec-head-f-idol', torso: 'dec-torso-f-idol', arms: 'dec-arms-f-grace', legs: 'dec-legs-f-slim' },
    'dec-body-f-kimono': { head: 'dec-head-f-oval', torso: 'dec-torso-f-slim', arms: 'dec-arms-f-rest', legs: 'dec-legs-f-slim' },
    'dec-body-f-school': { head: 'dec-head-f-round', torso: 'dec-torso-f-school', arms: 'dec-arms-f-rest', legs: 'dec-legs-f-school' },
    'dec-body-f-harajuku': { head: 'dec-head-f-chibi', torso: 'dec-torso-f-curvy', arms: 'dec-arms-f-akimbo', legs: 'dec-legs-f-active' },
    'dec-body-f-princess': { head: 'dec-head-f-elegant', torso: 'dec-torso-f-princess', arms: 'dec-arms-f-grace', legs: 'dec-legs-f-princess' },
    'dec-body-m-school': { head: 'dec-head-m-soft', torso: 'dec-torso-m-athletic', arms: 'dec-arms-m-rest', legs: 'dec-legs-m-normal' },
    'dec-body-m-street': { head: 'dec-head-m-sharp', torso: 'dec-torso-m-slim', arms: 'dec-arms-m-pockets', legs: 'dec-legs-m-athletic' },
    'dec-body-m-idol': { head: 'dec-head-m-cool', torso: 'dec-torso-m-idol', arms: 'dec-arms-m-confident', legs: 'dec-legs-m-long' },
};

const DR_DEFAULT_PARTS = {
    female: { head: 'dec-head-f-idol', torso: 'dec-torso-f-idol', arms: 'dec-arms-f-grace', legs: 'dec-legs-f-slim' },
    male: { head: 'dec-head-m-cool', torso: 'dec-torso-m-athletic', arms: 'dec-arms-m-rest', legs: 'dec-legs-m-normal' },
};

function drDefs(uid) {
    const p = uid || 'dr';
    return `<defs>
        <linearGradient id="${p}skin" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#fff5eb"/><stop offset="100%" stop-color="${DR_SKIN_SH}"/></linearGradient>
        <linearGradient id="${p}pk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fbcfe8"/><stop offset="100%" stop-color="#f472b6"/></linearGradient>
        <linearGradient id="${p}kim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fda4af"/><stop offset="50%" stop-color="#fb7185"/><stop offset="100%" stop-color="#e11d48"/></linearGradient>
        <linearGradient id="${p}uni" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
        <linearGradient id="${p}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e9d5ff"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient>
        <radialGradient id="${p}eye" cx="35%" cy="30%"><stop offset="0%" stop-color="#fff"/><stop offset="70%" stop-color="#e0e7ff"/><stop offset="100%" stop-color="#c7d2fe"/></radialGradient>
        <filter id="${p}glow"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;
}

/* ── Modular character: đầu · thân · tay · chân (ghép lên da thịt) ── */
function drResolveParts(equipped, gender) {
    const parts = { ...(DR_DEFAULT_PARTS[gender] || DR_DEFAULT_PARTS.female) };
    for (const item of equipped || []) {
        if (item.category === 'body' && DR_BODY_PRESETS[item.layerImage]) {
            Object.assign(parts, DR_BODY_PRESETS[item.layerImage]);
        }
    }
    for (const item of equipped || []) {
        if (item.category === 'head') parts.head = item.layerImage;
        if (item.category === 'torso') parts.torso = item.layerImage;
        if (item.category === 'arms') parts.arms = item.layerImage;
        if (item.category === 'legs') parts.legs = item.layerImage;
    }
    return parts;
}

function drApplyHeadShape(key) {
    const shapes = {
        'dec-head-f-round': [30, 34], 'dec-head-f-oval': [27, 38], 'dec-head-f-cute': [33, 31],
        'dec-head-f-idol': [29, 35], 'dec-head-f-chibi': [35, 30], 'dec-head-f-elegant': [28, 37],
        'dec-head-m-soft': [30, 33], 'dec-head-m-sharp': [28, 36], 'dec-head-m-cool': [29, 35],
        'dec-head-m-athletic': [31, 34], 'dec-head-m-anime': [30, 34], 'dec-head-uni-soft': [30, 34],
    };
    const s = shapes[key] || shapes['dec-head-f-round'];
    DR_RIG.headRx = s[0]; DR_RIG.headRy = s[1];
}

function drRenderHeadPart(key) {
    drApplyHeadShape(key);
    const y = DR_RIG.headY;
    return `<ellipse cx="${DR_CX}" cy="${y}" rx="${DR_RIG.headRx}" ry="${DR_RIG.headRy}" fill="url(#drskin)" stroke="${DR_SKIN_SH}" stroke-width="0.5"/>`;
}

function drRenderNeckPart() {
    return `<rect x="${DR_CX - 4}" y="${DR_RIG.neckY}" width="8" height="14" rx="3" fill="url(#drskin)"/>`;
}

function drRenderTorsoPart(key) {
    const R = DR_RIG;
    const w = key.includes('broad') ? 46 : key.includes('athletic') ? 42 : key.includes('curvy') ? 40 : key.includes('slim') ? 34 : 38;
    const hw = w / 2;
    const curve = key.includes('princess') || key.includes('idol') ? 8 : 4;
    return `
        <path d="M${DR_CX - hw} ${R.shoulderY} Q${DR_CX - hw + 4} ${R.waistY - 20} ${DR_CX - hw + 6} ${R.waistY} L${DR_CX + hw - 6} ${R.waistY} Q${DR_CX + hw - 4} ${R.waistY - 20} ${DR_CX + hw} ${R.shoulderY} Z" fill="url(#drskin)"/>
        <ellipse cx="${DR_CX - hw * 0.55}" cy="${R.shoulderY + 18}" rx="5" ry="7" fill="${DR_SKIN_SH}" opacity="0.12"/>
        <ellipse cx="${DR_CX + hw * 0.55}" cy="${R.shoulderY + 18}" rx="5" ry="7" fill="${DR_SKIN_SH}" opacity="0.12"/>
        <path d="M${DR_CX - hw + 8} ${R.shoulderY + 6} Q${DR_CX} ${R.shoulderY + curve} ${DR_CX + hw - 8} ${R.shoulderY + 6}" fill="none" stroke="${DR_SKIN_SH}" stroke-width="0.5" opacity="0.25"/>`;
}

function drLimbSkin(x1, y1, x2, y2, w) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#drskin)" stroke-width="${w}" stroke-linecap="round"/>`;
}

function drRenderArmsPart(key) {
    const R = DR_RIG;
    const sw = key.includes('m-') ? 11 : 9;
    const poses = {
        'dec-arms-f-akimbo': () => `
            ${drLimbSkin(DR_CX - 36, R.shoulderY + 4, DR_CX - 48, R.waistY - 10, sw)}
            ${drLimbSkin(DR_CX - 48, R.waistY - 10, DR_CX - 42, R.waistY + 8, sw)}
            ${drLimbSkin(DR_CX + 36, R.shoulderY + 4, DR_CX + 48, R.waistY - 10, sw)}
            ${drLimbSkin(DR_CX + 48, R.waistY - 10, DR_CX + 42, R.waistY + 8, sw)}
            <circle cx="${DR_CX - 42}" cy="${R.waistY + 10}" r="6" fill="url(#drskin)"/>
            <circle cx="${DR_CX + 42}" cy="${R.waistY + 10}" r="6" fill="url(#drskin)"/>`,
        'dec-arms-f-shy': () => `
            ${drLimbSkin(DR_CX - 34, R.shoulderY + 6, DR_CX - 28, R.waistY - 20, sw)}
            ${drLimbSkin(DR_CX - 28, R.waistY - 20, DR_CX - 8, R.waistY - 8, sw)}
            ${drLimbSkin(DR_CX + 34, R.shoulderY + 6, DR_CX + 28, R.waistY - 20, sw)}
            ${drLimbSkin(DR_CX + 28, R.waistY - 20, DR_CX + 8, R.waistY - 8, sw)}
            <circle cx="${DR_CX - 6}" cy="${R.waistY - 6}" r="5.5" fill="url(#drskin)"/>
            <circle cx="${DR_CX + 6}" cy="${R.waistY - 6}" r="5.5" fill="url(#drskin)"/>`,
        'dec-arms-f-idol': () => `
            ${drLimbSkin(DR_CX - 36, R.shoulderY + 4, DR_CX - 52, R.waistY + 20, sw)}
            <circle cx="${DR_CX - 54}" cy="${R.waistY + 24}" r="6" fill="url(#drskin)"/>
            ${drLimbSkin(DR_CX + 36, R.shoulderY + 4, DR_CX + 44, R.waistY - 30, sw)}
            ${drLimbSkin(DR_CX + 44, R.waistY - 30, DR_CX + 58, R.waistY - 50, sw)}
            <circle cx="${DR_CX + 60}" cy="${R.waistY - 52}" r="6" fill="url(#drskin)"/>`,
        'dec-arms-m-cross': () => `
            ${drLimbSkin(DR_CX - 38, R.shoulderY + 4, DR_CX + 10, R.waistY - 30, sw + 1)}
            ${drLimbSkin(DR_CX + 38, R.shoulderY + 4, DR_CX - 10, R.waistY - 24, sw + 1)}
            <circle cx="${DR_CX - 12}" cy="${R.waistY - 22}" r="6" fill="url(#drskin)"/>
            <circle cx="${DR_CX + 12}" cy="${R.waistY - 28}" r="6" fill="url(#drskin)"/>`,
        'dec-arms-m-pockets': () => `
            ${drLimbSkin(DR_CX - 36, R.shoulderY + 4, DR_CX - 40, R.waistY + 4, sw + 1)}
            ${drLimbSkin(DR_CX + 36, R.shoulderY + 4, DR_CX + 40, R.waistY + 4, sw + 1)}
            <circle cx="${DR_CX - 40}" cy="${R.waistY + 6}" r="6" fill="url(#drskin)"/>
            <circle cx="${DR_CX + 40}" cy="${R.waistY + 6}" r="6" fill="url(#drskin)"/>`,
        'dec-arms-m-confident': () => `
            ${drLimbSkin(DR_CX - 38, R.shoulderY + 4, DR_CX - 55, R.waistY + 30, sw + 1)}
            <circle cx="${DR_CX - 57}" cy="${R.waistY + 34}" r="6.5" fill="url(#drskin)"/>
            ${drLimbSkin(DR_CX + 38, R.shoulderY + 4, DR_CX + 55, R.waistY + 30, sw + 1)}
            <circle cx="${DR_CX + 57}" cy="${R.waistY + 34}" r="6.5" fill="url(#drskin)"/>`,
        'dec-arms-uni-wave': () => `
            ${drLimbSkin(DR_CX - 36, R.shoulderY + 4, DR_CX - 50, R.waistY + 16, sw)}
            <circle cx="${DR_CX - 52}" cy="${R.waistY + 20}" r="6" fill="url(#drskin)"/>
            ${drLimbSkin(DR_CX + 36, R.shoulderY + 4, DR_CX + 50, R.waistY - 40, sw)}
            ${drLimbSkin(DR_CX + 50, R.waistY - 40, DR_CX + 62, R.waistY - 58, sw)}
            <circle cx="${DR_CX + 64}" cy="${R.waistY - 60}" r="6" fill="url(#drskin)"/>`,
    };
    if (poses[key]) return poses[key]();
    const hang = key.includes('grace') || key.includes('idol');
    const ox = hang ? 50 : 46;
    const oy = hang ? 238 : 242;
    return `
        ${drLimbSkin(DR_CX - 34, R.shoulderY + 4, DR_CX - ox, oy, sw)}
        ${drLimbSkin(DR_CX + 34, R.shoulderY + 4, DR_CX + ox, oy, sw)}
        <circle cx="${DR_CX - ox - 2}" cy="${oy + 4}" r="6" fill="url(#drskin)"/>
        <circle cx="${DR_CX + ox + 2}" cy="${oy + 4}" r="6" fill="url(#drskin)"/>`;
}

function drRenderLegsPart(key) {
    const R = DR_RIG;
    const lw = key.includes('wide') || key.includes('athletic') ? 12 : key.includes('long') ? 9 : 10;
    const spread = key.includes('wide') ? 14 : key.includes('active') ? 12 : 10;
    const ankle = key.includes('long') ? R.ankleY + 8 : R.ankleY;
    return `
        ${drLimbSkin(DR_CX - spread, R.hipY, DR_CX - spread + 2, R.hipY + 50, lw)}
        ${drLimbSkin(DR_CX - spread + 2, R.hipY + 50, DR_CX - spread + 4, ankle, lw - 1)}
        ${drLimbSkin(DR_CX + spread, R.hipY, DR_CX + spread - 2, R.hipY + 50, lw)}
        ${drLimbSkin(DR_CX + spread - 2, R.hipY + 50, DR_CX + spread - 4, ankle, lw - 1)}
        <ellipse cx="${DR_CX - spread + 4}" cy="${ankle + 4}" rx="7" ry="5" fill="url(#drskin)"/>
        <ellipse cx="${DR_CX + spread - 4}" cy="${ankle + 4}" rx="7" ry="5" fill="url(#drskin)"/>`;
}

function drBuildBodyParts(parts) {
    drApplyHeadShape(parts.head);
    return {
        legs: drRenderLegsPart(parts.legs),
        torso: drRenderTorsoPart(parts.torso) + drRenderNeckPart(),
        arms: drRenderArmsPart(parts.arms),
        head: drRenderHeadPart(parts.head),
    };
}

/* ── Anime eyes (on stick head) ── */
function drAnimeEyes(key) {
    const colors = {
        'dec-eyes-blue': '#3b82f6', 'dec-eyes-brown': '#5c3d2e', 'dec-eyes-purple': '#7c3aed',
        'dec-eyes-pink': '#ec4899', 'dec-eyes-gold': '#f59e0b', 'dec-eyes-green': '#22c55e',
        'dec-eyes-red': '#ef4444', 'dec-eyes-sparkle': '#38bdf8', 'dec-eyes-gradient': '#8b5cf6',
        'dec-eyes-cool': '#334155',
    };
    const c = colors[key] || '#6366f1';
    const y = DR_RIG.headY + 4;
    if (key === 'dec-eyes-cool') {
        return `<path d="M138 ${y} Q148 ${y + 4} 158 ${y}" fill="none" stroke="#374151" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M162 ${y} Q172 ${y + 4} 182 ${y}" fill="none" stroke="#374151" stroke-width="2.2" stroke-linecap="round"/>`;
    }
    return `
        <ellipse cx="148" cy="${y}" rx="13" ry="15" fill="url(#dreye)"/><ellipse cx="172" cy="${y}" rx="13" ry="15" fill="url(#dreye)"/>
        <ellipse cx="148" cy="${y + 2}" rx="9" ry="11" fill="${c}"/><ellipse cx="172" cy="${y + 2}" rx="9" ry="11" fill="${c}"/>
        <circle cx="151" cy="${y - 4}" r="4" fill="#fff"/><circle cx="175" cy="${y - 4}" r="4" fill="#fff"/>
        <circle cx="145" cy="${y + 4}" r="1.8" fill="#fff" opacity="0.8"/><circle cx="169" cy="${y + 4}" r="1.8" fill="#fff" opacity="0.8"/>
        <path d="M138 ${y - 10} Q148 ${y - 16} 158 ${y - 10}" fill="none" stroke="#4b5563" stroke-width="1.6"/>
        <path d="M162 ${y - 10} Q172 ${y - 16} 182 ${y - 10}" fill="none" stroke="#4b5563" stroke-width="1.6"/>`;
}

function drExpr(key) {
    const y = DR_RIG.headY + 28;
    const m = {
        'dec-expr-smile': `<path d="M150 ${y} Q160 ${y + 8} 170 ${y}" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round"/>`,
        'dec-expr-happy': `<path d="M148 ${y - 2} Q160 ${y + 12} 172 ${y - 2}" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>`,
        'dec-expr-shy': `<ellipse cx="132" cy="${y - 6}" rx="9" ry="5" fill="#fda4af" opacity="0.5"/><ellipse cx="188" cy="${y - 6}" rx="9" ry="5" fill="#fda4af" opacity="0.5"/><path d="M152 ${y + 4} Q160 ${y + 8} 168 ${y + 4}" fill="none" stroke="#c2410c" stroke-width="1.5"/>`,
        'dec-expr-cool': `<line x1="152" y1="${y + 2}" x2="168" y2="${y + 2}" stroke="#374151" stroke-width="2" stroke-linecap="round"/>`,
        'dec-expr-cute': `<path d="M150 ${y} Q160 ${y + 6} 170 ${y}" fill="#f9a8d4" opacity="0.6"/>`,
        'dec-expr-wink': `<path d="M148 ${y - 2} Q160 ${y + 10} 172 ${y - 2}" fill="none" stroke="#c2410c" stroke-width="2"/><path d="M168 ${DR_RIG.headY} Q178 ${DR_RIG.headY + 4} 186 ${DR_RIG.headY}" fill="none" stroke="#374151" stroke-width="2"/>`,
        'dec-expr-calm': `<path d="M152 ${y + 2} Q160 ${y + 6} 168 ${y + 2}" fill="none" stroke="#c2410c" stroke-width="1.5"/>`,
        'dec-expr-surprise': `<ellipse cx="160" cy="${y + 4}" rx="5" ry="7" fill="#fda4af" opacity="0.5"/>`,
        'dec-expr-confident': `<path d="M150 ${y + 2} L170 ${y + 2}" stroke="#c2410c" stroke-width="2" stroke-linecap="round"/><path d="M170 ${y} L174 ${y + 4}" stroke="#c2410c" stroke-width="1.5"/>`,
        'dec-expr-festival': `<path d="M148 ${y - 2} Q160 ${y + 10} 172 ${y - 2}" fill="none" stroke="#c2410c" stroke-width="2.5"/>`,
    };
    return m[key] || m['dec-expr-cute'];
}

/* ── Hair: đối xứng quanh cx=160, mái không che mắt ── */
function drParseHair(key) {
    if (key.includes('m-spiky')) return { color: DR_HAIR.black, style: 'spiky' };
    if (key.includes('m-idol')) return { color: DR_HAIR.black, style: 'm-idol' };
    const m = key.match(/dec-hair-(\w+)-(\w+)/);
    if (m) return { color: DR_HAIR[m[1]] || DR_HAIR.black, style: m[2] };
    if (key.includes('silver')) return { color: DR_HAIR.silver, style: 'long' };
    if (key.includes('pink')) return { color: DR_HAIR.pink, style: 'long' };
    return { color: DR_HAIR.silver, style: 'long' };
}

function drHairShade(color) {
    return `<path d="M${DR_CX - 18} 78 Q${DR_CX} 70 ${DR_CX + 18} 78" stroke="#fff" stroke-width="3" fill="none" opacity="0.18" stroke-linecap="round"/>`;
}

/** Đỉnh đầu — chỉ phần trên, không phủ trán */
function drHairCrown(hc, color) {
    return `<path d="M${DR_CX - 30} ${hc - 12} Q${DR_CX} ${hc - 40} ${DR_CX + 30} ${hc - 12} Q${DR_CX + 28} ${hc - 4} ${DR_CX} ${hc} Q${DR_CX - 28} ${hc - 4} ${DR_CX - 30} ${hc - 12} Z" fill="${color}"/>`;
}

/** Mái 3 lọn — kết thúc trên mắt (y≈102), không che mặt */
function drHairBangs(hc, color) {
    const t = hc - 14;
    const b = hc + 2;
    return `
        <path d="M${DR_CX - 24} ${t + 8} Q${DR_CX - 16} ${b} ${DR_CX - 10} ${t + 12} Q${DR_CX - 18} ${t} ${DR_CX - 24} ${t + 8}" fill="${color}"/>
        <path d="M${DR_CX - 6} ${t + 6} Q${DR_CX} ${t - 6} ${DR_CX + 6} ${t + 6} Q${DR_CX} ${b - 2} ${DR_CX - 6} ${t + 6}" fill="${color}"/>
        <path d="M${DR_CX + 24} ${t + 8} Q${DR_CX + 16} ${b} ${DR_CX + 10} ${t + 12} Q${DR_CX + 18} ${t} ${DR_CX + 24} ${t + 8}" fill="${color}"/>`;
}

/** Tóc hai bên mặt — đối xứng */
function drHairSideFront(hc, color) {
    const d = 32;
    return `
        <path d="M${DR_CX - d} ${hc + 4} Q${DR_CX - d - 6} ${hc + 44} ${DR_CX - d + 2} ${hc + 78} Q${DR_CX - d + 4} ${hc + 50} ${DR_CX - d + 2} ${hc + 20} Z" fill="${color}" opacity="0.88"/>
        <path d="M${DR_CX + d} ${hc + 4} Q${DR_CX + d + 6} ${hc + 44} ${DR_CX + d - 2} ${hc + 78} Q${DR_CX + d - 4} ${hc + 50} ${DR_CX + d - 2} ${hc + 20} Z" fill="${color}" opacity="0.88"/>`;
}

/** Tóc dài sau lưng — 2 bím đối xứng */
function drHairBackStrands(hc, color, long) {
    const endY = long ? 292 : 218;
    const d = 36;
    const strand = (sign) => {
        const o = sign * d;
        const out = sign * (d + 12);
        return `M${DR_CX + o} ${hc + 24} Q${DR_CX + out} ${hc + 90} ${DR_CX + out + sign * 4} ${hc + 155} Q${DR_CX + out + sign * 2} ${endY} ${DR_CX + o + sign * 6} ${endY + 4} Q${DR_CX + o + sign * 2} ${hc + 130} ${DR_CX + o} ${hc + 24} Z`;
    };
    return `
        <path d="${strand(-1)}" fill="${color}" opacity="0.86"/>
        <path d="${strand(1)}" fill="${color}" opacity="0.86"/>
        <path d="M${DR_CX - 20} ${hc + 28} Q${DR_CX} ${hc + 42} ${DR_CX + 20} ${hc + 28} L${DR_CX + 18} ${hc + 96} Q${DR_CX} ${hc + 104} ${DR_CX - 18} ${hc + 96} Z" fill="${color}" opacity="0.28"/>`;
}

/** Twin-tail — đuôi thẳng, cân đối 2 bên */
function drHairTwinTails(hc, color) {
    const d = 48;
    const tail = (sign) => {
        const bx = DR_CX + sign * d;
        const ox = DR_CX + sign * (d + 10);
        return `M${bx} ${hc + 30} Q${bx + sign * 4} ${hc + 55} ${ox} ${hc + 100} Q${ox + sign * 2} ${hc + 200} ${bx + sign * 6} ${hc + 268} Q${bx + sign * 2} ${hc + 200} ${bx} ${hc + 100} Q${bx - sign * 2} ${hc + 55} ${bx} ${hc + 30} Z`;
    };
    const tie = (sign) => {
        const x = DR_CX + sign * d;
        return `<ellipse cx="${x}" cy="${hc + 38}" rx="10" ry="7" fill="${color}"/><circle cx="${x}" cy="${hc + 38}" r="4" fill="#fff" opacity="0.25"/>`;
    };
    return {
        back: `<path d="${tail(-1)}" fill="${color}"/><path d="${tail(1)}" fill="${color}"/>`,
        front: `${drHairCrown(hc, color)}${drHairBangs(hc, color)}${tie(-1)}${tie(1)}${drHairShade(color)}`,
    };
}

function drHairLayers(key) {
    const { color, style } = drParseHair(key);
    const hc = DR_RIG.headY;
    const frontBase = `${drHairCrown(hc, color)}${drHairBangs(hc, color)}${drHairShade(color)}`;

    if (style === 'twintail') return drHairTwinTails(hc, color);

    if (style === 'bun') return {
        back: `<path d="M${DR_CX - 22} ${hc + 30} Q${DR_CX} ${hc + 48} ${DR_CX + 22} ${hc + 30} L${DR_CX + 20} ${hc + 118} Q${DR_CX} ${hc + 126} ${DR_CX - 20} ${hc + 118} Z" fill="${color}" opacity="0.4"/>`,
        front: `
            <ellipse cx="${DR_CX}" cy="${hc - 28}" rx="24" ry="18" fill="${color}"/>
            <ellipse cx="${DR_CX}" cy="${hc - 20}" rx="30" ry="12" fill="${color}"/>
            ${frontBase}
            <path d="M${DR_CX - 26} ${hc + 12} Q${DR_CX} ${hc + 90} ${DR_CX + 26} ${hc + 12} L${DR_CX + 22} ${hc + 130} Q${DR_CX} ${hc + 138} ${DR_CX - 22} ${hc + 130} Z" fill="${color}" opacity="0.72"/>`,
    };

    if (style === 'short') return {
        back: '',
        front: `${frontBase}
            <path d="M${DR_CX - 30} ${hc + 6} Q${DR_CX} ${hc - 14} ${DR_CX + 30} ${hc + 6} Q${DR_CX + 28} ${hc + 14} ${DR_CX} ${hc + 16} Q${DR_CX - 28} ${hc + 14} ${DR_CX - 30} ${hc + 6}" fill="${color}"/>`,
    };

    if (style === 'spiky' || style === 'm-idol') return {
        back: '',
        front: `
            <path d="M${DR_CX - 30} ${hc + 2} Q${DR_CX - 18} ${hc - 36} ${DR_CX - 6} ${hc - 8} Q${DR_CX} ${hc - 42} ${DR_CX + 6} ${hc - 8} Q${DR_CX + 18} ${hc - 36} ${DR_CX + 30} ${hc + 2} Q${DR_CX} ${hc + 8} ${DR_CX - 30} ${hc + 2}" fill="${color}"/>
            <path d="M${DR_CX - 26} ${hc} Q${DR_CX} ${hc - 16} ${DR_CX + 26} ${hc}" fill="${color}" opacity="0.65"/>${drHairShade(color)}`,
    };

    if (style === 'layer') return {
        back: drHairBackStrands(hc, color, false),
        front: `${frontBase}${drHairSideFront(hc, color)}`,
    };

    if (style === 'idol') return {
        back: drHairBackStrands(hc, color, true),
        front: `${frontBase}${drHairSideFront(hc, color)}
            <path d="M${DR_CX - 52} ${hc + 50} Q${DR_CX - 58} ${hc + 110} ${DR_CX - 48} ${hc + 165} Q${DR_CX - 52} ${hc + 110} ${DR_CX - 50} ${hc + 50}" fill="${color}" opacity="0.55"/>
            <path d="M${DR_CX + 52} ${hc + 50} Q${DR_CX + 58} ${hc + 110} ${DR_CX + 48} ${hc + 165} Q${DR_CX + 52} ${hc + 110} ${DR_CX + 50} ${hc + 50}" fill="${color}" opacity="0.55"/>`,
    };

    return {
        back: drHairBackStrands(hc, color, true),
        front: `${frontBase}${drHairSideFront(hc, color)}`,
    };
}

function drHair(key) {
    const { back, front } = drHairLayers(key);
    return back + front;
}

/* ── Tops (decorative, cover stick torso) ── */
function drTop(key) {
    if (key.includes('kimono') || key.includes('yukata')) return `
        <path d="M108 168 Q160 198 212 168 L220 298 Q160 318 100 298 Z" fill="url(#drkim)"/>
        <path d="M108 168 L160 218 L212 168" stroke="#fff" stroke-width="2.5" opacity="0.5" fill="none"/>
        <path d="M130 200 Q160 228 190 200" stroke="#fecdd3" stroke-width="1.5" fill="none" opacity="0.6"/>
        <rect x="154" y="188" width="12" height="28" fill="#dc2626" rx="2"/>
        <ellipse cx="160" cy="178" rx="8" ry="5" fill="#fff" opacity="0.3"/>`;

    if (key.includes('uniform') || key.includes('school') && key.includes('f-')) return `
        <path d="M118 168 L118 278 L202 278 L202 168 Q160 196 118 168" fill="url(#druni)"/>
        <path d="M118 168 L160 210 L202 168" fill="#f8fafc" opacity="0.35"/>
        <rect x="154" y="210" width="12" height="42" fill="#dc2626" rx="1"/>
        <path d="M118 168 L100 198 L112 208 L128 182" fill="url(#druni)"/>
        <path d="M202 168 L220 198 L208 208 L192 182" fill="url(#druni)"/>
        <rect x="128" y="168" width="64" height="6" fill="#f8fafc" opacity="0.5" rx="2"/>`;

    if (key.includes('m-uniform') || (key.includes('uniform') && key.includes('m-'))) return `
        <path d="M120 168 L120 276 L200 276 L200 168 Q160 194 120 168" fill="url(#druni)"/>
        <path d="M120 168 L160 208 L200 168" fill="#f8fafc" opacity="0.3"/>
        <rect x="154" y="212" width="12" height="38" fill="#dc2626"/>`;

    if (key.includes('idol') || key.includes('princess')) return `
        <path d="M112 168 L96 198 L110 210 L126 180 L126 288 L194 288 L194 180 L210 210 L224 198 L208 168 Q160 200 112 168" fill="url(#drpk)"/>
        <path d="M126 180 L126 288 L194 288 L194 180" fill="#fff" opacity="0.12"/>
        <circle cx="160" cy="228" r="12" fill="#fff" opacity="0.45"/>
        <circle cx="160" cy="228" r="6" fill="#fbbf24" opacity="0.7"/>
        <path d="M112 168 Q160 188 208 168" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.4"/>
        <ellipse cx="160" cy="198" rx="22" ry="8" fill="#fff" opacity="0.2"/>`;

    if (key.includes('harajuku')) return `
        <path d="M110 170 L92 205 L108 216 L124 186 L124 286 L196 286 L196 186 L212 216 L228 205 L210 170 Q160 202 110 170" fill="#f472b6"/>
        <rect x="124" y="200" width="72" height="8" fill="#fde047"/>
        <rect x="124" y="218" width="72" height="8" fill="#60a5fa"/>
        <rect x="124" y="236" width="72" height="8" fill="#4ade80"/>
        <circle cx="160" cy="258" r="10" fill="#fff" opacity="0.5"/>`;

    if (key.includes('hoodie')) return `
        <path d="M112 168 L88 210 L106 222 L124 192 L124 284 L196 284 L196 192 L214 222 L232 210 L208 168 Q160 198 112 168" fill="#374151"/>
        <path d="M124 192 L124 284 L196 284 L196 192" fill="#1f2937" opacity="0.3"/>
        <ellipse cx="160" cy="210" rx="18" ry="10" fill="#4b5563"/>
        <rect x="148" y="228" width="24" height="20" rx="4" fill="#6b7280" opacity="0.5"/>`;

    if (key.includes('coat')) return `
        <path d="M108 166 L90 208 L108 220 L124 188 L124 290 L196 290 L196 188 L212 220 L230 208 L212 166 Q160 198 108 166" fill="#7c3aed"/>
        <path d="M124 188 L124 290 L196 290 L196 188" fill="#5b21b6" opacity="0.25"/>
        <rect x="156" y="200" width="8" height="50" fill="#fbbf24" opacity="0.6"/>`;

    if (key.includes('vest') || key.includes('suit')) return `
        <path d="M122 168 L122 278 L198 278 L198 168 Q160 198 122 168" fill="#0f172a"/>
        <path d="M122 168 L160 228 L198 168" fill="#f8fafc" opacity="0.45"/>
        <rect x="156" y="228" width="8" height="42" fill="#dc2626"/>`;

    if (key.includes('shirt') || key.includes('casual') || key.includes('campus') || key.includes('tokyo')) return `
        <path d="M120 168 L120 276 L200 276 L200 168 Q160 194 120 168" fill="#60a5fa"/>
        <path d="M120 168 L160 208 L200 168" fill="#fff" opacity="0.25"/>
        <rect x="156" y="200" width="8" height="60" fill="#fff" opacity="0.15"/>`;

    if (key.includes('festival')) return `
        <path d="M114 168 L100 200 L114 210 L128 180 L128 284 L192 284 L192 180 L206 210 L220 200 L206 168 Q160 198 114 168" fill="#f97316"/>
        <circle cx="140" cy="220" r="6" fill="#fbbf24"/><circle cx="180" cy="220" r="6" fill="#f472b6"/>
        <circle cx="160" cy="248" r="6" fill="#60a5fa"/>`;

    if (key.includes('pastel')) return `
        <path d="M122 170 L122 272 L198 272 L198 170 Q160 198 122 170" fill="#fbcfe8"/>
        <ellipse cx="160" cy="218" rx="14" ry="10" fill="#fff" opacity="0.35"/>`;

    return `<path d="M120 168 L120 276 L200 276 L200 168 Q160 196 120 168" fill="#a78bfa"/>`;
}

/* ── Bottoms (skirts / pants over stick legs) ── */
function drBottom(key) {
    if (key.includes('kimono') || key.includes('yukata')) return `
        <path d="M108 268 Q160 298 212 268 L218 340 Q160 358 102 340 Z" fill="url(#drkim)" opacity="0.95"/>
        <path d="M120 280 Q160 310 200 280" stroke="#fecdd3" stroke-width="1" fill="none" opacity="0.5"/>`;

    if (key.includes('school') || key.includes('skirt-pastel') || key === 'dec-bottom-skirt-pastel') return `
        <path d="M122 268 L100 342 Q160 360 220 342 L198 268 Z" fill="url(#drsk)"/>
        <path d="M108 300 Q160 318 212 300" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.35"/>
        <path d="M112 318 Q160 332 208 318" stroke="#c4b5fd" stroke-width="1" fill="none" opacity="0.4"/>`;

    if (key.includes('princess') || key.includes('festival')) return `
        <path d="M118 266 L92 348 Q160 368 228 348 L202 266 Z" fill="#f0abfc"/>
        <path d="M100 310 Q160 330 220 310" stroke="#fff" stroke-width="2" fill="none" opacity="0.4"/>
        <path d="M96 332 Q160 352 224 332" stroke="#e879a9" stroke-width="1.5" fill="none" opacity="0.35"/>`;

    if (key.includes('hakama')) return `
        <path d="M128 268 L118 340 L142 340 L152 268 Z" fill="#1e3a5f"/>
        <path d="M168 268 L178 340 L154 340 L144 268 Z" fill="#1e3a5f"/>
        <rect x="128" y="268" width="44" height="8" fill="#dc2626"/>`;

    if (key.includes('pants') || key.includes('street') || key.includes('m-')) return `
        <path d="M130 268 L124 342 Q142 348 148 342 L154 268 Z" fill="#1e293b"/>
        <path d="M166 268 L172 342 Q154 348 148 342 L142 268 Z" fill="#1e293b"/>
        <rect x="130" y="266" width="40" height="6" fill="#334155" rx="2"/>`;

    return `<path d="M124 268 L106 338 Q160 355 214 338 L196 268 Z" fill="url(#drsk)"/>`;
}

function drClothes(key) {
    if (key.startsWith('dec-top-')) return drTop(key);
    if (key.startsWith('dec-bottom-')) return drBottom(key);
    return drTop(key);
}

/* ── Shoes ── */
function drShoes(key) {
    if (key.includes('heel') || key.includes('loafer')) return `
        <ellipse cx="146" cy="354" rx="16" ry="7" fill="#1e3a5f"/>
        <ellipse cx="174" cy="354" rx="16" ry="7" fill="#1e3a5f"/>
        <ellipse cx="146" cy="350" rx="12" ry="4" fill="#334155"/>
        <ellipse cx="174" cy="350" rx="12" ry="4" fill="#334155"/>`;

    if (key.includes('geta')) return `
        <rect x="132" y="346" width="32" height="7" fill="#a16207" rx="2"/>
        <rect x="156" y="346" width="32" height="7" fill="#a16207" rx="2"/>
        <rect x="140" y="352" width="4" height="10" fill="#78350f"/><rect x="152" y="352" width="4" height="10" fill="#78350f"/>
        <rect x="164" y="352" width="4" height="10" fill="#78350f"/><rect x="176" y="352" width="4" height="10" fill="#78350f"/>`;

    if (key.includes('boots')) return `
        <path d="M134 340 L130 358 Q146 362 150 358 L152 340 Z" fill="#1e293b"/>
        <path d="M166 340 L170 358 Q154 362 150 358 L148 340 Z" fill="#1e293b"/>`;

    return `
        <ellipse cx="146" cy="354" rx="17" ry="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>
        <ellipse cx="174" cy="354" rx="17" ry="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>
        <path d="M136 352 Q146 348 156 352" stroke="#94a3b8" stroke-width="1" fill="none"/>
        <path d="M164 352 Q174 348 184 352" stroke="#94a3b8" stroke-width="1" fill="none"/>`;
}

/* ── Accessories ── */
function drAcc(key) {
    if (key.includes('ribbon')) return `
        <ellipse cx="198" cy="98" rx="16" ry="9" fill="#f472b6"/>
        <circle cx="198" cy="98" r="5" fill="#fda4af"/>
        <ellipse cx="188" cy="96" rx="8" ry="5" fill="#fb7185" opacity="0.8"/>
        <ellipse cx="208" cy="96" rx="8" ry="5" fill="#fb7185" opacity="0.8"/>`;

    if (key.includes('sakura')) return `
        <circle cx="196" cy="94" r="8" fill="#fda4af"/><circle cx="196" cy="94" r="4" fill="#fb7185"/>
        <ellipse cx="190" cy="92" rx="4" ry="6" fill="#fecdd3" transform="rotate(-30 190 92)"/>
        <ellipse cx="202" cy="92" rx="4" ry="6" fill="#fecdd3" transform="rotate(30 202 92)"/>`;

    if (key.includes('fan')) return `
        <path d="M228 230 Q248 210 268 230 Q248 250 228 230" fill="#fda4af" opacity="0.85"/>
        <line x1="248" y1="230" x2="248" y2="268" stroke="#a16207" stroke-width="2.5"/>
        <path d="M232 228 Q248 218 264 228" stroke="#fb7185" stroke-width="1" fill="none"/>`;

    if (key.includes('umbrella')) return `
        <path d="M210 210 Q248 185 286 210" fill="#f472b6" opacity="0.85"/>
        <path d="M210 210 Q248 195 286 210" stroke="#fff" stroke-width="1" fill="none" opacity="0.4"/>
        <line x1="248" y1="210" x2="248" y2="290" stroke="#64748b" stroke-width="2.5"/>
        <path d="M242 290 Q248 296 254 290" stroke="#64748b" stroke-width="2" fill="none"/>`;

    if (key.includes('headphones')) return `
        <ellipse cx="118" cy="108" rx="11" ry="13" fill="#374151"/>
        <ellipse cx="202" cy="108" rx="11" ry="13" fill="#374151"/>
        <path d="M118 108 Q160 88 202 108" stroke="#374151" stroke-width="4" fill="none"/>
        <rect x="112" y="102" width="12" height="16" rx="4" fill="#1f2937"/>
        <rect x="196" y="102" width="12" height="16" rx="4" fill="#1f2937"/>`;

    if (key.includes('mic')) return `
        <rect x="222" y="200" width="10" height="28" rx="4" fill="#374151"/>
        <ellipse cx="227" cy="196" rx="12" ry="8" fill="#6b7280"/>
        <line x1="227" y1="228" x2="227" y2="248" stroke="#374151" stroke-width="2"/>`;

    if (key.includes('bag') || key.includes('school')) return `
        <rect x="208" y="232" width="34" height="28" rx="6" fill="#1e3a5f"/>
        <path d="M216 232 Q225 214 234 232" fill="none" stroke="#1e3a5f" stroke-width="3"/>
        <rect x="218" y="242" width="14" height="10" rx="2" fill="#dc2626" opacity="0.7"/>`;

    if (key.includes('glasses')) return `
        <circle cx="148" cy="110" rx="14" fill="none" stroke="#374151" stroke-width="2"/>
        <circle cx="172" cy="110" rx="14" fill="none" stroke="#374151" stroke-width="2"/>
        <line x1="162" y1="110" x2="158" y2="110" stroke="#374151" stroke-width="2"/>
        <line x1="134" y1="108" x2="124" y2="104" stroke="#374151" stroke-width="1.5"/>
        <line x1="186" y1="108" x2="196" y2="104" stroke="#374151" stroke-width="1.5"/>`;

    if (key.includes('necklace')) return `
        <path d="M148 148 Q160 162 172 148" fill="none" stroke="#fbbf24" stroke-width="2"/>
        <circle cx="160" cy="156" r="4" fill="#f59e0b"/>`;

    if (key.includes('lucky')) return `
        <ellipse cx="230" cy="250" rx="14" ry="16" fill="#fff" stroke="#fda4af" stroke-width="1.5"/>
        <circle cx="226" cy="246" r="2" fill="#374151"/><circle cx="234" cy="246" r="2" fill="#374151"/>
        <path d="M226 252 Q230 256 234 252" fill="none" stroke="#374151" stroke-width="1"/>`;

    return `<circle cx="228" cy="240" r="10" fill="#fbbf24" opacity="0.75" filter="url(#drglow)"/>`;
}

/* ── Effects ── */
function drFx(key) {
    if (key.includes('sakura')) return `
        <circle cx="42" cy="58" r="7" fill="#fda4af" opacity="0.65"/><circle cx="268" cy="72" r="5" fill="#fb7185" opacity="0.55"/>
        <circle cx="175" cy="38" r="5" fill="#f9a8d4" opacity="0.5"/><circle cx="95" cy="120" r="4" fill="#fecdd3" opacity="0.45"/>
        <ellipse cx="250" cy="140" rx="5" ry="3" fill="#fda4af" opacity="0.4" transform="rotate(45 250 140)"/>`;

    if (key.includes('sparkle') || key.includes('star') || key.includes('idol') || key.includes('stage')) return `
        <polygon points="48,68 51,76 59,76 53,81 55,89 48,84 41,89 43,81 37,76 45,76" fill="#fbbf24" opacity="0.85"/>
        <polygon points="262,62 264,67 269,67 265,70 266,75 262,72 258,75 259,70 255,67 260,67" fill="#fde68a" opacity="0.8"/>
        <circle cx="280" cy="100" r="3" fill="#fff" opacity="0.7"/><circle cx="35" cy="95" r="2.5" fill="#fff" opacity="0.6"/>`;

    if (key.includes('heart')) return `
        <path d="M42 78 Q42 68 50 68 Q58 68 58 78 Q58 88 50 96 Q42 88 42 78" fill="#f472b6" opacity="0.6"/>
        <path d="M258 85 Q258 78 264 78 Q270 78 270 85 Q270 92 264 98 Q258 92 258 85" fill="#fb7185" opacity="0.5"/>`;

    if (key.includes('snow')) return `
        <circle cx="48" cy="52" r="3.5" fill="#fff" opacity="0.85"/><circle cx="258" cy="68" r="3" fill="#fff" opacity="0.75"/>
        <circle cx="120" cy="40" r="2" fill="#fff" opacity="0.6"/><circle cx="200" cy="55" r="2.5" fill="#fff" opacity="0.7"/>`;

    return `<circle cx="252" cy="62" r="4" fill="#fbbf24" opacity="0.55" filter="url(#drglow)"/>`;
}

function drMakeup(key) {
    const y = DR_RIG.headY + 28;
    let lip = `<path d="M150 ${y} Q160 ${y + 5} 170 ${y}" fill="#f472b6" opacity="0.55"/>`;
    if (key.includes('natural')) lip = `<path d="M152 ${y + 2} Q160 ${y + 5} 168 ${y + 2}" fill="#fda4af" opacity="0.4"/>`;
    if (key.includes('idol') || key.includes('festival')) lip = `<path d="M148 ${y - 1} Q160 ${y + 7} 172 ${y - 1}" fill="#e11d48" opacity="0.6"/>`;
    return `
        <ellipse cx="132" cy="${DR_RIG.headY + 14}" rx="10" ry="5" fill="#fda4af" opacity="0.38"/>
        <ellipse cx="188" cy="${DR_RIG.headY + 14}" rx="10" ry="5" fill="#fda4af" opacity="0.38"/>
        ${lip}`;
}

/* ── Backgrounds ── */
function drBg(key) {
    const bgs = {
        'dec-bg-sakura': `<rect width="320" height="400" fill="#fdf2f8"/><circle cx="55" cy="70" r="14" fill="#fda4af" opacity="0.45"/><circle cx="255" cy="55" r="11" fill="#fb7185" opacity="0.35"/><circle cx="200" cy="110" r="9" fill="#f9a8d4" opacity="0.4"/><circle cx="90" cy="130" r="8" fill="#fecdd3" opacity="0.3"/>`,
        'dec-bg-tokyo': `<rect width="320" height="400" fill="#0f172a"/><rect x="35" y="190" width="28" height="130" fill="#1e293b"/><rect x="85" y="150" width="38" height="170" fill="#334155"/><rect x="195" y="175" width="32" height="145" fill="#1e293b"/><circle cx="255" cy="48" r="22" fill="#fde68a" opacity="0.85"/><rect x="0" y="320" width="320" height="80" fill="#020617" opacity="0.5"/>`,
        'dec-bg-school': `<rect width="320" height="400" fill="#dbeafe"/><rect x="75" y="140" width="170" height="110" fill="#f8fafc" stroke="#94a3b8" stroke-width="1"/><rect x="125" y="190" width="70" height="55" fill="#93c5fd" opacity="0.35"/>`,
        'dec-bg-shrine': `<rect width="320" height="400" fill="#fef9c3"/><rect x="118" y="175" width="84" height="65" fill="#dc2626"/><path d="M95 175 L160 125 L225 175" fill="#b91c1c"/><rect x="148" y="195" width="24" height="30" fill="#fef08a"/>`,
        'dec-bg-fireworks': `<rect width="320" height="400" fill="#1e1b4b"/><circle cx="160" cy="85" r="3" fill="#fbbf24"/><circle cx="140" cy="75" r="2.5" fill="#f472b6"/><circle cx="180" cy="78" r="2.5" fill="#60a5fa"/><circle cx="155" cy="65" r="2" fill="#fde68a"/>`,
        'dec-bg-harajuku': `<rect width="320" height="400" fill="#fef08a"/><rect x="0" y="0" width="70" height="400" fill="#f472b6" opacity="0.15"/><rect x="250" y="0" width="70" height="400" fill="#60a5fa" opacity="0.15"/>`,
        'dec-bg-park': `<rect width="320" height="400" fill="#bbf7d0"/><ellipse cx="160" cy="355" rx="155" ry="42" fill="#86efac" opacity="0.55"/>`,
        'dec-bg-snow': `<rect width="320" height="400" fill="#f0f9ff"/><circle cx="48" cy="55" r="5" fill="#fff"/><circle cx="210" cy="38" r="4" fill="#fff"/>`,
        'dec-bg-tea': `<rect width="320" height="400" fill="#ecfdf5"/><rect x="50" y="245" width="220" height="10" fill="#a16207" opacity="0.2" rx="2"/>`,
        'dec-bg-idol-room': `<rect width="320" height="400" fill="#faf5ff"/><rect x="0" y="295" width="320" height="105" fill="#e9d5ff" opacity="0.4"/><circle cx="80" cy="60" r="20" fill="#fbbf24" opacity="0.15"/>`,
    };
    return bgs[key] || bgs['dec-bg-sakura'];
}

function drRenderLayer(key, gender) {
    if (!key) return '';
    if (key.startsWith('dec-bg-')) return drBg(key);
    if (key.startsWith('dec-head-')) return drRenderHeadPart(key);
    if (key.startsWith('dec-torso-')) return drRenderTorsoPart(key) + drRenderNeckPart();
    if (key.startsWith('dec-arms-')) return drRenderArmsPart(key);
    if (key.startsWith('dec-legs-')) return drRenderLegsPart(key);
    if (key.startsWith('dec-body-')) return '';
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

const DR_LAYER_RANK = {
    background: 0, body: 2, head: 3, torso: 4, arms: 5, legs: 6,
    bottom: 30, top: 40, shoes: 50, eyes: 60, expression: 65, makeup: 68, accessory: 80, effect: 90,
};

function drSortEquipped(equipped) {
    return [...(equipped || [])].sort((a, b) => {
        const ra = DR_LAYER_RANK[a.category || a.slot] ?? (a.layerOrder || 50);
        const rb = DR_LAYER_RANK[b.category || b.slot] ?? (b.layerOrder || 50);
        return ra - rb || (a.layerOrder || 0) - (b.layerOrder || 0);
    });
}

function drBuildSvg(equipped, gender) {
    const sorted = drSortEquipped(equipped);
    const charParts = drResolveParts(sorted, gender);
    const body = drBuildBodyParts(charParts);
    const layers = {
        bg: [], hairBack: [], bottom: [], top: [], shoes: [],
        eyes: [], expr: [], makeup: [], hairFront: [], acc: [], fx: [],
    };
    const slotOf = {
        background: 'bg', bottom: 'bottom', top: 'top', shoes: 'shoes',
        eyes: 'eyes', expression: 'expr', makeup: 'makeup', accessory: 'acc', effect: 'fx',
    };

    for (const item of sorted) {
        if (['head', 'torso', 'arms', 'legs', 'body'].includes(item.category)) continue;
        if (item.category === 'hair') {
            const { back, front } = drHairLayers(item.layerImage);
            if (back) layers.hairBack.push(back);
            if (front) layers.hairFront.push(front);
            continue;
        }
        const svg = drRenderLayer(item.layerImage, gender);
        if (!svg) continue;
        const slot = slotOf[item.category];
        if (slot) layers[slot].push(svg);
    }

    if (!layers.bg.length) layers.bg.push(drBg('dec-bg-sakura'));

    const order = [
        ...layers.bg, ...layers.hairBack,
        body.legs, body.torso, body.arms,
        ...layers.bottom, ...layers.top, ...layers.shoes,
        body.head,
        ...layers.eyes, ...layers.expr, ...layers.makeup,
        ...layers.hairFront, ...layers.acc, ...layers.fx,
    ];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400">${drDefs('dr')}${order.join('')}</svg>`;
}

function drItemThumb(layerKey, category) {
    const inner = drRenderLayer(layerKey, 'female') || drRenderLayer(layerKey, 'male')
        || `<rect x="110" y="110" width="100" height="100" fill="#fce7f3" rx="14" stroke="#f9a8d4" stroke-width="1"/>`;
    const vb = category === 'background' ? '0 0 320 400' : '80 50 160 220';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="56" height="56">${drDefs('t')}${inner}</svg>`;
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