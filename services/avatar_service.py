"""Phòng Thay Đồ — avatar items, outfits, purchases."""
import json

import database as db

VALID_CATEGORIES = {
    'background', 'body', 'eyes', 'hair', 'top', 'bottom', 'shoes',
    'hat', 'glasses', 'accessory', 'makeup', 'effect',
}
VALID_GENDERS = {'male', 'female', 'all'}
CATEGORY_ORDER = {
    'background': 1, 'body': 2, 'eyes': 3, 'makeup': 4, 'hair': 5,
    'top': 6, 'bottom': 7, 'shoes': 8, 'hat': 9, 'glasses': 10,
    'accessory': 11, 'effect': 12,
}

# (name, category, gender, price, is_free, preview, layer_key)
SEED_AVATAR_ITEMS = [
    ('Nền xanh pastel', 'background', 'all', 0, True, '🌤️', 'bg-sky'),
    ('Nền hồng cute', 'background', 'all', 0, True, '🌸', 'bg-pink'),
    ('Nền tím mơ', 'background', 'all', 0, True, '💜', 'bg-violet'),
    ('Nền VIP vàng', 'background', 'all', 10000, False, '✨', 'bg-vip'),
    ('Nền đêm sao', 'background', 'all', 12000, False, '🌙', 'bg-night'),
    ('Body nam cơ bản', 'body', 'male', 0, True, '👨', 'body-male'),
    ('Body nữ cơ bản', 'body', 'female', 0, True, '👩', 'body-female'),
    ('Mắt nâu', 'eyes', 'all', 0, True, '👁️', 'eyes-brown'),
    ('Mắt xanh', 'eyes', 'all', 0, True, '💙', 'eyes-blue'),
    ('Mắt tím idol', 'eyes', 'all', 8000, False, '💜', 'eyes-violet'),
    ('Tóc đen ngắn', 'hair', 'all', 0, True, '💇', 'hair-black-short'),
    ('Tóc nâu dài', 'hair', 'all', 0, True, '💁', 'hair-brown-long'),
    ('Tóc xanh neon', 'hair', 'all', 12000, False, '🧢', 'hair-blue-neon'),
    ('Tóc hồng twin', 'hair', 'female', 15000, False, '🎀', 'hair-pink-twin'),
    ('Áo thun trắng', 'top', 'all', 0, True, '👕', 'top-white-tee'),
    ('Áo sơ mi xanh', 'top', 'all', 0, True, '👔', 'top-blue-shirt'),
    ('Hoodie đen', 'top', 'all', 18000, False, '🖤', 'top-hoodie-black'),
    ('Áo vest nam', 'top', 'male', 25000, False, '🤵', 'top-vest-male'),
    ('Áo blouse nữ', 'top', 'female', 20000, False, '👚', 'top-blouse'),
    ('Quần jean', 'bottom', 'all', 0, True, '👖', 'bottom-jeans'),
    ('Váy hồng', 'bottom', 'female', 0, True, '👗', 'bottom-skirt-pink'),
    ('Váy dạ hội', 'bottom', 'female', 20000, False, '💃', 'bottom-gown'),
    ('Quần suit nam', 'bottom', 'male', 22000, False, '🕴️', 'bottom-suit-male'),
    ('Giày sneaker', 'shoes', 'all', 0, True, '👟', 'shoes-sneaker'),
    ('Giày boot', 'shoes', 'all', 10000, False, '🥾', 'shoes-boot'),
    ('Giày cao gót', 'shoes', 'female', 15000, False, '👠', 'shoes-heel'),
    ('Mũ bucket', 'hat', 'all', 5000, False, '🧢', 'hat-bucket'),
    ('Mũ beret', 'hat', 'all', 8000, False, '🎩', 'hat-beret'),
    ('Kính tròn', 'glasses', 'all', 0, True, '👓', 'glasses-round'),
    ('Kính thời trang', 'glasses', 'all', 8000, False, '🕶️', 'glasses-fashion'),
    ('Túi xách', 'accessory', 'all', 12000, False, '👜', 'acc-bag'),
    ('Khăn cổ', 'accessory', 'all', 6000, False, '🧣', 'acc-scarf'),
    ('Son hồng nhẹ', 'makeup', 'all', 0, True, '💄', 'makeup-lip-pink'),
    ('Trang điểm idol', 'makeup', 'all', 15000, False, '✨', 'makeup-idol'),
    ('Má hồng', 'makeup', 'all', 8000, False, '🌸', 'makeup-blush'),
    ('Hiệu ứng sparkle', 'effect', 'all', 10000, False, '⭐', 'fx-sparkle'),
    ('Hiệu ứng trái tim', 'effect', 'all', 8000, False, '💖', 'fx-hearts'),
]

DEFAULT_ITEMS_MALE = {
    'background': 'bg-sky', 'body': 'body-male', 'eyes': 'eyes-brown',
    'hair': 'hair-black-short', 'top': 'top-white-tee', 'bottom': 'bottom-jeans',
    'shoes': 'shoes-sneaker',
}
DEFAULT_ITEMS_FEMALE = {
    'background': 'bg-pink', 'body': 'body-female', 'eyes': 'eyes-brown',
    'hair': 'hair-brown-long', 'top': 'top-white-tee', 'bottom': 'bottom-skirt-pink',
    'shoes': 'shoes-sneaker',
}


def norm_category(val):
    c = (val or '').strip().lower()
    return c if c in VALID_CATEGORIES else 'accessory'


def norm_gender(val):
    g = (val or 'all').strip().lower()
    return g if g in VALID_GENDERS else 'all'


def parse_items_json(raw):
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def items_to_json(items):
    return json.dumps(items or {}, ensure_ascii=False)


def fmt_avatar_item(row, owned=False, purchase_count=0):
    return {
        'id': row['id'],
        'name': row['name'],
        'category': row['category'],
        'gender': row['gender'],
        'price': int(row['price']),
        'isFree': bool(row.get('is_free')),
        'previewImage': row.get('preview_image') or '👕',
        'layerImage': row.get('layer_image') or '',
        'layerOrder': int(row.get('layer_order') or CATEGORY_ORDER.get(row['category'], 99)),
        'owned': owned,
        'purchaseCount': int(purchase_count or 0),
        'createdAt': str(row.get('created_at', '')),
    }


def layer_key_for_item(row):
    return (row.get('layer_image') or '').strip()


def get_owned_item_ids(conn, uid):
    rows = db.fetchall(conn, 'SELECT item_id FROM user_avatar_items WHERE user_id = ?', (uid,))
    return {r['item_id'] for r in rows}


def get_free_item_ids(conn):
    rows = db.fetchall(conn, 'SELECT id FROM avatar_items WHERE is_free = ?',
                       (True if db.IS_PG else 1,))
    return {r['id'] for r in rows}


def user_can_use_item(conn, uid, item):
    if item.get('is_free'):
        return True
    row = db.fetchone(conn,
        'SELECT id FROM user_avatar_items WHERE user_id = ? AND item_id = ?', (uid, item['id']))
    return bool(row)


def items_by_layer_key(conn):
    rows = db.fetchall(conn, 'SELECT * FROM avatar_items ORDER BY layer_order, id')
    by_key = {}
    for r in rows:
        key = layer_key_for_item(r)
        if key:
            by_key[key] = r
    return by_key


def resolve_item_ids(conn, items_map):
    """Convert layer_key map to item_id map."""
    by_key = items_by_layer_key(conn)
    out = {}
    for cat, val in (items_map or {}).items():
        if isinstance(val, int):
            out[cat] = val
            continue
        key = str(val)
        row = by_key.get(key)
        if row:
            out[cat] = row['id']
    return out


def resolve_items_for_gender(conn, gender, items_map):
    """Ensure body and gender-specific defaults."""
    by_key = items_by_layer_key(conn)
    defaults = DEFAULT_ITEMS_MALE if gender == 'male' else DEFAULT_ITEMS_FEMALE
    merged = dict(defaults)
    merged.update(items_map or {})
    resolved = {}
    for cat, key in merged.items():
        if isinstance(key, int):
            row = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (key,))
        else:
            row = by_key.get(str(key))
        if not row:
            continue
        if row['gender'] not in ('all', gender):
            continue
        resolved[cat] = row['id']
    return resolved


def get_or_create_avatar(conn, uid, gender='female'):
    row = db.fetchone(conn, 'SELECT * FROM user_avatars WHERE user_id = ?', (uid,))
    if row:
        return row
    defaults = DEFAULT_ITEMS_MALE if gender == 'male' else DEFAULT_ITEMS_FEMALE
    item_ids = resolve_items_for_gender(conn, gender, defaults)
    aid = db.insert_returning_id(conn,
        'INSERT INTO user_avatars (user_id, gender, current_items) VALUES (?,?,?)',
        (uid, gender, items_to_json(item_ids)))
    return db.fetchone(conn, 'SELECT * FROM user_avatars WHERE id = ?', (aid,))


def get_current_state(conn, uid):
    avatar = get_or_create_avatar(conn, uid)
    gender = avatar.get('gender') or 'female'
    items_map = parse_items_json(avatar.get('current_items'))
    owned = get_owned_item_ids(conn, uid)
    free_ids = get_free_item_ids(conn)
    equipped = []
    for cat, iid in items_map.items():
        item = db.fetchone(conn, 'SELECT * FROM avatar_items WHERE id = ?', (iid,))
        if item:
            equipped.append({**fmt_avatar_item(item, owned=(iid in owned or iid in free_ids)), 'slot': cat})
    equipped.sort(key=lambda x: x.get('layerOrder', 99))
    return {
        'gender': gender,
        'items': items_map,
        'equipped': equipped,
        'updatedAt': str(avatar.get('updated_at', '')),
    }


def seed_avatar_items(conn):
    count = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM avatar_items')['c']
    if count > 0:
        return
    for name, cat, gender, price, is_free, preview, layer in SEED_AVATAR_ITEMS:
        db.execute(conn,
            '''INSERT INTO avatar_items
               (name, category, gender, price, is_free, preview_image, layer_image, layer_order)
               VALUES (?,?,?,?,?,?,?,?)''',
            (name, cat, gender, price, is_free if db.IS_PG else (1 if is_free else 0),
             preview, layer, CATEGORY_ORDER.get(cat, 99)))


def purchase_count_for_item(conn, item_id):
    row = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM transactions WHERE type='avatar_item_purchase' AND description LIKE ?",
        (f'%#{item_id}%',))
    return int(row['c'] if row else 0)