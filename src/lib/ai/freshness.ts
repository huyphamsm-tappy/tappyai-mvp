// ── FRESHNESS BY KIND OF DATA (Phase 8) ────────────────────────────────────────────────────────────────────────────────────
//
// One TTL for every source is wrong in both directions: a gold price is stale after minutes, a phone's published spec is good for
// weeks. A tool result now carries `retrieved_at` (retrievalClock.ts — the oldest REAL fetch time of the rows behind it, through every
// cache layer). This file turns that time into a status per kind of data, so the model and the No-Fabrication Gate know whether a
// number may be said as "now". Pure; no model, no network.
//
//   market        rates / gold / FX / crypto                          15 min
//   price         shop, room, fare, ticket prices                      6 h
//   availability  in stock / rooms / seats (same source as price)      6 h
//   news          headlines                                            6 h
//   place         place listing: hours, rating, address, price band    3 days
//   spec          published product specifications                     30 days
//   general       anything else                                        24 h
//
// STATUS: fresh (age ≤ max) · stale (older) · unknown (no usable `retrieved_at` — a legacy shared-cache row, a source that cannot say).
// Unknown is treated like stale for volatile data (market / price / availability / news): "no timestamp" is not "now".

import { extractMoneyClaims } from './moneyGuard'

export type DataClass = 'market' | 'price' | 'availability' | 'news' | 'place' | 'spec' | 'general'
export type FreshnessStatus = 'fresh' | 'stale' | 'unknown'

export const MAX_AGE_MINUTES: Readonly<Record<DataClass, number>> = {
  market: 15, price: 360, availability: 360, news: 360, place: 3 * 24 * 60, spec: 30 * 24 * 60, general: 24 * 60,
}
export const VOLATILE: ReadonlySet<DataClass> = new Set<DataClass>(['market', 'price', 'availability', 'news'])

export interface Freshness {
  data_class: DataClass
  status: FreshnessStatus
  retrieved_at?: string
  age_minutes?: number
  max_age_minutes: number
}

/** The kind of data a tool returns (by TOOL IDENTITY and its declared `kind`, never by reading the user's words); null = not tracked. */
export function dataClassOf(tool: string, args: Record<string, unknown> = {}): DataClass | null {
  switch (tool) {
    case 'search_products': case 'get_hotel_prices': case 'get_flight_prices': case 'get_transport_options': return 'price'
    case 'get_gold_price': return 'market'
    case 'get_news': return 'news'
    case 'search_places': return 'place'
    case 'web_search': {
      const k = typeof args.kind === 'string' ? args.kind.toLowerCase() : ''
      return k === 'price' ? 'price' : k === 'spec' ? 'spec' : k === 'news' ? 'news' : 'general'
    }
    default: return null
  }
}

export function freshnessOf(cls: DataClass, retrievedAt: unknown, now: Date): Freshness {
  const max = MAX_AGE_MINUTES[cls]
  const ms = typeof retrievedAt === 'string' ? Date.parse(retrievedAt) : NaN
  if (!Number.isFinite(ms)) return { data_class: cls, status: 'unknown', max_age_minutes: max }
  const age = Math.max(0, Math.round((now.getTime() - ms) / 60_000))
  return { data_class: cls, status: age <= max ? 'fresh' : 'stale', retrieved_at: new Date(ms).toISOString(), age_minutes: age, max_age_minutes: max }
}

const NOT_EVIDENCE = new Set(['TIMEOUT', 'ERROR', 'UNAVAILABLE', 'EMPTY'])

/**
 * Adds `freshness` to an object tool result of a tracked tool. Results that are not evidence (timeout / error / unavailable / empty),
 * non-objects and untracked tools are returned untouched. An existing `freshness` is never replaced.
 */
export function withFreshness(result: unknown, tool: string, args: Record<string, unknown>, state: string, now: Date): unknown {
  const cls = dataClassOf(tool, args)
  if (!cls || NOT_EVIDENCE.has(state) || !result || typeof result !== 'object' || Array.isArray(result)) return result
  const r = result as Record<string, unknown>
  if ('freshness' in r) return result
  return { ...r, freshness: freshnessOf(cls, r.retrieved_at, now) }
}

/** Human time for a notice: "13:45 09/10" in Vietnam time. */
export function vnClock(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600_000)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`
}

// ── prices behind a tool result, split by how fresh their source was ───────────────────────────────────────────────────────

const PRICE_KEY = /^(?:price|price_vnd|priceText|min_price|max_price|price_min|price_max|from_price|gia)$/i

/** VND amounts a tool result states: numeric price-keyed fields (≥ 1.000) and money written in its strings. Bounded (400 nodes). */
export function pricesIn(result: unknown): number[] {
  const out: number[] = []
  let budget = 400
  const walk = (v: unknown, key: string, depth: number) => {
    if (budget-- <= 0 || depth > 7) return
    if (typeof v === 'number') { if (PRICE_KEY.test(key) && Number.isFinite(v) && v >= 1000) out.push(v); return }
    if (typeof v === 'string') {
      if (v.length > 600) return
      for (const c of extractMoneyClaims(v)) { out.push(c.lo); if (c.hi !== c.lo) out.push(c.hi) }
      return
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, key, depth + 1); return }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) { if (k !== 'freshness' && k !== 'retrieved_at') walk(x, k, depth + 1) }
  }
  walk(result, '', 0)
  return [...new Set(out)]
}

/**
 * The prices of ONE `a:` frame, as evidence for the No-Fabrication Gate: `aged` when the frame's own `freshness` says the rows are
 * stale / of unknown time for a VOLATILE kind of data; `fresh` when it says they are fresh; nothing for other kinds of data.
 */
export function classifyFramePrices(frameJson: string): { aged: Array<{ amount: number; at: string | null }>; fresh: number[] } {
  const none = { aged: [], fresh: [] as number[] }
  let result: unknown
  try { result = (JSON.parse(frameJson) as { result?: unknown }).result } catch { return none }
  const fr = (result as { freshness?: Partial<Freshness> } | null)?.freshness
  if (!fr || !fr.data_class || !VOLATILE.has(fr.data_class)) return none
  const prices = pricesIn(result)
  if (fr.status === 'fresh') return { aged: [], fresh: prices }
  return { aged: prices.map(amount => ({ amount, at: typeof fr.retrieved_at === 'string' ? fr.retrieved_at : null })), fresh: [] }
}
