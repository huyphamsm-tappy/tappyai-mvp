import { NextResponse } from 'next/server'
import { mcpGatewayOn } from '@/lib/mcp/gatewayFlag'
import { protectedResourceMetadata, resourcePath } from '@/lib/mcp/identity'

export const dynamic = 'force-dynamic'

// RFC 9728 path-specific address: for the resource https://host/api/mcp, a Host may ask https://host/.well-known/oauth-protected-resource/api/mcp (several try it BEFORE the address in the
// WWW-Authenticate header). It answers the same document, but ONLY for the real resource path; any other path is 404. Same gating as the root address.
export async function GET(_req: Request, ctx: { params: { path?: string[] } }) {
  if (!mcpGatewayOn()) return new NextResponse(null, { status: 404 })
  const m = protectedResourceMetadata(process.env)
  const want = resourcePath(process.env)
  if (!m || !want || `/${(ctx.params.path ?? []).join('/')}` !== want) return new NextResponse(null, { status: 404 })
  return NextResponse.json(m, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
