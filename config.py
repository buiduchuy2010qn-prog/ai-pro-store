import os
from dotenv import load_dotenv

load_dotenv()

SITE_NAME = 'Shop của Đức Hi'
WELCOME_MSG = 'Chào mừng đến Web Shop của Đức Hi'

JWT_SECRET = os.getenv('JWT_SECRET', 'dev-secret-change-me')
PORT = int(os.getenv('PORT', '3000'))

ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'buiduchuy2010qn@gmail.com').strip().lower()
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'DUCHUY2010#')

BANK = {
    'mode': os.getenv('BANK_MODE', 'mock'),
    'account': os.getenv('BANK_ACCOUNT', '0394709137'),
    'name': os.getenv('BANK_NAME', 'MB Bank'),
    'code': os.getenv('BANK_CODE', 'MB'),
    'holder': os.getenv('BANK_ACCOUNT_HOLDER', 'ADMIN'),
    'interval': int(os.getenv('BANK_CHECK_INTERVAL_SECONDS', '15')),
    'api_url': os.getenv('BANK_API_URL', ''),
    'api_key': os.getenv('BANK_API_KEY', ''),
}

WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET', '')
ZALO_PHONE = os.getenv('ZALO_PHONE', '0944255413')

SMTP = {
    'host': os.getenv('SMTP_HOST', ''),
    'port': int(os.getenv('SMTP_PORT', '587')),
    'user': os.getenv('SMTP_USER', ''),
    'password': os.getenv('SMTP_PASS', ''),
    'from': os.getenv('SMTP_FROM', os.getenv('SMTP_USER', '')),
}

OTP_EXPIRE_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
OTP_RATE_LIMIT_PER_HOUR = 3