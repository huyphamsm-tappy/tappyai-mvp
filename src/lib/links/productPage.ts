// SOURCE RULE (sourceInvisibleChars.test.ts): no raw invisible / bidi / private-use characters in this file.
//
// A marketplace / retailer PRODUCT page (never a search, category or shop page), per host. The patterns are the merchants' own URL
// grammar, measured 2026-09-28 on the UAT query. ONE definition, read by the product builder (tools/shopping.ts, which keeps only such
// pages as merchant rows) and by the URL grant contract (security/urlGrants.ts, which grants 'action' only to such a page) -- a second
// copy of a link rule is how the TikTok Shop defect in PR #74 happened.
const PRODUCT_PAGE: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/(^|\.)shopee\.vn$/, /-i\.\d+\.\d+/],
  [/(^|\.)tiki\.vn$/, /-p\d+\.html/],
  [/(^|\.)lazada\.vn$/, /^\/products\//],
  // CellphoneS: a product is ONE slug (`/op-lung-iphone-17-pro-max-uag-....html`); `/phu-kien/.../uag.html` is a category.
  [/(^|\.)cellphones\.com\.vn$/, /^\/[^/]+\.html$/],
]

export function isMerchantProductPage(link: string): boolean {
  try {
    const u = new URL(link)
    const host = u.hostname.toLowerCase()
    return PRODUCT_PAGE.some(([h, p]) => h.test(host) && p.test(u.pathname))
  } catch { return false }
}
