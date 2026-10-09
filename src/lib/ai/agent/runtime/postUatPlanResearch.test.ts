// @vitest-environment node
// Phase 8 POST-UAT (2026-10-09) · Fix groups 5 + 6 — card relevance (B5), source attribution (B6), clarification (B7),
// trip-data timeout / plan reliability (B8). Deterministic: scripted tools, fake timers, no network, no model.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { tripDataTool, TRIP_PART_TIMEOUT_MS } from '../index'
import { toolStateOf } from './toolState'
import { editorialItemsIn, attributeEditorial } from './editorialSources'
import { AGENT_SYSTEM_V2 } from './prompt'
import { applyPlaceEnrichmentStreamFilter } from '@/lib/ai/streamEnrichment'
import { createEnrichmentCollector } from '@/lib/ai/toolResultSplit'
import { placeRecommendations } from '@/lib/recommendation/fromToolResult'
import { producerSubject } from '@/lib/recommendation/slotAdmission'
import { rendersDecisionCard } from '@/lib/ai/decisionSurface'
import { readPlacesLiveView } from '@/lib/recommendation/liveView'

afterEach(() => { vi.useRealTimers() })

// ── B8 · trip data ────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Exec = (a: Record<string, unknown>) => Promise<unknown>
const toolOf = (fn: Exec) => ({ execute: fn }) as never
const ctx = { toolCallId: 't', messages: [] }

describe('POST-UAT B8 · one slow part no longer loses the whole trip bundle', () => {
  it('hotels hang → sights and food are returned and emitted; hotels is TIMEOUT (not "none"); the bundle answers inside the tool timeout', async () => {
    vi.useFakeTimers()
    const emitted: string[] = []
    const t = tripDataTool({
      get_hotel_prices: toolOf(() => new Promise(() => { /* Serper out of credits: never answers */ })),
      search_places: toolOf(async a => ({ results: [{ name: String(a.type) === 'attraction' ? 'Dinh Độc Lập' : 'Cơm Tấm Ba Ghiền' }] })),
    }, (name, args) => emitted.push(`${name}:${String(args.type ?? '')}`))
    const p = (t as unknown as { execute: (a: unknown, c: unknown) => Promise<Record<string, any>> }).execute({ destination: 'TP.HCM' }, ctx)
    await vi.advanceTimersByTimeAsync(TRIP_PART_TIMEOUT_MS + 10)
    const r = await p
    expect(TRIP_PART_TIMEOUT_MS).toBeLessThan(15_000)
    expect(r.hotels).toMatchObject({ tool_state: 'TIMEOUT' })
    expect(r.attractions.results[0].name).toBe('Dinh Độc Lập')
    expect(r.food.results[0].name).toBe('Cơm Tấm Ba Ghiền')
    expect(r.parts_missing).toEqual(['hotels'])
    expect(r.parts_note).toMatch(/không điền từ trí nhớ/)
    expect(emitted).toEqual(['search_places:attraction', 'search_places:restaurant'])
    expect(toolStateOf('ok', r)).toBe('SUCCESS')
  })
  it('every part times out → the bundle is TIMEOUT (a failure is not an empty plan)', async () => {
    vi.useFakeTimers()
    const hang = toolOf(() => new Promise(() => {}))
    const t = tripDataTool({ get_hotel_prices: hang, search_places: hang }, () => {})
    const p = (t as unknown as { execute: (a: unknown, c: unknown) => Promise<Record<string, any>> }).execute({ destination: 'TP.HCM' }, ctx)
    await vi.advanceTimersByTimeAsync(TRIP_PART_TIMEOUT_MS + 10)
    const r = await p
    expect(r.error).toBe('parts_timeout')
    expect(toolStateOf('ok', r)).toBe('TIMEOUT')
  })
  it('a part that throws is ERROR; the others still arrive', async () => {
    const t = tripDataTool({ get_hotel_prices: toolOf(async () => { throw new Error('402') }), search_places: toolOf(async () => ({ results: [{ name: 'x' }] })) }, () => {})
    const r = await (t as unknown as { execute: (a: unknown, c: unknown) => Promise<Record<string, any>> }).execute({ destination: 'Đà Nẵng' }, ctx)
    expect(r.hotels).toMatchObject({ tool_state: 'ERROR' })
    expect(r.attractions.results).toHaveLength(1)
    expect(r.error).toBeUndefined()
  })
})

// ── B5 · the preliminary set does not outlive Luna's "none" ─────────────────────────────────────────────────────────────────────
const NAMES = ['Bảo Tàng Địa Chất', 'Nhà Thiếu Nhi Thành Phố', 'Cà Phê Muối Chú Long', 'Phở Lệ']
const row = (name: string, i: number) => ({ place_id: `g-${i}`, name, address: `${10 + i} Lê Duẩn, Quận 1`, rating_value: 4 + i / 10, rating_count: 100 + i, maps_link: `https://www.google.com/maps?q=${i}`, text_ranked: true })
async function settlePlaces(prose: string) {
  const result = { source: 'osm', count: NAMES.length, results: NAMES.map(row), _tappy_place_domain: 'food' }
  const c = createEnrichmentCollector()
  c.agentMode = true
  c.semanticRanking = true
  c.add(result.results)
  c.setPlacesRecommendations(placeRecommendations(result, 'TP HCM'), producerSubject('search_places', 'food'))
  c.setRendersDecisionCard(rendersDecisionCard('web'))
  const frames = [
    `9:${JSON.stringify({ toolCallId: 't1', toolName: 'search_places', args: { query: 'Bảo tàng Chứng tích Chiến tranh' } })}`,
    `a:${JSON.stringify({ toolCallId: 't1', result })}`,
    `0:${JSON.stringify(prose)}`,
    'd:{"finishReason":"stop"}',
  ]
  const out = await new Response(applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c).body).text()
  const ann = out.split('\n').filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as unknown[])
  const text = out.split(/\n/).filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  return { ann, view: readPlacesLiveView(ann), text }
}

describe('POST-UAT B5 · unrelated provider rows are not left on screen', () => {
  it('UAT-15 shape: Luna recommends none → the preliminary 8 rows are retracted (cleared frame), the client shows no card', async () => {
    const { ann, view } = await settlePlaces('Mình chưa xác minh được giờ mở cửa hôm nay của Bảo tàng Chứng tích Chiến tranh; bạn nên xem trang chính thức.\n[TAPPY_RANK]{"picks":[],"none":true,"confidence":"high"}[/TAPPY_RANK]')
    expect(ann.some(a => (a as Record<string, unknown>).preliminary === true)).toBe(true)
    expect(ann.some(a => (a as Record<string, unknown>).cleared === true)).toBe(true)
    expect(view).toBeNull()
  })
  it('a real pick still renders its card (the clear frame is only for "no card")', async () => {
    const { ann, view } = await settlePlaces('Mình chọn **Phở Lệ** — gần và hợp bữa trưa.\n[TAPPY_RANK]{"picks":[{"name":"Phở Lệ","why":"gần"}],"none":false,"confidence":"high"}[/TAPPY_RANK]')
    expect(ann.some(a => (a as Record<string, unknown>).cleared === true)).toBe(false)
    expect(view?.items.map(i => i.name)).toEqual(['Phở Lệ'])
  })
  it('the client reader: a later decision after a clear wins; a clear after a decision empties', () => {
    const item = { name: 'X', id: 'x', actions: [] }
    expect(readPlacesLiveView([{ kind: 'tappy.places.v1', v: 1, items: [item], preliminary: true }, { kind: 'tappy.places.v1', v: 1, items: [], cleared: true }])).toBeNull()
    expect(readPlacesLiveView([{ kind: 'tappy.places.v1', v: 1, items: [], cleared: true }, { kind: 'tappy.places.v1', v: 1, items: [item] }])?.items).toHaveLength(1)
  })
})

// ── B6 · editorial source attribution ─────────────────────────────────────────────────────────────────────────────────────────
const VNE = { source: 'VnExpress', title: 'Đà Nẵng tạm dừng tham quan bán đảo Sơn Trà', url: 'https://vnexpress.net/da-nang-tam-dung-tham-quan-ban-dao-son-tra-5130055.html', publishedAt: '2026-10-08T18:40:22+07:00', summary: 'Hoạt động tham quan bán đảo Sơn Trà tạm dừng từ ngày 8/10 đến khi có thông báo mới, do dự báo mưa lớn kéo dài.' }
describe('POST-UAT B6 · a restated article keeps a working source', () => {
  const tripResult = { destination: 'Đà Nẵng', hotels: { results: [], travel_editorial: [VNE] }, attractions: { results: [] }, food: { results: [] } }
  it('UAT-13 as measured: the Sơn Trà warning sentence gets [S1] → the VnExpress URL; nothing else is marked', () => {
    const items = editorialItemsIn([tripResult])
    expect(items).toHaveLength(1)
    const reply = 'Mình lên lịch nhẹ, ưu tiên không gian trong nhà. Lưu ý: dữ liệu mới nhất mình có cho biết tham quan bán đảo Sơn Trà đang tạm dừng từ 8/10 do nguy cơ thời tiết, nên không đưa vào lịch. Ngày 1: ăn mì Quảng.'
    const r = attributeEditorial(reply, items, 1)
    expect(r.text).toContain('nên không đưa vào lịch [S1].')
    expect((r.text.match(/\[S\d\]/g) ?? [])).toHaveLength(1)
    expect(r.links).toEqual([expect.objectContaining({ id: 'S1', url: VNE.url, source_type: 'NEWS', action_type: 'SOURCE' })])
  })
  it('a reply that does not restate the article gets no citation (never an unsupported source)', () => {
    const r = attributeEditorial('Ngày 1 đi biển Mỹ Khê, tối ăn hải sản. Ngày 2 ghé chợ Hàn.', editorialItemsIn([tripResult]), 1)
    expect(r.links).toHaveLength(0)
    expect(r.text).not.toMatch(/\[S/)
  })
  it('ids continue after the pages already cited; a URL already in the text is not added twice', () => {
    const items = editorialItemsIn([tripResult])
    const s = 'Bán đảo Sơn Trà đang tạm dừng tham quan từ 8/10.'
    expect(attributeEditorial(s, items, 3).links[0].id).toBe('S3')
    expect(attributeEditorial(`${s} ${VNE.url}`, items, 1).links).toHaveLength(0)
  })
  it('only editorial / news keys count — a place row URL is not an article', () => {
    expect(editorialItemsIn([{ results: [{ title: 'Phở Lệ', url: 'https://pho-le.example' }] }])).toHaveLength(0)
  })
})

// ── B7 · clarification guidance (prompt; Luna decides) ────────────────────────────────────────────────────────────────────────
describe('POST-UAT B7 · ask only when it materially changes the answer', () => {
  it('the runtime prompt tells Luna to answer an explain / list request instead of asking, and to assume optional details', () => {
    expect(AGENT_SYSTEM_V2).toMatch(/GIẢI THÍCH, LIỆT KÊ hay NÊU/)
    expect(AGENT_SYSTEM_V2).toMatch(/Không thay câu trả lời đó bằng ask_user/)
    expect(AGENT_SYSTEM_V2).toMatch(/Chi tiết tuỳ chọn .* không bao giờ là lý do để chưa trả lời/)
    // essential questions are still allowed
    expect(AGENT_SYSTEM_V2).toMatch(/kế hoạch du lịch chưa có điểm đến/)
  })
})

describe('POST-UAT B3 · settle path: a lead-in whose items a guard removed does not dangle (P12 survived the first mutation run)', () => {
  it('unverified venue prices go; their "…như sau:" lead-in goes with them; the rest of the reply stays', async () => {
    const { text } = await settlePlaces('Mình chưa chọn được quán phù hợp.\n\nGiá tham khảo từng quán như sau:\n- **Phở Lệ**: 85.000đ/tô\n- **Cà Phê Muối Chú Long**: 35.000đ/ly\n\nBạn muốn mình tìm thêm ở khu khác không?\n[TAPPY_RANK]{"picks":[],"none":true,"confidence":"high"}[/TAPPY_RANK]')
    expect(text).not.toMatch(/85\.000|35\.000/)
    expect(text).not.toMatch(/như sau:/)
    expect(text).toMatch(/Mình chưa chọn được quán phù hợp\./)
  })
})

// ── B7 · the clarification backstop keeps a requested information checklist (UAT-09 t1, post-fix run) ─────────────────────────────
import { guardClarifications } from '@/lib/ai/clarificationGuard'
describe('POST-UAT B7 · an information checklist is content, not a form', () => {
  const ANSWER = 'Để ước tính vốn, mình tách chi phí thành ba nhóm. Mặt bằng: tiền cọc, sửa chữa, bảng hiệu. Thiết bị: máy pha, máy xay, tủ lạnh. Dự phòng: tiền bù lỗ những tháng đầu.\n\n'
  const LIST = 'Để tính sát hơn, mình cần biết:\n1. Bạn định mở ở khu vực nào?\n2. Diện tích hoặc số chỗ ngồi khoảng bao nhiêu?\n3. Bạn bán mang đi hay có chỗ ngồi?\n4. Bạn tự đứng quán hay thuê nhân viên?'
  it('agent turn: the whole checklist stays (it was cut to its first item before)', () => {
    const t = ANSWER + LIST
    expect(guardClarifications(t, 'allow', { checklist: true }).text).toBe(t)
  })
  it('the cap still holds for free-form questions, and without the agent option nothing changes', () => {
    expect(guardClarifications(ANSWER + 'Bạn thích quán kiểu gì? Bạn muốn mở ở đâu?', 'allow', { checklist: true }).removed).toBe(1)
    expect(guardClarifications(ANSWER + LIST, 'allow').removed).toBe(3)
  })
  it('a reply that answered nothing is not allowed to become a questionnaire', () => {
    expect(guardClarifications('Mình cần thêm thông tin.\n\nĐể tính sát hơn, mình cần biết:\n1. Khu vực nào?\n2. Bao nhiêu chỗ?', 'allow', { checklist: true }).removed).toBe(1)
  })
  it('a numbered list under a non-information lead-in keeps the cap', () => {
    expect(guardClarifications(ANSWER + 'Câu hỏi thường gặp:\n1. Có cần giấy phép không?\n2. Có nên thuê nhân viên không?', 'allow', { checklist: true }).removed).toBe(1)
  })
})

describe('POST-UAT B7 · the lead-in Luna actually wrote ("bạn cho mình biết:")', () => {
  it('keeps the checklist', () => {
    const t = 'Mặt bằng: tiền cọc, sửa chữa. Thiết bị: máy pha, máy xay. Dự phòng: bù lỗ tháng đầu.\n\nĐể mình ước tính thành bảng vốn cụ thể, bạn cho mình biết:\n1. Quán ở khu vực nào?\n2. Mặt bằng đã có hay cần thuê?\n3. Bán mang đi hay ngồi tại quán?'
    expect(guardClarifications(t, 'allow', { checklist: true }).text).toBe(t)
  })
})

// ── measured on the post-fix UAT-13 run: guards downstream of the attribution ─────────────────────────────────────────────────────
import { guardUngivenTravelDate } from '@/lib/ai/planTripFactsGuard'
import { guardSnippetPricesInText } from '@/lib/ai/snippetPriceGuard'
describe('POST-UAT B6 · a source-bound news date is not an invented travel date', () => {
  const U = ['Tôi muốn đi chơi Đà Nẵng 2 ngày 1 đêm.']
  it('the cited Sơn Trà warning survives the ungiven-date guard; an uncited assumed date still goes', () => {
    const cited = '**Lưu ý:** Theo tin ngày 8/10/2026, tham quan bán đảo Sơn Trà đang tạm dừng; mình không đưa vào lịch [S1].'
    expect(guardUngivenTravelDate(cited, U).text).toBe(cited)
    expect(guardUngivenTravelDate('Mình giả sử bạn đi ngày 12/10. Ngày 1 tắm biển.', U).dropped).toBe(1)
  })
})
describe('POST-UAT B3 · an honest disclosure that names the user envelope is not a cost claim (F-086 still holds otherwise)', () => {
  it('kept: "chưa thể khẳng định tổng chi phí sẽ nằm trong 4 triệu"', () => {
    const t = 'Khách sạn, giá món và vé tham quan hiện chưa xác minh được, nên chưa thể khẳng định tổng chi phí sẽ nằm trong 4 triệu.'
    expect(guardSnippetPricesInText(t, [], 'ngân sách tổng 4 triệu đồng', { byEntity: new Map(), placeNames: [] }, { v2: true, priceBandsByEntity: new Map() }).text).toBe(t)
  })
  it('judged: "Tổng chi phí khoảng 4 triệu" (the envelope presented as the cost)', () => {
    expect(guardSnippetPricesInText('Tổng chi phí khoảng 4 triệu cho cả chuyến.', [], 'ngân sách tổng 4 triệu đồng').text).not.toMatch(/4 triệu/)
  })
})

import { isTicketSaleClaim, isOrderingClaim } from '@/lib/ai/placeClaimGuard'
describe('POST-UAT · place-claim false positives measured on the UAT-25 post-fix run', () => {
  it('"điểm tham quan có vé" / "hoạt động có vé" is an attribute, not a ticket sale; a real sale claim still is', () => {
    expect(isTicketSaleClaim('Giữ lại khoảng 90.000đ dự phòng; nếu chọn điểm tham quan có vé, hãy bớt một lượt cà phê.')).toBe(false)
    expect(isTicketSaleClaim('Đi dạo Nguyễn Huệ; không cần thêm hoạt động có vé.')).toBe(false)
    expect(isTicketSaleClaim('Rạp CGV Vincom có vé suất tối nay, bạn đặt ngay nhé.')).toBe(true)
  })
  it('advice "xem giá trước khi gọi món" is not an ordering claim; "quán có giao hàng" still is', () => {
    expect(isOrderingClaim('Mình chưa xác nhận được giá của các quán nêu trên; nhớ xem giá trước khi gọi món.')).toBe(false)
    expect(isOrderingClaim('Quán có giao hàng tận nơi qua GrabFood.')).toBe(true)
  })
})

import { dropOrphanLeadIns } from '@/lib/ai/citationIntegrity'
describe('POST-UAT · final-run findings (UAT-09 t1 / UAT-25 t4, final code run)', () => {
  it('"bạn cho biết:" opens a checklist', () => {
    const t = 'Mặt bằng: tiền cọc, sửa chữa. Thiết bị: máy pha, máy xay. Dự phòng: bù lỗ tháng đầu.\n\nĐể mình lập bảng ước tính sát hơn, bạn cho biết:\n1. Quán ở khu vực nào?\n2. Diện tích khoảng bao nhiêu?'
    expect(guardClarifications(t, 'allow', { checklist: true }).text).toBe(t)
  })
  it('a cost category ("phí giao hàng") is not an ordering claim', () => {
    expect(isOrderingClaim('- Nguyên liệu bổ sung, điện nước, internet, phí giao hàng hoặc nền tảng bán hàng.')).toBe(false)
  })
  it('an announcing lead-in followed by section headings stays; only the lead-in sentence of a line is ever dropped', () => {
    const t = 'Mình tách hai nhóm. Các khoản chính gồm:\n\n**1. Chi phí mở quán**\n- Mặt bằng'
    expect(dropOrphanLeadIns(t).text).toBe(t)
    expect(dropOrphanLeadIns('Mình tách hai nhóm. Các khoản chính gồm:\n\nBạn hỏi thêm nhé.').text).toBe('Mình tách hai nhóm.\n\nBạn hỏi thêm nhé.')
  })
  it('a plan list item keeps its stop when only its unverified venue amount goes', () => {
    const r = guardSnippetPricesInText('Lịch trình cập nhật:\n- **Trưa:** Ăn tại **Nhà Hàng Wrap&Roll** gần chợ; dành khoảng **200.000đ**.\n- **Sáng:** Ăn sáng bình dân gần nơi bạn ở, dự trù **70.000đ**.', [], 'Giảm ngân sách xuống 700.000 đồng.', { byEntity: new Map(), placeNames: ['Nhà Hàng Wrap&Roll'] }, { v2: true, priceBandsByEntity: new Map() })
    expect(r.text).toMatch(/Ăn tại \*\*Nhà Hàng Wrap&Roll\*\* gần chợ/)
    expect(r.text).not.toMatch(/200\.000/)
    expect(r.text).toMatch(/dự trù \*\*70\.000đ\*\*/)
  })
})

import { clockTimes } from './claimConflict'
describe('POST-UAT · final run 2 findings', () => {
  it('a day label "Ngày 1:" is not 1:00; real clock times still parse', () => {
    expect(clockTimes('**Ngày 1:** Đến nơi, nhận phòng rồi nghỉ ngơi.')).toEqual([])
    expect(clockTimes('mở 10:00–23:00, check-in 14h, 7 giờ tối')).toEqual([600, 1380, 840, 1140])
  })
  it('a cost list naming "giao hàng" is not an ordering claim; a venue that delivers still is', () => {
    expect(isOrderingClaim('Chi phí vận hành tháng thường gồm thuê mặt bằng, lương, nguyên liệu, điện nước/internet, giao hàng, phí thanh toán/phần mềm và thuế.')).toBe(false)
    expect(isOrderingClaim('Quán nhận đơn giao hàng tận nơi trong bán kính 3 km.')).toBe(true)
  })
})

describe('POST-UAT B3 · settle path: the turn-2 envelope is still the user\'s at turn 3 (UAT-25; mutation P33 survived the unit tests)', () => {
  it('a reply restating "ngân sách 700.000 đồng" given two turns earlier keeps it on a place turn', async () => {
    const result = { source: 'osm', count: NAMES.length, results: NAMES.map(row), _tappy_place_domain: 'food' }
    const c = createEnrichmentCollector('Bỏ điểm đến thứ hai.', ['Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng.', 'Giảm ngân sách xuống 700.000 đồng.'])
    c.agentMode = true
    c.semanticRanking = true
    c.add(result.results)
    c.setPlacesRecommendations(placeRecommendations(result, 'TP HCM'), producerSubject('search_places', 'food'))
    c.setRendersDecisionCard(rendersDecisionCard('web'))
    const prose = 'Với ngân sách **700.000 đồng/người**, mình giữ lịch nhẹ nhàng quanh trung tâm và bỏ điểm thứ hai.\n[TAPPY_RANK]{"picks":[],"none":true,"confidence":"high"}[/TAPPY_RANK]'
    const frames = [`9:${JSON.stringify({ toolCallId: 't1', toolName: 'search_places', args: { query: 'quán ăn trung tâm' } })}`, `a:${JSON.stringify({ toolCallId: 't1', result })}`, `0:${JSON.stringify(prose)}`, 'd:{"finishReason":"stop"}']
    const out = await new Response(applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', c).body).text()
    const text = out.split(/\n/).filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    expect(text).toMatch(/700\.000 đồng\/người/)
  })
})
