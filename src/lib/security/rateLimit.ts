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

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}
