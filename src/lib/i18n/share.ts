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
  'share.facebook': 'Facebook / Messenger',
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
  'share.tiktokHint': 'Đã sao chép — dán vào TikTok để chia sẻ',
  'share.close': 'Đóng',

  // ── Brochure share (recommendation cards & plans) ──────────────────────────
  // Every label below describes exactly what the button DOES. A url-handoff
  // target cannot carry the recommendation (Places data has no public page), so
  // its button says "Sao chép & mở …" and its result says the same — never "Đã gửi".
  'share.viber': 'Viber',
  'share.line': 'LINE',
  'share.email': 'Email',
  'share.inbox': 'Tappy Inbox',
  'share.save': 'Lưu về máy',
  'share.previewTitle': 'Chia sẻ gợi ý',
  'share.previewFrom': 'từ TappyAI',
  'share.previewHint': 'Người nhận sẽ thấy đúng nội dung này',
  'share.copyContent': 'Sao chép nội dung',
  'share.copiedContent': 'Đã sao chép nội dung',
  'share.copyAndOpen': 'Sao chép & mở {app}',
  'share.copiedAndOpened': 'Đã sao chép nội dung — đã mở {app}, dán vào để gửi',
  'share.openedWithText': 'Đã mở {app} với nội dung',
  'share.appNotOpened': 'Không mở được {app} — nội dung đã được sao chép',
  'share.emailOpened': 'Đã mở ứng dụng email',
  'share.saveImage': 'Lưu ảnh',
  'share.saveText': 'Lưu văn bản',
  'share.savedImage': 'Đã lưu ảnh gợi ý',
  'share.savedText': 'Đã lưu văn bản gợi ý',
  'share.saveFailed': 'Không lưu được',
  'share.inboxSignIn': 'Đăng nhập để gửi vào Tappy Inbox',
  'share.inboxPick': 'Chọn người nhận trong Tappy Inbox',
  'share.inboxSent': 'Đã gửi vào Tappy Inbox',
  'share.inboxFailed': 'Không gửi được vào Tappy Inbox',
  'share.nothingToShare': 'Chưa có gợi ý để chia sẻ',
  'share.morePlaces': 'và {n} địa điểm khác',
}

export const en = {
  'share.title': 'Share',
  'share.facebook': 'Facebook / Messenger',
  'share.tiktok': 'TikTok',
  'share.zalo': 'Zalo',
  'share.copyLink': 'Copy link',
  'share.copied': 'Copied',
  'share.more': 'More apps',
  'share.open': 'Open',
  'share.opened': 'Opened {app}',
  'share.unavailable': 'Sharing is unavailable',
  'share.copyFailed': 'Unable to copy link',
  'share.tiktokHint': 'Copied — paste it into TikTok to share',
  'share.close': 'Close',

  'share.viber': 'Viber',
  'share.line': 'LINE',
  'share.email': 'Email',
  'share.inbox': 'Tappy Inbox',
  'share.save': 'Save to device',
  'share.previewTitle': 'Share recommendation',
  'share.previewFrom': 'from TappyAI',
  'share.previewHint': 'The recipient will see exactly this',
  'share.copyContent': 'Copy content',
  'share.copiedContent': 'Content copied',
  'share.copyAndOpen': 'Copy & open {app}',
  'share.copiedAndOpened': 'Content copied — {app} opened, paste to send',
  'share.openedWithText': 'Opened {app} with the content',
  'share.appNotOpened': 'Could not open {app} — the content was copied',
  'share.emailOpened': 'Opened your email app',
  'share.saveImage': 'Save image',
  'share.saveText': 'Save text',
  'share.savedImage': 'Recommendation image saved',
  'share.savedText': 'Recommendation text saved',
  'share.saveFailed': 'Could not save',
  'share.inboxSignIn': 'Sign in to send to Tappy Inbox',
  'share.inboxPick': 'Choose a recipient in Tappy Inbox',
  'share.inboxSent': 'Sent to Tappy Inbox',
  'share.inboxFailed': 'Could not send to Tappy Inbox',
  'share.nothingToShare': 'Nothing to share yet',
  'share.morePlaces': 'and {n} more places',
}
