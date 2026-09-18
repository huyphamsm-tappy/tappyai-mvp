import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import {
  createGraphZaloVerifier, createMockZaloVerifier, signZaloIdentity, zaloIdentitySecret, zaloIdentitySetCookie,
  type ZaloIdentityVerifier,
} from '@/lib/zalo/identity'

// POST /api/zalo/mini/verify  { access_token }
//
// CLASSIFICATION (G1 public/private boundary — locked by zaloVerifyRouteBoundary.test.ts):
//   · a PRIVATE API endpoint, POST only. No GET export, so no crawler can fetch it;
//     under /api/, which robots.ts disallows; never in the sitemap; not a page.
//   · NOT Tappy-authenticated: it runs BEFORE the visitor has any Tappy identity.
//     Its authorization is server-to-server — the Zalo access token is verified
//     against Zalo's Open API by the server; nothing the client asserts is trusted.
//   · Mini-App-only by purpose (its sole caller is the Zalo Mini App webview);
//     any other caller gets nothing useful: the only success output is an
//     httpOnly cookie that tightens a rate limit.
//   · Never emits identity material: the JSON body is {ok:true} or an error
//     code; the HMAC lives only in the httpOnly cookie; the secret never leaves.
//
// The Zalo Mini App exchanges its Zalo access token for a server-signed identity
// cookie that /api/chat uses as an extra rate-limit key. Nothing about the
// Zalo user is stored — only an HMAC leaves this handler, inside the cookie.
//
//   200 { ok: true }                        cookie set
//   401 { error: 'invalid_zalo_token' }     Zalo rejected the token
//   503 { error: 'verification_unavailable' } verifier not reachable / not configured
//
// The mock verifier is opt-in for non-production runs only (ZALO_VERIFIER=mock),
// so a test build can exercise the whole path without Zalo credentials.
export const dynamic = 'force-dynamic'

/** Belt and braces on top of robots.txt: even a fetched response says "do not index". */
const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } as const

function withNoIndex(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(NOINDEX)) res.headers.set(k, v)
  return res
}

function resolveVerifier(env: NodeJS.ProcessEnv = process.env): ZaloIdentityVerifier {
  if (env.ZALO_VERIFIER === 'mock' && env.NODE_ENV !== 'production') return createMockZaloVerifier()
  return createGraphZaloVerifier()
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`zalo-verify:${clientIp(req)}`, 20, 60_000).ok) return withNoIndex(apiError(req, 'rate_limit', 'rate.tooFast', 429))
  const secret = zaloIdentitySecret()
  if (!secret) return withNoIndex(apiError(req, 'verification_unavailable', 'server.error', 503))

  let token: unknown
  try { token = ((await req.json()) as { access_token?: unknown })?.access_token } catch { token = undefined }
  if (typeof token !== 'string' || token.length < 8 || token.length > 4096) return withNoIndex(apiError(req, 'invalid_request', 'validation.missingFields', 400))

  let zaloUserId: string | null
  try {
    zaloUserId = await resolveVerifier().verify(token)
  } catch (e) {
    console.error('[zalo/mini/verify] verifier unavailable:', e instanceof Error ? e.message : e)
    return withNoIndex(apiError(req, 'verification_unavailable', 'server.error', 503))
  }
  if (!zaloUserId) return withNoIndex(apiError(req, 'invalid_zalo_token', 'auth.required', 401))

  const res = withNoIndex(NextResponse.json({ ok: true }))
  res.headers.set('Set-Cookie', zaloIdentitySetCookie(signZaloIdentity(zaloUserId, secret)))
  return res
}
