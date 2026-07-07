"""Thông báo hỗ trợ sau mua hàng — tạo khi order thành công, quản lý bởi admin."""
import database as db

DEFAULT_MESSAGE = 'Khách đã mua hàng, vui lòng hỗ trợ nâng cấp/kích hoạt tài khoản.'
VALID_STATUSES = frozenset({'pending', 'in_progress', 'completed', 'cancelled'})

STATUS_LABELS = {
    'pending': 'Chờ xử lý',
    'in_progress': 'Đang hỗ trợ',
    'completed': 'Hoàn thành',
    'cancelled': 'Đã hủy',
}

ACTION_MAP = {
    'in_progress': 'start',
    'completed': 'complete',
    'cancelled': 'cancel',
}


def fmt_notification(row):
    if not row:
        return None
    order_code = row.get('order_code')
    if not order_code and row.get('order_id'):
        order_code = f"DH{row['order_id']:06d}"
    return {
        'id': row['id'],
        'userId': row['user_id'],
        'orderId': row['order_id'],
        'orderCode': order_code,
        'productId': row['product_id'],
        'customerName': row['customer_name'],
        'customerEmail': row['customer_email'],
        'customerPhone': row.get('contact_phone') or '',
        'productName': row['product_name'],
        'productPrice': row['product_price'],
        'message': row['message'],
        'status': row['status'],
        'statusLabel': STATUS_LABELS.get(row['status'], row['status']),
        'adminNote': row.get('admin_note') or '',
        'createdAt': str(row.get('created_at', '')),
        'updatedAt': str(row.get('updated_at', '')),
        'completedAt': str(row['completed_at']) if row.get('completed_at') else None,
    }


def _select_sql():
    return '''
        SELECT sn.*, o.order_code, o.contact_phone
        FROM support_notifications sn
        LEFT JOIN orders o ON o.id = sn.order_id
    '''


def create_for_order(conn, user, order_id, product, contact_email='', contact_phone=''):
    """Tạo thông báo hỗ trợ từ dữ liệu user/order trong DB (không tin frontend)."""
    cust_email = (contact_email or user['email'] or '').strip()
    nid = db.insert_returning_id(conn, '''
        INSERT INTO support_notifications
            (user_id, order_id, product_id, customer_name, customer_email,
             product_name, product_price, message, status)
        VALUES (?,?,?,?,?,?,?,?,?)
    ''', (
        user['id'], order_id, product['id'], user['name'], cust_email,
        product['name'], product['price'], DEFAULT_MESSAGE, 'pending',
    ))
    return nid


def list_notifications(conn, status=None, q=None):
    sql = _select_sql() + ' WHERE 1=1'
    params = []
    if status and status in VALID_STATUSES:
        sql += ' AND sn.status = ?'
        params.append(status)
    if q:
        like = f'%{q}%'
        sql += ' AND (sn.customer_email LIKE ? OR sn.customer_name LIKE ? OR sn.product_name LIKE ?)'
        params.extend([like, like, like])
    sql += ' ORDER BY sn.id DESC'
    rows = db.fetchall(conn, sql, tuple(params))
    return [fmt_notification(r) for r in rows]


def get_notification(conn, nid):
    row = db.fetchone(conn, _select_sql() + ' WHERE sn.id = ?', (nid,))
    return fmt_notification(row)


def pending_count(conn):
    row = db.fetchone(conn, "SELECT COUNT(*) AS c FROM support_notifications WHERE status = 'pending'")
    return int(row['c'] if row else 0)


def _log_action(conn, notification_id, admin_id, action, note=''):
    db.insert_returning_id(conn, '''
        INSERT INTO support_notification_logs (notification_id, admin_id, action, note)
        VALUES (?,?,?,?)
    ''', (notification_id, admin_id, action, note or None))


def update_status(conn, nid, status, admin_id):
    if status not in VALID_STATUSES:
        return None, 'Trạng thái không hợp lệ.'
    row = db.fetchone(conn, 'SELECT * FROM support_notifications WHERE id = ?', (nid,))
    if not row:
        return None, 'Không tìm thấy thông báo.'
    now = db.sql_now()
    completed_sql = f', completed_at = {now}' if status == 'completed' else ''
    if status != 'completed' and row['status'] == 'completed':
        completed_sql = ', completed_at = NULL'
    db.execute(conn, f'''
        UPDATE support_notifications
        SET status = ?, updated_at = {now}{completed_sql}
        WHERE id = ?
    ''', (status, nid))
    action = ACTION_MAP.get(status, status)
    _log_action(conn, nid, admin_id, action)
    return get_notification(conn, nid), None


def update_note(conn, nid, note, admin_id):
    row = db.fetchone(conn, 'SELECT id FROM support_notifications WHERE id = ?', (nid,))
    if not row:
        return None, 'Không tìm thấy thông báo.'
    now = db.sql_now()
    db.execute(conn, f'''
        UPDATE support_notifications SET admin_note = ?, updated_at = {now} WHERE id = ?
    ''', (note.strip(), nid))
    _log_action(conn, nid, admin_id, 'note', note.strip())
    return get_notification(conn, nid), None