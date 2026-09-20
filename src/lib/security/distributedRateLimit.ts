// Controller V2 — Component 10: distributed rate limiting.
//
// Closes audit finding S4 ("Rate limiting does not limit in production"): the
// in-process limiter in ./rateLimit.ts counts per serverless instance, so on
// Vercel with N concurrent lambdas the effective ceiling is N × limit. The
// 20/min cap on role granting was therefore not a real cap.
//
// The authoritative counter lives in the shared store. There is no in-process
// fallback: per the approved contract (docs/controller-v2/10_COMPONENT10_
// RATE_LIMITING_CONTRACT.md §8) a store that cannot answer FAILS CLOSED.
// Silently admitting the request would recreate S4 under a friendlier name.
//
// ./rateLimit.ts is deliberately left in place for the public routes, which are
// outside the C10 contract.

/** The one operation the limiter needs. Abstracted so tests drive a real
 *  limiter against a real shared store instead of mocking the limiter itself. */
export interface RateLimitStore {
  /** Runs the sliding-window script. Returns [admitted, oldestTimestampMs]. */
  evalSlidingWindow(
    key: string,
    nowMs: number,
    windowMs: number,
    limit: number,
    member: string
  ): Promise<[number, number]>
  /**
   * READ-ONLY: how many entries the window currently holds, after expiring stale ones. Never
   * admits or adds — it exists so a quota can be DISPLAYED ("11/15 today") from the same set that
   * enforces it, without the display consuming what it describes. Optional so a store (or a test
   * double) that only limits keeps working; callers treat "unsupported" as "unknown".
   */
  countInWindow?(key: string, nowMs: number, windowMs: number): Promise<number>
}

export interface RateLimitResult {
  ok: boolean
  retryAfter: number
}

// Atomic sliding window. Atomicity matters: a read-then-write implementation
// lets two concurrent requests both observe `limit - 1` and both be admitted.
// Running the whole decision inside the store removes that race, and is what
// makes "a rejected request does not increment the counter" true rather than
// merely intended.
const SLIDING_WINDOW = `local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2])}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, 0}`

/** Same sorted set, no write: expire what has left the window, then count what remains. */
const COUNT_IN_WINDOW = `local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
return redis.call('ZCARD', key)`

/** Upstash REST store. Credentials come from the Vercel Upstash integration. */
export function createUpstashStore(url: string, token: string): RateLimitStore {
  return {
    async countInWindow(key, nowMs, windowMs) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['EVAL', COUNT_IN_WINDOW, '1', key, String(nowMs), String(windowMs)]),
      })
      if (!res.ok) throw new Error(`rate-limit store HTTP ${res.status}`)
      const body = (await res.json()) as { result?: unknown; error?: string }
      if (body.error) throw new Error('rate-limit store error')
      const n = Number(body.result)
      if (!Number.isFinite(n)) throw new Error('rate-limit store malformed response')
      return n
    },
    async evalSlidingWindow(key, nowMs, windowMs, limit, member) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          'EVAL',
          SLIDING_WINDOW,
          '1',
          key,
          String(nowMs),
          String(windowMs),
          String(limit),
          member,
        ]),
      })
      if (!res.ok) throw new Error(`rate-limit store HTTP ${res.status}`)
      const body = (await res.json()) as { result?: unknown; error?: string }
      if (body.error) throw new Error('rate-limit store error')
      const result = body.result
      if (!Array.isArray(result) || result.length < 2) throw new Error('rate-limit store malformed response')
      return [Number(result[0]), Number(result[1])]
    },
  }
}

// ── ENVIRONMENT NAMESPACE (1b-2, 2026-09-20) ─────────────────────────────────────────────────
//
// The Vercel Upstash integration provisions ONE database for All Environments, so Production,
// Preview and a local `next dev` with pulled credentials all talk to the same Redis. Before this,
// every key was bare (`chat:ip:1.2.3.4`, `serper:credits:2026-09-20`): a tester on a preview
// deployment shared the burst bucket with a real user on the same IP, and preview traffic spent
// the PRODUCTION Serper day. Every key that reaches the store is therefore prefixed with the
// deployment environment — `production:`, `preview:`, `development:` — and `local:` when
// VERCEL_ENV is unset (a local run, a test). Applied at the two store boundaries
// (`evalSlidingWindow` / `countInWindow` here, the INCRBY pipeline in kvCounter.ts) so that no
// caller can forget it: `chat:*`, `admin:*`, `ai:q:*`, `serper:credits`, `commerce:untracked`
// are all covered by construction.
export function envKeyPrefix(env: NodeJS.ProcessEnv = process.env): string {
  return `${env.VERCEL_ENV || 'local'}:`
}

/** The key as it is stored: environment prefix + the caller's key. */
export function namespacedKey(key: string, env: NodeJS.ProcessEnv = process.env): string {
  return envKeyPrefix(env) + key
}

let counter = 0

/** Unique per request, so no two entries in the sorted set can collide. */
function uniqueMember(nowMs: number): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${process.pid ?? 0}`
  return `${nowMs}-${counter}-${rand}`
}

let store: RateLimitStore | null = null
let resolved = false

/** The Vercel Upstash integration provisions KV_REST_API_*. The older
 *  UPSTASH_REDIS_REST_* names are accepted too so either provisioning path
 *  works without editing this file. */
function resolveStore(): RateLimitStore | null {
  if (resolved) return store
  resolved = true
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  store = url && token ? createUpstashStore(url, token) : null
  return store
}

/**
 * Is a shared store CONFIGURED for this deployment?
 *
 * P1-5 needs to tell two failures apart that `distributedRateLimit` deliberately collapses:
 *
 *   NOT CONFIGURED     no credentials in the environment. A permanent, deployment-wide state.
 *   CONFIGURED, DOWN   credentials present, the store did not answer. Transient.
 *
 * For an admin route the collapse is right — both mean "refuse", per the C10 contract. For a
 * PUBLIC endpoint they are opposite: refusing everyone forever because a deployment never had
 * credentials would turn a hardening change into an outage, while refusing during a store outage
 * is the correct, temporary conservative answer. See publicRateLimit.ts.
 *
 * Reads the environment directly rather than calling `resolveStore()`, because that memoises a
 * CLIENT and this question is about configuration. Same two pairs, same precedence, no I/O.
 */
export function isDistributedStoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  return !!url && !!token
}

/** Test seam. Injecting a store lets the real limiter run against a real
 *  shared store; it does not replace the limiter's own logic. */
export function __setRateLimitStore(next: RateLimitStore | null): void {
  store = next
  resolved = true
}

/** Test seam: forget the resolved store so env-based resolution runs again. */
export function __resetRateLimitStore(): void {
  store = null
  resolved = false
}

/**
 * Distributed sliding-window rate limit.
 *
 * Fail-closed: if the shared store is missing, unreachable, times out, or
 * answers with anything unexpected, the request is REJECTED. A store outage
 * therefore blocks admin operations. That is the accepted trade-off — the
 * alternative silently removes the cap, which is the defect S4 describes.
 *
 * Never logs the key: keys carry an admin user_id.
 */
export async function distributedRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const failClosed: RateLimitResult = { ok: false, retryAfter: Math.max(1, Math.ceil(windowMs / 1000)) }
  const active = resolveStore()
  if (!active) return failClosed

  const now = Date.now()
  try {
    // The member must be unique per request. Sorted-set members are a SET: two
    // requests in the same millisecond sharing a member would collapse into one
    // entry and the counter would silently under-count.
    const [admitted, oldest] = await active.evalSlidingWindow(namespacedKey(key), now, windowMs, limit, uniqueMember(now))
    if (admitted === 1) return { ok: true, retryAfter: 0 }
    const elapsed = Number.isFinite(oldest) && oldest > 0 ? now - oldest : 0
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)) }
  } catch {
    return failClosed
  }
}

/**
 * READ-ONLY count of entries in a key's window — for displaying a quota, never for enforcing one.
 *
 * `null` when there is no store, the store does not support counting, or it did not answer. A
 * display that cannot be produced is reported as unknown rather than guessed: the caller decides
 * whether to show nothing or to show the limit as used (the fail-closed display choice).
 */
export async function distributedCountInWindow(key: string, windowMs: number): Promise<number | null> {
  const active = resolveStore()
  if (!active?.countInWindow) return null
  try {
    return await active.countInWindow(namespacedKey(key), Date.now(), windowMs)
  } catch {
    return null
  }
}
