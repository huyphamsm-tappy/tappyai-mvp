import { describe, it, expect, vi } from 'vitest'

// Phase 7 path (Luna off / the claude rollback) — see pickBackstop.test.ts.
vi.stubEnv('CONSULT_LUNA', '0')
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// UAT §10 SHOP-2 t4 (30/09, level B): "Hạt A … hay Quà Tặng 3 Gói …?" — the compare searched again, the model wrote no
// pick line, and the code supplied "**Mình chọn: <the new card's recommendation>**" — a THIRD product. A compare turn
// never takes its pick sentence from a card; a pick turn still does.
const line0 = (s: string) => '0:' + JSON.stringify(s)
const VIEW = {
  v: 1,
  entities: [{ key: 'x', name: 'Set quà tặng phụ kiện thời trang cho nam 5 món cao cấp và sang trọng', config: '', matchesRequest: 'chua_ro', recommended: true, priceLow: 399000, priceHigh: 399000, offers: [] }],
  recommendation: { entityKey: 'x', reasons: [] },
}
const MARKER = `[TAPPY_SHOPPING]${JSON.stringify(VIEW)}[/TAPPY_SHOPPING]`
const TURN = [
  '9:{"toolCallId":"t1","toolName":"search_products","args":{"query":"quà tặng sếp cà phê"}}',
  'a:{"toolCallId":"t1","result":{"search_results":[{"title":"Set quà tặng phụ kiện thời trang cho nam 5 món cao cấp và sang trọng","price":"399.000đ","link":"https://shop.example/set"}]}}',
  line0('Mình so sánh hai cái cho bạn: Hộp quà Hạt A là bộ 3 loại cà phê hòa tan, hợp sếp thích cà phê. Quà 3 gói rẻ hơn nhưng ít đánh giá.'),
  'd:{"finishReason":"stop"}',
]

async function run(turn: 'compare' | 'pick') {
  const c = createEnrichmentCollector()
  c.setConsultTurn(turn, turn === 'compare' ? ['Hộp quà tặng cao cấp Hạt A Cafe Premium Gift Box Coffee', 'Quà Tặng 3 Gói Cà Phê Bất Kỳ'] : [], {})
  c.setConsultButtons(['Xem thêm', 'Lên kế hoạch chi tiết'])
  c.setShoppingMarker(MARKER)
  const res = applyPlaceEnrichmentStreamFilter(new Response(TURN.join('\n') + '\n'), 'vi', c)
  const out = await new Response(res.body).text()
  return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('pick sentence fallback from the card', () => {
  it('a compare turn never gets "Mình chọn: <third product>" written in', async () => {
    expect(await run('compare')).not.toContain('Mình chọn: Set quà tặng phụ kiện thời trang')
  })
  it('a pick turn still states the card\'s pick (text = card)', async () => {
    expect(await run('pick')).toContain('Mình chọn: Set quà tặng phụ kiện thời trang')
  })
})
