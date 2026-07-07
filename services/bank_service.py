import re
import secrets
import time
import database as db
from config import BANK


def gen_topup_code(email, uid):
    local = re.sub(r'[^a-zA-Z0-9]', '', email.split('@')[0]).lower()
    return f'NAP {local}' if local else f'NAP_USER{uid:03d}'


def build_qr(amount, topup_code):
    from urllib.parse import quote
    return (
        f"https://img.vietqr.io/image/{BANK['code']}-{BANK['account']}-compact2.png"
        f"?amount={amount}&addInfo={quote(topup_code)}&accountName={quote(BANK['holder'])}"
    )


def extract_topup_code(desc):
    m = re.search(r'NAP[\s_][A-Za-z0-9]+', str(desc or ''), re.I)
    return m.group(0).replace('_', ' ').strip() if m else None


def find_user_by_code(conn, description):
    code = extract_topup_code(description)
    if not code:
        return None
    return db.fetchone(conn, 'SELECT * FROM users WHERE LOWER(topup_code) = LOWER(?)', (code,))


def process_bank_tx(conn, bank_tx_id, amount, description, account):
    if db.fetchone(conn, 'SELECT 1 AS x FROM processed_bank_transactions WHERE bank_transaction_id = ?', (bank_tx_id,)):
        return {'ok': False, 'reason': 'already_processed'}
    if account != BANK['account']:
        return {'ok': False, 'reason': 'wrong_account'}
    user = find_user_by_code(conn, description)
    if not user:
        return {'ok': False, 'reason': 'user_not_found'}
    if user.get('is_blocked'):
        return {'ok': False, 'reason': 'user_blocked'}
    amount = int(amount)
    if amount < 10000:
        return {'ok': False, 'reason': 'invalid_amount'}

    pending = db.fetchone(conn,
        "SELECT * FROM topup_requests WHERE user_id = ? AND status = 'pending' AND amount = ? ORDER BY id DESC LIMIT 1",
        (user['id'], amount))
    if not pending and BANK['mode'] == 'mock':
        pending = db.fetchone(conn,
            "SELECT * FROM topup_requests WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
            (user['id'],))

    now = db.sql_now()
    db.execute(conn,
        'INSERT INTO processed_bank_transactions (bank_transaction_id, amount, description, user_id, bank_account) VALUES (?, ?, ?, ?, ?)',
        (bank_tx_id, amount, description, user['id'], account))
    db.execute(conn, 'UPDATE users SET balance = balance + ? WHERE id = ?', (amount, user['id']))

    topup_id = None
    if pending:
        db.execute(conn, f"UPDATE topup_requests SET status = 'success', completed_at = {now} WHERE id = ?", (pending['id'],))
        topup_id = pending['id']

    db.execute(conn,
        'INSERT INTO transactions (user_id, type, amount, description, status, bank_transaction_id, topup_request_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (user['id'], 'topup', amount,
         f'Nạp tiền tự động {amount:,}đ'.replace(',', '.'), 'success', bank_tx_id, topup_id))

    if BANK['mode'] == 'mock':
        db.execute(conn, 'UPDATE mock_bank_incoming SET processed = 1 WHERE bank_transaction_id = ?', (bank_tx_id,))
    db.commit(conn)
    return {'ok': True, 'userId': user['id'], 'email': user['email'], 'amount': amount, 'bankTransactionId': bank_tx_id}


def ingest_webhook(payload):
    tx_id = payload.get('bankTransactionId') or payload.get('transactionId') or payload.get('id')
    amount = int(payload.get('amount', 0))
    desc = payload.get('description') or payload.get('addInfo') or payload.get('content', '')
    account = payload.get('accountNumber') or payload.get('account') or BANK['account']
    if not tx_id or not amount:
        raise ValueError('Thiếu bankTransactionId hoặc amount.')
    conn = db.get_conn()
    try:
        if BANK['mode'] == 'mock':
            db.insert_ignore_mock(conn, tx_id, amount, desc, account)
            db.commit(conn)
        return process_bank_tx(conn, tx_id, amount, desc, account)
    finally:
        db.close(conn)


def check_bank():
    if BANK['mode'] != 'mock':
        return
    conn = db.get_conn()
    try:
        rows = db.fetchall(conn,
            'SELECT bank_transaction_id, amount, description, account_number FROM mock_bank_incoming WHERE processed = 0 AND account_number = ?',
            (BANK['account'],))
        for row in rows:
            r = process_bank_tx(conn, row['bank_transaction_id'], row['amount'], row['description'], row['account_number'])
            if r.get('ok'):
                print(f"[Bank] +{r['amount']} -> {r['email']} ({r['bankTransactionId']})")
    except Exception as e:
        print(f'[Bank] Error: {e}')
    finally:
        db.close(conn)


def bank_loop():
    while True:
        check_bank()
        time.sleep(BANK['interval'])