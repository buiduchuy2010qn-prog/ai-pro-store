"""Database layer: SQLite (local) hoặc PostgreSQL (production/Render)"""
import os
import sqlite3
from pathlib import Path

IS_PG = bool(os.getenv('DATABASE_URL'))
BASE = Path(__file__).parent
DB_PATH = BASE / 'data' / 'store.db'


def _pg_url():
    url = os.getenv('DATABASE_URL', '')
    if url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    return url


def sql_now():
    return "NOW()" if IS_PG else "datetime('now')"


def adapt(sql):
    if IS_PG:
        return sql.replace('?', '%s')
    return sql


def row_to_dict(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    return dict(row)


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
    cur = execute(conn, sql, params)
    row = cur.fetchone()
    return row_to_dict(row)


def fetchall(conn, sql, params=()):
    cur = execute(conn, sql, params)
    return [row_to_dict(r) for r in cur.fetchall()]


def insert_returning_id(conn, sql, params=()):
    if IS_PG:
        sql = adapt(sql) + ' RETURNING id'
        cur = execute(conn, sql, params)
        return cur.fetchone()['id']
    cur = execute(conn, sql, params)
    return cur.lastrowid


def commit(conn):
    conn.commit()


def close(conn):
    conn.close()


def init_schema():
    conn = get_conn()
    now_def = sql_now()

    if IS_PG:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                name TEXT NOT NULL,
                balance INTEGER NOT NULL DEFAULT 0,
                topup_code TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS topup_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                amount INTEGER NOT NULL,
                topup_code TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                qr_url TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                bank_transaction_id TEXT,
                topup_request_id INTEGER REFERENCES topup_requests(id),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS processed_bank_transactions (
                bank_transaction_id TEXT PRIMARY KEY,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                user_id INTEGER REFERENCES users(id),
                processed_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                price INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS mock_bank_incoming (
                id SERIAL PRIMARY KEY,
                bank_transaction_id TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                account_number TEXT NOT NULL,
                received_at TIMESTAMP NOT NULL DEFAULT NOW(),
                processed INTEGER NOT NULL DEFAULT 0
            );
        ''')
        cur.close()
    else:
        conn.executescript(f'''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                name TEXT NOT NULL,
                balance INTEGER NOT NULL DEFAULT 0,
                topup_code TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT ({now_def})
            );
            CREATE TABLE IF NOT EXISTS topup_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                topup_code TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                qr_url TEXT,
                created_at TEXT NOT NULL DEFAULT ({now_def}),
                completed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                bank_transaction_id TEXT,
                topup_request_id INTEGER,
                created_at TEXT NOT NULL DEFAULT ({now_def}),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS processed_bank_transactions (
                bank_transaction_id TEXT PRIMARY KEY,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                user_id INTEGER,
                processed_at TEXT NOT NULL DEFAULT ({now_def})
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                price INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at TEXT NOT NULL DEFAULT ({now_def})
            );
            CREATE TABLE IF NOT EXISTS mock_bank_incoming (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bank_transaction_id TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                account_number TEXT NOT NULL,
                received_at TEXT NOT NULL DEFAULT ({now_def}),
                processed INTEGER NOT NULL DEFAULT 0
            );
        ''')

    commit(conn)
    close(conn)


def insert_ignore_mock(conn, tx_id, amount, description, account):
    if IS_PG:
        execute(conn, '''
            INSERT INTO mock_bank_incoming (bank_transaction_id, amount, description, account_number)
            VALUES (?, ?, ?, ?) ON CONFLICT (bank_transaction_id) DO NOTHING
        ''', (tx_id, amount, description, account))
    else:
        execute(conn, '''
            INSERT OR IGNORE INTO mock_bank_incoming (bank_transaction_id, amount, description, account_number)
            VALUES (?, ?, ?, ?)
        ''', (tx_id, amount, description, account))