import { normalizeIpAddress } from './addressPolicy'
import { vnToday } from '@/lib/config/product'

// Lightweight in-memory sliding-window rate limiter.
// Scoped per serverless instance (not a global guarantee across all lambdas),
// but zero-dependency and effective at blocking single-source floods. Back it
// with Redis/Upstash later if a hard multi-instance limit is needed.
const hits = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs)
  if (arr.length >= limit) {
    hits.set(key, arr)
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000))
    return { ok: false, retryAfter }
  }
  arr.push(now)
  hits.set(key, arr)
  // Opportunistic cleanup to bound memory growth.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every(t => now - t >= windowMs)) hits.delete(k)
    }
  }
  return { ok: true, retryAfter: 0 }
}

// Per-VN-day counter for "N per day" limits. One implementation for every
// daily-capped route (reviews/scan/translate/…) — previously each route hand-
// rolled its own Map-based limiter. Keyed on the VN calendar day so resets
// match the product copy ("thử lại vào ngày mai", quotas reset 00:00 VN).
// Same per-instance caveat as rateLimit() above.
const daily = new Map<string, { date: string; count: number }>()

export function dailyRateLimit(key: string, limit: number): { ok: boolean } {
  const today = vnToday()
  const e = daily.get(key)
  if (!e || e.date !== today) {
    daily.set(key, { date: today, count: 1 })
    // Opportunistic cleanup: drop stale-day entries to bound memory growth.
    if (daily.size > 5000) {
      for (const [k, v] of daily) {
        if (v.date !== today) daily.delete(k)
      }
    }
    return { ok: true }
  }
  if (e.count >= limit) return { ok: false }
  e.count++
  return { ok: true }
}

// ── P3-F1: request identity is derived, never accepted ───────────────────────
//
// This value is the key for twelve public rate limiters and the `ip_address`
// column of `audit_log`. It used to be the LEFTMOST entry of `x-forwarded-for`.
//
// WHY THAT WAS WRONG HERE, SPECIFICALLY
// The deployment is Vercel (`vercel.json`, `.vercelignore`). A request reaches
// the function through Vercel's proxy, and the proxy APPENDS to an
// `x-forwarded-for` the caller already sent. The leftmost entry is therefore the
// one hop nobody verified — the caller's own text — so:
//
//   1. every IP-keyed quota became a function of a string the attacker chooses.
//      `curl -H 'x-forwarded-for: <random>'` landed in a fresh bucket each time,
//      which uncapped anonymous session minting, /api/chat, /api/scan,
//      /api/translate, /api/viet-content, reviews, scam-shield and the rest;
//   2. the IP recorded against an audited AI write was attacker-chosen; and
//   3. `audit_log.ip_address` is INET, so a value that is not an address made the
//      INSERT fail. `writeAuditLogAwaited` logs and returns false rather than
//      throwing, so one malformed header DELETED the attacker's own audit row and
//      left a gap in the hash chain. A spoofing bug was also an evasion bug.
//
// THE ORDER BELOW IS THE FIX, and each step is chosen rather than stacked:
//
//   x-vercel-forwarded-for  Vercel sets this itself and overwrites whatever the
//                           client sent. It is the only header here the caller
//                           cannot author, so it is asked first.
//   x-real-ip               Also platform-set on Vercel; kept as the second
//                           source so a non-Vercel edge in front of the app
//                           (and the previous behaviour's own fallback) still
//                           resolves.
//   x-forwarded-for         Last, and only its RIGHTMOST entry — the hop our own
//                           proxy appended. Everything to the left of it is
//                           caller-authored. We do not scan further left when
//                           that entry does not parse: an attacker would only
//                           have to append junk to walk us back onto their own
//                           value.
//
// Whatever comes out is a syntactically valid IP or the literal 'unknown'. That
// second half is not tidiness — it is what keeps a hostile string out of an INET
// column, and it is why unidentifiable callers now SHARE the 'unknown' bucket
// instead of each being handed a fresh allowance.
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const platform =
    normalizeIpAddress(req.headers.get('x-vercel-forwarded-for')) ??
    normalizeIpAddress(req.headers.get('x-real-ip'))
  if (platform) return platform

  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const hops = xff.split(',')
    const nearest = normalizeIpAddress(hops[hops.length - 1])
    if (nearest) return nearest
  }

  return 'unknown'
}
