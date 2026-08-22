// i18n dictionary module for /subscription — B07.
//
// The paywall rendered 29 of its 38 lines in Vietnamese to English sessions: plan names, feature
// bullets, price cadence and the whole FAQ. It is the screen the product asks people for money
// on, and it was the worst offender on the site.
//
// 🚨 The English here is deliberately IDENTICAL to the iOS catalogue authored in B03
// (`sub.free.messages`, `sub.pro.*`, `sub.faq.*` in Localizable.xcstrings). The same plan must
// not describe itself differently on two platforms — a user comparing them would reasonably
// wonder which one they are buying.

export const vi: Record<string, string> = {
  'sub.free.name': 'Gói Free',
  'sub.free.tagline': 'Dùng thử miễn phí',
  'sub.free.price': '0đ',
  'sub.perMonth': '/tháng',
  // {count} comes from FREE_DAILY_LIMIT — the page once advertised a limit the API did not
  // enforce, so the number is never written into the copy.
  'sub.free.messages': '{count} tin nhắn / ngày',
  'sub.free.search': 'Tìm kiếm địa điểm cơ bản',
  'sub.free.history': 'Lưu lịch sử 7 ngày',

  'sub.pro.name': 'Gói Pro',
  'sub.pro.tagline': 'Không giới hạn, đầy đủ tính năng',
  'sub.pro.messages': 'Tin nhắn không giới hạn',
  'sub.pro.search': 'Tìm kiếm nâng cao + chính xác hơn',
  'sub.pro.history': 'Lưu lịch sử không giới hạn',
  'sub.pro.voice': 'Nhận giọng nói (Voice Input)',
  'sub.pro.memory': 'AI nhớ sở thích cá nhân',
  'sub.pro.priority': 'Ưu tiên phản hồi nhanh hơn',

  'sub.active': 'Bạn đang dùng TappyAI Pro',

  'sub.faq.title': 'Câu hỏi thường gặp',
  'sub.faq.payment.q': 'Thanh toán bằng gì?',
  'sub.faq.payment.a': 'Hỗ trợ thẻ Visa/Mastercard và ví điện tử — sắp ra mắt.',
  'sub.faq.cancel.q': 'Có thể hủy bất lúc nào không?',
  'sub.faq.cancel.a': 'Có, hủy bất kỳ lúc nào, dữ liệu vẫn được giữ nguyên.',
  'sub.faq.reset.q': 'Giới hạn Free được reset khi nào?',
  'sub.faq.reset.a': 'Reset lúc 00:00 mỗi ngày theo giờ Việt Nam.',

  'sub.pageTitle': 'Nâng cấp TappyAI',
  'sub.hero.subtitle': 'Trải nghiệm đầy đủ, không giới hạn',
  'sub.renews': 'Gia hạn: {date}',
  // Split around the <strong> counter so both languages keep the emphasis in their own word order.
  'sub.freeRemaining.before': '🎁 Bạn đang dùng gói Free — còn ',
  'sub.freeRemaining.after': ' tin nhắn hôm nay',
  'sub.currentPlan': 'Gói hiện tại',
  'sub.onPro': 'Bạn đang dùng Pro ✓',
  'sub.backToProfile': 'Quay lại hồ sơ',

  // The checkout and manage buttons are separate components, and they were the last Vietnamese
  // left on an otherwise-English paywall — the one place a user is asked to pay.
  'sub.checkout.upgrade': 'Nâng cấp Pro — 99K/tháng',
  'sub.checkout.redirecting': 'Đang chuyển hướng...',
  'sub.checkout.error': 'Có lỗi xảy ra. Vui lòng thử lại.',
  'sub.checkout.offline': 'Không thể kết nối. Vui lòng thử lại.',
  'sub.manage': 'Quản lý / Hủy gói',
  'sub.manage.opening': 'Đang mở...',
  'sub.manage.label': 'Quản lý hoặc hủy gói đăng ký',
}

export const en: Record<string, string> = {
  'sub.free.name': 'Free plan',
  'sub.free.tagline': 'Try it free',
  // Not translated: VND is the price this product is sold in, and "0đ" is what it costs in both
  // languages. Converting it would invent a price that does not exist.
  'sub.free.price': '0đ',
  'sub.perMonth': '/month',
  'sub.free.messages': '{count} messages / day',
  'sub.free.search': 'Basic place search',
  'sub.free.history': '7-day history',

  'sub.pro.name': 'Pro plan',
  'sub.pro.tagline': 'Unlimited, every feature',
  'sub.pro.messages': 'Unlimited messages',
  'sub.pro.search': 'Advanced, more accurate search',
  'sub.pro.history': 'Unlimited history',
  'sub.pro.voice': 'Voice input',
  'sub.pro.memory': 'AI remembers your preferences',
  'sub.pro.priority': 'Priority, faster responses',

  'sub.active': "You're on TappyAI Pro",

  'sub.faq.title': 'Frequently asked questions',
  'sub.faq.payment.q': 'What payment methods are supported?',
  'sub.faq.payment.a': 'Visa/Mastercard and e-wallets — coming soon.',
  'sub.faq.cancel.q': 'Can I cancel at any time?',
  'sub.faq.cancel.a': 'Yes — cancel any time, and your data is kept.',
  'sub.faq.reset.q': 'When does the Free limit reset?',
  'sub.faq.reset.a': 'At 00:00 every day, Vietnam time.',

  'sub.pageTitle': 'Upgrade TappyAI',
  'sub.hero.subtitle': 'The full experience, no limits',
  'sub.renews': 'Renews: {date}',
  'sub.freeRemaining.before': "🎁 You're on the Free plan — ",
  'sub.freeRemaining.after': ' messages left today',
  'sub.currentPlan': 'Current plan',
  'sub.onPro': "You're on Pro ✓",
  'sub.backToProfile': 'Back to profile',

  'sub.checkout.upgrade': 'Upgrade to Pro — 99K/month',
  'sub.checkout.redirecting': 'Redirecting…',
  'sub.checkout.error': 'Something went wrong. Please try again.',
  'sub.checkout.offline': "Couldn't connect. Please try again.",
  'sub.manage': 'Manage / cancel plan',
  'sub.manage.opening': 'Opening…',
  'sub.manage.label': 'Manage or cancel your subscription',
}
