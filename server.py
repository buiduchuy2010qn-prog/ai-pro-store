"""AI Pro Store - Production server (SQLite local / PostgreSQL online)"""
import os
import re
import secrets
import threading
import time
from datetime import datetime
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
import bcrypt
import jwt

import database as db

load_dotenv()

BASE = Path(__file__).parent
PUBLIC = BASE / 'public'

app = Flask(__name__, static_folder=str(PUBLIC), static_url_path='')
app.config['SECRET_KEY'] = os.getenv('JWT_SECRET', 'ai-pro-store-dev-secret-2026')

BANK = {
    'mode': os.getenv('BANK_MODE', 'mock'),
    'account': os.getenv('BANK_ACCOUNT', '0394709137'),
    'name': os.getenv('BANK_NAME', 'MB Bank'),
    'code': os.getenv('BANK_CODE', 'MB'),
    'holder': os.getenv('BANK_ACCOUNT_HOLDER', 'ADMIN'),
    'interval': int(os.getenv('BANK_CHECK_INTERVAL_SECONDS', '15')),
}

ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@gmail.com')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')

PRODUCTS = [
    {'id': 1, 'name': 'ChatGPT Plus', 'desc': 'Tài khoản ChatGPT Plus 1 tháng', 'price': 250000, 'icon': 'fa-robot', 'bg': 'bg-emerald-50', 'ic': 'text-emerald-500'},
    {'id': 2, 'name': 'Claude Pro', 'desc': 'Tài khoản Claude Pro 1 tháng', 'price': 280000, 'icon': 'fa-brain', 'bg': 'bg-orange-50', 'ic': 'text-orange-500'},
    {'id': 3, 'name': 'Midjourney', 'desc': 'Gói Midjourney Standard 1 tháng', 'price': 320000, 'icon': 'fa-image', 'bg': 'bg-violet-50', 'ic': 'text-violet-500'},
    {'id': 4, 'name': 'Gemini Advanced', 'desc': 'Google Gemini Advanced 1 tháng', 'price': 220000, 'icon': 'fa-gem', 'bg': 'bg-blue-50', 'ic': 'text-blue-500'},
    {'id': 5, 'name': 'Copilot Pro', 'desc': 'Microsoft Copilot Pro 1 tháng', 'price': 200000, 'icon': 'fa-code', 'bg': 'bg-sky-50', 'ic': 'text-sky-500'},
    {'id': 6, 'name': 'Perplexity Pro', 'desc': 'Perplexity AI Pro 1 tháng', 'price': 180000, 'icon': 'fa-search', 'bg': 'bg-teal-50', 'ic': 'text-teal-500'},
]


def gen_topup_code(email, uid):
    local = re.sub(r'[^a-zA-Z0-9]', '', email.split('@')[0]).lower()
    return f'NAP {local}' if local else f'NAP_USER{uid:03d}'


def fmt_user(row):
    return {
        'id': row['id'], 'email': row['email'], 'role': row['role'],
        'name': row['name'], 'balance': row['balance'],
        'topupCode': row['topup_code'],
        'createdAt': str(row['created_at']) if row.get('created_at') else None
    }


def build_qr(amount, topup_code):
    from urllib.parse import quote
    return f"https://img.vietqr.io/image/{BANK['code']}-{BANK['account']}-compact2.png?amount={amount}&addInfo={quote(topup_code)}&accountName={quote(BANK['holder'])}"


def extract_topup_code(desc):
    m = re.search(r'NAP[\s_][A-Za-z0-9]+', str(desc or ''), re.I)
    return m.group(0).replace('_', ' ').strip() if m else None


def find_user_by_code(conn, description):
    code = extract_topup_code(description)
    if not code:
        return None
    row = db.fetchone(conn, 'SELECT * FROM users WHERE LOWER(topup_code) = LOWER(?)', (code,))
    return row


def init_db():
    db.init_schema()
    conn = db.get_conn()
    admin = db.fetchone(conn, 'SELECT id FROM users WHERE email = ?', (ADMIN_EMAIL,))
    if not admin:
        pw = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        db.execute(conn, 'INSERT INTO users (email,password_hash,role,name,balance,topup_code) VALUES (?,?,?,?,0,?)',
                   (ADMIN_EMAIL, pw, 'admin', 'Administrator', 'NAP admin'))
        db.commit(conn)
    rows = db.fetchall(conn, "SELECT id,email FROM users WHERE topup_code IS NULL OR topup_code = '' OR topup_code = 'TEMP'")
    for row in rows:
        code = gen_topup_code(row['email'], row['id'])
        db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?', (code, row['id']))
    db.commit(conn)
    db.close(conn)


def process_bank_tx(conn, bank_tx_id, amount, description, account):
    if db.fetchone(conn, 'SELECT 1 AS x FROM processed_bank_transactions WHERE bank_transaction_id = ?', (bank_tx_id,)):
        return {'ok': False, 'reason': 'already_processed'}
    if account != BANK['account']:
        return {'ok': False, 'reason': 'wrong_account'}
    user = find_user_by_code(conn, description)
    if not user:
        return {'ok': False, 'reason': 'user_not_found'}
    amount = int(amount)
    if amount < 10000:
        return {'ok': False, 'reason': 'invalid_amount'}
    pending = db.fetchone(conn,
        "SELECT * FROM topup_requests WHERE user_id = ? AND status = 'pending' AND amount = ? ORDER BY id DESC LIMIT 1",
        (user['id'], amount))
    if not pending:
        return {'ok': False, 'reason': 'no_pending_request'}

    now = db.sql_now()
    db.execute(conn, 'INSERT INTO processed_bank_transactions (bank_transaction_id,amount,description,user_id) VALUES (?,?,?,?)',
               (bank_tx_id, amount, description, user['id']))
    db.execute(conn, 'UPDATE users SET balance = balance + ? WHERE id = ?', (amount, user['id']))
    db.execute(conn, f"UPDATE topup_requests SET status = 'success', completed_at = {now} WHERE id = ?", (pending['id'],))
    db.execute(conn, 'INSERT INTO transactions (user_id,type,amount,description,status,bank_transaction_id,topup_request_id) VALUES (?,?,?,?,?,?,?)',
               (user['id'], 'topup', amount, f'Nạp tiền tự động {amount:,}đ ({description})'.replace(',', '.'), 'success', bank_tx_id, pending['id']))
    if BANK['mode'] == 'mock':
        db.execute(conn, 'UPDATE mock_bank_incoming SET processed = 1 WHERE bank_transaction_id = ?', (bank_tx_id,))
    db.commit(conn)
    return {'ok': True, 'userId': user['id'], 'email': user['email'], 'amount': amount, 'bankTransactionId': bank_tx_id}


def check_bank():
    conn = db.get_conn()
    try:
        if BANK['mode'] != 'mock':
            return
        rows = db.fetchall(conn,
            'SELECT bank_transaction_id,amount,description,account_number FROM mock_bank_incoming WHERE processed = 0 AND account_number = ?',
            (BANK['account'],))
        for row in rows:
            r = process_bank_tx(conn, row['bank_transaction_id'], row['amount'], row['description'], row['account_number'])
            if r.get('ok'):
                print(f"[BankChecker] +{r['amount']} -> {r['email']} ({r['bankTransactionId']})")
    except Exception as e:
        print(f'[BankChecker] Error: {e}')
    finally:
        db.close(conn)


def bank_loop():
    while True:
        check_bank()
        time.sleep(BANK['interval'])


_checker_started = False

def start_background_tasks():
    global _checker_started
    if _checker_started:
        return
    _checker_started = True
    init_db()
    threading.Thread(target=bank_loop, daemon=True).start()


def auth_required(f):
    @wraps(f)
    def deco(*args, **kwargs):
        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return jsonify({'error': 'Chưa đăng nhập.'}), 401
        try:
            payload = jwt.decode(header[7:], app.config['SECRET_KEY'], algorithms=['HS256'])
            conn = db.get_conn()
            user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (payload['userId'],))
            db.close(conn)
            if not user:
                return jsonify({'error': 'Tài khoản không tồn tại.'}), 401
            request.user = fmt_user(user)
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


def sign_token(uid):
    return jwt.encode({'userId': uid}, app.config['SECRET_KEY'], algorithm='HS256')


@app.route('/api/health')
def health():
    return jsonify({'ok': True, 'bankMode': BANK['mode'], 'database': 'postgresql' if db.IS_PG else 'sqlite'})


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    name, email, password = data.get('name', '').strip(), data.get('email', '').strip().lower(), data.get('password', '')
    if not name or not email or not password:
        return jsonify({'error': 'Vui lòng điền đầy đủ thông tin.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Mật khẩu tối thiểu 6 ký tự.'}), 400
    conn = db.get_conn()
    if db.fetchone(conn, 'SELECT id FROM users WHERE email = ?', (email,)):
        db.close(conn)
        return jsonify({'error': 'Email đã được sử dụng.'}), 409
    pw = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    uid = db.insert_returning_id(conn, 'INSERT INTO users (email,password_hash,role,name,balance,topup_code) VALUES (?,?,?,?,0,?)',
                                 (email, pw, 'user', name, 'TEMP'))
    code = gen_topup_code(email, uid)
    db.execute(conn, 'UPDATE users SET topup_code = ? WHERE id = ?', (code, uid))
    db.commit(conn)
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (uid,))
    db.close(conn)
    return jsonify({'token': sign_token(uid), 'user': fmt_user(user)}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email, password = data.get('email', '').strip().lower(), data.get('password', '')
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE email = ?', (email,))
    db.close(conn)
    if not user or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        return jsonify({'error': 'Email hoặc mật khẩu không đúng.'}), 401
    return jsonify({'token': sign_token(user['id']), 'user': fmt_user(user)})


@app.route('/api/me')
@auth_required
def me():
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    db.close(conn)
    return jsonify({'user': fmt_user(user)})


@app.route('/api/products')
def products_route():
    return jsonify({'products': PRODUCTS})


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
        return jsonify({'error': 'Không tìm thấy yêu cầu.'}), 404
    if t['user_id'] != request.user['id'] and request.user['role'] != 'admin':
        db.close(conn)
        return jsonify({'error': 'Bạn không có quyền.'}), 403
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (t['user_id'],))['balance']
    db.close(conn)
    return jsonify({
        'id': t['id'], 'amount': t['amount'], 'topupCode': t['topup_code'], 'status': t['status'],
        'qrUrl': t['qr_url'], 'createdAt': str(t['created_at']), 'completedAt': str(t['completed_at']) if t.get('completed_at') else None,
        'balance': bal
    })


@app.route('/api/orders/create', methods=['POST'])
@auth_required
def order_create():
    pid = int((request.get_json() or {}).get('productId', 0))
    product = next((p for p in PRODUCTS if p['id'] == pid), None)
    if not product:
        return jsonify({'error': 'Sản phẩm không tồn tại.'}), 404
    conn = db.get_conn()
    user = db.fetchone(conn, 'SELECT * FROM users WHERE id = ?', (request.user['id'],))
    if user['balance'] < product['price']:
        db.close(conn)
        return jsonify({'error': 'Số dư không đủ. Vui lòng nạp thêm tiền.'}), 400
    db.execute(conn, 'UPDATE users SET balance = balance - ? WHERE id = ?', (product['price'], user['id']))
    oid = db.insert_returning_id(conn, 'INSERT INTO orders (user_id,product_id,product_name,price,status) VALUES (?,?,?,?,?)',
                                 (user['id'], product['id'], product['name'], product['price'], 'completed'))
    db.execute(conn, 'INSERT INTO transactions (user_id,type,amount,description,status) VALUES (?,?,?,?,?)',
               (user['id'], 'purchase', product['price'], f"Mua {product['name']}", 'success'))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (user['id'],))['balance']
    db.close(conn)
    return jsonify({'orderId': oid, 'product': product['name'], 'price': product['price'], 'balance': bal}), 201


@app.route('/api/orders/my')
@auth_required
def orders_my():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT id, product_name AS product, price, status, created_at AS date FROM orders WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'orders': rows})


@app.route('/api/transactions/my')
@auth_required
def transactions_my():
    conn = db.get_conn()
    rows = db.fetchall(conn,
        'SELECT id,type,amount,description,status,bank_transaction_id AS "bankTransactionId",created_at AS date FROM transactions WHERE user_id = ? ORDER BY id DESC',
        (request.user['id'],))
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'transactions': rows})


@app.route('/api/admin/dashboard')
@admin_required
def admin_dashboard():
    conn = db.get_conn()
    revenue = db.fetchone(conn, "SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type='purchase' AND status='success'")['total']
    orders = db.fetchone(conn, 'SELECT COUNT(*) AS c FROM orders')['c']
    pending = db.fetchone(conn, "SELECT COUNT(*) AS c FROM topup_requests WHERE status='pending'")['c']
    users = db.fetchone(conn, "SELECT COUNT(*) AS c FROM users WHERE role='user'")['c']
    db.close(conn)
    return jsonify({'revenue': int(revenue), 'totalOrders': int(orders), 'pendingTopups': int(pending), 'totalUsers': int(users)})


@app.route('/api/admin/topups')
@admin_required
def admin_topups():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT tr.id,tr.amount,tr.topup_code AS "topupCode",tr.status,tr.qr_url AS "qrUrl",
               tr.created_at AS "createdAt",tr.completed_at AS "completedAt",u.email,u.name
        FROM topup_requests tr JOIN users u ON u.id=tr.user_id ORDER BY tr.id DESC
    ''')
    db.close(conn)
    for r in rows:
        r['createdAt'] = str(r['createdAt'])
        if r.get('completedAt'):
            r['completedAt'] = str(r['completedAt'])
    return jsonify({'topups': rows})


@app.route('/api/admin/orders')
@admin_required
def admin_orders():
    conn = db.get_conn()
    rows = db.fetchall(conn, '''
        SELECT o.id,o.product_name AS product,o.price,o.status,o.created_at AS date,u.email
        FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC
    ''')
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
               t.created_at AS date,u.email
        FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC
    ''')
    db.close(conn)
    for r in rows:
        r['date'] = str(r['date'])
    return jsonify({'transactions': rows})


@app.route('/api/admin/topups/<int:tid>/approve', methods=['POST'])
@admin_required
def admin_approve(tid):
    conn = db.get_conn()
    t = db.fetchone(conn, 'SELECT * FROM topup_requests WHERE id = ?', (tid,))
    if not t or t['status'] != 'pending':
        db.close(conn)
        return jsonify({'error': 'Yêu cầu không hợp lệ.'}), 400
    now = db.sql_now()
    db.execute(conn, 'UPDATE users SET balance = balance + ? WHERE id = ?', (t['amount'], t['user_id']))
    db.execute(conn, f"UPDATE topup_requests SET status='success',completed_at={now} WHERE id=?", (tid,))
    db.execute(conn, "UPDATE transactions SET status='success' WHERE topup_request_id=? AND type='topup'", (tid,))
    db.commit(conn)
    bal = db.fetchone(conn, 'SELECT balance FROM users WHERE id = ?', (t['user_id'],))['balance']
    db.close(conn)
    return jsonify({'ok': True, 'balance': bal})


@app.route('/api/admin/topups/<int:tid>/reject', methods=['POST'])
@admin_required
def admin_reject(tid):
    conn = db.get_conn()
    now = db.sql_now()
    db.execute(conn, f"UPDATE topup_requests SET status='rejected',completed_at={now} WHERE id=?", (tid,))
    db.execute(conn, "UPDATE transactions SET status='rejected' WHERE topup_request_id=? AND type='topup'", (tid,))
    db.commit(conn)
    db.close(conn)
    return jsonify({'ok': True})


@app.route('/api/admin/simulate-bank-transfer', methods=['POST'])
@admin_required
def simulate_bank():
    if BANK['mode'] != 'mock':
        return jsonify({'error': 'Chỉ dùng khi BANK_MODE=mock.'}), 400
    data = request.get_json() or {}
    code, amount = data.get('topupCode', '').strip(), int(data.get('amount', 0))
    if not code or not amount:
        return jsonify({'error': 'Cần topupCode và amount.'}), 400
    tx_id = data.get('bankTransactionId') or f'MOCK_{int(time.time())}_{secrets.token_hex(3)}'
    conn = db.get_conn()
    db.insert_ignore_mock(conn, tx_id, amount, code, BANK['account'])
    db.commit(conn)
    result = process_bank_tx(conn, tx_id, amount, code, BANK['account'])
    db.close(conn)
    return jsonify({'ok': True, 'result': result})


@app.route('/api/webhook/bank-transaction', methods=['POST'])
def webhook_bank():
    secret = os.getenv('WEBHOOK_SECRET', '')
    if secret and request.headers.get('x-webhook-secret') != secret:
        return jsonify({'error': 'Webhook unauthorized.'}), 401
    data = request.get_json() or {}
    tx_id = data.get('bankTransactionId') or data.get('transactionId') or data.get('id')
    amount = int(data.get('amount', 0))
    desc = data.get('description') or data.get('addInfo') or data.get('content', '')
    account = data.get('accountNumber') or data.get('account') or BANK['account']
    if not tx_id or not amount:
        return jsonify({'error': 'Thiếu bankTransactionId hoặc amount.'}), 400
    conn = db.get_conn()
    if BANK['mode'] == 'mock':
        db.insert_ignore_mock(conn, tx_id, amount, desc, account)
        db.commit(conn)
    result = process_bank_tx(conn, tx_id, amount, desc, account)
    db.close(conn)
    return jsonify({'ok': True, 'result': result})


@app.route('/')
def index():
    return send_from_directory(PUBLIC, 'index.html')


@app.route('/<path:path>')
def static_files(path):
    if path.startswith('api'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(PUBLIC, path)


start_background_tasks()

if __name__ == '__main__':
    port = int(os.getenv('PORT', '3000'))
    print(f'AI Pro Store: http://localhost:{port}')
    print(f'Database: {"PostgreSQL" if db.IS_PG else "SQLite"}')
    print(f'Admin: {ADMIN_EMAIL}')
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)