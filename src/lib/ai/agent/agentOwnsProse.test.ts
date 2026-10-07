// @vitest-environment node
// Agent behaviour regression (UAT 2026-10-07): the legacy Consultative "pick + why + one alternative, <= 6 sentences" shape must not be applied
// to what the Agent wrote, and a trip plan must not be forced through a tool. Real stream filter, real prompt text, no network.
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import { AGENT_SYSTEM } from './prompt'
import { plannerNeedsDestination } from './plannerGate'
import { tripDataTool } from './index'

// The previous turn named venues (cards on screen): this is what made the old guard treat the NEXT, unrelated answer as "a card-backed decision".
const CARRIED = [
  { name: 'Mì Cay SEOUL Quận 5', rating: 4.5, reviewCount: 700, distanceKm: 1.2, hours: null },
  { name: 'Đồ Ăn Cay Vịt Mặt Đỏ', rating: 4.4, reviewCount: 300, distanceKm: 2, hours: null },
]

const RECIPE = [
  '**Lẩu cay đơn giản tại nhà** nè:',
  '',
  '1. Phi thơm hành tỏi rồi cho xương hoặc nước dùng vào đun sôi.',
  '2. Thêm khoảng 1,5 lít nước dùng, nêm muối, đường, nước mắm vừa miệng.',
  '3. Cho sa tế và ớt vào, khuấy đều cho tan.',
  '4. Thả cà chua, hành tây vào nấu cho mềm.',
  '5. Nhúng thịt, hải sản và rau vào ăn nóng.',
  'thêm chút rau mùi cho thơm.',
  '6. Ăn kèm bún hoặc mì tươi.',
  '7. Vắt vài lát chanh cho dễ ăn.',
  '8. Trời mưa ăn lẩu là hợp nhất đó.',
].join('\n')

async function turn(agentMode: boolean, userText: string, reply: string, carried = CARRIED): Promise<string> {
  const c = createEnrichmentCollector(userText, ['trời mưa ăn gì', 'cay'])
  if (agentMode) c.agentMode = true
  c.setConsultativeV1({ on: true, rendersCard: true, namedRefetch: [], referenced: [], carried, hardGaps: [], budgetGap: false, budget: null, priorTimes: [] } as never)
  const lines = [`0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}']
  const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, userText, true).body).text()
  return raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('Agent prose is not reshaped by the legacy Consultative guard', () => {
  it('a recipe after a place turn keeps EVERY step (the 07/10 reply lost step 1 and 3 more lines)', async () => {
    const out = await turn(true, 'cách nấu lẩu', RECIPE)
    for (let i = 1; i <= 8; i++) expect(out, `step ${i}`).toContain(`${i}. `)
    expect(out).toContain('thêm chút rau mùi cho thơm.')
    expect(out).toContain('**Lẩu cay đơn giản tại nhà** nè:')
  })
  it('contrast — the LEGACY path keeps its shape (the guard is untouched, only Agent output is exempt)', async () => {
    const out = await turn(false, 'cách nấu lẩu', RECIPE)
    expect(out.length).toBeLessThan(RECIPE.length)
  })
  it('a closing question the Agent chose to ask is not stripped', async () => {
    const reply = 'Mình gợi ý **Mì Cay SEOUL Quận 5** nhé, cay vừa và nóng hổi hợp trời mưa. Bạn ăn được cay cấp mấy?'
    const out = await turn(true, 'cay', reply)
    expect(out).toContain('Bạn ăn được cay cấp mấy?')
  })
})

describe('trip planning is not forced through a tool', () => {
  it('the Agent prompt tells the model to plan directly when the plan is general and the destination known', () => {
    expect(AGENT_SYSTEM).toMatch(/lập thẳng, KHÔNG gọi công cụ/)
    expect(AGENT_SYSTEM).toMatch(/Thiếu điểm đến thì hỏi MỘT câu ngắn, không gọi công cụ/)
  })
  it('get_trip_data is for specific hotels / places / prices / hours only (not "any plan")', () => {
    const t = tripDataTool({}, () => undefined) as unknown as { description: string }
    expect(t.description).toMatch(/CỤ THỂ/)
    expect(t.description).not.toMatch(/Dùng cho "đi X N ngày"/)
  })
  it('a direct plan is written as text (the [TAPPY_PLAN] block holds only tool-verified venues; planItemGuard drops any other stop)', () => {
    expect(AGENT_SYSTEM).not.toMatch(/sau khi có dữ liệu, LUÔN viết khối/)
    expect(AGENT_SYSTEM).toMatch(/VĂN BẢN theo Ngày 1\/2\/3[^.]*KHÔNG dùng khối \[TAPPY_PLAN\]/)
    expect(AGENT_SYSTEM).toMatch(/Nếu đã gọi get_trip_data thì viết khối/)
  })
  it('the destination comes from the conversation, never from GPS', () => {
    expect(AGENT_SYSTEM).toMatch(/vị trí GPS KHÔNG phải điểm đến/)
  })
  it('generic suggestion questions are answered directly (no tool) unless a concrete place is wanted', () => {
    expect(AGENT_SYSTEM).toMatch(/KHÔNG gọi công cụ\. Chỉ tìm khi họ muốn quán/)
  })
})

describe('plannerGate: activity words are not a destination', () => {
  it.each([
    'lập kế hoạch ăn chơi nhảy múa 3 ngày 2 đêm',
    'lên kế hoạch ăn uống vui chơi giải trí 2 ngày 1 đêm',
    'lập kế hoạch ăn chơi nhảy múa cuối tuần cho 4 người',
  ])('asks for a destination: %s', t => expect(plannerNeedsDestination([t])).toBe(true))
  it('a destination named earlier in the thread is reused (no question)', () => {
    expect(plannerNeedsDestination(['đi Đà Nẵng nên ăn gì', 'lập kế hoạch ăn chơi nhảy múa 3 ngày 2 đêm'])).toBe(false)
    expect(plannerNeedsDestination(['lập kế hoạch ăn chơi nhảy múa 3 ngày 2 đêm'], { diem_den: 'Đà Lạt' })).toBe(false)
  })
  it('a plan that names its destination is never questioned', () => {
    expect(plannerNeedsDestination(['lập kế hoạch ăn chơi nhảy múa 3 ngày 2 đêm ở Đà Lạt'])).toBe(false)
    expect(plannerNeedsDestination(['lập kế hoạch ăn chơi ở Sài Gòn 3 ngày 2 đêm'])).toBe(false)
  })
})

// ── the legacy "pick backstop" does not write a sentence on top of the Agent's answer ─────────────────────────────────────────────
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import type { ConsultativeV1Context } from '@/lib/ai/toolResultSplit'

const ROWS = [
  { place_id: 'p1', name: 'KÉN SKYBAR', address: 'Quận 1', google_rating: '⭐ 4.9 (139 đánh giá)', rating_value: 4.9, rating_count: 139, maps_link: 'https://maps.google.com/?cid=1', amenity: 'bar', opening_hours: '17:30–02:00' },
  { place_id: 'p2', name: 'D-Rave Club SGN', address: 'Quận 1', google_rating: '⭐ 4.3 (300 đánh giá)', rating_value: 4.3, rating_count: 300, maps_link: 'https://maps.google.com/?cid=2', amenity: 'night_club' },
]
const V1: ConsultativeV1Context = { on: true, rendersCard: true, namedRefetch: [], carried: [], hardGaps: [], budgetGap: false }
async function backstop(agentMode: boolean, reply: string): Promise<string> {
  const user = 'ăn chơi nhảy múa xong đi đâu'
  const c = createEnrichmentCollector(user)
  if (agentMode) c.agentMode = true
  c.setConsultativeV1(V1)
  c.setPlacesRecommendations(placeRecommendations({ results: ROWS }, 'Quận 1', { name: 'KÉN SKYBAR', reasons: [{ attribute: 'rating', evidence: 'rated 4.9', params: { value: 4.9 } }], tradeOff: null }), 'entertainment')
  const lines = ['9:{"toolCallId":"t1","toolName":"search_places","args":{}}', `a:{"toolCallId":"t1","result":${JSON.stringify({ results: ROWS, place_search_status: 'has_results' })}}`, `0:${JSON.stringify(reply)}`, 'd:{"finishReason":"stop"}']
  const raw = await new Response(applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'), 'vi', c, undefined, undefined, undefined, false, user, true).body).text()
  return raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}
describe('the pick backstop is a legacy template, not part of the Agent', () => {
  // The model's pick sentence carries claims the rows do not support (hours, price, rating): the claim guards remove it.
  const REPLY = 'Mình chọn **KÉN SKYBAR** — mở cửa 10:00–23:00, giá 50.000đ, 5.0⭐ từ 900 đánh giá. Nếu muốn nhảy tiếp thì ghé **D-Rave Club SGN**, mở đến 4:00 sáng.'
  it('legacy path: the code rewrites the removed pick as "Mình chọn **X** — 4.9⭐ (N đánh giá Google Maps); giờ mở cửa theo Google Maps…"', async () => {
    const out = await backstop(false, REPLY)
    expect(out).toContain('Mình chọn **KÉN SKYBAR** — 4.9⭐ (139 đánh giá Google Maps)')
  })
  it('Agent: the claim guards still remove the unsupported claims, but no templated pick sentence is written on top', async () => {
    const out = await backstop(true, REPLY)
    expect(out).not.toMatch(/Mình chọn/)
    expect(out).not.toMatch(/đánh giá Google Maps/)
    expect(out).not.toMatch(/50\.000đ|5\.0⭐|10:00–23:00/) // the unsupported claims are still gone
    expect(out).toContain('D-Rave Club SGN')
  })
})
