// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { dropUnbackedOfferClaims, hasPressableLink, viewHasPrice } from './consultative/offerClaims'

// Round 32, defect 2 — the reply only points at prices and buttons the FINAL output has. Live 2026-10-12 (hotel, Đà Nẵng): ten rows with no price, the preliminary cards cleared,
// and the reply still talked about "các mức tham khảo đi kèm" and "nút đặt phòng bên dưới". The rule is on the data of the final output, not on those words.

const NONE = { hasPriceData: false, hasAction: false, lang: 'vi' }
const drop = (text: string, ctx = NONE) => dropUnbackedOfferClaims(text, ctx)

const LIVE = 'Kết quả vừa tra chưa có giá cho đúng **2 người, 1 phòng, 24–26/10/2026**; các mức tham khảo đi kèm danh sách khách sạn không xác nhận đúng ngày và loại phòng nên mình không muốn báo nhầm giá. Bạn có thể xem giá theo ngày trên nút đặt phòng bên dưới; giá có thể thay đổi theo tình trạng phòng.'

describe('dropUnbackedOfferClaims — the live reply', () => {
  it('removes the two pointers at things that do not exist and keeps what is true', () => {
    const r = drop(LIVE)
    expect(r.text).toBe('Kết quả vừa tra chưa có giá cho đúng **2 người, 1 phòng, 24–26/10/2026**. Giá có thể thay đổi theo tình trạng phòng.')
    expect(r.text).toContain('Kết quả vừa tra chưa có giá cho đúng **2 người, 1 phòng, 24–26/10/2026**')
    expect(r.text).not.toMatch(/mức tham khảo/)
    expect(r.text).not.toMatch(/nút đặt phòng/)
    expect(r.text).not.toMatch(/bên dưới/)
    expect(r.removed.map(x => x.kind).sort()).toEqual(['action', 'price'])
  })
  it('the same reply is untouched when the final output has a price and a button', () => {
    expect(drop(LIVE, { hasPriceData: true, hasAction: true, lang: 'vi' })).toEqual({ text: LIVE, removed: [] })
  })
  it('each pointer is judged on its own datum: a button without a price keeps the price pointer out, and the reverse', () => {
    const onlyButton = drop(LIVE, { hasPriceData: false, hasAction: true, lang: 'vi' })
    expect(onlyButton.text).toContain('nút đặt phòng bên dưới')
    expect(onlyButton.text).not.toMatch(/mức tham khảo/)
    const onlyPrice = drop(LIVE, { hasPriceData: true, hasAction: false, lang: 'vi' })
    expect(onlyPrice.text).toMatch(/mức tham khảo/)
    expect(onlyPrice.text).not.toMatch(/nút đặt phòng/)
  })
})

describe('dropUnbackedOfferClaims — the same idea in other words is caught', () => {
  const gone = (s: string) => expect(drop(`Có ba khách sạn gần biển. ${s}`).text).not.toBe(`Có ba khách sạn gần biển. ${s}`)
  it.each([
    'Mình đã đính kèm liên kết đặt phòng ở dưới để bạn xem giá.',
    'Bạn bấm vào nút Đặt phòng phía dưới nhé.',
    'Hãy nhấn thẻ khách sạn bên dưới để xem giá phòng.',
    'Click the booking button below to see the rates.',
    'Xem link bên dưới để chọn phòng.',
    'Các mức giá tham khảo được liệt kê bên dưới.',
    'Bảng giá phòng đi kèm danh sách cho thấy mức khá cao.',
    'The reference prices listed below do not match your dates.',
    'Mình có các mức giá tham khảo trong danh sách.',
  ])('%s', gone)
  it('a reply made only of such pointers is replaced by one honest sentence, never by nothing', () => {
    const r = drop('Bạn bấm vào nút đặt phòng bên dưới nhé.')
    expect(r.text).toBe('Mình chưa có giá hoặc liên kết đã kiểm chứng cho yêu cầu này.')
    expect(drop('Press the booking button below.', { ...NONE, lang: 'en' }).text).toBe('I don\'t have a verified price or booking link for this request.')
  })
})

describe('dropUnbackedOfferClaims — what is true, or points at something real, stays', () => {
  const kept = (s: string, ctx = NONE) => expect(drop(s, ctx)).toEqual({ text: s, removed: [] })
  it.each([
    'Kết quả chưa có mức giá tham khảo nào đi kèm.',
    'Mình chưa có giá phòng cho ngày này.',
    'Bạn có thể xem giá trên Booking hoặc Agoda.',
    'Mình chọn khách sạn A vì gần biển.',
    'Nguồn: [vnexpress.net](https://vnexpress.net/a)',
    'Bạn bấm [Đặt phòng](https://example.com/dat-phong) để xem giá.',
    'Chọn một trong các lựa chọn bên dưới nhé.',
  ])('%s', s => kept(s))
  it('marker blocks are never touched', () => {
    const s = 'Mình chưa có giá. [FOLLOWUPS]Xem nút bên dưới|Link[/FOLLOWUPS]'
    expect(drop(s).text).toBe(s)
  })
})

describe('helpers', () => {
  it('a source line is not a button', () => {
    expect(hasPressableLink('Giá tốt.\n\nNguồn: [a.example](https://a.example/p)')).toBe(false)
    expect(hasPressableLink('Giá tốt.\n\n🔗 Liên kết đối tác: [Vexere](https://www.tappyai.com/go/at?u=x)')).toBe(true)
  })
  it('a card carries a price only through a snippet price or the provider band', () => {
    expect(viewHasPrice({ items: [{ name: 'a', priceLevel: 2 }] })).toBe(false)
    expect(viewHasPrice({ items: [{ name: 'a', priceSignal: '500.000đ' }] })).toBe(true)
    expect(viewHasPrice({ items: [{ name: 'a', priceRangeText: '1-100.000 ₫' }] })).toBe(true)
    expect(viewHasPrice(null)).toBe(false)
  })
})

// ── through the settle step ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const Q = 'Khách sạn ở Đà Nẵng cho 2 người, 1 phòng, nhận phòng 24/10/2026, trả phòng 26/10/2026, giá bao nhiêu?'
const HOTELS = { location: 'Đà Nẵng', source: 'Serper Maps', hotel_list: [{ name: 'Hotel A', address: '1 Võ Nguyên Giáp', rating_value: 4.7, website_uri: 'https://hotel-a.example/' }, { name: 'Hotel B', address: '2 Lê Duẩn', rating_value: 4.6 }], note: 'Gia trong search_results la tham khao ... bam booking_link de xem gia chinh xac' }

async function run(text: string, o: { flag: boolean; result?: unknown }) {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  collector.semanticRanking = true
  if (o.flag) collector.consultative = true
  const frames = [
    '9:{"toolCallId":"t1","toolName":"get_hotel_prices","args":{"location":"Đà Nẵng"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: o.result ?? HOTELS }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, true, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('settle step — hotel turn with no price and no card (flag on)', () => {
  it('the live reply loses the two pointers', async () => {
    const out = await run(LIVE, { flag: true })
    expect(out).not.toMatch(/mức tham khảo/)
    expect(out).not.toMatch(/nút đặt phòng/)
    expect(out).toContain('chưa có giá')
  })
  it('a differently worded pointer is caught as well', async () => {
    const out = await run('Mình chưa thấy giá đúng ngày. Bạn bấm liên kết đặt phòng dưới đây để xem giá phòng nhé.', { flag: true })
    expect(out).not.toMatch(/liên kết đặt phòng/)
    expect(out).toContain('chưa thấy giá')
  })
  it('a booking link the system supplies makes the pointer true: kept', async () => {
    const out = await run('Bạn bấm nút đặt phòng bên dưới để xem giá nhé.', { flag: true, result: { ...HOTELS, _tappy_commerce: [{ kind: 'SEARCH_HANDOFF' }], booking_links: [{ name: 'Booking', platform: 'booking', url: 'https://www.booking.com/searchresults.html?ss=Da+Nang' }] } })
    expect(out).toContain('nút đặt phòng bên dưới')
  })
  it('CONTROL — flag off: the reply is left exactly as before', async () => {
    const out = await run(LIVE, { flag: false })
    expect(out).toMatch(/nút đặt phòng bên dưới/)
  })
})
