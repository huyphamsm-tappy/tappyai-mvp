import { it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

const line0 = (s: string) => '0:' + JSON.stringify(s)
async function run(lines: string[]): Promise<string> {
  const filtered = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'))
  const out = await new Response(filtered.body).text()
  return out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

const places = [
  { name: 'Bảo tàng Điêu khắc Chăm Đà Nẵng', address: '02 Đ. 2 Tháng 9, Bình Hiên, Hải Châu, Đà Nẵng', rating: 4.2, user_ratings_total: 8223, maps_link: 'https://maps.google.com/?cid=1', place_id: 'A1', place_types: ['museum'] },
  { name: 'Cơm nhà vui', address: '12 Đ. 2 Tháng 9, Hải Châu, Đà Nẵng', rating: 4.5, user_ratings_total: 300, maps_link: 'https://maps.google.com/?cid=2', place_id: 'A2', place_types: ['restaurant'] },
  { name: 'Khách sạn M Hotel', address: '5 Võ Nguyên Giáp, Sơn Trà', rating: 4.8, user_ratings_total: 2862, maps_link: 'https://maps.google.com/?cid=3', place_id: 'A3', place_types: ['hotel'] },
]
const plan = {
  type: 'trip', title: 'Đà Nẵng 3 ngày 2 đêm',
  days: [
    { label: 'Ngày 1', items: [
      { time: '14:00', emoji: '🏨', category: 'hotel', name: 'Khách sạn M Hotel', description: '4.8⭐ (2.862 đánh giá Google Maps) - gần biển, lễ tân mở cửa 24/7, check-in từ 14:00', price: '1.200.000đ/đêm', address: '5 Võ Nguyên Giáp, Sơn Trà', maps_link: 'https://maps.google.com/?cid=3' },
      { time: '19:00', emoji: '🍚', category: 'dinner', name: 'Cơm nhà vui', description: '4.5⭐ - cơm nhà ngon, mở cửa 10:00-21:00, giá khoảng 80.000đ/người', price: 'chưa có giá', address: '12 Đ. 2 Tháng 9, Hải Châu, Đà Nẵng', maps_link: 'https://maps.google.com/?cid=2' },
    ] },
    { label: 'Ngày 3 - Sáng & trưa (Trước khi về)', items: [
      { time: '08:00', emoji: '🎨', category: 'attraction', name: 'Bảo tàng Điêu khắc Chăm Đà Nẵng', description: '4.2⭐ (8.223 đánh giá Google Maps) - Bảo tàng di sản, mở 07:00-17:00, tìm hiểu văn hóa Chăm', price: 'chưa có giá', address: '02 Đ. 2 Tháng 9, Bình Hiên, Hải Châu, Đà Nẵng', maps_link: 'https://maps.google.com/?cid=1' },
    ] },
  ],
  total_cost: '~8.000.000đ',
}

it.each([
  ['plan in the same frame', false],
  ['plan as a separate completion frame', true],
])('%s — the plan JSON survives the whole stream filter', async (_n, split) => {
  const prose = 'Mình sẽ lập kế hoạch cho chuyến đi Đà Nẵng 3 ngày 2 đêm của bạn.\n\nBây giờ mình sẽ lập kế hoạch chi tiết.'
  const block = `\n\n[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]\n`
  const text = await run([
    '9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"Đà Nẵng"}}',
    `a:${JSON.stringify({ toolCallId: 't1', result: { results: places, _tappy_place_domain: 'place' } })}`,
    ...(split ? [line0(prose), line0(block)] : [line0(prose + block)]),
    'd:{"finishReason":"stop"}',
  ])
  const i = text.indexOf('[TAPPY_PLAN]'); const j = text.indexOf('[/TAPPY_PLAN]')

  expect(i).toBeGreaterThan(-1)
  expect(() => JSON.parse(text.slice(i + 12, j))).not.toThrow()
})
