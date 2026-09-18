/**
 * Hotels from Serper `/maps` are evidence (measured 2026-09-18, T2/T8 of CONSULTATIVE-40).
 *
 * `get_hotel_prices` puts its `/maps` rows in `hotel_list` and, when `/maps` answers, has no
 * `search_results` at all. The stream guard used to read only `search_results` for hotels, so
 * 18 real hotels with ratings were invisible: every sentence naming one was cut as fabricated and
 * the reply degraded to "bạn định check-in ngày nào?". Pinned: a hotel named from `hotel_list`
 * with its own rating survives; a hotel that is NOT in the rows is still cut.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector, type ConsultativeV1Context } from './toolResultSplit'

const HOTELS = [
  { place_id: 'h1', name: 'M Hotel Da Nang', address: '286 Võ Nguyên Giáp, Ngũ Hành Sơn, Đà Nẵng', google_rating: '4.9⭐ (2.821 đánh giá Google Maps)', rating_value: 4.9, rating_count: 2821, phone: '+84 236 3816 868', maps_link: 'https://maps.google.com/?cid=1', place_types: ['Khách sạn'] },
  { place_id: 'h2', name: 'Hanami Hotel Danang', address: '61-63 Hoàng Kế Viêm, Ngũ Hành Sơn, Đà Nẵng', google_rating: '4.6⭐ (2.231 đánh giá Google Maps)', rating_value: 4.6, rating_count: 2231, phone: '+84 905 432 992', maps_link: 'https://maps.google.com/?cid=2', place_types: ['Khách sạn'] },
]
const USER = 'khach san da nang gan bien duoi 1tr/dem'
const ON: ConsultativeV1Context = { on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false }

async function run(reply: string, hotels: typeof HOTELS = HOTELS) {
  const collector = createEnrichmentCollector(USER)
  collector.setConsultativeV1(ON)
  const toolResult = { location: 'Đà Nẵng', source: 'Serper Maps', hotel_list: hotels, booking_link: 'https://www.booking.com/searchresults.vi.html?ss=Da+Nang' }
  const lines = [
    '9:{"toolCallId":"t1","toolName":"get_hotel_prices","args":{"location":"Đà Nẵng"}}',
    `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult)}}`,
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const orig = console.log
  console.log = () => {}
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, /* travelIntent */ true, USER, /* placeIntent */ false)
    return await new Response(res.body).text()
  } finally { console.log = orig }
}
const prose = (stream: string): string => stream.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

describe('get_hotel_prices — hotel_list rows are the evidence (G1 attribution ON, as on the audit env)', () => {
  let saved: string | undefined
  beforeAll(() => { saved = process.env.PLACE_GUARD_ATTRIBUTION_V2; process.env.PLACE_GUARD_ATTRIBUTION_V2 = '1' })
  afterAll(() => { if (saved === undefined) delete process.env.PLACE_GUARD_ATTRIBUTION_V2; else process.env.PLACE_GUARD_ATTRIBUTION_V2 = saved })
  it('keeps the pick that names a /maps hotel with its own rating and review count', async () => {
    const out = prose(await run('Mình chọn **M Hotel Da Nang** — 4.9⭐ với 2.821 đánh giá, sát biển Mỹ Khê. Phương án khác: **Hanami Hotel Danang** 4.6⭐ (2.231 đánh giá), rẻ hơn một chút.'))
    expect(out).toContain('M Hotel Da Nang')
    expect(out).toContain('4.9')
    expect(out).toContain('Hanami Hotel Danang')
  })
  it('the same reply with NO hotel rows is what the old path saw: the evidence-bearing sentence is cut', async () => {
    const reply = 'Mình chọn **M Hotel Da Nang** — 4.9⭐ với 2.821 đánh giá, sát biển Mỹ Khê. Bạn nên đặt sớm.'
    expect(prose(await run(reply))).toContain('2.821 đánh giá')
    const out = prose(await run(reply, []))
    expect(out).not.toContain('2.821 đánh giá')
    expect(out).not.toContain('M Hotel Da Nang')
  })
})
