import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { recheckBeforeHandoff, recheckSentence } from '@/lib/providers/realtime/resolve'
import type { SearchCriteria, SearchResult } from '@/lib/providers/realtime/types'

// POST /api/booking/recheck — re-verify ONE offer the user picked, right before the handoff (owner brief 06/10: "user chọn → recheck → CTA").
//
// Stateless on purpose: the client sends the offer id and the stay it was shown for; the server re-asks the provider (flag ON + credentials) and
// answers with a sentence the card can show: price unchanged / price changed / no longer available / "checked on the provider page". It never
// returns a credential or a provider error, never trusts the client's price as a fact (it is only the number to compare against), and answers
// 200 {status:'unchecked'} when the provider is OFF or BLOCKED — the CTA still works, the page re-checks.

export const dynamic = 'force-dynamic'

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Body = z.object({
  provider: z.enum(['agoda', 'booking']),
  providerItemId: z.string().regex(/^\d{1,12}$/),
  title: z.string().max(200).optional(),
  previousPrice: z.number().min(0).max(1e10).nullable().optional(),
  currency: z.enum(['VND', 'USD']).optional(),
  stay: z.object({
    destination: z.string().max(80).optional(),
    checkIn: iso,
    checkOut: iso,
    adults: z.number().int().min(1).max(20),
    rooms: z.number().int().min(1).max(9).optional(),
    children: z.number().int().min(0).max(10).optional(),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(10).optional(),
  }),
})

export async function POST(req: NextRequest) {
  if (!rateLimit(`booking-recheck:${clientIp(req)}`, 20, 60_000).ok) return NextResponse.json({ error: 'rate_limited', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })
  let parsed: z.infer<typeof Body>
  try { parsed = Body.parse(await req.json()) } catch { return NextResponse.json({ error: 'bad_request', message: serverMessage('validation.badBody', requestLocale(req)) }, { status: 400 }) }
  if (!(parsed.stay.checkOut > parsed.stay.checkIn)) return NextResponse.json({ error: 'bad_request', message: serverMessage('validation.badBody', requestLocale(req)) }, { status: 400 })

  const criteria: SearchCriteria = { vertical: 'hotel', subject: parsed.title ?? 'hotel', currency: parsed.currency ?? 'VND', userCountry: 'VN', context: { ...parsed.stay } }
  const item: SearchResult = {
    provider: parsed.provider, vertical: 'hotel', providerItemId: parsed.providerItemId, title: parsed.title ?? `#${parsed.providerItemId}`, subtitle: null,
    price: parsed.previousPrice ?? null, currency: parsed.currency ?? 'VND', availability: null, availabilityStatus: 'unknown', lastCheckedAt: null,
    source: 'REALTIME_TAPPY', realtimeSource: null, bookingUrl: null, deepLinkUrl: null, context: criteria.context, contextMissingInUrl: [], rawReference: `client:${parsed.provider}:${parsed.providerItemId}`,
  }
  const r = await recheckBeforeHandoff(item, criteria)
  const res = NextResponse.json({
    status: r.status,
    sentence: recheckSentence(r, parsed.provider),
    ...('result' in r && r.result ? { price: r.result.price, currency: r.result.currency, checkedAt: r.result.lastCheckedAt, bookingUrl: r.result.bookingUrl } : {}),
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
