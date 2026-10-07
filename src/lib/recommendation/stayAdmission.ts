import { normalizeVN } from '@/lib/ai/intent'
import { cityInText, type VietnamCity } from '@/lib/ai/tools/vietnamCities'
import { isSpecificOtaHotelPage } from '@/lib/ai/tools/travel'
import { isDirectEntityUrl } from '@/lib/links/directUrl'

// ── A WEB SEARCH RESULT IS NOT A HOTEL ───────────────────────────────────────
//
// 🚨 MEASURED on localhost 2026-09-10, query "khách sạn Đà Nẵng giá rẻ". The card
// rendered EIGHT stay entities. They were:
//
//   #1 Book Oc Tien Sa Hotel Danang i Da Nang på Agoda.com   ← a page title, in Swedish
//   #2 Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD …      ← HỘI AN, not Đà Nẵng
//   #3 Dai Long Hotel, Đà Nẵng (cập nhật giá năm 2026)
//   #4 Khách sạn Đại Long, Hải Châu, Đà Nẵng
//   #5 Khách sạn Ốc Tiên Sa, Hải Châu, Đà Nẵng
//   #6 Oc Tien Sa Hotel Danang Da Nang Vietnam
//   #7 Oc Tien Sa Hotel Danang, Da Nang
//   #8 10 khách sạn tốt nhất tại Đà Nẵng năm 2026            ← AN ARTICLE
//
// Eight cards, TWO actual hotels, one listicle and one wrong city. `search_results`
// is a raw Serper web search — `{title, link, snippet}` — and `stayRecommendations`
// fed it straight to `buildStayEntity`, where the page TITLE became the entity's
// name. No validation stood between a search engine's HTML `<title>` and a card
// claiming to be a place.
//
// 🔑 THIS IS THE RULE FOOD ALREADY ENFORCES, APPLIED WHERE IT WAS MISSING.
// `food.ts` states it plainly for price snippets: they are "NEVER a source of new
// place names". The stay path is the one place that never got the rule. Nothing
// here is a new idea — it reuses `isSpecificOtaHotelPage` (the existing
// direct-page predicate) and `cityInText` (the existing city resolver) rather
// than inventing a second definition of either.

/**
 * An aggregate: a listicle, a ranking, a category page, a city guide.
 *
 * These titles are the clearest signal a result is ABOUT hotels rather than
 * BEING one. Precision-favouring — a real hotel named "Top Hotel" survives,
 * because the patterns need a count, a superlative or a collective noun in the
 * positions an article title uses.
 */
export function isAggregateTitle(title: string): boolean {
  const t = normalizeVN(String(title ?? '').toLowerCase()).trim()
  if (!t) return true
  // "10 khách sạn …", "top 10 …", "15 resort …" — a leading count is the giveaway.
  if (/^(top\s*)?\d{1,3}\s+(khach san|resort|homestay|hotel|nha nghi|villa|noi|dia diem|chos?)\b/.test(t)) return true
  if (/^top\s+\d/.test(t)) return true
  // Collective/superlative framing anywhere in the title.
  if (/\b(danh sach|tong hop|review top|xep hang|goi y|kinh nghiem|cam nang|huong dan)\b/.test(t)) return true
  if (/\b(tot nhat|dep nhat|re nhat|noi tieng nhat|dang o nhat|best|cheapest|top rated)\b/.test(t)) return true
  // "các khách sạn …", "những resort …" — plural determiners.
  if (/^(cac|nhung|moi)\s+(khach san|resort|homestay|hotel)\b/.test(t)) return true
  return false
}

/**
 * The hotel's name, recovered from an OTA page title.
 *
 * OTA titles are decorated: a "Book "/"Đặt phòng " verb, a `|` or `-` separated
 * city and brand tail, a "(updated prices 2026)" parenthetical, and — because
 * Google serves whatever locale it feels like — occasionally a Scandinavian
 * preposition. Everything after the first hard separator is chrome.
 */
export function stayNameFromTitle(title: string): string {
  let s = String(title ?? '').trim()
  if (!s) return ''
  // Leading booking verb, in the locales these titles actually arrive in.
  s = s.replace(/^(book|boka|đặt phòng|dat phong|reserve|booking)\s+/i, '')
  // Everything from the first hard separator onward is site chrome.
  s = s.split(/\s*[|·—]\s*/)[0]
  s = s.split(/\s+-\s+/)[0]
  // A trailing parenthetical is always a price/date decoration, never the name.
  s = s.replace(/\s*[（(][^）)]*[）)]\s*$/, '')
  // "… i Da Nang på Agoda.com" / "… in Da Nang on Booking.com"
  s = s.replace(/\s+(i|in|på|pa|on|tai|tại|o|ở)\s+[^,]*\b(agoda|booking|traveloka|expedia)\b.*$/i, '')
  s = s.replace(/\s*,?\s*(agoda|booking|traveloka|expedia)(\.com)?\s*$/i, '')
  return s.trim().replace(/\s{2,}/g, ' ')
}

/**
 * The DISTINCTIVE tokens of a hotel name — the identity, with the chrome removed.
 *
 * 🚨 EXACT-STRING DEDUPE DOES NOT WORK HERE, measured. The same hotel arrives as
 * "Oc Tien Sa Hotel", "Oc Tien Sa Hotel Danang" and "Khách sạn Ốc Tiên Sa, Hải
 * Châu, Đà Nẵng" — three strings, three different keys, three cards. What varies
 * is always the SAME kind of noise: the category noun, the city, the district,
 * and the country. What stays constant is the distinctive part.
 */
export function stayIdentityTokens(name: string): string[] {
  return normalizeVN(String(name ?? '').toLowerCase())
    .replace(/\b(khach san|hotel|resort|homestay|nha nghi|villa|motel|guesthouse|guest house|noi o|cho o|luu tru|accommodation|lodging)\b/g, ' ')
    // Administrative chrome: a district or a country never distinguishes two hotels.
    .replace(/\b(quan|huyen|phuong|xa|thanh pho|tinh|tp|district|ward|city|province|viet nam|vietnam)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
}

/**
 * Two names for one hotel?
 *
 * SUBSET, not equality — "oc sa tien" is contained in "danang oc sa tien", and
 * the difference is a city name nobody chose as part of the identity. Guarded at
 * two tokens: a single-token name is too weak to absorb another by containment
 * ("Muong Thanh" would swallow every "Muong Thanh <city>" that is a genuinely
 * different property in a chain, and one-token names collide by accident).
 */
export function sameStay(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < 2) return short.length === long.length && short[0] === long[0]
  return short.every(t => long.includes(t))
}

/**
 * A name that is only a CATEGORY is not an identity.
 *
 * OSM carries rows tagged `tourism=hotel` whose entire name is "Nơi ở"
 * ("accommodation"). The provider's category is respected — this is not a
 * second opinion about whether the row is lodging — but a card headed by a
 * common noun names nothing the user can go to. Dropped for PROVENANCE: there
 * is no entity identity here to attribute anything to.
 */
export function isCategoryOnlyName(name: string): boolean {
  return stayIdentityTokens(name).length === 0
}

/** Hosts whose deep city/region pages look like entity pages to a generic test. */
function isOtaHost(link: string): boolean {
  try {
    const h = new URL(link).hostname.replace(/^www\./, '')
    return h.includes('booking.com') || h.includes('agoda.com') || h.includes('traveloka.com')
  } catch { return false }
}

export interface StayCandidate {
  title?: string
  name?: string
  link?: string
  lat?: number
  lng?: number
  address?: string
}

/**
 * May this row become a stay ENTITY?
 *
 * Two provenance classes, deliberately judged differently:
 *
 *   · A row with COORDINATES came from the OSM hotel list — structured provider
 *     data with a real name. Admitted on the same terms any OSM place row is.
 *   · A row with only `{title, link}` came from a web search. It must prove it
 *     is one specific hotel: a direct OTA page (not a search/region/city page),
 *     a title that is not an aggregate, and — when the caller resolved one — a
 *     title that does not name a DIFFERENT city.
 *
 * The city test is asymmetric in the same way `belongsToDestination` is: a title
 * that resolves to no known city is KEPT. "I cannot tell" must never become
 * "wrong", or the guard empties legitimate result sets.
 */
export function admitsStay(row: StayCandidate, destination?: VietnamCity | null): boolean {
  const hasCoords = typeof row.lat === 'number' && typeof row.lng === 'number'
  const rawName = row.name || row.title || ''
  if (!String(rawName).trim()) return false

  if (hasCoords) return true

  if (isAggregateTitle(rawName)) return false

  /**
   * 🔑 TWO PREDICATES, EACH ANSWERING WHAT IT IS GOOD AT — and neither rewritten.
   *
   * `isDirectEntityUrl` is host-agnostic and rejects front doors and search
   * pages anywhere. That is the general rule, and it is the one that matters for
   * a hotel's OWN website or an OTA we have never heard of. Requiring an OTA
   * host instead would have been a second, weaker provenance rule that drifts
   * the moment a vendor is missing — the exact mistake `directUrl.ts` documents.
   *
   * `isSpecificOtaHotelPage` then adds what only it knows: Booking and Agoda
   * publish deep, path-rich CITY and REGION pages that sail past the generic
   * test. On those hosts, and only there, the stricter rule applies.
   */
  if (!row.link || !isDirectEntityUrl(row.link)) return false
  if (isOtaHost(row.link) && !isSpecificOtaHotelPage(row.link)) return false

  if (destination) {
    const titleCity = cityInText(String(rawName))
    if (titleCity && titleCity.query !== destination.query) return false
  }
  return true
}

/**
 * Admit, name and DEDUPE a stay result set.
 *
 * Dedupe is by hotel identity, not by URL: the measured failure showed the same
 * hotel four times because four different OTA URLs pointed at it. `dedupe()` in
 * actions.ts collapses duplicate DESTINATIONS; nothing collapsed duplicate
 * SUBJECTS.
 *
 * OSM rows are offered first so a structured row wins the identity over a search
 * snippet describing the same hotel — the snippet's decorated title then loses,
 * which is the outcome we want.
 */
export function admitStays<T extends StayCandidate>(
  rows: readonly T[],
  destination?: VietnamCity | null,
): Array<T & { name: string }> {
  const claimed: string[][] = []
  const out: Array<T & { name: string }> = []
  for (const row of rows) {
    if (!admitsStay(row, destination)) continue
    const name = (row.name || stayNameFromTitle(row.title || '')).trim()
    if (!name || isCategoryOnlyName(name)) continue
    const tokens = stayIdentityTokens(name)
    const at = claimed.findIndex(c => sameStay(c, tokens))
    if (at !== -1) {
      /**
       * 🚨 A DUPLICATE IS A SECOND DESCRIPTION, NOT A SECOND HOTEL — AND IT
       * CARRIES FIELDS THE WINNER DOES NOT.
       *
       * Measured while building this: collapsing the duplicates dropped every
       * stay photo. The OSM row wins the identity (structured name, real
       * address) but has no image; the Serper snippet it absorbed had one. So
       * deduping by dropping lost information that the pipeline had already
       * paid to retrieve — the exact defect this whole task exists to stop.
       *
       * Merge is FILL-ONLY: an absent field on the winner is filled from the
       * loser, and a field the winner already has is never overwritten. The
       * structured row therefore keeps authority over everything it states,
       * and the weaker source contributes only where there was nothing.
       */
      const winner = out[at] as unknown as Record<string, unknown>
      for (const [k, v] of Object.entries(row)) {
        if (k === 'name' || k === 'title') continue
        const cur = winner[k]
        const absent = cur === undefined || cur === null || cur === ''
          || (Array.isArray(cur) && cur.length === 0)
        if (absent && v !== undefined && v !== null && v !== '') {
          winner[k] = v
        }
      }
      continue
    }
    claimed.push(tokens)
    out.push({ ...row, name })
  }
  return out
}
