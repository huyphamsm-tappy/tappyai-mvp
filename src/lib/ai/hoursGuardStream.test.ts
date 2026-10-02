// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'

// E1 (2026-09-20): opening hours in a place reply trace to the ROW (today + the week) or are cut
// by the clause, with one hedge. Driven through the real stream filter on a search_places turn.

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const ROWS = [
  { place_id: 'g-1', name: 'Karaoke MEI', address: '12 Bùi Viện, Quận 1', rating_value: 4.9, rating_count: 1401, maps_link: 'https://maps.google.com/?cid=1', opening_hours: '10:00–03:00', opening_hours_week: { 'Thứ Sáu': '10:00–03:00', 'Thứ Bảy': '10:00–05:00' }, text_ranked: true },
  { place_id: 'g-2', name: 'Karaoke Avatar', address: '5 Cầu Ông Lãnh, Quận 1', rating_value: 4.9, rating_count: 6398, maps_link: 'https://maps.google.com/?cid=2', text_ranked: true },
]

async function run(prose: string) {
  const result = { source: 'serper_maps', count: ROWS.length, results: ROWS, _tappy_place_domain: 'entertainment' }
  const collector = createEnrichmentCollector()
  collector.add(result.results)
  collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM', { name: ROWS[0].name, reasons: [{ attribute: 'rating', evidence: 'rated 4.9' }] }), producerSubject('search_places', 'entertainment'))
  collector.setRendersDecisionCard(rendersDecisionCard('web'))
  const frames = [
    '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"quán karaoke","location":"Quận 1"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result }),
    line0(prose),
    END,
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'karaoke gần đây cho nhóm 8 người tối nay', true)
  const out = await new Response(res.body).text()
  return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('E1 — hours on a place turn', () => {
  it("keeps today's and the week's row hours; cuts an hour no row states; hedges once", async () => {
    const out = await run('Mình chọn **Karaoke MEI** — 4.9⭐ từ 1.401 đánh giá, mở đến 3h sáng, gần bạn nhất.\n\n**Karaoke Avatar** (4.9⭐, 6.398 đánh giá) mở đến 5h sáng thứ Bảy, nhưng mở đến 6h sáng ngày thường.')
    expect(out).toContain('mở đến 3h sáng')
    expect(out).toContain('mở đến 5h sáng thứ Bảy')
    expect(out).not.toContain('6h sáng')
    expect(out).toContain('4.9⭐ từ 1.401 đánh giá')
    expect(out.match(/Giờ mở cửa mình chưa xác nhận được/g)).toHaveLength(1)
  })

  it('a reply with row-backed hours only is byte-identical (no hedge)', async () => {
    const out = await run('Mình chọn **Karaoke MEI** — 4.9⭐ từ 1.401 đánh giá, mở đến 3h sáng.')
    expect(out).not.toContain('chưa xác nhận được')
    expect(out).toContain('mở đến 3h sáng')
  })
})

// E1 — P2 budget-band overclaim through the real stream filter (the budget rides the V1 context).
import type { ConsultativeV1Context } from './toolResultSplit'
describe('E1 — budget fit on a place turn', () => {
  async function runWithBudget(prose: string, budget: ConsultativeV1Context['budget']) {
    const rows = [{ place_id: 'g-1', name: 'Béo Ơi Quán', address: '10 Nguyễn Trãi, Quận 1', rating_value: 4.6, rating_count: 1200, price_range_text: '100-200 N ₫', maps_link: 'https://maps.google.com/?cid=1', text_ranked: true }]
    const result = { source: 'serper_maps', count: 1, results: rows, _tappy_place_domain: 'food' }
    const collector = createEnrichmentCollector()
    collector.add(rows)
    collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM', { name: rows[0].name, reasons: [{ attribute: 'rating', evidence: 'rated 4.6' }] }), producerSubject('search_places', 'food'))
    collector.setRendersDecisionCard(rendersDecisionCard('web'))
    collector.setConsultativeV1({ on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false, budget })
    const frames = ['9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"quán ăn ngon","location":"Quận 1"}}', 'a:' + JSON.stringify({ toolCallId: 't1', result }), line0(prose), END]
    // The band survives the snippet-price guard only under SNIPPET_PRICE_GUARD_V2 (the audit config).
    const saved = process.env.SNIPPET_PRICE_GUARD_V2
    process.env.SNIPPET_PRICE_GUARD_V2 = '1'
    try {
      const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'ăn gì ngon giờ — dưới 100k/người', true)
      const out = await new Response(res.body).text()
      return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    } finally {
      if (saved === undefined) delete process.env.SNIPPET_PRICE_GUARD_V2; else process.env.SNIPPET_PRICE_GUARD_V2 = saved
    }
  }
  it('B1 shape: "100-200k/người vừa vặn ngân sách" with "dưới 100k" loses the fit clause, keeps the band', async () => {
    const out = await runWithBudget('Mình chọn **Béo Ơi Quán** — 4.6⭐ (1.200 đánh giá), mức giá 100-200k/người, vừa vặn ngân sách của bạn.', { min: 0, max: 100000, type: 'under' })
    expect(out).toContain('100-200k/người')
    expect(out).not.toContain('vừa vặn ngân sách')
  })
  it('the same sentence with a budget it really fits is untouched', async () => {
    const out = await runWithBudget('Mình chọn **Béo Ơi Quán** — 4.6⭐ (1.200 đánh giá), mức giá 100-200k/người, vừa vặn ngân sách của bạn.', { min: 120000, max: 180000, type: 'around' })
    expect(out).toContain('vừa vặn ngân sách')
  })
})

// E1/F (2026-09-20, measured Android turn A2): on a no-tool follow-up the previous reply's hours are evidence.
describe('E1 — a no-tool follow-up may restate the hours the previous reply stated', () => {
  it('"quán này mở mấy giờ?" → "mở cửa đến 22:30" survives (priorTimes / carried hours), a new hour does not', async () => {
    const collector = createEnrichmentCollector()
    collector.setRendersDecisionCard(rendersDecisionCard('android'))
    collector.setConsultativeV1({ on: true, rendersCard: true, namedRefetch: [], carried: [{ name: 'Nhà Hàng Ngon', rating: 4, reviewCount: 11408, distanceKm: 0.1, hours: 'đến 22:30' }], hardGaps: [], budgetGap: false, priorTimes: ['22:30'] })
    const frames = [line0('**Nhà Hàng Ngon** mở cửa đến 22:30 hôm nay, và mở từ 6h sáng.'), END]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, 'quán này mở mấy giờ?', true)
    const out = (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(out).toContain('mở cửa đến 22:30')
    expect(out).not.toContain('6h sáng')
  })
})
