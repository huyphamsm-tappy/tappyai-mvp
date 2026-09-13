import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { emitCommerceEvent, installCommerceObservability } from '@/lib/ccp'
import { flushPending } from '@/lib/observability'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { CCP_ENABLED } from '@/lib/config/product'

// This route may be the first CCP code a warm instance runs; route the event to the shared sink.
installCommerceObservability()

// POST /api/commerce/handoff — the user opened a Commerce Link.
//
// The sixth approved CCP event (`commerce_handoff`, owner decision D5) has no
// server-side producer: the click happens in the client, after the reply was
// streamed. This is the ONE endpoint the canonical architecture needs from
// /api/commerce/* for Phase 6 (P6-A/B: links travel on the row and render as
// actions; nothing is resolved on demand, so there is no resolve/search route).
//
// Same discipline as /api/deals/[id]/click: best-effort, never blocks the link
// from opening, always 200 once the body is well-formed. NOT analytics — no
// cookie, no user id, no URL: the body carries the opaque ids CCP minted.
//
// 🚨 The counter is off with the platform: while CCP_ENABLED is false nothing
// renders a commerce action, so a well-formed hit is acknowledged and dropped.

export const dynamic = 'force-dynamic'

const LINK_ID = /^[a-f0-9]{24}$/
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLATFORMS = new Set(['web', 'android', 'ios'])
const MAX_BODY_BYTES = 512

export interface HandoffBody { linkId: string; requestId: string; platform?: 'web' | 'android' | 'ios' }

/** Pure: the body a client may send, or null. Exported for the route test. */
export function parseHandoffBody(raw: unknown): HandoffBody | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.linkId !== 'string' || !LINK_ID.test(b.linkId)) return null
  if (typeof b.requestId !== 'string' || !REQUEST_ID.test(b.requestId)) return null
  const platform = typeof b.platform === 'string' && PLATFORMS.has(b.platform) ? (b.platform as HandoffBody['platform']) : undefined
  return { linkId: b.linkId, requestId: b.requestId, ...(platform ? { platform } : {}) }
}

export async function POST(req: Request) {
  void flushPending(req)
  const rl = rateLimit(`commerce-handoff:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  let body: HandoffBody | null = null
  try {
    const text = await req.text()
    if (text.length <= MAX_BODY_BYTES) body = parseHandoffBody(JSON.parse(text))
  } catch {
    body = null
  }
  // A malformed body is a CLIENT bug (W2 client-shape code): no sentence is owed to a user for it.
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  if (CCP_ENABLED) emitCommerceEvent({ type: 'commerce_handoff', linkId: body.linkId, requestId: body.requestId, ...(body.platform ? { platform: body.platform } : {}) })
  return NextResponse.json({ ok: true })
}
