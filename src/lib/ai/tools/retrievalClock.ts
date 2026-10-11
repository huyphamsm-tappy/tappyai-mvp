// ── WHEN WAS THIS DATA FETCHED? (Phase 8 freshness contract) ───────────────────────────────────────────────────────────────
//
// A tool result can be built from a live provider call, an in-process (L1) cache hit or a shared (L2) cache hit that is hours old. Until
// now nothing said which, so a cached price could be presented as current. The provider layers (serperSearch / serperShopping /
// serperPlaces) call `noteRetrieval(at)` with the time THEIR rows were really fetched (live = now, L1/L2 hit = the stored time, a legacy
// L2 row with no stored time = unknown); a tool wraps its body in `withRetrievedAt` and the result carries the OLDEST of those times as
// `retrieved_at`. An existing `retrieved_at` (a cached tool result built earlier) is never overwritten.

import { AsyncLocalStorage } from 'node:async_hooks'

interface Clock { oldest: number | null; unknown: boolean; seen: number }
const clocks = new AsyncLocalStorage<Clock>()

/** Records the real fetch time of rows used by the running tool. `undefined`/`null`/invalid = the time is not known. No clock → no-op. */
export function noteRetrieval(at: number | string | null | undefined): void {
  const c = clocks.getStore()
  if (!c) return
  const ms = typeof at === 'number' ? at : typeof at === 'string' ? Date.parse(at) : NaN
  c.seen++
  if (!Number.isFinite(ms)) { c.unknown = true; return }
  c.oldest = c.oldest === null ? ms : Math.min(c.oldest, ms)
}

export interface Retrieval { retrievedAt: string | null; unknown: boolean; sources: number }

/** Runs `fn` with its own clock; returns its value and the oldest retrieval time noted inside it. */
export async function withRetrievalClock<T>(fn: () => Promise<T>): Promise<{ value: T } & Retrieval> {
  const c: Clock = { oldest: null, unknown: false, seen: 0 }
  const value = await clocks.run(c, fn)
  return { value, retrievedAt: c.oldest === null ? null : new Date(c.oldest).toISOString(), unknown: c.unknown, sources: c.seen }
}

/**
 * Runs a tool body and stamps `retrieved_at` on its object result. Rules: never overwrites an existing stamp (a cached tool result keeps
 * its original time); an unknown time (a legacy shared-cache row) leaves the result UNSTAMPED, which the freshness layer reads as
 * "unknown"; non-object results (errors, arrays, null) are returned untouched.
 */
export async function withRetrievedAt<T>(fn: () => Promise<T>): Promise<T> {
  const r = await withRetrievalClock(fn)
  const v = r.value as unknown
  if (v && typeof v === 'object' && !Array.isArray(v) && !('retrieved_at' in (v as Record<string, unknown>)) && r.retrievedAt && !r.unknown) {
    ;(v as Record<string, unknown>).retrieved_at = r.retrievedAt
  }
  return r.value
}
