// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'
import { placesRenderOrder, readPlacesLiveView, type PlacesLiveView } from '@/lib/recommendation/liveView'
import { footerRemaining, placesFoldCounts } from './cardCounts'
import { consultRemainingLineN } from './consultative/consultBrain'

// ─────────────────────────────────────────────────────────────────────────────
// A3 (owner 2026-10-02): the three numbers on one screen — the chip «Tất cả (N)», the cards on the fold and the text «Còn N lựa chọn
// nữa» — come from ONE card set. Measured BEFORE (local, hotel turn «Đà Lạt · 2N1Đ · 2 người · 1-2tr»): chip 8, fold 3, text «Còn 18 lựa chọn
// nữa» (26 hotel rows − the names the reply bolds). Driven through the real stream filter, the same entry point the route uses.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => { vi.unstubAllEnvs() })
const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'
const row = (name: string, i: number) => ({
  place_id: `g-${i}`, name, address: `${10 + i} Trần Hưng Đạo, Đà Lạt`, rating_value: 4 + i / 20, rating_count: 100 + i,
  maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}`, text_ranked: true,
})
const NAMES = ['MerPerle Dalat Hotel', 'Colline Dalat', 'Ana Mandara Villas', 'Dalat Palace', 'Sunrise Hotel', 'Hotel Colline', 'Terracotta Resort', 'Edensee Lake Resort']
const THUMB = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3vFr0m2QeW2oQ1y6hD6x7nG5pZtq2s8L1Qw&s=10'

/** The model's reply as it really comes: a pick, one runner-up, its own wrong count, a thumbnail it copied from the tool result. */
const PROSE = [
  `**Mình chọn: MerPerle Dalat Hotel** vì điểm đánh giá cao.`,
  `![MerPerle Dalat Hotel](${THUMB})`,
  `Ảnh khách sạn: ${THUMB}`,
  `- **Colline Dalat**: nhiều đánh giá Google Maps.`,
  `Mình còn 18 lựa chọn nữa, muốn xem thêm không?`,
  `[FOLLOWUPS]Xem thêm|Lên kế hoạch chi tiết[/FOLLOWUPS]`,
].join('\n')

async function turn(prose: string, opts: { names?: string[]; consult?: boolean; surface?: string; shopping?: string; appendix?: { text: string; links: Array<{ name: string; url: string }> }; domain?: string } = {}) {
  const names = opts.names ?? NAMES
  const collector = createEnrichmentCollector()
  if (names.length) {
    const result = { source: 'serper_maps', count: names.length, results: names.map(row), _tappy_place_domain: opts.domain ?? 'travel' }
    collector.add(result.results)
    collector.setPlacesRecommendations(placeRecommendations(result, 'Đà Lạt'), producerSubject('search_places', 'travel'))
  }
  collector.setRendersDecisionCard(rendersDecisionCard(opts.surface ?? 'web'))
  if (opts.consult !== false) { collector.setConsultTurn('pick'); collector.setConsultButtons(['Xem thêm', 'Lên kế hoạch chi tiết']) }
  if (opts.shopping) collector.setShoppingMarker(opts.shopping)
  if (opts.appendix) collector.setAppendix(opts.appendix)
  const res = applyPlaceEnrichmentStreamFilter(
    new Response([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"khách sạn Đà Lạt"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: { results: [] } }),
      line0(prose),
      END,
    ].join('\n') + '\n'),
    'vi', collector,
  )
  const out = await new Response(res.body).text()
  const text = out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const annotations = out.split('\n').filter(l => l.startsWith('8:')).map(l => JSON.parse(l.slice(2)) as unknown[]).flat() as PlacesLiveView[]
  const view = readPlacesLiveView(annotations)
  return { text, view }
}
const remainingNumbers = (t: string) => [...t.matchAll(/(?:Mình\s+)?[Cc]òn\s+(\d+)\s+lựa chọn/g)].map(m => Number(m[1]))

describe('A3 — «Còn N lựa chọn nữa» = the cards behind «Xem thêm», chip total = fold + N', () => {
  it('places: N is items − fold, not search rows − bold names', async () => {
    const { text, view } = await turn(PROSE)
    expect(view).toBeTruthy()
    const c = placesFoldCounts(view)
    expect(c.total).toBe(8)
    expect(c.shown).toBe(3)
    expect(c.hidden).toBe(5)
    expect(c.total).toBe(c.shown + c.hidden)
    expect(remainingNumbers(text)).toEqual([5])
    expect(footerRemaining(view)).toBe(5)
    // …and it is exactly what the client renders as «Xem thêm 5 chỗ»
    expect(placesRenderOrder(view!).hidden.length).toBe(5)
  })

  it('the Luna-6 wording carries the same N', async () => {
    vi.stubEnv('STYLE_LUNA6', '1')
    const { text } = await turn(PROSE)
    expect(text).toMatch(/Còn 5 lựa chọn nữa — bạn muốn xem thêm không\?/)
    expect(remainingNumbers(text)).toEqual([5])
  })

  it('the line sits BEFORE the follow-up block even when the model wrote the block on the same line as its last sentence', async () => {
    const { text } = await turn('**Mình chọn: MerPerle Dalat Hotel** vì điểm đánh giá cao.[FOLLOWUPS]Xem thêm[/FOLLOWUPS]')
    expect(text.indexOf('lựa chọn nữa')).toBeGreaterThan(-1)
    expect(text.indexOf('lựa chọn nữa')).toBeLessThan(text.indexOf('[FOLLOWUPS]'))
  })

  it('fewer rows than the fold (2 rows): everything is on screen, so there is NO footer', async () => {
    const { text, view } = await turn(PROSE, { names: NAMES.slice(0, 2) })
    expect(placesFoldCounts(view).hidden).toBe(0)
    expect(remainingNumbers(text)).toEqual([])
  })

  it('no card at all (no rows): the model\'s own «Còn N» line is removed, none is added', async () => {
    const { text, view } = await turn(PROSE, { names: [] })
    expect(view).toBeNull()
    expect(remainingNumbers(text)).toEqual([])
  })

  it('shopping: every product is a card, so nothing is left to offer — the model\'s «Còn 3» (6 cards, 3 bold names) is removed', async () => {
    const marker = '[TAPPY_SHOPPING]{"v":1,"entities":[' + Array.from({ length: 6 }, (_, i) => `{"key":"e${i}","config":"","name":"Kính cường lực iPhone 17 mẫu ${i}","offers":[]}`).join(',') + ']}[/TAPPY_SHOPPING]'
    const { text } = await turn('**Mình chọn: Kính cường lực iPhone 17 mẫu 0** vì đúng đời máy.\nMình còn 3 lựa chọn nữa, muốn xem thêm không?', { names: [], shopping: marker })
    expect(remainingNumbers(text)).toEqual([])
  })

  it('consultRemainingLineN adds nothing for n = 0, and never doubles the model line', () => {
    expect(consultRemainingLineN('Mình chọn A.\n\nCòn 6 lựa chọn khác nữa, muốn xem thêm không?', 0, 'vi')).toBe('Mình chọn A.')
    const out = consultRemainingLineN('Mình chọn A.\n\nCòn 6 lựa chọn khác nữa, muốn xem thêm không?', 4, 'vi')
    expect(remainingNumbers(out)).toEqual([4])
  })
})

describe('A3 — no picture or photo address written by the model survives (real captured shape)', () => {
  it('web: the copied thumbnail, as an image and as a bare address, is gone; the pick and the venue name stay', async () => {
    const { text } = await turn(PROSE)
    expect(text).not.toMatch(/gstatic\.com|tbn:|!\[/)
    expect(text).toContain('Mình chọn: MerPerle Dalat Hotel')
    expect(text).toContain('Colline Dalat')
  })

  it('a client without cards (Android) is not given the model\'s pictures either; its own injected photo path is separate', async () => {
    const { text } = await turn(PROSE, { surface: 'android' })
    expect(text).not.toMatch(/gstatic\.com|tbn:/)
  })
})

describe('A3 — the code-built block for «only another model found» rides before the markers', () => {
  it('appendix is inserted after the prose, before [FOLLOWUPS]', async () => {
    const { text } = await turn('Mình chỉ thấy iPhone 15 Pro Max.\n[FOLLOWUPS]Xem thêm[/FOLLOWUPS]', { names: [], appendix: { text: 'Bạn tìm trên:', links: [{ name: 'Shopee', url: 'https://shopee.vn/search?keyword=x' }] } })
    expect(text).toContain('- [Shopee](https://shopee.vn/search?keyword=x)')
    expect(text.indexOf('shopee.vn')).toBeGreaterThan(text.indexOf('iPhone 15 Pro Max'))
    expect(text.indexOf('shopee.vn')).toBeLessThan(text.indexOf('[FOLLOWUPS]'))
  })
})
