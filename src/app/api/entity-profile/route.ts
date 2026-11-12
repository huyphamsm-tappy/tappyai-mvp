import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { lookupWikiProfile, validEntityTitle, type WikiProfile } from '@/lib/entity/wikiProfile'

// GET /api/entity-profile?t=Elon%20Musk&t=Tesla   (workspace v206 entity chips)
//
// The profiles of the bold names of an answer, from Wikipedia's public summary (lib/entity/wikiProfile.ts: fixed hosts, validated title, bounded time and size, honest match,
// wikimedia pictures only). Read-only, no account needed, no model, no cost, nothing of the visitor is sent anywhere (no cookie, no header is forwarded).
// The ONLY input is `t` (repeated, at most MAX_NAMES): there is no host, URL or language parameter. A name that is invalid, not found, ambiguous or a failure is simply not in the
// answer: the response is always 200 with `{ profiles: [...] }` (possibly empty) so the page quietly keeps plain bold.
export const dynamic = 'force-dynamic'

const MAX_NAMES = 6

export async function GET(req: NextRequest) {
  const limited = await publicRateLimit(`entity-profile:${clientIp(req)}`, 40, 60_000)
  if (!limited.ok) return rateLimitedResponse(req, limited, 'entity-profile')

  const names: string[] = []
  for (const raw of req.nextUrl.searchParams.getAll('t')) {
    const t = validEntityTitle(raw)
    if (t && !names.some(n => n.toLowerCase() === t.toLowerCase())) names.push(t)
    if (names.length >= MAX_NAMES) break
  }

  const found = await Promise.all(names.map(n => lookupWikiProfile(n).catch(() => null)))
  const profiles = found.filter((p): p is WikiProfile => !!p)
  return NextResponse.json({ profiles }, {
    headers: { 'Cache-Control': profiles.length ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=300' },
  })
}
