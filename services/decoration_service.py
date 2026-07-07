"""Cuộc Thi Trang Trí Nhân Vật — Japanese anime style."""
import json

import database as db

VALID_CATEGORIES = {
    'head', 'torso', 'arms', 'legs', 'body', 'hair', 'eyes', 'expression', 'makeup',
    'top', 'bottom', 'shoes', 'accessory', 'background', 'effect',
}
VALID_GENDERS = {'male', 'female', 'all'}
VALID_THEMES = {
    'japanese_cute', 'idol', 'kimono', 'harajuku', 'school', 'yukata',
    'streetwear', 'sakura', 'tokyo_night', 'tea_house', 'festival', 'princess',
}
VALID_STATUSES = {'pending_review', 'approved', 'rejected'}
CATEGORY_ORDER = {
    'background': 1, 'body': 2, 'head': 3, 'torso': 4, 'arms': 5, 'legs': 6,
    'eyes': 7, 'expression': 8, 'makeup': 9, 'hair': 10, 'top': 11, 'bottom': 12,
    'shoes': 13, 'accessory': 14, 'effect': 15,
}
MAX_SUBMISSIONS_PER_DAY = 5
THEME_LABELS = {
    'japanese_cute': 'Nhật Bản dễ thương',
    'idol': 'Anime Idol',
    'kimono': 'Kimono hiện đại',
    'harajuku': 'Harajuku',
    'school': 'School style',
    'yukata': 'Yukata lễ hội',
    'streetwear': 'Streetwear Nhật',
    'sakura': 'Sakura',
    'tokyo_night': 'Tokyo ban đêm',
    'tea_house': 'Quán trà Nhật',
    'festival': 'Lễ hội pháo hoa',
    'princess': 'Công chúa anime',
}

DEFAULT_FEMALE = {
    'background': 'dec-bg-sakura',
    'head': 'dec-head-f-idol', 'torso': 'dec-torso-f-idol',
    'arms': 'dec-arms-f-grace', 'legs': 'dec-legs-f-slim',
    'eyes': 'dec-eyes-blue', 'expression': 'dec-expr-cute',
    'hair': 'dec-hair-silver-long', 'top': 'dec-top-idol-dress',
    'bottom': 'dec-bottom-skirt-pastel', 'shoes': 'dec-shoes-loafer',
}
DEFAULT_MALE = {
    'background': 'dec-bg-school',
    'head': 'dec-head-m-cool', 'torso': 'dec-torso-m-athletic',
    'arms': 'dec-arms-m-rest', 'legs': 'dec-legs-m-normal',
    'eyes': 'dec-eyes-brown', 'expression': 'dec-expr-cool',
    'hair': 'dec-hair-black-layer', 'top': 'dec-top-m-uniform',
    'bottom': 'dec-bottom-m-pants', 'shoes': 'dec-shoes-sneaker-white',
}


def norm_category(val):
    c = (val or '').strip().lower()
    return c if c in VALID_CATEGORIES else 'accessory'


def norm_gender(val):
    g = (val or 'all').strip().lower()
    return g if g in VALID_GENDERS else 'all'


def norm_theme(val):
    t = (val or 'japanese_cute').strip().lower()
    return t if t in VALID_THEMES else 'japanese_cute'


def parse_json(raw):
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def to_json(data):
    return json.dumps(data or {}, ensure_ascii=False)


def fmt_item(row):
    return {
        'id': row['id'],
        'name': row['name'],
        'category': row['category'],
        'gender': row['gender'],
        'theme': row.get('theme') or 'japanese_cute',
        'image': row.get('image') or '👘',
        'layerImage': row.get('layer_image') or '',
        'layerOrder': int(row.get('layer_order') or CATEGORY_ORDER.get(row['category'], 99)),
        'isActive': bool(row.get('is_active', True)),
        'createdAt': str(row.get('created_at', '')),
    }


def fmt_submission(row, user=None):
    item = {
        'id': row['id'],
        'userId': row['user_id'],
        'title': row['title'],
        'description': row.get('description') or '',
        'gender': row['gender'],
        'theme': row.get('theme') or 'japanese_cute',
        'themeLabel': THEME_LABELS.get(row.get('theme'), row.get('theme', '')),
        'itemsUsed': parse_json(row.get('items_used')),
        'previewImage': row.get('preview_image') or '',
        'status': row['status'],
        'score': row.get('score'),
        'rewardAmount': int(row.get('reward_amount') or 0),
        'adminNote': row.get('admin_note') or '',
        'createdAt': str(row.get('created_at', '')),
        'reviewedAt': str(row.get('reviewed_at') or '') if row.get('reviewed_at') else '',
    }
    if user:
        item['userName'] = user.get('name') or ''
        item['userEmail'] = user.get('email') or ''
    return item


def build_seed_items():
    """Generate 110+ Japanese decoration items."""
    items = []

    def add(name, cat, gender, theme, emoji, layer):
        items.append((name, cat, gender, theme, emoji, layer, CATEGORY_ORDER.get(cat, 99)))

    # ── Mẫu nhanh (preset cả nhân vật) ──
    for name, g, layer in [
        ('Mẫu Nữ Idol', 'female', 'dec-body-f-idol'),
        ('Mẫu Nữ Kimono', 'female', 'dec-body-f-kimono'),
        ('Mẫu Nữ Học đường', 'female', 'dec-body-f-school'),
        ('Mẫu Nữ Harajuku', 'female', 'dec-body-f-harajuku'),
        ('Mẫu Nữ Công chúa', 'female', 'dec-body-f-princess'),
        ('Mẫu Nam Học đường', 'male', 'dec-body-m-school'),
        ('Mẫu Nam Streetwear', 'male', 'dec-body-m-street'),
        ('Mẫu Nam Idol', 'male', 'dec-body-m-idol'),
    ]:
        add(name, 'body', g, 'japanese_cute', '👤', layer)

    # ── Đầu (12) ──
    for name, g, layer, theme in [
        ('Đầu tròn nữ', 'female', 'dec-head-f-round', 'japanese_cute'),
        ('Đầu oval nữ', 'female', 'dec-head-f-oval', 'kimono'),
        ('Đầu dễ thương', 'female', 'dec-head-f-cute', 'japanese_cute'),
        ('Đầu idol nữ', 'female', 'dec-head-f-idol', 'idol'),
        ('Đầu chibi nữ', 'female', 'dec-head-f-chibi', 'harajuku'),
        ('Đầu thanh mảnh', 'female', 'dec-head-f-elegant', 'princess'),
        ('Đầu nam mềm', 'male', 'dec-head-m-soft', 'japanese_cute'),
        ('Đầu nam góc cạnh', 'male', 'dec-head-m-sharp', 'streetwear'),
        ('Đầu nam cool', 'male', 'dec-head-m-cool', 'idol'),
        ('Đầu nam thể thao', 'male', 'dec-head-m-athletic', 'school'),
        ('Đầu nam anime', 'male', 'dec-head-m-anime', 'japanese_cute'),
        ('Đầu trung tính', 'all', 'dec-head-uni-soft', 'japanese_cute'),
    ]:
        add(name, 'head', g, theme, '🙂', layer)

    # ── Thân (10) ──
    for name, g, layer, theme in [
        ('Thân mảnh nữ', 'female', 'dec-torso-f-slim', 'japanese_cute'),
        ('Thân idol nữ', 'female', 'dec-torso-f-idol', 'idol'),
        ('Thân học sinh', 'female', 'dec-torso-f-school', 'school'),
        ('Thân công chúa', 'female', 'dec-torso-f-princess', 'princess'),
        ('Thân Harajuku', 'female', 'dec-torso-f-curvy', 'harajuku'),
        ('Thân mảnh nam', 'male', 'dec-torso-m-slim', 'streetwear'),
        ('Thân thể thao nam', 'male', 'dec-torso-m-athletic', 'school'),
        ('Thân idol nam', 'male', 'dec-torso-m-idol', 'idol'),
        ('Thân casual nam', 'male', 'dec-torso-m-casual', 'japanese_cute'),
        ('Thân rộng nam', 'male', 'dec-torso-m-broad', 'streetwear'),
    ]:
        add(name, 'torso', g, theme, '🧍', layer)

    # ── Tay (10) ──
    for name, g, layer, theme in [
        ('Tay thả tự nhiên', 'female', 'dec-arms-f-rest', 'japanese_cute'),
        ('Tay thanh mảnh', 'female', 'dec-arms-f-grace', 'idol'),
        ('Tay chống hông', 'female', 'dec-arms-f-akimbo', 'harajuku'),
        ('Tay idol pose', 'female', 'dec-arms-f-idol', 'idol'),
        ('Tay ôm trước', 'female', 'dec-arms-f-shy', 'japanese_cute'),
        ('Tay nam thả', 'male', 'dec-arms-m-rest', 'school'),
        ('Tay nam khoanh', 'male', 'dec-arms-m-cross', 'streetwear'),
        ('Tay nam tự tin', 'male', 'dec-arms-m-confident', 'idol'),
        ('Tay nam trong túi', 'male', 'dec-arms-m-pockets', 'streetwear'),
        ('Tay vẫy chào', 'all', 'dec-arms-uni-wave', 'japanese_cute'),
    ]:
        add(name, 'arms', g, theme, '💪', layer)

    # ── Chân (10) ──
    for name, g, layer, theme in [
        ('Chân mảnh nữ', 'female', 'dec-legs-f-slim', 'japanese_cute'),
        ('Chân dài nữ', 'female', 'dec-legs-f-long', 'idol'),
        ('Chân học sinh', 'female', 'dec-legs-f-school', 'school'),
        ('Chân công chúa', 'female', 'dec-legs-f-princess', 'princess'),
        ('Chân năng động', 'female', 'dec-legs-f-active', 'harajuku'),
        ('Chân nam thường', 'male', 'dec-legs-m-normal', 'school'),
        ('Chân nam thể thao', 'male', 'dec-legs-m-athletic', 'streetwear'),
        ('Chân nam dài', 'male', 'dec-legs-m-long', 'idol'),
        ('Chân nam rộng', 'male', 'dec-legs-m-wide', 'streetwear'),
        ('Chân đứng cân', 'all', 'dec-legs-uni-stand', 'japanese_cute'),
    ]:
        add(name, 'legs', g, theme, '🦵', layer)

    # ── Backgrounds (10) ──
    bgs = [
        ('Hoa anh đào', 'sakura', '🌸', 'dec-bg-sakura'),
        ('Đền Nhật', 'japanese_cute', '⛩️', 'dec-bg-shrine'),
        ('Tokyo ban đêm', 'tokyo_night', '🌃', 'dec-bg-tokyo'),
        ('Sân trường anime', 'school', '🏫', 'dec-bg-school'),
        ('Lễ hội pháo hoa', 'festival', '🎆', 'dec-bg-fireworks'),
        ('Quán trà Nhật', 'tea_house', '🍵', 'dec-bg-tea'),
        ('Công viên mùa xuân', 'sakura', '🌳', 'dec-bg-park'),
        ('Phòng idol', 'idol', '🎤', 'dec-bg-idol-room'),
        ('Harajuku street', 'harajuku', '🛍️', 'dec-bg-harajuku'),
        ('Tuyết mùa đông', 'yukata', '❄️', 'dec-bg-snow'),
    ]
    for name, theme, emoji, layer in bgs:
        add(name, 'background', 'all', theme, emoji, layer)

    # ── Hair (24 generated) ──
    hair_data = [
        ('đen', 'black', '#1f2937'), ('nâu', 'brown', '#78350f'),
        ('hồng anime', 'pink', '#ec4899'), ('xanh pastel', 'blue', '#38bdf8'),
        ('bạc', 'silver', '#94a3b8'), ('vàng nhạt', 'blonde', '#fde68a'),
        ('tím', 'purple', '#a78bfa'), ('đỏ nhạt', 'red', '#f87171'),
    ]
    hair_styles = [
        ('dài', 'long', '💇'), ('ngắn', 'short', '✂️'),
        ('twin-tail', 'twintail', '🎀'), ('búi Nhật', 'bun', '👧'),
        ('idol', 'idol', '⭐'), ('layer', 'layer', '💫'),
    ]
    for vn, en, color in hair_data:
        for svn, sen, emoji in hair_styles:
            g = 'female' if sen in ('twintail', 'bun', 'idol') else 'all'
            add(f'Tóc {vn} {svn}', 'hair', g, 'japanese_cute', emoji,
                f'dec-hair-{en}-{sen}')

    # ── Male hair (6) ──
    for vn, en in [('đen layer', 'black-layer'), ('nâu ngắn', 'brown-short'),
                   ('xanh anime', 'blue-anime'), ('bạc cool', 'silver-cool'),
                   ('idol nam', 'm-idol'), ('spiky', 'm-spiky')]:
        add(f'Tóc nam {vn}', 'hair', 'male', 'streetwear', '💇‍♂️', f'dec-hair-{en}')

    # ── Eyes (10) ──
    for name, layer, emoji in [
        ('Mắt xanh', 'dec-eyes-blue', '💙'), ('Mắt nâu', 'dec-eyes-brown', '🤎'),
        ('Mắt tím', 'dec-eyes-purple', '💜'), ('Mắt long lanh', 'dec-eyes-sparkle', '✨'),
        ('Mắt lạnh lùng', 'dec-eyes-cool', '🧊'), ('Mắt hồng idol', 'dec-eyes-pink', '🌸'),
        ('Mắt vàng anime', 'dec-eyes-gold', '⭐'), ('Mắt xanh lá', 'dec-eyes-green', '💚'),
        ('Mắt đỏ nhạt', 'dec-eyes-red', '❤️'), ('Mắt gradient', 'dec-eyes-gradient', '🌈'),
    ]:
        add(name, 'eyes', 'all', 'japanese_cute', emoji, layer)

    # ── Expressions (10) ──
    for name, layer, emoji in [
        ('Cười nhẹ', 'dec-expr-smile', '😊'), ('Vui vẻ', 'dec-expr-happy', '😄'),
        ('Ngại ngùng', 'dec-expr-shy', '😳'), ('Cá tính', 'dec-expr-cool', '😎'),
        ('Dễ thương', 'dec-expr-cute', '🥰'), ('Bình tĩnh', 'dec-expr-calm', '😌'),
        ('Ngạc nhiên', 'dec-expr-surprise', '😮'), ('Tự tin', 'dec-expr-confident', '😏'),
        ('Idol wink', 'dec-expr-wink', '😉'), ('Lễ hội vui', 'dec-expr-festival', '🎉'),
    ]:
        add(name, 'expression', 'all', 'idol', emoji, layer)

    # ── Makeup (8) ──
    for name, layer, emoji, theme in [
        ('Son hồng nhẹ', 'dec-mu-lip-pink', '💄', 'japanese_cute'),
        ('Má hồng', 'dec-mu-blush', '🌸', 'sakura'),
        ('Eyeliner nhẹ', 'dec-mu-liner', '✏️', 'idol'),
        ('Highlight mặt', 'dec-mu-highlight', '✨', 'idol'),
        ('Makeup idol', 'dec-mu-idol', '⭐', 'idol'),
        ('Makeup lễ hội', 'dec-mu-festival', '🎆', 'festival'),
        ('Makeup sakura', 'dec-mu-sakura', '🌸', 'sakura'),
        ('Makeup tự nhiên', 'dec-mu-natural', '🪞', 'japanese_cute'),
    ]:
        add(name, 'makeup', 'all', theme, emoji, layer)

    # ── Female tops (10) ──
    for name, layer, emoji, theme in [
        ('Kimono sakura', 'dec-top-kimono-sakura', '👘', 'kimono'),
        ('Yukata mùa hè', 'dec-top-yukata', '🎐', 'yukata'),
        ('Đồng phục nữ', 'dec-top-f-uniform', '🎒', 'school'),
        ('Váy idol', 'dec-top-idol-dress', '🎤', 'idol'),
        ('Váy công chúa', 'dec-top-princess', '👑', 'princess'),
        ('Outfit Harajuku', 'dec-top-harajuku', '🌈', 'harajuku'),
        ('Hoodie cute', 'dec-top-hoodie-cute', '🧥', 'japanese_cute'),
        ('Áo khoác đông', 'dec-top-coat', '🧣', 'yukata'),
        ('Áo pastel', 'dec-top-pastel', '👚', 'japanese_cute'),
        ('Set lễ hội', 'dec-top-festival', '🎏', 'festival'),
    ]:
        add(name, 'top', 'female', theme, emoji, layer)

    # ── Male tops (10) ──
    for name, layer, emoji, theme in [
        ('Đồng phục nam', 'dec-top-m-uniform', '🎒', 'school'),
        ('Áo khoác idol', 'dec-top-m-idol-jacket', '🎤', 'idol'),
        ('Hoodie streetwear', 'dec-top-m-hoodie', '🧥', 'streetwear'),
        ('Áo sơ mi anime', 'dec-top-m-shirt', '👔', 'japanese_cute'),
        ('Vest biểu diễn', 'dec-top-m-vest', '🕴️', 'idol'),
        ('Kimono nam', 'dec-top-m-kimono', '👘', 'kimono'),
        ('Yukata nam', 'dec-top-m-yukata', '🎐', 'yukata'),
        ('Áo Tokyo', 'dec-top-m-tokyo', '🌃', 'tokyo_night'),
        ('Set casual', 'dec-top-m-casual', '👕', 'streetwear'),
        ('Set sân trường', 'dec-top-m-campus', '🏫', 'school'),
    ]:
        add(name, 'top', 'male', theme, emoji, layer)

    # ── Bottoms (10) ──
    for name, cat_g, layer, emoji, theme in [
        ('Váy pastel', 'female', 'dec-bottom-skirt-pastel', '👗', 'japanese_cute'),
        ('Váy kimono', 'female', 'dec-bottom-kimono', '👘', 'kimono'),
        ('Chân váy học sinh', 'female', 'dec-bottom-school-skirt', '📚', 'school'),
        ('Váy lễ hội', 'female', 'dec-bottom-festival-skirt', '🎆', 'festival'),
        ('Váy công chúa', 'female', 'dec-bottom-princess', '👑', 'princess'),
        ('Quần nam học sinh', 'male', 'dec-bottom-m-pants', '👖', 'school'),
        ('Quần streetwear', 'male', 'dec-bottom-m-street', '🩳', 'streetwear'),
        ('Hakama nam', 'male', 'dec-bottom-m-hakama', '⛩️', 'kimono'),
        ('Quần idol', 'male', 'dec-bottom-m-idol', '🎤', 'idol'),
        ('Váy yukata', 'female', 'dec-bottom-yukata', '🎐', 'yukata'),
    ]:
        add(name, 'bottom', cat_g, theme, emoji, layer)

    # ── Shoes (8) ──
    for name, layer, emoji, g in [
        ('Giày búp bê', 'dec-shoes-loafer', '👠', 'female'),
        ('Giày học sinh', 'dec-shoes-school', '👞', 'all'),
        ('Sneaker trắng', 'dec-shoes-sneaker-white', '👟', 'all'),
        ('Sneaker đen', 'dec-shoes-sneaker-black', '👟', 'all'),
        ('Guốc kimono', 'dec-shoes-geta', '🩴', 'all'),
        ('Boots idol', 'dec-shoes-boots-idol', '🥾', 'all'),
        ('Giày lễ hội', 'dec-shoes-festival', '🎌', 'all'),
        ('Giày streetwear', 'dec-shoes-street', '👟', 'male'),
    ]:
        add(name, 'shoes', g, 'japanese_cute', emoji, layer)

    # ── Accessories (10) ──
    for name, layer, emoji, theme in [
        ('Nơ tóc', 'dec-acc-ribbon', '🎀', 'japanese_cute'),
        ('Kẹp sakura', 'dec-acc-sakura-clip', '🌸', 'sakura'),
        ('Tai nghe idol', 'dec-acc-headphones', '🎧', 'idol'),
        ('Micro biểu diễn', 'dec-acc-mic', '🎤', 'idol'),
        ('Túi học sinh', 'dec-acc-school-bag', '🎒', 'school'),
        ('Quạt giấy', 'dec-acc-fan', '🪭', 'yukata'),
        ('Ô giấy Nhật', 'dec-acc-umbrella', '☂️', 'sakura'),
        ('Vòng cổ', 'dec-acc-necklace', '📿', 'kimono'),
        ('Kính tròn', 'dec-acc-round-glasses', '👓', 'harajuku'),
        ('Mèo may mắn', 'dec-acc-lucky-cat', '🐱', 'japanese_cute'),
    ]:
        add(name, 'accessory', 'all', theme, emoji, layer)

    # ── Effects (10) ──
    for name, layer, emoji, theme in [
        ('Sakura rơi', 'dec-fx-sakura-fall', '🌸', 'sakura'),
        ('Ánh sân khấu', 'dec-fx-stage', '💡', 'idol'),
        ('Tim hồng', 'dec-fx-hearts', '💖', 'japanese_cute'),
        ('Sao lấp lánh', 'dec-fx-stars', '⭐', 'idol'),
        ('Ánh trăng', 'dec-fx-moon', '🌙', 'tokyo_night'),
        ('Pháo hoa', 'dec-fx-fireworks', '🎆', 'festival'),
        ('Hào quang idol', 'dec-fx-idol-glow', '✨', 'idol'),
        ('Lá mùa thu', 'dec-fx-autumn', '🍂', 'japanese_cute'),
        ('Tuyết rơi', 'dec-fx-snow', '❄️', 'yukata'),
        ('Hiệu ứng cute', 'dec-fx-cute', '🫧', 'japanese_cute'),
    ]:
        add(name, 'effect', 'all', theme, emoji, layer)

    return items


def seed_decoration_items(conn):
    count = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM decoration_items')['c']
    if count > 0:
        sync_decoration_items(conn)
        return
    for name, cat, gender, theme, emoji, layer, order in build_seed_items():
        db.execute(conn,
            '''INSERT INTO decoration_items
               (name, category, gender, theme, image, layer_image, layer_order, is_active)
               VALUES (?,?,?,?,?,?,?,?)''',
            (name, cat, gender, theme, emoji, layer,
             order, True if db.IS_PG else 1))


def sync_decoration_items(conn):
    """Thêm vật phẩm mới nếu layer_image chưa có (upgrade không mất dữ liệu cũ)."""
    rows = db.fetchall(conn, 'SELECT layer_image FROM decoration_items')
    existing = {r['layer_image'] for r in rows if r.get('layer_image')}
    for name, cat, gender, theme, emoji, layer, order in build_seed_items():
        if layer in existing:
            continue
        db.execute(conn,
            '''INSERT INTO decoration_items
               (name, category, gender, theme, image, layer_image, layer_order, is_active)
               VALUES (?,?,?,?,?,?,?,?)''',
            (name, cat, gender, theme, emoji, layer,
             order, True if db.IS_PG else 1))
        existing.add(layer)


def items_by_layer_key(conn):
    rows = db.fetchall(conn, 'SELECT * FROM decoration_items WHERE is_active = ? ORDER BY id',
                       (True if db.IS_PG else 1,))
    return {r.get('layer_image') or '': r for r in rows if r.get('layer_image')}


def resolve_items(conn, gender, items_map):
    by_key = items_by_layer_key(conn)
    defaults = DEFAULT_FEMALE if gender == 'female' else DEFAULT_MALE
    merged = dict(defaults)
    merged.update(items_map or {})
    resolved = {}
    for cat, val in merged.items():
        if cat not in VALID_CATEGORIES:
            continue
        if isinstance(val, int):
            row = db.fetchone(conn, 'SELECT * FROM decoration_items WHERE id = ? AND is_active = ?',
                              (val, True if db.IS_PG else 1))
        else:
            row = by_key.get(str(val))
        if not row:
            continue
        if row['gender'] not in ('all', gender):
            continue
        resolved[cat] = row['id']
    return resolved


def equipped_from_ids(conn, item_ids):
    equipped = []
    for cat, iid in (item_ids or {}).items():
        row = db.fetchone(conn, 'SELECT * FROM decoration_items WHERE id = ?', (iid,))
        if row:
            equipped.append({**fmt_item(row), 'slot': cat})
    equipped.sort(key=lambda x: x.get('layerOrder', 99))
    return equipped


def submissions_today(conn, uid):
    if db.IS_PG:
        row = db.fetchone(conn,
            '''SELECT COUNT(*) AS c FROM decoration_submissions
               WHERE user_id = ? AND created_at::date = CURRENT_DATE''', (uid,))
    else:
        row = db.fetchone(conn,
            '''SELECT COUNT(*) AS c FROM decoration_submissions
               WHERE user_id = ? AND date(created_at) = date('now')''', (uid,))
    return int(row['c'] if row else 0)