// ── A SHARED DAILY COUNTER (A2, 2026-09-20) ──────────────────────────────────────────────────
//
// The spend ceilings (Serper credits per day) need ONE number every instance adds to, not one
// per lambda. Same store and the same credential pair as `distributedRateLimit` (Upstash REST,
// `KV_REST_API_*` / `UPSTASH_REDIS_REST_*`), same reasoning as `publicRateLimit`:
//
//   store NOT configured    → an in-process counter. 🚨 NOT PRODUCTION SAFE: it counts per
//                             instance, so N warm lambdas see N separate ceilings. It exists so a
//                             deployment without credentials keeps working and so the ceiling is
//                             at least a per-instance one — never nothing. `scope: 'instance'`
//                             says so in every result and the alert logs carry it.
//   store configured, DOWN  → the in-process counter answers AND the result says `store_down`,
//                             so the caller can log an ERROR: an outage must not silently turn a
//                             global ceiling into a per-instance one.
//
// The key carries the VN calendar day, so a ceiling resets at 00:00 Vietnam like every other
// daily allowance in the product; the TTL only expires yesterday's key.

import { vnToday } from '@/lib/config/product'
import { isDistributedStoreConfigured } from './distributedRateLimit'

export interface CounterResult {
  /** The value AFTER this increment. */
  count: number
  scope: 'distributed' | 'instance' | 'store_down'
}

const local = new Map<string, { date: string; count: number }>()

function incrLocal(key: string, by: number): number {
  const today = vnToday()
  const e = local.get(key)
  if (!e || e.date !== today) {
    local.set(key, { date: today, count: by })
    if (local.size > 1000) for (const [k, v] of local) if (v.date !== today) local.delete(k)
    return by
  }
  e.count += by
  return e.count
}

/** Test seam. */
export function __resetKvCounters(): void { local.clear() }

const DAY_SECONDS = 36 * 60 * 60 // a day's key lives a day and a half, then goes

/**
 * Adds `by` to today's counter for `key` and returns the new total. `by` may be 0 to READ.
 * Never throws.
 */
export async function incrDailyCounter(key: string, by: number, env: NodeJS.ProcessEnv = process.env): Promise<CounterResult> {
  const dayKey = `${key}:${vnToday()}`
  if (!isDistributedStoreConfigured(env)) {
    return { count: incrLocal(dayKey, by), scope: 'instance' }
  }
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCRBY', dayKey, String(by)], ['EXPIRE', dayKey, String(DAY_SECONDS), 'NX']]),
    })
    if (!res.ok) throw new Error(`counter store HTTP ${res.status}`)
    const body = (await res.json()) as Array<{ result?: unknown; error?: string }>
    const first = Array.isArray(body) ? body[0] : undefined
    if (!first || first.error) throw new Error('counter store error')
    const n = Number(first.result)
    if (!Number.isFinite(n)) throw new Error('counter store malformed response')
    // Keep the local shadow in step so a later outage answers from a number that is not zero.
    incrLocal(dayKey, by)
    return { count: n, scope: 'distributed' }
  } catch {
    return { count: incrLocal(dayKey, by), scope: 'store_down' }
  }
}
