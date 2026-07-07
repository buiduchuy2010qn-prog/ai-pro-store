"""AI customer support — xAI/OpenAI API hoặc FAQ fallback."""
import json
import re
import time
import urllib.error
import urllib.request

import database as db
from config import AI, SITE_NAME, ZALO_PHONE, BANK

_rate = {}
FAQ_ANSWERS = [
    (r'nạp|nap|tiền|tien|qr|chuyển khoản|chuyen khoan', (
        f'Để nạp tiền: vào **Ví tiền** → nhập số tiền → quét QR VietQR.\n'
        f'Ngân hàng: {BANK["name"]}, STK: {BANK["account"]}.\n'
        f'Mỗi tài khoản có mã nội dung chuyển khoản riêng (NAP...). '
        f'Sau khi chuyển, tiền sẽ được cộng sau khi hệ thống/admin xác nhận.'
    )),
    (r'mua|sản phẩm|san pham|đặt hàng|dat hang', (
        'Chọn sản phẩm trên trang chủ → bấm **Mua ngay**. '
        'Cần đủ số dư trong ví. Xem đơn tại **Đơn hàng**, mã đơn dạng DH000001.'
    )),
    (r'quên mật khẩu|quen mat khau|otp|đổi mật khẩu|doi mat khau', (
        'Ở màn đăng nhập → **Quên mật khẩu** → nhập email → nhận OTP qua email → đặt mật khẩu mới.'
    )),
    (r'đăng ký|dang ky|tài khoản|tai khoan', (
        'Bấm **Đăng ký**, điền họ tên, email, mật khẩu. Email không được trùng với tài khoản đã có.'
    )),
    (r'zalo|liên hệ|lien he|hỗ trợ|ho tro|admin', (
        f'Liên hệ Zalo hỗ trợ: **{ZALO_PHONE}** hoặc bấm nút Zalo góc màn hình.'
    )),
    (r'số dư|so du|ví|vi|balance', (
        'Số dư hiển thị trên thanh menu sau khi đăng nhập. Vào **Ví tiền** để nạp thêm.'
    )),
]


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


def _products_context():
    try:
        conn = db.get_conn()
        rows = db.fetchall(conn, 'SELECT name, price, stock FROM products WHERE stock > 0 ORDER BY id LIMIT 12')
        db.close(conn)
        if not rows:
            return 'Chưa có sản phẩm.'
        lines = [f"- {r['name']}: {int(r['price']):,}đ (còn {r['stock']})".replace(',', '.') for r in rows]
        return '\n'.join(lines)
    except Exception:
        return ''


def _system_prompt(user_ctx=None):
    extra = ''
    if user_ctx:
        extra = (
            f"\nKhách đang đăng nhập: {user_ctx.get('fullName')} ({user_ctx.get('email')}). "
            f"Số dư: {user_ctx.get('balance', 0):,}đ. Mã nạp tiền: {user_ctx.get('topupCode', '')}."
        ).replace(',', '.')
    return f"""Bạn là trợ lý AI của {SITE_NAME} — shop bán tài khoản/dịch vụ AI.
Trả lời bằng tiếng Việt, ngắn gọn, thân thiện, dùng markdown nhẹ (**in đậm**).
Không bịa thông tin. Không tiết lộ mật khẩu admin hay API key.

Thông tin shop:
- Nạp tiền: QR VietQR, {BANK['name']} STK {BANK['account']}, mã NAP riêng từng user
- Mua hàng: cần số dư đủ, mã đơn DHxxxxxx
- Hỗ trợ Zalo: {ZALO_PHONE}
- Quên MK: OTP qua email

Sản phẩm hiện có:
{_products_context()}
{extra}

Nếu không chắc hoặc cần xử lý thủ công, hướng khách liên hệ Zalo {ZALO_PHONE}."""


def _faq_reply(message):
    text = message.lower()
    for pattern, answer in FAQ_ANSWERS:
        if re.search(pattern, text, re.I):
            return answer
    return (
        f'Mình là trợ lý {SITE_NAME}. Bạn có thể hỏi về **nạp tiền**, **mua hàng**, **đăng ký**, **quên mật khẩu**.\n'
        f'Cần hỗ trợ trực tiếp → Zalo **{ZALO_PHONE}**.'
    )


def _call_llm(messages):
    if not AI['api_key']:
        return None
    payload = json.dumps({
        'model': AI['model'],
        'messages': messages,
        'temperature': 0.4,
        'max_tokens': 600,
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
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data['choices'][0]['message']['content'].strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'AI API lỗi {e.code}: {body[:200]}') from e
    except Exception as e:
        raise RuntimeError(f'Không kết nối được AI: {e}') from e


def chat(message, history=None, user_ctx=None, client_ip=''):
    message = (message or '').strip()
    if not message:
        raise ValueError('Tin nhắn trống.')
    if len(message) > 1000:
        raise ValueError('Tin nhắn quá dài (tối đa 1000 ký tự).')
    if client_ip and not _check_rate(client_ip):
        raise PermissionError('Bạn gửi quá nhiều tin nhắn. Thử lại sau 1 giờ hoặc liên hệ Zalo.')

    mode = 'ai' if AI['api_key'] else 'faq'
    if mode == 'faq':
        return {'reply': _faq_reply(message), 'mode': 'faq'}

    msgs = [{'role': 'system', 'content': _system_prompt(user_ctx)}]
    for item in (history or [])[-8:]:
        role = item.get('role')
        content = (item.get('content') or '').strip()
        if role in ('user', 'assistant') and content:
            msgs.append({'role': role, 'content': content[:800]})
    msgs.append({'role': 'user', 'content': message})

    reply = _call_llm(msgs)
    return {'reply': reply or _faq_reply(message), 'mode': 'ai'}


def status():
    return {
        'enabled': True,
        'mode': 'ai' if AI['api_key'] else 'faq',
        'model': AI['model'] if AI['api_key'] else 'FAQ',
        'zalo': ZALO_PHONE,
    }