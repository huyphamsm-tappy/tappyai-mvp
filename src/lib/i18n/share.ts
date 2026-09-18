// Share menu strings.
//
// The share UI previously carried hardcoded Vietnamese ("Chia sẻ", "Đã copy"),
// so English users saw Vietnamese labels. Namespaced under `share.` and merged
// like the other wave modules.
//
// Wording note: TappyAI does not publish to Facebook, TikTok or Zalo — it hands
// the link over and the user posts it themselves. So these strings say "opened"
// and never "posted" or "shared successfully", which would claim something that
// did not happen.

export const vi = {
  'share.title': 'Chia sẻ',
  'share.facebook': 'Facebook',
  'share.tiktok': 'TikTok',
  'share.zalo': 'Zalo',
  'share.copyLink': 'Sao chép liên kết',
  'share.copied': 'Đã sao chép',
  'share.more': 'Ứng dụng khác',
  'share.open': 'Mở',
  'share.opened': 'Đã mở {app}',
  'share.unavailable': 'Không thể chia sẻ lúc này',
  'share.copyFailed': 'Không thể sao chép liên kết',
  // TikTok has no web link handoff, so the honest instruction is to paste it.
  'share.tiktokHint': 'Đã sao chép liên kết — dán vào TikTok để chia sẻ',
  'share.close': 'Đóng',
  // G1 share preview — the explicit "this is what others will see" step.
  'share.publicResult': 'Chia sẻ kết quả công khai',
  'share.previewTitle': 'Người khác sẽ thấy gì',
  'share.previewHint': 'Đây là bản công khai đã ẩn thông tin cá nhân. Chỉ khi bạn xác nhận, liên kết mới được tạo.',
  'share.previewLoading': 'Đang chuẩn bị bản xem trước…',
  'share.previewTitleField': 'Tiêu đề công khai',
  'share.previewQuestion': 'Câu hỏi (đã rút gọn)',
  'share.previewAnswer': 'Câu trả lời',
  'share.previewCounts': '{buttons} nút hành động · {images} ảnh',
  'share.previewPrivacy': 'Không bao gồm: tên, số điện thoại, email, địa chỉ nhà, trí nhớ và lịch sử trò chuyện của bạn.',
  'share.cancel': 'Huỷ',
  'share.confirmPublish': 'Tạo liên kết công khai',
  'share.publishing': 'Đang tạo…',
  'share.published': 'Đã tạo liên kết công khai',
  'share.previewFailed': 'Không thể tạo bản xem trước lúc này',
  'share.publishFailed': 'Không thể tạo liên kết lúc này',
  // G1 wedge — Scam Shield verdict share-out
  'share.scam.button': 'Cảnh báo cho mọi người',
  'share.scam.hint': 'Tạo trang công khai với kết quả kiểm tra để gửi vào nhóm Zalo, Messenger…',
  'share.scam.title': 'Kiểm tra lừa đảo: {host} — TappyAI',
  'share.scam.checkAnother': 'Kiểm tra một link khác',
  'share.unlistedNotice': 'Bạn chưa đăng nhập: liên kết vẫn mở được cho mọi người nhưng không xuất hiện trên tìm kiếm cho đến khi bạn tạo tài khoản.',
}

export const en = {
  'share.title': 'Share',
  'share.facebook': 'Facebook',
  'share.tiktok': 'TikTok',
  'share.zalo': 'Zalo',
  'share.copyLink': 'Copy link',
  'share.copied': 'Copied',
  'share.more': 'More apps',
  'share.open': 'Open',
  'share.opened': 'Opened {app}',
  'share.unavailable': 'Sharing is unavailable',
  'share.copyFailed': 'Unable to copy link',
  'share.tiktokHint': 'Link copied — paste it into TikTok to share',
  'share.close': 'Close',
  'share.publicResult': 'Share as public result',
  'share.previewTitle': 'What others will see',
  'share.previewHint': 'This is the public version with personal details removed. No link exists until you confirm.',
  'share.previewLoading': 'Preparing preview…',
  'share.previewTitleField': 'Public title',
  'share.previewQuestion': 'Question (generalised)',
  'share.previewAnswer': 'Answer',
  'share.previewCounts': '{buttons} action buttons · {images} images',
  'share.previewPrivacy': 'Not included: your name, phone, email, home address, memory and chat history.',
  'share.cancel': 'Cancel',
  'share.confirmPublish': 'Create public link',
  'share.publishing': 'Creating…',
  'share.published': 'Public link created',
  'share.previewFailed': 'Could not prepare a preview right now',
  'share.publishFailed': 'Could not create the link right now',
  'share.scam.button': 'Warn your group',
  'share.scam.hint': 'Creates a public page with this verdict to send into Zalo, Messenger…',
  'share.scam.title': 'Scam check: {host} — TappyAI',
  'share.scam.checkAnother': 'Check another link',
  'share.unlistedNotice': 'You are not signed in: the link opens for anyone but stays out of search until you create an account.',
}

// ── G1 public shared result (/r/<slug>) ──────────────────────────────────────
//
// Server-rendered in the PAYLOAD's locale (a share is fixed in one language),
// so these are plain exports usable from a server component — not only via
// useTranslation(). Keys mirror the `share.` namespace above.
export const publicResultVi = {
  'publicResult.askedTappy': 'Đã hỏi Tappy',
  'publicResult.answer': 'Tappy trả lời',
  'publicResult.askAnother': 'Hỏi Tappy câu khác…',
  'publicResult.askPlaceholder': 'Bạn muốn hỏi gì tiếp?',
  'publicResult.send': 'Gửi',
  'publicResult.openTappy': 'Mở TappyAI',
  'publicResult.share': 'Chia sẻ kết quả này',
  'publicResult.poweredBy': 'Kết quả được tạo bởi TappyAI — trợ lý AI thuần Việt.',
  'publicResult.softGate': 'Thích câu trả lời? Đăng nhập miễn phí để hỏi Tappy không giới hạn và lưu lại kết quả.',
  'publicResult.hardGate': 'Bạn đã dùng hết lượt hỏi thử hôm nay. Đăng nhập để tiếp tục.',
  'publicResult.signIn': 'Đăng nhập miễn phí',
  'publicResult.notNow': 'Để sau',
  'publicResult.thinking': 'Tappy đang nghĩ…',
  'publicResult.suggested': 'Gợi ý câu hỏi',
  'publicResult.viewsLabel': 'lượt xem',
  'publicResult.moreResults': 'Xem thêm kết quả từ Tappy',
  'publicResult.retry': 'Thử lại',
  'publicResult.checkAnotherLink': 'Kiểm tra một link khác với Tappy',
  'publicResult.shareAnswer': 'Chia sẻ câu trả lời này',
}
export const publicResultEn = {
  'publicResult.askedTappy': 'Asked Tappy',
  'publicResult.answer': 'Tappy answered',
  'publicResult.askAnother': 'Ask Tappy something else…',
  'publicResult.askPlaceholder': 'What would you like to ask next?',
  'publicResult.send': 'Send',
  'publicResult.openTappy': 'Open TappyAI',
  'publicResult.share': 'Share this result',
  'publicResult.poweredBy': 'Generated by TappyAI — your personal AI agent for Vietnam.',
  'publicResult.softGate': 'Like the answer? Sign in for free to ask Tappy without limits and keep your results.',
  'publicResult.hardGate': "You've used today's free questions. Sign in to continue.",
  'publicResult.signIn': 'Sign in — it’s free',
  'publicResult.notNow': 'Not now',
  'publicResult.thinking': 'Tappy is thinking…',
  'publicResult.suggested': 'Suggested questions',
  'publicResult.viewsLabel': 'views',
  'publicResult.moreResults': 'More results from Tappy',
  'publicResult.retry': 'Retry',
  'publicResult.checkAnotherLink': 'Check another link with Tappy',
  'publicResult.shareAnswer': 'Share this answer',
}

/** Server-side lookup in the share's own locale. */
export function publicResultText(locale: 'vi' | 'en', key: keyof typeof publicResultVi): string {
  return (locale === 'en' ? publicResultEn : publicResultVi)[key] ?? publicResultVi[key]
}
