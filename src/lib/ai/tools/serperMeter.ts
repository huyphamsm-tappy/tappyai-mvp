/**
 * Serper call meter — process-wide counters per endpoint, read by the audit
 * usage sink to attribute paid calls to a turn. Counting only; it never
 * changes whether a call is made. Process-global (not per request): the audit
 * runner sends turns one at a time, and the sink records the delta across a
 * turn, which is exact under that condition and an upper bound otherwise.
 *
 * `hits` (2026-09-29) counts requests answered by the SHARED Serper cache
 * (serperCache.ts) instead of a paid call — i.e. calls avoided. L1 (in-memory)
 * hits are not counted; they existed before and are not new savings.
 */
export type SerperEndpoint = 'maps' | 'search' | 'shopping' | 'images'

export type SerperSnapshot = Record<SerperEndpoint, number> & { hits: Record<SerperEndpoint, number> }

const counts: Record<SerperEndpoint, number> = { maps: 0, search: 0, shopping: 0, images: 0 }
const hits: Record<SerperEndpoint, number> = { maps: 0, search: 0, shopping: 0, images: 0 }

/** Credits per call as billed by Serper (measured: /maps = 3 for 20 rows, the rest 1). */
export const SERPER_CREDITS: Record<SerperEndpoint, number> = { maps: 3, search: 1, shopping: 1, images: 1 }

export function recordSerperCall(endpoint: SerperEndpoint): void {
  counts[endpoint]++
}

/** One request served from the shared cache — no Serper call, no credits. */
export function recordSerperCacheHit(endpoint: SerperEndpoint): void {
  hits[endpoint]++
}

export function serperSnapshot(): SerperSnapshot {
  return { ...counts, hits: { ...hits } }
}

const ENDPOINTS: SerperEndpoint[] = ['maps', 'search', 'shopping', 'images']

/**
 * Calls/credits since `before`, plus shared-cache `hits` and the credits they saved.
 * `before` may be an older snapshot without `hits` (treated as zero).
 */
export function serperDelta(before: Record<SerperEndpoint, number> & { hits?: Record<SerperEndpoint, number> }): {
  calls: Record<SerperEndpoint, number>
  credits: number
  hits: Record<SerperEndpoint, number>
  creditsSaved: number
} {
  const now = serperSnapshot()
  const calls = { maps: now.maps - before.maps, search: now.search - before.search, shopping: now.shopping - before.shopping, images: now.images - before.images }
  const credits = ENDPOINTS.reduce((n, k) => n + calls[k] * SERPER_CREDITS[k], 0)
  const b = before.hits
  const hitDelta = { maps: now.hits.maps - (b?.maps ?? 0), search: now.hits.search - (b?.search ?? 0), shopping: now.hits.shopping - (b?.shopping ?? 0), images: now.hits.images - (b?.images ?? 0) }
  const creditsSaved = ENDPOINTS.reduce((n, k) => n + hitDelta[k] * SERPER_CREDITS[k], 0)
  return { calls, credits, hits: hitDelta, creditsSaved }
}
