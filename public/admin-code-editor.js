/**
 * Admin Code Editor — AI chỉnh sửa web (mật khẩu riêng + full codebase)
 */
const CodeEditorState = {
    unlocked: false,
    token: localStorage.getItem('code_editor_token') || '',
    tree: [],
    currentPath: '',
    content: '',
    savedContent: '',
    aiHistory: [],
    pendingEdits: [],
    model: '',
    sending: false,
};

function codeEditorHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (CodeEditorState.token) h['X-Code-Editor-Token'] = CodeEditorState.token;
    return h;
}

async function codeApi(path, opts = {}) {
    const secHeaders = window.SecurityClient ? await SecurityClient.secureHeaders() : {};
    const headers = { ...codeEditorHeaders(), ...secHeaders, ...opts.headers };
    const token = typeof getToken === 'function' ? getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (data.needsUnlock) CodeEditorState.unlocked = false;
        throw new Error(data.error || 'Lỗi hệ thống');
    }
    return data;
}

function formatFileSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderCodeTree(nodes, depth = 0) {
    if (!nodes?.length) return '';
    return nodes.map(node => {
        if (node.type === 'dir') {
            return `<div class="code-tree-dir" style="padding-left:${0.5 + depth * 0.5}rem">
                <i class="fas fa-folder text-amber-400 mr-1"></i>${escapeHtml(node.name)}
            </div>
            <div class="code-tree-children">${renderCodeTree(node.children, depth + 1)}</div>`;
        }
        const active = node.path === CodeEditorState.currentPath ? ' active' : '';
        return `<button type="button" class="code-tree-item${active}" data-ce-path="${escapeHtml(node.path)}" style="padding-left:${0.5 + depth * 0.65}rem">
            <i class="fas fa-file-code"></i>
            <span class="truncate">${escapeHtml(node.name)}</span>
        </button>`;
    }).join('');
}

function bindCodeTreeEvents() {
    document.getElementById('code-editor-tree')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-ce-path]');
        if (!btn) return;
        openCodeFile(btn.dataset.cePath);
    });
}

async function openCodeFile(path) {
    if (!path) return;
    if (CodeEditorState.content !== CodeEditorState.savedContent && CodeEditorState.currentPath) {
        if (!confirm('File đang sửa chưa lưu. Bỏ qua thay đổi?')) return;
    }
    try {
        const data = await codeApi('/admin/code/file?path=' + encodeURIComponent(path));
        CodeEditorState.currentPath = data.path;
        CodeEditorState.content = data.content;
        CodeEditorState.savedContent = data.content;
        const ta = document.getElementById('code-editor-textarea');
        if (ta) ta.value = data.content;
        const label = document.getElementById('code-editor-file-label');
        if (label) label.textContent = data.path + ' (' + formatFileSize(data.size) + ')';
        document.querySelectorAll('.code-tree-item').forEach(el => {
            el.classList.toggle('active', el.dataset.cePath === data.path);
        });
        updateDirtyIndicator();
    } catch (e) {
        toast(e.message, true);
    }
}

function updateDirtyIndicator() {
    const el = document.getElementById('code-editor-dirty');
    if (!el) return;
    const dirty = CodeEditorState.content !== CodeEditorState.savedContent;
    el.textContent = dirty ? '● Chưa lưu' : '';
    el.classList.toggle('hidden', !dirty);
}

async function saveCurrentFile() {
    if (!CodeEditorState.currentPath) {
        toast('Chọn file để lưu.', true);
        return;
    }
    const ta = document.getElementById('code-editor-textarea');
    const content = ta?.value ?? CodeEditorState.content;
    try {
        await codeApi('/admin/code/file', {
            method: 'PUT',
            body: JSON.stringify({ path: CodeEditorState.currentPath, content }),
        });
        CodeEditorState.content = content;
        CodeEditorState.savedContent = content;
        updateDirtyIndicator();
        toast('Đã lưu ' + CodeEditorState.currentPath);
    } catch (e) {
        toast(e.message, true);
    }
}

async function refreshCodeTree() {
    try {
        const { tree } = await codeApi('/admin/code/tree');
        CodeEditorState.tree = tree;
        const el = document.getElementById('code-editor-tree');
        if (el) el.innerHTML = renderCodeTree(tree);
    } catch (e) {
        toast(e.message, true);
    }
}

function appendCodeAiMessage(role, text, edits = null) {
    const box = document.getElementById('code-ai-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'code-ai-msg ' + role;
    let html = escapeHtml(text).replace(/\n/g, '<br>');
    if (edits?.length) {
        html += `<div class="code-ai-edits"><strong>${edits.length} file AI đề xuất sửa:</strong><ul>` +
            edits.map(ed => `<li>${escapeHtml(ed.path)}</li>`).join('') + '</ul></div>';
    }
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

async function sendCodeAiMessage(text) {
    const msg = (text || '').trim();
    if (!msg || CodeEditorState.sending) return;
    const input = document.getElementById('code-ai-input');
    CodeEditorState.sending = true;
    if (input) { input.disabled = true; input.value = ''; }

    appendCodeAiMessage('user', msg);
    CodeEditorState.aiHistory.push({ role: 'user', content: msg });

    const ta = document.getElementById('code-editor-textarea');
    const openContent = ta?.value ?? CodeEditorState.content;
    const contextPaths = CodeEditorState.currentPath ? [CodeEditorState.currentPath] : [];

    try {
        const result = await codeApi('/admin/code/ai/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: msg,
                history: CodeEditorState.aiHistory.slice(-10),
                openFile: CodeEditorState.currentPath,
                openContent,
                contextPaths,
                codeEditorToken: CodeEditorState.token,
            }),
        });
        const reply = result.message || 'Xong.';
        CodeEditorState.aiHistory.push({ role: 'assistant', content: reply });
        CodeEditorState.pendingEdits = result.edits || [];
        appendCodeAiMessage('assistant', reply, CodeEditorState.pendingEdits);

        const applyBtn = document.getElementById('code-ai-apply');
        if (applyBtn) {
            applyBtn.classList.toggle('hidden', !CodeEditorState.pendingEdits.length);
            applyBtn.textContent = `Áp dụng ${CodeEditorState.pendingEdits.length} thay đổi`;
        }
    } catch (e) {
        appendCodeAiMessage('assistant', 'Lỗi: ' + e.message);
    }

    if (input) { input.disabled = false; input.focus(); }
    CodeEditorState.sending = false;
}

async function applyCodeAiEdits() {
    if (!CodeEditorState.pendingEdits.length) return;
    if (!confirm(`Áp dụng ${CodeEditorState.pendingEdits.length} thay đổi từ AI lên server?`)) return;
    try {
        await codeApi('/admin/code/apply', {
            method: 'POST',
            body: JSON.stringify({
                edits: CodeEditorState.pendingEdits,
                codeEditorToken: CodeEditorState.token,
            }),
        });
        const applied = CodeEditorState.pendingEdits.slice();
        const cur = CodeEditorState.currentPath;
        toast('AI đã áp dụng thay đổi!');
        CodeEditorState.pendingEdits = [];
        document.getElementById('code-ai-apply')?.classList.add('hidden');
        await refreshCodeTree();
        if (cur && applied.some(e => e.path === cur)) {
            await openCodeFile(cur);
        }
    } catch (e) {
        toast(e.message, true);
    }
}

async function unlockCodeEditor(password) {
    try {
        const data = await codeApi('/admin/code/unlock', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });
        CodeEditorState.token = data.token;
        CodeEditorState.unlocked = true;
        localStorage.setItem('code_editor_token', data.token);
        toast('Đã mở khóa Quản lý code!');
        renderCodeEditorWorkspace();
        await refreshCodeTree();
    } catch (e) {
        toast(e.message, true);
    }
}

function renderCodeEditorGate(model) {
    const el = document.getElementById('admin-code');
    if (!el) return;
    el.innerHTML = `
        <div class="code-editor-gate glass-card p-8">
            <div class="gate-icon"><i class="fas fa-code"></i></div>
            <h2 class="text-xl font-bold gradient-text mb-2">Quản lý Code & AI chỉnh Web</h2>
            <p class="text-sm text-slate-500 mb-6">
                Khu vực riêng admin — xem toàn bộ mã nguồn web và dùng AI mạnh để tự chỉnh sửa.
                <br>Nhập mật khẩu quản lý code để truy cập.
            </p>
            <div class="input-wrap mb-4">
                <i class="fas fa-lock input-icon"></i>
                <input type="password" id="code-editor-password" placeholder="Mật khẩu quản lý code"
                       class="input-modern text-sm text-center" style="padding-left:2.75rem" autocomplete="off">
            </div>
            <button type="button" id="code-editor-unlock-btn" class="btn-primary px-6 py-2.5 text-sm w-full">
                <i class="fas fa-unlock mr-1"></i>Mở khóa
            </button>
            ${model ? `<p class="text-xs text-slate-400 mt-4">AI model: ${escapeHtml(model)}</p>` : ''}
        </div>`;
    document.getElementById('code-editor-unlock-btn')?.addEventListener('click', () => {
        const pw = document.getElementById('code-editor-password')?.value || '';
        unlockCodeEditor(pw);
    });
    document.getElementById('code-editor-password')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') unlockCodeEditor(e.target.value);
    });
}

function renderCodeEditorWorkspace() {
    const el = document.getElementById('admin-code');
    if (!el) return;
    el.innerHTML = `
        <div class="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
                <h2 class="text-lg font-bold gradient-text"><i class="fas fa-code-branch mr-1"></i>Quản lý Code Web</h2>
                <p class="text-sm text-slate-500">Toàn bộ mã nguồn — chỉnh tay hoặc nhờ AI sửa giúp.</p>
            </div>
            <button type="button" id="code-editor-lock-btn" class="btn-ghost px-3 py-2 text-sm">
                <i class="fas fa-lock mr-1"></i>Khóa lại
            </button>
        </div>
        <div class="code-editor-workspace">
            <aside class="code-editor-sidebar">
                <div class="code-editor-sidebar-header">
                    <span>Files</span>
                    <button type="button" id="code-tree-refresh" class="text-sky-400 hover:text-sky-300" title="Làm mới">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div id="code-editor-tree" class="code-editor-tree pretty-scrollbar"></div>
            </aside>
            <section class="code-editor-main">
                <div class="code-editor-toolbar">
                    <span id="code-editor-file-label" class="code-editor-file-label">Chọn file bên trái</span>
                    <span id="code-editor-dirty" class="code-editor-dirty hidden"></span>
                    <button type="button" id="code-editor-save" class="ce-btn ce-btn-success">
                        <i class="fas fa-save"></i> Lưu
                    </button>
                    <button type="button" id="code-editor-reload" class="ce-btn ce-btn-ghost">
                        <i class="fas fa-redo"></i>
                    </button>
                </div>
                <textarea id="code-editor-textarea" class="code-editor-textarea pretty-scrollbar"
                          placeholder="Chọn file để xem và chỉnh sửa mã nguồn..." spellcheck="false"></textarea>
            </section>
            <aside class="code-editor-ai-panel">
                <div class="code-ai-header">
                    <i class="fas fa-robot text-sky-400"></i> AI Dev Assistant
                    <span id="code-ai-model" class="code-ai-model-badge">${escapeHtml(CodeEditorState.model || 'AI')}</span>
                </div>
                <div id="code-ai-messages" class="code-ai-messages pretty-scrollbar">
                    <div class="code-ai-msg assistant">
                        Xin chào Admin! Mô tả thay đổi bạn muốn — AI sẽ đọc code và đề xuất/sửa file.
                        <br><br>Ví dụ: "Đổi màu navbar sang xanh đậm", "Thêm nút X vào trang MXH"...
                    </div>
                </div>
                <div class="code-ai-quick">
                    <button type="button" data-ce-quick="Liệt kê cấu trúc file chính của web">Cấu trúc web</button>
                    <button type="button" data-ce-quick="Giải thích file đang mở đang làm gì">Giải thích file</button>
                    <button type="button" data-ce-quick="Tối ưu CSS responsive cho mobile">Responsive</button>
                </div>
                <div class="code-ai-form">
                    <textarea id="code-ai-input" placeholder="Nhờ AI chỉnh web... (Enter gửi, Shift+Enter xuống dòng)" rows="3"></textarea>
                    <div class="flex gap-2">
                        <button type="button" id="code-ai-send" class="ce-btn ce-btn-primary flex-1 justify-center">
                            <i class="fas fa-paper-plane"></i> Gửi AI
                        </button>
                        <button type="button" id="code-ai-apply" class="ce-btn ce-btn-success hidden">
                            Áp dụng
                        </button>
                    </div>
                </div>
            </aside>
        </div>`;

    bindCodeTreeEvents();
    document.getElementById('code-editor-save')?.addEventListener('click', saveCurrentFile);
    document.getElementById('code-tree-refresh')?.addEventListener('click', refreshCodeTree);
    document.getElementById('code-editor-reload')?.addEventListener('click', () => {
        if (CodeEditorState.currentPath) openCodeFile(CodeEditorState.currentPath);
    });
    document.getElementById('code-editor-lock-btn')?.addEventListener('click', () => {
        CodeEditorState.unlocked = false;
        CodeEditorState.token = '';
        localStorage.removeItem('code_editor_token');
        loadAdminCodeEditor();
    });
    document.getElementById('code-ai-send')?.addEventListener('click', () => {
        sendCodeAiMessage(document.getElementById('code-ai-input')?.value);
    });
    document.getElementById('code-ai-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCodeAiMessage(e.target.value);
        }
    });
    document.getElementById('code-ai-apply')?.addEventListener('click', applyCodeAiEdits);
    document.querySelectorAll('[data-ce-quick]').forEach(btn => {
        btn.addEventListener('click', () => sendCodeAiMessage(btn.dataset.ceQuick));
    });
    document.getElementById('code-editor-textarea')?.addEventListener('input', e => {
        CodeEditorState.content = e.target.value;
        updateDirtyIndicator();
    });

    if (CodeEditorState.tree.length) {
        document.getElementById('code-editor-tree').innerHTML = renderCodeTree(CodeEditorState.tree);
    }
}

async function loadAdminCodeEditor() {
    const el = document.getElementById('admin-code');
    if (!el) return;
    try {
        const status = await codeApi('/admin/code/status');
        CodeEditorState.model = status.aiModel || '';
        CodeEditorState.unlocked = status.unlocked;
        if (!status.unlocked) {
            renderCodeEditorGate(status.aiModel);
            return;
        }
        renderCodeEditorWorkspace();
        await refreshCodeTree();
    } catch (e) {
        if (CodeEditorState.token) {
            CodeEditorState.token = '';
            localStorage.removeItem('code_editor_token');
        }
        try {
            const res = await fetch(API + '/admin/code/status', {
                headers: { Authorization: 'Bearer ' + (getToken?.() || '') },
            });
            const st = await res.json();
            renderCodeEditorGate(st.aiModel || '');
        } catch {
            el.innerHTML = `<div class="text-red-500 text-sm p-4">${escapeHtml(e.message)}</div>`;
        }
    }
}