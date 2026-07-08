"""Cache MP4 preview trên disk — phát trực tiếp từ server, không round-trip Drive."""
import json
import os
import re
import time
from pathlib import Path

_PREVIEW_DIR = Path(os.environ.get('DATA_DIR', 'data')) / 'video_previews'
_PREVIEW_TTL_SEC = 2 * 3600
_KEY_RE = re.compile(r'^[a-zA-Z0-9_-]{8,64}$')


def _ensure_dir():
    _PREVIEW_DIR.mkdir(parents=True, exist_ok=True)


def _meta_path(key):
    return _PREVIEW_DIR / f'{key}.json'


def _mp4_path(key):
    return _PREVIEW_DIR / f'{key}.mp4'


def save_preview(key, user_id, mp4_bytes, drive_file_id=None):
    if not _KEY_RE.match(key or ''):
        raise ValueError('Preview key không hợp lệ.')
    _ensure_dir()
    _mp4_path(key).write_bytes(mp4_bytes)
    _meta_path(key).write_text(json.dumps({
        'userId': int(user_id),
        'driveFileId': drive_file_id or '',
        'created': int(time.time()),
        'size': len(mp4_bytes),
    }), encoding='utf-8')
    return key


def get_preview_meta(key):
    if not _KEY_RE.match(key or ''):
        return None
    p = _meta_path(key)
    if not p.is_file():
        return None
    try:
        meta = json.loads(p.read_text(encoding='utf-8'))
        if int(time.time()) - int(meta.get('created') or 0) > _PREVIEW_TTL_SEC:
            delete_preview(key)
            return None
        return meta
    except Exception:
        return None


def get_preview_mp4_path(key):
    if not get_preview_meta(key):
        return None
    p = _mp4_path(key)
    return p if p.is_file() else None


def user_owns_preview(key, user_id):
    meta = get_preview_meta(key)
    return bool(meta and int(meta.get('userId') or 0) == int(user_id))


def delete_preview(key):
    if not _KEY_RE.match(key or ''):
        return
    for suffix in ('.mp4', '.json'):
        p = _PREVIEW_DIR / f'{key}{suffix}'
        try:
            if p.is_file():
                p.unlink()
        except OSError:
            pass


def purge_stale():
    _ensure_dir()
    now = int(time.time())
    for meta_file in _PREVIEW_DIR.glob('*.json'):
        try:
            meta = json.loads(meta_file.read_text(encoding='utf-8'))
            if now - int(meta.get('created') or 0) > _PREVIEW_TTL_SEC:
                delete_preview(meta_file.stem)
        except Exception:
            pass