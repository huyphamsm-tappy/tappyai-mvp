// POST /api/links/resolve  { url }
// Backend-owned URL resolution for the composer (V1: YouTube only).
// Returns { data: ResolvedLink } with a guaranteed non-empty thumbnail, or a
// 400 for an unsupported source. The frontend stores `data` verbatim.

import { NextRequest, NextResponse } from 'next/server'
import { resolveLink } from '@/lib/links/resolve'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`links-resolve:${ip}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }
  const url = typeof (body as { url?: unknown })?.url === 'string' ? (body as { url: string }).url : ''
  if (!url.trim()) return NextResponse.json({ error: 'url_required' }, { status: 400 })

  const resolved = await resolveLink(url)
  if (!resolved) return NextResponse.json({ error: 'unsupported_source' }, { status: 400 })

  return NextResponse.json({ data: resolved })
}
