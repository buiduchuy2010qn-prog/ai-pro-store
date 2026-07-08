"""Sao lưu ảnh/video MXH lên Google Drive admin (OAuth hoặc Service Account)."""
import base64
import json
import os
import re
import threading
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
DRIVE_FOLDER_SETTING = 'drive_backup_folder_id'
DRIVE_FOLDER_NAME_KEY = 'drive_backup_folder_name'
DRIVE_ROOT_FOLDER_SETTING = 'drive_backup_root_folder_id'
DRIVE_ROOT_FOLDER_NAME_KEY = 'drive_backup_root_folder_name'
DRIVE_PHOTO_FOLDER_SETTING = 'drive_backup_photo_folder_id'
DRIVE_PHOTO_FOLDER_NAME_KEY = 'drive_backup_photo_folder_name'
DRIVE_VIDEO_FOLDER_SETTING = 'drive_backup_video_folder_id'
DRIVE_VIDEO_FOLDER_NAME_KEY = 'drive_backup_video_folder_name'
DRIVE_AUTO_SYNC_LAST_KEY = 'drive_auto_sync_last_at'
DRIVE_AUTO_SYNC_RESULT_KEY = 'drive_auto_sync_last_result'
DEFAULT_ROOT_FOLDER_NAME = 'Shop Đức Hi - MXH'
DEFAULT_PHOTO_FOLDER_NAME = 'Ảnh'
DEFAULT_VIDEO_FOLDER_NAME = 'Video'
DEFAULT_FOLDER_NAME = DEFAULT_ROOT_FOLDER_NAME
DRIVE_REF_PREFIX = 'drive:'
_auto_sync_started = False
_auto_sync_lock = threading.Lock()


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
    info = {
        'redirectUri': creds['redirect_uri'],
        'clientId': creds['client_id'],
        'hasClientSecret': has_secret,
        'configured': oauth_available(),
        'cloudConsoleUrl': 'https://console.cloud.google.com/apis/credentials',
        'driveApiUrl': 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    }
    if oauth_available():
        info['credentialTest'] = test_oauth_credentials()
    return info


def test_oauth_credentials():
    """Gọi Google token endpoint — invalid_grant = ID/Secret đúng."""
    import urllib.error
    import urllib.parse
    import urllib.request

    oauth = get_oauth_credentials()
    if not oauth_available():
        return {'ok': False, 'message': 'Chưa cấu hình đủ OAuth'}

    body = urllib.parse.urlencode({
        'code': 'credential-probe-invalid',
        'client_id': oauth['client_id'],
        'client_secret': oauth['client_secret'],
        'redirect_uri': oauth['redirect_uri'],
        'grant_type': 'authorization_code',
    }).encode()
    req = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=body,
        method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return {'ok': True, 'message': 'Google chấp nhận Client ID + Secret'}
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', errors='replace')
        if 'invalid_client' in raw:
            return {
                'ok': False,
                'message': 'Client Secret SAI — copy lại secret đang Bật trên Google Console',
            }
        if 'invalid_grant' in raw:
            return {'ok': True, 'message': 'Client ID + Secret đúng — có thể kết nối Google'}
        return {'ok': False, 'message': 'Google từ chối: ' + raw[:120]}
    except Exception as e:
        return {'ok': False, 'message': 'Không kiểm tra được: ' + str(e)[:120]}


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

    probe = test_oauth_credentials()
    if not probe.get('ok'):
        raise ValueError(probe.get('message') or 'Client Secret không hợp lệ')

    os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
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
        # Dùng code trực tiếp — tránh lỗi http/https trên Render reverse proxy
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
    folder_info = setup_backup_folder_for_admin(conn)
    close(conn)
    if folder_info:
        threading.Thread(target=sync_posts_without_drive, daemon=True).start()
        start_auto_sync_worker()
    return google_email


def _settings_get(conn, key):
    from database import fetchone
    row = fetchone(conn, 'SELECT value FROM ai_settings WHERE key = ?', (key,))
    return (row['value'] or '').strip() if row else ''


def _settings_set(conn, key, value):
    from database import fetchone, execute
    if fetchone(conn, 'SELECT key FROM ai_settings WHERE key = ?', (key,)):
        execute(conn, 'UPDATE ai_settings SET value = ? WHERE key = ?', (value, key))
    else:
        execute(conn, 'INSERT INTO ai_settings (key, value) VALUES (?, ?)', (key, value))


def _folder_valid(service, folder_id):
    if not folder_id:
        return False
    try:
        meta = service.files().get(fileId=folder_id, fields='id,name,trashed').execute()
        return not meta.get('trashed')
    except Exception:
        return False


def _escape_drive_query(val):
    return (val or '').replace("'", "\\'")


def _find_folder_by_name(service, name, parent_id=None):
    safe_name = _escape_drive_query(name)
    q = f"mimeType='application/vnd.google-apps.folder' and name='{safe_name}' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    else:
        q += " and 'root' in parents"
    found = service.files().list(
        q=q,
        spaces='drive',
        fields='files(id,name)',
        pageSize=5,
    ).execute().get('files', [])
    if found:
        return found[0]['id'], found[0].get('name') or name
    return None, None


def _create_folder(service, name, parent_id=None):
    body = {'name': name, 'mimeType': 'application/vnd.google-apps.folder'}
    if parent_id:
        body['parents'] = [parent_id]
    created = service.files().create(body=body, fields='id,name').execute()
    return created['id'], created.get('name') or name


def _find_or_create_folder(service, name, parent_id=None):
    folder_id, folder_name = _find_folder_by_name(service, name, parent_id=parent_id)
    if folder_id:
        return folder_id, folder_name
    folder_id, folder_name = _create_folder(service, name, parent_id=parent_id)
    print(f'[Drive] created folder: {folder_name} ({folder_id}) parent={parent_id or "root"}')
    return folder_id, folder_name


def get_backup_folder_info(conn=None):
    """Thông tin thư mục Drive — gốc + Ảnh + Video."""
    own = conn is None
    if own:
        from database import get_conn
        conn = get_conn()
    info = {
        'folderId': _settings_get(conn, DRIVE_ROOT_FOLDER_SETTING) or _settings_get(conn, DRIVE_FOLDER_SETTING),
        'folderName': _settings_get(conn, DRIVE_ROOT_FOLDER_NAME_KEY) or DEFAULT_ROOT_FOLDER_NAME,
        'rootFolderId': _settings_get(conn, DRIVE_ROOT_FOLDER_SETTING),
        'rootFolderName': _settings_get(conn, DRIVE_ROOT_FOLDER_NAME_KEY) or DEFAULT_ROOT_FOLDER_NAME,
        'photoFolderId': _settings_get(conn, DRIVE_PHOTO_FOLDER_SETTING),
        'photoFolderName': _settings_get(conn, DRIVE_PHOTO_FOLDER_NAME_KEY) or DEFAULT_PHOTO_FOLDER_NAME,
        'videoFolderId': _settings_get(conn, DRIVE_VIDEO_FOLDER_SETTING),
        'videoFolderName': _settings_get(conn, DRIVE_VIDEO_FOLDER_NAME_KEY) or DEFAULT_VIDEO_FOLDER_NAME,
    }
    if own:
        from database import close
        close(conn)
    return info


def ensure_backup_folders(service, conn):
    """
    Tạo / tìm thư mục gốc và hai thư mục con: Ảnh, Video.
    Trả về dict thông tin thư mục.
    """
    env_folder = (_cfg().get('folder_id') or '').strip()
    if env_folder:
        root_id = env_folder
        root_name = DEFAULT_ROOT_FOLDER_NAME
    else:
        root_id = _settings_get(conn, DRIVE_ROOT_FOLDER_SETTING)
        legacy_id = _settings_get(conn, DRIVE_FOLDER_SETTING)
        if not root_id and legacy_id and _folder_valid(service, legacy_id):
            root_id = legacy_id
            root_name = _settings_get(conn, DRIVE_FOLDER_NAME_KEY) or DEFAULT_ROOT_FOLDER_NAME
        elif root_id and _folder_valid(service, root_id):
            root_name = _settings_get(conn, DRIVE_ROOT_FOLDER_NAME_KEY) or DEFAULT_ROOT_FOLDER_NAME
        else:
            root_id, root_name = _find_or_create_folder(service, DEFAULT_ROOT_FOLDER_NAME, parent_id=None)

    photo_id = _settings_get(conn, DRIVE_PHOTO_FOLDER_SETTING)
    if not photo_id or not _folder_valid(service, photo_id):
        photo_id, photo_name = _find_or_create_folder(service, DEFAULT_PHOTO_FOLDER_NAME, parent_id=root_id)
    else:
        photo_name = _settings_get(conn, DRIVE_PHOTO_FOLDER_NAME_KEY) or DEFAULT_PHOTO_FOLDER_NAME

    video_id = _settings_get(conn, DRIVE_VIDEO_FOLDER_SETTING)
    if not video_id or not _folder_valid(service, video_id):
        video_id, video_name = _find_or_create_folder(service, DEFAULT_VIDEO_FOLDER_NAME, parent_id=root_id)
    else:
        video_name = _settings_get(conn, DRIVE_VIDEO_FOLDER_NAME_KEY) or DEFAULT_VIDEO_FOLDER_NAME

    _settings_set(conn, DRIVE_ROOT_FOLDER_SETTING, root_id)
    _settings_set(conn, DRIVE_ROOT_FOLDER_NAME_KEY, root_name)
    _settings_set(conn, DRIVE_PHOTO_FOLDER_SETTING, photo_id)
    _settings_set(conn, DRIVE_PHOTO_FOLDER_NAME_KEY, photo_name)
    _settings_set(conn, DRIVE_VIDEO_FOLDER_SETTING, video_id)
    _settings_set(conn, DRIVE_VIDEO_FOLDER_NAME_KEY, video_name)
    _settings_set(conn, DRIVE_FOLDER_SETTING, root_id)
    _settings_set(conn, DRIVE_FOLDER_NAME_KEY, root_name)
    from database import commit
    commit(conn)
    return {
        'rootFolderId': root_id,
        'rootFolderName': root_name,
        'photoFolderId': photo_id,
        'photoFolderName': photo_name,
        'videoFolderId': video_id,
        'videoFolderName': video_name,
        'folderId': root_id,
        'folderName': root_name,
    }


def ensure_backup_folder(service, conn, is_video=False):
    """Tương thích cũ — trả về (folder_id, folder_name) theo loại media."""
    folders = ensure_backup_folders(service, conn)
    if is_video:
        return folders['videoFolderId'], folders['videoFolderName']
    return folders['photoFolderId'], folders['photoFolderName']


def _build_drive_service(creds):
    from googleapiclient.discovery import build
    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def setup_backup_folder_for_admin(conn=None):
    """Sau khi OAuth — tạo thư mục gốc + Ảnh + Video trên Drive admin."""
    own = conn is None
    if own:
        from database import get_conn
        conn = get_conn()
    admin = get_oauth_admin(conn)
    if not admin:
        if own:
            from database import close
            close(conn)
        return None
    try:
        creds = _load_oauth_credentials(admin)
        service = _build_drive_service(creds)
        folders = ensure_backup_folders(service, conn)
        if own:
            from database import close
            close(conn)
        return folders
    except Exception as e:
        print(f'[Drive] setup folder failed: {e}')
        if own:
            from database import close
            close(conn)
        return None


def get_auto_sync_status(conn=None):
    own = conn is None
    if own:
        from database import get_conn
        conn = get_conn()
    last_raw = _settings_get(conn, DRIVE_AUTO_SYNC_LAST_KEY)
    result_raw = _settings_get(conn, DRIVE_AUTO_SYNC_RESULT_KEY)
    try:
        last_result = json.loads(result_raw) if result_raw else {}
    except Exception:
        last_result = {}
    interval = int(_cfg().get('auto_sync_interval_sec') or 120)
    status = {
        'enabled': True,
        'running': _auto_sync_started,
        'intervalSec': interval,
        'lastSyncAt': int(last_raw) if last_raw.isdigit() else None,
        'lastSynced': int(last_result.get('synced') or 0),
        'lastErrors': int(last_result.get('errors') or 0),
    }
    if own:
        from database import close
        close(conn)
    return status


def sync_posts_without_drive(conn=None, limit=None):
    """Đồng bộ ảnh/video chưa có drive_file_id lên đúng thư mục Drive."""
    from database import get_conn, fetchall, close, commit
    own = conn is None
    if own:
        conn = get_conn()
    if not is_configured(conn):
        if own:
            close(conn)
        return {'ok': False, 'synced': 0, 'photos': 0, 'videos': 0, 'message': 'Drive chưa kết nối'}

    if limit is None:
        limit = int(_cfg().get('auto_sync_batch_size') or 40)

    admin = get_oauth_admin(conn)
    if admin:
        try:
            creds = _load_oauth_credentials(admin)
            service = _build_drive_service(creds)
            ensure_backup_folders(service, conn)
        except Exception as e:
            print(f'[Drive] ensure folders before sync failed: {e}')

    rows = fetchall(conn, '''
        SELECT p.id, p.image_data, p.caption, p.media_type, u.email
        FROM social_posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.drive_file_id IS NULL OR p.drive_file_id = ''
        ORDER BY p.id ASC
        LIMIT ?
    ''', (limit,))
    synced = 0
    photos = 0
    videos = 0
    errors = 0
    for r in rows:
        img = r.get('image_data') or ''
        if img in ('drive:pending', ''):
            continue
        if is_drive_reference(img):
            fid = parse_drive_reference(img)
            if fid and fid != 'pending':
                from database import execute
                execute(conn, 'UPDATE social_posts SET drive_file_id = ? WHERE id = ?', (fid, r['id']))
                synced += 1
                if (r.get('media_type') or '') == 'video':
                    videos += 1
                else:
                    photos += 1
            continue
        if not img.startswith('data:'):
            continue
        media_type = r.get('media_type') or ''
        fid, err = upload_post_image(
            r['image_data'], r['email'], r['id'], r.get('caption') or '',
            conn=conn, media_type=media_type)
        if fid:
            from database import execute
            execute(conn, 'UPDATE social_posts SET drive_file_id = ? WHERE id = ?', (fid, r['id']))
            synced += 1
            if media_type == 'video' or str(r['image_data']).startswith('data:video/'):
                videos += 1
            else:
                photos += 1
        else:
            errors += 1
            print(f'[Drive] sync post {r["id"]} failed: {err}')
    commit(conn)
    if own:
        close(conn)
    return {
        'ok': True,
        'synced': synced,
        'photos': photos,
        'videos': videos,
        'errors': errors,
        'total': len(rows),
    }


def _auto_sync_tick():
    from database import get_conn, close, commit
    conn = get_conn()
    try:
        if not is_configured(conn):
            return
        result = sync_posts_without_drive(conn)
        _settings_set(conn, DRIVE_AUTO_SYNC_LAST_KEY, str(int(time.time())))
        _settings_set(conn, DRIVE_AUTO_SYNC_RESULT_KEY, json.dumps(result))
        commit(conn)
        if result.get('synced'):
            print(f'[Drive] auto-sync: +{result["synced"]} (ảnh {result.get("photos", 0)}, video {result.get("videos", 0)})')
    except Exception as e:
        print(f'[Drive] auto-sync error: {e}')
    finally:
        close(conn)


def auto_sync_loop():
    """Chạy nền 24/7 — tự đồng bộ ảnh/video lên Drive."""
    interval = max(30, int(_cfg().get('auto_sync_interval_sec') or 120))
    print(f'[Drive] auto-sync loop every {interval}s')
    time.sleep(5)
    while True:
        _auto_sync_tick()
        time.sleep(interval)


def start_auto_sync_worker():
    global _auto_sync_started
    with _auto_sync_lock:
        if _auto_sync_started:
            return
        _auto_sync_started = True
        threading.Thread(target=auto_sync_loop, daemon=True, name='drive-auto-sync').start()
        print('[Drive] auto-sync worker started (24/7)')


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


def _decode_b64_payload(b64_text):
    """Giải mã base64 — chịu khoảng trắng, thiếu padding (hay gặp từ trình duyệt/mobile)."""
    if not b64_text:
        return None
    cleaned = re.sub(r'\s+', '', str(b64_text))
    cleaned = cleaned.replace('-', '+').replace('_', '/')
    pad = (-len(cleaned)) % 4
    if pad:
        cleaned += '=' * pad
    for decoder in (
        lambda s: base64.b64decode(s, validate=False),
        lambda s: base64.urlsafe_b64decode(s + ('=' * ((4 - len(s) % 4) % 4))),
    ):
        try:
            raw = decoder(cleaned)
            if raw:
                return raw
        except Exception:
            continue
    return None


def _mime_to_ext(mime, default='bin'):
    m = (mime or '').lower().split(';')[0].strip()
    mapping = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg',
        'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mp4',
    }
    if m in mapping:
        return mapping[m]
    if '/' in m:
        return m.split('/')[-1][:8] or default
    return default


def _parse_media_b64(data_url):
    text = (data_url or '').strip()
    if not text:
        return None

    if is_drive_reference(text):
        return None

    marker = ';base64,'
    pos = text.lower().find(marker)
    if pos < 0:
        return None
    header = text[5:pos]
    mime = header.split(';')[0].lower().strip()
    if not (mime.startswith('image/') or mime.startswith('video/')):
        return None

    raw = _decode_b64_payload(text[pos + len(marker):])
    if not raw:
        print(f'[Drive] base64 decode failed mime={mime} len={len(text) - pos}')
        return None

    ext = _mime_to_ext(mime)
    if mime.startswith('image/') and ext == 'jpg':
        mime = 'image/jpeg'
    return raw, mime, ext


def _parse_image_b64(image_data_url):
    parsed = _parse_media_b64(image_data_url)
    if not parsed:
        return None
    mime = parsed[1]
    if not mime.startswith('image/'):
        return None
    return parsed


def is_drive_reference(data):
    return isinstance(data, str) and data.startswith(DRIVE_REF_PREFIX)


def drive_ref(file_id):
    return f'{DRIVE_REF_PREFIX}{file_id}'


def parse_drive_reference(data):
    if not is_drive_reference(data):
        return None
    fid = data[len(DRIVE_REF_PREFIX):].strip()
    return fid or None


def _get_admin_drive_service(conn):
    creds, _method = _resolve_upload_credentials(conn)
    if not creds:
        return None
    return _build_drive_service(creds)


def _user_email_slug(user_email):
    return re.sub(r'[^a-zA-Z0-9@._-]', '_', (user_email or 'user').lower())


def drive_embed_url(file_id):
    return f'https://drive.google.com/file/d/{file_id}/preview'


def share_file_anyone_reader(file_id, conn=None):
    """Cho phép xem embed Google Drive (preview iframe)."""
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()
    service = _get_admin_drive_service(conn)
    if not service:
        if own_conn:
            from database import close
            close(conn)
        return False
    try:
        service.permissions().create(
            fileId=file_id,
            body={'type': 'anyone', 'role': 'reader'},
        ).execute()
        if own_conn:
            from database import close
            close(conn)
        return True
    except Exception as e:
        print(f'[Drive] share failed file={file_id}: {e}')
        if own_conn:
            from database import close
            close(conn)
        return False


def _ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        import shutil
        return shutil.which('ffmpeg')


def _ffmpeg_run(ffmpeg, inpath, outpath, cmd_extra, timeout=120):
    import subprocess
    proc = subprocess.run(
        [ffmpeg, '-y', '-i', inpath, *cmd_extra, outpath],
        capture_output=True,
        timeout=timeout,
    )
    return proc


def ensure_playable_mp4(raw, mime, ext, fast=False):
    """Luôn trả MP4 faststart — phát được trên mobile/desktop qua stream."""
    mime_l = (mime or '').lower()
    ext_l = (ext or 'webm').lower()
    ffmpeg = _ffmpeg_exe()
    if not ffmpeg:
        if ext_l == 'mp4' or 'mp4' in mime_l:
            return raw, 'video/mp4', 'mp4'
        return raw, mime, ext
    preset = 'ultrafast' if fast else 'veryfast'
    try:
        import os
        import tempfile
        suffix = '.mp4' if ext_l == 'mp4' or 'mp4' in mime_l else '.webm'
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as inf:
            inf.write(raw)
            inpath = inf.name
        outpath = inpath + '.out.mp4'
        if suffix == '.mp4':
            cmd_extra = ['-c', 'copy', '-movflags', '+faststart']
            label = 'remux mp4 faststart'
        else:
            cmd_extra = ['-c:v', 'libx264', '-preset', preset, '-crf', '30',
                         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an']
            label = 'transcode webm→mp4'
        proc = _ffmpeg_run(ffmpeg, inpath, outpath, cmd_extra)
        if proc.returncode != 0:
            err = (proc.stderr or b'').decode('utf-8', errors='replace')[-400:]
            print(f'[Drive] ffmpeg {label} failed: {err}')
            os.unlink(inpath)
            if os.path.exists(outpath):
                os.unlink(outpath)
            if ext_l == 'mp4' or 'mp4' in mime_l:
                return raw, 'video/mp4', 'mp4'
            return raw, mime, ext
        with open(outpath, 'rb') as outf:
            out = outf.read()
        os.unlink(inpath)
        os.unlink(outpath)
        if out:
            print(f'[Drive] {label} ({len(raw)} → {len(out)} bytes)')
            return out, 'video/mp4', 'mp4'
    except Exception as e:
        print(f'[Drive] ensure_playable_mp4 skip: {e}')
    if ext_l == 'mp4' or 'mp4' in mime_l:
        return raw, 'video/mp4', 'mp4'
    return raw, mime, ext


def maybe_transcode_video_mp4(raw, mime, ext, fast=False):
    return ensure_playable_mp4(raw, mime, ext, fast=fast)


def user_owns_drive_filename(meta, user_email, prefixes=('shop-video', 'shop-video-preview')):
    """Kiểm tra tên file Drive có khớp user (dùng cho preview / đăng từ file có sẵn)."""
    name = (meta or {}).get('name') or ''
    slug = _user_email_slug(user_email)
    if slug not in name:
        return False
    return any(name.startswith(p + '-') for p in prefixes)


def upload_preview_bytes(raw, mime, ext, user_email, conn=None):
    """Upload video tạm lên Drive để xem trước — iframe Google + stream API."""
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()
    raw, mime, ext = ensure_playable_mp4(raw, mime, ext, fast=True)
    slug = _user_email_slug(user_email)
    stamp = int(time.time())
    filename = f'shop-video-preview-{slug}-{stamp}.{ext}'
    fid, err = upload_media_bytes(
        raw, mime, ext, user_email, f'preview-{stamp}', caption='', conn=conn, is_video=True,
        filename_override=filename)
    if own_conn:
        from database import close
        close(conn)
    return fid, err, mime, ext


def delete_file(file_id, conn=None):
    """Xóa file trên Drive (draft preview bị hủy)."""
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()
    service = _get_admin_drive_service(conn)
    if not service:
        if own_conn:
            from database import close
            close(conn)
        return False, 'Không kết nối được Google Drive'
    try:
        service.files().delete(fileId=file_id).execute()
        if own_conn:
            from database import close
            close(conn)
        return True, None
    except Exception as e:
        print(f'[Drive] delete failed file={file_id}: {e}')
        if own_conn:
            from database import close
            close(conn)
        return False, 'Không xóa được file trên Drive'


def upload_media_bytes(raw, mime, ext, user_email, post_id, caption='', conn=None, is_video=False, filename_override=None):
    """Upload bytes lên Drive. Trả về (file_id, error_message)."""
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()

    if not is_configured(conn):
        if own_conn:
            from database import close
            close(conn)
        return None, 'Google Drive chưa được kết nối — admin cần liên kết tài khoản Google'

    creds, method = _resolve_upload_credentials(conn)
    if not creds:
        if own_conn:
            from database import close
            close(conn)
        return None, 'Không lấy được quyền Google Drive — thử kết nối lại'

    try:
        from googleapiclient.http import MediaIoBaseUpload
    except ImportError:
        if own_conn:
            from database import close
            close(conn)
        return None, 'Thiếu thư viện Google Drive trên server'

    safe_email = _user_email_slug(user_email)
    if is_video:
        raw, mime, ext = ensure_playable_mp4(raw, mime, ext)
    if filename_override:
        filename = filename_override
    else:
        prefix = 'shop-video' if is_video else 'shop-anh'
        filename = f'{prefix}-{safe_email}-{post_id}.{ext}'

    try:
        service = _build_drive_service(creds)
        folder_id, folder_name = ensure_backup_folder(service, conn, is_video=is_video)
        meta = {
            'name': filename,
            'parents': [folder_id],
            'description': (caption or '')[:500],
        }
        media = MediaIoBaseUpload(BytesIO(raw), mimetype=mime, resumable=False)
        created = service.files().create(
            body=meta,
            media_body=media,
            fields='id,webViewLink,size,mimeType',
        ).execute()
        print(f'[Drive] uploaded post={post_id} via {method} -> {folder_name} file={created.get("id")}')
        if own_conn:
            from database import close
            close(conn)
        return created.get('id'), None
    except Exception as e:
        print(f'[Drive] upload failed post={post_id}: {e}')
        if own_conn:
            from database import close
            close(conn)
        return None, 'Không upload được lên Drive — kiểm tra quyền thư mục hoặc kết nối lại Google'


def upload_post_image(image_data_url, user_email, post_id, caption='', conn=None, media_type=None):
    """
    Upload ảnh/video bài đăng vào Drive (ưu tiên OAuth admin, fallback Service Account).
    Trả về (file_id, error_message).
    """
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()

    if is_drive_reference(image_data_url):
        fid = parse_drive_reference(image_data_url)
        if own_conn:
            from database import close
            close(conn)
        return fid, None

    parsed = _parse_media_b64(image_data_url)
    if not parsed:
        if own_conn:
            from database import close
            close(conn)
        return None, 'Media không hợp lệ để đồng bộ Drive'
    raw, mime, ext = parsed
    is_video = (media_type == 'video') or mime.startswith('video/')
    return upload_media_bytes(
        raw, mime, ext, user_email, post_id, caption=caption, conn=conn, is_video=is_video)


def get_file_metadata(file_id, conn=None):
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()
    service = _get_admin_drive_service(conn)
    if not service:
        if own_conn:
            from database import close
            close(conn)
        return None
    try:
        meta = service.files().get(fileId=file_id, fields='id,size,mimeType,name').execute()
        if own_conn:
            from database import close
            close(conn)
        return meta
    except Exception as e:
        print(f'[Drive] metadata failed file={file_id}: {e}')
        if own_conn:
            from database import close
            close(conn)
        return None


def iter_file_chunks(file_id, conn=None, chunk_size=262144):
    """Stream nội dung file từ Drive theo từng chunk."""
    own_conn = conn is None
    if own_conn:
        from database import get_conn
        conn = get_conn()
    service = _get_admin_drive_service(conn)
    if not service:
        if own_conn:
            from database import close
            close(conn)
        return
    try:
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError:
        if own_conn:
            from database import close
            close(conn)
        return

    request = service.files().get_media(fileId=file_id)
    buffer = BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=chunk_size)
    done = False
    while not done:
        _, done = downloader.next_chunk()
        buffer.seek(0)
        data = buffer.read()
        buffer.seek(0)
        buffer.truncate(0)
        if data:
            yield data
    if own_conn:
        from database import close
        close(conn)