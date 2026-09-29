// R13 (P0, Android 29/09): a plan for Đà Nẵng listed "Saigon | Vietnamese Cuisine — 12100 W Center Rd, Omaha,
// NE", "The Nest — Stewart St, Seattle, WA" and a night market in Sơn La. `gl=vn`/`hl=vi` are already sent on
// every Serper call — they bias, they do not restrict. So the place rows are checked by CODE before the model,
// the cards or any plan sees them: a row whose address is outside Việt Nam goes; when the search names a
// Vietnamese city/province, a row whose address names a DIFFERENT one goes. Rows with no address stay (the
// provider did not say where they are, and dropping them would hide real local places).

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

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

export interface GeoGuardOutcome { result: unknown; dropped: Array<{ name: string; reason: 'foreign' | 'other_city' }> }

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
  const dropped: GeoGuardOutcome['dropped'] = []
  const kept = rows.filter(row => {
    const address = String((row as { address?: unknown })?.address ?? '')
    const name = String((row as { name?: unknown })?.name ?? '')
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
