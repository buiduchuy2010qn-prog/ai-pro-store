"""Sao lưu ảnh MXH lên Google Drive admin (Service Account — quản lý ảnh mọi user)."""
import base64
import json
import os
import re
from io import BytesIO

DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']


def is_configured():
    folder = (os.getenv('GOOGLE_DRIVE_FOLDER_ID') or '').strip()
    if not folder:
        return False
    if (os.getenv('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON') or '').strip():
        return True
    path = (os.getenv('GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE') or '').strip()
    return bool(path and os.path.isfile(path))


def _load_credentials():
    from google.oauth2 import service_account

    raw = (os.getenv('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON') or '').strip()
    if raw:
        info = json.loads(raw)
        return service_account.Credentials.from_service_account_info(info, scopes=DRIVE_SCOPES)
    path = (os.getenv('GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE') or '').strip()
    if path and os.path.isfile(path):
        return service_account.Credentials.from_service_account_file(path, scopes=DRIVE_SCOPES)
    return None


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


def upload_post_image(image_data_url, user_email, post_id, caption=''):
    """
    Upload ảnh bài đăng vào thư mục Drive đã cấu hình.
    Trả về (file_id, error_message).
    """
    if not is_configured():
        return None, 'Google Drive chưa cấu hình trên server'

    parsed = _parse_image_b64(image_data_url)
    if not parsed:
        return None, 'Ảnh không hợp lệ để đồng bộ Drive'
    raw, mime, ext = parsed

    creds = _load_credentials()
    if not creds:
        return None, 'Không đọc được Service Account Google Drive'

    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseUpload
    except ImportError:
        return None, 'Thiếu thư viện Google Drive trên server'

    folder_id = os.getenv('GOOGLE_DRIVE_FOLDER_ID', '').strip()
    safe_email = re.sub(r'[^a-zA-Z0-9@._-]', '_', (user_email or 'user').lower())
    filename = f'shop-anh-{safe_email}-{post_id}.{ext}'

    try:
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)
        meta = {
            'name': filename,
            'parents': [folder_id],
            'description': (caption or '')[:500],
        }
        media = MediaIoBaseUpload(BytesIO(raw), mimetype=mime, resumable=False)
        created = service.files().create(
            body=meta,
            media_body=media,
            fields='id,webViewLink',
        ).execute()
        return created.get('id'), None
    except Exception as e:
        print(f'[Drive] upload failed post={post_id}: {e}')
        return None, 'Không upload được lên Drive — kiểm tra quyền thư mục'