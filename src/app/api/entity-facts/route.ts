import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestSearchParams } from '@/lib/http/searchParams'
import { validEntityTitle } from '@/lib/entity/wikiProfile'
import { lookupWikiFacts } from '@/lib/entity/wikiFacts'

// GET /api/entity-facts?t=Elon%20Musk&w=en&ui=vi   (the profile panel's "data" table)
//
// A few structured facts about a subject from Wikidata (lib/entity/wikiFacts.ts: fixed hosts, validated title, bounded time and size, known properties only). Read-only, no account, no model, no cost, nothing of
// the visitor sent anywhere. The inputs are `t` (the Wikipedia title), `w` (which Wikipedia: vi or en) and `ui` (the language of the labels); there is no host, URL or property parameter. Always a 200 with
// `{ facts: [...] }` (possibly empty): the panel then shows no table.
export const dynamic = 'force-dynamic'

const lang = (raw: string | null, fallback: 'vi' | 'en'): 'vi' | 'en' => (raw === 'vi' || raw === 'en' ? raw : fallback)

export async function GET(req: NextRequest) {
  const limited = await publicRateLimit(`entity-facts:${clientIp(req)}`, 40, 60_000)
  if (!limited.ok) return rateLimitedResponse(req, limited, 'entity-facts')
  const q = requestSearchParams(req)
  const title = validEntityTitle(q.get('t'))
  if (!title) return NextResponse.json({ facts: [] })
  const facts = await lookupWikiFacts(title, lang(q.get('w'), 'vi'), lang(q.get('ui'), 'vi')).catch(() => null)
  return NextResponse.json(facts ? { facts: facts.facts, wikidata: facts.wikidata } : { facts: [] }, {
    headers: { 'Cache-Control': facts ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=300' },
  })
}
