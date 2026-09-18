/**
 * Consultative V1 — the pick must be STATED (rule 1), deterministically.
 *
 * Measured 2026-09-18 on CONSULTATIVE-40 (S2): six priced laptop rows, an engine pick on the card,
 * and the model wrote "bạn ưu tiên cái gì nhất — giá rẻ nhất, hiệu năng tốt, hay pin lâu?" naming
 * nothing. A prompt rule did not stop it. The backstop: when the body names NO retrieved venue or
 * product, the pick sentence is built from card fields and placed first; the model's text stays.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { shoppingPickFromMarker } from './pickBackstop'
import { applyPlaceEnrichmentStreamFilter } from '../streamEnrichment'
import { createEnrichmentCollector, type ConsultativeV1Context } from '../toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'

const MARKER = '[TAPPY_SHOPPING]' + JSON.stringify({ v: 1, entities: [
  { key: 'e0', name: 'Laptop HP 15s fq5229TU i3', recommended: false, priceLow: 9800000, offers: [{ seller: 'FPT Shop', price: 9800000, rating: 4.7, ratingCount: 210 }] },
  { key: 'e1', name: 'Laptop Acer Aspire Lite AL15-71P', recommended: true, priceLow: 13950000, offers: [{ seller: 'Nakio', price: 13950000, rating: 4.8, ratingCount: 35 }] },
] }) + '[/TAPPY_SHOPPING]'

describe('shoppingPickFromMarker', () => {
  it('builds the pick sentence from the recommended entity, card fields only', () => {
    const r = shoppingPickFromMarker(MARKER)!
    expect(r.name).toBe('Laptop Acer Aspire Lite AL15-71P')
    expect(r.sentence).toBe('Mình chọn **Laptop Acer Aspire Lite AL15-71P** — 13.950.000₫, 4.8⭐ (35 đánh giá), tại Nakio — phù hợp nhất với yêu cầu của bạn trong các kết quả tìm được.')
    expect(shoppingPickFromMarker(MARKER, 'en')!.sentence).toContain("I'd go with **Laptop Acer Aspire Lite AL15-71P** — 13,950,000 VND, 4.8⭐ (35 reviews), at Nakio")
  })
  it('is null without a marker, without a recommended entity, or on malformed JSON', () => {
    expect(shoppingPickFromMarker(undefined)).toBeNull()
    expect(shoppingPickFromMarker('[TAPPY_SHOPPING]{"v":1,"entities":[{"name":"x","recommended":false}]}[/TAPPY_SHOPPING]')).toBeNull()
    expect(shoppingPickFromMarker('[TAPPY_SHOPPING]{not json[/TAPPY_SHOPPING]')).toBeNull()
  })
})

const ROWS = [
  { place_id: 'p1', name: 'Cơm Niêu Sài Gòn', address: '585 Huỳnh Tấn Phát, Quận 7', google_rating: '⭐ 4.6 (1.200 đánh giá)', rating_value: 4.6, rating_count: 1200, opening_hours: '08:00–22:00', maps_link: 'https://maps.google.com/?cid=1', amenity: 'restaurant' },
  { place_id: 'p2', name: 'Ốc Đào', address: 'Quận 1', google_rating: '⭐ 4.4 (589 đánh giá)', rating_value: 4.4, rating_count: 589, maps_link: 'https://maps.google.com/?cid=2', amenity: 'restaurant' },
]
const USER = 'quán ăn tối cho 2 người ở Quận 1'
const ON: ConsultativeV1Context = { on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false }
const prose = (stream: string): string => stream.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

async function run(reply: string, opts: { v1?: boolean } = {}) {
  const collector = createEnrichmentCollector(USER)
  if (opts.v1 !== false) collector.setConsultativeV1(ON)
  const toolResult = { results: ROWS, place_search_status: 'has_results' }
  collector.setPlacesRecommendations(placeRecommendations(toolResult, 'TP.HCM', { name: ROWS[0].name }), 'food')
  const lines = [
    '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
    `a:{"toolCallId":"t1","result":${JSON.stringify(toolResult)}}`,
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const orig = console.log
  console.log = () => {}
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER, true)
    return prose(await new Response(res.body).text())
  } finally { console.log = orig }
}

describe('V1 pick backstop on the stream (G1 attribution ON)', () => {
  let saved: string | undefined
  beforeAll(() => { saved = process.env.PLACE_GUARD_ATTRIBUTION_V2; process.env.PLACE_GUARD_ATTRIBUTION_V2 = '1' })
  afterAll(() => { if (saved === undefined) delete process.env.PLACE_GUARD_ATTRIBUTION_V2; else process.env.PLACE_GUARD_ATTRIBUTION_V2 = saved })

  it('a body that asks instead of naming anything gets the evidence-only pick sentence FIRST, model text kept', async () => {
    const out = await run('Để gợi ý đúng ý, mình cần biết thêm: bạn ưu tiên món Việt hay món Nhật, và có cần chỗ đậu xe không?')
    expect(out.startsWith('Mình chọn **Cơm Niêu Sài Gòn** — 4.6⭐ (1.200 đánh giá Google Maps); giờ mở cửa theo Google Maps: 08:00–22:00.')).toBe(true)
    expect(out).toContain('bạn ưu tiên món Việt hay món Nhật')
  })
  it('does nothing when the body already names a retrieved venue', async () => {
    const reply = 'Mình chọn **Ốc Đào** — 4.4⭐ (589 đánh giá), gần bạn hơn. Bạn muốn đặt bàn không?'
    const out = await run(reply)
    expect(out.startsWith('Mình chọn **Ốc Đào**')).toBe(true)
    expect(out.match(/Mình chọn/g)).toHaveLength(1)
  })
  it('is V1-only: flag context off leaves the asking body as it is', async () => {
    const out = await run('Để gợi ý đúng ý, mình cần biết thêm: bạn ưu tiên món Việt hay món Nhật, và có cần chỗ đậu xe không?', { v1: false })
    expect(out).not.toContain('Mình chọn')
  })
})

describe('V1 pick backstop — a plain mention of a retrieved venue is "named" too', () => {
  let saved: string | undefined
  beforeAll(() => { saved = process.env.PLACE_GUARD_ATTRIBUTION_V2; process.env.PLACE_GUARD_ATTRIBUTION_V2 = '1' })
  afterAll(() => { if (saved === undefined) delete process.env.PLACE_GUARD_ATTRIBUTION_V2; else process.env.PLACE_GUARD_ATTRIBUTION_V2 = saved })
  it('does not prepend a pick when the body names the venue without bold (measured E4)', async () => {
    const out = await run('Mình chưa tìm thấy thông tin về chỗ đậu xe của Ốc Đào trong kết quả. Bạn có thể gọi trực tiếp quán để hỏi về dịch vụ giữ xe nhé.')
    expect(out).not.toContain('Mình chọn')
    expect(out).toContain('chỗ đậu xe của Ốc Đào')
  })
})
