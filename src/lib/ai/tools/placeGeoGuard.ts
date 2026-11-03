// R13 (P0, Android 29/09): a plan for Đà Nẵng listed "Saigon | Vietnamese Cuisine — 12100 W Center Rd, Omaha,
// NE", "The Nest — Stewart St, Seattle, WA" and a night market in Sơn La. `gl=vn`/`hl=vi` are already sent on
// every Serper call — they bias, they do not restrict. So the place rows are checked by CODE before the model,
// the cards or any plan sees them: a row whose address is outside Việt Nam goes; when the search names a
// Vietnamese city/province, a row whose address names a DIFFERENT one goes. Rows with no address stay (the
// provider did not say where they are, and dropping them would hide real local places).

import { CITY_MATCH_RADIUS_KM, haversineKm, VIETNAM_CITY_ENTRIES, type VietnamCity } from './vietnamCities'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

// 29/10 (localhost, "Hội An 2 ngày 1 đêm"): the place cards showed Cầu Vàng (Bà Nà), Ngũ Hành Sơn and Núi Thần Tài. Since the 2025
// merger Maps writes Hội An as "…, Hội An, Đà Nẵng", and a search area of "Hội An, Đà Nẵng" resolves (rightmost) to the province Đà
// Nẵng — every row in Đà Nẵng then passes, ~35 km away included. A province no longer tells a destination inside it apart.
// So when the area names a DESTINATION of the measured city table (vietnamCities.ts: Hội An, Nha Trang, Đà Lạt, Phú Quốc, Sa Pa…),
// a row with coordinates must lie within CITY_MATCH_RADIUS_KM of it — the repository's own "same place" distance. The destination is
// the place named FIRST (a Vietnamese address runs small → large). The centrally-run cities are provinces in their own right, wider
// than that radius (Ba Vì is Hà Nội), and keep the province rule alone.
const PROVINCE_LEVEL = new Set(['ha noi', 'ho chi minh', 'da nang', 'hai phong', 'can tho', 'hue'])
/** A table city one of whose aliases IS a centrally-run city (by the PLACES table below). Read at call time. */
const isProvinceLevel = (city: VietnamCity): boolean =>
  VIETNAM_CITY_ENTRIES.some(([alias, c]) => c === city && PROVINCE_LEVEL.has(provinceOf(alias) ?? ''))

/** The table destination the area names first, with its coordinates; null when it names none, or only a centrally-run city. Pure. */
export function destinationOf(area: string | null | undefined): VietnamCity | null {
  const t = fold(area ?? '')
  if (!t) return null
  let best: { city: VietnamCity; at: number } | null = null
  for (const [alias, city] of VIETNAM_CITY_ENTRIES) {
    const m = new RegExp(`(^|[^a-z0-9])${alias.replace(/ /g, '\\s+')}([^a-z0-9]|$)`).exec(t)
    if (m && (best === null || m.index < best.at)) best = { city, at: m.index }
  }
  return best && !isProvinceLevel(best.city) ? best.city : null
}

/** The 63 provinces / centrally-run cities, folded, plus the common short forms users and Maps write. */
const PLACES: Array<[string, RegExp]> = [
  ['ho chi minh', /\b(?:ho chi minh|hcm|tp\.? ?hcm|sai gon|saigon)\b/],
  ['ha noi', /\bha ?noi\b|\bhanoi\b/],
  ['da nang', /\bda ?nang\b|\bdanang\b/],
  ['hai phong', /\bhai phong\b/], ['can tho', /\bcan tho\b/], ['hue', /\bhue\b|thua thien/],
  ['khanh hoa', /\bkhanh hoa\b|\bnha trang\b|\bcam ranh\b/], ['lam dong', /\blam dong\b|\bda lat\b|\bdalat\b/],
  ['ba ria vung tau', /\bvung tau\b|\bba ria\b/], ['kien giang', /\bkien giang\b|\bphu quoc\b|\brach gia\b/],
  ['quang nam', /\bquang nam\b|\bhoi an\b|\btam ky\b/], ['quang ninh', /\bquang ninh\b|\bha long\b|\bhalong\b/],
  ['lao cai', /\blao cai\b|\bsa ?pa\b/], ['binh dinh', /\bbinh dinh\b|\bquy nhon\b/], ['binh thuan', /\bbinh thuan\b|\bphan thiet\b|\bmui ne\b/],
  ['son la', /\bson la\b|\bmoc chau\b/], ['ninh binh', /\bninh binh\b/], ['quang binh', /\bquang binh\b|\bdong hoi\b/],
  ['phu yen', /\bphu yen\b|\btuy hoa\b/], ['dong nai', /\bdong nai\b|\bbien hoa\b/], ['binh duong', /\bbinh duong\b|\bthu dau mot\b/],
  ['ha giang', /\bha giang\b/], ['cao bang', /\bcao bang\b/], ['lang son', /\blang son\b/], ['thai nguyen', /\bthai nguyen\b/],
  ['nghe an', /\bnghe an\b|\btp\.? vinh\b/], ['thanh hoa', /\bthanh hoa\b|\bsam son\b/], ['ha tinh', /\bha tinh\b/],
  ['quang ngai', /\bquang ngai\b/], ['gia lai', /\bgia lai\b|\bpleiku\b/], ['dak lak', /\bdak lak\b|\bdaklak\b|\bbuon ma thuot\b/],
  ['an giang', /\ban giang\b|\blong xuyen\b|\bchau doc\b/], ['ca mau', /\bca mau\b/], ['ben tre', /\bben tre\b/], ['tien giang', /\btien giang\b|\bmy tho\b/],
  ['vinh long', /\bvinh long\b/], ['soc trang', /\bsoc trang\b/], ['bac lieu', /\bbac lieu\b/], ['tay ninh', /\btay ninh\b/],
  ['long an', /\blong an\b/], ['dong thap', /\bdong thap\b|\bsa dec\b/], ['hau giang', /\bhau giang\b/], ['tra vinh', /\btra vinh\b/],
  ['bac ninh', /\bbac ninh\b/], ['hai duong', /\bhai duong\b/], ['hung yen', /\bhung yen\b/], ['nam dinh', /\bnam dinh\b/],
  ['thai binh', /\bthai binh\b/], ['ha nam', /\bha nam\b/], ['vinh phuc', /\bvinh phuc\b|\btam dao\b/], ['phu tho', /\bphu tho\b|\bviet tri\b/],
  ['yen bai', /\byen bai\b/], ['tuyen quang', /\btuyen quang\b/], ['bac giang', /\bbac giang\b/], ['bac kan', /\bbac kan\b/],
  ['dien bien', /\bdien bien\b/], ['lai chau', /\blai chau\b/], ['hoa binh', /\bhoa binh\b/], ['kon tum', /\bkon tum\b/],
  ['dak nong', /\bdak nong\b/], ['ninh thuan', /\bninh thuan\b|\bphan rang\b/], ['binh phuoc', /\bbinh phuoc\b/], ['quang tri', /\bquang tri\b|\bdong ha\b/],
]

/** A foreign address: US "City, ST 12345", or a country name that is not Việt Nam. */
const FOREIGN = /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b|\b(?:USA|United States|U\.S\.A?\.|Canada|Australia|United Kingdom|England|France|Germany|Japan|Korea|China|Thailand|Cambodia|Laos|Singapore|Malaysia|Indonesia|Philippines|Taiwan|Hong Kong)\b/

// 🚨 Streets are named after provinces: "155 Nguyễn Thái Bình, Quận 1, TP.HCM", "123 Nguyễn Huệ" (→ Huế),
// "Hai Bà Trưng". The street segment (before the first comma) is never read, and an area's province is its
// RIGHTMOST place name ("…Nguyễn Thái Bình, Quận 1, TP.HCM" → TP.HCM).
const withoutStreet = (text: string) => {
  const parts = text.split(',')
  return parts.length > 1 ? parts.slice(1).join(',') : text
}

/** Which province/city a text names, folded key, or null. The RIGHTMOST match wins. */
export function provinceOf(text: string | null | undefined): string | null {
  if (!text) return null
  const t = fold(withoutStreet(text))
  let best: { key: string; at: number } | null = null
  for (const [key, re] of PLACES) {
    const g = new RegExp(re.source, 'g')
    for (let m = g.exec(t); m; m = g.exec(t)) if (best === null || m.index > best.at) best = { key, at: m.index }
  }
  return best?.key ?? null
}

/** Every province/city an address names outside its street segment. */
function provincesIn(address: string): Set<string> {
  const t = fold(withoutStreet(address))
  return new Set(PLACES.filter(([, re]) => re.test(t)).map(([k]) => k))
}

/** How far from the centre of a search abroad a row may be (a whole island or city region; a namesake on another continent is thousands of km away). */
const ABROAD_RADIUS_KM = 80

export interface GeoGuardOutcome { result: unknown; dropped: Array<{ name: string; reason: 'foreign' | 'other_city' | 'too_far' }> }

/** A row's own coordinates (`lat` / `lng`, as serperPlaceToRow writes them), or null. */
function coordsOf(row: unknown): [number, number] | null {
  const r = row as { lat?: unknown; lng?: unknown }
  return typeof r?.lat === 'number' && typeof r?.lng === 'number' && Number.isFinite(r.lat) && Number.isFinite(r.lng) ? [r.lat, r.lng] : null
}

/**
 * Drops place rows outside Việt Nam, and — when `area` names a Vietnamese city/province — rows whose address
 * names only OTHER provinces. Returns the result object with `results` filtered (same shape) and a note.
 */
export function guardPlaceGeography(result: unknown, area: string | null | undefined): GeoGuardOutcome {
  const none = { result, dropped: [] }
  if (!result || typeof result !== 'object') return none
  const r = result as Record<string, unknown>
  const rows = r.results
  if (!Array.isArray(rows) || rows.length === 0) return none
  const want = provinceOf(area)
  const destination = destinationOf(area)
  const dropped: GeoGuardOutcome['dropped'] = []
  // 01/11: a search centred on a place ABROAD (food.ts `centre_abroad`: the place's own coordinates) is about that place, so the rows that count are
  // the ones near it; the "outside Việt Nam" drop below is for a search about Việt Nam.
  const ca = r.centre_abroad as { lat?: unknown; lng?: unknown } | null | undefined
  const abroad: [number, number] | null = typeof ca?.lat === 'number' && typeof ca?.lng === 'number' ? [ca.lat, ca.lng] : null
  const kept = rows.filter(row => {
    if (abroad) {
      const at = coordsOf(row)
      if (at && haversineKm(abroad, at) > ABROAD_RADIUS_KM) { dropped.push({ name: String((row as { name?: unknown })?.name ?? ''), reason: 'too_far' }); return false }
      return true
    }
    const address = String((row as { address?: unknown })?.address ?? '')
    const name = String((row as { name?: unknown })?.name ?? '')
    // A destination inside a province: the row's own coordinates decide, both ways (29/10, see destinationOf) — the address's province
    // name says nothing reliable since the merger ("Hội An" was Quảng Nam; its rows now read "Đà Nẵng"). No coordinates: the address rules.
    const at = destination ? coordsOf(row) : null
    if (destination && at) {
      if (haversineKm(destination.coords, at) <= CITY_MATCH_RADIUS_KM) return true
      dropped.push({ name, reason: 'too_far' })
      return false
    }
    if (!address.trim()) return true
    if (FOREIGN.test(address) && !/vi[eệ]t ?nam/i.test(address)) { dropped.push({ name, reason: 'foreign' }); return false }
    if (want) {
      const named = provincesIn(address)
      if (named.size > 0 && !named.has(want)) { dropped.push({ name, reason: 'other_city' }); return false }
    }
    return true
  })
  if (dropped.length === 0) return none
  return {
    result: {
      ...r,
      results: kept,
      count: kept.length,
      _tappy_geo_note: `Da loai ${dropped.length} ket qua nam ngoai ${want ? `khu vuc "${area}"` : 'Viet Nam'} — KHONG nhac toi chung.`,
    },
    dropped,
  }
}

// A district-only area ("quận 1") names no province: the user's GPS says which city it is (replay 29/09:
// FOOD-1 "quận 1" picked "Izakaya Taka Hue … tại Huế"). Centres of the cities users search most, 40 km.
const CITY_CENTRES: Array<[string, number, number]> = [
  ['ho chi minh', 10.776, 106.700], ['ha noi', 21.028, 105.834], ['da nang', 16.054, 108.202], ['hue', 16.464, 107.586],
  ['khanh hoa', 12.238, 109.197], ['lam dong', 11.940, 108.458], ['can tho', 10.045, 105.746], ['hai phong', 20.845, 106.688],
  ['ba ria vung tau', 10.346, 107.084], ['kien giang', 10.289, 103.984], ['quang nam', 15.880, 108.335], ['binh dinh', 13.782, 109.219],
  ['quang ninh', 20.951, 107.080], ['binh duong', 10.980, 106.652], ['dong nai', 10.945, 106.824],
]

export function provinceNear(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  let best: { key: string; km: number } | null = null
  for (const [key, la, ln] of CITY_CENTRES) {
    const dLat = (la - lat) * 111, dLng = (ln - lng) * 111 * Math.cos((lat * Math.PI) / 180)
    const km = Math.sqrt(dLat * dLat + dLng * dLng)
    if (km <= 40 && (!best || km < best.km)) best = { key, km }
  }
  return best?.key ?? null
}

/** The province to hold rows to: the one the area names, else the one the user is in (district-only areas). */
export function geoGuardArea(area: string | null | undefined, gps: { lat: number; lng: number } | null | undefined): string | null {
  if (provinceOf(area)) return area ?? null
  const near = provinceNear(gps?.lat, gps?.lng)
  return near ? `${area ? `${area}, ` : ''}${near}` : (area ?? null)
}
