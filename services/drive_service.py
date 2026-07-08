"""Sao lưu ảnh MXH lên Google Drive admin (OAuth hoặc Service Account)."""
import base64
import json
import os
import re
import time
from io import BytesIO

import jwt
from dotenv import load_dotenv

load_dotenv()

DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
]


DRIVE_OAUTH_KEYS = ('drive_oauth_client_id', 'drive_oauth_client_secret')


def _cfg():
    from config import GOOGLE_DRIVE
    return GOOGLE_DRIVE


def _oauth_from_db():
    try:
        from database import get_conn, fetchall, close
        conn = get_conn()
        rows = {
            r['key']: (r['value'] or '').strip()
            for r in fetchall(conn, f'''
                SELECT key, value FROM ai_settings
                WHERE key IN ({",".join("?" * len(DRIVE_OAUTH_KEYS))})
            ''', DRIVE_OAUTH_KEYS)
        }
        close(conn)
        return rows.get('drive_oauth_client_id', ''), rows.get('drive_oauth_client_secret', '')
    except Exception as e:
        print(f'[Drive] read oauth settings failed: {e}')
        return '', ''


def _clean_oauth_value(val):
    """Bỏ mọi khoảng trắng — hay bị dính khi copy/paste từ Google Console."""
    return re.sub(r'\s+', '', (val or '').strip())


def get_oauth_credentials():
    """Ưu tiên biến môi trường, fallback cấu hình admin lưu trên web."""
    c = _cfg()
    db_id, db_secret = _oauth_from_db()
    return {
        'client_id': _clean_oauth_value(c.get('oauth_client_id') or db_id),
        'client_secret': _clean_oauth_value(c.get('oauth_client_secret') or db_secret),
        'redirect_uri': (c.get('oauth_redirect_uri') or '').strip(),
    }


def oauth_available():
    creds = get_oauth_credentials()
    return bool(creds['client_id'] and creds['client_secret'] and creds['redirect_uri'])


def normalize_stored_oauth_credentials():
    """Sửa Client ID/Secret đã lưu bị dính khoảng trắng."""
    from database import get_conn, fetchall, fetchone, execute, commit, close
    conn = get_conn()
    rows = {
        r['key']: r['value']
        for r in fetchall(conn, f'''
            SELECT key, value FROM ai_settings
            WHERE key IN ({",".join("?" * len(DRIVE_OAUTH_KEYS))})
        ''', DRIVE_OAUTH_KEYS)
    }
    changed = False
    for key in DRIVE_OAUTH_KEYS:
        raw = rows.get(key) or ''
        cleaned = _clean_oauth_value(raw)
        if raw and cleaned != raw:
            if fetchone(conn, 'SELECT key FROM ai_settings WHERE key = ?', (key,)):
                execute(conn, 'UPDATE ai_settings SET value = ? WHERE key = ?', (cleaned, key))
            changed = True
    if changed:
        commit(conn)
    close(conn)
    return changed


def get_oauth_setup_info():
    normalize_stored_oauth_credentials()
    creds = get_oauth_credentials()
    has_secret = bool(creds['client_secret'])
    return {
        'redirectUri': creds['redirect_uri'],
        'clientId': creds['client_id'],
        'hasClientSecret': has_secret,
        'configured': oauth_available(),
        'cloudConsoleUrl': 'https://console.cloud.google.com/apis/credentials',
        'driveApiUrl': 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    }


def _validate_oauth_credentials(client_id, client_secret):
    client_id = _clean_oauth_value(client_id)
    client_secret = _clean_oauth_value(client_secret)
    if not client_id:
        raise ValueError('Client ID không được để trống')
    if not client_secret:
        raise ValueError('Client Secret không được để trống')
    if not re.match(r'^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$', client_id):
        raise ValueError(
            'Client ID sai định dạng — phải kết thúc bằng .apps.googleusercontent.com '
            '(không dán Project ID hay Client Secret vào ô này)'
        )
    if not re.match(r'^GOCSPX-[a-zA-Z0-9_-]+$', client_secret):
        raise ValueError(
            'Client Secret sai định dạng — phải bắt đầu bằng GOCSPX- '
            '(không dán Client ID vào ô Secret)'
        )
    return client_id, client_secret


def save_oauth_credentials(client_id, client_secret):
    from database import get_conn, fetchone, execute, commit, close
    client_id, client_secret = _validate_oauth_credentials(client_id, client_secret)
    conn = get_conn()
    for key, val in (
        ('drive_oauth_client_id', client_id),
        ('drive_oauth_client_secret', client_secret),
    ):
        if fetchone(conn, 'SELECT key FROM ai_settings WHERE key = ?', (key,)):
            execute(conn, 'UPDATE ai_settings SET value = ? WHERE key = ?', (val, key))
        else:
            execute(conn, 'INSERT INTO ai_settings (key, value) VALUES (?, ?)', (key, val))
    commit(conn)
    close(conn)
    if not oauth_available():
        raise ValueError('OAuth chưa đủ thông tin — kiểm tra lại Client ID và Secret')


def _service_account_configured():
    folder = (_cfg().get('folder_id') or '').strip()
    if not folder:
        return False
    if (_cfg().get('service_account_json') or '').strip():
        return True
    path = (_cfg().get('service_account_file') or '').strip()
    return bool(path and os.path.isfile(path))


def get_oauth_admin(conn):
    from database import fetchone
    return fetchone(conn, '''
        SELECT id, email, google_drive_refresh_token, google_drive_email, google_drive_connected_at
        FROM users
        WHERE role = 'admin'
          AND google_drive_refresh_token IS NOT NULL
          AND google_drive_refresh_token != ''
        ORDER BY google_drive_connected_at DESC, id ASC
        LIMIT 1
    ''')


def is_configured(conn=None):
    if conn is not None and get_oauth_admin(conn):
        return True
    return _service_account_configured()


def get_active_method(conn):
    if get_oauth_admin(conn):
        return 'oauth'
    if _service_account_configured():
        return 'service_account'
    return 'none'


def _oauth_state_secret():
    from config import JWT_SECRET
    return JWT_SECRET


def make_oauth_state(user_id):
    return jwt.encode({
        'purpose': 'drive_oauth',
        'userId': int(user_id),
        'exp': int(time.time()) + 600,
    }, _oauth_state_secret(), algorithm='HS256')


def verify_oauth_state(state):
    payload = jwt.decode(state, _oauth_state_secret(), algorithms=['HS256'])
    if payload.get('purpose') != 'drive_oauth':
        raise ValueError('State OAuth không hợp lệ')
    return int(payload['userId'])


def get_oauth_connect_url(user_id):
    if not oauth_available():
        raise ValueError('Google OAuth chưa cấu hình trên server')

    from google_auth_oauthlib.flow import Flow

    creds = get_oauth_credentials()
    state = make_oauth_state(user_id)
    flow = Flow.from_client_config(
        {
            'web': {
                'client_id': creds['client_id'],
                'client_secret': creds['client_secret'],
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=DRIVE_SCOPES,
        state=state,
    )
    flow.redirect_uri = creds['redirect_uri']
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
    )
    return auth_url


def _fetch_google_email(creds):
    try:
        from googleapiclient.discovery import build
        service = build('oauth2', 'v2', credentials=creds, cache_discovery=False)
        info = service.userinfo().get().execute()
        return (info.get('email') or '').strip().lower()
    except Exception as e:
        print(f'[Drive] userinfo failed: {e}')
        return ''


def _email_from_id_token(id_token):
    if not id_token:
        return ''
    try:
        payload = id_token.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
        return (data.get('email') or '').strip().lower()
    except Exception:
        return ''


def handle_oauth_callback(code, state, authorization_response=None):
    if not code or not state:
        raise ValueError('Thiếu mã xác thực Google')

    # Google thường trả thêm scope openid/profile — tránh lỗi fetch_token
    os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'

    from google_auth_oauthlib.flow import Flow
    from database import get_conn, fetchone, execute, commit, close, sql_now

    user_id = verify_oauth_state(state)
    oauth = get_oauth_credentials()
    flow = Flow.from_client_config(
        {
            'web': {
                'client_id': oauth['client_id'],
                'client_secret': oauth['client_secret'],
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=DRIVE_SCOPES,
        state=state,
    )
    flow.redirect_uri = oauth['redirect_uri']
    try:
        if authorization_response:
            flow.fetch_token(authorization_response=authorization_response)
        else:
            flow.fetch_token(code=code)
    except Exception as e:
        msg = str(e).lower()
        if 'invalid_client' in msg:
            raise ValueError('Client Secret sai — copy lại secret đang Bật trên Google Console')
        if 'invalid_grant' in msg:
            raise ValueError('Mã Google hết hạn — bấm Kết nối lại')
        if 'scope' in msg:
            raise ValueError('Lỗi scope OAuth — thử kết nối lại')
        raise
    creds = flow.credentials
    refresh = creds.refresh_token
    if not refresh:
        raise ValueError('Google không trả refresh token — thử ngắt kết nối và bấm lại')

    google_email = _fetch_google_email(creds) or _email_from_id_token(getattr(creds, 'id_token', None))
    conn = get_conn()
    admin = fetchone(conn, 'SELECT id, role FROM users WHERE id = ?', (user_id,))
    if not admin or admin.get('role') != 'admin':
        close(conn)
        raise ValueError('Chỉ admin mới kết nối Drive')

    now = sql_now()
    execute(conn, f'''
        UPDATE users
        SET google_drive_refresh_token = ?, google_drive_email = ?, google_drive_connected_at = {now}
        WHERE id = ?
    ''', (refresh, google_email or None, user_id))
    commit(conn)
    close(conn)
    return google_email


def disconnect_oauth(user_id):
    from database import get_conn, execute, commit, close
    conn = get_conn()
    execute(conn, '''
        UPDATE users
        SET google_drive_refresh_token = NULL, google_drive_email = NULL, google_drive_connected_at = NULL
        WHERE id = ?
    ''', (user_id,))
    commit(conn)
    close(conn)


def _load_service_account_credentials():
    from google.oauth2 import service_account

    c = _cfg()
    raw = (c.get('service_account_json') or '').strip()
    if raw:
        info = json.loads(raw)
        return service_account.Credentials.from_service_account_info(info, scopes=DRIVE_SCOPES)
    path = (c.get('service_account_file') or '').strip()
    if path and os.path.isfile(path):
        return service_account.Credentials.from_service_account_file(path, scopes=DRIVE_SCOPES)
    return None


def _load_oauth_credentials(admin_row):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    oauth = get_oauth_credentials()
    creds = Credentials(
        token=None,
        refresh_token=admin_row['google_drive_refresh_token'],
        token_uri='https://oauth2.googleapis.com/token',
        client_id=oauth['client_id'],
        client_secret=oauth['client_secret'],
        scopes=DRIVE_SCOPES,
    )
    creds.refresh(Request())
    return creds


def _resolve_upload_credentials(conn):
    admin = get_oauth_admin(conn)
    if admin:
        try:
            return _load_oauth_credentials(admin), 'oauth'
        except Exception as e:
            print(f'[Drive] OAuth refresh failed: {e}')
    if _service_account_configured():
        creds = _load_service_account_credentials()
        if creds:
            return creds, 'service_account'
    return None, 'none'


def _parse_image_b64(image_data_url):
    m = re.match(r'^data:image/(jpeg|jpg|png|webp);base64,(.+)$', image_data_url or '', re.I)
    if not m:
        return None
    fmt = m.group(1).lower()
    ext = 'jpg' if fmt == 'jpeg' else fmt
    mime = 'image/jpeg' if ext == 'jpg' else f'image/{ext}'
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except Exception:
        return None
    return raw, mime, ext


def upload_post_image(image_data_url, user_email, post_id, caption='', conn=None):
    """
    Upload ảnh bài đăng vào Drive (ưu tiên OAuth admin, fallback Service Account).
    Trả về (file_id, error_message).
    """
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()

    if not is_configured(conn):
        if own_conn:
            from database import close
            close(conn)
        return None, 'Google Drive chưa được kết nối — admin cần liên kết tài khoản Google'

    parsed = _parse_image_b64(image_data_url)
    if not parsed:
        if own_conn:
            from database import close
            close(conn)
        return None, 'Ảnh không hợp lệ để đồng bộ Drive'
    raw, mime, ext = parsed

    creds, method = _resolve_upload_credentials(conn)
    if own_conn:
        from database import close
        close(conn)

    if not creds:
        return None, 'Không lấy được quyền Google Drive — thử kết nối lại'

    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseUpload
    except ImportError:
        return None, 'Thiếu thư viện Google Drive trên server'

    folder_id = (_cfg().get('folder_id') or '').strip()
    safe_email = re.sub(r'[^a-zA-Z0-9@._-]', '_', (user_email or 'user').lower())
    filename = f'shop-anh-{safe_email}-{post_id}.{ext}'

    try:
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)
        meta = {
            'name': filename,
            'description': (caption or '')[:500],
        }
        if folder_id:
            meta['parents'] = [folder_id]
        media = MediaIoBaseUpload(BytesIO(raw), mimetype=mime, resumable=False)
        created = service.files().create(
            body=meta,
            media_body=media,
            fields='id,webViewLink',
        ).execute()
        print(f'[Drive] uploaded post={post_id} via {method} file={created.get("id")}')
        return created.get('id'), None
    except Exception as e:
        print(f'[Drive] upload failed post={post_id}: {e}')
        return None, 'Không upload được lên Drive — kiểm tra quyền thư mục hoặc kết nối lại Google'