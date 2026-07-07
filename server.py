"""Shop của Đức Hi - Production Server"""
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

import bcrypt
import jwt
from flask import Flask, request, jsonify, send_from_directory

import database as db
from config import (
    JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, BANK, WEBHOOK_SECRET,
    ZALO_PHONE, SITE_NAME, WELCOME_MSG, OTP_EXPIRE_MINUTES,
    OTP_MAX_ATTEMPTS, OTP_RATE_LIMIT_PER_HOUR, PORT
)
from services.email_service import send_otp_email
from services.bank_service import (
    gen_topup_code, build_qr, bank_loop, ingest_webhook, process_bank_tx, check_bank
)

BASE = Path(__file__).parent
PUBLIC = BASE / 'public'
app = Flask(__name__, static_folder=str(PUBLIC), static_url_path='')
app.config['SECRET_KEY'] = JWT_SECRET

_checker_started = False


def fmt_user(row):
    return {
        'id': row['id'], 'fullName': row['name'], 'email': row['email'],
        'role': row['role'], 'balance': row['balance'], 'topupCode': row['topup_code'],
        'isBlocked': bool(row.get('is_blocked')), 'createdAt': str(row.get('created_at', ''))
    }


def fmt_product(row):
    return {
        'id': row['id'], 'name': row['name'], 'desc': row['description'],
        'price': row['price'], 'icon': row.get('image', 'fa-box'),
        'color': row.get('color', 'blue'), 'stock': row.get('stock', 0)
    }


VALID_PRODUCT_COLORS = {'emerald', 'orange', 'violet', 'blue', 'sky', 'teal', 'red', 'amber'}


def sign_token(uid):
    return jwt.encode({'userId': uid}, JWT_SECRET, algorithm='HS256')


def valid_email(email):
    return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))


def init_app_data():
    db.init_schema()
    conn = db.get_conn()
    admin_email = ADMIN_EMAIL.strip().lower()
    pw_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
    target = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (admin_email,))
    legacy = db.fetchone(conn, "SELECT * FROM users WHERE email = 'admin@gmail.com'")

    if target:
        db.execute(conn, 'UPDATE users SET password_hash = ?, role = ? WHERE id = ?',
                   (pw_hash, 'admin', target['id']))
    elif legacy:
        code = gen_topup_code(admin_email, legacy['id'])
        db.execute(conn,
            'UPDATE users SET email = ?, password_hash = ?, role = ?, name = ?, topup_code = ? WHERE id = ?',
            (admin_email, pw_hash, 'admin', 'Đức Hi', code, legacy['id']))
    else:
        uid = db.insert_returning_id(conn,
            'INSERT INTO users (email,password_hash,role,name,balance,topup_code) VALUES (?,?,?,?,0,?)',
            (admin_email, pw_hash, 'admin', 'Đức Hi', 'TEMP'))
        db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?',
                   (gen_topup_code(admin_email, uid), uid))

    db.execute(conn, "UPDATE users SET role = 'user' WHERE role = 'admin' AND LOWER(email) != ?",
               (admin_email,))
    db.commit(conn)
    for row in db.fetchall(conn, "SELECT id,email FROM users WHERE topup_code IS NULL OR topup_code IN ('','TEMP')"):
        db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?', (gen_topup_code(row['email'], row['id']), row['id']))
    db.commit(conn)
    db.close(conn)


def auth_required(f):
    @wraps(f)
    def deco(*args, **kwargs):
        h = request.headers.get('Authorization', '')
        if not h.startswith('Bearer '):
            return jsonify({'error': 'Chưa đăng nhập.'}), 401
        try:
            payload = jwt.decode(h[7:], JWT_SECRET, algorithms=['HS256'])
            conn = db.get_conn()
            user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (payload['userId'],))
            db.close(conn)
            if not user:
                return jsonify({'error': 'Tài khoản không tồn tại.'}), 401
            if user.get('is_blocked'):
                return jsonify({'error': 'Tài khoản đã bị khóa.'}), 403
            request.user = fmt_user(user)
            request.user_row = user
        except Exception:
            return jsonify({'error': 'Phiên đăng nhập không hợp lệ.'}), 401
        return f(*args, **kwargs)
    return deco


def admin_required(f):
    @wraps(f)
    @auth_required
    def deco(*args, **kwargs):
        if request.user['role'] != 'admin':
            return jsonify({'error': 'Bạn không có quyền truy cập.'}), 403
        return f(*args, **kwargs)
    return deco


def start_bg():
    global _checker_started
    if _checker_started:
        return
    _checker_started = True
    init_app_data()
    threading.Thread(target=bank_loop, daemon=True).start()


# ─── Meta ───
@app.route('/api/health')
def health():
    return jsonify({'ok': True, 'site': SITE_NAME, 'bankMode': BANK['mode'],
                    'database': 'postgresql' if db.IS_PG else 'sqlite'})


@app.route('/api/site-info')
def site_info():
    return jsonify({'name': SITE_NAME, 'welcome': WELCOME_MSG, 'zalo': ZALO_PHONE})


# ─── Auth ───
@app.route('/api/auth/register', methods=['POST'])
@app.route('/api/register', methods=['POST'])
def register():
    d = request.get_json() or {}
    name, email, pw, pw2 = d.get('fullName', d.get('name', '')).strip(), d.get('email', '').strip().lower(), d.get('password', ''), d.get('confirmPassword', d.get('password', ''))
    if not name or not email or not pw:
        return jsonify({'error': 'Vui lòng điền đầy đủ thông tin.'}), 400
    if not valid_email(email):
        return jsonify({'error': 'Email không hợp lệ.'}), 400
    if len(pw) < 6:
        return jsonify({'error': 'Mật khẩu tối thiểu 6 ký tự.'}), 400
    if pw != pw2:
        return jsonify({'error': 'Mật khẩu nhập lại không khớp.'}), 400
    conn = db.get_conn()
    if db.fetchone(conn, 'SELECT id FROM users WHERE email = ?', (email,)):
        db.close(conn)
        return jsonify({'error': 'Tài khoản đã tồn tại trên trang web'}), 409
    hash_pw = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    uid = db.insert_returning_id(conn, 'INSERT INTO users (email,password_hash,role,name,balance,topup_code) VALUES (?,?,?,?,0,?)',
                                 (email, hash_pw, 'user', name, 'TEMP'))
    code = gen_topup_code(email, uid)
    db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?', (code, uid))
    db.commit(conn)
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    db.close(conn)
    return jsonify({'token': sign_token(uid), 'user': fmt_user(user)}), 201


@app.route('/api/auth/login', methods=['POST'])
@app.route('/api/login', methods=['POST'])
def login():
    d = request.get_json() or {}
    email, pw = d.get('email', '').strip().lower(), d.get('password', '')
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    db.close(conn)
    if not user or not bcrypt.checkpw(pw.encode(), user['password_hash'].encode()):
        return jsonify({'error': 'Email hoặc mật khẩu không đúng.'}), 401
    if user.get('is_blocked'):
        return jsonify({'error': 'Tài khoản đã bị khóa. Liên hệ hỗ trợ.'}), 403
    return jsonify({'token': sign_token(user['id']), 'user': fmt_user(user)})


@app.route('/api/auth/me')
@app.route('/api/me')
@auth_required
def me():
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    db.close(conn)
    return jsonify({'user': fmt_user(user)})


@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    email = (request.get_json() or {}).get('email', '').strip().lower()
    if not valid_email(email):
        return jsonify({'error': 'Email không hợp lệ.'}), 400
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if not user:
        db.close(conn)
        return jsonify({'ok': True, 'message': 'Nếu email tồn tại, mã OTP đã được gửi.'})
    since = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    cnt = db.fetchone(conn,
        'SELECT COUNT(*) AS c FROM password_otps WHERE user_id = ? AND created_at > ?',
        (user['id'], since))['c']
    if cnt >= OTP_RATE_LIMIT_PER_HOUR:
        db.close(conn)
        return jsonify({'error': 'Bạn đã gửi quá nhiều yêu cầu. Thử lại sau 1 giờ.'}), 429
    otp = f'{secrets.randbelow(900000) + 100000:06d}'
    otp_hash = bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()
    expires = (datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)).isoformat()
    db.execute(conn, 'INSERT INTO password_otps (user_id,otp_hash,expires_at) VALUES (?,?,?)',
               (user['id'], otp_hash, expires))
    db.commit(conn)
    db.close(conn)
    try:
        mail = send_otp_email(email, otp)
        if mail.get('dev') and db.IS_PG:
            return jsonify({
                'error': 'Chưa cấu hình gửi email OTP trên server. Liên hệ admin qua Zalo 0944255413.'
            }), 503
    except Exception as e:
        return jsonify({'error': f'Không gửi được email: {e}'}), 500
    return jsonify({'ok': True, 'message': 'Mã OTP đã được gửi đến email của bạn.'})


@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    d = request.get_json() or {}
    email, otp = d.get('email', '').strip().lower(), d.get('otp', '').strip()
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    used_filter = 'used IS NOT TRUE' if db.IS_PG else 'used = 0'
    rec = db.fetchone(conn,
        f'SELECT * FROM password_otps WHERE user_id = ? AND {used_filter} ORDER BY id DESC LIMIT 1', (user['id'],))
    if not rec:
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    if rec['attempts'] >= OTP_MAX_ATTEMPTS:
        db.close(conn)
        return jsonify({'error': 'Đã nhập sai quá số lần cho phép.'}), 400
    exp = rec['expires_at']
    if isinstance(exp, str):
        exp_dt = datetime.fromisoformat(exp.replace('Z', ''))
    else:
        exp_dt = exp
    if datetime.utcnow() > exp_dt:
        db.close(conn)
        return jsonify({'error': 'OTP đã hết hạn.'}), 400
    if not bcrypt.checkpw(otp.encode(), rec['otp_hash'].encode()):
        db.execute(conn, 'UPDATE password_otps SET attempts = attempts + 1 WHERE id = ?', (rec['id'],))
        db.commit(conn)
        db.close(conn)
        return jsonify({'error': 'OTP không đúng.'}), 400
    db.close(conn)
    return jsonify({'ok': True, 'message': 'OTP hợp lệ. Đặt mật khẩu mới.'})


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    d = request.get_json() or {}
    email, otp, new_pw = d.get('email', '').strip().lower(), d.get('otp', '').strip(), d.get('newPassword', '')
    if len(new_pw) < 6:
        return jsonify({'error': 'Mật khẩu mới tối thiểu 6 ký tự.'}), 400
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    used_filter = 'used IS NOT TRUE' if db.IS_PG else 'used = 0'
    rec = db.fetchone(conn,
        f'SELECT * FROM password_otps WHERE user_id = ? AND {used_filter} ORDER BY id DESC LIMIT 1', (user['id'],))
    if not rec or not bcrypt.checkpw(otp.encode(), rec['otp_hash'].encode()):
        db.close(conn)
        return jsonify({'error': 'OTP không hợp lệ.'}), 400
    exp = rec['expires_at']
    exp_dt = datetime.fromisoformat(str(exp).replace('Z', '')) if isinstance(exp, str) else exp
    if datetime.utcnow() > exp_dt:
        db.close(conn)
        return jsonify({'error': 'OTP đã hết hạn.'}), 400
    hash_pw = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    db.execute(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', (hash_pw, user['id']))
    if db.IS_PG:
        db.execute(conn, 'UPDATE password_otps SET used = TRUE WHERE id = ?', (rec['id'],))
    else:
        db.execute(conn, 'UPDATE password_otps SET used = 1 WHERE id = ?', (rec['id'],))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'message': 'Đổi mật khẩu thành công.'})


# ─── User ───
@app.route('/api/user/balance')
@auth_required
def user_balance():
    return jsonify({'balance': request.user['balance']})


@app.route('/api/user/transactions')
@app.route('/api/transactions/my')
@auth_required
def user_transactions():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT id,type,amount,description,status,bank_transaction_id AS "bankTransactionId",created_at AS date FROM transactions WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'transactions': rows})


@app.route('/api/user/orders')
@app.route('/api/orders/my')
@auth_required
def user_orders():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT id,product_name AS product,price,status,created_at AS date FROM orders WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'orders': rows})


# ─── Products & Orders ───
@app.route('/api/products')
def products_list():
    conn = db.get_conn()
    rows = db.fetchall(conn, 'SELECT * FROM products WHERE stock > 0 ORDER BY id')
    db.close(conn)
    return jsonify({'products': [fmt_product(r) for r in rows]})


@app.route('/api/orders/create', methods=['POST'])
@auth_required
def order_create():
    pid = int((request.get_json() or {}).get('productId', 0))
    conn = db.get_conn()
    product = db.fetchone(conn, 'SELECT * FROM products WHERE id = ? AND stock > 0', (pid,))
    if not product:
        db.close(conn)
        return jsonify({'error': 'Sản phẩm không tồn tại hoặc hết hàng.'}), 404
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    if user['balance'] < product['price']:
        db.close(conn)
        return jsonify({'error': 'Số dư không đủ. Vui lòng nạp thêm tiền.'}), 400
    db.execute(conn, 'UPDATE users SET balance = balance - ? WHERE id = ?', (product['price'], user['id']))
    db.execute(conn, 'UPDATE products SET stock = stock - 1 WHERE id = ?', (pid,))
    oid = db.insert_returning_id(conn, 'INSERT INTO orders (user_id,product_id,product_name,price,status) VALUES (?,?,?,?,?)',
                                 (user['id'], pid, product['name'], product['price'], 'completed'))
    db.execute(conn, 'INSERT INTO transactions (user_id,type,amount,description,status) VALUES (?,?,?,?,?)',
               (user['id'], 'purchase', product['price'], f"Mua {product['name']}", 'success'))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (user['id'],))['balance']
    db.close(conn)
    return jsonify({'orderId': oid, 'product': product['name'], 'price': product['price'], 'balance': bal}), 201


# ─── Topup ───
@app.route('/api/topup/my-code')
@auth_required
def topup_code():
    return jsonify({'topupCode': request.user['topupCode']})


@app.route('/api/topup/create', methods=['POST'])
@auth_required
def topup_create():
    amount = int((request.get_json() or {}).get('amount', 0))
    if amount < 10000:
        return jsonify({'error': 'Số tiền nạp tối thiểu 10.000đ.'}), 400
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    qr = build_qr(amount, user['topup_code'])
    tid = db.insert_returning_id(conn, 'INSERT INTO topup_requests (user_id,amount,topup_code,status,qr_url) VALUES (?,?,?,?,?)',
                                 (user['id'], amount, user['topup_code'], 'pending', qr))
    db.execute(conn, 'INSERT INTO transactions (user_id,type,amount,description,status,topup_request_id) VALUES (?,?,?,?,?,?)',
               (user['id'], 'topup', amount, f'Nạp tiền {amount:,}đ'.replace(',', '.'), 'pending', tid))
    db.commit(conn)
    db.close(conn)
    return jsonify({
        'id': tid, 'amount': amount, 'topupCode': user['topup_code'], 'status': 'pending', 'qrUrl': qr,
        'bank': {'name': BANK['name'], 'account': BANK['account'], 'holder': BANK['holder']}
    }), 201


@app.route('/api/topup/status/<int:tid>')
@auth_required
def topup_status(tid):
    conn = db.get_conn()
    t = db.fetchone(conn, 'SELECT * FROM topup_requests WHERE id = ?', (tid,))
    if not t:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy.'}), 404
    if t['user_id'] != request.user['id'] and request.user['role'] != 'admin':
        db.close(conn)
        return jsonify({'error': 'Không có quyền.'}), 403
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (t['user_id'],))['balance']
    db.close(conn)
    return jsonify({'id': t['id'], 'amount': t['amount'], 'topupCode': t['topup_code'], 'status': t['status'],
                    'qrUrl': t['qr_url'], 'balance': bal})


# ─── Bank ───
@app.route('/api/bank/webhook', methods=['POST'])
@app.route('/api/webhook/bank-transaction', methods=['POST'])
def bank_webhook():
    if WEBHOOK_SECRET and request.headers.get('x-webhook-secret') != WEBHOOK_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401
    try:
        return jsonify({'ok': True, 'result': ingest_webhook(request.get_json() or {})})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ─── Admin ───
@app.route('/api/admin/dashboard')
@admin_required
def admin_dashboard():
    conn = db.get_conn()
    revenue = db.fetchone(conn, "SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE type='purchase' AND status='success'")['t']
    orders = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM orders')['c']
    pending = db.fetchone(conn, "SELECT COUNT(*) AS c FROM topup_requests WHERE status='pending'")['c']
    users = db.fetchone(conn, "SELECT COUNT(*) AS c FROM users WHERE role='user'")['c']
    bank_tx = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM processed_bank_transactions')['c']
    db.close(conn)
    return jsonify({'revenue': int(revenue), 'totalOrders': int(orders), 'pendingTopups': int(pending),
                    'totalUsers': int(users), 'bankTransactions': int(bank_tx)})


@app.route('/api/admin/users')
@admin_required
def admin_users():
    q = request.args.get('q', '').strip()
    conn = db.get_conn()
    if q:
        like = f'%{q}%'
        rows = db.fetchall(conn,
            'SELECT id,name,email,role,balance,topup_code,is_blocked,created_at FROM users WHERE role=? AND (email LIKE ? OR name LIKE ?) ORDER BY id DESC',
            ('user', like, like))
    else:
        rows = db.fetchall(conn,
            'SELECT id,name,email,role,balance,topup_code,is_blocked,created_at FROM users WHERE role=? ORDER BY id DESC', ('user',))
    db.close(conn)
    return jsonify({'users': [{
        'id': r['id'], 'fullName': r['name'], 'email': r['email'], 'role': r['role'],
        'balance': r['balance'], 'topupCode': r['topup_code'], 'isBlocked': bool(r.get('is_blocked')),
        'createdAt': str(r['created_at'])
    } for r in rows]})


@app.route('/api/admin/users/<int:uid>')
@admin_required
def admin_user_detail(uid):
    conn = db.get_conn()
    r = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    db.close(conn)
    if not r:
        return jsonify({'error': 'Không tìm thấy.'}), 404
    return jsonify({'user': fmt_user(r)})


@app.route('/api/admin/users/<int:uid>', methods=['PATCH'])
@admin_required
def admin_user_patch(uid):
    d = request.get_json() or {}
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    if not user:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy.'}), 404
    if user['email'].lower() == ADMIN_EMAIL.lower() and d.get('role') == 'user':
        db.close(conn)
        return jsonify({'error': 'Không thể hạ quyền admin mặc định.'}), 400
    if 'isBlocked' in d:
        db.execute(conn, 'UPDATE users SET is_blocked = ? WHERE id = ?', (1 if d['isBlocked'] else 0, uid))
    if 'role' in d and d['role'] in ('user', 'admin'):
        db.execute(conn, 'UPDATE users SET role = ? WHERE id = ?', (d['role'], uid))
    db.commit(conn)
    updated = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    db.close(conn)
    return jsonify({'user': fmt_user(updated)})


@app.route('/api/admin/orders')
@admin_required
def admin_orders():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT o.id,o.product_name AS product,o.price,o.status,o.created_at AS date,u.email,u.name
        FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC''')
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'orders': rows})


@app.route('/api/admin/transactions')
@admin_required
def admin_transactions():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT t.id,t.type,t.amount,t.description,t.status,t.bank_transaction_id AS "bankTransactionId",
               t.created_at AS date,u.email FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC''')
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'transactions': rows})


@app.route('/api/admin/products', methods=['GET'])
@admin_required
def admin_products_list():
    conn = db.get_conn()
    rows = db.fetchall(conn, 'SELECT * FROM products ORDER BY id')
    db.close(conn)
    return jsonify({'products': [fmt_product(r) for r in rows]})


@app.route('/api/admin/products', methods=['POST'])
@admin_required
def admin_product_create():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Tên sản phẩm không được để trống.'}), 400
    try:
        price = int(d.get('price', 0))
        stock = int(d.get('stock', 99))
    except (TypeError, ValueError):
        return jsonify({'error': 'Giá hoặc tồn kho không hợp lệ.'}), 400
    if price < 0:
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    desc = (d.get('desc') or d.get('description') or '').strip()
    icon = (d.get('icon') or 'fa-box').strip() or 'fa-box'
    color = (d.get('color') or 'blue').strip()
    if color not in VALID_PRODUCT_COLORS:
        color = 'blue'
    if stock < 0:
        stock = 0
    conn = db.get_conn()
    pid = db.insert_returning_id(conn,
        'INSERT INTO products (name,description,price,image,color,stock) VALUES (?,?,?,?,?,?)',
        (name, desc, price, icon, color, stock))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (pid,))
    db.close(conn)
    return jsonify({'product': fmt_product(row)}), 201


@app.route('/api/admin/products/<int:pid>', methods=['PATCH'])
@admin_required
def admin_product_patch(pid):
    d = request.get_json() or {}
    conn = db.get_conn()
    product = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (pid,))
    if not product:
        db.close(conn)
        return jsonify({'error': 'Sản phẩm không tồn tại.'}), 404
    name = (d.get('name', product['name']) or '').strip()
    if not name:
        db.close(conn)
        return jsonify({'error': 'Tên sản phẩm không được để trống.'}), 400
    try:
        price = int(d.get('price', product['price']))
        stock = int(d.get('stock', product['stock']))
    except (TypeError, ValueError):
        db.close(conn)
        return jsonify({'error': 'Giá hoặc tồn kho không hợp lệ.'}), 400
    if price < 0:
        db.close(conn)
        return jsonify({'error': 'Giá không hợp lệ.'}), 400
    desc = (d.get('desc') or d.get('description') or product['description'] or '').strip()
    icon = (d.get('icon') or product.get('image') or 'fa-box').strip() or 'fa-box'
    color = (d.get('color') or product.get('color') or 'blue').strip()
    if color not in VALID_PRODUCT_COLORS:
        color = 'blue'
    if stock < 0:
        stock = 0
    db.execute(conn,
        'UPDATE products SET name=?, description=?, price=?, image=?, color=?, stock=? WHERE id=?',
        (name, desc, price, icon, color, stock, pid))
    db.commit(conn)
    row = db.fetchone(conn, 'SELECT * FROM products WHERE id = ?', (pid,))
    db.close(conn)
    return jsonify({'product': fmt_product(row)})


@app.route('/api/admin/products/<int:pid>', methods=['DELETE'])
@admin_required
def admin_product_delete(pid):
    conn = db.get_conn()
    product = db.fetchone(conn, 'SELECT id FROM products WHERE id = ?', (pid,))
    if not product:
        db.close(conn)
        return jsonify({'error': 'Sản phẩm không tồn tại.'}), 404
    db.execute(conn, 'DELETE FROM products WHERE id = ?', (pid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/admin/products', methods=['DELETE'])
@admin_required
def admin_products_delete_all():
    conn = db.get_conn()
    db.execute(conn, 'DELETE FROM products')
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True, 'message': 'Đã xóa tất cả sản phẩm.'})


@app.route('/api/admin/bank-transactions')
@admin_required
def admin_bank_tx():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT p.id,p.bank_transaction_id AS "bankTransactionId",p.amount,p.description,p.bank_account AS "bankAccount",
               p.processed_at AS "processedAt",u.email FROM processed_bank_transactions p
        LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC''')
    db.close(conn)
    for r in rows:
        r['processedAt'] = str(r['processedAt'])
    return jsonify({'bankTransactions': rows})


@app.route('/api/admin/topups')
@admin_required
def admin_topups():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT tr.id,tr.user_id AS "userId",tr.amount,tr.topup_code AS "topupCode",tr.status,
               tr.created_at AS "createdAt",u.email,u.name AS "fullName"
        FROM topup_requests tr JOIN users u ON u.id=tr.user_id ORDER BY tr.id DESC''')
    db.close(conn)
    for r in rows:
        r['createdAt'] = str(r['createdAt'])
    return jsonify({'topups': rows})


@app.route('/api/admin/topups/<int:tid>/approve', methods=['POST'])
@admin_required
def admin_topup_approve(tid):
    conn = db.get_conn()
    topup = db.fetchone(conn, 'SELECT * FROM topup_requests WHERE id = ?', (tid,))
    if not topup:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy yêu cầu nạp tiền.'}), 404
    if topup['status'] != 'pending':
        db.close(conn)
        return jsonify({'error': 'Yêu cầu này đã được xử lý.'}), 400
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (topup['user_id'],))
    if not user:
        db.close(conn)
        return jsonify({'error': 'Không tìm thấy người dùng.'}), 404
    if user.get('is_blocked'):
        db.close(conn)
        return jsonify({'error': 'Tài khoản đã bị khóa.'}), 400

    amount = int(topup['amount'])
    tx_id = f'MANUAL_{int(time.time())}_{secrets.token_hex(3)}'
    now = db.sql_now()
    db.execute(conn, 'UPDATE users SET balance = balance + ? WHERE id = ?', (amount, user['id']))
    db.execute(conn, f"UPDATE topup_requests SET status = 'success', completed_at = {now} WHERE id = ?", (tid,))
    db.execute(conn,
        "UPDATE transactions SET status = 'success', description = ?, bank_transaction_id = ? WHERE topup_request_id = ? AND status = 'pending'",
        (f'Nạp tiền {amount:,}đ (admin duyệt)'.replace(',', '.'), tx_id, tid))
    db.execute(conn,
        'INSERT INTO processed_bank_transactions (bank_transaction_id, amount, description, user_id, bank_account) VALUES (?, ?, ?, ?, ?)',
        (tx_id, amount, topup['topup_code'], user['id'], BANK['account']))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (user['id'],))['balance']
    db.close(conn)
    return jsonify({'ok': True, 'amount': amount, 'balance': bal, 'email': user['email']})


@app.route('/api/admin/simulate-bank-transfer', methods=['POST'])
@admin_required
def simulate_bank():
    if BANK['mode'] != 'mock':
        return jsonify({'error': 'Chỉ dùng khi BANK_MODE=mock'}), 400
    d = request.get_json() or {}
    code, amount = d.get('topupCode', '').strip(), int(d.get('amount', 0))
    tx_id = d.get('bankTransactionId') or f'MOCK_{int(time.time())}_{secrets.token_hex(3)}'
    conn = db.get_conn()
    db.insert_ignore_mock(conn, tx_id, amount, code, BANK['account'])
    db.commit(conn)
    result = process_bank_tx(conn, tx_id, amount, code, BANK['account'])
    db.close(conn)
    return jsonify({'ok': True, 'result': result})


# ─── Static ───
@app.route('/')
def index():
    return send_from_directory(PUBLIC, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    if path.startswith('api'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(PUBLIC, path)


start_bg()

if __name__ == '__main__':
    print(f'{SITE_NAME}: http://localhost:{PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)