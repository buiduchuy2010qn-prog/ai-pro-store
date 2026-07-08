"""Admin Code Editor — đọc/ghi codebase + AI chỉnh sửa web."""
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt

from config import AI, CODE_EDITOR, JWT_SECRET, SITE_NAME

BASE = Path(__file__).resolve().parent.parent

ALLOWED_EXTENSIONS = {
    '.py', '.js', '.css', '.html', '.json', '.yaml', '.yml', '.txt', '.md', '.sql', '.example',
}
ALLOWED_ROOT_FILES = {
    'server.py', 'database.py', 'config.py', 'requirements.txt', 'render.yaml', '.env.example',
}
SKIP_DIRS = {
    '__pycache__', '.git', 'node_modules', 'data', '.venv', 'venv', 'dist', 'build',
}
SKIP_FILE_PATTERNS = [
    re.compile(r'\.env$', re.I),
    re.compile(r'\.db$', re.I),
    re.compile(r'\.pyc$', re.I),
    re.compile(r'\.pem$', re.I),
    re.compile(r'\.key$', re.I),
]

_rate = {}

SYSTEM_PROMPT = f"""Bạn là AI Dev Assistant mạnh — trợ lý lập trình viên cho website "{SITE_NAME}".
Bạn có khả năng đọc và chỉnh sửa toàn bộ mã nguồn web (Flask backend + frontend public/).

Nhiệm vụ:
- Hiểu yêu cầu admin và đề xuất/sửa code chính xác.
- Giữ style code hiện có, không refactor lan man.
- Trả lời tiếng Việt, ngắn gọn, chuyên nghiệp.

Stack dự án:
- Backend: Flask (server.py), SQLite/PostgreSQL (database.py), services/
- Frontend: public/index.html, public/*.js, public/*.css
- Deploy: Render

Quy tắc BẮT BUỘC khi cần sửa file:
1. Giải thích ngắn gọn trong trường "message".
2. Đưa các thay đổi vào mảng "edits" — mỗi phần tử:
   {{"path": "đường/dẫn/tương/đối", "action": "write", "content": "TOÀN BỘ nội dung file sau khi sửa"}}
3. path phải là đường dẫn tương đối từ thư mục gốc dự án (vd: public/index.html, server.py).
4. KHÔNG sửa .env, data/*.db, __pycache__, secrets.
5. Nếu chỉ tư vấn không cần sửa file, để "edits": [].

Định dạng trả lời — CHỈ một khối JSON hợp lệ, không markdown bọc ngoài:
{{"message": "...", "edits": [...]}}

Ví dụ:
{{"message": "Đã đổi màu nút chính sang xanh.", "edits": [{{"path": "public/theme.css", "action": "write", "content": "..."}}]}}"""


def _check_rate(ip):
    now = time.time()
    window = 3600
    limit = CODE_EDITOR['rate_limit']
    hits = [t for t in _rate.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        return False
    hits.append(now)
    _rate[ip] = hits
    return True


def _is_skipped(rel: str, name: str) -> bool:
    if name.startswith('.'):
        if name not in ('.env.example',):
            return True
    for pat in SKIP_FILE_PATTERNS:
        if pat.search(name) or pat.search(rel):
            return True
    return False


def normalize_path(rel_path: str) -> str:
    if not rel_path or not str(rel_path).strip():
        raise ValueError('Đường dẫn trống.')
    raw = str(rel_path).strip().replace('\\', '/')
    if raw.startswith('/'):
        raw = raw[1:]
    parts = []
    for p in raw.split('/'):
        if not p or p == '.':
            continue
        if p == '..':
            raise ValueError('Đường dẫn không hợp lệ.')
        parts.append(p)
    norm = '/'.join(parts)
    if not norm:
        raise ValueError('Đường dẫn không hợp lệ.')
    return norm


def resolve_safe_path(rel_path: str) -> Path:
    norm = normalize_path(rel_path)
    full = (BASE / norm).resolve()
    try:
        full.relative_to(BASE.resolve())
    except ValueError:
        raise ValueError('Truy cập file bị từ chối.')
    if _is_skipped(norm, full.name):
        raise ValueError('File này không được phép truy cập.')
    if full.is_dir():
        raise ValueError('Không thể thao tác thư mục.')
    if full.name in ALLOWED_ROOT_FILES:
        return full
    if full.suffix.lower() not in ALLOWED_EXTENSIONS and full.suffix:
        raise ValueError('Loại file không được phép.')
    parent_parts = Path(norm).parts
    if not parent_parts:
        raise ValueError('Đường dẫn không hợp lệ.')
    top = parent_parts[0]
    if top == 'public' or top == 'services':
        return full
    if len(parent_parts) == 1 and full.name in ALLOWED_ROOT_FILES:
        return full
    raise ValueError('Chỉ được sửa file trong public/, services/ hoặc file gốc được phép.')


def create_unlock_token(uid: int) -> str:
    payload = {
        'type': 'code_editor_unlock',
        'userId': int(uid),
        'exp': int(time.time()) + CODE_EDITOR['unlock_ttl_sec'],
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verify_unlock_token(token: str, uid: int) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        return payload.get('type') == 'code_editor_unlock' and int(payload.get('userId', 0)) == int(uid)
    except Exception:
        return False


def unlock(password: str, uid: int) -> str:
    expected = CODE_EDITOR['password']
    if not secrets.compare_digest(str(password or ''), str(expected)):
        raise ValueError('Mật khẩu quản lý code không đúng.')
    return create_unlock_token(uid)


def _walk_dir(directory: Path, prefix: str) -> list:
    items = []
    try:
        entries = sorted(directory.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
    except OSError:
        return items
    for entry in entries:
        rel = f'{prefix}/{entry.name}' if prefix else entry.name
        if entry.is_dir():
            if entry.name in SKIP_DIRS or entry.name.startswith('.'):
                continue
            items.append({'type': 'dir', 'path': rel, 'name': entry.name, 'children': _walk_dir(entry, rel)})
        else:
            if _is_skipped(rel, entry.name):
                continue
            try:
                if entry.name not in ALLOWED_ROOT_FILES:
                    if entry.suffix.lower() not in ALLOWED_EXTENSIONS and entry.suffix:
                        continue
                    top = rel.split('/')[0]
                    if top not in ('public', 'services') and entry.name not in ALLOWED_ROOT_FILES:
                        continue
            except Exception:
                continue
            try:
                size = entry.stat().st_size
            except OSError:
                size = 0
            items.append({'type': 'file', 'path': rel, 'name': entry.name, 'size': size})
    return items


def list_tree() -> list:
    root_items = []
    for name in sorted(ALLOWED_ROOT_FILES):
        p = BASE / name
        if p.is_file():
            try:
                size = p.stat().st_size
            except OSError:
                size = 0
            root_items.append({'type': 'file', 'path': name, 'name': name, 'size': size})
    for folder in ('public', 'services'):
        d = BASE / folder
        if d.is_dir():
            root_items.append({
                'type': 'dir', 'path': folder, 'name': folder,
                'children': _walk_dir(d, folder),
            })
    return root_items


def read_file(rel_path: str) -> dict:
    full = resolve_safe_path(rel_path)
    if not full.is_file():
        raise ValueError('File không tồn tại.')
    size = full.stat().st_size
    if size > CODE_EDITOR['max_file_bytes']:
        raise ValueError(f'File quá lớn ({size} bytes). Tối đa {CODE_EDITOR["max_file_bytes"]}.')
    content = full.read_text(encoding='utf-8')
    return {'path': normalize_path(rel_path), 'content': content, 'size': size}


def write_file(rel_path: str, content: str) -> dict:
    full = resolve_safe_path(rel_path)
    if content is None:
        raise ValueError('Nội dung trống.')
    encoded = content.encode('utf-8')
    if len(encoded) > CODE_EDITOR['max_file_bytes']:
        raise ValueError('Nội dung file quá lớn.')
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding='utf-8')
    return {'path': normalize_path(rel_path), 'size': len(encoded), 'ok': True}


def apply_edits(edits: list) -> list:
    results = []
    if not isinstance(edits, list):
        raise ValueError('edits phải là mảng.')
    for item in edits[:20]:
        if not isinstance(item, dict):
            continue
        path = item.get('path', '')
        action = (item.get('action') or 'write').lower()
        content = item.get('content', '')
        if action != 'write':
            raise ValueError(f'Hành động "{action}" không được hỗ trợ.')
        write_file(path, content)
        results.append({'path': normalize_path(path), 'ok': True})
    return results


def _collect_context(paths: list, open_file: str = '', open_content: str = '') -> str:
    chunks = []
    budget = CODE_EDITOR['max_ai_context_bytes']
    used = 0

    if open_file and open_content is not None:
        block = f"--- FILE ĐANG MỞ: {open_file} ---\n{open_content}\n"
        used += len(block.encode('utf-8'))
        chunks.append(block)

    for p in paths or []:
        if p == open_file:
            continue
        try:
            data = read_file(p)
            block = f"--- {data['path']} ---\n{data['content']}\n"
            blen = len(block.encode('utf-8'))
            if used + blen > budget:
                chunks.append(f"--- {p} --- (bỏ qua — vượt giới hạn context)\n")
                break
            used += blen
            chunks.append(block)
        except Exception as e:
            chunks.append(f"--- {p} --- (lỗi: {e})\n")
    return '\n'.join(chunks)


def _call_llm(messages):
    if not AI['api_key']:
        raise RuntimeError('Chưa cấu hình API key AI (XAI_API_KEY hoặc OPENAI_API_KEY).')
    payload = json.dumps({
        'model': CODE_EDITOR['ai_model'],
        'messages': messages,
        'temperature': 0.2,
        'max_tokens': 16000,
    }).encode('utf-8')
    req = urllib.request.Request(
        AI['api_url'],
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {AI['api_key']}",
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data['choices'][0]['message']['content'].strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'AI API lỗi {e.code}: {body[:300]}') from e
    except Exception as e:
        raise RuntimeError(f'Không kết nối được AI: {e}') from e


def _parse_ai_response(raw: str) -> dict:
    text = (raw or '').strip()
    if not text:
        return {'message': 'AI không trả lời.', 'edits': []}
    # Thử parse JSON thuần
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return {
                'message': str(obj.get('message', '')),
                'edits': obj.get('edits') if isinstance(obj.get('edits'), list) else [],
            }
    except json.JSONDecodeError:
        pass
    # Tìm khối JSON trong markdown hoặc text
    match = re.search(r'\{[\s\S]*"message"[\s\S]*\}', text)
    if match:
        try:
            obj = json.loads(match.group(0))
            if isinstance(obj, dict):
                return {
                    'message': str(obj.get('message', '')),
                    'edits': obj.get('edits') if isinstance(obj.get('edits'), list) else [],
                }
        except json.JSONDecodeError:
            pass
    return {'message': text, 'edits': []}


def ai_chat(message: str, history=None, open_file: str = '', open_content: str = '',
            context_paths=None, client_ip: str = '') -> dict:
    message = (message or '').strip()
    if not message:
        raise ValueError('Tin nhắn trống.')
    if len(message) > 4000:
        raise ValueError('Tin nhắn quá dài (tối đa 4000 ký tự).')
    if client_ip and not _check_rate(client_ip):
        raise PermissionError('Bạn gửi quá nhiều yêu cầu AI. Thử lại sau 1 giờ.')

    ctx_block = _collect_context(context_paths or [], open_file, open_content)
    file_list = []
    for item in list_tree():
        if item['type'] == 'file':
            file_list.append(item['path'])
        elif item.get('children'):
            def _flatten(nodes):
                for n in nodes:
                    if n['type'] == 'file':
                        file_list.append(n['path'])
                    elif n.get('children'):
                        _flatten(n['children'])
            _flatten(item['children'])

    system = (
        f"{SYSTEM_PROMPT}\n\n"
        f"--- DANH SÁCH FILE DỰ ÁN ---\n" + '\n'.join(file_list[:200]) + "\n\n"
        f"--- MÃ NGUỒN LIÊN QUAN ---\n{ctx_block}"
    )

    msgs = [{'role': 'system', 'content': system}]
    for item in (history or [])[-12:]:
        role = item.get('role')
        content = (item.get('content') or '').strip()
        if role in ('user', 'assistant') and content:
            msgs.append({'role': role, 'content': content[:3000]})
    msgs.append({'role': 'user', 'content': message})

    raw = _call_llm(msgs)
    parsed = _parse_ai_response(raw)
    edits = parsed.get('edits') or []
    safe_edits = []
    for ed in edits:
        if not isinstance(ed, dict):
            continue
        try:
            resolve_safe_path(ed.get('path', ''))
            safe_edits.append({
                'path': normalize_path(ed['path']),
                'action': 'write',
                'content': ed.get('content', ''),
                'preview': (ed.get('content') or '')[:500],
            })
        except Exception:
            continue
    return {
        'message': parsed.get('message') or raw,
        'edits': safe_edits,
        'model': CODE_EDITOR['ai_model'],
        'raw': raw[:2000] if len(raw) > 2000 else None,
    }


def status() -> dict:
    return {
        'aiModel': CODE_EDITOR['ai_model'],
        'hasApiKey': bool(AI['api_key']),
        'maxFileBytes': CODE_EDITOR['max_file_bytes'],
        'unlockTtlSec': CODE_EDITOR['unlock_ttl_sec'],
    }