import { NextRequest, NextResponse } from 'next/server'
import { mcpGatewayOn } from '@/lib/mcp/gatewayFlag'
import { approvalResolver } from '@/lib/mcp/approvalWiring'
import { parseClientRegistry } from '@/lib/mcp/identity'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { clientIp } from '@/lib/security/rateLimit'
import { searchParam } from '@/lib/http/searchParams'

export const dynamic = 'force-dynamic'

// "Is this OAuth client an AI Host Tappy approves?" for the consent screen (/oauth/consent). Approved = listed by hand in MCP_OAUTH_CLIENTS, or every redirect URI of the client belongs to ONE known
// Host (src/lib/mcp/clientApproval.ts). The answer is one boolean: no redirect URI, name or Host label is returned. 404 unless the gateway flag is on. Fails closed (false) on any problem.
export async function GET(req: NextRequest) {
  if (!mcpGatewayOn()) return new NextResponse(null, { status: 404 })
  const rl = await publicRateLimit(`oauth-client-approval:${clientIp(req)}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ approved: false }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
  const id = searchParam(req, 'client_id') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ approved: false })
  if (Object.prototype.hasOwnProperty.call(parseClientRegistry(process.env.MCP_OAUTH_CLIENTS), id)) return NextResponse.json({ approved: true })
  const resolve = approvalResolver(process.env)
  let approved = false
  try { approved = !!resolve && !!(await resolve(id)) } catch { approved = false }
  return NextResponse.json({ approved }, { headers: { 'Cache-Control': 'no-store' } })
}
