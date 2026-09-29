// Consult V2 travel pick (replay 2026-09-29, TRAVEL-1/3): the pick turn asked "mình cần biết:" instead
// of choosing, because nothing searched before the model. Now the route runs the ONE travel search the
// router's slots describe — flights (origin + destination + date) or hotels (destination + dates) —
// exactly like a place pick. Dates come only from what the user said (dd/mm, next occurrence).

export interface TravelPreCall {
  name: 'get_flight_prices' | 'get_hotel_prices'
  args: Record<string, string>
}

/** "10/10", "15/10/2026" → YYYY-MM-DD, the next occurrence on or after today (GMT+7). */
export function isoFromDayMonth(s: string | undefined, now = new Date()): string | undefined {
  const m = s?.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/)
  if (!m) return undefined
  const d = Number(m[1]), mo = Number(m[2])
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined
  const vn = new Date(now.getTime() + 7 * 3600_000)
  let y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : vn.getUTCFullYear()
  const today = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate())
  if (!m[3] && Date.UTC(y, mo - 1, d) < today) y += 1
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addDays(iso: string, n: number): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** The travel search for a pick, from the router's slots; null when the slots do not name one. */
/**
 * A weekend trip that names a TERRAIN but no place ("cuối tuần … gần Sài Gòn … thích núi") — the destination a
 * consultant would propose, by the city the user leaves from. Replay TRAVEL-2 (29/09): with no destination the hotel
 * search ran for "Núi gần TP.HCM" and Maps answered with hotels on NÚI THÀNH STREET in Tân Bình (inside the city);
 * the reply then said Tân Bình was "30-45 phút" from the city. Names only — no distance or time is claimed here.
 */
const NEARBY_BY_STYLE: Record<string, Record<string, string>> = {
  'TP.HCM': { 'núi': 'Tây Ninh', 'biển': 'Vũng Tàu' },
  'Hà Nội': { 'núi': 'Tam Đảo', 'biển': 'Hạ Long' },
}
export function nearbyDestination(known: Record<string, string>): string | null {
  const days = Number((known.so_ngay ?? '').match(/\d+/)?.[0])
  if (Number.isFinite(days) && days > 3) return null
  return NEARBY_BY_STYLE[known.xuat_phat?.trim() ?? '']?.[known.phong_cach?.trim() ?? ''] ?? null
}

export function travelPreCall(known: Record<string, string>, text: string, now = new Date()): TravelPreCall | null {
  const dest = known.diem_den?.trim() || nearbyDestination(known) || undefined
  const origin = known.xuat_phat?.trim()
  const date = isoFromDayMonth(known.ngay, now)
  // The return / checkout the user named ("10/10 đến 12/10") — only when it comes after the start.
  const backIso = isoFromDayMonth(known.ngay_ve, now)
  const back = date && backIso && backIso > date ? backIso : undefined
  // A ticket request ("vé máy bay …", "bay sáng, 1 chiều") searches fares; a trip that merely travels by air
  // ("đi Đà Nẵng 3 ngày, đi máy bay") searches where to stay — replay TRAVEL-1: the fare call (no fare
  // provider configured) left the pick with nothing to choose.
  const ticketWords = /v[eé] m[aá]y bay|chuy[eế]n bay|bay (?:s[aá]ng|tr[uư]a|chi[eề]u|t[oố]i|đêm|dem)|1 chi[eề]u|m[oộ]t chi[eề]u|kh[uứ] h[oồ]i/i.test(text)
  const flight = ticketWords || (/m[aá]y bay|\bbay\b/i.test(`${known.phuong_tien ?? ''} ${text}`) && !known.so_ngay && !known.phong_cach)
  if (flight && origin && dest) return { name: 'get_flight_prices', args: { origin, destination: dest, ...(date ? { departDate: date } : {}), ...(back ? { returnDate: back } : {}) } }
  if (!dest) return null
  const nights = (() => { const n = Number((known.so_ngay ?? '').match(/\d+/)?.[0]); return Number.isFinite(n) && n > 1 ? n - 1 : 1 })()
  return { name: 'get_hotel_prices', args: { location: dest, ...(date ? { checkIn: date, checkOut: back ?? addDays(date, nights) } : {}) } }
}

const foldName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * A "more" / "reject" pre-search result without the rows an earlier reply already named (by folded
 * name containment either way). Rows are kept as they are when filtering would leave none.
 */
export function withoutShownRows(result: unknown, shown: readonly string[], opts: { allowEmpty?: boolean } = {}): unknown {
  if (!result || typeof result !== 'object' || shown.length === 0) return result
  const keys = shown.map(foldName).filter(k => k.length >= 3)
  const seen = (row: unknown) => {
    const n = foldName(String((row as { name?: unknown; title?: unknown })?.name ?? (row as { title?: unknown })?.title ?? ''))
    return !!n && keys.some(k => n === k || n.includes(k) || k.includes(n))
  }
  const r = { ...(result as Record<string, unknown>) }
  for (const key of ['results', 'hotels', 'hotel_list', 'search_results']) {
    const rows = r[key]
    if (!Array.isArray(rows)) continue
    const kept = rows.filter(row => !seen(row))
    if (kept.length > 0 && kept.length < rows.length) r[key] = kept
    // A "bác" whose search holds ONLY rows already shown: handing them back made the reply re-pick the one just
    // turned down (replay TRAVEL-2 / SHOP-2, level B). The model gets none, and is told so — it asks to narrow.
    else if (kept.length === 0 && rows.length > 0 && opts.allowEmpty) {
      r[key] = []
      r._tappy_all_shown = 'Moi lua chon tim duoc deu DA hien cho user (va co the da bi bac) — KHONG chon lai; noi that va hoi 1-2 cau de thu hep/doi huong.'
    }
  }
  return r
}

/** Stored rows nobody has been shown yet (folded-name containment either way, like withoutShownRows). */
export function unshownRows<T extends { name?: unknown }>(rows: readonly T[], shown: readonly string[]): T[] {
  const keys = shown.map(foldName).filter(k => k.length >= 3)
  return rows.filter(r => {
    const n = foldName(String(r.name ?? ''))
    return !!n && !keys.some(k => n === k || n.includes(k) || k.includes(n))
  })
}

/**
 * A consult plan turn reuses the stored place search but the model reads ONLY the rows the plan is about
 * (the chosen pick, else the venues earlier replies named, at most 2) — "send only the needed candidates".
 */
export function onlyRowsNamed(result: unknown, pick: string | null, shown: readonly string[]): unknown {
  if (!result || typeof result !== 'object') return result
  const r = { ...(result as Record<string, unknown>) }
  const rows = r.results
  if (!Array.isArray(rows)) return result
  const match = (names: readonly string[]) => {
    const keys = names.map(foldName).filter(k => k.length >= 3)
    return rows.filter(row => {
      const n = foldName(String((row as { name?: unknown })?.name ?? ''))
      return !!n && keys.some(k => n === k || n.includes(k) || k.includes(n))
    })
  }
  const byPick = pick ? match([pick]) : []
  r.results = (byPick.length ? byPick : match(shown)).slice(0, 2)
  return r
}

/** Row fields the consult model reads to choose and explain; links, ids and review actions stay on the card. */
const MODEL_ROW_DROP = new Set(['place_id', 'maps_link', 'booking_links', 'website_uri', 'review_actions', 'has_tiktok_review', 'place_types', 'photos', 'thumbnail', 'image', 'images', 'commerce_links', 'cid', 'fid'])

/**
 * The MODEL's copy of a pre-search result on a consult turn (cost §6 "send only the needed candidates"):
 * same rows, same order, minus link/id/media fields the card renders. The stream frames — and therefore
 * the cards and every guard — keep the full result.
 */
export function slimResultForModel(result: unknown, maxRows?: number): unknown {
  if (!result || typeof result !== 'object') return result
  const r = { ...(result as Record<string, unknown>) }
  for (const key of ['results', 'hotels', 'hotel_list']) {
    const rows = r[key]
    if (!Array.isArray(rows)) continue
    // R15: a pre-fetched trip plan reads a few rows per source (28k input tokens with every row).
    r[key] = (maxRows ? rows.slice(0, maxRows) : rows).map(row => row && typeof row === 'object'
      ? Object.fromEntries(Object.entries(row as Record<string, unknown>).filter(([k]) => !MODEL_ROW_DROP.has(k)))
      : row)
  }
  return r
}

const EVENT_WORDS = /\b(concert|live ?show|liveshow|đại nhạc hội|nhạc hội|fan ?meeting|fanmeet|festival|lễ hội âm nhạc|show diễn|show ca nhạc|minishow|mini ?show|nhạc kịch|vở kịch|xem kịch|sự kiện|stand ?up|hài độc thoại)\b/i
const MONTH = /\btháng\s*(\d{1,2})\b|\b(\d{1,2})\s*\/\s*(\d{4})\b/i

/**
 * R11: an event consultation searches EVENTS (web_search → Ticketbox event_links), never venues. The query
 * is built from what the user said: the event word, the artist if named, the month, the city.
 */
export function eventPreCall(threadText: string, known: Record<string, string>): { name: 'web_search'; args: { query: string } } | null {
  const ev = EVENT_WORDS.exec(threadText)
  if (!ev) return null
  const month = MONTH.exec(threadText)
  const artist = known.nghe_si ?? known.ca_si ?? null
  const city = known.khu_vuc ?? known.diem_den ?? null
  const parts = [ev[1].toLowerCase(), artist, month ? `tháng ${month[1] ?? month[2]}` : null, city, 'vé ticketbox']
  return { name: 'web_search', args: { query: parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() } }
}
