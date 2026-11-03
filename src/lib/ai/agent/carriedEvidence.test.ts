// @vitest-environment node
// Phase 7 closeout 2A — carried evidence for follow-ups about the cards on screen. Pure module + the real placeClaimGuard / hours guard
// through the real stream filter (a follow-up that ran NO tool, like "quán số 2 sao?").
import { describe, it, expect } from 'vitest'
import { cardEvidence, mergeCarried, rowForCard, OPEN_NOW_FRESH_MS } from './carriedEvidence'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'

const NOW = new Date('2026-10-04T12:00:00Z')
// Stored rows of "tìm 3 quán ngon ở Q1" (compactCandidates shape; real names from the 04/10 UAT).
const ROWS = [
  { name: 'Gánh - Truly Vietnamese Cuisine', rating_value: 4.6, rating_count: 2358, address: '91 Hai Bà Trưng, Sài Gòn', price_range_text: '100.000–500.000 ₫', distance_km: 0.4, open_now: true },
  { name: 'Hàng Dương Quán Quận 1', rating_value: 4.5, rating_count: 718, address: '32–34 Ngô Đức Kế, Bến Nghé, Quận 1', phone: '028 3829 1234', distance_km: 0.6, open_now: true },
  { name: 'Quán Bụi Central', rating_value: 4.5, rating_count: 900, address: '1B Ngô Văn Năm', opening_hours: '07:00–23:00', distance_km: 0.9 },
]
const CARDS = ['Gánh - Truly Vietnamese Cuisine', 'Hàng Dương Quán Quận 1', 'Quán Bụi Central']

describe('cardEvidence — entity resolution + field-level facts', () => {
  it('position i is card i; only fields the row has; verifiedAt carried', () => {
    const { facts } = cardEvidence(CARDS, ROWS, { now: NOW, verifiedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() })
    expect(facts.map(f => [f.position, f.name])).toEqual([[1, 'Gánh - Truly Vietnamese Cuisine'], [2, 'Hàng Dương Quán Quận 1'], [3, 'Quán Bụi Central']])
    expect(facts[1]).toMatchObject({ rating: 4.5, reviews: 718, address: '32–34 Ngô Đức Kế, Bến Nghé, Quận 1', phone: '028 3829 1234', km: 0.6 })
    expect(facts[1].hours).toBeUndefined() // the row has no hours → none carried
    expect(facts[2].hours).toBe('07:00–23:00')
  })
  it('exact name wins over containment ("Quán Bụi" must not grab a longer row first)', () => {
    const rows = [{ name: 'Quán Bụi Central Garden' }, { name: 'Quán Bụi Central' }]
    expect(rowForCard('Quán Bụi Central', rows)?.name).toBe('Quán Bụi Central')
  })
  it('"open now" is a moment: carried only while fresh; unknown time → never', () => {
    const fresh = cardEvidence(CARDS, ROWS, { now: NOW, verifiedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString() }).facts[0]
    const stale = cardEvidence(CARDS, ROWS, { now: NOW, verifiedAt: new Date(NOW.getTime() - OPEN_NOW_FRESH_MS - 1).toISOString() }).facts[0]
    const unknown = cardEvidence(CARDS, ROWS, { now: NOW }).facts[0]
    expect(fresh.openNow).toBe(true)
    expect(stale.openNow).toBeUndefined()
    expect(unknown.openNow).toBeUndefined()
  })
  it('rows win over what the prior prose stated; prose-only venues are kept', () => {
    const prose = [{ name: 'Hàng Dương Quán Quận 1', rating: 4.9, reviewCount: null, distanceKm: null, hours: null }, { name: 'Phở Hòa', rating: 4.2, reviewCount: 100, distanceKm: 2, hours: null }]
    const merged = mergeCarried(prose, cardEvidence(CARDS, ROWS, { now: NOW }).carried)
    expect(merged.find(m => m.name === 'Hàng Dương Quán Quận 1')?.rating).toBe(4.5)
    expect(merged.find(m => m.name === 'Phở Hòa')?.rating).toBe(4.2)
  })
})

// A no-tool follow-up turn through the real filter: the collector carries the evidence the route sets for an agent follow-up.
async function followUp(userText: string, reply: string, carried = cardEvidence(CARDS, ROWS, { now: NOW }).carried) {
  const c = createEnrichmentCollector(userText, ['tìm 3 quán ngon ở Q1']); c.agentMode = true
  c.setConsultativeV1({ on: true, rendersCard: false, namedRefetch: [], referenced: [], carried, hardGaps: [], budgetGap: false, budget: null, priorTimes: [] } as never)
  const lines = [`0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
  const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, userText, true).body).text()
  return raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('placeClaimGuard on a no-tool follow-up: carried row evidence authorizes exactly its own fields', () => {
  it('"quán số 2 sao?" — rating, reviews, distance and address of card #2 are allowed (the 04/10 reply came out EMPTY)', async () => {
    const out = await followUp('quán số 2 sao?', '**Hàng Dương Quán Quận 1** được 4.5⭐ từ 718 đánh giá, cách bạn khoảng 0,6 km, ở 32–34 Ngô Đức Kế.')
    expect(out).toContain('4.5⭐ từ 718 đánh giá')
    expect(out).toContain('0,6 km')
  })
  it('contrast — the old prose-only evidence (the prior reply never described card #2) removed that same sentence', async () => {
    const out = await followUp('quán số 2 sao?', '**Hàng Dương Quán Quận 1** được 4.5⭐ từ 718 đánh giá, cách bạn khoảng 0,6 km.', [{ name: 'Gánh - Truly Vietnamese Cuisine', rating: 4.6, reviewCount: 2358, distanceKm: null, hours: null }] as never)
    expect(out).not.toContain('718 đánh giá')
  })
  it('"quán số 2 ở đâu?" — the carried address and phone pass', async () => {
    const out = await followUp('quán số 2 ở đâu?', '**Hàng Dương Quán Quận 1** ở 32–34 Ngô Đức Kế, Bến Nghé, Quận 1. Số điện thoại: 028 3829 1234.')
    expect(out).toContain('32–34 Ngô Đức Kế')
    expect(out).toContain('028 3829 1234')
  })
  it('"quán số 2 mở tới mấy giờ?" — no hours carried for it → an hours claim is not allowed (address/rating are not hours evidence)', async () => {
    const out = await followUp('quán số 2 mở tới mấy giờ?', '**Hàng Dương Quán Quận 1** mở cửa 10:00–22:00.')
    expect(out).not.toMatch(/10:00–22:00/)
  })
  it('card #3 has hours carried → its hours claim is allowed', async () => {
    const out = await followUp('quán số 3 mở tới mấy giờ?', '**Quán Bụi Central** mở cửa 07:00–23:00.')
    expect(out).toContain('07:00–23:00')
  })
  it('a figure no carried row supports is still removed (wrong rating / invented review count)', async () => {
    const out = await followUp('quán số 2 sao?', '**Hàng Dương Quán Quận 1** được 4.9⭐ từ 9.999 đánh giá.')
    expect(out).not.toMatch(/4\.9⭐|9\.999/)
  })
  it('an unrelated older entity gets no authority from the cards', async () => {
    const out = await followUp('quán số 2 sao?', '**Nhà Hàng Ngon** được 4.0⭐ từ 11.434 đánh giá.')
    expect(out).not.toMatch(/11\.434/)
  })
})
