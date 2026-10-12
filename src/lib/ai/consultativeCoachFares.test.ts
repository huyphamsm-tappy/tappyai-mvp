// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const serper = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('@/lib/ai/tools/common', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  getCache: () => null,
  setCache: () => undefined,
  serperSearch: serper.search,
}))

import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { operatorsIn, fareFactsOf, shapeCoachReply } from './consultative/coachFares'
import { getTransportOptions } from './tools/travel'
import { transportCacheKey } from './tools/cacheKeys'

// Round 32, defect 3 — coach fares are named for what they are. Live 2026-10-12: "từ 350.000–410.000đ/chiều, tùy nhà xe và loại xe" — one operator in the data, a promotional price in an
// undated article glued to a "từ" price on a listing page. The rows below are the live snippets.

const ROWS = [
  { title: 'FUTA Bus Lines', link: 'https://futabus.vn/', snippet: 'Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện thoại tổng đài đặt vé xe phương trang: 1900 6067.' },
  { title: 'Xe Phương Trang | Đặt Vé Online, Giá Vé 2026', link: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', snippet: 'Đặt vé xe Phương Trang (FUTA Bus Lines) online tại redBus. Giá vé từ 165.000đ, 92 tuyến, 350+ điểm bán.' },
  { title: 'công ty phương trang khai trương tuyến bến xe an sương', link: 'https://futabus.vn/tin-tuc/cong-ty-phuong-trang-khai-truong-tuyen-ben-xe-an-suong-ben-xe-quy-nhon', snippet: 'Với mức giá ưu đãi chỉ 350.000 VNĐ, Quý Khách sẽ được trải nghiệm hành trình 625km trên dòng xe cao cấp KimLong 99 VIP.' },
  { title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html', snippet: 'Với giá vé chỉ từ 410000 đ và các tiện ích trên xe như: Đang cập nhật. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' },
]
const toRows = (rs: typeof ROWS) => rs.map(r => ({ host: new URL(r.link).hostname.replace(/^www\./, ''), url: r.link, text: `${r.title} ${r.snippet}` }))
const LIVE = 'Giá tham khảo mình tìm được cho xe khách TP.HCM–Quy Nhơn là **từ 350.000–410.000đ/chiều**, tùy nhà xe và loại xe. Giá đúng ngày **24/10/2026** chưa xác minh được; bạn có thể kiểm tra chuyến và giá theo ngày trên Vexere.'

describe('coachFares (pure)', () => {
  it('the live rows name ONE operator (Phương Trang, FUTA and redBus-for-Phương-Trang are the same one)', () => {
    expect(operatorsIn(toRows(ROWS)).size).toBe(1)
  })
  it('two operators in the rows are two', () => {
    const more = [...ROWS, { title: 'Nhà xe Thành Bưởi', link: 'https://example.vn/thanh-buoi', snippet: 'Vé xe Thành Bưởi TP.HCM đi Quy Nhơn từ 380.000đ.' }]
    expect(operatorsIn(toRows(more)).size).toBe(2)
    expect(operatorsIn(toRows([{ title: 'x', link: 'https://example.vn/a', snippet: 'Đặt vé nhà xe Hoàng Gia đi Quy Nhơn, nhà xe Hà Ngọc cũng chạy tuyến này.' }])).size).toBe(2)
  })
  it('kinds of fare: a promotion in an article, a "từ" price, a plain one', () => {
    const f = fareFactsOf(toRows(ROWS))
    expect(f.find(x => x.amount === 350000)?.kind).toBe('promo')
    expect(f.find(x => x.amount === 410000)?.kind).toBe('from')
    expect(f.find(x => x.amount === 165000)?.kind).toBe('from')
    expect(fareFactsOf([{ host: 'a.example', url: 'https://a.example/', text: 'Giá vé 250.000đ' }])[0].kind).toBe('plain')
  })
})

describe('shapeCoachReply', () => {
  it('the live reply: no "tùy nhà xe" (one operator), the glued range becomes two named figures', () => {
    const r = shapeCoachReply(LIVE, toRows(ROWS), 'vi')
    expect(r.changes.sort()).toEqual(['mixed_range', 'operator_variance'])
    expect(r.text).not.toMatch(/tùy nhà xe/)
    expect(r.text).not.toMatch(/tùy/) // these rows name no vehicle types either (Round 33: "loại xe" needs the rows' support too)
    expect(r.text).not.toContain('350.000–410.000')
    expect(r.text).toContain('350.000đ/chiều (giá ưu đãi nêu trong bài của futabus.vn, không ghi ngày)')
    expect(r.text).toContain('410.000đ/chiều (giá "từ" ở vexere.com, chưa theo ngày)')
    expect(r.text).toContain('Giá đúng ngày **24/10/2026** chưa xác minh được')
  })
  it('two operators in the rows: "tùy nhà xe" stays', () => {
    const more = toRows([...ROWS, { title: 'Nhà xe Thành Bưởi', link: 'https://example.vn/thanh-buoi', snippet: 'Vé xe Thành Bưởi đi Quy Nhơn.' }])
    expect(shapeCoachReply('Giá từ 410.000đ, tùy nhà xe.', more, 'vi').text).toBe('Giá từ 410.000đ, tùy nhà xe.')
  })
  it('a range one source states, or whose ends are the same kind, is left alone', () => {
    const one = [{ host: 'a.example', url: 'https://a.example/', text: 'Vé xe từ 300.000 - 450.000đ tùy chặng' }]
    expect(shapeCoachReply('Giá 300.000–450.000đ.', one, 'vi').changes).not.toContain('mixed_range')
    const same = [{ host: 'a.example', url: 'https://a.example/', text: 'Vé xe giá 300.000đ' }, { host: 'b.example', url: 'https://b.example/', text: 'Vé xe giá 450.000đ' }]
    expect(shapeCoachReply('Giá 300.000–450.000đ.', same, 'vi').changes).not.toContain('mixed_range')
  })
  it('"từ A đến B" is the same gluing as "A–B"', () => {
    const r = shapeCoachReply('Giá từ 350.000đ đến 410.000đ.', toRows(ROWS), 'vi')
    expect(r.changes).toContain('mixed_range')
    expect(r.text).toContain('(giá ưu đãi nêu trong bài của futabus.vn')
    expect(r.text).toContain('(giá "từ" ở vexere.com')
  })
  it('English wording', () => {
    const r = shapeCoachReply('Fares are 350,000–410,000đ, depending on the operator.', toRows(ROWS), 'en')
    expect(r.text).not.toMatch(/depending on the operator/)
    expect(r.text).toContain('promotional price in an article on futabus.vn, no date')
    expect(r.text).toContain('"from" price on vexere.com, not date-specific')
  })
  it('a figure the rows do not state is not touched', () => {
    expect(shapeCoachReply('Giá 100.000–900.000đ.', toRows(ROWS), 'vi').changes).not.toContain('mixed_range')
  })
})

describe('the coach query carries the user\'s date (same number of requests)', () => {
  beforeEach(() => { serper.search.mockReset(); serper.search.mockResolvedValue([]) })
  it('with a well-formed date: two requests, the coach one worded with the day', async () => {
    await getTransportOptions('TP.HCM', 'Quy Nhơn', undefined, 'vi', '2026-10-24')
    expect(serper.search).toHaveBeenCalledTimes(2)
    expect(serper.search.mock.calls[0][0]).toBe('ve xe khach tu TP.HCM di Quy Nhơn ngay 24/10/2026 gia bao nhieu vexere futa phuong trang')
    expect(serper.search.mock.calls[1][0]).toBe('ve tau TP.HCM Quy Nhơn duong sat viet nam gia')
  })
  it('without a date (or a malformed one) the query is exactly the former one', async () => {
    await getTransportOptions('TP.HCM', 'Quy Nhơn')
    await getTransportOptions('TP.HCM', 'Quy Nhơn', undefined, 'vi', '24/10')
    for (const i of [0, 2]) expect(serper.search.mock.calls[i][0]).toBe('ve xe khach tu TP.HCM di Quy Nhơn gia bao nhieu vexere futa phuong trang')
  })
  it('the cache key is the former one without a date, and distinct with one', () => {
    expect(transportCacheKey('a', 'b', undefined, 'vi')).toBe('transport:a:b:auto:vi')
    expect(transportCacheKey('a', 'b', undefined, 'vi', '2026-10-24')).not.toBe(transportCacheKey('a', 'b', undefined, 'vi'))
  })
})

// ── through the settle step ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const Q = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
async function run(text: string, flag: boolean, rows: typeof ROWS = ROWS) {
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  collector.semanticRanking = true
  if (flag) collector.consultative = true
  const frames = [
    '9:{"toolCallId":"t1","toolName":"get_transport_options","args":{"origin":"TP.HCM","destination":"Quy Nhơn","mode":"intercity","date":"2026-10-24"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { type: 'intercity', origin: 'TP.HCM', destination: 'Quy Nhơn', bus_search_results: rows, train_search_results: [], note: 'x' } }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, true, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}

describe('settle step — coach reply (flag on)', () => {
  it('the live reply is rewritten', async () => {
    const out = await run(LIVE, true)
    expect(out).not.toMatch(/tùy nhà xe/)
    expect(out).toContain('(giá ưu đãi nêu trong bài của futabus.vn, không ghi ngày)')
    expect(out).toContain('(giá "từ" ở vexere.com, chưa theo ngày)')
  })
  it('CONTROL — flag off: the reply is left exactly as the model wrote it', async () => {
    const out = await run(LIVE, false)
    expect(out).toMatch(/tùy nhà xe/)
    expect(out).toContain('350.000–410.000')
  })
})
