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
}
