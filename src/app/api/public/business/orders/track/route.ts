import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { clientIp } from '@/lib/security/rateLimit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { hashTrackingToken } from '@/lib/business/tracking'
import { findOrderByTrackingHash, findTrackedMerchant } from '@/lib/business/repositories/orders'
import { toTrackingView } from '@/lib/business/views'

// GET /api/public/business/orders/track — the customer follows their order.
//
// ============================================================================
// AUTH: THE TOKEN IS THE WHOLE AUTHORIZATION MODEL
// ============================================================================
// Unauthenticated by design — the customer has no Tappy account (P0 §22). The
// 256-bit bearer token minted at creation is what grants access, and it is the
// ONLY thing that does.
//
// 🚨 NO ALTERNATE IDENTIFIER IS ACCEPTED. Not `order_public_id`, not
// `customer_phone`, not `merchant_id`, not a session. The handler reads exactly
// one input, and the repository function it calls takes exactly one argument —
// the digest. §16 forbids enumeration by phone, and a second way in would be a
// second authorization mechanism to get wrong.
//
// ============================================================================
// WHY THE TOKEN IS A HEADER AND NOT A PATH SEGMENT
// ============================================================================
// A URL path is written to access logs, CDN logs, APM traces and the `Referer`
// of anything the page loads. A request header is written to none of those. The
// customer-facing page lives at `/order/<token>` — the token is in the URL BAR,
// where the customer put it — and that page reads its own token and calls this
// endpoint with it. The raw token therefore never enters a server-side log.
//
// P0's sketch had the page send `SHA-256(token)` instead. That is not done, and
// the reason is worth recording: once the token is in a header rather than a
// path it is already out of the logs, so hashing in the browser buys nothing —
// and it would put a SECOND implementation of the token hashing scheme in
// client code, where it could drift from this one.
//
// ============================================================================
// READ-ONLY
// ============================================================================
// GET only. There is no verb here that changes an order, which is also why the
// U02 anonymous-write boundary does not classify this route: that guard covers
// mutating verbs, and adding a read-only route to its exemption list would fail
// its own staleness check. The mutating sibling — POST /api/public/business/orders
// — carries the explicit `EXEMPT` entry.
//
// ERRORS 400 bad_request (no token) · 404 not_found · 429 rate_limited · 500

/** Set on the response, and pinned again in next.config.mjs for this path. */
const PRIVACY_HEADERS: Record<string, string> = {
  // A tracking page must never be indexed: a search engine that crawled one
  // would publish a customer's order behind a permanent, public URL.
  'X-Robots-Tag': 'noindex, nofollow',
  // The token is in the page URL. Without this, every image, font and script
  // the page loads would carry it to a third party in the `Referer`.
  'Referrer-Policy': 'no-referrer',
  // Nothing about one customer's order is shared, and a stale copy in a CDN
  // would outlive the order's status.
  'Cache-Control': 'no-store, max-age=0',
}

/**
 * 43 base64url characters — the shape `newTrackingToken()` produces. Checked
 * before hashing so a garbage value costs no work, and rejected with the same
 * answer as a valid-but-unknown token so the shape teaches a prober nothing.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,64}$/

export async function GET(req: Request) {
  try {
    const ip = clientIp(req)
    // The token is unguessable, so this is not brute-force protection — 2^256
    // does not need a rate limit. It bounds the cost of somebody pointing a
    // script at the endpoint, and gives a miss-rate spike somewhere to show up.
    const rl = await distributedRateLimit(`tb:track:${ip}`, 60, 60_000)
    if (!rl.ok) return withPrivacy(apiError(req, 'rate_limited', 'rate.retryShortly', 429))

    const token = req.headers.get('x-tracking-token')?.trim()
    if (!token) return withPrivacy(apiError(req, 'bad_request', 'validation.badBody', 400))

    // 🔑 A malformed token and an unknown one get the SAME answer. Telling them
    // apart would confirm that a well-formed token is a real order.
    if (!TOKEN_SHAPE.test(token)) {
      return withPrivacy(apiError(req, 'not_found', 'business.orderNotFound', 404))
    }

    const found = await findOrderByTrackingHash(hashTrackingToken(token))
    if (!found) return withPrivacy(apiError(req, 'not_found', 'business.orderNotFound', 404))

    const shop = await findTrackedMerchant(found.order.merchant_id)
    return withPrivacy(
      NextResponse.json({ order: toTrackingView(found.order, found.items, shop) })
    )
  } catch (e) {
    // Nothing about the failure reaches the caller: a distinguishable internal
    // error is itself a signal about whether a token matched.
    logBusinessError('track.lookup', e)
    return withPrivacy(apiError(req, 'server_error', 'server.error', 500))
  }
}

/**
 * Every response leaves through here — including the errors.
 *
 * A 404 that omitted `no-referrer` would still leak the token in the `Referer`
 * of whatever the error page loaded, so the headers are applied to the failure
 * paths as carefully as to the success one.
 */
function withPrivacy(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(PRIVACY_HEADERS)) res.headers.set(key, value)
  return res
}
