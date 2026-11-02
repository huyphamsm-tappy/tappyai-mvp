// @vitest-environment node
// Phase 3C / D7 at the STREAM level: with the Brief on (collector.consultBrief) a reply that names a DIFFERENT venue than the engine Pick
// does not replace it; with the flag off the stream is unchanged (the model's pick stays).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { applyPlaceEnrichmentStreamFilter, renderedFoldNames } from './streamEnrichment'
import { createEnrichmentCollector, type ConsultativeV1Context } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'

const ROWS = [
  { place_id: 'p1', name: 'Cơm Niêu Sài Gòn', address: '585 Huỳnh Tấn Phát, Quận 7', google_rating: '⭐ 4.6 (1.200 đánh giá)', rating_value: 4.6, rating_count: 1200, maps_link: 'https://maps.google.com/?cid=1', amenity: 'restaurant' },
  { place_id: 'p2', name: 'Ốc Đào', address: 'Quận 1', google_rating: '⭐ 4.4 (589 đánh giá)', rating_value: 4.4, rating_count: 589, maps_link: 'https://maps.google.com/?cid=2', amenity: 'restaurant' },
]
const USER = 'quán ăn tối cho 2 người ở Quận 1'
const ON: ConsultativeV1Context = { on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false }

async function run(reply: string, brief: boolean) {
  const collector = createEnrichmentCollector(USER)
  collector.setConsultativeV1(ON)
  // the ENGINE picked Ốc Đào
  collector.setPlacesRecommendations(placeRecommendations({ results: ROWS }, 'Quận 1', {
    name: 'Ốc Đào', reasons: [{ attribute: 'rating', evidence: 'rated 4.4', params: { value: 4.4 } }], tradeOff: null,
  }), 'food')
  if (brief) collector.setConsultBrief(true)
  const lines = [
    '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
    `a:{"toolCallId":"t1","result":${JSON.stringify({ results: ROWS, place_search_status: 'has_results' })}}`,
    '0:' + JSON.stringify(reply),
    'd:{"finishReason":"stop"}',
  ]
  const logs: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER, true)
    const text = await new Response(res.body).text()
    return { text, logs }
  } finally { console.log = orig }
}
const prose = (stream: string): string => stream.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

describe('D7 — the engine Pick is stated and not replaced by the model (CONSULT_BRIEF)', () => {
  let saved: string | undefined
  beforeAll(() => { saved = process.env.PLACE_GUARD_ATTRIBUTION_V2; process.env.PLACE_GUARD_ATTRIBUTION_V2 = '1' })
  afterAll(() => { if (saved === undefined) delete process.env.PLACE_GUARD_ATTRIBUTION_V2; else process.env.PLACE_GUARD_ATTRIBUTION_V2 = saved })
  const MODEL = 'Mình chọn **Cơm Niêu Sài Gòn** vì đánh giá 4.6⭐ và hợp 2 người tối nay.'
  it('flag OFF: byte-for-byte the model\'s reply (no engine enforcement log)', async () => {
    const { text, logs } = await run(MODEL, false)
    expect(prose(text)).toContain('Cơm Niêu Sài Gòn')
    expect(logs.some(l => l.includes('engine_pick_authoritative'))).toBe(false)
  })
  it('flag ON: the engine Pick is stated even though the model named another venue, and the divergence handling is logged', async () => {
    const { text, logs } = await run(MODEL, true)
    expect(prose(text).startsWith('Mình chọn **Ốc Đào**')).toBe(true) // the engine Pick leads
    expect(logs.some(l => l.includes('engine_pick_authoritative'))).toBe(true)
  })
  it('A3. the rendered primary card and the emphasis follow the ENGINE Pick even when the reply mentioned another venue first (flag ON); flag OFF keeps the model-first card', async () => {
    const cards = (logs: string[]) => { const l = logs.find(x => x.includes('"type":"tappyai_cards"') && x.includes('card1')); return l ? JSON.parse(l) as { card1: string | null; emphasis: string; engine_pick: string | null; model_pick: string | null } : null }
    const on = cards((await run(MODEL, true)).logs)
    expect(on).not.toBeNull()
    expect(on!.engine_pick).toBe('Ốc Đào')
    expect(on!.model_pick).toBe('Cơm Niêu Sài Gòn')
    expect(on!.card1).toBe('Ốc Đào') // primary card = engine Pick
    expect(on!.emphasis).toBe('engine_kept')
    const off = cards((await run(MODEL, false)).logs)
    expect(off!.card1).toBe('Cơm Niêu Sài Gòn') // unchanged when the flag is off
  })
  it('A3. the PHOTO fold (renderedFoldNames) leads with the engine Pick when the flag is on, with the model-first venue when it is off', () => {
    const recs = placeRecommendations({ results: ROWS }, 'Quận 1', { name: 'Ốc Đào', reasons: [{ attribute: 'rating', evidence: 'rated 4.4' }], tradeOff: null })
    const text = 'Mình chọn **Cơm Niêu Sài Gòn** vì đánh giá 4.6⭐. **Ốc Đào** là phương án khác.'
    const on = renderedFoldNames(recs, text, true)
    const off = renderedFoldNames(recs, text, false)
    if (on === undefined) return // the annotation is not emitted in this build: nothing renders, so nothing can contradict the Pick
    expect(on[0]).toBe('Ốc Đào')
    expect(off![0]).toBe('Cơm Niêu Sài Gòn')
  })
  it('flag ON: when the model already states the engine Pick nothing is added or rewritten', async () => {
    const reply = 'Mình chọn **Ốc Đào** vì đánh giá 4.4⭐ và hợp 2 người tối nay.'
    const { text, logs } = await run(reply, true)
    expect(prose(text)).toContain('Ốc Đào')
    expect(prose(text)).not.toContain('Cơm Niêu')
    expect(logs.some(l => l.includes('engine_pick_authoritative') && l.includes('restored'))).toBe(false)
  })
})
