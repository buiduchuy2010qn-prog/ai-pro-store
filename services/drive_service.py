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


def _cfg():
    from config import GOOGLE_DRIVE
    return GOOGLE_DRIVE


def oauth_available():
    c = _cfg()
    return bool(c.get('oauth_client_id') and c.get('oauth_client_secret') and c.get('oauth_redirect_uri'))


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

    c = _cfg()
    state = make_oauth_state(user_id)
    flow = Flow.from_client_config(
        {
            'web': {
                'client_id': c['oauth_client_id'],
                'client_secret': c['oauth_client_secret'],
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=DRIVE_SCOPES,
        state=state,
    )
    flow.redirect_uri = c['oauth_redirect_uri']
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


def handle_oauth_callback(code, state):
    if not code or not state:
        raise ValueError('Thiếu mã xác thực Google')

    from google_auth_oauthlib.flow import Flow
    from database import get_conn, fetchone, execute, commit, close, sql_now

    user_id = verify_oauth_state(state)
    c = _cfg()
    flow = Flow.from_client_config(
        {
            'web': {
                'client_id': c['oauth_client_id'],
                'client_secret': c['oauth_client_secret'],
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=DRIVE_SCOPES,
        state=state,
    )
    flow.redirect_uri = c['oauth_redirect_uri']
    flow.fetch_token(code=code)
    creds = flow.credentials
    refresh = creds.refresh_token
    if not refresh:
        raise ValueError('Google không trả refresh token — thử ngắt kết nối và bấm lại')

    google_email = _fetch_google_email(creds)
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

    c = _cfg()
    creds = Credentials(
        token=None,
        refresh_token=admin_row['google_drive_refresh_token'],
        token_uri='https://oauth2.googleapis.com/token',
        client_id=c['oauth_client_id'],
        client_secret=c['oauth_client_secret'],
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