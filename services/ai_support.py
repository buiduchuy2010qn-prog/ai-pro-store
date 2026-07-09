"""AI Đức Hi Assistant — rule-based + LLM API qua backend."""
import json
import re
import time
import uuid
import urllib.error
import urllib.request

import database as db
from config import AI, SITE_NAME, WELCOME_MSG, ZALO_PHONE, BANK

_rate = {}

DEFAULT_QUICK_USER = [
    'Cách nạp tiền?', 'Mua hàng thế nào?', 'Xem đơn hàng ở đâu?',
    'Quên mật khẩu?', 'Xem số dư ví?', 'Liên hệ Zalo',
]
DEFAULT_QUICK_ADMIN = [
    'Xem dashboard admin', 'Quản lý tài khoản', 'Kiểm tra giao dịch',
    'Quản lý sản phẩm', 'Quản lý đơn hàng',
]

# Từ khóa gợi ý cũ cần loại (tính năng đã tắt)
_REMOVED_CHIP_RE = re.compile(
    r'thay\s*đồ|thay\s*do|phối\s*đồ|phoi\s*do|dressroom|outfit|nhân\s*vật|nhan\s*vat',
    re.I,
)

DEFAULT_GREETING = (
    'Xin chào! Mình là **AI Đức Hi Assistant** — trợ lý hỗ trợ khách hàng AI Pro Store.\n'
    'Mình giúp **mua hàng**, **nạp tiền**, **xem đơn hàng**, **số dư ví**, **quên mật khẩu**.\n'
    f'Cần người thật: **Zalo {ZALO_PHONE}**.'
)

SYSTEM_PROMPT = """Bạn là AI Đức Hi Assistant, trợ lý thông minh của website AI Pro Store / Shop của Đức Hi.

Nhiệm vụ của bạn:
- Hỗ trợ khách hàng mua tài khoản AI (ChatGPT, Gemini…), nạp tiền, xem đơn hàng, xem lịch sử giao dịch.
- Hỗ trợ đăng ký, đăng nhập, quên mật khẩu bằng OTP email.
- Hướng dẫn xem hồ sơ / lịch sử đăng nhập.
- Hỗ trợ admin nếu người dùng có role admin.
- Trả lời ngắn gọn, thân thiện, dễ hiểu bằng tiếng Việt.
- KHÔNG gợi ý "Phòng Thay Đồ" — tính năng này đã gỡ khỏi web bán hàng.

Thông tin cố định:
- Tên web: AI Pro Store / Shop của Đức Hi.
- Nạp tiền qua VietQR / Casso, chuyển đúng nội dung nạp riêng để tự cộng tiền.
- Hỗ trợ Zalo: 0944255413.

Quy tắc bảo mật:
- Không tiết lộ dữ liệu của user khác.
- Không tiết lộ thông tin admin cho user thường.
- Không tiết lộ API key, secret, token.
- Không tự xác nhận đã nhận tiền nếu backend chưa báo giao dịch success.
- Nếu user hỏi vấn đề cần người thật hỗ trợ, hướng dẫn liên hệ Zalo 0944255413.
- Không tạo nội dung người lớn, phản cảm hoặc không phù hợp."""


def _check_rate(ip):
    now = time.time()
    window = 3600
    limit = AI['rate_limit']
    hits = [t for t in _rate.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        return False
    hits.append(now)
    _rate[ip] = hits
    return True


def _clean_quick_chips(items, fallback):
    """Loại chip gợi ý liên quan Phòng Thay Đồ / phối đồ (đã tắt)."""
    if not isinstance(items, list):
        return list(fallback)
    cleaned = [str(x).strip() for x in items if str(x).strip() and not _REMOVED_CHIP_RE.search(str(x))]
    return cleaned or list(fallback)


def _clean_greeting(text):
    if not text:
        return DEFAULT_GREETING
    if _REMOVED_CHIP_RE.search(text) or re.search(r'Phòng\s*Thay\s*Đồ', text, re.I):
        return DEFAULT_GREETING
    return text


def get_settings():
    conn = db.get_conn()
    rows = db.fetchall(conn, 'SELECT key, value FROM ai_settings')
    db.close(conn)
    data = {r['key']: r['value'] for r in rows}
    try:
        quick_user = json.loads(data.get('quick_user') or '[]')
    except json.JSONDecodeError:
        quick_user = DEFAULT_QUICK_USER
    try:
        quick_admin = json.loads(data.get('quick_admin') or '[]')
    except json.JSONDecodeError:
        quick_admin = DEFAULT_QUICK_ADMIN
    quick_user = _clean_quick_chips(quick_user, DEFAULT_QUICK_USER)
    quick_admin = _clean_quick_chips(quick_admin, DEFAULT_QUICK_ADMIN)
    # Đồng bộ DB nếu còn chip cũ
    try:
        raw_u = data.get('quick_user') or ''
        raw_a = data.get('quick_admin') or ''
        if _REMOVED_CHIP_RE.search(raw_u) or _REMOVED_CHIP_RE.search(raw_a) or _REMOVED_CHIP_RE.search(data.get('greeting') or ''):
            update_settings({
                'quick_user': DEFAULT_QUICK_USER,
                'quick_admin': DEFAULT_QUICK_ADMIN,
                'greeting': DEFAULT_GREETING,
            })
    except Exception:
        pass
    mode_setting = data.get('mode', 'auto')
    has_key = bool(AI['api_key'])
    if mode_setting == 'rule':
        mode = 'rule'
    elif mode_setting == 'ai':
        mode = 'ai' if has_key else 'rule'
    else:
        mode = 'ai' if has_key else 'rule'
    return {
        'enabled': data.get('enabled', '1') == '1',
        'mode': mode,
        'modeSetting': mode_setting,
        'greeting': _clean_greeting(data.get('greeting', '')),
        'quickUser': quick_user or DEFAULT_QUICK_USER,
        'quickAdmin': quick_admin or DEFAULT_QUICK_ADMIN,
        'model': AI['model'] if has_key else 'Rule-based',
        'zalo': ZALO_PHONE,
        'name': 'AI Đức Hi Assistant',
    }


def update_settings(updates):
    allowed = {'enabled', 'mode', 'greeting', 'quick_user', 'quick_admin'}
    conn = db.get_conn()
    for key, val in updates.items():
        if key not in allowed:
            continue
        if key in ('quick_user', 'quick_admin') and isinstance(val, list):
            val = json.dumps(val, ensure_ascii=False)
        existing = db.fetchone(conn, 'SELECT key FROM ai_settings WHERE key = ?', (key,))
        if existing:
            db.execute(conn, 'UPDATE ai_settings SET value = ? WHERE key = ?', (str(val), key))
        else:
            db.execute(conn, 'INSERT INTO ai_settings (key, value) VALUES (?, ?)', (key, str(val)))
    db.commit(conn)
    db.close(conn)
    return get_settings()


def _fmt_money(n):
    return f"{int(n or 0):,}đ".replace(',', '.')


def _products_context():
    try:
        conn = db.get_conn()
        rows = db.fetchall(conn, 'SELECT name, price, stock, description FROM products WHERE stock > 0 ORDER BY id LIMIT 15')
        db.close(conn)
        if not rows:
            return 'Chưa có sản phẩm.'
        lines = []
        for r in rows:
            desc = (r.get('description') or '')[:60]
            lines.append(f"- {r['name']}: {_fmt_money(r['price'])} (còn {r['stock']}) — {desc}")
        return '\n'.join(lines)
    except Exception:
        return ''


def _user_orders(user_id, limit=5):
    try:
        conn = db.get_conn()
        rows = db.fetchall(conn, '''
            SELECT order_code, product_name, price, status, created_at
            FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?
        ''', (user_id, limit))
        db.close(conn)
        return rows
    except Exception:
        return []


def _user_transactions(user_id, limit=5):
    try:
        conn = db.get_conn()
        rows = db.fetchall(conn, '''
            SELECT type, amount, description, status, created_at
            FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?
        ''', (user_id, limit))
        db.close(conn)
        return rows
    except Exception:
        return []


def _admin_summary():
    try:
        conn = db.get_conn()
        users = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM users')['c']
        orders = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM orders')['c']
        pending = db.fetchone(conn, "SELECT COUNT(*) AS c FROM topup_requests WHERE status = 'pending'")['c']
        revenue = db.fetchone(conn, "SELECT COALESCE(SUM(price),0) AS s FROM orders WHERE status = 'completed'")['s']
        db.close(conn)
        return {
            'totalUsers': users,
            'totalOrders': orders,
            'pendingTopups': pending,
            'revenue': int(revenue or 0),
        }
    except Exception:
        return {}


def build_context(user_ctx=None, page=None):
    ctx = {
        'siteName': SITE_NAME,
        'welcome': WELCOME_MSG,
        'bankName': BANK['name'],
        'bankAccount': BANK['account'],
        'zalo': ZALO_PHONE,
        'page': page or 'products',
        'products': _products_context(),
    }
    if not user_ctx:
        ctx['loggedIn'] = False
        return ctx
    ctx['loggedIn'] = True
    ctx['user'] = {
        'id': user_ctx.get('id'),
        'fullName': user_ctx.get('fullName'),
        'email': user_ctx.get('email'),
        'role': user_ctx.get('role'),
        'balance': user_ctx.get('balance', 0),
        'topupCode': user_ctx.get('topupCode', ''),
    }
    uid = user_ctx.get('id')
    if uid:
        orders = _user_orders(uid)
        ctx['recentOrders'] = [
            f"{o.get('order_code') or 'DH?'} — {o['product_name']} ({_fmt_money(o['price'])}) [{o['status']}]"
            for o in orders
        ]
        txs = _user_transactions(uid)
        ctx['recentTransactions'] = [
            f"{t['description']} {_fmt_money(t['amount'])} [{t['status']}]"
            for t in txs
        ]
    if user_ctx.get('role') == 'admin':
        ctx['adminSummary'] = _admin_summary()
    return ctx


def _context_block(ctx):
    lines = [
        f"Trang hiện tại: {ctx.get('page', 'products')}",
        f"Sản phẩm:\n{ctx.get('products', '')}",
    ]
    if not ctx.get('loggedIn'):
        lines.append('Khách chưa đăng nhập — không có số dư/đơn hàng cá nhân.')
        return '\n'.join(lines)
    u = ctx['user']
    lines.append(
        f"User: {u['fullName']} ({u['email']}), role={u['role']}, "
        f"số dư={_fmt_money(u['balance'])}, mã nạp={u['topupCode']}"
    )
    if ctx.get('recentOrders'):
        lines.append('Đơn hàng gần đây:\n' + '\n'.join(f"  • {o}" for o in ctx['recentOrders']))
    if ctx.get('recentTransactions'):
        lines.append('Giao dịch gần đây:\n' + '\n'.join(f"  • {t}" for t in ctx['recentTransactions']))
    if ctx.get('adminSummary'):
        s = ctx['adminSummary']
        lines.append(
            f"Admin dashboard: {s.get('totalUsers', 0)} users, {s.get('totalOrders', 0)} đơn, "
            f"{s.get('pendingTopups', 0)} nạp chờ, doanh thu {_fmt_money(s.get('revenue', 0))}"
        )
    return '\n'.join(lines)


def _system_prompt(ctx):
    return f"{SYSTEM_PROMPT}\n\n--- Dữ liệu phiên hiện tại ---\n{_context_block(ctx)}"


INTENTS = [
    ('topup', r'nạp|nap|tiền|tien|qr|chuyển khoản|chuyen khoan|vietqr|mb bank|0394709137'),
    ('buy', r'mua|sản phẩm|san pham|đặt hàng|dat hang|mua hàng|mua hang|thanh toán'),
    ('balance', r'số dư|so du|ví|vi|balance|tiền trong ví|con bao nhieu'),
    ('orders', r'đơn hàng|don hang|order|dh\d|mã đơn|ma don|đã mua|da mua'),
    ('transactions', r'lịch sử|lich su|giao dịch|giao dich|transaction'),
    ('forgot', r'quên mật khẩu|quen mat khau|otp|đổi mật khẩu|doi mat khau|reset'),
    ('register', r'đăng ký|dang ky|tạo tài khoản|tao tai khoan'),
    ('login', r'đăng nhập|dang nhap'),
    ('dressroom', r'phòng thay đồ|phong thay do|phối đồ|phoi do|outfit|nhân vật|nhan vat|dressroom'),
    ('zalo', r'zalo|liên hệ|lien he|hotline|người thật|nguoi that|admin hỗ trợ'),
    ('admin', r'dashboard admin|quản trị|quan tri|admin panel|quản lý user|quan ly user|kiểm tra giao dịch admin'),
    ('products', r'gợi ý|goi y|nên mua|nen mua|recommend|tư vấn sản phẩm'),
    ('profile', r'hồ sơ|ho so|profile|lịch sử đăng nhập|thiết bị'),
]


def _detect_intent(text):
    t = text.lower()
    for name, pattern in INTENTS:
        if re.search(pattern, t, re.I):
            return name
    return 'general'


def _default_suggestions(user_ctx=None):
    settings = get_settings()
    if user_ctx and user_ctx.get('role') == 'admin':
        return settings['quickAdmin'][:6]
    return settings['quickUser'][:6]


def _actions_for_intent(intent, user_ctx=None):
    actions = []
    mapping = {
        'topup': [('Đi đến Ví tiền', 'wallet')],
        'buy': [('Mở Sản phẩm', 'products')],
        'balance': [('Xem Ví tiền', 'wallet')],
        'orders': [('Mở Đơn hàng', 'orders')],
        'transactions': [('Mở Lịch sử', 'transactions')],
        'dressroom': [('Mở Phòng Thay Đồ', 'dressroom')],
        'forgot': [('Quên mật khẩu', 'auth-forgot')],
        'register': [('Đăng ký', 'auth-register')],
        'login': [('Đăng nhập', 'auth-login')],
        'zalo': [('Liên hệ Zalo', 'zalo')],
        'admin': [('Mở Quản trị', 'admin')],
    }
    for label, view in mapping.get(intent, []):
        actions.append({'label': label, 'view': view})
    if intent in ('topup', 'buy', 'general', 'zalo'):
        actions.append({'label': 'Liên hệ Zalo', 'view': 'zalo'})
    return actions[:4]


def _rule_reply(message, ctx, intent):
    user = ctx.get('user')
    logged = ctx.get('loggedIn')
    zalo = ZALO_PHONE
    bank = BANK['account']
    bank_name = BANK['name']

    if intent == 'topup':
        extra = ''
        if logged and user:
            extra = f"\n\nMã nội dung CK riêng của bạn: **{user['topupCode']}**"
        return (
            f'**Cách nạp tiền:**\n'
            f'1. Vào mục **Ví tiền**\n'
            f'2. Nhập số tiền muốn nạp → bấm **Tạo QR**\n'
            f'3. Quét QR VietQR, chuyển đến **{bank_name}** STK **{bank}**\n'
            f'4. Ghi **đúng nội dung chuyển khoản** (mã NAP riêng) để hệ thống tự cộng tiền{extra}'
        )

    if intent == 'buy':
        bal = _fmt_money(user['balance']) if logged and user else '—'
        return (
            '**Cách mua hàng:**\n'
            '1. Vào **Sản phẩm**, chọn gói muốn mua\n'
            '2. Bấm **Mua ngay** → xác nhận\n'
            '3. Nếu số dư đủ, hệ thống trừ ví và tạo đơn (mã DHxxxxxx)\n'
            f'4. Xem đơn tại **Đơn hàng**\n\n'
            + (f'Số dư hiện tại: **{bal}**. Nếu không đủ, hãy nạp tiền trước nhé!' if logged else
               'Bạn cần **đăng nhập** và có đủ số dư trong ví để mua hàng.')
        )

    if intent == 'balance':
        if not logged:
            return 'Để xem số dư, bạn cần **đăng nhập** trước. Sau đó số dư hiển thị trên thanh menu và mục **Ví tiền**.'
        return f"Số dư ví của bạn: **{_fmt_money(user['balance'])}**. Vào **Ví tiền** để nạp thêm nếu cần."

    if intent == 'orders':
        if not logged:
            return 'Để xem đơn hàng, vui lòng **đăng nhập** rồi vào mục **Đơn hàng**.'
        orders = ctx.get('recentOrders') or []
        if not orders:
            return 'Bạn chưa có đơn hàng nào. Vào **Sản phẩm** để mua nhé!'
        body = '\n'.join(f"• {o}" for o in orders)
        return f"**Đơn hàng gần đây của bạn:**\n{body}\n\nXem chi tiết tại mục **Đơn hàng**."

    if intent == 'transactions':
        if not logged:
            return 'Để xem lịch sử giao dịch, hãy **đăng nhập** và mở mục **Lịch sử**.'
        txs = ctx.get('recentTransactions') or []
        if not txs:
            return 'Chưa có giao dịch. Nạp tiền hoặc mua hàng sẽ hiện tại **Lịch sử**.'
        body = '\n'.join(f"• {t}" for t in txs)
        return f"**Giao dịch gần đây:**\n{body}"

    if intent == 'forgot':
        return (
            '**Quên mật khẩu:**\n'
            '1. Ở màn đăng nhập → **Quên mật khẩu**\n'
            '2. Nhập email đã đăng ký → nhận **mã OTP 6 số** qua email\n'
            '3. Nhập OTP → đặt mật khẩu mới\n\n'
            '💡 Nếu không thấy email, kiểm tra hộp **Spam/Quảng cáo**.'
        )

    if intent == 'register':
        return (
            '**Đăng ký tài khoản:**\n'
            'Bấm **Đăng ký**, điền họ tên, email, mật khẩu (tối thiểu 6 ký tự).\n'
            'Email không được trùng với tài khoản đã có.'
        )

    if intent == 'login':
        return '**Đăng nhập:** Nhập email và mật khẩu tại màn hình đăng nhập. Quên MK? Dùng **Quên mật khẩu** + OTP email.'

    if intent == 'dressroom':
        t = message.lower()
        if re.search(r'phối|phoi|gợi|goi|đẹp|dep|nữ|nu|nam', t, re.I):
            if re.search(r'nam|boy|male', t, re.I):
                return (
                    '**Gợi ý phối đồ Nam anime:**\n'
                    '• Tóc đen layer + đồng phục học đường\n'
                    '• Thân athletic + áo uniform + giày sneaker trắng\n'
                    '• Nền school style + biểu cảm cool\n'
                    'Vào **Phòng Thay Đồ** → chọn Nam → tab Mẫu nhanh hoặc Đầu/Thân/Tay/Chân.'
                )
            return (
                '**Gợi ý phối đồ Nữ Nhật/anime:**\n'
                '• Tóc bạc dài + váy idol xanh trắng\n'
                '• Nền hoa anh đào (Sakura) + hiệu ứng sparkle\n'
                '• Phụ kiện kẹp tóc, mắt xanh, biểu cảm dễ thương\n'
                'Vào **Phòng Thay Đồ** → chọn Nữ → thử tab Tóc, Áo, Nền, Hiệu ứng.\n'
                'Bạn có thể **Lưu Outfit** và **Tải ảnh** nhân vật!'
            )
        return (
            '**Phòng Thay Đồ Nhân Vật:**\n'
            '• Chọn **Nữ/Nam** và phong cách (Kimono, Idol, Sakura...)\n'
            '• Tab **Đầu/Thân/Tay/Chân** hoặc **Mẫu nhanh**\n'
            '• Thay tóc, áo, quần, giày, phụ kiện, nền\n'
            '• **Lưu Outfit**, tải ảnh, upload ảnh nền/sticker\n'
            'Hỏi mình "Gợi ý phối đồ nữ Nhật" để được tư vấn nhé!'
        )

    if intent == 'zalo':
        return f'Liên hệ hỗ trợ trực tiếp qua **Zalo {zalo}** hoặc bấm nút Zalo góc màn hình.'

    if intent == 'admin':
        if not logged or not user or user.get('role') != 'admin':
            return f'Chức năng quản trị chỉ dành cho admin. Bạn cần hỗ trợ? Liên hệ Zalo **{zalo}**.'
        s = ctx.get('adminSummary') or {}
        return (
            '**Hướng dẫn Admin:**\n'
            f"• **Dashboard**: {s.get('totalUsers', 0)} users, {s.get('totalOrders', 0)} đơn, "
            f"{s.get('pendingTopups', 0)} nạp chờ duyệt\n"
            '• **Người dùng**: tìm, khóa/mở, đổi role, cộng trừ số dư\n'
            '• **Nạp tiền**: duyệt yêu cầu pending\n'
            '• **Sản phẩm / Phòng Thay Đồ**: thêm, sửa, bật/tắt vật phẩm\n'
            '• **Giao dịch / Bank TX**: kiểm tra lịch sử ngân hàng'
        )

    if intent == 'products':
        prods = ctx.get('products', '')
        return (
            f'**Sản phẩm đang bán:**\n{prods}\n\n'
            'Vào **Sản phẩm** để xem chi tiết và mua. Cần tư vấn thêm? Hỏi mình hoặc Zalo nhé!'
        )

    # general / fallback
    settings = get_settings()
    return settings.get('greeting') or (
        f'Mình là **AI Đức Hi Assistant** của {SITE_NAME}. '
        f'Hỏi mình về **nạp tiền**, **mua hàng**, **Phòng Thay Đồ**, **quên mật khẩu**.\n'
        f'Cần người thật → Zalo **{zalo}**.'
    )


def _call_llm(messages):
    if not AI['api_key']:
        return None
    payload = json.dumps({
        'model': AI['model'],
        'messages': messages,
        'temperature': 0.45,
        'max_tokens': 700,
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
        with urllib.request.urlopen(req, timeout=50) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data['choices'][0]['message']['content'].strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'AI API lỗi {e.code}: {body[:200]}') from e
    except Exception as e:
        raise RuntimeError(f'Không kết nối được AI: {e}') from e


def _ensure_conversation(conv_id, user_id, page):
    try:
        conn = db.get_conn()
        if not db.fetchone(conn, 'SELECT id FROM users WHERE id = ?', (user_id,)):
            db.close(conn)
            return False
        row = db.fetchone(conn, 'SELECT id FROM ai_conversations WHERE id = ?', (conv_id,))
        if not row:
            db.execute(conn, 'INSERT INTO ai_conversations (id, user_id, page) VALUES (?, ?, ?)',
                       (conv_id, user_id, page))
        else:
            db.execute(conn, 'UPDATE ai_conversations SET updated_at = ' + db.sql_now() + ', page = ? WHERE id = ?',
                       (page, conv_id))
        db.commit(conn)
        db.close(conn)
        return True
    except Exception:
        return False


def _save_message(conv_id, role, content):
    try:
        conn = db.get_conn()
        db.execute(conn, 'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
                   (conv_id, role, content[:4000]))
        db.commit(conn)
        db.close(conn)
    except Exception:
        pass


def _log_chat(user_id, message, intent):
    try:
        conn = db.get_conn()
        db.execute(conn, 'INSERT INTO ai_chat_logs (user_id, intent, message) VALUES (?, ?, ?)',
                   (user_id, intent, message[:500]))
        db.commit(conn)
        db.close(conn)
    except Exception:
        pass


def get_conversation_history(user_id, conv_id=None, limit=30):
    conn = db.get_conn()
    if conv_id:
        conv = db.fetchone(conn, 'SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?',
                           (conv_id, user_id))
        if not conv:
            db.close(conn)
            return [], None
        cid = conv_id
    else:
        row = db.fetchone(conn, '''
            SELECT id FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1
        ''', (user_id,))
        cid = row['id'] if row else None
    if not cid:
        db.close(conn)
        return [], None
    msgs = db.fetchall(conn, '''
        SELECT role, content, created_at FROM ai_messages
        WHERE conversation_id = ? ORDER BY id ASC LIMIT ?
    ''', (cid, limit))
    db.close(conn)
    return [{'role': m['role'], 'content': m['content']} for m in msgs], cid


def clear_conversation(user_id, conv_id=None):
    conn = db.get_conn()
    if conv_id:
        conv = db.fetchone(conn, 'SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?',
                           (conv_id, user_id))
        if conv:
            db.execute(conn, 'DELETE FROM ai_messages WHERE conversation_id = ?', (conv_id,))
            db.execute(conn, 'DELETE FROM ai_conversations WHERE id = ?', (conv_id,))
    else:
        convs = db.fetchall(conn, 'SELECT id FROM ai_conversations WHERE user_id = ?', (user_id,))
        for c in convs:
            db.execute(conn, 'DELETE FROM ai_messages WHERE conversation_id = ?', (c['id'],))
        db.execute(conn, 'DELETE FROM ai_conversations WHERE user_id = ?', (user_id,))
    db.commit(conn)
    db.close(conn)


def get_admin_stats():
    conn = db.get_conn()
    total = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM ai_chat_logs')['c']
    today_sql = "date(created_at) = date('now')" if not db.IS_PG else "created_at::date = CURRENT_DATE"
    today = db.fetchone(conn, f'SELECT COUNT(*) AS c FROM ai_chat_logs WHERE {today_sql}')['c']
    intents = db.fetchall(conn, '''
        SELECT intent, COUNT(*) AS c FROM ai_chat_logs
        WHERE intent IS NOT NULL GROUP BY intent ORDER BY c DESC LIMIT 10
    ''')
    db.close(conn)
    return {
        'totalChats': total,
        'todayChats': today,
        'topIntents': [{'intent': i['intent'], 'count': i['c']} for i in intents],
    }


def chat(message, history=None, user_ctx=None, client_ip='', page=None, conversation_id=None):
    settings = get_settings()
    if not settings['enabled']:
        raise PermissionError('Trợ lý AI đang tạm tắt. Liên hệ Zalo để được hỗ trợ.')

    message = (message or '').strip()
    if not message:
        raise ValueError('Tin nhắn trống.')
    if len(message) > 1000:
        raise ValueError('Tin nhắn quá dài (tối đa 1000 ký tự).')
    if client_ip and not _check_rate(client_ip):
        raise PermissionError('Bạn gửi quá nhiều tin nhắn. Thử lại sau 1 giờ hoặc liên hệ Zalo.')

    ctx = build_context(user_ctx, page)
    intent = _detect_intent(message)
    user_id = user_ctx.get('id') if user_ctx else None

    conv_id = conversation_id
    persist = False
    if user_id:
        if not conv_id:
            conv_id = str(uuid.uuid4())
        persist = _ensure_conversation(conv_id, user_id, page)
        if persist:
            _save_message(conv_id, 'user', message)
        elif conv_id and not conversation_id:
            conv_id = None

    _log_chat(user_id, message, intent)

    mode = settings['mode']
    suggestions = _default_suggestions(user_ctx)
    actions = _actions_for_intent(intent, user_ctx)

    reply = None
    if mode == 'ai':
        try:
            msgs = [{'role': 'system', 'content': _system_prompt(ctx)}]
            for item in (history or [])[-10:]:
                role = item.get('role')
                content = (item.get('content') or '').strip()
                if role in ('user', 'assistant') and content:
                    msgs.append({'role': role, 'content': content[:800]})
            msgs.append({'role': 'user', 'content': message})
            reply = _call_llm(msgs)
        except RuntimeError:
            reply = None

    if not reply:
        reply = _rule_reply(message, ctx, intent)
        mode = 'rule' if mode == 'rule' else 'rule-fallback'

    if persist and conv_id:
        _save_message(conv_id, 'assistant', reply)

    return {
        'reply': reply,
        'suggestions': suggestions,
        'actions': actions,
        'conversationId': conv_id,
        'mode': mode,
        'intent': intent,
    }


def status():
    s = get_settings()
    return {
        'enabled': s['enabled'],
        'mode': s['mode'],
        'modeSetting': s['modeSetting'],
        'model': s['model'],
        'greeting': s['greeting'],
        'quickUser': s['quickUser'],
        'quickAdmin': s['quickAdmin'],
        'zalo': ZALO_PHONE,
        'name': 'AI Đức Hi Assistant',
    }