import { normalizeVN } from '@/lib/ai/intent'

// ── Shopping search validity filter (Universal Plan — Phase 1) ──────────────
//
// THE RULE THIS FILE ENFORCES: bad input must not become advice.
//
// Measured on production (bd89c5d): `search_products("mac pro")` fell through to
// the organic path because Serper `/shopping` was empty, and the organic query
// `"mac pro gia Shopee Tiki Lazada"` returned:
//
//   · "Từng là giấc mơ kỳ lân tỷ đô, Tiki giờ được định giá chỉ bằng…"  (a news article)
//   · "Lên LAZADA, SHOPEE, TIKI mua 100 Hộp khẩu trang Y Tế…"           (a mask promo)
//   · "Lazada 8.8 Sale - App Store - Apple"                              (a generic sale page)
//   · "https://s.shopee.vn/8V1PKuAXsn"                                   (a bare URL, no title)
//
// None is a MacBook listing, yet all reached the model and the UI — because they
// are not "structured" (no price/product_id) they bypass `normalizeShopping`,
// the ranker and every grounding guard, but they are still rendered as cards.
//
// This filter runs BEFORE those organic rows go downstream. It is deliberately
// NARROW and DETERMINISTIC: three checks, each one killing a class of the junk
// above, and nothing that reaches into the STRUCTURED `/shopping` path (that is
// candidate identity — protected, and out of Phase-1 scope).
//
// 🚨 It does NOT require a price. A legitimate organic listing (a shop's own
// product page) can be valid without a parsed price, so requiring one would
// drop real results. Relevance + a real listing surface is the bar, not price.

export interface OrganicResult {
  title?: string
  link?: string
  snippet?: string
  [k: string]: unknown
}

/**
 * Words that carry no product identity, so they must not count toward relevance.
 *
 * These are the connective/marketing tokens that appear in EVERY shopping title
 * ("mua", "giá", "chính hãng", "giao nhanh", …) plus bare years. Without this,
 * "Lazada 8.8 Sale" would match a query for anything sold on Lazada.
 */
const STOPWORDS = new Set([
  'mua', 'ban', 'gia', 'o', 'tai', 'cho', 'va', 'the', 'cu', 'moi', 'tot', 're',
  'giao', 'nhanh', 'chinh', 'hang', 'shop', 'san', 'pham', 'tim', 'kiem', 'online',
  'viet', 'nam', 'sale', 'giam', 'khuyen', 'mai', 'uu', 'dai', 'thang', 'nay',
  '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026',
])

/** Hosts that never carry a purchasable listing — news, social, video, encyclopedia. */
const NON_COMMERCE_HOST = [
  /youtube\./, /youtu\.be/, /facebook\./, /fb\.com/, /instagram\./, /tiktok\./,
  /twitter\./, /x\.com$/, /threads\./, /wikipedia\./, /reddit\./,
  /vnexpress\./, /tuoitre\./, /thanhnien\./, /dantri\./, /cafef\./, /cafebiz\./,
  /genk\./, /vietnamnet\./, /zingnews\./, /zing\.vn/, /kenh14\./, /soha\./,
  /baomoi\./, /vietnamplus\./, /nhandan\./, /laodong\./, /tinhte\./,
  /blogspot\./, /wordpress\./, /medium\./, /\.blog(\/|$)/,
]

/** Path/query markers of a SEARCH or CATEGORY page — not one specific product. */
const GENERIC_PATH = [
  /\/search\b/, /[?&]keyword=/, /[?&]q=/, /[?&]search=/,
  /\/tag\//, /\/tags\//, /\/category\//, /\/categories\//, /\/danh-muc\//,
  /\/collection\//, /\/collections\//, /\/catalog(\/|\?|$)/,
]

function significantTokens(s: string): string[] {
  return normalizeVN(s.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

/**
 * A title is relevant when it shares at least one PRODUCT-BEARING token with the
 * query. "mac pro" → {mac, pro}; a mask promo shares neither and is dropped.
 *
 * When the query has no significant token of its own (e.g. it was all stopwords),
 * relevance cannot be judged, so the check does not veto — the host/path checks
 * still apply.
 */
export function isRelevant(query: string, title: string): boolean {
  const q = significantTokens(query)
  if (q.length === 0) return true
  const t = significantTokens(title)
  // A title token that STARTS WITH a query token counts — so "mac" (query)
  // matches "macbook" (title). The direction matters: only title-startsWith-query,
  // never the reverse, so the noise word "mã" ("ma") does not satisfy "mac".
  return q.some(qt => t.some(tt => tt.startsWith(qt)))
}

function hostOf(link: string): string | null {
  try { return new URL(link).hostname.replace(/^www\./, '') } catch { return null }
}

/**
 * True only when an organic row is plausibly a real shopping listing for THIS query.
 *
 * All must hold:
 *   1. it has a real title and a real URL (a bare URL as the title is not a listing);
 *   2. its host is not a news/social/video/encyclopedia domain;
 *   3. its URL is not a search/category page;
 *   4. its title is relevant to the query.
 *
 * Any one failing drops the row. Each corresponds to a measured junk class.
 */
export function isValidShoppingResult(query: string, r: OrganicResult): boolean {
  const title = (r.title || '').trim()
  const link = (r.link || '').trim()
  if (!title || !link) return false
  if (/^https?:\/\//i.test(title)) return false           // the title is just a URL
  const host = hostOf(link)
  if (!host) return false
  if (NON_COMMERCE_HOST.some(re => re.test(host))) return false
  if (GENERIC_PATH.some(re => re.test(link.toLowerCase()))) return false
  if (!isRelevant(query, title)) return false
  return true
}

/** Keep only the rows that pass the validity bar. Order preserved. */
export function filterShoppingResults<T extends OrganicResult>(
  query: string,
  results: readonly T[] | null | undefined,
): T[] {
  if (!results) return []
  return results.filter(r => isValidShoppingResult(query, r))
}
