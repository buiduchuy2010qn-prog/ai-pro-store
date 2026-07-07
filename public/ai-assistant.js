/* AI Đức Hi Assistant — chat widget */
const AI_STORAGE_KEY = 'duchi_ai_chat_v1';

let aiState = {
    open: false,
    history: [],
    conversationId: null,
    status: null,
    sending: false,
};

function aiQuickSuggestions() {
    if (currentUser?.role === 'admin' && aiState.status?.quickAdmin?.length) {
        return aiState.status.quickAdmin;
    }
    return aiState.status?.quickUser || [
        'Cách nạp tiền?', 'Mua hàng thế nào?', 'Xem đơn hàng ở đâu?',
        'Quên mật khẩu?', 'Gợi ý phối đồ nữ Nhật', 'Liên hệ Zalo',
    ];
}

function aiSaveLocal() {
    try {
        localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({
            history: aiState.history.slice(-40),
            conversationId: aiState.conversationId,
        }));
    } catch (_) {}
}

function aiLoadLocal() {
    try {
        const raw = localStorage.getItem(AI_STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        aiState.history = data.history || [];
        aiState.conversationId = data.conversationId || null;
    } catch (_) {}
}

function aiClearLocal() {
    localStorage.removeItem(AI_STORAGE_KEY);
    aiState.history = [];
    aiState.conversationId = null;
}

function renderAiMarkdown(text) {
    const safe = escapeHtml(text || '');
    return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function aiScrollBottom() {
    const box = document.getElementById('ai-chat-messages');
    if (box) box.scrollTop = box.scrollHeight;
}

function aiShowTyping() {
    const box = document.getElementById('ai-chat-messages');
    if (!box || document.getElementById('ai-typing')) return;
    const el = document.createElement('div');
    el.id = 'ai-typing';
    el.className = 'flex justify-start ai-msg-enter';
    el.innerHTML = `
        <div class="ai-msg-ai flex gap-2 items-end">
            <div class="ai-avatar shrink-0"><i class="fas fa-robot"></i></div>
            <div class="ai-bubble-ai ai-typing-dots"><span></span><span></span><span></span></div>
        </div>`;
    box.appendChild(el);
    aiScrollBottom();
}

function aiHideTyping() {
    document.getElementById('ai-typing')?.remove();
}

function appendAiMessage(role, text, extras = {}) {
    const box = document.getElementById('ai-chat-messages');
    if (!box) return;
    const isUser = role === 'user';
    const div = document.createElement('div');
    div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} ai-msg-enter`;
    let actionsHtml = '';
    if (extras.actions?.length) {
        actionsHtml = `<div class="ai-action-row mt-2 flex flex-wrap gap-1.5">${extras.actions.map(a =>
            `<button type="button" data-ai-action="${escapeHtml(a.view)}" class="ai-action-btn">${escapeHtml(a.label)}</button>`
        ).join('')}</div>`;
    }
    if (isUser) {
        div.innerHTML = `<div class="ai-bubble-user max-w-[85%]">${escapeHtml(text)}</div>`;
    } else {
        div.innerHTML = `
            <div class="ai-msg-ai flex gap-2 items-end max-w-[90%]">
                <div class="ai-avatar shrink-0"><i class="fas fa-robot"></i></div>
                <div>
                    <div class="ai-bubble-ai">${renderAiMarkdown(text)}</div>
                    ${actionsHtml}
                </div>
            </div>`;
    }
    box.appendChild(div);
    aiScrollBottom();
}

function renderAiQuickChips() {
    const chips = document.getElementById('ai-quick-chips');
    if (!chips) return;
    chips.innerHTML = aiQuickSuggestions().map(q =>
        `<button type="button" data-ai-quick="${escapeHtml(q)}" class="ai-chip">${escapeHtml(q)}</button>`
    ).join('');
}

function aiRenderHistory() {
    const box = document.getElementById('ai-chat-messages');
    if (!box) return;
    box.innerHTML = '';
    aiState.history.forEach(m => appendAiMessage(m.role, m.content, m.meta || {}));
}

async function aiFetchStatus() {
    try {
        aiState.status = await api('/ai/status');
        const modeEl = document.getElementById('ai-chat-mode');
        if (modeEl && aiState.status) {
            const m = aiState.status.mode === 'ai' ? `AI • ${aiState.status.model}` : 'Trợ lý thông minh';
            modeEl.textContent = m;
        }
        renderAiQuickChips();
    } catch (_) {}
}

async function aiLoadServerHistory() {
    if (!getToken()) return false;
    try {
        const r = await api('/ai/history');
        if (r.conversationId) aiState.conversationId = r.conversationId;
        if (r.messages?.length) {
            aiState.history = r.messages.map(m => ({ role: m.role, content: m.content }));
            return true;
        }
        if (r.greeting && !aiState.history.length) {
            aiState.history.push({ role: 'assistant', content: r.greeting });
        }
        return true;
    } catch (_) {
        return false;
    }
}

async function initAiChat() {
    await aiFetchStatus();
    if (!aiState.history.length) {
        const loaded = await aiLoadServerHistory();
        if (!loaded) aiLoadLocal();
    }
    if (!aiState.history.length) {
        const greet = aiState.status?.greeting ||
            'Xin chào! Mình là **AI Đức Hi Assistant** — trợ lý thông minh của Shop của Đức Hi. Hỏi mình bất cứ điều gì nhé!';
        aiState.history.push({ role: 'assistant', content: greet });
    }
    aiRenderHistory();
    renderAiQuickChips();
}

function toggleAiChat(open) {
    if (aiState.status?.enabled === false) {
        toast('Trợ lý AI đang tạm tắt. Liên hệ Zalo 0944255413.', true);
        return;
    }
    aiState.open = open ?? !aiState.open;
    const panel = document.getElementById('ai-chat-panel');
    const fab = document.getElementById('ai-chat-toggle');
    panel?.classList.toggle('hidden', !aiState.open);
    panel?.classList.toggle('ai-panel-open', aiState.open);
    fab?.classList.toggle('ai-fab-active', aiState.open);
    if (aiState.open) {
        initAiChat();
        document.getElementById('ai-chat-input')?.focus();
    }
}

function aiHandleAction(view) {
    if (view === 'zalo') {
        window.open('https://zalo.me/0944255413', '_blank');
        return;
    }
    if (view === 'auth-login') {
        if (currentUser) { toast('Bạn đã đăng nhập rồi!'); return; }
        showAuth();
        showAuthTab('login');
        return;
    }
    if (view === 'auth-register') {
        if (currentUser) { toast('Bạn đã đăng nhập rồi!'); return; }
        showAuth();
        showAuthTab('register');
        return;
    }
    if (view === 'auth-forgot') {
        if (currentUser) { toast('Bạn đã đăng nhập. Đổi MK trong tài khoản hoặc đăng xuất trước.'); return; }
        showAuth();
        showForgotPanel(1);
        return;
    }
    const needAuth = ['wallet', 'orders', 'transactions', 'admin'];
    if (needAuth.includes(view) && !currentUser) {
        toast('Vui lòng đăng nhập để sử dụng tính năng này.', true);
        showAuth();
        return;
    }
    if (view === 'admin' && currentUser?.role !== 'admin') {
        toast('Chỉ admin mới truy cập được.', true);
        return;
    }
    if (currentUser) navigateTo(view);
    else showAuth();
    if (aiState.open && window.innerWidth < 640) toggleAiChat(false);
}

async function aiClearChat() {
    if (!confirm('Xóa toàn bộ cuộc trò chuyện với AI?')) return;
    aiClearLocal();
    if (getToken()) {
        try {
            await api('/ai/history', {
                method: 'DELETE',
                body: JSON.stringify({ conversationId: aiState.conversationId }),
            });
        } catch (_) {}
    }
    aiState.conversationId = null;
    aiState.history = [];
    const greet = aiState.status?.greeting ||
        'Xin chào! Mình là **AI Đức Hi Assistant**. Hỏi mình bất cứ điều gì nhé!';
    aiState.history.push({ role: 'assistant', content: greet });
    aiRenderHistory();
    toast('Đã xóa cuộc trò chuyện');
}

async function sendAiMessage(text) {
    const msg = (text || '').trim();
    if (!msg || aiState.sending) return;
    aiState.sending = true;
    appendAiMessage('user', msg);
    aiState.history.push({ role: 'user', content: msg });
    const input = document.getElementById('ai-chat-input');
    if (input) { input.value = ''; input.disabled = true; }
    aiShowTyping();
    try {
        const body = {
            message: msg,
            history: aiState.history.slice(-12),
            page: currentView || 'products',
            conversationId: aiState.conversationId,
        };
        if (currentUser) {
            body.userContext = {
                id: currentUser.id,
                email: currentUser.email,
                role: currentUser.role,
            };
        }
        const r = await api('/ai/chat', { method: 'POST', body: JSON.stringify(body) });
        aiHideTyping();
        const reply = r.reply || 'Xin lỗi, mình chưa trả lời được. Liên hệ Zalo 0944255413.';
        if (r.conversationId) aiState.conversationId = r.conversationId;
        const meta = { actions: r.actions || [] };
        appendAiMessage('assistant', reply, meta);
        aiState.history.push({ role: 'assistant', content: reply, meta });
        if (r.suggestions?.length) {
            aiState.status = aiState.status || {};
            if (currentUser?.role === 'admin') aiState.status.quickAdmin = r.suggestions;
            else aiState.status.quickUser = r.suggestions;
            renderAiQuickChips();
        }
        if (!getToken()) aiSaveLocal();
    } catch (e) {
        aiHideTyping();
        const errMsg = e.message?.includes('đăng nhập')
            ? e.message
            : 'AI đang bận một chút, bạn thử lại sau nhé. Hoặc liên hệ Zalo 0944255413.';
        appendAiMessage('assistant', errMsg, {
            actions: [{ label: 'Liên hệ Zalo', view: 'zalo' }],
        });
        aiState.history.push({ role: 'assistant', content: errMsg });
        if (!getToken()) aiSaveLocal();
    }
    if (input) { input.disabled = false; input.focus(); }
    aiState.sending = false;
}

async function loadAdminAi() {
    const el = document.getElementById('admin-ai-panel');
    if (!el) return;
    try {
        const { settings, stats } = await api('/admin/ai/settings');
        el.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div class="admin-stat-card"><div class="text-xs text-slate-500">Tổng lượt chat</div><div class="text-2xl font-bold gradient-text">${stats.totalChats || 0}</div></div>
                <div class="admin-stat-card"><div class="text-xs text-slate-500">Hôm nay</div><div class="text-2xl font-bold text-brand-600">${stats.todayChats || 0}</div></div>
                <div class="admin-stat-card"><div class="text-xs text-slate-500">Chế độ</div><div class="text-lg font-bold">${escapeHtml(settings.mode)}</div></div>
            </div>
            <div class="glass-card p-5 space-y-4">
                <h3 class="font-semibold"><i class="fas fa-robot text-brand-500 mr-2"></i>Cài đặt AI Đức Hi Assistant</h3>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" id="ai-set-enabled" ${settings.enabled ? 'checked' : ''} class="rounded">
                    Bật trợ lý AI trên web
                </label>
                <div>
                    <label class="text-xs text-slate-500 block mb-1">Chế độ AI</label>
                    <select id="ai-set-mode" class="border rounded-xl px-3 py-2 text-sm w-full max-w-xs">
                        <option value="auto" ${settings.modeSetting === 'auto' ? 'selected' : ''}>Tự động (AI nếu có API key)</option>
                        <option value="rule" ${settings.modeSetting === 'rule' ? 'selected' : ''}>Rule-based (FAQ thông minh)</option>
                        <option value="ai" ${settings.modeSetting === 'ai' ? 'selected' : ''}>AI API (OpenAI/xAI)</option>
                    </select>
                </div>
                <div>
                    <label class="text-xs text-slate-500 block mb-1">Lời chào AI</label>
                    <textarea id="ai-set-greeting" rows="3" class="border rounded-xl px-3 py-2 text-sm w-full">${escapeHtml(settings.greeting || '')}</textarea>
                </div>
                <div>
                    <label class="text-xs text-slate-500 block mb-1">Gợi ý nhanh (user) — mỗi dòng một câu</label>
                    <textarea id="ai-set-quick-user" rows="4" class="border rounded-xl px-3 py-2 text-sm w-full">${(settings.quickUser || []).map(escapeHtml).join('\n')}</textarea>
                </div>
                <div>
                    <label class="text-xs text-slate-500 block mb-1">Gợi ý nhanh (admin)</label>
                    <textarea id="ai-set-quick-admin" rows="3" class="border rounded-xl px-3 py-2 text-sm w-full">${(settings.quickAdmin || []).map(escapeHtml).join('\n')}</textarea>
                </div>
                <button type="button" id="ai-set-save" class="btn-primary px-4 py-2 text-sm"><i class="fas fa-save mr-1"></i>Lưu cài đặt</button>
            </div>
            ${(stats.topIntents || []).length ? `
            <div class="glass-card p-5 mt-4">
                <h4 class="font-semibold text-sm mb-2">Câu hỏi thường gặp (intent)</h4>
                <div class="space-y-1 text-sm">${stats.topIntents.map(t =>
                    `<div class="flex justify-between"><span>${escapeHtml(t.intent || 'general')}</span><span class="font-medium">${t.count}</span></div>`
                ).join('')}</div>
            </div>` : ''}`;
        document.getElementById('ai-set-save')?.addEventListener('click', saveAdminAiSettings);
    } catch (e) {
        el.innerHTML = `<div class="text-red-500 text-sm">${escapeHtml(e.message)}</div>`;
    }
}

async function saveAdminAiSettings() {
    const lines = id => document.getElementById(id)?.value.split('\n').map(s => s.trim()).filter(Boolean) || [];
    try {
        await api('/admin/ai/settings', {
            method: 'PATCH',
            body: JSON.stringify({
                enabled: document.getElementById('ai-set-enabled')?.checked,
                mode: document.getElementById('ai-set-mode')?.value,
                greeting: document.getElementById('ai-set-greeting')?.value.trim(),
                quickUser: lines('ai-set-quick-user'),
                quickAdmin: lines('ai-set-quick-admin'),
            }),
        });
        toast('Đã lưu cài đặt AI!');
        loadAdminAi();
        aiFetchStatus();
    } catch (e) {
        toast(e.message, true);
    }
}

function initAiAssistantEvents() {
    document.getElementById('ai-chat-toggle')?.addEventListener('click', () => toggleAiChat());
    document.getElementById('ai-chat-close')?.addEventListener('click', () => toggleAiChat(false));
    document.getElementById('ai-chat-minimize')?.addEventListener('click', () => toggleAiChat(false));
    document.getElementById('ai-chat-clear')?.addEventListener('click', () => aiClearChat());
    document.getElementById('ai-chat-form')?.addEventListener('submit', e => {
        e.preventDefault();
        sendAiMessage(document.getElementById('ai-chat-input')?.value);
    });
    document.getElementById('ai-quick-chips')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-ai-quick]');
        if (btn) sendAiMessage(btn.dataset.aiQuick);
    });
    document.getElementById('ai-chat-messages')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-ai-action]');
        if (btn) aiHandleAction(btn.dataset.aiAction);
    });
    aiFetchStatus();
}