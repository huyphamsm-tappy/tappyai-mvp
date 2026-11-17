// The shared state of a research run's facts (15/11, after the chip report was traced: the newest figures WERE found - SIA Q3, TSMC Q3, McKinsey's 2.3 trillion - but nothing decided that a newer
// figure replaces an older one, the analyst saw 90 of 430 cards ranked without regard to date, a percentage that contradicted its own two numbers went through, and the forecast model read a different
// set of findings than the analyst). Pure and deterministic: no model, no search, no network. Three small pieces, each reading only what a card already carries:
//   whenOf()         - a date text ("2026-09", "2026-09-18", "2026") as milliseconds, or null;
//   resolveVintages()- among cards that state the SAME fact (subject, measure, unit, scope, period) with different values, the one stated LATER by a source that is at least as authoritative replaces
//                      the older ones; a missing date never decides (the conflict stays a conflict);
//   ratioMismatch()  - a share written next to two quantities that cannot make it ("20 million chips ... 0.2%" of "1.05 trillion chips" is 0.0019%): the code computes it, never the model.

/** A date text as UTC milliseconds: "2026", "2026-09", "2026-09-18" (a longer ISO text is read by its first ten characters). null for anything else. Pure. */
export function whenOf(text: string | undefined | null): number | null {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(text ?? '').trim())
  if (!m) return null
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) : 1, d = m[3] ? Number(m[3]) : 1
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return Date.UTC(y, mo - 1, d)
}

export const SUPERSEDE_MIN_DAYS = 14
const DAY = 86_400_000

export interface VintageItem { id: string; key: string; value: number; when: number | null; rank: number }

/**
 * For each fact key, the cards whose value is replaced by a newer statement of it. `rank` is the source's authority (3, 2, 1). A card is replaced only when the newest dated card of its key has a
 * DIFFERENT value (further apart than `gap`), is at least SUPERSEDE_MIN_DAYS newer, and comes from a source whose authority is not lower. Returns id → the id of the card that replaces it. Pure.
 */
export function resolveVintages(items: readonly VintageItem[], gap: number): Map<string, string> {
  const out = new Map<string, string>()
  const byKey = new Map<string, VintageItem[]>()
  for (const it of items) byKey.set(it.key, [...(byKey.get(it.key) ?? []), it])
  for (const group of byKey.values()) {
    const dated = group.filter(g => g.when !== null).sort((a, b) => (b.when as number) - (a.when as number) || b.rank - a.rank)
    const newest = dated[0]
    if (!newest) continue
    for (const o of dated.slice(1)) {
      const apart = Math.abs(newest.value - o.value) > Math.abs(Math.max(newest.value, o.value)) * gap
      if (apart && (newest.when as number) - (o.when as number) >= SUPERSEDE_MIN_DAYS * DAY && newest.rank >= o.rank) out.set(o.id, newest.id)
    }
  }
  return out
}

// ── ratio check ───────────────────────────────────────────────────────────────────────────────────────────────────────

const SCALE: Array<[RegExp, number]> = [[/^nghin ty$/, 1e12], [/^ty$/, 1e9], [/^trieu$/, 1e6], [/^nghin$/, 1e3], [/^trillion$/, 1e12], [/^billion$/, 1e9], [/^million$/, 1e6], [/^thousand$/, 1e3]]
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const GROWTH = /(tang|giam|so voi|cung ky|yoy|cao hon|thap hon|diem phan tram|bien |growth|increase|decrease|higher|lower|from )/

/** A number as written in Vietnamese or English: "1,05" and "1.05" are decimals, "1.655" and "1,655" are thousands when exactly three digits follow the only separator. */
export function readNumber(raw: string): number | null {
  const r = raw.replace(/[ \xa0]/g, '')
  const lastDot = r.lastIndexOf('.'), lastComma = r.lastIndexOf(',')
  let s: string
  if (lastDot >= 0 && lastComma >= 0) s = lastDot > lastComma ? r.replace(/,/g, '') : r.replace(/\./g, '').replace(',', '.')
  else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = r.split(sep)
    s = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0') ? parts.join('') : parts.join('.')
  } else s = r
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export interface RatioNote { claimedPercent: number; computedPercent: number; part: number; whole: number; note: string }

const fmt = (n: number) => (n >= 10 ? String(Math.round(n)) : n >= 1 ? String(Math.round(n * 100) / 100) : String(Number(n.toPrecision(2))))
const big = (n: number) => (n >= 1e12 ? `${fmt(n / 1e12)} trillion` : n >= 1e9 ? `${fmt(n / 1e9)} billion` : n >= 1e6 ? `${fmt(n / 1e6)} million` : fmt(n))

/**
 * A percentage written right after a quantity (with no word of growth or comparison between them) while an EARLIER quantity in the same text has the same unit word and is larger: the share is
 * part / whole x 100. When the written share is more than ten times away from the computed one, the text contradicts itself. null when nothing clear is found (it never guesses). Pure.
 */
export function ratioMismatch(text: string): RatioNote | null {
  const s = fold(text)
  const qs: Array<{ at: number; end: number; value: number; unit: string }> = []
  for (const m of s.matchAll(/(\d[\d.,]*\d|\d)\s*(nghin ty|ty|trieu|nghin|trillion|billion|million|thousand)\s+([a-z]+)/g)) {
    const n = readNumber(m[1]), mult = SCALE.find(([re]) => re.test(m[2]))?.[1]
    if (n === null || !mult) continue
    qs.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, value: n * mult, unit: m[3] })
  }
  if (qs.length < 2) return null
  for (const p of s.matchAll(/(\d[\d.,]*\d|\d)\s*%/g)) {
    const pv = readNumber(p[1]); const at = p.index ?? 0
    if (pv === null || pv <= 0) continue
    const part = [...qs].reverse().find(q => q.end <= at && at - q.end <= 40 && !GROWTH.test(s.slice(q.end, at)) && !GROWTH.test(s.slice(Math.max(0, at - 12), at)))
    if (!part) continue
    const whole = qs.filter(q => q.at < part.at && q.unit === part.unit && q.value > part.value).sort((a, b) => b.at - a.at)[0]
    if (!whole) continue
    const computed = (part.value / whole.value) * 100
    if (computed <= 0) continue
    if (pv / computed > 10 || computed / pv > 10) {
      return { claimedPercent: pv, computedPercent: computed, part: part.value, whole: whole.value, note: `ARITHMETIC CHECK: the text says ${p[1]}% but ${big(part.value)} of ${big(whole.value)} is ${fmt(computed)}%; do not use the stated percentage` }
    }
  }
  return null
}
