import { NextResponse } from 'next/server'
import { mcpGatewayOn } from '@/lib/mcp/gatewayFlag'
import { protectedResourceMetadata } from '@/lib/mcp/identity'

export const dynamic = 'force-dynamic'

// RFC 9728 protected-resource metadata of the MCP endpoint: where a Host finds the authorization server. 404 unless MCP_GATEWAY=1 (locked in production) AND the resource and the
// authorization server are configured over https. Public by design (it names no secret) and read-only.
export async function GET() {
  if (!mcpGatewayOn()) return new NextResponse(null, { status: 404 })
  const m = protectedResourceMetadata(process.env)
  if (!m) return new NextResponse(null, { status: 404 })
  return NextResponse.json(m, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
