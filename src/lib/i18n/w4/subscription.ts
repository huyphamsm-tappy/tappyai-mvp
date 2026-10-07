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
  'sub.free.price': '0đ',
  // {count} comes from FREE_DAILY_LIMIT — the page once advertised a limit the API did not
  // enforce, so the number is never written into the copy.
  // Split around the <strong> counter so both languages keep the emphasis in their own word order.

  // The checkout and manage buttons are separate components, and they were the last Vietnamese
  // left on an otherwise-English paywall — the one place a user is asked to pay.
  'sub.manage': 'Quản lý / Hủy gói',
}

export const en: Record<string, string> = {
  // Not translated: VND is the price this product is sold in, and "0đ" is what it costs in both
  // languages. Converting it would invent a price that does not exist.
  'sub.free.price': '0đ',
  'sub.manage': 'Manage / cancel plan',
}
