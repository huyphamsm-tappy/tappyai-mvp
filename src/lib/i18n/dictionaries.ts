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

    // Settings
    'settings.title': 'Cài đặt',
    'settings.options': 'Tùy chọn',
    'settings.other': 'Khác',
    'settings.notifications': 'Thông báo',
    'settings.notifications.desc': 'Nhắc nhở và cập nhật',
    'settings.memory': 'Trí nhớ',
    'settings.memory.desc': 'Quản lý thông tin AI ghi nhớ',
    'settings.language': 'Ngôn ngữ',
    'settings.terms': 'Điều khoản dịch vụ',
    'settings.privacy': 'Chính sách bảo mật',
    'settings.version': 'Phiên bản hiện tại: {v}',
    'settings.signOut': 'Đăng xuất',
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

    // Settings
    'settings.title': 'Settings',
    'settings.options': 'Options',
    'settings.other': 'Other',
    'settings.notifications': 'Notifications',
    'settings.notifications.desc': 'Reminders and updates',
    'settings.memory': 'Memory',
    'settings.memory.desc': 'Manage what the AI remembers',
    'settings.language': 'Language',
    'settings.terms': 'Terms of Service',
    'settings.privacy': 'Privacy Policy',
    'settings.version': 'Current version: {v}',
    'settings.signOut': 'Sign out',
  },
}
