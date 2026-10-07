// ── A LOCAL SHOP / SERVICE REQUEST IS A PLACE SEARCH — chat2 A2 (2026-10-02) ─────────────────
//
// Owner report: "muốn tìm cửa hàng dán tại chỗ ở phú nhuận" ("a shop that applies a screen protector
// on the spot, in Phú Nhuận") got a question back — twice — and never a search. Measured on the
// dev server (tappyai_consult: domains ["shopping"], turn "pick"): the brain read it as SHOPPING,
// `deriveSearchNow` returned null for every shopping turn that asks WHERE ("cửa hàng", "tiệm"…),
// so no tool ran and the model, with nothing to read, restated the request as a question.
//
// A request for a physical shop or a repair/fitting SERVICE ("dán màn hình", "sửa điện thoại",
// "thay pin") is a map search, not a product search: this module names the call, by code.
// Deterministic; the query carries the service, never the area (the area travels as `location`).

export interface LocalShopSearch {
  query: string
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim()

/** Service → the query a map search answers well. Order matters: the first match wins. */
const SERVICES: ReadonlyArray<[RegExp, string]> = [
  // Screen protector / film / glass fitted at the shop. "dán tại chỗ" alone means exactly this.
  [/\b(?:dan|ep|lap)\s+(?:man hinh|cuong luc|kinh|film|ppf|skin)\b|\bdan\s+(?:tai cho|luon|ngay|dien thoai|iphone)\b|\bdan\s+cuong luc\b|\bcua hang\s+dan\b|\btiem\s+dan\b/, 'cửa hàng dán màn hình điện thoại'],
  [/\bthay\s+pin\b/, 'tiệm thay pin điện thoại'],
  [/\b(?:sua|sua chua)\s+(?:dien thoai|iphone|samsung|man hinh dien thoai)\b|\bthay\s+man hinh\b|\bep kinh\b/, 'tiệm sửa chữa điện thoại'],
  [/\b(?:sua|sua chua)\s+(?:laptop|macbook|may tinh|pc)\b|\bve sinh\s+laptop\b/, 'tiệm sửa chữa laptop'],
  [/\b(?:sua|sua chua)\s+(?:may anh|tai nghe|may tinh bang|ipad)\b/, 'tiệm sửa chữa thiết bị điện tử'],
  [/\b(?:sua|sua chua|danh bong)\s+giay\b/, 'tiệm sửa giày'],
  [/\b(?:sua|sua chua)\s+dong ho\b|\bthay\s+day dong ho\b/, 'tiệm sửa đồng hồ'],
  [/\b(?:cat|lam)\s+chia khoa\b/, 'tiệm làm chìa khóa'],
  [/\b(?:sua)\s+(?:xe may|xe dap|lop xe)\b|\bva\s+xe\b/, 'tiệm sửa xe'],
  [/\b(?:cat|may|sua)\s+(?:quan ao|do)\b|\btiem may\b/, 'tiệm may đo sửa quần áo'],
]

/** Words that make the request an ONLINE purchase, whatever shop word it carries. */
const ONLINE = /\b(?:shopee|lazada|tiki|tiktok shop|online|giao hang|ship|dat hang|mua online|website|gia bao nhieu)\b/

/**
 * The shop search a text asks for, or null. `text` is the user's request (and, for a follow-up turn,
 * the consultation's user turns joined — the service may have been named turns ago).
 */
export function deriveLocalShopSearch(text: string): LocalShopSearch | null {
  const t = fold(text)
  if (!t || ONLINE.test(t)) return null
  for (const [re, query] of SERVICES) {
    if (re.test(t)) return { query }
  }
  return null
}

