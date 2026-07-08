"""Defense-in-Depth security layer for Shop của Đức Hi."""
import hashlib
import json
import re
import secrets
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from functools import wraps

import bleach
import jwt

import database as db
from config import JWT_SECRET, SECURITY, SITE_NAME, ZALO_PHONE

# ─── In-memory rate limit buckets (per-process; DB backs login locks) ───
_buckets = {}
_ALERT_COOLDOWN = {}

SEVERITY = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}

DANGEROUS_PATTERNS = [
    re.compile(r'(\bUNION\b.*\bSELECT\b)', re.I),
    re.compile(r'(\bDROP\b.*\bTABLE\b)', re.I),
    re.compile(r'(\bINSERT\b.*\bINTO\b)', re.I),
    re.compile(r'(<script[\s>])', re.I),
    re.compile(r'(javascript:)', re.I),
    re.compile(r'(on\w+\s*=)', re.I),
    re.compile(r'(\.\./)', re.I),
]

SENSITIVE_PATHS = {
    '/api/auth/login': ('auth_login', SECURITY['rate_auth_per_min']),
    '/api/login': ('auth_login', SECURITY['rate_auth_per_min']),
    '/api/auth/register': ('auth_register', SECURITY['rate_auth_per_min']),
    '/api/register': ('auth_register', SECURITY['rate_auth_per_min']),
    '/api/auth/forgot-password': ('auth_forgot', SECURITY['rate_auth_per_min']),
    '/api/auth/verify-otp': ('auth_otp', SECURITY['rate_auth_per_min']),
    '/api/auth/reset-password': ('auth_reset', SECURITY['rate_auth_per_min']),

    '/api/ai/chat': ('ai_chat', SECURITY['rate_ai_per_min']),
    '/api/support/chat': ('ai_chat', SECURITY['rate_ai_per_min']),
}

WRITE_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})

CSRF_EXEMPT = frozenset({
    '/api/casso/webhook',
    '/api/bank/webhook',
    '/api/webhook/bank-transaction',
    '/api/health',
    '/api/security/bootstrap',
    '/api/security/turnstile-config',
    '/api/social/drive/callback',
})


def _now():
    return datetime.utcnow()


def _now_iso():
    return _now().isoformat()


def client_ip(req):
    forwarded = (req.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
    return forwarded or req.remote_addr or '0.0.0.0'


def client_fingerprint(req):
    return (req.headers.get('X-Device-Fingerprint') or '').strip()[:128]


def client_ua(req):
    return (req.headers.get('User-Agent') or '')[:512]


def is_https(req):
    if req.is_secure:
        return True
    proto = (req.headers.get('X-Forwarded-Proto') or '').lower()
    return proto == 'https'


# ─── Layer 1: Security Headers ───
def apply_security_headers(response, req):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # camera=(self) — cho phép MXH chụp ảnh trên cùng domain; mic/geo vẫn tắt
    response.headers['Permissions-Policy'] = 'camera=(self), microphone=(), geolocation=()'
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    response.headers['Cross-Origin-Resource-Policy'] = 'same-site'
    response.headers['X-XSS-Protection'] = '0'
    response.headers.pop('Server', None)

    if SECURITY.get('csp_enabled', True):
        turnstile = ' https://challenges.cloudflare.com' if SECURITY.get('turnstile_site_key') else ''
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net"
            f"{turnstile}; "
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https://challenges.cloudflare.com; "
            "frame-src https://challenges.cloudflare.com; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "object-src 'none'; "
            "upgrade-insecure-requests"
        )
        response.headers['Content-Security-Policy'] = csp

    if is_https(req) or SECURITY.get('force_hsts'):
        response.headers['Strict-Transport-Security'] = (
            f"max-age={SECURITY['hsts_max_age']}; includeSubDomains; preload"
        )

    origin = req.headers.get('Origin', '')
    allowed = SECURITY.get('cors_origins') or []
    if origin and (origin in allowed or SECURITY.get('cors_allow_same_host')):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Vary'] = 'Origin'
    return response


def handle_cors_preflight(req):
    if req.method != 'OPTIONS':
        return None
    origin = req.headers.get('Origin', '')
    allowed = SECURITY.get('cors_origins') or []
    if origin and origin in allowed:
        from flask import make_response
        resp = make_response('', 204)
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = (
            'Content-Type, Authorization, X-CSRF-Token, X-Device-Fingerprint, X-Request-Id'
        )
        resp.headers['Access-Control-Max-Age'] = '600'
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        return resp
    return None


# ─── Layer 2: Rate Limiting ───
def _bucket_key(kind, ident):
    return f'{kind}:{ident}'


def rate_limit(kind, ident, limit, window_sec=60):
    now = time.time()
    key = _bucket_key(kind, ident)
    hits = [t for t in _buckets.get(key, []) if now - t < window_sec]
    if len(hits) >= limit:
        return False, max(1, int(window_sec - (now - hits[0])))
    hits.append(now)
    _buckets[key] = hits
    return True, 0


def check_global_rate_limit(req):
    ip = client_ip(req)
    path = req.path

    ok, retry = rate_limit('global_ip', ip, SECURITY['rate_global_per_min'], 60)
    if not ok:
        log_event('rate_limit_global', 'medium', ip=ip, details={'path': path, 'retry': retry})
        return False, f'Quá nhiều yêu cầu. Thử lại sau {retry}s.', retry

    if path in SENSITIVE_PATHS:
        kind, limit = SENSITIVE_PATHS[path]
        ok, retry = rate_limit(kind, ip, limit, 60)
        if not ok:
            log_event('rate_limit_endpoint', 'medium', ip=ip, details={'path': path, 'kind': kind})
            return False, f'Thao tác quá nhanh. Thử lại sau {retry}s.', retry

    if req.method in WRITE_METHODS and path.startswith('/api/'):
        ok, retry = rate_limit('write_ip', ip, SECURITY['rate_write_per_min'], 60)
        if not ok:
            return False, f'Quá nhiều thao tác ghi. Thử lại sau {retry}s.', retry

    return True, '', 0


# ─── Layer 3: Input Validation & Sanitization ───
def sanitize_string(val, max_len=500, allow_html=False):
    if val is None:
        return ''
    s = str(val).strip()
    if len(s) > max_len:
        s = s[:max_len]
    if not allow_html:
        s = bleach.clean(s, tags=[], attributes={}, strip=True)
    for pat in DANGEROUS_PATTERNS:
        if pat.search(s):
            raise ValueError('Nội dung chứa ký tự không được phép.')
    return s


def sanitize_email(email):
    email = sanitize_string(email, max_len=254).lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        raise ValueError('Email không hợp lệ.')
    return email


def sanitize_password(pw):
    pw = str(pw or '')
    if len(pw) < SECURITY['password_min_length']:
        raise ValueError(f'Mật khẩu tối thiểu {SECURITY["password_min_length"]} ký tự.')
    if len(pw) > 128:
        raise ValueError('Mật khẩu quá dài.')
    return pw


MEDIA_PAYLOAD_KEYS = frozenset({'imageData', 'image_data', 'image', 'photo', 'snapshot', 'videoData', 'video_data'})
IMAGE_PAYLOAD_KEYS = MEDIA_PAYLOAD_KEYS
MAX_IMAGE_STRING_LEN = 800_000
MAX_VIDEO_STRING_LEN = 12_000_000
SOCIAL_POST_MAX_BODY = 14_000_000
SOCIAL_VIDEO_UPLOAD_MAX_BODY = 10 * 1024 * 1024


def scan_payload(obj, depth=0, parent_key=None):
    if depth > 8:
        raise ValueError('Payload quá sâu.')
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str):
                sanitize_string(k, max_len=120)
            key = k if isinstance(k, str) else None
            scan_payload(v, depth + 1, parent_key=key)
    elif isinstance(obj, list):
        if len(obj) > 200:
            raise ValueError('Danh sách quá dài.')
        for item in obj:
            scan_payload(item, depth + 1, parent_key=parent_key)
    elif isinstance(obj, str):
        if parent_key in MEDIA_PAYLOAD_KEYS and obj.startswith('data:video/'):
            limit = MAX_VIDEO_STRING_LEN
        elif parent_key in MEDIA_PAYLOAD_KEYS:
            limit = MAX_IMAGE_STRING_LEN
        else:
            limit = 20000
        if len(obj) > limit:
            raise ValueError('Chuỗi quá dài.')
        if parent_key in MEDIA_PAYLOAD_KEYS and (
            obj.startswith('data:image/') or obj.startswith('data:video/')
        ):
            return
        for pat in DANGEROUS_PATTERNS:
            if pat.search(obj):
                raise ValueError('Payload chứa nội dung nguy hiểm.')


def validate_request_body(req):
    if req.method not in WRITE_METHODS:
        return
    if not req.path.startswith('/api/'):
        return
    if req.path in CSRF_EXEMPT:
        return
    cl = req.content_length or 0
    max_bytes = SECURITY['max_body_bytes']
    if req.path == '/api/social/posts' and req.method == 'POST':
        max_bytes = max(max_bytes, SOCIAL_POST_MAX_BODY)
    if req.path == '/api/social/posts/video' and req.method == 'POST':
        max_bytes = max(max_bytes, SOCIAL_VIDEO_UPLOAD_MAX_BODY)
        if not req.is_json:
            return
    if cl > max_bytes:
        raise ValueError('Payload quá lớn.')
    if req.is_json:
        data = req.get_json(silent=True)
        if data is not None:
            scan_payload(data)


# ─── CSRF (double-submit: bootstrap token + header) ───
_csrf_tokens = {}


def issue_csrf_token(ip):
    token = secrets.token_urlsafe(32)
    _csrf_tokens[token] = {'ip': ip, 'exp': time.time() + SECURITY['csrf_ttl_sec']}
    _purge_csrf()
    return token


def _purge_csrf():
    now = time.time()
    expired = [k for k, v in _csrf_tokens.items() if v['exp'] < now]
    for k in expired:
        _csrf_tokens.pop(k, None)


def validate_csrf(req):
    if req.method not in WRITE_METHODS:
        return True
    if not req.path.startswith('/api/'):
        return True
    if req.path in CSRF_EXEMPT:
        return True
    if req.headers.get('Authorization', '').startswith('Bearer '):
        token_hdr = (req.headers.get('X-CSRF-Token') or '').strip()
        if not token_hdr:
            return SECURITY.get('csrf_relaxed', True)
        rec = _csrf_tokens.get(token_hdr)
        if not rec or rec['exp'] < time.time():
            return False
        return True
    return True


# ─── Turnstile ───
def verify_turnstile(token, ip):
    secret = SECURITY.get('turnstile_secret_key', '')
    if not secret:
        return True
    if not token:
        return False
    payload = json.dumps({'secret': secret, 'response': token, 'remoteip': ip}).encode()
    req = urllib.request.Request(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            return bool(data.get('success'))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return False


# ─── Layer 4: Auth, Sessions, Device Trust ───
def sign_token(uid, session_jti=None, hours=None):
    hours = hours or SECURITY['jwt_expire_hours']
    jti = session_jti or secrets.token_hex(16)
    payload = {
        'userId': uid,
        'jti': jti,
        'iat': int(time.time()),
        'exp': int(time.time()) + hours * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256'), jti


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])


def is_session_valid(conn, uid, jti):
    if not jti:
        return True
    row = db.fetchone(conn,
        'SELECT id, revoked FROM user_sessions WHERE user_id = ? AND jti = ?',
        (uid, jti))
    if not row:
        return SECURITY.get('legacy_jwt_allowed', True)
    return not bool(row.get('revoked'))


def create_session(conn, uid, jti, ip, ua, fingerprint):
    if db.IS_PG:
        db.execute(conn, '''
            INSERT INTO user_sessions (user_id, jti, ip, user_agent, fingerprint)
            VALUES (?, ?, ?, ?, ?)
        ''', (uid, jti, ip, ua, fingerprint))
        db.execute(conn, '''
            UPDATE users SET last_login_at = NOW(), last_login_ip = ?, last_fingerprint = ?
            WHERE id = ?
        ''', (ip, fingerprint, uid))
    else:
        db.execute(conn, '''
            INSERT INTO user_sessions (user_id, jti, ip, user_agent, fingerprint, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (uid, jti, ip, ua, fingerprint, _now_iso(), _now_iso()))
        db.execute(conn,
            'UPDATE users SET last_login_at = ?, last_login_ip = ?, last_fingerprint = ? WHERE id = ?',
            (_now_iso(), ip, fingerprint, uid))
    _enforce_session_limit(conn, uid)


def _enforce_session_limit(conn, uid):
    limit = SECURITY['max_sessions_per_user']
    rows = db.fetchall(conn,
        'SELECT id, jti FROM user_sessions WHERE user_id = ? AND revoked = ? ORDER BY last_seen DESC',
        (uid, db.bool_val(False)))
    for row in rows[limit:]:
        db.execute(conn, 'UPDATE user_sessions SET revoked = ? WHERE id = ?',
                   (db.bool_val(True), row['id']))


def revoke_all_sessions(conn, uid, except_jti=None):
    if except_jti:
        db.execute(conn,
            'UPDATE user_sessions SET revoked = ? WHERE user_id = ? AND jti != ?',
            (db.bool_val(True), uid, except_jti))
    else:
        db.execute(conn,
            'UPDATE user_sessions SET revoked = ? WHERE user_id = ?',
            (db.bool_val(True), uid))


def touch_session(conn, uid, jti):
    if not jti:
        return
    db.execute(conn,
        'UPDATE user_sessions SET last_seen = ? WHERE user_id = ? AND jti = ? AND revoked = ?',
        (_now_iso(), uid, jti, db.bool_val(False)))


def is_trusted_device(conn, uid, fingerprint):
    if not fingerprint:
        return False
    row = db.fetchone(conn,
        'SELECT id FROM trusted_devices WHERE user_id = ? AND fingerprint = ?',
        (uid, fingerprint))
    return bool(row)


def trust_device(conn, uid, fingerprint, ip, label=''):
    if not fingerprint:
        return
    existing = db.fetchone(conn,
        'SELECT id FROM trusted_devices WHERE user_id = ? AND fingerprint = ?',
        (uid, fingerprint))
    if existing:
        if db.IS_PG:
            db.execute(conn,
                'UPDATE trusted_devices SET last_used = NOW(), ip = ? WHERE id = ?',
                (ip, existing['id']))
        else:
            db.execute(conn,
                'UPDATE trusted_devices SET last_used = ?, ip = ? WHERE id = ?',
                (_now_iso(), ip, existing['id']))
    else:
        if db.IS_PG:
            db.execute(conn, '''
                INSERT INTO trusted_devices (user_id, fingerprint, label, ip)
                VALUES (?, ?, ?, ?)
            ''', (uid, fingerprint, label[:80], ip))
        else:
            db.execute(conn, '''
                INSERT INTO trusted_devices (user_id, fingerprint, label, ip, trusted_at, last_used)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (uid, fingerprint, label[:80], ip, _now_iso(), _now_iso()))


def user_is_pro(conn, uid):
    row = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM orders WHERE user_id = ? AND status = 'completed'",
        (uid,))
    return int(row['c'] or 0) > 0


def record_login_attempt(conn, email, ip, ua, fingerprint, success):
    db.execute(conn, '''
        INSERT INTO login_attempts (email, ip, user_agent, fingerprint, success, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (email, ip, ua, fingerprint, db.bool_val(success), _now_iso()))


def get_failed_attempts(conn, email, ip, minutes=30):
    since = (_now() - timedelta(minutes=minutes)).isoformat()
    by_email = db.fetchone(conn,
        'SELECT COUNT(*) AS c FROM login_attempts WHERE email = ? AND success = ? AND created_at > ?',
        (email, db.bool_val(False), since))
    by_ip = db.fetchone(conn,
        'SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND success = ? AND created_at > ?',
        (ip, db.bool_val(False), since))
    return int(by_email['c'] or 0), int(by_ip['c'] or 0)


def is_account_locked(user):
    locked = user.get('locked_until')
    if not locked:
        return False, 0
    if isinstance(locked, str):
        locked_dt = datetime.fromisoformat(locked.replace('Z', ''))
    else:
        locked_dt = locked
    if _now() < locked_dt:
        remain = int((locked_dt - _now()).total_seconds())
        return True, max(remain, 60)
    return False, 0


def lock_account(conn, uid, minutes=None):
    minutes = minutes or SECURITY['lockout_minutes']
    until = (_now() + timedelta(minutes=minutes)).isoformat()
    db.execute(conn,
        'UPDATE users SET locked_until = ?, failed_login_count = failed_login_count + 1 WHERE id = ?',
        (until, uid))
    log_event('account_locked', 'high', user_id=uid, details={'minutes': minutes}, conn=conn)


def clear_lock(conn, uid):
    db.execute(conn,
        'UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = ?', (uid,))


def create_step_up_token(uid, email, fingerprint, ip):
    payload = {
        'type': 'step_up',
        'userId': uid,
        'email': email,
        'fingerprint': fingerprint,
        'ip': ip,
        'exp': int(time.time()) + SECURITY['step_up_ttl_sec'],
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def sign_media_token(user_id, post_id, hours=6):
    payload = {
        'type': 'social_media',
        'userId': int(user_id),
        'postId': int(post_id),
        'iat': int(time.time()),
        'exp': int(time.time()) + hours * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verify_media_token(token, post_id=None):
    payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    if payload.get('type') != 'social_media':
        raise ValueError('Token media không hợp lệ.')
    if post_id is not None and int(payload.get('postId', 0)) != int(post_id):
        raise ValueError('Token media không khớp bài đăng.')
    return payload


def sign_preview_token(user_id, drive_file_id, hours=2):
    payload = {
        'type': 'social_preview',
        'userId': int(user_id),
        'driveFileId': str(drive_file_id),
        'iat': int(time.time()),
        'exp': int(time.time()) + hours * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verify_preview_token(token, file_id=None):
    payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    if payload.get('type') != 'social_preview':
        raise ValueError('Token preview không hợp lệ.')
    if file_id is not None and str(payload.get('driveFileId', '')) != str(file_id):
        raise ValueError('Token preview không khớp file.')
    return payload


def sign_preview_file_token(user_id, preview_key, hours=2):
    payload = {
        'type': 'social_preview_file',
        'userId': int(user_id),
        'previewKey': str(preview_key),
        'iat': int(time.time()),
        'exp': int(time.time()) + hours * 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def verify_preview_file_token(token, preview_key=None):
    payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    if payload.get('type') != 'social_preview_file':
        raise ValueError('Token preview file không hợp lệ.')
    if preview_key is not None and str(payload.get('previewKey', '')) != str(preview_key):
        raise ValueError('Token preview file không khớp.')
    return payload


def verify_step_up_token(token, uid, fingerprint, ip):
    payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    if payload.get('type') != 'step_up':
        raise ValueError('Token step-up không hợp lệ.')
    if int(payload['userId']) != int(uid):
        raise ValueError('Token step-up không khớp user.')
    if payload.get('fingerprint') and fingerprint and payload['fingerprint'] != fingerprint:
        raise ValueError('Thiết bị không khớp.')
    if payload.get('ip') and ip and payload['ip'] != ip:
        raise ValueError('IP không khớp.')
    return payload


def needs_step_up(conn, user, fingerprint):
    if user.get('role') == 'admin':
        if fingerprint and not is_trusted_device(conn, user['id'], fingerprint):
            return True
        return False
    if not user_is_pro(conn, user['id']):
        return False
    if SECURITY.get('step_up_all_pro'):
        if not is_trusted_device(conn, user['id'], fingerprint):
            return True
    last_fp = (user.get('last_fingerprint') or '').strip()
    if last_fp and fingerprint and last_fp != fingerprint:
        return True
    return False


def check_account_transfer_risk(conn, user, fingerprint, ip):
    """Anti-reselling heuristics for Pro accounts."""
    risks = []
    uid = user['id']
    if not user_is_pro(conn, uid):
        return risks, 0

    if fingerprint and not is_trusted_device(conn, uid, fingerprint):
        risks.append('new_device')

    orders = db.fetchall(conn,
        'SELECT contact_email, contact_phone FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 5',
        (uid,))
    account_email = (user.get('email') or '').lower()
    for o in orders:
        ce = (o.get('contact_email') or '').strip().lower()
        if ce and ce != account_email:
            risks.append('contact_email_mismatch')
            break

    recent_ips = db.fetchall(conn, '''
        SELECT ip FROM login_attempts
        WHERE email = ? AND success = ? AND created_at > ?
        GROUP BY ip
        LIMIT 10
    ''', (account_email, db.bool_val(True), (_now() - timedelta(days=7)).isoformat()))
    ips = {r['ip'] for r in recent_ips if r.get('ip')}
    if len(ips) >= SECURITY['suspicious_ip_count'] and ip not in ips:
        risks.append('multi_ip_week')

    score_penalty = len(risks) * 15
    if risks:
        log_event('account_transfer_risk', 'high', user_id=uid, ip=ip,
                  details={'risks': risks, 'fingerprint': fingerprint[:16]}, conn=conn)
    return risks, score_penalty


def adjust_trust_score(conn, uid, delta):
    row = db.fetchone(conn, 'SELECT trust_score FROM users WHERE id = ?', (uid,))
    if not row:
        return
    new_score = max(0, min(100, int(row.get('trust_score') or 100) - delta))
    db.execute(conn, 'UPDATE users SET trust_score = ? WHERE id = ?', (new_score, uid))
    if new_score < SECURITY['trust_block_threshold']:
        db.execute(conn, 'UPDATE users SET is_blocked = ? WHERE id = ?',
                   (db.bool_val(True), uid))
        log_event('account_auto_blocked', 'critical', user_id=uid,
                  details={'trust_score': new_score}, conn=conn)


# ─── TOTP 2FA ───
def generate_totp_secret():
    import pyotp
    return pyotp.random_base32()


def get_totp_uri(secret, email):
    import pyotp
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=SITE_NAME)


def verify_totp(secret, code):
    import pyotp
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(str(code).strip(), valid_window=1)


# ─── Layer 5: Logging & Alerts ───
def log_event(event_type, severity, user_id=None, ip=None, details=None, conn=None):
    own_conn = conn is None
    if own_conn:
        conn = db.get_conn()
    try:
        db.execute(conn, '''
            INSERT INTO security_events (event_type, severity, user_id, ip, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            event_type,
            severity,
            user_id,
            ip or '',
            json.dumps(details or {}, ensure_ascii=False)[:4000],
            _now_iso(),
        ))
        if own_conn:
            db.commit(conn)
        if SEVERITY.get(severity, 0) >= SEVERITY['high']:
            _maybe_alert(event_type, severity, user_id, ip, details)
    finally:
        if own_conn:
            db.close(conn)


def _maybe_alert(event_type, severity, user_id, ip, details):
    webhook = SECURITY.get('alert_webhook_url', '')
    if not webhook:
        return
    key = f'{event_type}:{user_id or ip}'
    now = time.time()
    if now - _ALERT_COOLDOWN.get(key, 0) < SECURITY['alert_cooldown_sec']:
        return
    _ALERT_COOLDOWN[key] = now
    body = json.dumps({
        'site': SITE_NAME,
        'event': event_type,
        'severity': severity,
        'userId': user_id,
        'ip': ip,
        'details': details,
        'time': _now_iso(),
    }).encode()
    try:
        req = urllib.request.Request(webhook, data=body, headers={'Content-Type': 'application/json'}, method='POST')
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def get_security_dashboard(conn, limit=50):
    events = db.fetchall(conn, '''
        SELECT id, event_type, severity, user_id, ip, details, created_at
        FROM security_events ORDER BY id DESC LIMIT ?
    ''', (limit,))
    pending = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM security_events WHERE severity IN ('high','critical') "
        f"AND created_at > ?", ((_now() - timedelta(hours=24)).isoformat(),))
    locked = db.fetchone(conn,
        f"SELECT COUNT(*) AS c FROM users WHERE locked_until > ?", (_now_iso(),))
    for e in events:
        e['created_at'] = str(e['created_at'])
        try:
            e['details'] = json.loads(e['details'] or '{}')
        except json.JSONDecodeError:
            e['details'] = {}
    return {
        'recentEvents': events,
        'criticalLast24h': int(pending['c'] or 0),
        'lockedAccounts': int(locked['c'] or 0),
    }


# ─── Flask middleware helpers ───
def before_request_hook(req):
    preflight = handle_cors_preflight(req)
    if preflight is not None:
        return preflight

    if req.path.startswith('/api/') and req.path != '/api/health':
        try:
            validate_request_body(req)
        except ValueError as e:
            log_event('invalid_payload', 'medium', ip=client_ip(req),
                      details={'path': req.path, 'error': str(e)})
            from flask import jsonify
            return jsonify({'error': str(e)}), 400

        ok, msg, retry = check_global_rate_limit(req)
        if not ok:
            from flask import jsonify
            return jsonify({'error': msg, 'retryAfter': retry}), 429

        if not validate_csrf(req):
            log_event('csrf_failed', 'high', ip=client_ip(req), details={'path': req.path})
            from flask import jsonify
            return jsonify({'error': 'CSRF token không hợp lệ. Tải lại trang.'}), 403

    return None


def auth_guard(decode_fn):
    """Wrap auth_required to validate JWT session + touch last_seen."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            from flask import request, jsonify
            h = request.headers.get('Authorization', '')
            if not h.startswith('Bearer '):
                return jsonify({'error': 'Chưa đăng nhập.'}), 401
            try:
                payload = decode_fn(h[7:])
                uid = payload['userId']
                jti = payload.get('jti')
                conn = db.get_conn()
                user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
                if not user:
                    db.close(conn)
                    return jsonify({'error': 'Tài khoản không tồn tại.'}), 401
                if user.get('is_blocked'):
                    db.close(conn)
                    return jsonify({'error': 'Tài khoản đã bị khóa.'}), 403
                if not is_session_valid(conn, uid, jti):
                    db.close(conn)
                    return jsonify({'error': 'Phiên đăng nhập đã bị thu hồi. Đăng nhập lại.'}), 401
                touch_session(conn, uid, jti)
                db.commit(conn)
                db.close(conn)
                request.jwt_payload = payload
                return f(*args, **kwargs)
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Phiên đăng nhập đã hết hạn. Đăng nhập lại.'}), 401
            except Exception:
                return jsonify({'error': 'Phiên đăng nhập không hợp lệ.'}), 401
        return wrapper
    return decorator