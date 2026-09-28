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
export function travelPreCall(known: Record<string, string>, text: string, now = new Date()): TravelPreCall | null {
  const dest = known.diem_den?.trim()
  const origin = known.xuat_phat?.trim()
  const date = isoFromDayMonth(known.ngay, now)
  const flight = /v[eé] m[aá]y bay|chuy[eế]n bay|\bbay\b/i.test(`${known.phuong_tien ?? ''} ${text}`)
  if (flight && origin && dest) return { name: 'get_flight_prices', args: { origin, destination: dest, ...(date ? { departDate: date } : {}) } }
  if (!dest) return null
  const nights = (() => { const n = Number((known.so_ngay ?? '').match(/\d+/)?.[0]); return Number.isFinite(n) && n > 1 ? n - 1 : 1 })()
  return { name: 'get_hotel_prices', args: { location: dest, ...(date ? { checkIn: date, checkOut: addDays(date, nights) } : {}) } }
}

const foldName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * A "more" / "reject" pre-search result without the rows an earlier reply already named (by folded
 * name containment either way). Rows are kept as they are when filtering would leave none.
 */
export function withoutShownRows(result: unknown, shown: readonly string[]): unknown {
  if (!result || typeof result !== 'object' || shown.length === 0) return result
  const keys = shown.map(foldName).filter(k => k.length >= 3)
  const seen = (row: unknown) => {
    const n = foldName(String((row as { name?: unknown; title?: unknown })?.name ?? (row as { title?: unknown })?.title ?? ''))
    return !!n && keys.some(k => n === k || n.includes(k) || k.includes(n))
  }
  const r = { ...(result as Record<string, unknown>) }
  for (const key of ['results', 'hotels', 'search_results']) {
    const rows = r[key]
    if (!Array.isArray(rows)) continue
    const kept = rows.filter(row => !seen(row))
    if (kept.length > 0 && kept.length < rows.length) r[key] = kept
  }
  return r
}
