"""Database: SQLite (local) / PostgreSQL (production)"""
import os
import sqlite3
from pathlib import Path

IS_PG = bool(os.getenv('DATABASE_URL'))
BASE = Path(__file__).parent
DB_PATH = BASE / 'data' / 'store.db'

SEED_PRODUCTS = [
    ('ChatGPT Plus', 'Tài khoản ChatGPT Plus 1 tháng', 250000, 'fa-robot', 'emerald', 99),
    ('Claude Pro', 'Tài khoản Claude Pro 1 tháng', 280000, 'fa-brain', 'orange', 99),
    ('Midjourney', 'Gói Midjourney Standard 1 tháng', 320000, 'fa-image', 'violet', 50),
    ('Gemini Advanced', 'Google Gemini Advanced 1 tháng', 220000, 'fa-gem', 'blue', 99),
    ('Copilot Pro', 'Microsoft Copilot Pro 1 tháng', 200000, 'fa-code', 'sky', 99),
    ('Perplexity Pro', 'Perplexity AI Pro 1 tháng', 180000, 'fa-search', 'teal', 99),
]


def _pg_url():
    url = os.getenv('DATABASE_URL', '')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return url


def sql_now():
    return 'NOW()' if IS_PG else "datetime('now')"


def adapt(sql):
    return sql.replace('?', '%s') if IS_PG else sql


def row_to_dict(row):
    if row is None:
        return None
    return dict(row) if not isinstance(row, dict) else row


def get_conn():
    if IS_PG:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        return psycopg2.connect(_pg_url(), cursor_factory=RealDictCursor)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def execute(conn, sql, params=()):
    cur = conn.cursor()
    cur.execute(adapt(sql), params)
    return cur


def fetchone(conn, sql, params=()):
    return row_to_dict(execute(conn, sql, params).fetchone())


def fetchall(conn, sql, params=()):
    return [row_to_dict(r) for r in execute(conn, sql, params).fetchall()]


def insert_returning_id(conn, sql, params=()):
    if IS_PG:
        cur = execute(conn, adapt(sql) + ' RETURNING id', params)
        return cur.fetchone()['id']
    cur = execute(conn, sql, params)
    return cur.lastrowid


def commit(conn):
    conn.commit()


def close(conn):
    conn.close()


def _safe_alter(conn, sql):
    try:
        execute(conn, sql)
        commit(conn)
    except Exception:
        pass


def migrate(conn):
    if IS_PG:
        _safe_alter(conn, 'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE')
        _safe_alter(conn, 'ALTER TABLE processed_bank_transactions ADD COLUMN IF NOT EXISTS bank_account TEXT')
        _safe_alter(conn, 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code TEXT')
        _safe_alter(conn, 'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_id INTEGER')
        _safe_alter(conn, "ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_mode TEXT DEFAULT 'none'")
        _safe_alter(conn, 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_email TEXT')
        _safe_alter(conn, 'ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone TEXT')
    else:
        _safe_alter(conn, 'ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0')
        _safe_alter(conn, 'ALTER TABLE processed_bank_transactions ADD COLUMN bank_account TEXT')
        _safe_alter(conn, 'ALTER TABLE orders ADD COLUMN order_code TEXT')
        _safe_alter(conn, 'ALTER TABLE transactions ADD COLUMN order_id INTEGER')
        _safe_alter(conn, "ALTER TABLE products ADD COLUMN contact_mode TEXT DEFAULT 'none'")
        _safe_alter(conn, 'ALTER TABLE orders ADD COLUMN contact_email TEXT')
        _safe_alter(conn, 'ALTER TABLE orders ADD COLUMN contact_phone TEXT')
    for row in fetchall(conn, "SELECT id FROM orders WHERE order_code IS NULL OR order_code = ''"):
        execute(conn, 'UPDATE orders SET order_code = ? WHERE id = ?', (f"DH{row['id']:06d}", row['id']))
    commit(conn)


def init_schema():
    conn = get_conn()
    n = sql_now()

    if IS_PG:
        for stmt in (
            '''CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user', name TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0,
                topup_code TEXT NOT NULL UNIQUE, is_blocked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS password_otps (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                otp_hash TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT FALSE,
                attempts INTEGER DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL,
                image TEXT, color TEXT, stock INTEGER DEFAULT 99, contact_mode TEXT DEFAULT 'none',
                created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS topup_requests (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                amount INTEGER NOT NULL, topup_code TEXT NOT NULL, status TEXT DEFAULT 'pending',
                qr_url TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), completed_at TIMESTAMP)''',
            '''CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                type TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
                bank_transaction_id TEXT, topup_request_id INTEGER, order_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS processed_bank_transactions (
                id SERIAL PRIMARY KEY, bank_transaction_id TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL, description TEXT NOT NULL, user_id INTEGER,
                bank_account TEXT, processed_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                product_id INTEGER NOT NULL, product_name TEXT NOT NULL, price INTEGER NOT NULL,
                status TEXT DEFAULT 'completed', order_code TEXT UNIQUE,
                contact_email TEXT, contact_phone TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS mock_bank_incoming (
                id SERIAL PRIMARY KEY, bank_transaction_id TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL, description TEXT NOT NULL, account_number TEXT NOT NULL,
                received_at TIMESTAMP NOT NULL DEFAULT NOW(), processed INTEGER DEFAULT 0)''',
            '''CREATE TABLE IF NOT EXISTS avatar_items (
                id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                gender TEXT NOT NULL DEFAULT 'all', price INTEGER NOT NULL DEFAULT 0,
                is_free BOOLEAN DEFAULT FALSE, preview_image TEXT, layer_image TEXT,
                layer_order INTEGER DEFAULT 99, created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS user_avatar_items (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                item_id INTEGER NOT NULL REFERENCES avatar_items(id),
                purchased_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, item_id))''',
            '''CREATE TABLE IF NOT EXISTS user_avatars (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                gender TEXT NOT NULL DEFAULT 'female', current_items TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS saved_outfits (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                name TEXT NOT NULL, gender TEXT NOT NULL, items TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS decoration_items (
                id SERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
                gender TEXT NOT NULL DEFAULT 'all', theme TEXT DEFAULT 'japanese_cute',
                image TEXT, layer_image TEXT, layer_order INTEGER DEFAULT 99,
                is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT NOW())''',
            '''CREATE TABLE IF NOT EXISTS decoration_submissions (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                title TEXT NOT NULL, description TEXT, gender TEXT NOT NULL,
                theme TEXT DEFAULT 'japanese_cute', items_used TEXT, preview_image TEXT,
                status TEXT DEFAULT 'pending_review', score INTEGER,
                reward_amount INTEGER DEFAULT 0, admin_note TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMP)''',
            '''CREATE TABLE IF NOT EXISTS decoration_drafts (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                gender TEXT NOT NULL DEFAULT 'female', theme TEXT DEFAULT 'japanese_cute',
                items_used TEXT, preview_image TEXT,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW())''',
        ):
            execute(conn, stmt)
    else:
        conn.executescript(f'''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user', name TEXT NOT NULL, balance INTEGER DEFAULT 0,
                topup_code TEXT NOT NULL UNIQUE, is_blocked INTEGER DEFAULT 0,
                created_at TEXT DEFAULT ({n})
            );
            CREATE TABLE IF NOT EXISTS password_otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                otp_hash TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER DEFAULT 0,
                attempts INTEGER DEFAULT 0, created_at TEXT DEFAULT ({n}),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
                price INTEGER NOT NULL, image TEXT, color TEXT, stock INTEGER DEFAULT 99,
                contact_mode TEXT DEFAULT 'none',
                created_at TEXT DEFAULT ({n})
            );
            CREATE TABLE IF NOT EXISTS topup_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
                topup_code TEXT NOT NULL, status TEXT DEFAULT 'pending', qr_url TEXT,
                created_at TEXT DEFAULT ({n}), completed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
                amount INTEGER NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
                bank_transaction_id TEXT, topup_request_id INTEGER, order_id INTEGER,
                created_at TEXT DEFAULT ({n}), FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS processed_bank_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, bank_transaction_id TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL, description TEXT NOT NULL, user_id INTEGER,
                bank_account TEXT, processed_at TEXT DEFAULT ({n})
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL, price INTEGER NOT NULL, status TEXT DEFAULT 'completed',
                order_code TEXT UNIQUE, contact_email TEXT, contact_phone TEXT,
                created_at TEXT DEFAULT ({n}), FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS mock_bank_incoming (
                id INTEGER PRIMARY KEY AUTOINCREMENT, bank_transaction_id TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL, description TEXT NOT NULL, account_number TEXT NOT NULL,
                received_at TEXT DEFAULT ({n}), processed INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS avatar_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
                gender TEXT NOT NULL DEFAULT 'all', price INTEGER NOT NULL DEFAULT 0,
                is_free INTEGER DEFAULT 0, preview_image TEXT, layer_image TEXT,
                layer_order INTEGER DEFAULT 99, created_at TEXT DEFAULT ({n})
            );
            CREATE TABLE IF NOT EXISTS user_avatar_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL, purchased_at TEXT DEFAULT ({n}),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (item_id) REFERENCES avatar_items(id),
                UNIQUE(user_id, item_id)
            );
            CREATE TABLE IF NOT EXISTS user_avatars (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
                gender TEXT NOT NULL DEFAULT 'female', current_items TEXT,
                updated_at TEXT DEFAULT ({n}),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS saved_outfits (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                name TEXT NOT NULL, gender TEXT NOT NULL, items TEXT NOT NULL,
                created_at TEXT DEFAULT ({n}),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS decoration_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
                gender TEXT NOT NULL DEFAULT 'all', theme TEXT DEFAULT 'japanese_cute',
                image TEXT, layer_image TEXT, layer_order INTEGER DEFAULT 99,
                is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT ({n})
            );
            CREATE TABLE IF NOT EXISTS decoration_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                title TEXT NOT NULL, description TEXT, gender TEXT NOT NULL,
                theme TEXT DEFAULT 'japanese_cute', items_used TEXT, preview_image TEXT,
                status TEXT DEFAULT 'pending_review', score INTEGER,
                reward_amount INTEGER DEFAULT 0, admin_note TEXT,
                created_at TEXT DEFAULT ({n}), reviewed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS decoration_drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
                gender TEXT NOT NULL DEFAULT 'female', theme TEXT DEFAULT 'japanese_cute',
                items_used TEXT, preview_image TEXT,
                updated_at TEXT DEFAULT ({n}),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        ''')

    migrate(conn)
    from services.avatar_service import seed_avatar_items
    from services.decoration_service import seed_decoration_items
    seed_avatar_items(conn)
    seed_decoration_items(conn)
    count = fetchone(conn, 'SELECT COUNT(*) AS c FROM products')['c']
    if count == 0:
        for name, desc, price, icon, color, stock in SEED_PRODUCTS:
            execute(conn, 'INSERT INTO products (name,description,price,image,color,stock) VALUES (?,?,?,?,?,?)',
                    (name, desc, price, icon, color, stock))
    commit(conn)
    close(conn)


def insert_ignore_mock(conn, tx_id, amount, description, account):
    if IS_PG:
        execute(conn, '''
            INSERT INTO mock_bank_incoming (bank_transaction_id,amount,description,account_number)
            VALUES (?,?,?,?) ON CONFLICT (bank_transaction_id) DO NOTHING
        ''', (tx_id, amount, description, account))
    else:
        execute(conn, '''
            INSERT OR IGNORE INTO mock_bank_incoming (bank_transaction_id,amount,description,account_number)
            VALUES (?,?,?,?)
        ''', (tx_id, amount, description, account))