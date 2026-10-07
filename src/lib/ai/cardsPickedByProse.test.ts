// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from './decisionSurface'
import { placesRenderOrder, readPlacesLiveView, type PlacesLiveView } from '@/lib/recommendation/liveView'

// ─────────────────────────────────────────────────────────────────────────────
// THE THREE CARDS ARE THE VENUES THE REPLY NAMED — under the PROVIDER'S spelling.
//
// Android E2E turn 3 (Pixel_8_uat, 2026-09-19, "quan 1" after "dưới 100k/người"):
// the reply picked **Béo Ơi Quán** and offered **Bánh Ướt Ban Mê Giang Vương** and
// **A Tùng Bánh mì bò nướng**; the rows were named "Béo Ơi Quán - Món ngon Hà
// Nội", "Bánh Ướt Ban Mê Giang Vương - Tôn Thất Tùng", "A Tùng Bánh mì bò nướng
// bơ Campuchia". `pickedRecs` tested "does the prose contain the WHOLE row name"
// — it never does when the model writes the head — logged named_in_prose 0, and
// filled the fold from the engine's order: card #1 was "Quán ăn ngon Sài Gòn"
// (200–300k, never mentioned) while the pick sat at #2. This drives the real
// stream filter with that shape and reads the `picked` ids the clients render
// first (web `placesRenderOrder`, Android `renderOrder`).
// ─────────────────────────────────────────────────────────────────────────────

const line0 = (s: string) => '0:' + JSON.stringify(s)
const END = 'd:{"finishReason":"stop"}'

const row = (name: string, i: number) => ({
  place_id: `g-${i}`,
  name,
  address: `${10 + i} Nguyễn Trãi, Quận 1`,
  // Place rows carry `rating_value` / `rating_count` (buildEntity.ts); the value differs per row so a
  // reason can be traced to the venue it was built from.
  rating_value: 4 + i / 10,
  rating_count: 100 + i,
  maps_link: `https://www.google.com/maps?q=${encodeURIComponent(name)}`,
  text_ranked: true,
})

/** Provider order, as the /maps tool returned it — the pick is NOT row 0. */
const NAMES = [
  'Quán ăn ngon Sài Gòn',
  'Béo Ơi Quán - Món ngon Hà Nội',
  'Cơm Tấm Ba Ghiền',
  'Bánh Ướt Ban Mê Giang Vương - Tôn Thất Tùng',
  'Ốc Đào',
  'A Tùng Bánh mì bò nướng bơ Campuchia',
  'Bún Thịt Nướng Chị Tuyền',
  'A Mà Kitchen',
]

const PROSE = [
  'Ăn trưa dưới 100k ở Quận 1 thì mình chọn **Béo Ơi Quán** (4.3⭐, 50–100k): bún chả và phở Hà Nội đúng vị, mở 7:00–21:00.',
  '',
  'Nếu muốn thay thế: **Bánh Ướt Ban Mê Giang Vương** (4.4⭐, 100–200k) cũng ngon, hoặc **A Tùng Bánh mì bò nướng** (4.2⭐, dưới 100k) nếu muốn ăn nhẹ.',
].join('\n')

async function turn(prose: string, names = NAMES, enginePick?: { name: string; reasons: { attribute: string; evidence: string }[] }) {
  const result = { source: 'serper_maps', count: names.length, results: names.map(row), _tappy_place_domain: 'food' }
  const collector = createEnrichmentCollector()
  collector.add(result.results)
  collector.setPlacesRecommendations(placeRecommendations(result, 'TP HCM', enginePick), producerSubject('search_places', 'food'))
  collector.setRendersDecisionCard(rendersDecisionCard('android'))
  const res = applyPlaceEnrichmentStreamFilter(
    new Response([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"quán ăn ngon","location":"Quận 1"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result }),
      line0(prose),
      END,
    ].join('\n') + '\n'),
    'vi', collector,
  )
  const out = await new Response(res.body).text()
  const annotations = out.split('\n').filter(l => l.startsWith('8:')).map(l => JSON.parse(l.slice(2)) as unknown[]).flat() as PlacesLiveView[]
  // A1(a): the turn carries the preliminary set first; the decision is the LAST place frame.
  const view = readPlacesLiveView(annotations)!
  const nameOf = (id: string) => view.items.find(i => i.id === id)?.name
  return { view, picked: (view.picked ?? []).map(nameOf), aboveFold: placesRenderOrder(view).visible.map(i => i.name) }
}

const ENGINE_PICK = { name: 'Quán ăn ngon Sài Gòn', reasons: [{ attribute: 'rating', evidence: 'rated 4.9' }, { attribute: 'reviewCount', evidence: '1152 reviews' }] }
const reasonsOf = (view: PlacesLiveView, name: string) => (view.items.find(i => i.name === name)?.reasons ?? []).map(r => r.evidence)
const withReasons = (view: PlacesLiveView) => view.items.filter(i => (i.reasons ?? []).length > 0).map(i => i.name)

describe('B.2 — "Vì sao" follows the same pick as card #1, never the engine pick', () => {
  it('🚨 engine pick ≠ model pick: the explanation moves to the model pick, built from its own row; the engine venue keeps none', async () => {
    const { view, aboveFold } = await turn(PROSE, NAMES, ENGINE_PICK)
    expect(aboveFold[0]).toBe('Béo Ơi Quán - Món ngon Hà Nội')
    expect(withReasons(view)).toEqual(['Béo Ơi Quán - Món ngon Hà Nội'])
    // Its OWN values (row 1: rating_value 4.1, rating_count 101), never the engine venue's "rated 4.9".
    expect(reasonsOf(view, 'Béo Ơi Quán - Món ngon Hà Nội')).toEqual(['rated 4.1', '101 reviews'])
    expect(reasonsOf(view, 'Quán ăn ngon Sài Gòn')).toEqual([])
  })

  it('engine pick = model pick: unchanged', async () => {
    const { view } = await turn('Mình chọn **Quán ăn ngon Sài Gòn** — đông khách, mở cả ngày.', NAMES, ENGINE_PICK)
    expect(withReasons(view)).toEqual(['Quán ăn ngon Sài Gòn'])
    expect(reasonsOf(view, 'Quán ăn ngon Sài Gòn')).toEqual(['rated 4.9', '1152 reviews'])
  })

  it('no model pick (nothing matched): NO card carries an explanation, and it is logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { view } = await turn('Mình chọn **Quán Bà Sáu Chợ Lớn** — cơm tấm sườn bì.', NAMES, ENGINE_PICK)
      expect(withReasons(view)).toEqual([])
      expect(err.mock.calls.some(c => String(c[0]).includes('emphasis_dropped_no_model_pick'))).toBe(true)
    } finally { err.mockRestore() }
  })
})

describe('the cards above the fold are the venues the reply named', () => {
  it('🚨 THE ANDROID TURN-3 DEFECT: a compound row name shortened to its head is still "named"', async () => {
    const { picked, aboveFold, view } = await turn(PROSE)
    expect(view.shown).toBe(3)
    // Pick first, then the two alternatives — in prose order, under the provider's full names.
    expect(picked).toEqual([
      'Béo Ơi Quán - Món ngon Hà Nội',
      'Bánh Ướt Ban Mê Giang Vương - Tôn Thất Tùng',
      'A Tùng Bánh mì bò nướng bơ Campuchia',
    ])
    expect(aboveFold).toEqual(picked)
    // The row the reply never mentioned is behind "Xem thêm", not card #1.
    expect(aboveFold).not.toContain('Quán ăn ngon Sài Gòn')
    // `items` keeps the engine's (ranker's) order — the documented contract the clients reorder
    // from; with distinct ratings that is not the provider order, but it is the same set.
    expect([...view.items.map(i => i.name)].sort()).toEqual([...NAMES].sort())
  })

  it('a whole-name mention still works exactly as before', async () => {
    const { picked, aboveFold } = await turn('Mình chọn **Ốc Đào** (4.5⭐) — ốc tươi, giá mềm. Thay thế: **Cơm Tấm Ba Ghiền**.')
    expect(picked).toEqual(['Ốc Đào', 'Cơm Tấm Ba Ghiền'])
    expect(aboveFold).toEqual(['Ốc Đào', 'Cơm Tấm Ba Ghiền', 'Quán ăn ngon Sài Gòn'])
  })

  it('names the reply did not mention fill the fold from the engine order — but are NEVER in `picked`', async () => {
    const { picked, aboveFold, view } = await turn('Mình chọn **A Mà Kitchen** — món Hoa, sạch sẽ.')
    // A.4: `picked` is the model's, and only the model's. The two fill cards come from `items` order
    // at the client; they are not presented as picks.
    expect(picked).toEqual(['A Mà Kitchen'])
    expect(aboveFold).toHaveLength(3)
    expect(aboveFold[0]).toBe('A Mà Kitchen')
    expect(view.pickUnmatched).toBeUndefined()
  })

  it('🚨 A.4: the reply names venues and none matches a row ⇒ an ERROR is logged and the payload says so — never a silent engine order', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { picked, view } = await turn('Mình chọn **Quán Bà Sáu Chợ Lớn** — cơm tấm sườn bì, 45k. Thay thế: **Hủ Tiếu Mực Ông Già**.')
      expect(picked).toEqual([])
      expect(view.pickUnmatched).toBe(true)
      const line = err.mock.calls.map(c => String(c[0])).find(l => l.includes('tappyai_cards_error'))
      expect(line).toBeTruthy()
      const parsed = JSON.parse(line!)
      expect(parsed.reason).toBe('pick_unmatched')
      expect(parsed.headers).toContain('quan ba sau cho lon')
    } finally { err.mockRestore() }
  })

  it('a reply that names no venue at all is not that error (nothing to match)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { picked, view } = await turn('Mình chưa xác nhận được quán nào mở sau 22h từ dữ liệu hiện có.')
      expect(picked).toEqual([])
      expect(view.pickUnmatched).toBeUndefined()
      expect(err.mock.calls.some(c => String(c[0]).includes('tappyai_cards_error'))).toBe(false)
    } finally { err.mockRestore() }
  })

  it('an ambiguous head is refused, not guessed: two rows sharing a head do not both claim the mention', async () => {
    const names = ['Phở Hòa - Pasteur', 'Phở Hòa - Nguyễn Trãi', 'Bún Bò Huế Cô Ba']
    const { picked } = await turn('Mình chọn **Phở Hòa** — nước dùng trong, mở sớm. Thay thế: **Bún Bò Huế Cô Ba**.', names)
    // "Phở Hòa" fits both rows equally: neither may be the pick by that header alone; the
    // unambiguous alternative is named, and the fold fills from the engine's order.
    expect(picked).toEqual(['Bún Bò Huế Cô Ba'])
  })
})
