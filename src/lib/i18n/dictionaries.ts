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

    // Common
    'common.or': 'hoặc',
    'common.and': 'và',

    // Category tags
    'tag.food': 'Ăn uống',
    'tag.travel': 'Du lịch',
    'tag.spa': 'Spa & Làm đẹp',
    'tag.shopping': 'Mua sắm',
    'tag.hotel': 'Khách sạn',
    'tag.entertainment': 'Giải trí',

    // Login
    'login.slogan': 'Chạm đến mọi dịch vụ – AI Agent cá nhân hóa cho cuộc sống tại Việt Nam',
    'login.feature1': 'Trợ lý AI cá nhân hóa, hiểu rõ nhu cầu của bạn',
    'login.feature2': 'Gợi ý địa điểm, dịch vụ thuần Việt, sát thực tế',
    'login.feature3': 'Trả lời nhanh, chính xác với AI tiên tiến nhất',
    'login.inappTitle': '⚠️ Không thể đăng nhập Google trong {name}',
    'login.inappDesc': 'Google không cho phép đăng nhập trong trình duyệt nội bộ của {name}. Hãy mở trang này bằng Chrome hoặc Safari để đăng nhập.',
    'login.openChrome': 'Mở bằng Chrome',
    'login.copyLink': 'Sao chép link để mở ở trình duyệt khác',
    'login.copied': 'Đã copy link!',
    'login.iosHint': 'Trên iPhone: bấm vào biểu tượng ⋯ hoặc chia sẻ ở góc màn hình và chọn "Mở trong Safari"',
    'login.signingIn': 'Đang đăng nhập...',
    'login.continueGoogle': 'Tiếp tục với Google',
    'login.continueFacebook': 'Tiếp tục với Facebook',
    'login.continueZalo': 'Tiếp tục với Zalo',
    'login.agreePrefix': 'Bằng cách tiếp tục, bạn đồng ý với',

    // Register
    'register.subtitle': 'Tạo tài khoản mới',
    'register.errPasswordLen': 'Mật khẩu cần ít nhất 6 ký tự',
    'register.checkEmailTitle': 'Kiểm tra email của bạn 📩',
    'register.checkEmailDesc': 'Chúng tôi đã gửi link xác nhận tới {email}. Hãy mở email và bấm vào link để hoàn tất đăng ký.',
    'register.backToLogin': 'Quay lại đăng nhập',
    'register.fullName': 'Họ và tên',
    'register.fullNamePlaceholder': 'Nguyễn Văn A',
    'register.email': 'Email',
    'register.emailPlaceholder': 'ban@email.com',
    'register.password': 'Mật khẩu',
    'register.passwordPlaceholder': 'Tối thiểu 6 ký tự',
    'register.creating': 'Đang tạo tài khoản...',
    'register.submit': 'Tạo tài khoản',
    'register.agreePrefix': 'Bằng cách tạo tài khoản, bạn đồng ý với',

    // Onboarding
    'common.next': 'Tiếp theo',
    'common.skip': 'Bỏ qua',
    'onboarding.welcomeTitle': 'Chào mừng đến với TappyAI! 👋',
    'onboarding.welcomeDesc': 'Cho mình biết bạn quan tâm đến lĩnh vực nào để cá nhân hóa trải nghiệm nhé.',
    'onboarding.locationTitle': 'Bạn đang ở đâu? 📍',
    'onboarding.locationDesc': 'Để gợi ý địa điểm sát thực tế hơn với bạn.',
    'onboarding.otherCity': 'Hoặc nhập thành phố khác...',
    'onboarding.start': '🚀 Bắt đầu khám phá',
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

    // Common
    'common.or': 'or',
    'common.and': 'and',

    // Category tags
    'tag.food': 'Food',
    'tag.travel': 'Travel',
    'tag.spa': 'Spa & Beauty',
    'tag.shopping': 'Shopping',
    'tag.hotel': 'Hotels',
    'tag.entertainment': 'Entertainment',

    // Login
    'login.slogan': 'Every service at your fingertips – a personalized AI Agent for life in Vietnam',
    'login.feature1': 'A personalized AI assistant that truly understands your needs',
    'login.feature2': 'Local, true-to-life place and service suggestions',
    'login.feature3': 'Fast, accurate answers powered by the latest AI',
    'login.inappTitle': "⚠️ Can't sign in with Google inside {name}",
    'login.inappDesc': "Google doesn't allow sign-in inside {name}'s in-app browser. Open this page in Chrome or Safari to sign in.",
    'login.openChrome': 'Open in Chrome',
    'login.copyLink': 'Copy link to open in another browser',
    'login.copied': 'Link copied!',
    'login.iosHint': 'On iPhone: tap the ⋯ or share icon in the corner and choose "Open in Safari"',
    'login.signingIn': 'Signing in...',
    'login.continueGoogle': 'Continue with Google',
    'login.continueFacebook': 'Continue with Facebook',
    'login.continueZalo': 'Continue with Zalo',
    'login.agreePrefix': 'By continuing, you agree to our',

    // Register
    'register.subtitle': 'Create a new account',
    'register.errPasswordLen': 'Password must be at least 6 characters',
    'register.checkEmailTitle': 'Check your email 📩',
    'register.checkEmailDesc': 'We sent a confirmation link to {email}. Open the email and tap the link to finish signing up.',
    'register.backToLogin': 'Back to sign in',
    'register.fullName': 'Full name',
    'register.fullNamePlaceholder': 'John Doe',
    'register.email': 'Email',
    'register.emailPlaceholder': 'you@email.com',
    'register.password': 'Password',
    'register.passwordPlaceholder': 'At least 6 characters',
    'register.creating': 'Creating account...',
    'register.submit': 'Create account',
    'register.agreePrefix': 'By creating an account, you agree to our',

    // Onboarding
    'common.next': 'Next',
    'common.skip': 'Skip',
    'onboarding.welcomeTitle': 'Welcome to TappyAI! 👋',
    'onboarding.welcomeDesc': 'Tell us which areas interest you so we can personalize your experience.',
    'onboarding.locationTitle': 'Where are you? 📍',
    'onboarding.locationDesc': 'So we can suggest places that fit you better.',
    'onboarding.otherCity': 'Or type another city...',
    'onboarding.start': '🚀 Start exploring',
  },
}
