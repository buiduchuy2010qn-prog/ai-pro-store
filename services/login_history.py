"""
Login history + device parsing for profile security.
- login_logs: success/failed attempts (no passwords)
- enriches user_sessions with device/browser/os/geo
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import database as db
from services import security as sec

# ── Giờ Việt Nam (UTC+7) ──
VN_TZ = timezone(timedelta(hours=7))


def format_dt_vn(val) -> str:
    """Mọi thời gian hiển thị cho user/admin = giờ Việt Nam dd/mm/yyyy HH:mm:ss."""
    if val is None or val == '':
        return ''
    s = str(val).strip()
    # Đã format sẵn kiểu VN
    if re.match(r'^\d{2}/\d{2}/\d{4}', s):
        return s
    try:
        clean = s.replace('Z', '').replace('z', '')
        if ' ' in clean and 'T' not in clean:
            clean = clean.replace(' ', 'T', 1)
        # bỏ microseconds dài
        if '.' in clean:
            main, frac = clean.split('.', 1)
            frac = re.split(r'[+-]', frac)[0][:6]
            clean = main + ('.' + frac if frac.isdigit() else '')
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            # SQLite/UTC naive → coi là UTC
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(VN_TZ).strftime('%d/%m/%Y %H:%M:%S')
    except Exception:
        return s


def now_vn_iso() -> str:
    """Lưu log theo mốc UTC (ISO); hiển thị qua format_dt_vn."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')


# ── Geo cache (in-process) ──
_GEO_CACHE = {}
_GEO_TTL = 86400  # 24h


def ensure_tables(conn=None):
    """Tạo bảng login_logs + cột mở rộng user_sessions."""
    own = conn is None
    if own:
        conn = db.get_conn()
    n = db.sql_now()
    try:
        if db.IS_PG:
            db.execute(conn, '''
                CREATE TABLE IF NOT EXISTS login_logs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    email_attempt TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    device_type TEXT,
                    browser TEXT,
                    os TEXT,
                    country TEXT,
                    city TEXT,
                    status TEXT NOT NULL DEFAULT 'failed',
                    reason TEXT,
                    session_jti TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            ''')
            db.execute(conn, 'CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id)')
            db.execute(conn, 'CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC)')
        else:
            db.execute(conn, f'''
                CREATE TABLE IF NOT EXISTS login_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    email_attempt TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    device_type TEXT,
                    browser TEXT,
                    os TEXT,
                    country TEXT,
                    city TEXT,
                    status TEXT NOT NULL DEFAULT 'failed',
                    reason TEXT,
                    session_jti TEXT,
                    created_at TEXT DEFAULT ({n}),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            ''')
            try:
                db.execute(conn, 'CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id)')
            except Exception:
                pass

        # Enrich user_sessions
        for col, typ in [
            ('device_type', 'TEXT'),
            ('browser', 'TEXT'),
            ('os', 'TEXT'),
            ('country', 'TEXT'),
            ('city', 'TEXT'),
        ]:
            try:
                if db.IS_PG:
                    db.execute(conn, f'ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS {col} {typ}')
                else:
                    db.execute(conn, f'ALTER TABLE user_sessions ADD COLUMN {col} {typ}')
            except Exception:
                pass
        if own:
            db.commit(conn)
    finally:
        if own:
            db.close(conn)


# ─── User-Agent parsing (no external lib) ───
def parse_user_agent(ua: str) -> dict:
    s = ua or ''
    # Browser
    browser = 'Khác'
    if 'CocCoc' in s or 'coc_coc' in s.lower() or 'Cốc Cốc' in s:
        browser = 'Cốc Cốc'
    elif 'Edg/' in s or 'Edge/' in s:
        browser = 'Edge'
    elif 'OPR/' in s or 'Opera' in s:
        browser = 'Opera'
    elif 'Firefox/' in s or 'FxiOS' in s:
        browser = 'Firefox'
    elif 'Chrome/' in s and 'Chromium' not in s:
        browser = 'Chrome'
    elif 'Safari/' in s and 'Chrome' not in s and 'Chromium' not in s:
        browser = 'Safari'
    elif 'MSIE' in s or 'Trident/' in s:
        browser = 'Internet Explorer'

    # OS
    os_name = 'Khác'
    if re.search(r'Windows NT 10', s):
        os_name = 'Windows 10/11'
    elif re.search(r'Windows NT 6\.3', s):
        os_name = 'Windows 8.1'
    elif re.search(r'Windows NT 6\.1', s):
        os_name = 'Windows 7'
    elif re.search(r'Windows', s, re.I):
        os_name = 'Windows'
    elif re.search(r'Android', s, re.I):
        m = re.search(r'Android\s([\d.]+)', s)
        os_name = f"Android {m.group(1)}" if m else 'Android'
    elif re.search(r'iPhone|iPad|iPod', s, re.I):
        m = re.search(r'OS\s([\d_]+)', s)
        ver = m.group(1).replace('_', '.') if m else ''
        os_name = f'iOS {ver}'.strip() if ver else 'iOS'
    elif re.search(r'Mac OS X|Macintosh', s, re.I):
        os_name = 'macOS'
    elif re.search(r'Linux', s, re.I):
        os_name = 'Linux'
    elif re.search(r'CrOS', s):
        os_name = 'Chrome OS'

    # Device type
    device_type = 'Desktop'
    if re.search(r'iPad|Tablet|PlayBook', s, re.I):
        device_type = 'Tablet'
    elif re.search(r'Mobile|iPhone|iPod|Android.*Mobile|webOS|BlackBerry', s, re.I):
        device_type = 'Mobile'
    elif re.search(r'Android', s, re.I) and not re.search(r'Mobile', s, re.I):
        device_type = 'Tablet'

    return {
        'deviceType': device_type,
        'browser': browser,
        'os': os_name,
        'deviceLabel': f'{device_type} · {browser} · {os_name}',
    }


def lookup_geo(ip: str) -> dict:
    """Vị trí gần đúng theo IP (ip-api.com free, cache 24h). Không dùng GPS."""
    ip = (ip or '').strip()
    empty = {'country': '', 'city': '', 'isp': '', 'label': 'Không xác định'}
    if not ip or ip in ('0.0.0.0', '::1', '127.0.0.1'):
        return {**empty, 'label': 'Mạng cục bộ'}
    if ip.startswith(('10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.',
                      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
                      '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.')):
        return {**empty, 'label': 'Mạng nội bộ (LAN)'}

    now = time.time()
    cached = _GEO_CACHE.get(ip)
    if cached and now - cached[0] < _GEO_TTL:
        return cached[1]

    result = empty.copy()
    try:
        url = f'http://ip-api.com/json/{ip}?fields=status,country,city,isp&lang=en'
        req = urllib.request.Request(url, headers={'User-Agent': 'AIProStore/1.0'})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='replace'))
        if data.get('status') == 'success':
            country = data.get('country') or ''
            city = data.get('city') or ''
            isp = data.get('isp') or ''
            label = ', '.join([x for x in (city, country) if x]) or country or 'Internet'
            result = {'country': country, 'city': city, 'isp': isp, 'label': label}
    except Exception:
        result = {**empty, 'label': 'Internet (theo IP)'}

    _GEO_CACHE[ip] = (now, result)
    return result


def record_login(
    conn,
    *,
    user_id=None,
    email_attempt='',
    ip='',
    user_agent='',
    status='failed',
    reason='',
    session_jti=None,
):
    """Ghi login_logs. status: success | failed. Không lưu mật khẩu."""
    ensure_tables(conn)
    ua_info = parse_user_agent(user_agent)
    geo = lookup_geo(ip)
    db.execute(conn, '''
        INSERT INTO login_logs
            (user_id, email_attempt, ip_address, user_agent, device_type, browser, os,
             country, city, status, reason, session_jti, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user_id,
        (email_attempt or '')[:254],
        (ip or '')[:64],
        (user_agent or '')[:512],
        ua_info['deviceType'],
        ua_info['browser'],
        ua_info['os'],
        geo.get('country') or '',
        geo.get('city') or '',
        status if status in ('success', 'failed') else 'failed',
        (reason or '')[:200],
        session_jti,
        now_vn_iso(),
    ))
    return ua_info, geo


def enrich_session(conn, jti, ip, user_agent):
    """Cập nhật device/geo cho session vừa tạo."""
    if not jti:
        return
    ensure_tables(conn)
    ua_info = parse_user_agent(user_agent)
    geo = lookup_geo(ip)
    try:
        db.execute(conn, '''
            UPDATE user_sessions
            SET device_type = ?, browser = ?, os = ?, country = ?, city = ?
            WHERE jti = ?
        ''', (
            ua_info['deviceType'], ua_info['browser'], ua_info['os'],
            geo.get('country') or '', geo.get('city') or '', jti,
        ))
    except Exception as e:
        print(f'[login_history] enrich_session: {e}')


def is_new_device(conn, user_id, fingerprint, user_agent) -> bool:
    """True nếu fingerprint/UA chưa từng success gần đây."""
    if not user_id:
        return False
    # Trusted devices
    if fingerprint and sec.is_trusted_device(conn, user_id, fingerprint):
        return False
    # Any prior success log with same browser+os roughly
    ua_info = parse_user_agent(user_agent)
    row = db.fetchone(conn, '''
        SELECT id FROM login_logs
        WHERE user_id = ? AND status = 'success' AND browser = ? AND os = ?
        LIMIT 1
    ''', (user_id, ua_info['browser'], ua_info['os']))
    if row:
        return False
    # Prior session with same fingerprint
    if fingerprint:
        s = db.fetchone(conn, '''
            SELECT id FROM user_sessions WHERE user_id = ? AND fingerprint = ? LIMIT 1
        ''', (user_id, fingerprint))
        if s:
            return False
    return True


def fmt_log(row, current_jti=None) -> dict:
    if not row:
        return None
    status = row.get('status') or 'failed'
    country = row.get('country') or ''
    city = row.get('city') or ''
    loc = ', '.join([x for x in (city, country) if x]) or (
        'Mạng cục bộ' if (row.get('ip_address') or '') in ('127.0.0.1', '::1') else 'Internet (theo IP)'
    )
    return {
        'id': row['id'],
        'userId': row.get('user_id'),
        'emailAttempt': row.get('email_attempt') or '',
        'ipAddress': row.get('ip_address') or '',
        'userAgent': (row.get('user_agent') or '')[:120],
        'deviceType': row.get('device_type') or 'Desktop',
        'browser': row.get('browser') or 'Khác',
        'os': row.get('os') or 'Khác',
        'country': country,
        'city': city,
        'location': loc,
        'status': status,
        'statusLabel': 'Thành công' if status == 'success' else 'Thất bại',
        'reason': row.get('reason') or '',
        'isCurrentSession': bool(current_jti and row.get('session_jti') == current_jti),
        'createdAt': format_dt_vn(row.get('created_at')),
    }


def list_user_logs(conn, user_id, status=None, limit=50, offset=0, q_ip=None):
    ensure_tables(conn)
    sql = 'SELECT * FROM login_logs WHERE user_id = ?'
    params = [user_id]
    if status in ('success', 'failed'):
        sql += ' AND status = ?'
        params.append(status)
    if q_ip:
        sql += ' AND ip_address LIKE ?'
        params.append(f'%{q_ip}%')
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?'
    params.extend([int(limit), int(offset)])
    rows = db.fetchall(conn, sql, tuple(params))
    return [fmt_log(r) for r in rows]


def list_admin_logs(conn, user_id, status=None, limit=100, offset=0, q_ip=None):
    return list_user_logs(conn, user_id, status=status, limit=limit, offset=offset, q_ip=q_ip)


def fmt_session(row, current_jti=None) -> dict:
    if not row:
        return None
    jti = row.get('jti') or ''
    ua = row.get('user_agent') or ''
    ua_info = parse_user_agent(ua)
    device = row.get('device_type') or ua_info['deviceType']
    browser = row.get('browser') or ua_info['browser']
    os_name = row.get('os') or ua_info['os']
    country = row.get('country') or ''
    city = row.get('city') or ''
    loc = ', '.join([x for x in (city, country) if x]) or 'Internet (theo IP)'
    return {
        'id': row['id'],
        'jti': jti,
        'ipAddress': row.get('ip') or '',
        'userAgent': ua[:120],
        'deviceType': device,
        'browser': browser,
        'os': os_name,
        'deviceLabel': f'{device} · {browser}',
        'location': loc,
        'country': country,
        'city': city,
        'isActive': not bool(row.get('revoked')),
        'isCurrent': bool(current_jti and jti == current_jti),
        'createdAt': format_dt_vn(row.get('created_at')),
        'lastActiveAt': format_dt_vn(row.get('last_seen')),
        'revoked': bool(row.get('revoked')),
    }


def list_sessions(conn, user_id, current_jti=None, active_only=False):
    ensure_tables(conn)
    sql = 'SELECT * FROM user_sessions WHERE user_id = ?'
    params = [user_id]
    if active_only:
        sql += ' AND revoked = ?'
        params.append(db.bool_val(False))
    sql += ' ORDER BY last_seen DESC LIMIT 30'
    rows = db.fetchall(conn, sql, tuple(params))
    return [fmt_session(r, current_jti) for r in rows]


def revoke_session(conn, user_id, session_id=None, jti=None, except_jti=None):
    if session_id:
        row = db.fetchone(conn, 'SELECT id, jti FROM user_sessions WHERE id = ? AND user_id = ?',
                          (session_id, user_id))
        if not row:
            return False, 'Không tìm thấy phiên.'
        db.execute(conn, 'UPDATE user_sessions SET revoked = ? WHERE id = ?',
                   (db.bool_val(True), session_id))
        return True, None
    if jti:
        db.execute(conn, 'UPDATE user_sessions SET revoked = ? WHERE user_id = ? AND jti = ?',
                   (db.bool_val(True), user_id, jti))
        return True, None
    if except_jti is not None:
        sec.revoke_all_sessions(conn, user_id, except_jti=except_jti)
        return True, None
    return False, 'Thiếu tham số.'


def try_security_email(to_email, ip, ua_info, geo):
    """Gửi email cảnh báo thiết bị mới nếu SMTP có cấu hình."""
    try:
        from services.email_service import send_security_alert_email
        send_security_alert_email(
            to_email,
            ip=ip,
            device=ua_info.get('deviceLabel') or ua_info.get('deviceType'),
            browser=ua_info.get('browser'),
            os_name=ua_info.get('os'),
            location=geo.get('label') if geo else '',
        )
    except Exception as e:
        print(f'[login_history] security email skip: {e}')
