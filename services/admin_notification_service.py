"""Thông báo đơn hàng mới cho admin — tránh quên duyệt/xử lý."""
import database as db

VALID_STATUSES = frozenset({'unread', 'read', 'handled'})
STATUS_LABELS = {
    'unread': 'Chưa xem',
    'read': 'Đã xem',
    'handled': 'Đã xử lý',
}
DEFAULT_TITLE = 'Có đơn hàng mới cần xử lý'
DEFAULT_MESSAGE = 'Có đơn hàng mới cần xử lý'


def fmt_notification(row, format_dt=None):
    if not row:
        return None
    status = row.get('status') or 'unread'
    order_code = row.get('order_code') or (
        f"DH-{int(row['order_id']):06d}" if row.get('order_id') else None
    )

    def _dt(val):
        if val is None or val == '':
            return None
        if format_dt:
            try:
                return format_dt(val)
            except Exception:
                pass
        return str(val)

    return {
        'id': row['id'],
        'type': row.get('type') or 'new_order',
        'orderId': row.get('order_id'),
        'orderCode': order_code,
        'userId': row.get('user_id'),
        'customerName': row.get('customer_name') or '',
        'customerEmail': row.get('customer_email') or '',
        'productName': row.get('product_name') or '',
        'productPrice': int(row.get('product_price') or 0),
        'orderStatus': row.get('order_status') or row.get('live_order_status') or '',
        'title': row.get('title') or DEFAULT_TITLE,
        'message': row.get('message') or DEFAULT_MESSAGE,
        'status': status,
        'statusLabel': STATUS_LABELS.get(status, status),
        'createdAt': _dt(row.get('created_at')),
        'readAt': _dt(row.get('read_at')) if row.get('read_at') else None,
        'handledAt': _dt(row.get('handled_at')) if row.get('handled_at') else None,
    }


def create_for_order(conn, user, order_id, product, order_code=None, total_price=None,
                     order_status='paid'):
    """Tạo thông báo admin khi user mua hàng thành công. Không tạo trùng cho cùng orderId."""
    existing = db.fetchone(conn,
        "SELECT id FROM admin_notifications WHERE order_id = ? AND type = 'new_order'",
        (order_id,))
    if existing:
        return existing['id']

    price = int(total_price if total_price is not None else product.get('price') or 0)
    code = order_code or f'DH-{int(order_id):06d}'
    title = DEFAULT_TITLE
    message = (
        f'Đơn {code} · {user.get("name") or "Khách"} · '
        f'{product.get("name") or "Sản phẩm"} · {price:,}đ'.replace(',', '.')
    )
    nid = db.insert_returning_id(conn, '''
        INSERT INTO admin_notifications
            (type, order_id, user_id, customer_name, customer_email,
             product_name, product_price, order_status, title, message, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        'new_order',
        order_id,
        user['id'],
        user.get('name') or '',
        user.get('email') or '',
        product.get('name') or '',
        price,
        order_status or 'paid',
        title,
        message,
        'unread',
    ))
    return nid


def list_notifications(conn, status=None, limit=100, format_dt=None):
    sql = '''
        SELECT n.*, o.order_code, o.status AS live_order_status
        FROM admin_notifications n
        LEFT JOIN orders o ON o.id = n.order_id
        WHERE 1=1
    '''
    params = []
    if status and status in VALID_STATUSES:
        sql += ' AND n.status = ?'
        params.append(status)
    sql += ' ORDER BY n.id DESC LIMIT ?'
    params.append(int(limit) if limit else 100)
    rows = db.fetchall(conn, sql, tuple(params))
    out = []
    for r in rows:
        item = fmt_notification(r, format_dt=format_dt)
        if r.get('live_order_status'):
            item['orderStatus'] = r['live_order_status']
        if r.get('order_code'):
            item['orderCode'] = r['order_code']
        out.append(item)
    return out


def get_notification(conn, nid, format_dt=None):
    row = db.fetchone(conn, '''
        SELECT n.*, o.order_code, o.status AS live_order_status
        FROM admin_notifications n
        LEFT JOIN orders o ON o.id = n.order_id
        WHERE n.id = ?
    ''', (nid,))
    if not row:
        return None
    item = fmt_notification(row, format_dt=format_dt)
    if row.get('live_order_status'):
        item['orderStatus'] = row['live_order_status']
    if row.get('order_code'):
        item['orderCode'] = row['order_code']
    return item


def unread_count(conn):
    row = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM admin_notifications WHERE status = 'unread'")
    return int(row['c'] if row else 0)


def unhandled_count(conn):
    """Chưa xử lý xong = unread + read."""
    row = db.fetchone(conn,
        "SELECT COUNT(*) AS c FROM admin_notifications WHERE status IN ('unread','read')")
    return int(row['c'] if row else 0)


def mark_read(conn, nid, format_dt=None):
    n = db.fetchone(conn, 'SELECT * FROM admin_notifications WHERE id = ?', (nid,))
    if not n:
        return None
    if n['status'] == 'handled':
        return get_notification(conn, nid, format_dt=format_dt)
    now = db.sql_now()
    if n['status'] == 'unread':
        db.execute(conn,
            f"UPDATE admin_notifications SET status = 'read', read_at = {now} WHERE id = ?",
            (nid,))
    return get_notification(conn, nid, format_dt=format_dt)


def mark_handled(conn, nid, order_status='processing', format_dt=None):
    """Đánh dấu đã xử lý; cập nhật trạng thái đơn nếu truyền order_status."""
    n = db.fetchone(conn, 'SELECT * FROM admin_notifications WHERE id = ?', (nid,))
    if not n:
        return None, None
    now = db.sql_now()
    if n['status'] == 'unread':
        db.execute(conn, f'''
            UPDATE admin_notifications
            SET status = 'handled', read_at = COALESCE(read_at, {now}), handled_at = {now}
            WHERE id = ?
        ''', (nid,))
    else:
        db.execute(conn, f'''
            UPDATE admin_notifications
            SET status = 'handled', handled_at = {now}
            WHERE id = ?
        ''', (nid,))

    oid = n.get('order_id')
    if oid and order_status:
        db.execute(conn,
            f'UPDATE orders SET status = ?, updated_at = {now} WHERE id = ?',
            (order_status, oid))

    return get_notification(conn, nid, format_dt=format_dt), oid


def pending_orders_count(conn):
    """Số đơn pending/paid (chưa xử lý xong)."""
    row = db.fetchone(conn, """
        SELECT COUNT(*) AS c FROM orders
        WHERE LOWER(COALESCE(status,'')) IN ('pending','paid')
    """)
    return int(row['c'] if row else 0)


def latest_unread(conn, after_id=0, limit=20, format_dt=None):
    """Thông báo unread mới hơn after_id (polling)."""
    rows = db.fetchall(conn, '''
        SELECT n.*, o.order_code
        FROM admin_notifications n
        LEFT JOIN orders o ON o.id = n.order_id
        WHERE n.status = 'unread' AND n.id > ?
        ORDER BY n.id ASC
        LIMIT ?
    ''', (int(after_id or 0), int(limit)))
    return [fmt_notification(r, format_dt=format_dt) for r in rows]
