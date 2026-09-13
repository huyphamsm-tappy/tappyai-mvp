// ── OTA search-result titles → a hotel name and a city ───────────────────────
//
// Owner-like UAT R1 (P1-8, P2-8, P2-11): `get_hotel_prices` rows are Serper
// hits on Booking.com / Agoda pages, and their titles are marketing strings in
// whatever locale Google served — "Book Oc Tien Sa Hotel Danang i Da Nang på
// Agoda.com", "Dai Long Hotel | Hoi An 2026 UPDATED DEALS, HD Photos…". Quoting
// that as a search subject finds nothing, and showing it as a hotel name looks
// broken. This module reduces such a title to the hotel's name and, from the
// OTA URL, the city the page is filed under — so a wrong-city page can be
// recognised and a discovery query can be phrased the way a human would.
//
// Pure, conservative and provider-neutral: it strips known OTA decorations and
// returns the remainder; it never invents a name.

const OTA_SUFFIX = [
  /\s*[-|–|]\s*(booking\.com|agoda(\.com)?|traveloka(\.com)?|trip\.com)\s*$/i,
  /\s+(på|on|at|auf|sur|en|bei|i|in)\s+(booking\.com|agoda(\.com)?|traveloka(\.com)?)\s*$/i,
  /\s*\|\s*[^|]*(updated deals|hd photos|reviews|giá|deals|khuyến mãi|đánh giá|cập nhật)[^|]*$/i,
  /\s*[-–(]\s*(cập nhật giá năm \d{4}|updated prices \d{4}|\d{4} updated deals)[^)]*\)?\s*$/i,
  /\s*,\s*(đà nẵng|da nang|hà nội|ha noi|hồ chí minh|ho chi minh|hội an|hoi an|nha trang|đà lạt|da lat|phú quốc|phu quoc|huế|hue|vũng tàu|vung tau)\s*$/i,
]
const OTA_PREFIX = [/^\s*(book|đặt phòng|reserve)\s+/i]
/** "… i Da Nang", "… in Danang", "… tại Đà Nẵng" tails that Agoda/Booking append. */
const LOCALE_TAIL = /\s+(i|in|tại|ở|at)\s+[\p{L}\s.]{3,30}$/iu

export function cleanOtaTitle(title: string | undefined | null): string {
  let t = (title ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  // The " - " rule the entity builder already applied ("Hotel Name - City - Booking.com"):
  // trailing segments that name an OTA or a city are decorations, not the name.
  const dash = t.split(' - ')
  while (dash.length > 1) {
    const last = dash[dash.length - 1]
    if (/booking\.com|agoda|traveloka|trip\.com/i.test(last) || (cityKeyOf(last) && !/hotel|resort|villa|homestay|khách sạn/i.test(last))) dash.pop()
    else break
  }
  t = dash.join(' - ')
  for (let pass = 0; pass < 3; pass++) {
    for (const re of OTA_SUFFIX) t = t.replace(re, '')
    for (const re of OTA_PREFIX) t = t.replace(re, '')
    t = t.replace(LOCALE_TAIL, m => (/hotel|resort|khách sạn|villa|homestay/i.test(m) ? m : '')).trim()
  }
  return t.replace(/[\s,|–-]+$/g, '').trim()
}

/** City slugs the OTAs use in their paths, mapped to a comparable key. */
const CITY_KEYS: ReadonlyArray<[RegExp, string]> = [
  [/da[- ]?nang|đà nẵng|danang/i, 'da-nang'],
  [/hoi[- ]?an|hội an/i, 'hoi-an'],
  [/ha[- ]?noi|hà nội|hanoi/i, 'ha-noi'],
  [/ho[- ]?chi[- ]?minh|hồ chí minh|saigon|sài gòn|tp\.?\s*hcm|hcm/i, 'ho-chi-minh'],
  [/nha[- ]?trang/i, 'nha-trang'],
  [/da[- ]?lat|đà lạt|dalat/i, 'da-lat'],
  [/phu[- ]?quoc|phú quốc/i, 'phu-quoc'],
  [/hue|huế/i, 'hue'],
  [/vung[- ]?tau|vũng tàu/i, 'vung-tau'],
  [/hai[- ]?phong|hải phòng/i, 'hai-phong'],
  [/can[- ]?tho|cần thơ/i, 'can-tho'],
  [/quy[- ]?nhon|quy nhơn/i, 'quy-nhon'],
  [/sa[- ]?pa/i, 'sa-pa'],
  [/ha[- ]?long|hạ long/i, 'ha-long'],
]

export function cityKeyOf(text: string | undefined | null): string | null {
  const t = (text ?? '').normalize('NFC')
  for (const [re, key] of CITY_KEYS) if (re.test(t)) return key
  return null
}

/**
 * The city an OTA page is filed under, from its URL — Agoda `/hotel/da-nang-vn.html`,
 * `/hotel/hoi-an-vn.html`; Booking `/hotel/vn/<slug>.html` carries none (null); Trip.com SEO
 * `/hotels/da-nang-hotel-detail-<id>/`. Null when the URL says nothing — never guessed.
 */
export function otaCityKeyOf(url: string | undefined | null): string | null {
  if (!url) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname
  if (/agoda\./.test(host)) {
    const m = path.match(/\/hotel\/([a-z-]+)-vn\.html/i)
    return m ? cityKeyOf(m[1]) : null
  }
  if (/trip\.com$/.test(host)) {
    const m = path.match(/\/hotels\/([a-z-]+)-hotel-detail-\d+/i)
    return m ? cityKeyOf(m[1]) : null
  }
  return null
}

/**
 * Drop a trailing city token ("Oc Tien Sa Hotel Danang" → "Oc Tien Sa Hotel") so the discovery
 * query quotes the venue name and appends the city itself. Only the LAST word(s) are considered,
 * only when they name a known city, and only when something is left.
 */
export function stripTrailingCity(name: string): string {
  const words = name.trim().split(/\s+/)
  for (const take of [2, 1]) {
    if (words.length <= take) continue
    const tail = words.slice(-take).join(' ')
    if (cityKeyOf(tail) && !/hotel|resort|villa|homestay/i.test(tail)) return words.slice(0, -take).join(' ')
  }
  return name.trim()
}
