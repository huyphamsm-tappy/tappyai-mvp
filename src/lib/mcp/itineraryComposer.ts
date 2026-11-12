// Itinerary candidates for the ASYNC job (connector doc §12.1: "multi-query retrieval and dossier assembly", R13 §25.7: no internal Writer by default). Deterministic: it queries the SAME fixed services the
// search tools use (attractions, restaurants, and hotels only when a hotel adapter exists), every query through the MCP External Spend Pool, maps rows to DTO fields, and lays the distinct results out
// over the days. No model call, no prose, no filler: with few results it returns few items. The Host LLM writes the final itinerary text.
import { dispatchPaid } from './dispatch'
import { ROW_MAPPER, mapPlaceRow, type ServiceAdapters } from './serviceMap'
import type { SpendPool } from './spendPool'
import type { JobRecord } from './jobs'

export interface Candidate { name: string; url?: string }
export interface ItineraryItem { title: string; kind: 'attraction' | 'restaurant' | 'hotel'; url?: string }
export interface ItineraryResultDto { days: Array<{ day: number; items: ItineraryItem[] }> }

/** PLACEHOLDER upper bound of one paid query of the job (same order as a search tool call). */
const QUERY_ESTIMATE_USD = 0.01
const QUERY_DEADLINE_MS = 20_000

const distinct = (xs: readonly Candidate[]): Candidate[] => { const seen = new Set<string>(); return xs.filter(c => { const k = c.name.trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true }) }
const item = (c: Candidate, kind: ItineraryItem['kind']): ItineraryItem => ({ title: c.name, kind, ...(c.url ? { url: c.url } : {}) })

/** Lays distinct candidates over `days`: per day an attraction, a restaurant, an attraction; the first hotel on day 1. Pure. */
export function assembleItinerary(days: number, c: { attractions: readonly Candidate[]; restaurants: readonly Candidate[]; hotels: readonly Candidate[] }): ItineraryResultDto {
  const att = distinct(c.attractions); const res = distinct(c.restaurants); const hot = distinct(c.hotels)
  const out: ItineraryResultDto = { days: [] }
  let a = 0; let r = 0
  for (let d = 1; d <= days; d++) {
    const items: ItineraryItem[] = []
    if (d === 1 && hot[0]) items.push(item(hot[0], 'hotel'))
    if (att[a]) items.push(item(att[a++], 'attraction'))
    if (res[r]) items.push(item(res[r++], 'restaurant'))
    if (att[a]) items.push(item(att[a++], 'attraction'))
    out.days.push({ day: d, items })
  }
  return out
}

export type ComposeOutcome =
  | { ok: true; result: ItineraryResultDto }
  | { ok: false; code: 'unwired' | 'budget_exceeded' | 'provider_unavailable' | 'cancelled'; retryable: boolean }

export interface ComposeDeps { adapters: ServiceAdapters; pool: SpendPool; /** false once the job was cancelled, expired or taken over */ isLive: () => Promise<boolean>; deadlineMs?: number }

export async function composeItinerary(job: JobRecord, deps: ComposeDeps): Promise<ComposeOutcome> {
  const places = deps.adapters['places.search']
  if (!places) return { ok: false, code: 'unwired', retryable: false }
  const input = job.input
  const destination = String(input.destination ?? '')
  const days = typeof input.days === 'number' ? input.days : 1
  const lang: 'vi' | 'en' = input.preferred_language === 'en' ? 'en' : 'vi'
  const interests = Array.isArray(input.interests) ? input.interests.filter((x): x is string => typeof x === 'string').join(' ') : ''
  const claims = { host: job.host, installId: job.installId, principalId: job.ownerPrincipalId }

  const plan = [
    { key: 'attractions' as const, adapter: places, placeType: 'attraction', query: `${interests || 'top attractions'} ${destination}`.trim(), map: mapPlaceRow },
    { key: 'restaurants' as const, adapter: places, placeType: 'restaurant', query: `restaurants ${destination}`, map: mapPlaceRow },
    ...(deps.adapters['hotels.prices'] ? [{ key: 'hotels' as const, adapter: deps.adapters['hotels.prices'], placeType: undefined, query: `hotels ${destination}`, map: ROW_MAPPER['hotels.prices'] }] : []),
  ]
  const found: Record<'attractions' | 'restaurants' | 'hotels', Candidate[]> = { attractions: [], restaurants: [], hotels: [] }
  for (const step of plan) {
    if (!(await deps.isLive())) return { ok: false, code: 'cancelled', retryable: false }
    const r = await dispatchPaid({
      pool: deps.pool, claims, tool: 'create_itinerary', estimateUsd: QUERY_ESTIMATE_USD, requestId: `${job.jobId}:${step.key}`, adapter: step.adapter,
      call: { query: step.query, location: destination, lang, limit: 10, placeType: step.placeType }, deadlineMs: deps.deadlineMs ?? QUERY_DEADLINE_MS,
    })
    if (r.kind === 'refused') return { ok: false, code: 'budget_exceeded', retryable: r.reason === 'store_unavailable' }
    if (r.kind !== 'ok') return { ok: false, code: r.kind === 'cancelled_before' ? 'cancelled' : 'provider_unavailable', retryable: r.kind !== 'cancelled_before' }
    found[step.key] = r.output.rows.map(row => step.map(row)).filter((x): x is Record<string, unknown> => x !== null)
      .map(x => ({ name: String(x.name ?? x.title), ...(typeof x.url === 'string' ? { url: x.url } : {}) }))
  }
  return { ok: true, result: assembleItinerary(days, found) }
}
