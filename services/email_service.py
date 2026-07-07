import smtplib
from email.mime.text import MIMEText
from config import SMTP, SITE_NAME


def send_otp_email(to_email, otp):
    subject = f'[{SITE_NAME}] Mã OTP đặt lại mật khẩu'
    body = f'''Xin chào,

Bạn đã yêu cầu đặt lại mật khẩu tại {SITE_NAME}.

Mã OTP của bạn: {otp}

Mã có hiệu lực trong 5 phút. Không chia sẻ mã này với ai.

Nếu bạn không yêu cầu, hãy bỏ qua email này.

— {SITE_NAME}
'''
    if not SMTP['host'] or not SMTP['user'] or not SMTP['password']:
        print(f'[EMAIL-DEV] OTP for {to_email}: {otp} (SMTP chưa cấu hình)')
        return {'ok': True, 'dev': True}

    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = SMTP['from'] or SMTP['user']
    msg['To'] = to_email

    with smtplib.SMTP(SMTP['host'], SMTP['port']) as s:
        s.starttls()
        s.login(SMTP['user'], SMTP['password'])
        s.send_message(msg)
    return {'ok': True, 'dev': False}