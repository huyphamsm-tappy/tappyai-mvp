// Minimal, MVP-scoped i18n dictionary. Only keys actually used by translated
// components live here — this is not a full-app translation sweep (explicitly
// out of scope for MVP, see Localization_Architecture.md §2.1). New keys get
// added here as more of the UI is deliberately migrated off hardcoded strings.
export type Locale = 'vi' | 'en'

export const dictionaries: Record<Locale, Record<string, string>> = {
  vi: {
    'auth.emailOtp.cta': 'Đăng nhập bằng Email',
    'auth.emailOtp.back': 'Quay lại',
    'auth.emailOtp.emailPlaceholder': 'you@example.com',
    'auth.emailOtp.send': 'Gửi mã xác thực',
    'auth.emailOtp.sending': 'Đang gửi...',
    'auth.emailOtp.codeSentTo': 'Đã gửi mã 6 số đến {email}',
    'auth.emailOtp.verify': 'Xác nhận',
    'auth.emailOtp.verifying': 'Đang xác nhận...',
    'auth.emailOtp.errorInvalidEmail': 'Nhập email hợp lệ',
    'auth.emailOtp.errorSendFailed': 'Không thể gửi mã, vui lòng thử lại',
    'auth.emailOtp.errorInvalidCode': 'Mã xác thực gồm 6 chữ số',
    'auth.emailOtp.errorVerifyFailed': 'Mã không đúng hoặc đã hết hạn',
  },
  en: {
    'auth.emailOtp.cta': 'Sign in with Email',
    'auth.emailOtp.back': 'Back',
    'auth.emailOtp.emailPlaceholder': 'you@example.com',
    'auth.emailOtp.send': 'Send code',
    'auth.emailOtp.sending': 'Sending...',
    'auth.emailOtp.codeSentTo': 'Sent a 6-digit code to {email}',
    'auth.emailOtp.verify': 'Verify',
    'auth.emailOtp.verifying': 'Verifying...',
    'auth.emailOtp.errorInvalidEmail': 'Enter a valid email',
    'auth.emailOtp.errorSendFailed': 'Could not send code, please try again',
    'auth.emailOtp.errorInvalidCode': 'The code is 6 digits',
    'auth.emailOtp.errorVerifyFailed': 'Incorrect or expired code',
  },
}
