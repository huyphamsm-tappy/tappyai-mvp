import { vnToday } from '@/lib/config/product'
import { dailyRateLimit, rateLimit } from './rateLimit'
import { distributedRateLimit, isDistributedStoreConfigured } from './distributedRateLimit'

// ── P1-5: rate limiting for PUBLIC, unauthenticated LLM endpoints ────────────
//
// THE PROBLEM. `/api/translate`, `/api/scan` and `/api/viet-content` call a model without
// requiring an account, and their only cap was `rateLimit`/`dailyRateLimit` — in-process counters.
// That file says so plainly: "Scoped per serverless instance (not a global guarantee)". On Vercel
// with N warm lambdas the real ceiling is N × limit, and N is whatever the platform decides. The
// cap was a suggestion.
//
// WHY NOT JUST CALL `distributedRateLimit`. It is FAIL-CLOSED by the C10 contract: with no store
// configured it refuses every request. That is correct for admin routes — rare, privileged, and a
// missing cap there is worse than a missing feature. On a public endpoint the same rule turns a
// hardening change into a total outage for a deployment that never had credentials (a preview
// build, a fork, a local run), and it does so silently.
//
// THE RULE (owner decision D2). Distinguish the two states the admin path deliberately collapses:
//
//   store NOT configured   → fall back to the in-process limiter.
//                            Exactly today's behaviour: never worse than what shipped.
//   store configured, but
//   it did not answer      → FAIL CLOSED.
//                            Credentials exist, so this is an outage, not a deployment shape.
//                            Refusing briefly is the conservative answer; silently removing the
//                            cap during an incident is how a cost-abuse window opens.
//
// Verified before adopting this: `KV_REST_API_URL` and `KV_REST_API_TOKEN` are both present in
// Production (checked by NAME via `vercel env ls`, never by value), and they are the pair
// `resolveStore()` reads first. So production takes the distributed path; the fallback exists for
// the deployments that do not.
//
// NOT changed: `distributedRateLimit` itself, and every admin caller of it. This module wraps; it
// does not soften.

/** Rolling window for a per-day cap. See `publicDailyRateLimit` for why the key carries the date. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export interface PublicRateLimitResult {
  ok: boolean
  /** Seconds to wait. 0 when admitted. */
  retryAfter: number
  /** Which limiter answered. Diagnostics only — never branch on it. */
  scope: 'distributed' | 'instance'
}

/**
 * A burst cap: `limit` requests per `windowMs`, per key.
 *
 * @param key  MUST already identify the caller (`route:ip`). This function does not build keys —
 *             a limiter that invents its own key space is one rename away from merging two routes
 *             into one bucket.
 */
export async function publicRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<PublicRateLimitResult> {
  if (!isDistributedStoreConfigured()) {
    const local = rateLimit(key, limit, windowMs)
    return { ok: local.ok, retryAfter: local.retryAfter, scope: 'instance' }
  }
  // Fail-closed on a store failure is inherited from distributedRateLimit, deliberately.
  const shared = await distributedRateLimit(key, limit, windowMs)
  return { ok: shared.ok, retryAfter: shared.retryAfter, scope: 'distributed' }
}

/**
 * A per-calendar-day cap, in Vietnam time.
 *
 * WHY THE KEY CARRIES THE DATE. The shared limiter only knows sliding windows, and a rolling 24h
 * cap is NOT what these routes promise: the copy says "try again tomorrow", and the existing
 * `dailyRateLimit` resets at VN midnight. Scoping the key to the VN date keeps that promise — at
 * midnight the key changes, so the count starts from zero — while the 24h window is only there to
 * expire the day's entries after that day can no longer be current.
 *
 * @param key  MUST identify the caller (`route:ip`); the date is appended here.
 */
export async function publicDailyRateLimit(
  key: string,
  limit: number,
): Promise<PublicRateLimitResult> {
  if (!isDistributedStoreConfigured()) {
    const local = dailyRateLimit(key, limit)
    // The in-process daily limiter reports no retry hint, and the routes render a "tomorrow"
    // sentence rather than a countdown. Reported as 0 rather than invented.
    return { ok: local.ok, retryAfter: 0, scope: 'instance' }
  }
  const shared = await distributedRateLimit(`${key}:${vnToday()}`, limit, ONE_DAY_MS)
  return { ok: shared.ok, retryAfter: shared.retryAfter, scope: 'distributed' }
}
