import { NextRequest, NextResponse } from 'next/server'
import { mcpGatewayOn } from '@/lib/mcp/gatewayFlag'
import { handleMcpRequest, PARSE_ERROR } from '@/lib/mcp/gateway'
import { buildGatewayDeps } from '@/lib/mcp/defaultDeps'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { clientIp } from '@/lib/security/rateLimit'
import { readCappedBody } from '@/lib/http/readCappedBody'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// well below the chat route's 300 s: a SYNC tool call has a 12 s server deadline (placeholder), a job call returns at once
export const maxDuration = 30

// Remote MCP Gateway endpoint (R13 §25, ADR-CONN-017/018/019). Streamable HTTP, STATELESS: JSON-RPC over POST, a JSON reply, no SSE stream and no session.
// Behind MCP_GATEWAY (off unless "1", locked in production): with the flag off this route does not exist (404) and does no work at all.
// Not registered with any Host and not published anywhere. With the default wiring every request is refused (401): there is no token verifier yet (see src/lib/mcp/defaultDeps.ts).

const MAX_BODY_CHARS = 64_000
const notFound = () => new NextResponse(null, { status: 404 })
const notAllowed = () => new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })

export async function POST(req: NextRequest) {
  if (!mcpGatewayOn()) return notFound()
  // Burst cap per client IP BEFORE the body is read and before any token check: a flood of unauthenticated calls must not reach the verifier. (The IP is the network peer, here used
  // for abuse limiting only: it is never a location and never an identity.) The per-principal limit and the spend pool run inside the Gateway.
  const rl = await publicRateLimit(`mcp:ip:${clientIp(req)}`, 120, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited', code: 'RATE_LIMITED', message: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
  // the cap is enforced WHILE reading (a chunked body cannot buffer past it), not after
  const capped = await readCappedBody(req, MAX_BODY_CHARS * 4)
  if (!capped.ok || capped.text.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'request_too_large', code: 'INVALID_INPUT', message: 'Request too large.' }, { status: 413 })
  const text = capped.text
  let body: unknown
  try { body = JSON.parse(text) } catch { body = PARSE_ERROR }
  const r = await handleMcpRequest({ authorization: req.headers.get('authorization'), origin: req.headers.get('origin'), body, signal: req.signal }, buildGatewayDeps())
  if (r.body === null) return new NextResponse(null, { status: r.status, headers: r.headers })
  return NextResponse.json(r.body, { status: r.status, headers: r.headers })
}

// The request parameter is NOT optional: `next build` rejects a route handler whose first parameter may be undefined (found by the first real production build in CI, 20/11/2026).
export async function GET(_req: NextRequest) { return mcpGatewayOn() ? notAllowed() : notFound() }
export async function DELETE(_req: NextRequest) { return mcpGatewayOn() ? notAllowed() : notFound() }
