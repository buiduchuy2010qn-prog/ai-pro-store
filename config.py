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

_cors_raw = os.getenv('CORS_ORIGINS', '')
_cors_list = [o.strip() for o in _cors_raw.split(',') if o.strip()]

SECURITY = {
    'force_hsts': os.getenv('FORCE_HSTS', 'false').lower() == 'true',
    'hsts_max_age': int(os.getenv('HSTS_MAX_AGE', '31536000')),
    'csp_enabled': os.getenv('CSP_ENABLED', 'true').lower() != 'false',
    'cors_origins': _cors_list,
    'cors_allow_same_host': os.getenv('CORS_ALLOW_SAME_HOST', 'true').lower() != 'false',
    'rate_global_per_min': int(os.getenv('RATE_GLOBAL_PER_MIN', '120')),
    'rate_auth_per_min': int(os.getenv('RATE_AUTH_PER_MIN', '10')),
    'rate_write_per_min': int(os.getenv('RATE_WRITE_PER_MIN', '60')),
    'rate_ai_per_min': int(os.getenv('RATE_AI_PER_MIN', '20')),
    'max_body_bytes': int(os.getenv('MAX_BODY_BYTES', '1048576')),
    'password_min_length': int(os.getenv('PASSWORD_MIN_LENGTH', '8')),
    'lockout_attempts': int(os.getenv('LOCKOUT_ATTEMPTS', '5')),
    'lockout_minutes': int(os.getenv('LOCKOUT_MINUTES', '15')),
    'jwt_expire_hours': int(os.getenv('JWT_EXPIRE_HOURS', '24')),
    'max_sessions_per_user': int(os.getenv('MAX_SESSIONS_PER_USER', '3')),
    'legacy_jwt_allowed': os.getenv('LEGACY_JWT_ALLOWED', 'true').lower() != 'false',
    'csrf_ttl_sec': int(os.getenv('CSRF_TTL_SEC', '7200')),
    'csrf_relaxed': os.getenv('CSRF_RELAXED', 'true').lower() != 'false',
    'turnstile_site_key': os.getenv('TURNSTILE_SITE_KEY', ''),
    'turnstile_secret_key': os.getenv('TURNSTILE_SECRET_KEY', ''),
    'step_up_all_pro': os.getenv('STEP_UP_ALL_PRO', 'true').lower() != 'false',
    'step_up_ttl_sec': int(os.getenv('STEP_UP_TTL_SEC', '600')),
    'suspicious_ip_count': int(os.getenv('SUSPICIOUS_IP_COUNT', '4')),
    'trust_block_threshold': int(os.getenv('TRUST_BLOCK_THRESHOLD', '30')),
    'alert_webhook_url': os.getenv('SECURITY_ALERT_WEBHOOK', ''),
    'alert_cooldown_sec': int(os.getenv('ALERT_COOLDOWN_SEC', '300')),
}