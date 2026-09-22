/**
 * PRICE BAND — the provider's own price range for a venue, as data.
 *
 * Serper /maps publishes it as text (`price_range_text`: "100-200 N ₫", "Trên 1 Tr ₫",
 * "1-100.000 ₫"); Google Places as a structured `price_range` ({low, high, currency}).
 * Until G2 nothing parsed it: the card showed the string, the model copied it into
 * prose, and the snippet-price guard — whose only evidence was `price_search_results`
 * snippets — deleted the sentence as an invented price. Measured on the 2026-09-17
 * V3 capture: 13 of the 17 price sentences the guard removed quoted this very band.
 *
 * Standalone on purpose (owner, G2 Q3): the guard reads it as entity-level evidence
 * now, and the ranker's step B ("giá vào ranker") reuses the same parse later.
 * Provenance is unchanged — `buildEntity` already carries the text as a
 * `structured_provider` claim; this only makes it comparable.
 */

export interface PriceBand {
  /** Lower bound in VND. 0 when the band is open below. */
  lo: number
  /** Upper bound in VND. `Infinity` when the band is open above. */
  hi: number
  /** Which side, if any, the provider left open. */
  open: 'above' | 'below' | null
  currency: 'VND'
  /** The provider text (or structured range) the band came from, verbatim. */
  source: string
}

const SCALE: Record<string, number> = { n: 1e3, k: 1e3, nghìn: 1e3, ngàn: 1e3, tr: 1e6, m: 1e6, triệu: 1e6 }

/** "100" → 100, "100.000" → 100000, "1,5" → 1.5 (a scale unit follows). */
function amount(raw: string, scaled: boolean): number {
  const seps = raw.match(/[.,]/g) ?? []
  if (seps.length >= 2) return Number(raw.replace(/[.,]/g, ''))
  if (seps.length === 1) {
    const frac = raw.split(/[.,]/)[1]
    if (frac.length === 3 && !scaled) return Number(raw.replace(/[.,]/g, ''))
    return Number(raw.replace(',', '.'))
  }
  return Number(raw)
}

const UNIT = '(N|K|Tr|M|nghìn|ngàn|triệu)?'
const NUM = '(\\d+(?:[.,]\\d+)*)'
const RANGE_RE = new RegExp(`^\\s*${NUM}\\s*[-–]\\s*${NUM}\\s*${UNIT}\\s*₫\\s*$`, 'iu')
const ABOVE_RE = new RegExp(`^\\s*(?:Trên|Tren|Over|Above|>)\\s*${NUM}\\s*${UNIT}\\s*₫\\s*$`, 'iu')
const BELOW_RE = new RegExp(`^\\s*(?:Dưới|Duoi|Under|Below|<)\\s*${NUM}\\s*${UNIT}\\s*₫\\s*$`, 'iu')

/**
 * Parse a provider band. Unknown shapes return `null` — no evidence, which is
 * exactly what the guard had before (fail-closed), never a guess.
 *
 * 🚨 "1-100.000 ₫" IS "UP TO 100.000", NOT "FROM 1 ₫". The leading 1 is Google's
 * placeholder for an open lower bound (`serperPlaces.ts` refused to parse the
 * text into {low, high} for this reason). A band whose low end is 1 is open below.
 */
export function parsePriceBand(text: string | null | undefined): PriceBand | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const source = text.trim()
  let m = RANGE_RE.exec(source)
  if (m) {
    const scale = SCALE[(m[3] ?? '').toLowerCase()] ?? 1
    const lo = amount(m[1], scale > 1) * scale
    const hi = amount(m[2], scale > 1) * scale
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= 0 || lo > hi) return null
    if (lo <= 1) return { lo: 0, hi, open: 'below', currency: 'VND', source }
    return { lo, hi, open: null, currency: 'VND', source }
  }
  m = ABOVE_RE.exec(source)
  if (m) {
    const scale = SCALE[(m[2] ?? '').toLowerCase()] ?? 1
    const lo = amount(m[1], scale > 1) * scale
    if (!Number.isFinite(lo) || lo <= 0) return null
    return { lo, hi: Infinity, open: 'above', currency: 'VND', source }
  }
  m = BELOW_RE.exec(source)
  if (m) {
    const scale = SCALE[(m[2] ?? '').toLowerCase()] ?? 1
    const hi = amount(m[1], scale > 1) * scale
    if (!Number.isFinite(hi) || hi <= 0) return null
    return { lo: 0, hi, open: 'below', currency: 'VND', source }
  }
  return null
}

/** Google Places' structured range ({low, high, currency}) as the same band. */
export function bandFromStructuredRange(pr: { low?: number; high?: number; currency?: string } | null | undefined): PriceBand | null {
  if (!pr || pr.currency !== 'VND') return null
  const lo = typeof pr.low === 'number' && pr.low > 1 ? pr.low : 0
  const hi = typeof pr.high === 'number' && pr.high > 0 ? pr.high : Infinity
  if (lo === 0 && hi === Infinity) return null
  const source = `${pr.low ?? ''}-${pr.high ?? ''} ${pr.currency}`
  return { lo, hi, open: lo === 0 ? 'below' : hi === Infinity ? 'above' : null, currency: 'VND', source }
}

/** The band a tool row carries, from either provider shape. */
export function bandFromRow(row: Record<string, unknown>): PriceBand | null {
  const structured = bandFromStructuredRange(row.price_range as { low?: number; high?: number; currency?: string } | undefined)
  if (structured) return structured
  return parsePriceBand(row.price_range_text as string | undefined)
}

/**
 * A stated amount or range is supported by a band only when it lies FULLY inside
 * it (owner rule: partial overlap = unsupported, no tolerance margin). Open sides
 * are unbounded.
 */
export function amountWithinBand(lo: number, hi: number, band: PriceBand): boolean {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return false
  return lo >= band.lo && hi <= band.hi
}

/** "100.000" / "1,5 triệu" — the way a Vietnamese reader writes an amount. */
function vnd(n: number, locale: 'vi' | 'en'): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const s = Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, '')
    return locale === 'vi' ? `${s.replace('.', ',')} triệu` : `${s}M`
  }
  return n.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')
}

/**
 * The provider band as a reader understands it (Phase 7 small item, 2026-09-22). Google's
 * "1-100.000 ₫" is an open lower bound, not "from one đồng": shown as "dưới 100.000 ₫"; "Trên 1
 * Tr ₫" as "trên 1 triệu ₫"; a closed band as "100.000–200.000 ₫". A shape the parser does not
 * know is shown verbatim — never hidden, never guessed.
 */
export function formatPriceBandText(text: string | null | undefined, locale: string): string | null {
  if (typeof text !== 'string' || !text.trim()) return null
  const band = parsePriceBand(text)
  if (!band) return text
  const loc: 'vi' | 'en' = locale === 'vi' ? 'vi' : 'en'
  if (band.open === 'below') return loc === 'vi' ? `dưới ${vnd(band.hi, loc)} ₫` : `under ${vnd(band.hi, loc)} ₫`
  if (band.open === 'above') return loc === 'vi' ? `trên ${vnd(band.lo, loc)} ₫` : `over ${vnd(band.lo, loc)} ₫`
  return `${vnd(band.lo, loc)}–${vnd(band.hi, loc)} ₫`
}
