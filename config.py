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
CASSO = {
    'secure_token': os.getenv('CASSO_SECURE_TOKEN', ''),
    'checksum_key': os.getenv('CASSO_CHECKSUM_KEY', ''),
}
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

_ai_key = os.getenv('XAI_API_KEY') or os.getenv('OPENAI_API_KEY') or os.getenv('AI_API_KEY', '')
_ai_url = os.getenv('AI_API_URL', '')
if not _ai_url:
    _ai_url = 'https://api.x.ai/v1/chat/completions' if os.getenv('XAI_API_KEY') else 'https://api.openai.com/v1/chat/completions'

AI = {
    'api_key': _ai_key,
    'api_url': _ai_url,
    'model': os.getenv('AI_MODEL', 'grok-3-mini' if os.getenv('XAI_API_KEY') else 'gpt-4o-mini'),
    'rate_limit': int(os.getenv('AI_RATE_LIMIT_PER_HOUR', '30')),
}