"""Shop của Đức Hi - Production Server"""
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import bcrypt
import jwt
from flask import Flask, request, jsonify, send_from_directory, redirect

import database as db
from config import (
    JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, BANK, WEBHOOK_SECRET, CASSO,
    ZALO_PHONE, SITE_NAME, WELCOME_MSG, OTP_EXPIRE_MINUTES,
    OTP_MAX_ATTEMPTS, OTP_RATE_LIMIT_PER_HOUR, PORT, SECURITY, GOOGLE_DRIVE
)
from services import security as sec
from services.email_service import send_otp_email
from services.bank_service import (
    gen_topup_code, build_qr, bank_loop, ingest_webhook, ingest_casso_webhook,
    process_bank_tx, check_bank
)
from services import avatar_service as av
from services import decoration_service as deco
from services import drive_service as drive
BASE = Path(__file__).parent
PUBLIC = BASE / 'public'
VN_TZ = timezone(timedelta(hours=7))


def format_dt_vn(val):
    """Chuyển timestamp DB (UTC) sang chuỗi giờ Việt Nam."""
    if val is None or val == '':
        return ''
    s = str(val).strip()
    try:
        clean = s.replace('Z', '').split('.')[0].replace(' ', 'T')
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(VN_TZ).strftime('%d/%m/%Y %H:%M')
    except Exception:
        return s
app = Flask(__name__, static_folder=str(PUBLIC), static_url_path='')
app.config['SECRET_KEY'] = JWT_SECRET

_checker_started = False


def fmt_user(row):
    return {
        'id': row['id'], 'fullName': row['name'], 'email': row['email'],
        'role': row['role'], 'balance': row['balance'], 'topupCode': row['topup_code'],
        'isBlocked': bool(row.get('is_blocked')), 'createdAt': format_dt_vn(row.get('created_at'))
    }


def fmt_product(row):
    return {
        'id': row['id'], 'name': row['name'], 'desc': row['description'],
        'price': row['price'], 'icon': row.get('image', 'fa-box'),
        'color': row.get('color', 'blue'), 'stock': row.get('stock', 0),
        'contactMode': norm_contact_mode(row.get('contact_mode')),
    }


VALID_PRODUCT_COLORS = {'emerald', 'orange', 'violet', 'blue', 'sky', 'teal', 'red', 'amber'}
VALID_CONTACT_MODES = {'none', 'email', 'zalo', 'both'}
CONTACT_MODE_LABELS = {
    'none': 'Không yêu cầu',
    'email': 'Yêu cầu email',
    'zalo': 'Yêu cầu SĐT/Zalo',
    'both': 'Email + SĐT/Zalo',
}


def norm_contact_mode(val):
    mode = (val or 'none').strip().lower()
    return mode if mode in VALID_CONTACT_MODES else 'none'


def valid_phone(phone):
    digits = re.sub(r'[\s\-.]', '', str(phone or ''))
    return bool(re.match(r'^(\+?84|0)[0-9]{8,10}$', digits))


def order_contact_fields(order):
    return {
        'contactEmail': order.get('contact_email') or '',
        'contactPhone': order.get('contact_phone') or '',
    }


def validate_order_contact(product, body):
    mode = norm_contact_mode(product.get('contact_mode'))
    email = (body.get('contactEmail') or body.get('contact_email') or '').strip()
    phone = (body.get('contactPhone') or body.get('contact_phone') or '').strip()
    if mode == 'none':
        return '', ''
    if mode in ('email', 'both'):
        if not email:
            return None, 'Vui lòng nhập email để nâng gói.'
        if not valid_email(email):
            return None, 'Email không hợp lệ.'
    if mode in ('zalo', 'both'):
        if not phone:
            return None, 'Vui lòng nhập SĐT/Zalo để nâng gói.'
        if not valid_phone(phone):
            return None, 'Số điện thoại/Zalo không hợp lệ.'
    if mode == 'email':
        return email, ''
    if mode == 'zalo':
        return '', phone
    return email, phone


def sign_token(uid, session_jti=None):
    token, _jti = sec.sign_token(uid, session_jti=session_jti)
    return token


def valid_email(email):
    return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))


def gen_order_code(oid):
    return f'DH{oid:06d}'


def gen_tx_code(tid):
    return f'GD{tid:06d}'


def fmt_order_row(row, extra=None):
    qty = int(row.get('quantity') or 1)
    item = {
        'id': row['id'],
        'orderCode': row.get('order_code') or gen_order_code(row['id']),
        'product': row.get('product') or row.get('product_name'),
        'productId': row.get('product_id'),
        'price': row['price'],
        'quantity': qty,
        'status': row['status'],
        'date': str(row.get('date') or row.get('created_at', '')),
    }
    if extra:
        item.update(extra)
    return item


def fetch_order_detail(conn, oid, user_view=False):
    order = db.fetchone(conn, 'SELECT * FROM orders WHERE id = ?', (oid,))
    if not order:
        return None
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (order['user_id'],))
    product = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (order['product_id'],))
    tx = db.fetchone(conn, 'SELECT * FROM transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1', (oid,))
    if not tx:
        tx = db.fetchone(conn,
            "SELECT * FROM transactions WHERE user_id = ? AND type = 'purchase' AND description LIKE ? ORDER BY id DESC LIMIT 1",
            (order['user_id'], f"%{order['product_name']}%"))
    detail = fmt_order_row(order)
    detail['productDesc'] = (product or {}).get('description', '')
    detail['contactMode'] = norm_contact_mode((product or {}).get('contact_mode'))
    detail.update(order_contact_fields(order))
    detail['customer'] = {'fullName': user['name'], 'email': user['email']} if user else None
    from services.support_notification_service import get_by_order_id, fmt_notification
    sn_row = db.fetchone(conn, 'SELECT * FROM support_notifications WHERE order_id = ?', (oid,))
    if sn_row:
        if user_view:
            detail['support'] = get_by_order_id(conn, oid, order['user_id'])
        else:
            detail['support'] = fmt_notification({
                **sn_row,
                'order_code': order.get('order_code'),
                'contact_phone': order.get('contact_phone'),
            })
    if tx:
        detail['transaction'] = {
            'id': tx['id'],
            'transactionCode': gen_tx_code(tx['id']),
            'type': tx['type'],
            'amount': tx['amount'],
            'description': tx['description'],
            'status': tx['status'],
            'date': str(tx['created_at']),
        }
    return detail


LEGACY_ADMIN_EMAIL = 'admin@gmail.com'


def purge_user(conn, uid):
    for sql, params in [
        ('DELETE FROM password_otps WHERE user_id = ?', (uid,)),
        ('DELETE FROM saved_outfits WHERE user_id = ?', (uid,)),
        ('DELETE FROM decoration_submissions WHERE user_id = ?', (uid,)),
        ('DELETE FROM decoration_saved_outfits WHERE user_id = ?', (uid,)),
        ('DELETE FROM decoration_drafts WHERE user_id = ?', (uid,)),
        ('DELETE FROM user_avatar_items WHERE user_id = ?', (uid,)),
        ('DELETE FROM user_avatars WHERE user_id = ?', (uid,)),
        ('DELETE FROM topup_requests WHERE user_id = ?', (uid,)),
        ('DELETE FROM transactions WHERE user_id = ?', (uid,)),
        ('DELETE FROM orders WHERE user_id = ?', (uid,)),
        ('DELETE FROM processed_bank_transactions WHERE user_id = ?', (uid,)),
        ('DELETE FROM users WHERE id = ?', (uid,)),
    ]:
        db.execute(conn, sql, params)


def init_app_data():
    db.init_schema()
    conn = db.get_conn()
    admin_email = ADMIN_EMAIL.strip().lower()
    pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
    target = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (admin_email,))
    legacy = db.fetchone(conn, 'SELECT * FROM users WHERE LOWER(email) = ?', (LEGACY_ADMIN_EMAIL,))

    if target:
        db.execute(conn, 'UPDATE users SET password_hash = ?, role = ? WHERE id = ?',
                   (pw_hash, 'admin', target['id']))
    elif legacy:
        code = gen_topup_code(admin_email, legacy['id'])
        db.execute(conn,
            'UPDATE users SET email = ?, password_hash = ?, role = ?, name = ?, topup_code = ? WHERE id = ?',
            (admin_email, pw_hash, 'admin', 'Đức Hi', code, legacy['id']))
    else:
        uid = db.insert_returning_id(conn,
            'INSERT INTO users (email,password_hash,role,name,balance,topup_code) VALUES (?,?,?,?,0,?)',
            (admin_email, pw_hash, 'admin', 'Đức Hi', 'TEMP'))
        db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?',
                   (gen_topup_code(admin_email, uid), uid))

    db.execute(conn, "UPDATE users SET role = 'user' WHERE role = 'admin' AND LOWER(email) != ?",
               (admin_email,))
    if admin_email != LEGACY_ADMIN_EMAIL:
        for row in db.fetchall(conn, 'SELECT id FROM users WHERE LOWER(email) = ?', (LEGACY_ADMIN_EMAIL,)):
            try:
                purge_user(conn, row['id'])
            except Exception as e:
                print(f'[Init] Không xóa được {LEGACY_ADMIN_EMAIL} id={row["id"]}: {e}')
    db.commit(conn)
    for row in db.fetchall(conn, "SELECT id,email FROM users WHERE topup_code IS NULL OR topup_code IN ('','TEMP')"):
        db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?', (gen_topup_code(row['email'], row['id']), row['id']))
    db.commit(conn)
    db.close(conn)


def auth_required(f):
    @wraps(f)
    def deco(*args, **kwargs):
        h = request.headers.get('Authorization', '')
        if not h.startswith('Bearer '):
            return jsonify({'error': 'Chưa đăng nhập.'}), 401
        try:
            payload = sec.decode_token(h[7:])
            conn = db.get_conn()
            user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (payload['userId'],))
            if not user:
                db.close(conn)
                return jsonify({'error': 'Tài khoản không tồn tại.'}), 401
            if user.get('is_blocked'):
                db.close(conn)
                return jsonify({'error': 'Tài khoản đã bị khóa.'}), 403
            jti = payload.get('jti')
            if not sec.is_session_valid(conn, user['id'], jti):
                db.close(conn)
                return jsonify({'error': 'Phiên đăng nhập đã bị thu hồi. Đăng nhập lại.'}), 401
            sec.touch_session(conn, user['id'], jti)
            db.commit(conn)
            db.close(conn)
            request.user = fmt_user(user)
            request.user_row = user
            request.jwt_payload = payload
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Phiên đăng nhập đã hết hạn. Đăng nhập lại.'}), 401
        except Exception:
            return jsonify({'error': 'Phiên đăng nhập không hợp lệ.'}), 401
        return f(*args, **kwargs)
    return deco


def admin_required(f):
    @wraps(f)
    @auth_required
    def deco(*args, **kwargs):
        if request.user['role'] != 'admin':
            return jsonify({'error': 'Bạn không có quyền truy cập.'}), 403
        return f(*args, **kwargs)
    return deco


def optional_auth(f):
    @wraps(f)
    def deco(*args, **kwargs):
        request.user = None
        h = request.headers.get('Authorization', '')
        if h.startswith('Bearer '):
            try:
                payload = sec.decode_token(h[7:])
                conn = db.get_conn()
                user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (payload['userId'],))
                if user and not user.get('is_blocked') and sec.is_session_valid(conn, user['id'], payload.get('jti')):
                    request.user = fmt_user(user)
                db.close(conn)
            except Exception:
                pass
        return f(*args, **kwargs)
    return deco


@app.before_request
def _security_before():
    blocked = sec.before_request_hook(request)
    if blocked is not None:
        return blocked


@app.after_request
def _security_after(response):
    return sec.apply_security_headers(response, request)


def _ensure_ready():
    global _checker_started
    if _checker_started:
        return
    _checker_started = True
    for attempt in range(5):
        try:
            init_app_data()
            print('[Init] Database ready')
            break
        except Exception as e:
            print(f'[Init] Lần {attempt + 1} thất bại: {e}')
            time.sleep(min(3 * (attempt + 1), 15))
    threading.Thread(target=bank_loop, daemon=True).start()
    drive.start_auto_sync_worker()


# ─── Meta ───
@app.route('/api/health')
def health():
    status = {
        'ok': True, 'site': SITE_NAME, 'bankMode': BANK['mode'],
        'casso': bool(CASSO['secure_token'] or CASSO['checksum_key']),
        'database': 'postgresql' if db.IS_PG else 'sqlite',
        'security': {
            'turnstile': bool(SECURITY.get('turnstile_secret_key')),
            'hsts': SECURITY.get('force_hsts') or True,
            'jwtExpireHours': SECURITY['jwt_expire_hours'],
            'lockoutAttempts': SECURITY['lockout_attempts'],
        },
    }
    try:
        conn = db.get_conn()
        status['products'] = int(db.fetchone(conn, 'SELECT COUNT(*) AS c FROM products')['c'])
        db.close(conn)
    except Exception as e:
        status['ok'] = False
        status['dbError'] = str(e)
    return jsonify(status), (200 if status['ok'] else 503)


@app.route('/api/site-info')
def site_info():
    return jsonify({'name': SITE_NAME, 'welcome': WELCOME_MSG, 'zalo': ZALO_PHONE})


@app.route('/api/support/status')
def support_status():
    from services.ai_support import status as ai_status
    return jsonify(ai_status())


def _ai_chat_handler():
    from services.ai_support import chat as ai_chat, status as ai_status
    d = request.get_json() or {}
    message = d.get('message', '')
    history = d.get('history') or []
    page = d.get('page') or 'products'
    conversation_id = d.get('conversationId') or d.get('conversation_id')
    user_ctx = request.user if getattr(request, 'user', None) else None
    if d.get('userContext') and user_ctx:
        pass
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    try:
        result = ai_chat(
            message, history=history, user_ctx=user_ctx, client_ip=ip,
            page=page, conversation_id=conversation_id,
        )
        st = ai_status()
        return jsonify({'ok': True, **result, 'zalo': ZALO_PHONE, 'assistantName': st.get('name')})
    except PermissionError as e:
        return jsonify({'error': str(e)}), 429
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except RuntimeError:
        st = ai_status()
        return jsonify({
            'ok': True,
            'reply': 'AI đang bận một chút, bạn thử lại sau nhé. Hoặc liên hệ Zalo **{}**.'.format(ZALO_PHONE),
            'suggestions': st.get('quickUser', []),
            'actions': [{'label': 'Liên hệ Zalo', 'view': 'zalo'}],
            'mode': 'error',
            'zalo': ZALO_PHONE,
        }), 200


@app.route('/api/ai/chat', methods=['POST'])
@app.route('/api/support/chat', methods=['POST'])
@optional_auth
def support_chat():
    return _ai_chat_handler()


@app.route('/api/ai/status')
def ai_status_route():
    from services.ai_support import status as ai_status
    return jsonify(ai_status())


@app.route('/api/ai/history', methods=['GET'])
@auth_required
def ai_history():
    from services.ai_support import get_conversation_history, get_settings
    conv_id = request.args.get('conversationId')
    msgs, cid = get_conversation_history(request.user['id'], conv_id)
    settings = get_settings()
    greeting = settings.get('greeting', '')
    return jsonify({
        'messages': msgs,
        'conversationId': cid,
        'greeting': greeting,
        'suggestions': settings['quickAdmin'] if request.user.get('role') == 'admin' else settings['quickUser'],
    })


@app.route('/api/ai/history', methods=['DELETE'])
@auth_required
def ai_clear_history():
    from services.ai_support import clear_conversation
    d = request.get_json() or {}
    clear_conversation(request.user['id'], d.get('conversationId'))
    return jsonify({'ok': True})


@app.route('/api/admin/ai/settings', methods=['GET'])
@admin_required
def admin_ai_settings_get():
    from services.ai_support import get_settings, get_admin_stats
    return jsonify({'settings': get_settings(), 'stats': get_admin_stats()})


@app.route('/api/admin/ai/settings', methods=['PATCH'])
@admin_required
def admin_ai_settings_patch():
    from services.ai_support import update_settings
    d = request.get_json() or {}
    mapping = {}
    if 'enabled' in d:
        mapping['enabled'] = '1' if d['enabled'] else '0'
    if 'mode' in d:
        mapping['mode'] = d['mode']
    if 'greeting' in d:
        mapping['greeting'] = d['greeting']
    if 'quickUser' in d:
        mapping['quick_user'] = d['quickUser']
    if 'quickAdmin' in d:
        mapping['quick_admin'] = d['quickAdmin']
    return jsonify({'settings': update_settings(mapping)})


# ─── Security Bootstrap ───
@app.route('/api/security/bootstrap')
def security_bootstrap():
    ip = sec.client_ip(request)
    csrf = sec.issue_csrf_token(ip)
    return jsonify({
        'csrfToken': csrf,
        'turnstileSiteKey': SECURITY.get('turnstile_site_key') or None,
        'passwordMinLength': SECURITY['password_min_length'],
    })


@app.route('/api/security/turnstile-config')
def turnstile_config():
    return jsonify({'siteKey': SECURITY.get('turnstile_site_key') or None})


def _complete_login(user, conn, ip, ua, fingerprint):
    token, jti = sec.sign_token(user['id'])
    try:
        sec.create_session(conn, user['id'], jti, ip, ua, fingerprint)
        sec.clear_lock(conn, user['id'])
        sec.record_login_attempt(conn, user['email'], ip, ua, fingerprint, True)
        sec.log_event('login_success', 'low', user_id=user['id'], ip=ip, conn=conn)
        db.commit(conn)
    except Exception as e:
        print(f'[Login] session log skipped: {e}')
        db.commit(conn)
    return token


# ─── Auth ───
@app.route('/api/auth/register', methods=['POST'])
@app.route('/api/register', methods=['POST'])
def register():
    d = request.get_json() or {}
    ip = sec.client_ip(request)
    ua = sec.client_ua(request)
    fingerprint = sec.client_fingerprint(request)
    turnstile = d.get('turnstileToken') or d.get('cfTurnstileResponse') or ''
    if SECURITY.get('turnstile_secret_key') and not sec.verify_turnstile(turnstile, ip):
        return jsonify({'error': 'Xác minh CAPTCHA thất bại. Thử lại.'}), 400
    try:
        name = sec.sanitize_string(d.get('fullName', d.get('name', '')), max_len=120)
        email = sec.sanitize_email(d.get('email', ''))
        pw = sec.sanitize_password(d.get('password', ''))
        pw2 = d.get('confirmPassword', d.get('password', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not name:
        return jsonify({'error': 'Vui lòng điền họ tên.'}), 400
    if pw != pw2:
        return jsonify({'error': 'Mật khẩu nhập lại không khớp.'}), 400
    conn = db.get_conn()
    if db.fetchone(conn, 'SELECT id FROM users WHERE email = ?', (email,)):
        db.close(conn)
        return jsonify({'error': 'Tài khoản đã tồn tại trên trang web'}), 409
    hash_pw = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    uid = db.insert_returning_id(conn, 'INSERT INTO users (email,password_hash,role,name,balance,topup_code) VALUES (?,?,?,?,0,?)',
                                 (email, hash_pw, 'user', name, 'TEMP'))
    code = gen_topup_code(email, uid)
    db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?', (code, uid))
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    token = _complete_login(user, conn, ip, ua, fingerprint)
    db.close(conn)
    sec.log_event('register', 'low', user_id=uid, ip=ip, details={'email': email})
    return jsonify({'token': token, 'user': fmt_user(user), 'loginMeta': {'ip': ip}}), 201


@app.route('/api/auth/login', methods=['POST'])
@app.route('/api/login', methods=['POST'])
def login():
    d = request.get_json() or {}
    ip = sec.client_ip(request)
    ua = sec.client_ua(request)
    fingerprint = sec.client_fingerprint(request)
    turnstile = d.get('turnstileToken') or d.get('cfTurnstileResponse') or ''
    try:
        email = sec.sanitize_email(d.get('email', ''))
        pw = d.get('password', '')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if SECURITY.get('turnstile_secret_key') and not sec.verify_turnstile(turnstile, ip):
        return jsonify({'error': 'Xác minh CAPTCHA thất bại. Thử lại.'}), 400

    conn = db.get_conn()
    try:
        fail_email, fail_ip = sec.get_failed_attempts(conn, email, ip)
    except Exception as e:
        db.close(conn)
        print(f'[Login] get_failed_attempts: {e}')
        return jsonify({'error': 'Hệ thống đang khởi tạo bảo mật. Thử lại sau 1 phút.'}), 503

    if fail_email >= SECURITY['lockout_attempts'] or fail_ip >= SECURITY['lockout_attempts'] * 2:
        db.close(conn)
        sec.log_event('login_rate_blocked', 'high', ip=ip, details={'email': email})
        return jsonify({'error': 'Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.'}), 429

    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if user:
        locked, remain = sec.is_account_locked(user)
        if locked:
            db.close(conn)
            return jsonify({'error': f'Tài khoản tạm khóa. Thử lại sau {remain // 60 + 1} phút.'}), 423

    if not user or not bcrypt.checkpw(pw.encode(), user['password_hash'].encode()):
        sec.record_login_attempt(conn, email, ip, ua, fingerprint, False)
        db.commit(conn)
        if user:
            _, fe = sec.get_failed_attempts(conn, email, ip)
            if fe >= SECURITY['lockout_attempts']:
                sec.lock_account(conn, user['id'])
                db.commit(conn)
                sec.log_event('login_lockout', 'high', user_id=user['id'], ip=ip, conn=conn)
        db.close(conn)
        sec.log_event('login_failed', 'medium', user_id=user['id'] if user else None, ip=ip,
                      details={'email': email})
        return jsonify({'error': 'Email hoặc mật khẩu không đúng.'}), 401

    if user.get('is_blocked'):
        db.close(conn)
        return jsonify({'error': 'Tài khoản đã bị khóa. Liên hệ hỗ trợ.'}), 403

    try:
        token = _complete_login(user, conn, ip, ua, fingerprint)
        db.close(conn)
        return jsonify({'token': token, 'user': fmt_user(user), 'loginMeta': {'ip': ip}})
    except Exception as e:
        db.close(conn)
        print(f'[Login] error: {e}')
        token, _ = sec.sign_token(user['id'])
        return jsonify({'token': token, 'user': fmt_user(user), 'loginMeta': {'ip': ip}})


@app.route('/api/auth/logout', methods=['POST'])
@auth_required
def auth_logout():
    jti = (getattr(request, 'jwt_payload', None) or {}).get('jti')
    conn = db.get_conn()
    if jti:
        db.execute(conn, 'UPDATE user_sessions SET revoked = ? WHERE user_id = ? AND jti = ?',
                   (db.bool_val(True), request.user['id'], jti))
        db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/auth/sessions', methods=['GET'])
@auth_required
def auth_sessions():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT jti, ip, user_agent, fingerprint, created_at, last_seen, revoked
        FROM user_sessions WHERE user_id = ? ORDER BY last_seen DESC LIMIT 20
    ''', (request.user['id'],))
    db.close(conn)
    current_jti = (getattr(request, 'jwt_payload', None) or {}).get('jti')
    sessions = []
    for r in rows:
        sessions.append({
            'jti': r['jti'],
            'ip': r['ip'],
            'userAgent': (r['user_agent'] or '')[:80],
            'current': r['jti'] == current_jti,
            'revoked': bool(r.get('revoked')),
            'lastSeen': str(r['last_seen']),
        })
    return jsonify({'sessions': sessions})


@app.route('/api/auth/sessions/revoke-all', methods=['POST'])
@auth_required
def auth_revoke_sessions():
    jti = (getattr(request, 'jwt_payload', None) or {}).get('jti')
    conn = db.get_conn()
    sec.revoke_all_sessions(conn, request.user['id'], except_jti=jti)
    db.commit(conn)
    db.close(conn)
    sec.log_event('sessions_revoked', 'medium', user_id=request.user['id'], ip=sec.client_ip(request))
    return jsonify({'ok': True, 'message': 'Đã đăng xuất tất cả thiết bị khác.'})


@app.route('/api/auth/me')
@app.route('/api/me')
@auth_required
def me():
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    db.close(conn)
    return jsonify({
        'user': fmt_user(user),
        'clientMeta': {'ip': sec.client_ip(request)},
    })


@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    email = (request.get_json() or {}).get('email', '').strip().lower()
    if not valid_email(email):
        return jsonify({'error': 'Email không hợp lệ.'}), 400
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if not user:
        db.close(conn)
        return jsonify({'ok': True, 'message': 'Nếu email tồn tại, mã OTP đã được gửi.'})
    since = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    cnt = db.fetchone(conn,
        'SELECT COUNT(*) AS c FROM password_otps WHERE user_id = ? AND created_at > ?',
        (user['id'], since))['c']
    if cnt >= OTP_RATE_LIMIT_PER_HOUR:
        db.close(conn)
        return jsonify({'error': 'Bạn đã gửi quá nhiều yêu cầu. Thử lại sau 1 giờ.'}), 429
    otp = f'{secrets.randbelow(900000) + 100000:06d}'
    otp_hash = bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()
    db.execute(conn, 'INSERT INTO password_otps (user_id,otp_hash,expires_at) VALUES (?,?,?)',
               (user['id'], otp_hash, expires))
    db.commit(conn)
    db.close(conn)
    try:
        mail = send_otp_email(email, otp)
        if mail.get('dev') and db.IS_PG:
            return jsonify({
                'error': 'Chưa cấu hình gửi email OTP trên server. Liên hệ admin qua Zalo 0944255413.'
            }), 503
    except Exception as e:
        return jsonify({'error': f'Không gửi được email: {e}'}), 500
    return jsonify({'ok': True, 'message': 'Mã OTP đã được gửi đến email của bạn.'})


@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    d = request.get_json() or {}
    email, otp = d.get('email', '').strip().lower(), d.get('otp', '').strip()
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    used_filter = 'used IS NOT TRUE' if db.IS_PG else 'used = 0'
    rec = db.fetchone(conn,
        f'SELECT * FROM password_otps WHERE user_id = ? AND {used_filter} ORDER BY id DESC LIMIT 1', (user['id'],))
    if not rec:
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    if rec['attempts'] >= OTP_MAX_ATTEMPTS:
        db.close(conn)
        return jsonify({'error': 'Đã nhập sai quá số lần cho phép.'}), 400
    exp = rec['expires_at']
    if isinstance(exp, str):
        exp_dt = datetime.fromisoformat(exp.replace('Z', ''))
    else:
        exp_dt = exp
    if datetime.utcnow() > exp_dt:
        db.close(conn)
        return jsonify({'error': 'OTP đã hết hạn.'}), 400
    if not bcrypt.checkpw(otp.encode(), rec['otp_hash'].encode()):
        db.execute(conn, 'UPDATE password_otps SET attempts = attempts + 1 WHERE id = ?', (rec['id'],))
        db.commit(conn)
        db.close(conn)
        return jsonify({'error': 'OTP không đúng.'}), 400
    db.close(conn)
    return jsonify({'ok': True, 'message': 'OTP hợp lệ. Đặt mật khẩu mới.'})


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    d = request.get_json() or {}
    email, otp, new_pw = d.get('email', '').strip().lower(), d.get('otp', '').strip(), d.get('newPassword', '')
    try:
        new_pw = sec.sanitize_password(new_pw)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    used_filter = 'used IS NOT TRUE' if db.IS_PG else 'used = 0'
    rec = db.fetchone(conn,
        f'SELECT * FROM password_otps WHERE user_id = ? AND {used_filter} ORDER BY id DESC LIMIT 1', (user['id'],))
    if not rec or not bcrypt.checkpw(otp.encode(), rec['otp_hash'].encode()):
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    exp = rec['expires_at']
    exp_dt = datetime.fromisoformat(str(exp).replace('Z', '')) if isinstance(exp, str) else exp
    if datetime.utcnow() > exp_dt:
        db.close(conn)
        return jsonify({'error': 'OTP đã hết hạn.'}), 400
    hash_pw = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    db.execute(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', (hash_pw, user['id']))
    if db.IS_PG:
        db.execute(conn, 'UPDATE password_otps SET used = TRUE WHERE id = ?', (rec['id'],))
    else:
        db.execute(conn, 'UPDATE password_otps SET used = 1 WHERE id = ?', (rec['id'],))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'message': 'Đổi mật khẩu thành công.'})


# ─── User ───
@app.route('/api/user/balance')
@auth_required
def user_balance():
    return jsonify({'balance': request.user['balance']})


@app.route('/api/user/transactions')
@app.route('/api/transactions/my')
@auth_required
def user_transactions():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT id,type,amount,description,status,bank_transaction_id AS "bankTransactionId",order_id,created_at AS date FROM transactions WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
        r['transactionCode'] = gen_tx_code(r['id'])
        if r.get('order_id'):
            r['orderCode'] = gen_order_code(r['order_id'])
    return jsonify({'transactions': rows})


@app.route('/api/user/orders')
@app.route('/api/orders/my')
@auth_required
def user_orders():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT id,product_id,product_name AS product,price,quantity,status,order_code,created_at AS date FROM orders WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    from services.support_notification_service import map_by_order_ids
    support_map = map_by_order_ids(conn, [r['id'] for r in rows], request.user['id'])
    orders = []
    for r in rows:
        item = fmt_order_row(r)
        item['support'] = support_map.get(r['id'])
        orders.append(item)
    db.close(conn)
    return jsonify({'orders': orders})


# ─── Products & Orders ───
@app.route('/api/products')
def products_list():
    try:
        conn = db.get_conn()
        rows = db.fetchall(conn, 'SELECT * FROM products WHERE stock > 0 ORDER BY id')
        db.close(conn)
        return jsonify({'products': [fmt_product(r) for r in rows]})
    except Exception as e:
        print(f'[Products] {e}')
        return jsonify({'error': 'Không tải được sản phẩm.'}), 500


@app.route('/api/orders/create', methods=['POST'])
@auth_required
def order_create():
    body = request.get_json() or {}
    pid = int(body.get('productId', 0))
    try:
        qty = int(body.get('quantity', 1))
    except (TypeError, ValueError):
        qty = 1
    if qty < 1:
        return jsonify({'error': 'Số lượng tối thiểu là 1.'}), 400
    if qty > 99:
        return jsonify({'error': 'Số lượng tối đa là 99/lần mua.'}), 400

    conn = db.get_conn()
    product = db.fetchone(conn, 'SELECT * FROM products WHERE id = ? AND stock > 0', (pid,))
    if not product:
        db.close(conn)
        return jsonify({'error': 'Sản phẩm không tồn tại hoặc hết hàng.'}), 404
    stock = int(product.get('stock') or 0)
    if qty > stock:
        db.close(conn)
        return jsonify({'error': f'Chỉ còn {stock} sản phẩm trong kho.'}), 400

    contact = validate_order_contact(product, body)
    if contact[0] is None:
        db.close(conn)
        return jsonify({'error': contact[1]}), 400
    contact_email, contact_phone = contact

    unit_price = int(product['price'])
    subtotal = unit_price * qty
    coupon_code = str(body.get('couponCode') or '').strip().upper()
    try:
        discount_percent = float(body.get('discountPercent') or 0)
    except (TypeError, ValueError):
        discount_percent = 0
    discount_percent = max(0.0, min(100.0, discount_percent))
    if coupon_code and discount_percent > 0:
        total_price = int(round(subtotal * (1 - discount_percent / 100)))
    else:
        total_price = subtotal
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    if user['balance'] < total_price:
        db.close(conn)
        need = f'{total_price:,}'.replace(',', '.')
        have = f'{user["balance"]:,}'.replace(',', '.')
        return jsonify({'error': f'Số dư không đủ. Cần {need}đ, bạn có {have}đ.'}), 400

    db.execute(conn, 'UPDATE users SET balance = balance - ? WHERE id = ?', (total_price, user['id']))
    db.execute(conn, 'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', (qty, pid, qty))
    oid = db.insert_returning_id(conn,
        'INSERT INTO orders (user_id,product_id,product_name,price,quantity,status,contact_email,contact_phone) VALUES (?,?,?,?,?,?,?,?)',
        (user['id'], pid, product['name'], total_price, qty, 'completed', contact_email or None, contact_phone or None))
    order_code = gen_order_code(oid)
    db.execute(conn, 'UPDATE orders SET order_code = ? WHERE id = ?', (order_code, oid))
    tx_desc = f"Mua {qty}x {product['name']}" if qty > 1 else f"Mua {product['name']}"
    if coupon_code and discount_percent > 0:
        tx_desc += f" (mã {coupon_code} -{int(discount_percent)}%)"
    txid = db.insert_returning_id(conn,
        'INSERT INTO transactions (user_id,type,amount,description,status,order_id) VALUES (?,?,?,?,?,?)',
        (user['id'], 'purchase', total_price, tx_desc, 'success', oid))
    from services.support_notification_service import create_for_order
    support_nid = create_for_order(conn, user, oid, product, contact_email, contact_phone,
                                   quantity=qty, total_price=total_price)
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (user['id'],))['balance']
    db.close(conn)
    from services.support_notification_service import USER_STATUS_LABELS, USER_STATUS_HINTS
    return jsonify({
        'orderId': oid, 'orderCode': order_code, 'transactionCode': gen_tx_code(txid),
        'product': product['name'], 'price': total_price, 'quantity': qty, 'unitPrice': unit_price,
        'balance': bal,
        'supportNotificationId': support_nid,
        'support': {
            'id': support_nid,
            'orderId': oid,
            'status': 'pending',
            'statusLabel': USER_STATUS_LABELS['pending'],
            'hint': USER_STATUS_HINTS['pending'],
        },
    }), 201


@app.route('/api/orders/<int:oid>')
@auth_required
def order_detail(oid):
    conn = db.get_conn()
    order = db.fetchone(conn, 'SELECT user_id FROM orders WHERE id = ?', (oid,))
    if not order:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy đơn hàng.'}), 404
    if order['user_id'] != request.user['id'] and request.user['role'] != 'admin':
        db.close(conn)
        return jsonify({'error': 'Không có quyền.'}), 403
    user_view = order['user_id'] == request.user['id'] and request.user['role'] != 'admin'
    detail = fetch_order_detail(conn, oid, user_view=user_view)
    db.close(conn)
    return jsonify({'order': detail})


# ─── Topup ───
@app.route('/api/topup/my-code')
@auth_required
def topup_code():
    return jsonify({'topupCode': request.user['topupCode']})


@app.route('/api/topup/create', methods=['POST'])
@auth_required
def topup_create():
    amount = int((request.get_json() or {}).get('amount', 0))
    if amount < 10000:
        return jsonify({'error': 'Số tiền nạp tối thiểu 10.000đ.'}), 400
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    qr = build_qr(amount, user['topup_code'])
    tid = db.insert_returning_id(conn, 'INSERT INTO topup_requests (user_id,amount,topup_code,status,qr_url) VALUES (?,?,?,?,?)',
                                 (user['id'], amount, user['topup_code'], 'pending', qr))
    db.execute(conn, 'INSERT INTO transactions (user_id,type,amount,description,status,topup_request_id) VALUES (?,?,?,?,?,?)',
               (user['id'], 'topup', amount, f'Nạp tiền {amount:,}đ'.replace(',', '.'), 'pending', tid))
    db.commit(conn)
    db.close(conn)
    return jsonify({
        'id': tid, 'amount': amount, 'topupCode': user['topup_code'], 'status': 'pending', 'qrUrl': qr,
        'bank': {'name': BANK['name'], 'account': BANK['account'], 'holder': BANK['holder']}
    }), 201


@app.route('/api/topup/status/<int:tid>')
@auth_required
def topup_status(tid):
    conn = db.get_conn()
    t = db.fetchone(conn, 'SELECT * FROM topup_requests WHERE id = ?', (tid,))
    if not t:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy.'}), 404
    if t['user_id'] != request.user['id'] and request.user['role'] != 'admin':
        db.close(conn)
        return jsonify({'error': 'Không có quyền.'}), 403
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (t['user_id'],))['balance']
    db.close(conn)
    return jsonify({'id': t['id'], 'amount': t['amount'], 'topupCode': t['topup_code'], 'status': t['status'],
                    'qrUrl': t['qr_url'], 'balance': bal})


# ─── Bank ───
@app.route('/api/casso/webhook', methods=['POST'])
def casso_webhook():
    try:
        payload = request.get_json(silent=True) or {}
        results = ingest_casso_webhook(payload, dict(request.headers))
        return jsonify({'success': True, 'ok': True, 'results': results})
    except PermissionError as e:
        return jsonify({'success': False, 'error': str(e)}), 401
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/bank/webhook', methods=['POST'])
@app.route('/api/webhook/bank-transaction', methods=['POST'])
def bank_webhook():
    if WEBHOOK_SECRET and request.headers.get('x-webhook-secret') != WEBHOOK_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401
    try:
        return jsonify({'ok': True, 'result': ingest_webhook(request.get_json() or {})})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ─── Avatar / Phòng Thay Đồ ───
@app.route('/api/avatar/items')
@auth_required
def avatar_items_list():
    gender = request.args.get('gender', '').strip().lower()
    category = request.args.get('category', '').strip().lower()
    conn = db.get_conn()
    owned = av.get_owned_item_ids(conn, request.user['id'])
    free_ids = av.get_free_item_ids(conn)
    sql = 'SELECT * FROM avatar_items WHERE 1=1'
    params = []
    if gender in ('male', 'female'):
        sql += ' AND (gender = ? OR gender = ?)'
        params.extend([gender, 'all'])
    if category in av.VALID_CATEGORIES:
        sql += ' AND category = ?'
        params.append(category)
    sql += ' ORDER BY layer_order, category, price, id'
    rows = db.fetchall(conn, sql, tuple(params))
    db.close(conn)
    return jsonify({'items': [
        av.fmt_avatar_item(r, owned=(r['id'] in owned or r['id'] in free_ids))
        for r in rows
    ]})


@app.route('/api/avatar/my-items')
@auth_required
def avatar_my_items():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT ai.*, uai.purchased_at FROM user_avatar_items uai
        JOIN avatar_items ai ON ai.id = uai.item_id
        WHERE uai.user_id = ? ORDER BY uai.purchased_at DESC''', (request.user['id'],))
    free_rows = db.fetchall(conn, 'SELECT * FROM avatar_items WHERE is_free = ? ORDER BY category, id',
                            (True if db.IS_PG else 1,))
    db.close(conn)
    seen = set()
    items = []
    for r in free_rows:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        items.append(av.fmt_avatar_item(r, owned=True))
    for r in rows:
        if r['id'] in seen:
            continue
        seen.add(r['id'])
        item = av.fmt_avatar_item(r, owned=True)
        item['purchasedAt'] = str(r.get('purchased_at', ''))
        items.append(item)
    return jsonify({'items': items})


@app.route('/api/avatar/buy-item', methods=['POST'])
@auth_required
def avatar_buy_item():
    d = request.get_json() or {}
    try:
        item_id = int(d.get('itemId', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Vật phẩm không hợp lệ.'}), 400
    conn = db.get_conn()
    item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (item_id,))
    if not item:
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không tồn tại.'}), 404
    if item.get('is_free'):
        db.close(conn)
        return jsonify({'error': 'Vật phẩm này miễn phí, không cần mua.'}), 400
    uid = request.user['id']
    if av.user_can_use_item(conn, uid, item):
        db.close(conn)
        return jsonify({'error': 'Bạn đã sở hữu vật phẩm này.'}), 400
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    price = int(item['price'])
    if user['balance'] < price:
        db.close(conn)
        return jsonify({'error': 'Số dư không đủ, vui lòng nạp thêm.', 'needTopup': True}), 400
    db.execute(conn, 'UPDATE users SET balance = balance - ? WHERE id = ?', (price, uid))
    db.execute(conn, 'INSERT INTO user_avatar_items (user_id, item_id) VALUES (?, ?)', (uid, item_id))
    desc = f"Mua vật phẩm #{item_id}: {item['name']}"
    db.execute(conn,
        'INSERT INTO transactions (user_id, type, amount, description, status) VALUES (?,?,?,?,?)',
        (uid, 'avatar_item_purchase', price, desc, 'success'))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (uid,))['balance']
    db.close(conn)
    return jsonify({'ok': True, 'balance': bal, 'item': av.fmt_avatar_item(item, owned=True)}), 201


@app.route('/api/avatar/current')
@auth_required
def avatar_current():
    conn = db.get_conn()
    state = av.get_current_state(conn, request.user['id'])
    db.close(conn)
    return jsonify(state)


@app.route('/api/avatar/save-current', methods=['POST'])
@auth_required
def avatar_save_current():
    d = request.get_json() or {}
    gender = d.get('gender', 'female').strip().lower()
    if gender not in ('male', 'female'):
        gender = 'female'
    items_raw = d.get('items') or {}
    conn = db.get_conn()
    item_ids = av.resolve_items_for_gender(conn, gender, items_raw)
    for cat, iid in item_ids.items():
        item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
        if not item or not av.user_can_use_item(conn, request.user['id'], item):
            db.close(conn)
            return jsonify({'error': f'Bạn chưa sở hữu vật phẩm ở mục {cat}.'}), 400
    row = av.get_or_create_avatar(conn, request.user['id'], gender)
    now = db.sql_now()
    db.execute(conn,
        f'UPDATE user_avatars SET gender = ?, current_items = ?, updated_at = {now} WHERE user_id = ?',
        (gender, av.items_to_json(item_ids), request.user['id']))
    db.commit(conn)
    state = av.get_current_state(conn, request.user['id'])
    db.close(conn)
    return jsonify({'ok': True, **state})


@app.route('/api/avatar/equip-item', methods=['POST'])
@auth_required
def avatar_equip_item():
    d = request.get_json() or {}
    try:
        item_id = int(d.get('itemId', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Vật phẩm không hợp lệ.'}), 400
    conn = db.get_conn()
    item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (item_id,))
    if not item:
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không tồn tại.'}), 404
    uid = request.user['id']
    if not av.user_can_use_item(conn, uid, item):
        db.close(conn)
        return jsonify({'error': 'Bạn chưa sở hữu vật phẩm này.', 'needBuy': True}), 403
    avatar = av.get_or_create_avatar(conn, uid)
    gender = (d.get('gender') or avatar.get('gender') or 'female').strip().lower()
    if item['gender'] not in ('all', gender):
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không phù hợp giới tính nhân vật.'}), 400
    items_map = av.parse_items_json(avatar.get('current_items'))
    items_map[item['category']] = item_id
    if item['category'] == 'body':
        gender = item['gender'] if item['gender'] in ('male', 'female') else gender
    now = db.sql_now()
    db.execute(conn,
        f'UPDATE user_avatars SET gender = ?, current_items = ?, updated_at = {now} WHERE user_id = ?',
        (gender, av.items_to_json(items_map), uid))
    db.commit(conn)
    state = av.get_current_state(conn, uid)
    db.close(conn)
    return jsonify({'ok': True, **state})


@app.route('/api/avatar/unequip-item', methods=['POST'])
@auth_required
def avatar_unequip_item():
    d = request.get_json() or {}
    category = av.norm_category(d.get('category', ''))
    if category in ('background', 'body', 'eyes'):
        return jsonify({'error': 'Không thể gỡ mục bắt buộc.'}), 400
    conn = db.get_conn()
    avatar = av.get_or_create_avatar(conn, request.user['id'])
    items_map = av.parse_items_json(avatar.get('current_items'))
    items_map.pop(category, None)
    gender = avatar.get('gender') or 'female'
    defaults = av.DEFAULT_ITEMS_MALE if gender == 'male' else av.DEFAULT_ITEMS_FEMALE
    if category in defaults:
        by_key = av.items_by_layer_key(conn)
        row = by_key.get(defaults[category])
        if row:
            items_map[category] = row['id']
    now = db.sql_now()
    db.execute(conn,
        f'UPDATE user_avatars SET current_items = ?, updated_at = {now} WHERE user_id = ?',
        (av.items_to_json(items_map), request.user['id']))
    db.commit(conn)
    state = av.get_current_state(conn, request.user['id'])
    db.close(conn)
    return jsonify({'ok': True, **state})


@app.route('/api/avatar/outfits')
@auth_required
def avatar_outfits_list():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT * FROM saved_outfits WHERE user_id = ? ORDER BY id DESC', (request.user['id'],))
    db.close(conn)
    return jsonify({'outfits': [{
        'id': r['id'], 'name': r['name'], 'gender': r['gender'],
        'items': av.parse_items_json(r.get('items')),
        'createdAt': str(r.get('created_at', '')),
    } for r in rows]})


@app.route('/api/avatar/outfits', methods=['POST'])
@auth_required
def avatar_outfit_save():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip() or 'Outfit mới'
    gender = d.get('gender', 'female').strip().lower()
    if gender not in ('male', 'female'):
        gender = 'female'
    conn = db.get_conn()
    avatar = av.get_or_create_avatar(conn, request.user['id'])
    items_map = d.get('items') or av.parse_items_json(avatar.get('current_items'))
    item_ids = av.resolve_items_for_gender(conn, gender, items_map)
    for iid in item_ids.values():
        item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
        if item and not av.user_can_use_item(conn, request.user['id'], item):
            db.close(conn)
            return jsonify({'error': 'Outfit chứa vật phẩm chưa sở hữu.'}), 400
    oid = db.insert_returning_id(conn,
        'INSERT INTO saved_outfits (user_id, name, gender, items) VALUES (?,?,?,?)',
        (request.user['id'], name[:80], gender, av.items_to_json(item_ids)))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM saved_outfits WHERE id = ?', (oid,))
    db.close(conn)
    return jsonify({'outfit': {
        'id': row['id'], 'name': row['name'], 'gender': row['gender'],
        'items': av.parse_items_json(row.get('items')),
        'createdAt': str(row.get('created_at', '')),
    }}), 201


@app.route('/api/avatar/outfits/<int:oid>', methods=['DELETE'])
@auth_required
def avatar_outfit_delete(oid):
    conn = db.get_conn()
    row = db.fetchone(conn, 'SELECT * FROM saved_outfits WHERE id = ? AND user_id = ?',
                      (oid, request.user['id']))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy outfit.'}), 404
    db.execute(conn, 'DELETE FROM saved_outfits WHERE id = ?', (oid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/avatar/outfits/<int:oid>/apply', methods=['POST'])
@auth_required
def avatar_outfit_apply(oid):
    conn = db.get_conn()
    row = db.fetchone(conn, 'SELECT * FROM saved_outfits WHERE id = ? AND user_id = ?',
                      (oid, request.user['id']))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy outfit.'}), 404
    gender = row['gender']
    item_ids = av.parse_items_json(row.get('items'))
    for iid in item_ids.values():
        item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
        if item and not av.user_can_use_item(conn, request.user['id'], item):
            db.close(conn)
            return jsonify({'error': f'Chưa sở hữu: {item["name"]}'}), 400
    now = db.sql_now()
    db.execute(conn,
        f'UPDATE user_avatars SET gender = ?, current_items = ?, updated_at = {now} WHERE user_id = ?',
        (gender, av.items_to_json(item_ids), request.user['id']))
    db.commit(conn)
    state = av.get_current_state(conn, request.user['id'])
    db.close(conn)
    return jsonify({'ok': True, **state})


# ─── Cuộc Thi Trang Trí ───
@app.route('/api/decoration/items')
@auth_required
def decoration_items_list():
    gender = request.args.get('gender', '').strip().lower()
    category = request.args.get('category', '').strip().lower()
    theme = request.args.get('theme', '').strip().lower()
    conn = db.get_conn()
    sql = 'SELECT * FROM decoration_items WHERE is_active = ?'
    params = [True if db.IS_PG else 1]
    if gender in ('male', 'female'):
        sql += ' AND (gender = ? OR gender = ?)'
        params.extend([gender, 'all'])
    if category in deco.VALID_CATEGORIES:
        sql += ' AND category = ?'
        params.append(category)
    if theme in deco.VALID_THEMES:
        sql += ' AND theme = ?'
        params.append(theme)
    sql += ' ORDER BY layer_order, category, id'
    rows = db.fetchall(conn, sql, tuple(params))
    db.close(conn)
    return jsonify({'items': [deco.fmt_item(r) for r in rows], 'themes': deco.THEME_LABELS})


@app.route('/api/decoration/save-draft', methods=['POST'])
@auth_required
def decoration_save_draft():
    d = request.get_json() or {}
    gender = d.get('gender', 'female').strip().lower()
    if gender not in ('male', 'female'):
        gender = 'female'
    theme = deco.norm_theme(d.get('theme'))
    items_map = d.get('items') or d.get('itemsUsed') or {}
    preview = (d.get('previewImage') or '')[:500000]
    custom_bg = (d.get('customBg') or '')[:800000] or None
    custom_overlay = (d.get('customOverlay') or '')[:400000] or None
    conn = db.get_conn()
    item_ids = deco.resolve_items(conn, gender, items_map)
    uid = request.user['id']
    existing = db.fetchone(conn, 'SELECT id FROM decoration_drafts WHERE user_id = ?', (uid,))
    now = db.sql_now()
    if existing:
        db.execute(conn,
            f'UPDATE decoration_drafts SET gender=?, theme=?, items_used=?, preview_image=?, custom_bg=?, custom_overlay=?, updated_at={now} WHERE user_id=?',
            (gender, theme, deco.to_json(item_ids), preview or None, custom_bg, custom_overlay, uid))
    else:
        db.insert_returning_id(conn,
            'INSERT INTO decoration_drafts (user_id,gender,theme,items_used,preview_image,custom_bg,custom_overlay) VALUES (?,?,?,?,?,?,?)',
            (uid, gender, theme, deco.to_json(item_ids), preview or None, custom_bg, custom_overlay))
    db.commit(conn)
    draft = db.fetchone(conn, 'SELECT * FROM decoration_drafts WHERE user_id = ?', (uid,))
    db.close(conn)
    return jsonify({
        'ok': True,
        'draft': {
            'gender': draft['gender'], 'theme': draft['theme'],
            'items': deco.parse_json(draft.get('items_used')),
            'previewImage': draft.get('preview_image') or '',
            'customBg': draft.get('custom_bg') or '',
            'customOverlay': draft.get('custom_overlay') or '',
        },
    })


@app.route('/api/decoration/draft')
@auth_required
def decoration_get_draft():
    conn = db.get_conn()
    draft = db.fetchone(conn, 'SELECT * FROM decoration_drafts WHERE user_id = ?', (request.user['id'],))
    db.close(conn)
    if not draft:
        return jsonify({'draft': None})
    item_ids = deco.parse_json(draft.get('items_used'))
    return jsonify({
        'draft': {
            'gender': draft['gender'], 'theme': draft['theme'],
            'items': item_ids,
            'equipped': [],  # filled by client from items + catalog
            'previewImage': draft.get('preview_image') or '',
            'customBg': draft.get('custom_bg') or '',
            'customOverlay': draft.get('custom_overlay') or '',
        },
    })


@app.route('/api/decoration/outfits')
@auth_required
def decoration_outfits_list():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT * FROM decoration_saved_outfits WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    return jsonify({'outfits': [{
        'id': r['id'], 'name': r['name'], 'gender': r['gender'],
        'theme': r.get('theme') or 'japanese_cute',
        'items': deco.parse_json(r.get('items_used')),
        'previewImage': r.get('preview_image') or '',
        'customBg': r.get('custom_bg') or '',
        'customOverlay': r.get('custom_overlay') or '',
        'createdAt': str(r.get('created_at', '')),
    } for r in rows]})


@app.route('/api/decoration/outfits', methods=['POST'])
@auth_required
def decoration_outfit_save():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip() or 'Outfit của tôi'
    gender = d.get('gender', 'female').strip().lower()
    if gender not in ('male', 'female'):
        gender = 'female'
    theme = deco.norm_theme(d.get('theme'))
    preview = (d.get('previewImage') or '')[:500000]
    custom_bg = (d.get('customBg') or '')[:800000] or None
    custom_overlay = (d.get('customOverlay') or '')[:400000] or None
    items_map = d.get('items') or d.get('itemsUsed') or {}
    conn = db.get_conn()
    item_ids = deco.resolve_items(conn, gender, items_map)
    oid = db.insert_returning_id(conn,
        'INSERT INTO decoration_saved_outfits (user_id,name,gender,theme,items_used,preview_image,custom_bg,custom_overlay) VALUES (?,?,?,?,?,?,?,?)',
        (request.user['id'], name[:80], gender, theme, deco.to_json(item_ids), preview or None, custom_bg, custom_overlay))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM decoration_saved_outfits WHERE id = ?', (oid,))
    db.close(conn)
    return jsonify({'outfit': {
        'id': row['id'], 'name': row['name'], 'gender': row['gender'], 'theme': row['theme'],
        'items': deco.parse_json(row.get('items_used')),
        'previewImage': row.get('preview_image') or '',
        'customBg': row.get('custom_bg') or '',
        'customOverlay': row.get('custom_overlay') or '',
        'createdAt': str(row.get('created_at', '')),
    }}), 201


@app.route('/api/decoration/outfits/<int:oid>', methods=['DELETE'])
@auth_required
def decoration_outfit_delete(oid):
    conn = db.get_conn()
    row = db.fetchone(conn,
        'SELECT * FROM decoration_saved_outfits WHERE id = ? AND user_id = ?',
        (oid, request.user['id']))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy outfit.'}), 404
    db.execute(conn, 'DELETE FROM decoration_saved_outfits WHERE id = ?', (oid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/decoration/outfits/<int:oid>/apply', methods=['POST'])
@auth_required
def decoration_outfit_apply(oid):
    conn = db.get_conn()
    row = db.fetchone(conn,
        'SELECT * FROM decoration_saved_outfits WHERE id = ? AND user_id = ?',
        (oid, request.user['id']))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy outfit.'}), 404
    gender = row['gender']
    theme = row.get('theme') or 'japanese_cute'
    item_ids = deco.parse_json(row.get('items_used'))
    now = db.sql_now()
    existing = db.fetchone(conn, 'SELECT id FROM decoration_drafts WHERE user_id = ?', (request.user['id'],))
    preview = row.get('preview_image') or ''
    custom_bg = row.get('custom_bg') or None
    custom_overlay = row.get('custom_overlay') or None
    if existing:
        db.execute(conn,
            f'UPDATE decoration_drafts SET gender=?, theme=?, items_used=?, preview_image=?, custom_bg=?, custom_overlay=?, updated_at={now} WHERE user_id=?',
            (gender, theme, deco.to_json(item_ids), preview or None, custom_bg, custom_overlay, request.user['id']))
    else:
        db.insert_returning_id(conn,
            'INSERT INTO decoration_drafts (user_id,gender,theme,items_used,preview_image,custom_bg,custom_overlay) VALUES (?,?,?,?,?,?,?)',
            (request.user['id'], gender, theme, deco.to_json(item_ids), preview or None, custom_bg, custom_overlay))
    db.commit(conn)
    equipped = deco.equipped_from_ids(conn, item_ids)
    db.close(conn)
    return jsonify({
        'ok': True, 'gender': gender, 'theme': theme,
        'items': item_ids, 'equipped': equipped,
        'previewImage': preview,
        'customBg': custom_bg or '',
        'customOverlay': custom_overlay or '',
    })


@app.route('/api/decoration/submit', methods=['POST'])
@auth_required
def decoration_submit():
    d = request.get_json() or {}
    title = (d.get('title') or '').strip()
    if not title or len(title) < 2:
        return jsonify({'error': 'Vui lòng nhập tên bài dự thi (ít nhất 2 ký tự).'}), 400
    if len(title) > 100:
        return jsonify({'error': 'Tên bài quá dài.'}), 400
    description = (d.get('description') or '').strip()[:500]
    gender = d.get('gender', 'female').strip().lower()
    if gender not in ('male', 'female'):
        gender = 'female'
    theme = deco.norm_theme(d.get('theme'))
    preview = (d.get('previewImage') or '')[:500000]
    if not preview:
        return jsonify({'error': 'Vui lòng tạo preview nhân vật trước khi gửi.'}), 400
    conn = db.get_conn()
    uid = request.user['id']
    if deco.submissions_today(conn, uid) >= deco.MAX_SUBMISSIONS_PER_DAY:
        db.close(conn)
        return jsonify({'error': f'Bạn đã gửi tối đa {deco.MAX_SUBMISSIONS_PER_DAY} bài hôm nay. Thử lại ngày mai.'}), 429
    items_map = d.get('items') or d.get('itemsUsed') or {}
    item_ids = deco.resolve_items(conn, gender, items_map)
    if len(item_ids) < 3:
        db.close(conn)
        return jsonify({'error': 'Hãy trang trí ít nhất 3 vật phẩm trước khi gửi.'}), 400
    sid = db.insert_returning_id(conn,
        '''INSERT INTO decoration_submissions
           (user_id,title,description,gender,theme,items_used,preview_image,status)
           VALUES (?,?,?,?,?,?,?,?)''',
        (uid, title, description, gender, theme, deco.to_json(item_ids), preview, 'pending_review'))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM decoration_submissions WHERE id = ?', (sid,))
    db.close(conn)
    return jsonify({'ok': True, 'submission': deco.fmt_submission(row)}, 201)


@app.route('/api/decoration/my-submissions')
@auth_required
def decoration_my_submissions():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT * FROM decoration_submissions WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    return jsonify({'submissions': [deco.fmt_submission(r) for r in rows]})


@app.route('/api/decoration/leaderboard')
@auth_required
def decoration_leaderboard():
    conn = db.get_conn()
    top_scores = db.fetchall(conn, '''
        SELECT s.*, u.name, u.email FROM decoration_submissions s
        JOIN users u ON u.id = s.user_id
        WHERE s.status = 'approved' AND s.score IS NOT NULL
        ORDER BY s.score DESC, s.reviewed_at DESC LIMIT 10''')
    top_rewards = db.fetchall(conn, '''
        SELECT u.id, u.name, u.email, COALESCE(SUM(s.reward_amount),0) AS total_reward,
               COUNT(s.id) AS wins
        FROM decoration_submissions s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'approved' AND s.reward_amount > 0
        GROUP BY u.id, u.name, u.email ORDER BY total_reward DESC LIMIT 10''')
    latest = db.fetchall(conn, '''
        SELECT s.*, u.name, u.email FROM decoration_submissions s
        JOIN users u ON u.id = s.user_id
        WHERE s.status IN ('approved','pending_review')
        ORDER BY s.created_at DESC LIMIT 10''')
    featured = db.fetchall(conn, '''
        SELECT s.*, u.name, u.email FROM decoration_submissions s
        JOIN users u ON u.id = s.user_id
        WHERE s.status = 'approved' AND s.score >= 80
        ORDER BY s.score DESC LIMIT 10''')
    db.close(conn)
    def with_user(rows):
        return [deco.fmt_submission(r, {'name': r.get('name'), 'email': r.get('email')}) for r in rows]
    return jsonify({
        'topScores': with_user(top_scores),
        'topRewards': [{
            'userId': r['id'], 'userName': r['name'], 'userEmail': r['email'],
            'totalReward': int(r['total_reward'] or 0), 'wins': int(r['wins'] or 0),
        } for r in top_rewards],
        'latest': with_user(latest),
        'featured': with_user(featured),
    })


@app.route('/api/admin/decoration/submissions')
@admin_required
def admin_decoration_submissions():
    status = request.args.get('status', '').strip()
    conn = db.get_conn()
    sql = '''
        SELECT s.*, u.name, u.email FROM decoration_submissions s
        JOIN users u ON u.id = s.user_id WHERE 1=1'''
    params = []
    if status in deco.VALID_STATUSES:
        sql += ' AND s.status = ?'
        params.append(status)
    sql += ' ORDER BY CASE s.status WHEN \'pending_review\' THEN 0 ELSE 1 END, s.id DESC'
    rows = db.fetchall(conn, sql, tuple(params))
    db.close(conn)
    return jsonify({'submissions': [
        deco.fmt_submission(r, {'name': r.get('name'), 'email': r.get('email')}) for r in rows
    ]})


@app.route('/api/admin/decoration/submissions/<int:sid>')
@admin_required
def admin_decoration_submission_detail(sid):
    conn = db.get_conn()
    row = db.fetchone(conn, '''
        SELECT s.*, u.name, u.email FROM decoration_submissions s
        JOIN users u ON u.id = s.user_id WHERE s.id = ?''', (sid,))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy bài dự thi.'}), 404
    item_ids = deco.parse_json(row.get('items_used'))
    items_detail = []
    for cat, iid in item_ids.items():
        item = db.fetchone(conn, 'SELECT * FROM decoration_items WHERE id = ?', (iid,))
        if item:
            items_detail.append({**deco.fmt_item(item), 'slot': cat})
    db.close(conn)
    sub = deco.fmt_submission(row, {'name': row.get('name'), 'email': row.get('email')})
    sub['itemsDetail'] = items_detail
    return jsonify({'submission': sub})


@app.route('/api/admin/decoration/submissions/<int:sid>/review', methods=['POST'])
@admin_required
def admin_decoration_review(sid):
    d = request.get_json() or {}
    try:
        score = int(d.get('score', 0))
        reward = int(d.get('rewardAmount', d.get('reward', 0)))
    except (TypeError, ValueError):
        return jsonify({'error': 'Điểm hoặc tiền thưởng không hợp lệ.'}), 400
    if score < 1 or score > 100:
        return jsonify({'error': 'Điểm phải từ 1 đến 100.'}), 400
    if reward < 0:
        return jsonify({'error': 'Tiền thưởng không hợp lệ.'}), 400
    note = (d.get('adminNote') or d.get('note') or '').strip()[:500]
    conn = db.get_conn()
    row = db.fetchone(conn, 'SELECT * FROM decoration_submissions WHERE id = ?', (sid,))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy bài dự thi.'}), 404
    if row['status'] != 'pending_review':
        db.close(conn)
        return jsonify({'error': 'Bài này đã được xử lý.'}), 400
    uid = row['user_id']
    now = db.sql_now()
    db.execute(conn,
        f'''UPDATE decoration_submissions SET status='approved', score=?, reward_amount=?,
            admin_note=?, reviewed_at={now} WHERE id=?''',
        (score, reward, note or None, sid))
    if reward > 0:
        db.execute(conn, 'UPDATE users SET balance = balance + ? WHERE id = ?', (reward, uid))
        db.execute(conn,
            'INSERT INTO transactions (user_id, type, amount, description, status) VALUES (?,?,?,?,?)',
            (uid, 'decoration_reward', reward,
             f'Thưởng trang trí #{sid}: {row["title"]} ({score}điểm)', 'success'))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (uid,))['balance']
    updated = db.fetchone(conn, 'SELECT * FROM decoration_submissions WHERE id = ?', (sid,))
    user = db.fetchone(conn, 'SELECT name, email FROM users WHERE id = ?', (uid,))
    db.close(conn)
    return jsonify({
        'ok': True, 'balance': bal,
        'submission': deco.fmt_submission(updated, user),
    })


@app.route('/api/admin/decoration/submissions/<int:sid>/reject', methods=['POST'])
@admin_required
def admin_decoration_reject(sid):
    d = request.get_json() or {}
    note = (d.get('adminNote') or d.get('note') or 'Bài dự thi không phù hợp.').strip()[:500]
    conn = db.get_conn()
    row = db.fetchone(conn, 'SELECT * FROM decoration_submissions WHERE id = ?', (sid,))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy bài dự thi.'}), 404
    if row['status'] != 'pending_review':
        db.close(conn)
        return jsonify({'error': 'Bài này đã được xử lý.'}), 400
    now = db.sql_now()
    db.execute(conn,
        f"UPDATE decoration_submissions SET status='rejected', admin_note=?, reviewed_at={now} WHERE id=?",
        (note, sid))
    db.commit(conn)
    updated = db.fetchone(conn, 'SELECT * FROM decoration_submissions WHERE id = ?', (sid,))
    db.close(conn)
    return jsonify({'ok': True, 'submission': deco.fmt_submission(updated)})


@app.route('/api/admin/decoration/items')
@admin_required
def admin_decoration_items():
    conn = db.get_conn()
    rows = db.fetchall(conn, 'SELECT * FROM decoration_items ORDER BY category, layer_order, id')
    db.close(conn)
    return jsonify({'items': [deco.fmt_item(r) for r in rows]})


@app.route('/api/admin/decoration/items', methods=['POST'])
@admin_required
def admin_decoration_item_create():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Tên vật phẩm không được để trống.'}), 400
    category = deco.norm_category(d.get('category'))
    gender = deco.norm_gender(d.get('gender'))
    theme = deco.norm_theme(d.get('theme'))
    image = (d.get('image') or d.get('previewImage') or '👘').strip()
    layer = (d.get('layerImage') or d.get('layer') or f'dec-custom-{secrets.token_hex(3)}').strip()
    layer_order = int(d.get('layerOrder') or deco.CATEGORY_ORDER.get(category, 99))
    is_active = d.get('isActive', True)
    conn = db.get_conn()
    iid = db.insert_returning_id(conn,
        '''INSERT INTO decoration_items
           (name,category,gender,theme,image,layer_image,layer_order,is_active)
           VALUES (?,?,?,?,?,?,?,?)''',
        (name, category, gender, theme, image, layer, layer_order,
         is_active if db.IS_PG else (1 if is_active else 0)))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM decoration_items WHERE id = ?', (iid,))
    db.close(conn)
    return jsonify({'item': deco.fmt_item(row)}), 201


@app.route('/api/admin/decoration/items/<int:iid>', methods=['PATCH'])
@admin_required
def admin_decoration_item_patch(iid):
    d = request.get_json() or {}
    conn = db.get_conn()
    item = db.fetchone(conn, 'SELECT * FROM decoration_items WHERE id = ?', (iid,))
    if not item:
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không tồn tại.'}), 404
    name = (d.get('name', item['name']) or '').strip()
    category = deco.norm_category(d.get('category', item['category']))
    gender = deco.norm_gender(d.get('gender', item['gender']))
    theme = deco.norm_theme(d.get('theme', item.get('theme')))
    image = (d.get('image') or item.get('image') or '👘').strip()
    layer = (d.get('layerImage') or item.get('layer_image') or '').strip()
    layer_order = int(d.get('layerOrder', item.get('layer_order') or 99))
    is_active = d.get('isActive', item.get('is_active', True))
    db.execute(conn,
        '''UPDATE decoration_items SET name=?,category=?,gender=?,theme=?,image=?,
           layer_image=?,layer_order=?,is_active=? WHERE id=?''',
        (name, category, gender, theme, image, layer, layer_order,
         is_active if db.IS_PG else (1 if is_active else 0), iid))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM decoration_items WHERE id = ?', (iid,))
    db.close(conn)
    return jsonify({'item': deco.fmt_item(row)})


@app.route('/api/admin/decoration/items/<int:iid>', methods=['DELETE'])
@admin_required
def admin_decoration_item_delete(iid):
    conn = db.get_conn()
    item = db.fetchone(conn, 'SELECT id FROM decoration_items WHERE id = ?', (iid,))
    if not item:
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không tồn tại.'}), 404
    db.execute(conn, 'UPDATE decoration_items SET is_active = ? WHERE id = ?',
               (False if db.IS_PG else 0, iid))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


# ─── Admin ───
@app.route('/api/admin/dashboard')
@admin_required
def admin_dashboard():
    conn = db.get_conn()
    product_rev = db.fetchone(conn,
        "SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='purchase' AND status='success'")['t']
    avatar_rev = db.fetchone(conn,
        "SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='avatar_item_purchase' AND status='success'")['t']
    deco_reward = db.fetchone(conn,
        "SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='decoration_reward' AND status='success'")['t']
    avatar_sold = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM transactions WHERE type='avatar_item_purchase' AND status='success'")['c']
    avatar_users = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM user_avatars')['c']
    orders = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM orders')['c']
    pending = db.fetchone(conn, "SELECT COUNT(*) AS c FROM topup_requests WHERE status='pending'")['c']
    users = db.fetchone(conn, "SELECT COUNT(*) AS c FROM users WHERE role='user'")['c']
    bank_tx = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM processed_bank_transactions')['c']
    top_items = db.fetchall(conn, '''
        SELECT description, COUNT(*) AS cnt, SUM(amount) AS revenue
        FROM transactions WHERE type='avatar_item_purchase' AND status='success'
        GROUP BY description ORDER BY cnt DESC LIMIT 5''')
    deco_pending = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM decoration_submissions WHERE status='pending_review'")['c']
    deco_approved = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM decoration_submissions WHERE status='approved'")['c']
    deco_items = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM decoration_items WHERE is_active = ?',
                             (True if db.IS_PG else 1,))['c']
    deco_outfits = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM decoration_saved_outfits')['c']
    from services.support_notification_service import pending_count
    pending_support = pending_count(conn)
    db.close(conn)
    return jsonify({
        'revenue': int(product_rev),
        'avatarRevenue': int(avatar_rev),
        'decorationRewards': int(deco_reward),
        'totalRevenue': int(product_rev) + int(avatar_rev) + int(deco_reward),
        'avatarItemsSold': int(avatar_sold),
        'avatarUsers': int(avatar_users),
        'decorationPending': int(deco_pending),
        'decorationApproved': int(deco_approved),
        'decorationItems': int(deco_items),
        'savedOutfits': int(deco_outfits),
        'topAvatarItems': [{
            'description': r['description'], 'count': int(r['cnt']), 'revenue': int(r['revenue'] or 0),
        } for r in top_items],
        'totalOrders': int(orders), 'pendingTopups': int(pending),
        'pendingSupportNotifications': int(pending_support),
        'totalUsers': int(users), 'bankTransactions': int(bank_tx),
    })


@app.route('/api/admin/security')
@admin_required
def admin_security():
    conn = db.get_conn()
    data = sec.get_security_dashboard(conn)
    db.close(conn)
    return jsonify(data)


@app.route('/api/admin/support-notifications/unread-count')
@admin_required
def admin_support_unread_count():
    from services.support_notification_service import pending_count
    conn = db.get_conn()
    count = pending_count(conn)
    db.close(conn)
    return jsonify({'count': count})


@app.route('/api/admin/support-notifications')
@admin_required
def admin_support_list():
    from services.support_notification_service import list_notifications
    status = request.args.get('status', '').strip()
    q = request.args.get('q', '').strip()
    conn = db.get_conn()
    items = list_notifications(conn, status=status or None, q=q or None)
    db.close(conn)
    return jsonify({'notifications': items})


@app.route('/api/admin/support-notifications/<int:nid>')
@admin_required
def admin_support_detail(nid):
    from services.support_notification_service import get_notification
    conn = db.get_conn()
    item = get_notification(conn, nid)
    db.close(conn)
    if not item:
        return jsonify({'error': 'Không tìm thấy thông báo.'}), 404
    return jsonify({'notification': item})


@app.route('/api/admin/support-notifications/<int:nid>/status', methods=['PATCH'])
@admin_required
def admin_support_status(nid):
    from services.support_notification_service import update_status, VALID_STATUSES
    d = request.get_json() or {}
    status = (d.get('status') or '').strip()
    if status not in VALID_STATUSES:
        return jsonify({'error': 'Trạng thái không hợp lệ.'}), 400
    conn = db.get_conn()
    item, err = update_status(conn, nid, status, request.user['id'])
    if err:
        db.close(conn)
        return jsonify({'error': err}), 404 if err == 'Không tìm thấy thông báo.' else 400
    db.commit(conn)
    db.close(conn)
    return jsonify({'notification': item})


@app.route('/api/admin/support-notifications/<int:nid>/note', methods=['PATCH'])
@admin_required
def admin_support_note(nid):
    from services.support_notification_service import update_note
    d = request.get_json() or {}
    note = (d.get('note') or '').strip()
    conn = db.get_conn()
    item, err = update_note(conn, nid, note, request.user['id'])
    if err:
        db.close(conn)
        return jsonify({'error': err}), 404
    db.commit(conn)
    db.close(conn)
    return jsonify({'notification': item})


@app.route('/api/admin/users')
@admin_required
def admin_users():
    q = request.args.get('q', '').strip()
    conn = db.get_conn()
    if q:
        like = f'%{q}%'
        rows = db.fetchall(conn,
            'SELECT id,name,email,role,balance,topup_code,is_blocked,created_at FROM users WHERE role=? AND (email LIKE ? OR name LIKE ?) ORDER BY id DESC',
            ('user', like, like))
    else:
        rows = db.fetchall(conn,
            'SELECT id,name,email,role,balance,topup_code,is_blocked,created_at FROM users WHERE role=? ORDER BY id DESC', ('user',))
    db.close(conn)
    return jsonify({'users': [{
        'id': r['id'], 'fullName': r['name'], 'email': r['email'], 'role': r['role'],
        'balance': r['balance'], 'topupCode': r['topup_code'], 'isBlocked': bool(r.get('is_blocked')),
        'createdAt': str(r['created_at'])
    } for r in rows]})


@app.route('/api/admin/users/<int:uid>')
@admin_required
def admin_user_detail(uid):
    conn = db.get_conn()
    r = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    if not r:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy.'}), 404
    orders = db.fetchall(conn,
        'SELECT id, product_id, product_name AS product, price, status, order_code, created_at AS date FROM orders WHERE user_id = ? ORDER BY id DESC',
        (uid,))
    transactions = db.fetchall(conn,
        'SELECT id, type, amount, description, status, bank_transaction_id, order_id, created_at AS date FROM transactions WHERE user_id = ? ORDER BY id DESC',
        (uid,))
    db.close(conn)
    order_items = [fmt_order_row(row) for row in orders]
    tx_items = []
    for row in transactions:
        tx_items.append({
            'id': row['id'], 'transactionCode': gen_tx_code(row['id']),
            'type': row['type'], 'amount': row['amount'], 'description': row['description'],
            'status': row['status'], 'bankTransactionId': row.get('bank_transaction_id'),
            'orderId': row.get('order_id'),
            'orderCode': gen_order_code(row['order_id']) if row.get('order_id') else None,
            'date': str(row['date']),
        })
    return jsonify({'user': fmt_user(r), 'orders': order_items, 'transactions': tx_items})


@app.route('/api/admin/users/<int:uid>', methods=['PATCH'])
@admin_required
def admin_user_patch(uid):
    d = request.get_json() or {}
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy.'}), 404
    if user['email'].lower() == ADMIN_EMAIL.lower() and d.get('role') == 'user':
        db.close(conn)
        return jsonify({'error': 'Không thể hạ quyền admin mặc định.'}), 400
    if 'isBlocked' in d:
        db.execute(conn, 'UPDATE users SET is_blocked = ? WHERE id = ?', (1 if d['isBlocked'] else 0, uid))
    if 'role' in d and d['role'] in ('user', 'admin'):
        db.execute(conn, 'UPDATE users SET role = ? WHERE id = ?', (d['role'], uid))
    if 'newPassword' in d:
        new_pw = d['newPassword']
        if len(new_pw) < 6:
            db.close(conn)
            return jsonify({'error': 'Mật khẩu mới tối thiểu 6 ký tự.'}), 400
        hash_pw = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
        db.execute(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', (hash_pw, uid))
    if 'balanceDelta' in d:
        delta = int(d['balanceDelta'])
        if delta == 0:
            db.close(conn)
            return jsonify({'error': 'Số tiền điều chỉnh phải khác 0.'}), 400
        new_balance = int(user['balance']) + delta
        if new_balance < 0:
            db.close(conn)
            return jsonify({'error': 'Số dư sau điều chỉnh không được âm.'}), 400
        reason = (d.get('balanceReason') or '').strip() or ('Admin cộng tiền' if delta > 0 else 'Admin trừ tiền')
        db.execute(conn, 'UPDATE users SET balance = ? WHERE id = ?', (new_balance, uid))
        db.execute(conn,
            'INSERT INTO transactions (user_id, type, amount, description, status) VALUES (?, ?, ?, ?, ?)',
            (uid, 'adjustment', abs(delta), f'{reason} ({delta:+,}đ)'.replace(',', '.'), 'success'))
    db.commit(conn)
    updated = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    db.close(conn)
    return jsonify({'user': fmt_user(updated)})


@app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
@admin_required
def admin_user_delete(uid):
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy.'}), 404
    if user['email'].lower() == ADMIN_EMAIL.lower():
        db.close(conn)
        return jsonify({'error': 'Không thể xóa tài khoản admin mặc định.'}), 400
    purge_user(conn, uid)
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'message': f'Đã xóa tài khoản {user["email"]}.'})


@app.route('/api/admin/orders')
@admin_required
def admin_orders():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT o.id,o.product_id,o.product_name AS product,o.price,o.quantity,o.status,o.order_code,o.created_at AS date,
               o.contact_email,o.contact_phone,u.email,u.name AS customer_name
        FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC''')
    from services.support_notification_service import map_by_order_ids, STATUS_LABELS
    support_map = map_by_order_ids(conn, [r['id'] for r in rows])
    orders = []
    for r in rows:
        item = fmt_order_row(r, {
            'email': r['email'], 'customerName': r['customer_name'],
            'contactEmail': r.get('contact_email') or '',
            'contactPhone': r.get('contact_phone') or '',
        })
        sup = support_map.get(r['id'])
        if sup:
            sup['statusLabel'] = STATUS_LABELS.get(sup['status'], sup['status'])
        item['support'] = sup
        orders.append(item)
    db.close(conn)
    return jsonify({'orders': orders})


@app.route('/api/admin/transactions')
@admin_required
def admin_transactions():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT t.id,t.type,t.amount,t.description,t.status,t.bank_transaction_id AS "bankTransactionId",
               t.order_id,t.created_at AS date,u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC''')
    db.close(conn)
    items = []
    for r in rows:
        items.append({
            'id': r['id'], 'transactionCode': gen_tx_code(r['id']),
            'type': r['type'], 'amount': r['amount'], 'description': r['description'],
            'status': r['status'], 'bankTransactionId': r.get('bankTransactionId'),
            'orderId': r.get('order_id'),
            'orderCode': gen_order_code(r['order_id']) if r.get('order_id') else None,
            'email': r['email'], 'date': str(r['date']),
        })
    return jsonify({'transactions': items})


@app.route('/api/admin/products', methods=['GET'])
@admin_required
def admin_products_list():
    conn = db.get_conn()
    rows = db.fetchall(conn, 'SELECT * FROM products ORDER BY id')
    db.close(conn)
    return jsonify({'products': [fmt_product(r) for r in rows]})


@app.route('/api/admin/products', methods=['POST'])
@admin_required
def admin_product_create():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Tên sản phẩm không được để trống.'}), 400
    try:
        price = int(d.get('price', 0))
        stock = int(d.get('stock', 99))
    except (TypeError, ValueError):
        return jsonify({'error': 'Giá hoặc tồn kho không hợp lệ.'}), 400
    if price < 0:
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    desc = (d.get('desc') or d.get('description') or '').strip()
    icon = (d.get('icon') or 'fa-box').strip() or 'fa-box'
    color = (d.get('color') or 'blue').strip()
    if color not in VALID_PRODUCT_COLORS:
        color = 'blue'
    if stock < 0:
        stock = 0
    contact_mode = norm_contact_mode(d.get('contactMode') or d.get('contact_mode'))
    conn = db.get_conn()
    pid = db.insert_returning_id(conn,
        'INSERT INTO products (name,description,price,image,color,stock,contact_mode) VALUES (?,?,?,?,?,?,?)',
        (name, desc, price, icon, color, stock, contact_mode))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (pid,))
    db.close(conn)
    return jsonify({'product': fmt_product(row)}), 201


@app.route('/api/admin/products/<int:pid>', methods=['PATCH'])
@admin_required
def admin_product_patch(pid):
    d = request.get_json() or {}
    conn = db.get_conn()
    product = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (pid,))
    if not product:
        db.close(conn)
        return jsonify({'error': 'Sản phẩm không tồn tại.'}), 404
    name = (d.get('name', product['name']) or '').strip()
    if not name:
        db.close(conn)
        return jsonify({'error': 'Tên sản phẩm không được để trống.'}), 400
    try:
        price = int(d.get('price', product['price']))
        stock = int(d.get('stock', product['stock']))
    except (TypeError, ValueError):
        db.close(conn)
        return jsonify({'error': 'Giá hoặc tồn kho không hợp lệ.'}), 400
    if price < 0:
        db.close(conn)
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    desc = (d.get('desc') or d.get('description') or product['description'] or '').strip()
    icon = (d.get('icon') or product.get('image') or 'fa-box').strip() or 'fa-box'
    color = (d.get('color') or product.get('color') or 'blue').strip()
    if color not in VALID_PRODUCT_COLORS:
        color = 'blue'
    if stock < 0:
        stock = 0
    contact_mode = norm_contact_mode(d.get('contactMode', d.get('contact_mode', product.get('contact_mode'))))
    db.execute(conn,
        'UPDATE products SET name=?, description=?, price=?, image=?, color=?, stock=?, contact_mode=? WHERE id=?',
        (name, desc, price, icon, color, stock, contact_mode, pid))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (pid,))
    db.close(conn)
    return jsonify({'product': fmt_product(row)})


@app.route('/api/admin/products/<int:pid>', methods=['DELETE'])
@admin_required
def admin_product_delete(pid):
    conn = db.get_conn()
    product = db.fetchone(conn, 'SELECT id FROM products WHERE id = ?', (pid,))
    if not product:
        db.close(conn)
        return jsonify({'error': 'Sản phẩm không tồn tại.'}), 404
    db.execute(conn, 'DELETE FROM products WHERE id = ?', (pid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/admin/products', methods=['DELETE'])
@admin_required
def admin_products_delete_all():
    conn = db.get_conn()
    db.execute(conn, 'DELETE FROM products')
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'message': 'Đã xóa tất cả sản phẩm.'})


@app.route('/api/admin/bank-transactions')
@admin_required
def admin_bank_tx():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT p.id,p.bank_transaction_id AS "bankTransactionId",p.amount,p.description,p.bank_account AS "bankAccount",
               p.processed_at AS "processedAt",u.email FROM processed_bank_transactions p
        LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC''')
    db.close(conn)
    for r in rows:
        r['processedAt'] = str(r['processedAt'])
    return jsonify({'bankTransactions': rows})


@app.route('/api/admin/topups')
@admin_required
def admin_topups():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT tr.id,tr.user_id AS "userId",tr.amount,tr.topup_code AS "topupCode",tr.status,
               tr.created_at AS "createdAt",u.email,u.name AS "fullName"
        FROM topup_requests tr JOIN users u ON u.id=tr.user_id ORDER BY tr.id DESC''')
    db.close(conn)
    for r in rows:
        r['createdAt'] = str(r['createdAt'])
    return jsonify({'topups': rows})


@app.route('/api/admin/topups/<int:tid>/approve', methods=['POST'])
@admin_required
def admin_topup_approve(tid):
    conn = db.get_conn()
    topup = db.fetchone(conn, 'SELECT * FROM topup_requests WHERE id = ?', (tid,))
    if not topup:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy yêu cầu nạp tiền.'}), 404
    if topup['status'] != 'pending':
        db.close(conn)
        return jsonify({'error': 'Yêu cầu này đã được xử lý.'}), 400
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (topup['user_id'],))
    if not user:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy người dùng.'}), 404
    if user.get('is_blocked'):
        db.close(conn)
        return jsonify({'error': 'Tài khoản đã bị khóa.'}), 400

    amount = int(topup['amount'])
    tx_id = f'MANUAL_{int(time.time())}_{secrets.token_hex(3)}'
    now = db.sql_now()
    db.execute(conn, 'UPDATE users SET balance = balance + ? WHERE id = ?', (amount, user['id']))
    db.execute(conn, f"UPDATE topup_requests SET status = 'success', completed_at = {now} WHERE id = ?", (tid,))
    db.execute(conn,
        "UPDATE transactions SET status = 'success', description = ?, bank_transaction_id = ? WHERE topup_request_id = ? AND status = 'pending'",
        (f'Nạp tiền {amount:,}đ (admin duyệt)'.replace(',', '.'), tx_id, tid))
    db.execute(conn,
        'INSERT INTO processed_bank_transactions (bank_transaction_id, amount, description, user_id, bank_account) VALUES (?, ?, ?, ?, ?)',
        (tx_id, amount, topup['topup_code'], user['id'], BANK['account']))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (user['id'],))['balance']
    db.close(conn)
    return jsonify({'ok': True, 'amount': amount, 'balance': bal, 'email': user['email']})


@app.route('/api/admin/simulate-bank-transfer', methods=['POST'])
@admin_required
def simulate_bank():
    if BANK['mode'] != 'mock':
        return jsonify({'error': 'Chỉ dùng khi BANK_MODE=mock'}), 400
    d = request.get_json() or {}
    code, amount = d.get('topupCode', '').strip(), int(d.get('amount', 0))
    tx_id = d.get('bankTransactionId') or f'MOCK_{int(time.time())}_{secrets.token_hex(3)}'
    conn = db.get_conn()
    db.insert_ignore_mock(conn, tx_id, amount, code, BANK['account'])
    db.commit(conn)
    result = process_bank_tx(conn, tx_id, amount, code, BANK['account'])
    db.close(conn)
    return jsonify({'ok': True, 'result': result})


@app.route('/api/admin/avatar/items')
@admin_required
def admin_avatar_items():
    conn = db.get_conn()
    rows = db.fetchall(conn, 'SELECT * FROM avatar_items ORDER BY category, layer_order, id')
    items = []
    for r in rows:
        cnt = av.purchase_count_for_item(conn, r['id'])
        items.append(av.fmt_avatar_item(r, purchase_count=cnt))
    db.close(conn)
    return jsonify({'items': items})


@app.route('/api/admin/avatar/items', methods=['POST'])
@admin_required
def admin_avatar_item_create():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Tên vật phẩm không được để trống.'}), 400
    category = av.norm_category(d.get('category'))
    gender = av.norm_gender(d.get('gender'))
    try:
        price = int(d.get('price', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    if price < 0:
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    is_free = bool(d.get('isFree', price == 0))
    preview = (d.get('previewImage') or d.get('preview') or '👕').strip()
    layer = (d.get('layerImage') or d.get('layer') or f'custom-{secrets.token_hex(3)}').strip()
    layer_order = int(d.get('layerOrder') or av.CATEGORY_ORDER.get(category, 99))
    conn = db.get_conn()
    iid = db.insert_returning_id(conn,
        '''INSERT INTO avatar_items
           (name, category, gender, price, is_free, preview_image, layer_image, layer_order)
           VALUES (?,?,?,?,?,?,?,?)''',
        (name, category, gender, price, is_free if db.IS_PG else (1 if is_free else 0),
         preview, layer, layer_order))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
    db.close(conn)
    return jsonify({'item': av.fmt_avatar_item(row)}), 201


@app.route('/api/admin/avatar/items/<int:iid>', methods=['PATCH'])
@admin_required
def admin_avatar_item_patch(iid):
    d = request.get_json() or {}
    conn = db.get_conn()
    item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
    if not item:
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không tồn tại.'}), 404
    name = (d.get('name', item['name']) or '').strip()
    if not name:
        db.close(conn)
        return jsonify({'error': 'Tên không được để trống.'}), 400
    category = av.norm_category(d.get('category', item['category']))
    gender = av.norm_gender(d.get('gender', item['gender']))
    try:
        price = int(d.get('price', item['price']))
    except (TypeError, ValueError):
        db.close(conn)
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    is_free = d.get('isFree', item.get('is_free'))
    if is_free is None:
        is_free = price == 0
    preview = (d.get('previewImage') or item.get('preview_image') or '👕').strip()
    layer = (d.get('layerImage') or item.get('layer_image') or '').strip()
    layer_order = int(d.get('layerOrder', item.get('layer_order') or 99))
    db.execute(conn,
        '''UPDATE avatar_items SET name=?, category=?, gender=?, price=?, is_free=?,
           preview_image=?, layer_image=?, layer_order=? WHERE id=?''',
        (name, category, gender, price, is_free if db.IS_PG else (1 if is_free else 0),
         preview, layer, layer_order, iid))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
    db.close(conn)
    return jsonify({'item': av.fmt_avatar_item(row)})


@app.route('/api/admin/avatar/items/<int:iid>', methods=['DELETE'])
@admin_required
def admin_avatar_item_delete(iid):
    conn = db.get_conn()
    item = db.fetchone(conn, 'SELECT id FROM avatar_items WHERE id = ?', (iid,))
    if not item:
        db.close(conn)
        return jsonify({'error': 'Vật phẩm không tồn tại.'}), 404
    db.execute(conn, 'DELETE FROM user_avatar_items WHERE item_id = ?', (iid,))
    db.execute(conn, 'DELETE FROM avatar_items WHERE id = ?', (iid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/admin/avatar/revenue')
@admin_required
def admin_avatar_revenue():
    conn = db.get_conn()
    total = db.fetchone(conn,
        "SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='avatar_item_purchase' AND status='success'")['t']
    count = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM transactions WHERE type='avatar_item_purchase' AND status='success'")['c']
    db.close(conn)
    return jsonify({'revenue': int(total), 'itemsSold': int(count)})


@app.route('/api/admin/avatar/top-selling')
@admin_required
def admin_avatar_top_selling():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT description, COUNT(*) AS cnt, SUM(amount) AS revenue
        FROM transactions WHERE type='avatar_item_purchase' AND status='success'
        GROUP BY description ORDER BY cnt DESC LIMIT 10''')
    db.close(conn)
    return jsonify({'items': [{
        'description': r['description'], 'count': int(r['cnt']), 'revenue': int(r['revenue'] or 0),
    } for r in rows]})


# ─── Social (MXH mini — đăng ảnh, kết bạn) ───

MAX_SOCIAL_IMAGE_LEN = 700_000
MAX_SOCIAL_VIDEO_LEN = 12_000_000


def _social_media_type(data):
    if not data or not isinstance(data, str):
        return None
    text = data.strip()
    if re.match(r'^data:video/', text, re.I) and ';base64,' in text.lower():
        return 'video'
    if re.match(r'^data:image/', text, re.I) and ';base64,' in text.lower():
        return 'image'
    return None


def _valid_social_media(data):
    mtype = _social_media_type(data)
    if mtype == 'image':
        return len(data) <= MAX_SOCIAL_IMAGE_LEN
    if mtype == 'video':
        return len(data) <= MAX_SOCIAL_VIDEO_LEN
    return False


MAX_SOCIAL_VIDEO_BYTES = 8 * 1024 * 1024


def _social_can_view_post(conn, viewer_id, post_user_id):
    if viewer_id == post_user_id:
        return True
    return post_user_id in _friend_ids(conn, viewer_id)


def _social_drive_file_id(row):
    fid = (row.get('drive_file_id') or '').strip()
    if fid:
        return fid
    return drive.parse_drive_reference(row.get('image_data') or '')


def _social_post_payload(row, viewer_id, conn):
    media_type = row.get('media_type') or _social_media_type(row.get('image_data')) or 'image'
    image_data = row.get('image_data') or ''
    drive_file_id = _social_drive_file_id(row)
    payload = {
        'id': row['id'],
        'userId': row['user_id'],
        'caption': row.get('caption') or '',
        'imageData': '',
        'mediaUrl': '',
        'mediaBytes': 0,
        'mediaType': media_type,
        'createdAt': format_dt_vn(row['created_at']),
        'author': {'id': row['user_id'], 'fullName': row['name'], 'email': row['email']},
        'isMine': row['user_id'] == viewer_id,
        'driveStored': False,
    }
    if media_type == 'video' and drive_file_id:
        token = sec.sign_media_token(viewer_id, row['id'])
        payload['mediaUrl'] = f'/api/social/media/{row["id"]}?t={token}'
        payload['driveStored'] = True
        meta = drive.get_file_metadata(drive_file_id, conn)
        if meta:
            payload['mediaBytes'] = int(meta.get('size') or 0)
    elif media_type == 'video' and image_data.startswith('data:video/'):
        payload['imageData'] = image_data
        payload['mediaBytes'] = max(0, int(len(image_data) * 0.75) - 100)
    else:
        payload['imageData'] = image_data
        if image_data.startswith('data:image/'):
            payload['mediaBytes'] = max(0, int(len(image_data) * 0.75) - 100)
    return payload


def _create_drive_video_post(conn, user, caption, raw, mime, ext):
    if not drive.is_configured(conn):
        return None, 'Đăng video cần Google Drive admin đã kết nối — liên hệ admin.'
    if len(raw) > MAX_SOCIAL_VIDEO_BYTES:
        return None, 'Video quá lớn (tối đa ~8MB). Quay ngắn hơn.'
    pid = db.insert_returning_id(conn,
        'INSERT INTO social_posts (user_id, caption, image_data, media_type) VALUES (?, ?, ?, ?)',
        (user['id'], caption, 'drive:pending', 'video'))
    drive_file_id, drive_error = drive.upload_media_bytes(
        raw, mime, ext, user['email'], pid, caption=caption, conn=conn, is_video=True)
    if not drive_file_id:
        db.execute(conn, 'DELETE FROM social_posts WHERE id = ?', (pid,))
        db.commit(conn)
        return None, drive_error or 'Không tải video lên Drive được.'
    stored = drive.drive_ref(drive_file_id)
    db.execute(conn,
        'UPDATE social_posts SET image_data = ?, drive_file_id = ? WHERE id = ?',
        (stored, drive_file_id, pid))
    db.commit(conn)
    return pid, None


def _social_user_brief(row):
    return {'id': row['id'], 'fullName': row['name'], 'email': row['email']}


def _friend_ids(conn, uid):
    rows = db.fetchall(conn, '''
        SELECT requester_id, addressee_id FROM social_friendships
        WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
    ''', (uid, uid))
    ids = set()
    for r in rows:
        other = r['addressee_id'] if r['requester_id'] == uid else r['requester_id']
        ids.add(other)
    return ids


def _friendship_between(conn, a, b):
    return db.fetchone(conn, '''
        SELECT * FROM social_friendships
        WHERE (requester_id = ? AND addressee_id = ?)
           OR (requester_id = ? AND addressee_id = ?)
        ORDER BY id DESC LIMIT 1
    ''', (a, b, b, a))


@app.route('/api/social/feed')
@auth_required
def social_feed():
    uid = request.user['id']
    conn = db.get_conn()
    visible = [uid] + list(_friend_ids(conn, uid))
    placeholders = ','.join(['?'] * len(visible))
    rows = db.fetchall(conn, f'''
        SELECT p.id, p.user_id, p.caption, p.image_data, p.media_type, p.drive_file_id,
               p.created_at, u.name, u.email
        FROM social_posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.user_id IN ({placeholders})
        ORDER BY p.created_at DESC
        LIMIT 50
    ''', tuple(visible))
    posts = [_social_post_payload(r, uid, conn) for r in rows]
    db.close(conn)
    return jsonify({'posts': posts})


@app.route('/api/social/drive/status')
@auth_required
def social_drive_status():
    conn = db.get_conn()
    row = db.fetchone(conn,
        'SELECT google_drive_refresh_token, google_drive_email, google_drive_connected_at FROM users WHERE id = ?',
        (request.user['id'],))
    configured = drive.is_configured(conn)
    method = drive.get_active_method(conn)
    oauth_admin = drive.get_oauth_admin(conn)
    folder = drive.get_backup_folder_info(conn)
    resp = {
        'configured': configured,
        'adminBackup': True,
        'method': method,
        'oauthAvailable': drive.oauth_available(),
        'backupGoogleEmail': (oauth_admin or {}).get('google_drive_email'),
    }
    if request.user['role'] == 'admin':
        resp['isAdmin'] = True
        resp['connected'] = bool(row and row.get('google_drive_refresh_token'))
        resp['googleEmail'] = row.get('google_drive_email') if row else None
        resp['connectedAt'] = format_dt_vn(row.get('google_drive_connected_at')) if row else None
        if resp['connected'] and not folder.get('photoFolderId'):
            setup = drive.setup_backup_folder_for_admin(conn)
            if setup:
                folder = {**folder, **setup}
        resp['folderName'] = folder.get('rootFolderName') or folder.get('folderName') or drive.DEFAULT_ROOT_FOLDER_NAME
        resp['folderId'] = folder.get('rootFolderId') or folder.get('folderId') or ''
        resp['photoFolderName'] = folder.get('photoFolderName') or drive.DEFAULT_PHOTO_FOLDER_NAME
        resp['videoFolderName'] = folder.get('videoFolderName') or drive.DEFAULT_VIDEO_FOLDER_NAME
        resp['photoFolderId'] = folder.get('photoFolderId') or ''
        resp['videoFolderId'] = folder.get('videoFolderId') or ''
        resp['autoSync'] = drive.get_auto_sync_status(conn)
    else:
        auto = drive.get_auto_sync_status()
        resp['autoSync'] = {
            'enabled': True,
            'running': auto.get('running'),
            'intervalSec': auto.get('intervalSec'),
        }
    db.close(conn)
    return jsonify(resp)


@app.route('/api/social/drive/oauth-setup')
@admin_required
def social_drive_oauth_setup_get():
    return jsonify(drive.get_oauth_setup_info())


@app.route('/api/social/drive/oauth-setup', methods=['POST'])
@admin_required
def social_drive_oauth_setup_post():
    d = request.get_json(silent=True) or {}
    client_id = sec.sanitize_string(d.get('clientId', ''), max_len=200)
    client_secret = sec.sanitize_string(d.get('clientSecret', ''), max_len=200)
    try:
        drive.save_oauth_credentials(client_id, client_secret)
        return jsonify({'ok': True, 'setup': drive.get_oauth_setup_info()})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f'[Drive] save oauth config error: {e}')
        return jsonify({'error': 'Không lưu được cấu hình OAuth'}), 500


@app.route('/api/social/drive/connect')
@admin_required
def social_drive_connect():
    drive.normalize_stored_oauth_credentials()
    if not drive.oauth_available():
        return jsonify({'error': 'Chưa cấu hình Google OAuth trên server (CLIENT_ID / SECRET).'}), 400
    try:
        auth_url = drive.get_oauth_connect_url(request.user['id'])
        return jsonify({'authUrl': auth_url})
    except Exception as e:
        print(f'[Drive] connect error: {e}')
        return jsonify({'error': 'Không tạo được liên kết Google — thử lại sau.'}), 500


def _drive_error_redirect(message):
    from urllib.parse import quote
    msg = quote((message or 'Không kết nối được Google Drive')[:180])
    return redirect(f'/?drive=error&drive_msg={msg}#social')


@app.route('/api/social/drive/callback')
def social_drive_callback():
    err = request.args.get('error')
    if err:
        print(f'[Drive] OAuth denied: {err}')
        return _drive_error_redirect('Google từ chối quyền — thêm email vào Test users')
    code = request.args.get('code', '').strip()
    state = request.args.get('state', '').strip()
    try:
        drive.normalize_stored_oauth_credentials()
        drive.handle_oauth_callback(code, state, authorization_response=request.url)
        return redirect('/?drive=connected#social')
    except Exception as e:
        print(f'[Drive] callback error: {e}')
        return _drive_error_redirect(str(e))


@app.route('/api/social/drive/sync', methods=['POST'])
@admin_required
def social_drive_sync():
    """Đồng bộ ảnh/video cũ vào thư mục Drive (Ảnh / Video)."""
    conn = db.get_conn()
    drive.setup_backup_folder_for_admin(conn)
    result = drive.sync_posts_without_drive(conn)
    db.close(conn)
    return jsonify(result)


@app.route('/api/social/drive/disconnect', methods=['POST'])
@admin_required
def social_drive_disconnect():
    drive.disconnect_oauth(request.user['id'])
    return jsonify({'ok': True})


@app.route('/api/social/posts/video', methods=['POST'])
@auth_required
def social_create_video_post():
    """Đăng video — lưu trên Google Drive, không nhét base64 vào DB."""
    video = request.files.get('video')
    if not video:
        return jsonify({'error': 'Thiếu file video.'}), 400
    if (video.content_length or 0) > MAX_SOCIAL_VIDEO_BYTES:
        return jsonify({'error': 'Video quá lớn (tối đa ~8MB). Quay ngắn hơn.'}), 400
    caption = sec.sanitize_string(request.form.get('caption', ''), max_len=500)
    mime = (video.mimetype or 'video/webm').lower()
    if not mime.startswith('video/'):
        return jsonify({'error': 'File không phải video hợp lệ.'}), 400
    ext = 'webm' if 'webm' in mime else 'mp4'
    raw = video.read()
    if not raw:
        return jsonify({'error': 'File video rỗng.'}), 400
    if len(raw) > MAX_SOCIAL_VIDEO_BYTES:
        return jsonify({'error': 'Video quá lớn (tối đa ~8MB). Quay ngắn hơn.'}), 400
    conn = db.get_conn()
    try:
        pid, err = _create_drive_video_post(conn, request.user, caption, raw, mime, ext)
        if err:
            return jsonify({'error': err}), 400
        token = sec.sign_media_token(request.user['id'], pid)
        return jsonify({
            'ok': True,
            'postId': pid,
            'driveSynced': True,
            'mediaUrl': f'/api/social/media/{pid}?t={token}',
        }), 201
    finally:
        db.close(conn)


@app.route('/api/social/media/<int:pid>')
def social_stream_media(pid):
    """Phát video từ Drive cho bạn bè (token ngắn hạn trên URL)."""
    token = (request.args.get('t') or '').strip()
    if not token:
        return jsonify({'error': 'Thiếu quyền xem video.'}), 401
    try:
        payload = sec.verify_media_token(token, post_id=pid)
        viewer_id = int(payload['userId'])
    except Exception:
        return jsonify({'error': 'Link video hết hạn hoặc không hợp lệ.'}), 403

    conn = db.get_conn()
    row = db.fetchone(conn, '''
        SELECT p.id, p.user_id, p.image_data, p.media_type, p.drive_file_id
        FROM social_posts p WHERE p.id = ?
    ''', (pid,))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Bài đăng không tồn tại.'}), 404
    if not _social_can_view_post(conn, viewer_id, row['user_id']):
        db.close(conn)
        return jsonify({'error': 'Bạn không có quyền xem video này.'}), 403

    media_type = row.get('media_type') or _social_media_type(row.get('image_data')) or 'image'
    if media_type != 'video':
        db.close(conn)
        return jsonify({'error': 'Bài đăng không phải video.'}), 400

    drive_file_id = _social_drive_file_id(row)
    if not drive_file_id:
        image_data = row.get('image_data') or ''
        if image_data.startswith('data:video/'):
            parsed = drive._parse_media_b64(image_data)
            db.close(conn)
            if not parsed:
                return jsonify({'error': 'Video không hợp lệ.'}), 400
            raw, mime, _ext = parsed
            from flask import Response
            return Response(raw, mimetype=mime)
        db.close(conn)
        return jsonify({'error': 'Video chưa có trên Drive.'}), 404

    meta = drive.get_file_metadata(drive_file_id, conn) or {}
    db.close(conn)
    mime = meta.get('mimeType') or 'video/webm'
    size = int(meta.get('size') or 0)

    from flask import Response
    resp = Response(drive.iter_file_chunks(drive_file_id), mimetype=mime)
    if size > 0:
        resp.headers['Content-Length'] = str(size)
    resp.headers['Accept-Ranges'] = 'bytes'
    resp.headers['Cache-Control'] = 'private, max-age=300'
    return resp


@app.route('/api/social/posts', methods=['POST'])
@auth_required
def social_create_post():
    d = request.get_json(silent=True) or {}
    caption = sec.sanitize_string(d.get('caption', ''), max_len=500)
    media = d.get('imageData') or d.get('image_data') or d.get('videoData') or d.get('video_data') or ''
    media_type = _social_media_type(media)
    if not media_type:
        return jsonify({'error': 'Ảnh/video không hợp lệ.'}), 400

    conn = db.get_conn()
    try:
        if media_type == 'video':
            parsed = drive._parse_media_b64(media)
            if not parsed:
                return jsonify({'error': 'Video không hợp lệ.'}), 400
            raw, mime, ext = parsed
            pid, err = _create_drive_video_post(conn, request.user, caption, raw, mime, ext)
            if err:
                return jsonify({'error': err}), 400
            token = sec.sign_media_token(request.user['id'], pid)
            return jsonify({
                'ok': True,
                'postId': pid,
                'driveSynced': True,
                'mediaUrl': f'/api/social/media/{pid}?t={token}',
            }), 201

        if not _valid_social_media(media):
            return jsonify({'error': 'Ảnh không hợp lệ hoặc quá lớn (~500KB).'}), 400
        parsed = drive._parse_media_b64(media)
        pid = db.insert_returning_id(conn,
            'INSERT INTO social_posts (user_id, caption, image_data, media_type) VALUES (?, ?, ?, ?)',
            (request.user['id'], caption, media, media_type))
        drive_file_id = None
        drive_error = None
        if drive.is_configured(conn):
            if parsed:
                raw, mime, ext = parsed
                drive_file_id, drive_error = drive.upload_media_bytes(
                    raw, mime, ext, request.user['email'], pid,
                    caption=caption, conn=conn, is_video=False)
            else:
                drive_file_id, drive_error = drive.upload_post_image(
                    media, request.user['email'], pid, caption, conn=conn, media_type=media_type)
            if drive_file_id:
                db.execute(conn, 'UPDATE social_posts SET drive_file_id = ? WHERE id = ?',
                           (drive_file_id, pid))
        db.commit(conn)
        resp = {'ok': True, 'postId': pid, 'driveSynced': bool(drive_file_id)}
        if drive_file_id:
            resp['driveFileId'] = drive_file_id
        if drive_error:
            resp['driveWarning'] = drive_error
        return jsonify(resp), 201
    finally:
        db.close(conn)


@app.route('/api/social/posts/<int:pid>', methods=['DELETE'])
@auth_required
def social_delete_post(pid):
    conn = db.get_conn()
    row = db.fetchone(conn, 'SELECT * FROM social_posts WHERE id = ?', (pid,))
    if not row:
        db.close(conn)
        return jsonify({'error': 'Bài đăng không tồn tại.'}), 404
    if row['user_id'] != request.user['id']:
        db.close(conn)
        return jsonify({'error': 'Chỉ xóa được bài của mình.'}), 403
    db.execute(conn, 'DELETE FROM social_posts WHERE id = ?', (pid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/social/users/search')
@auth_required
def social_search_users():
    q = sec.sanitize_string(request.args.get('q', ''), max_len=80).strip()
    if len(q) < 2:
        return jsonify({'users': []})
    uid = request.user['id']
    like = f'%{q}%'
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT id, name, email, is_blocked FROM users
        WHERE id != ? AND (LOWER(email) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?))
        ORDER BY name LIMIT 15
    ''', (uid, like, like))
    users = []
    for r in rows:
        if r.get('is_blocked'):
            continue
        fs = _friendship_between(conn, uid, r['id'])
        status = 'none'
        friendship_id = None
        if fs:
            friendship_id = fs['id']
            if fs['status'] == 'accepted':
                status = 'friends'
            elif fs['status'] == 'pending':
                status = 'outgoing' if fs['requester_id'] == uid else 'incoming'
        users.append({
            **_social_user_brief(r),
            'friendshipStatus': status,
            'friendshipId': friendship_id,
        })
    db.close(conn)
    return jsonify({'users': users})


@app.route('/api/social/friends')
@auth_required
def social_friends_list():
    uid = request.user['id']
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT f.*,
               ru.name AS req_name, ru.email AS req_email,
               au.name AS add_name, au.email AS add_email
        FROM social_friendships f
        JOIN users ru ON ru.id = f.requester_id
        JOIN users au ON au.id = f.addressee_id
        WHERE f.requester_id = ? OR f.addressee_id = ?
        ORDER BY f.updated_at DESC
    ''', (uid, uid))
    db.close(conn)
    friends, incoming, outgoing = [], [], []
    for r in rows:
        is_req = r['requester_id'] == uid
        other = {
            'id': r['addressee_id'] if is_req else r['requester_id'],
            'fullName': r['add_name'] if is_req else r['req_name'],
            'email': r['add_email'] if is_req else r['req_email'],
        }
        item = {
            'friendshipId': r['id'],
            'user': other,
            'since': str(r.get('updated_at') or r.get('created_at', '')),
        }
        if r['status'] == 'accepted':
            friends.append(item)
        elif r['status'] == 'pending':
            (outgoing if is_req else incoming).append(item)
    return jsonify({'friends': friends, 'incoming': incoming, 'outgoing': outgoing})


@app.route('/api/social/friends/request', methods=['POST'])
@auth_required
def social_friend_request():
    d = request.get_json(silent=True) or {}
    uid = request.user['id']
    target_id = d.get('userId') or d.get('user_id')
    email = (d.get('email') or '').strip().lower()
    conn = db.get_conn()
    if not target_id and email:
        row = db.fetchone(conn, 'SELECT id FROM users WHERE LOWER(email) = ?', (email,))
        if not row:
            db.close(conn)
            return jsonify({'error': 'Không tìm thấy người dùng.'}), 404
        target_id = row['id']
    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        db.close(conn)
        return jsonify({'error': 'Chọn người dùng hợp lệ.'}), 400
    if target_id == uid:
        db.close(conn)
        return jsonify({'error': 'Không thể kết bạn với chính mình.'}), 400
    target = db.fetchone(conn, 'SELECT id, is_blocked FROM users WHERE id = ?', (target_id,))
    if not target or target.get('is_blocked'):
        db.close(conn)
        return jsonify({'error': 'Người dùng không tồn tại.'}), 404
    existing = _friendship_between(conn, uid, target_id)
    if existing:
        if existing['status'] == 'accepted':
            db.close(conn)
            return jsonify({'error': 'Đã là bạn bè.'}), 400
        if existing['status'] == 'pending':
            if existing['requester_id'] == target_id and existing['addressee_id'] == uid:
                db.execute(conn,
                    f"UPDATE social_friendships SET status='accepted', updated_at={db.sql_now()} WHERE id = ?",
                    (existing['id'],))
                db.commit(conn)
                db.close(conn)
                return jsonify({'ok': True, 'status': 'accepted'})
            db.close(conn)
            return jsonify({'error': 'Đã gửi lời mời kết bạn.'}), 400
    fid = db.insert_returning_id(conn,
        'INSERT INTO social_friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)',
        (uid, target_id, 'pending'))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'friendshipId': fid, 'status': 'pending'}), 201


@app.route('/api/social/friends/respond', methods=['POST'])
@auth_required
def social_friend_respond():
    d = request.get_json(silent=True) or {}
    action = (d.get('action') or '').strip().lower()
    if action not in ('accept', 'reject'):
        return jsonify({'error': 'Hành động không hợp lệ.'}), 400
    try:
        fid = int(d.get('friendshipId') or d.get('friendship_id'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Lời mời không hợp lệ.'}), 400
    uid = request.user['id']
    conn = db.get_conn()
    row = db.fetchone(conn, 'SELECT * FROM social_friendships WHERE id = ?', (fid,))
    if not row or row['status'] != 'pending':
        db.close(conn)
        return jsonify({'error': 'Lời mời không tồn tại.'}), 404
    if row['addressee_id'] != uid:
        db.close(conn)
        return jsonify({'error': 'Bạn không thể phản hồi lời mời này.'}), 403
    if action == 'accept':
        db.execute(conn,
            f"UPDATE social_friendships SET status='accepted', updated_at={db.sql_now()} WHERE id = ?",
            (fid,))
    else:
        db.execute(conn, 'DELETE FROM social_friendships WHERE id = ?', (fid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'status': 'accepted' if action == 'accept' else 'rejected'})


# ─── Static ───
@app.route('/')
def index():
    return send_from_directory(PUBLIC, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    if path.startswith('api'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(PUBLIC, path)


_ensure_ready()

if __name__ == '__main__':
    print(f'{SITE_NAME}: http://localhost:{PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)