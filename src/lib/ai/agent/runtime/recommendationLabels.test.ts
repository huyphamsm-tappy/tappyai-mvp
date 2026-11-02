// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyRankingToShoppingMarker, applyRankingToRecs, withoutRecommendation } from './rankingContract'
import { renderShoppingMarker, parseShoppingMarker, type SynthesisView } from '@/lib/ai/consultative/synthesisView'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import type { Recommendation } from '@/lib/recommendation/recommendation'

// Owner decision 2026-10-09: "do not mark a product NÊN CHỌN when the response says there is insufficient evidence to conclude".
// UAT-10: the card said NÊN CHỌN (the ENGINE's pick) while the text said "mình chưa thể kết luận". In the agent runtime the engine's
// pick is not Luna's decision: a crowned card needs Luna's own ranking at more than low confidence.

const VIEW = { v: 1, entities: ['iPhone 17 Pro Max', 'Galaxy S26 Ultra'].map((n, i) => ({ key: `k${i}`, name: n, config: '', matchesRequest: 'chua_ro', recommended: i === 0, priceLow: 1, priceHigh: 1, image: null, offers: [] })), recommendation: { entityKey: 'k0', seller: null, reasons: [{ attribute: 'rating', evidence: 'rated 4.9' }], tradeOff: null, conditional: false } } as never as SynthesisView
const marker = () => renderShoppingMarker(VIEW)
const crowned = (m: string) => { const v = parseShoppingMarker(m).view!; return { recommended: v.entities.filter(e => e.recommended).map(e => e.name), recommendation: v.recommendation } }
const pick = (confidence: string | null) => ({ picks: [{ name: 'Galaxy S26 Ultra', why: 'pin ổn định hơn', tradeoff: null, fits: null, refs: [] }, { name: 'iPhone 17 Pro Max', why: null, tradeoff: null, fits: null, refs: [] }], none: false, confidence: confidence as 'high' | 'medium' | 'low' | null })

describe('labels follow Luna\'s ranking and its confidence', () => {
  it('sanity: the engine marker is crowned (this is what UAT-10 showed)', () => {
    expect(crowned(marker())).toMatchObject({ recommended: ['iPhone 17 Pro Max'] })
    expect(crowned(marker()).recommendation).not.toBeNull()
  })
  it('withoutRecommendation: nobody crowned, no recommendation block, entities and order kept; a marker that does not parse is returned as is', () => {
    const m = withoutRecommendation(marker())
    expect(crowned(m)).toEqual({ recommended: [], recommendation: null })
    expect(parseShoppingMarker(m).view!.entities.map(e => e.name)).toEqual(['iPhone 17 Pro Max', 'Galaxy S26 Ultra'])
    expect(withoutRecommendation('not a marker')).toBe('not a marker')
  })
  it('a ranking at medium/high confidence crowns Luna\'s first pick; LOW confidence orders the cards but crowns none', () => {
    for (const c of ['high', 'medium', null]) expect(crowned(applyRankingToShoppingMarker(marker(), pick(c)).marker!), String(c)).toMatchObject({ recommended: ['Galaxy S26 Ultra'] })
    const low = applyRankingToShoppingMarker(marker(), pick('low'))
    expect(low.applied).toBe(true)
    expect(crowned(low.marker!)).toEqual({ recommended: [], recommendation: null })
    expect(parseShoppingMarker(low.marker!).view!.entities.map(e => e.name)).toEqual(['Galaxy S26 Ultra', 'iPhone 17 Pro Max']) // Luna's order is kept
  })
  it('place cards: the same rule (low confidence → no recommended card, order kept)', () => {
    const recs = ['Quán A', 'Quán B'].map(n => ({ entity: { id: n, identity: { name: n } }, recommended: false, reasons: [], tradeOff: null }) as unknown as Recommendation)
    const hi = applyRankingToRecs(recs, { picks: [{ name: 'Quán B', why: 'gần hơn', tradeoff: null, fits: null, refs: [] }], none: false, confidence: 'high' })!
    expect(hi.items[0].recommended).toBe(true)
    const low = applyRankingToRecs(recs, { picks: [{ name: 'Quán B', why: 'gần hơn', tradeoff: null, fits: null, refs: [] }], none: false, confidence: 'low' })!
    expect(low.items.map(r => [r.entity.identity.name, r.recommended])).toEqual([['Quán B', false]])
  })
})

describe('settle path (agent runtime): the delivered card matches the evidence the reply gives', () => {
  async function deliver(reply: string) {
    const c = createEnrichmentCollector('so sánh hai mẫu điện thoại', [])
    c.agentMode = true
    c.semanticRanking = true
    c.setShoppingMarker(marker())
    const frames = [
      `9:${JSON.stringify({ toolCallId: 'sp', toolName: 'search_products', args: { query: 'điện thoại' } })}`,
      `a:${JSON.stringify({ toolCallId: 'sp', result: { search_results: [] } })}`,
      `0:${JSON.stringify(reply)}`,
      'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, 'so sánh hai mẫu điện thoại', false)
    const out = (await new Response(res.body).text()).split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    const i = out.indexOf('[TAPPY_SHOPPING]')
    return { out, card: i >= 0 ? crowned(out.slice(i)) : null }
  }
  const rank = (confidence: string) => `[TAPPY_RANK]{"picks":[{"name":"Galaxy S26 Ultra","why":"pin ổn định hơn"},{"name":"iPhone 17 Pro Max"}],"none":false,"confidence":"${confidence}"}[/TAPPY_RANK]`

  it('the UAT-10 shape — a reply that cannot conclude and carries NO ranking: the card is shown WITHOUT a crowned option', async () => {
    const r = await deliver('Mình chưa thể kết luận mẫu nào hơn ở ba ưu tiên của bạn; hãy đối chiếu bài đánh giá độc lập.')
    expect(r.card).toEqual({ recommended: [], recommendation: null })
    expect(r.out).toContain('chưa thể kết luận')
  })
  it('Luna ranks at high confidence → its first pick is crowned', async () => {
    const r = await deliver(`Mình nghiêng về **Galaxy S26 Ultra** vì pin ổn định hơn.\n\n${rank('high')}`)
    expect(r.card).toMatchObject({ recommended: ['Galaxy S26 Ultra'] })
  })
  it('Luna ranks but says LOW confidence → nobody is crowned', async () => {
    const r = await deliver(`Mình chưa chắc, tạm xếp **Galaxy S26 Ultra** trước.\n\n${rank('low')}`)
    expect(r.card).toEqual({ recommended: [], recommendation: null })
  })
})
