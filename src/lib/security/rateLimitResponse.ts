import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import type { PublicRateLimitResult } from './publicRateLimit'

// One place that turns a refused `publicRateLimit` / `publicDailyRateLimit` result into the route's 429 — so every migrated route says the same thing and an operator can
// tell a QUOTA BREACH from an INFRASTRUCTURE FAILURE (the configured shared store did not answer):
//
//   · status and body are the routes' existing contract (429, `{ error: 'rate_limit', message }`) — clients already handle it, so the status is deliberately NOT changed
//     to 503 for a store failure; the distinction is carried where it cannot break a client:
//   · header `X-RateLimit-Reason: limit_exceeded | store_unavailable` (and `Retry-After` when a wait is known);
//   · one structured log line (`tappyai_rate_limit`, the same type chat already emits) with the limit name, the scope and the reason — never the key (it carries a user id).
// Counting `reason = store_unavailable` in the log is the outage signal; `limit_exceeded` is the abuse/usage signal.

export function logRateLimitRefusal(limit: string, result: PublicRateLimitResult): void {
  console.warn(JSON.stringify({ type: 'tappyai_rate_limit', limit, scope: result.scope, reason: result.reason ?? 'limit_exceeded' }))
}

export function rateLimitedResponse(req: Request, result: PublicRateLimitResult, limit: string, message?: string): NextResponse {
  logRateLimitRefusal(limit, result)
  const headers: Record<string, string> = { 'X-RateLimit-Reason': result.reason ?? 'limit_exceeded' }
  if (result.retryAfter > 0) headers['Retry-After'] = String(result.retryAfter)
  return NextResponse.json(
    { error: 'rate_limit', message: message ?? serverMessage('rate.tooFast', requestLocale(req)) },
    { status: 429, headers },
  )
}
