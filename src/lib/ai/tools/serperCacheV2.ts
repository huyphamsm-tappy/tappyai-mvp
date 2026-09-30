// ── SERPER CACHE V2 — key + TTL rules (PHIÊN LUNA, owner 30/09) ─────────────────────────────────
//
// Flag SERPER_CACHE_V2=1 (default OFF → serperCache.ts behaves exactly as v1). Only the KEY and the
// TTL change; the store, the fail-open rules, the size cap and the "non-empty only" rule stay v1's.
//
//   key   serper:v2:<endpoint>[:<variant>]:<sha256(normalizeQueryV2(query))>:<areaKeyV2(area)>
//         v1 keyed the model's query text verbatim, so "phở Quận 1", "phở ở q1" and "Phở, quận 1 TP.HCM"
//         were three paid calls for one answer. v2 folds only what is loss-free for the upstream answer:
//           · punctuation → space; locative/politeness fillers (ở, tại, khu vực, ạ, nhé, giúp…);
//           · area aliases → one spelling (q1 / q.1 / district 1 → quận 1; sg / sài gòn / tp.hcm / hcm
//             → hồ chí minh; hn → hà nội; đn / da nang → đà nẵng), in the query AND the location string;
//           · repeated tokens after that (the model often writes the city twice);
//           · "hồ chí minh" next to a numbered district (only HCM has them).
//           · diacritics, LAST (owner spec 30/09 "bỏ dấu"): "quan an" and "quán ăn" share an entry. Known cost:
//             words that differ only by tone share one too (mắt kính / mất kính — cacheKeys.ts); the queries
//             here are written by our code/model in full words, so the replay corpus has no such pair (cacheSim.mjs).
//   TTL   by what goes stale:
//           maps (places)        3 days  — the weekly openingHours object is stored; open-now is
//                                          computed by OUR code at read time (serperPlaces.ts), so
//                                          nothing time-of-day is frozen. Maps-terms caveat: v1 header.
//           shopping (prices)    6 h     — /shopping, and a web search limited to a shop site (Shopee, Lazada,
//                                          Tiki, Cellphones, TikTok Shop, GrabFood…): listing prices move in a day.
//           link lookup          3 days  — a web search limited to another site (TikTok clip, Klook, Trip.com
//                                          page for a named venue). 99% of web searches in replay were one of
//                                          these two kinds (cacheSim.mjs, 30/09).
//           other web search     24 h
//           anything time-bound  1 h     — tonight / this week / showtimes / events / gold / FX /
//                                          promotions / an explicit date (every endpoint).
//         Env overrides: SERPER_CACHE_V2_TTL_{MAPS,SHOPPING,LINK,SEARCH,TIMELY}_SECONDS.
//   data  the value is the tool's own record list (public provider fields only — no user location,
//         no memory, no distance-from-user), and serperCache.ts runs it through the untrusted-text (serperUntrusted.ts)
//         sanitizer before it is shared, so a poisoned title is never served to another user raw.
//
// This file has NO imports on purpose: scripts/consult/luna/cacheSim.mjs loads it straight into node.

export function serperCacheV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SERPER_CACHE_V2 === '1'
}

const AREA_ALIASES: Array<[RegExp, string]> = [
  [/(?:^| )(?:q|quận|quan|district|d)\s?\.?\s?(\d{1,2})(?= |$)/g, ' quận $1'],
  [/(?:^| )(?:tp\s?\.?\s?hcm|tphcm|tp hồ chí minh|thành phố hồ chí minh|hcmc|hcm|hồ chí minh|ho chi minh(?: city)?|sài gòn|sai gon|saigon|sg)(?= |$)/g, ' hồ chí minh'],
  [/(?:^| )(?:tp\s?\.?\s?hà nội|hà nội|ha noi|hanoi|hn)(?= |$)/g, ' hà nội'],
  [/(?:^| )(?:tp\s?\.?\s?đà nẵng|đà nẵng|da nang|danang|đn)(?= |$)/g, ' đà nẵng'],
  [/(?:^| )(?:vietnam|việt nam|viet nam|vn)(?= |$)/g, ' '],
]
const FILLER = /(?:^| )(?:ở|tại|khu vực|khu|gần đây|quanh đây|ạ|nhé|nha|giúp|giùm|cho mình|cho tôi|in|at|near|the)(?= |$)/g

/** The query as keyed by v2. Same text → same key; only loss-free folds (see header). */
export function normalizeQueryV2(query: string | null | undefined): string {
  let s = ` ${(query ?? '').normalize('NFC').toLowerCase().replace(/[.,;:!?()"'“”‘’\-–—/|+]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  s = s.replace(/(?:^| )(q|tp|d)\s(?=\d| ?hcm)/g, ' $1') // "q 1" / "tp hcm" after punctuation became a space
  for (const [re, to] of AREA_ALIASES) s = s.replace(re, to)
  s = s.replace(FILLER, ' ')
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of s.split(' ').filter(Boolean)) {
    // drop a repeated multi-word area ("hồ chí minh … hồ chí minh") and repeated single words
    if (seen.has(w) && !/^\d+$/.test(w)) continue
    seen.add(w)
    out.push(w)
  }
  // Numbered districts ("quận 1") exist only in Hồ Chí Minh, so "phở quận 1" and "phở quận 1 hồ chí minh" are one request.
  const joined = out.join(' ').replace(/(quận \d{1,2}.*?) hồ chí minh|hồ chí minh (.*?quận \d{1,2})/, (_m, a, b) => a ?? b)
  // Owner spec 30/09: "bỏ dấu". Folded LAST, after the aliases above matched their accented spellings.
  return joined.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
}

export type SerperCacheAreaV2 = { lat: number; lng: number; zoom?: number } | string | null | undefined

/** Coordinates unchanged from v1 (2 decimals ≈ 1.1 km + zoom); a location string gets the query folds. */
export function areaKeyV2(area: SerperCacheAreaV2): string {
  if (area && typeof area === 'object') {
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lng)) return 'none'
    return `ll=${area.lat.toFixed(2)},${area.lng.toFixed(2)},${area.zoom ?? 14}`
  }
  const loc = normalizeQueryV2(typeof area === 'string' ? area : '')
  return loc ? `loc=${encodeURIComponent(loc)}` : 'none'
}

// Anything whose answer depends on today: a time word, a showtime/event/price-of-the-day topic, a date.
const TIMELY = /(?:hôm nay|tối nay|tối mai|ngày mai|sáng mai|chiều nay|đêm nay|tuần này|tuần sau|cuối tuần|tháng này|lịch chiếu|suất chiếu|sự kiện|lễ hội|concert|liveshow|triển lãm|giá vàng|tỷ giá|tỉ giá|khuyến mãi|flash sale|giảm giá|mới nhất|tin tức|\btoday\b|\btonight\b|this week|\b\d{1,2}\/\d{1,2}\b|\b20\d\d\b)/i

const envSeconds = (env: Record<string, string | undefined>, name: string, dflt: number): number => {
  const n = Number(env[name])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt
}

/** Seconds to keep one v2 entry. */
export function serperTtlV2(endpoint: string, query: string, env: Record<string, string | undefined> = process.env): number {
  if (TIMELY.test(query ?? '')) return envSeconds(env, 'SERPER_CACHE_V2_TTL_TIMELY_SECONDS', 3_600)
  if (endpoint === 'maps') return envSeconds(env, 'SERPER_CACHE_V2_TTL_MAPS_SECONDS', 3 * 86_400)
  if (endpoint === 'shopping' || SHOP_SITE.test(query ?? '')) return envSeconds(env, 'SERPER_CACHE_V2_TTL_SHOPPING_SECONDS', 6 * 3_600)
  if (/\bsite:/i.test(query ?? '')) return envSeconds(env, 'SERPER_CACHE_V2_TTL_LINK_SECONDS', 3 * 86_400)
  return envSeconds(env, 'SERPER_CACHE_V2_TTL_SEARCH_SECONDS', 86_400)
}

// A web search restricted to a shop: its snippets carry listing prices, so it goes stale like /shopping.
const SHOP_SITE = /\bsite:(?:[a-z]+\.)?(?:shopee\.vn|lazada\.vn|tiki\.vn|cellphones\.com\.vn|thegioididong\.com|fptshop\.com\.vn|shop\.tiktok\.com|food\.grab\.com)/i

/** The un-namespaced, un-hashed key body (tests + simulator); serperCache.ts hashes the query part. */
export function serperKeyBodyV2(endpoint: string, query: string, area: SerperCacheAreaV2, variant?: string): string {
  return `${variant ? `${endpoint}:${variant}` : endpoint}|${normalizeQueryV2(query)}|${areaKeyV2(area)}`
}
