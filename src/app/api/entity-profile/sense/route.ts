import { NextRequest, NextResponse } from 'next/server'
import { clientIp } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { confirmSenseWithModel } from '@/lib/ai/answerV4/docMedia'
import type { MediaEntity } from '@/lib/media/mediaHosts'

// POST /api/entity-profile/sense   { answer, cards: [{ name, summary }] }  ->  { same: boolean[] }   (workspace v206 entity chips, 18/11)
//
// A chip is a bold name that Wikipedia resolved BY NAME; a name has senses ("Binh Minh": a company in the user's own document, a commune on Wikipedia). One small model call reads
// the start of the answer and each profile's summary and says whether the profile is about the same thing the answer talks about (the check the subject cards already have).
// Any failure answers `same` all false: a missing chip costs less than a wrong one. Public route, so it is bounded: a small body, at most MAX_CARDS cards, a tight rate limit,
// and the model call is the cheapest role with a 60-token answer. Nothing of the visitor is stored or forwarded.
export const dynamic = 'force-dynamic'

const MAX_CARDS = 6
const MAX_BODY_CHARS = 8000

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

export async function POST(req: NextRequest) {
  const limited = await publicRateLimit(`entity-sense:${clientIp(req)}`, 12, 60_000)
  if (!limited.ok) return rateLimitedResponse(req, limited, 'entity-sense')

  let body: { answer?: unknown; cards?: unknown } = {}
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ same: [] }, { status: 413 })
    body = JSON.parse(raw) as typeof body
  } catch { return NextResponse.json({ same: [] }, { status: 400 }) }

  const answer = text(body.answer, 1500)
  const cards: MediaEntity[] = (Array.isArray(body.cards) ? body.cards : []).slice(0, MAX_CARDS).flatMap((c): MediaEntity[] => {
    const x = (c ?? {}) as { name?: unknown; summary?: unknown }
    const name = text(x.name, 80)
    return name ? [{ name, summary: text(x.summary, 300), href: 'https://vi.wikipedia.org/', source: 'Wikipedia' as const }] : []
  })
  if (!answer || !cards.length) return NextResponse.json({ same: cards.map(() => false) })

  const same = await confirmSenseWithModel(answer, cards).catch(() => null)
  return NextResponse.json({ same: same && same.length === cards.length ? same.map(v => v === true) : cards.map(() => false) })
}
