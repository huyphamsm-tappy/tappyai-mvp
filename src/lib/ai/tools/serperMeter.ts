/**
 * Serper call meter — process-wide counters per endpoint, read by the audit
 * usage sink to attribute paid calls to a turn. Counting only; it never
 * changes whether a call is made. Process-global (not per request): the audit
 * runner sends turns one at a time, and the sink records the delta across a
 * turn, which is exact under that condition and an upper bound otherwise.
 */
export type SerperEndpoint = 'maps' | 'search' | 'shopping' | 'images'

const counts: Record<SerperEndpoint, number> = { maps: 0, search: 0, shopping: 0, images: 0 }

/** Credits per call as billed by Serper (measured: /maps = 3 for 20 rows, the rest 1). */
export const SERPER_CREDITS: Record<SerperEndpoint, number> = { maps: 3, search: 1, shopping: 1, images: 1 }

export function recordSerperCall(endpoint: SerperEndpoint): void {
  counts[endpoint]++
}

export function serperSnapshot(): Record<SerperEndpoint, number> {
  return { ...counts }
}

export function serperDelta(before: Record<SerperEndpoint, number>): { calls: Record<SerperEndpoint, number>; credits: number } {
  const now = serperSnapshot()
  const calls = { maps: now.maps - before.maps, search: now.search - before.search, shopping: now.shopping - before.shopping, images: now.images - before.images }
  const credits = (Object.keys(calls) as SerperEndpoint[]).reduce((n, k) => n + calls[k] * SERPER_CREDITS[k], 0)
  return { calls, credits }
}
