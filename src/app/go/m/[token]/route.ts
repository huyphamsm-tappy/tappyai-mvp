import { NextRequest, NextResponse } from 'next/server'
import { mcpGatewayOn } from '@/lib/mcp/gatewayFlag'
import { attributionConfig, verifyToken } from '@/lib/mcp/attribution'
import { createMetrics } from '@/lib/mcp/metrics'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { clientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

// GET /go/m/<token>: one click on a TappyAI attribution link created by the MCP Gateway (connector doc §15). 404 unless MCP_GATEWAY=1 (locked in production) AND the attribution secret is configured.
// It verifies the signed token, re-checks the destination against the allowlist, counts the click by channel and tool, and 302s to the destination. It reads NO cookie and NO account: the click source is
// the channel in the token, and the identity of whoever clicks or buys is resolved independently at checkout. It never redirects anywhere the token does not name, and an invalid token goes to the home page.
const metrics = createMetrics()

export async function GET(req: NextRequest, ctx: { params: { token: string } }) {
  if (!mcpGatewayOn()) return new NextResponse(null, { status: 404 })
  const cfg = attributionConfig(process.env)
  if (!cfg) return new NextResponse(null, { status: 404 })
  const rl = await publicRateLimit(`mcp-go:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
  const payload = verifyToken(ctx.params.token, cfg.secret, new Date())
  if (!payload) return NextResponse.redirect(new URL('/', req.nextUrl.origin), 302)
  metrics.record({ type: 'tappyai_mcp_click', ch: payload.ch, tool: payload.tool })
  console.log(JSON.stringify({ type: 'tappyai_mcp_click', ch: payload.ch, tool: payload.tool, ref: payload.ref }))
  return NextResponse.redirect(payload.dest, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
