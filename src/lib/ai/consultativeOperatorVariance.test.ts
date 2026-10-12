// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dropUnsupportedVariance, varianceSupport } from './consultative/operatorVariance'
import { operatorsIn, shapeCoachReply } from './consultative/coachFares'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// Round 33, defect B — what a coach reply may say about operators, vehicle types and times is decided by the rows of the turn, by MEANING (not by the phrase that was seen).
// Live 2026-10-12 (round 2): one operator in the rows, reply "giá thực tế thay đổi theo hãng và loại xe" — the Round 32 phrase rule ("tùy nhà xe") missed it.

const row = (host: string, text: string) => ({ host, url: `https://${host}/x`, text })
const R_ONE = [
  row('futabus.vn', 'FUTA Bus Lines Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện thoại tổng đài đặt vé xe phương trang: 1900 6067.'),
  row('vexere.com', 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định Với giá vé chỉ từ 410000 đ. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.'),
]
const R_VEH = [...R_ONE, row('redbus.vn', 'Xe Phương Trang | Đặt Vé Online Đặt vé xe Phương Trang (FUTA Bus Lines) online tại redBus. Giá vé từ 165.000đ, 92 tuyến. Xe giường nằm & Limousine VIP — chọn ghế, trả online ...')]
const R_MULTI = [...R_ONE, row('example.vn', 'Nhà xe Thành Bưởi TP.HCM đi Quy Nhơn từ 380.000đ, nhà xe Hoàng Long cũng có chuyến.')]
const R_TIME = [...R_ONE, row('example.vn', 'Giá vé xe khách tăng vào dịp lễ và cuối tuần, khung giờ cao điểm.')]
const sup = (rows: typeof R_ONE) => varianceSupport(rows, operatorsIn(rows).size)
const drop = (text: string, rows = R_ONE, lang = 'vi') => dropUnsupportedVariance(text, sup(rows), lang)
const PRE = 'Vé xe từ 410.000 đồng. '

describe('support is read from the rows', () => {
  it('one operator, no vehicle types, no time-dependent fares', () => { expect(sup(R_ONE)).toEqual({ operators: false, vehicle: false, time: false }) })
  it('vehicle types stated next to a fare', () => { expect(sup(R_VEH)).toMatchObject({ operators: false, vehicle: true }) })
  it('two operators', () => { expect(sup(R_MULTI).operators).toBe(true) })
  it('time-dependent fares', () => { expect(sup(R_TIME).time).toBe(true) })
})

describe('one operator in the rows: every way of saying "it varies by operator" goes', () => {
  it('the live round-2 reply: the whole clause, the rest of the reply untouched', () => {
    const t = 'Ngày **24/10/2026**, vé xe khách TP.HCM–Quy Nhơn được niêm yết **từ 410.000 đồng** trên Vexere; giá thực tế thay đổi theo hãng và loại xe. Giá này là mức khởi điểm tham khảo, chưa xác nhận cho từng chuyến ngày đó.'
    const r = drop(t)
    expect(r.text).toBe('Ngày **24/10/2026**, vé xe khách TP.HCM–Quy Nhơn được niêm yết **từ 410.000 đồng** trên Vexere. Giá này là mức khởi điểm tham khảo, chưa xác nhận cho từng chuyến ngày đó.')
    expect(r.removed.sort()).toEqual(['variance_by_operator', 'variance_by_vehicle'])
  })
  it('the live round-1 reply shape: a trailing phrase after a figure', () => {
    expect(drop('Giá khoảng 400.000đ/chiều, tùy nhà xe và loại xe.').text).toBe('Giá khoảng 400.000đ/chiều.')
  })
  it.each([
    'Giá tùy hãng.', 'Giá tùy nhà xe và loại ghế.', 'Mức giá khác nhau giữa các hãng.', 'Giá dao động theo nhà xe.', 'Giá phụ thuộc vào hãng xe.',
    'Mỗi hãng một mức giá riêng.', 'Giá còn tùy thuộc vào nhà xe bạn chọn.', 'Một số hãng có giá rẻ hơn.', 'Nhiều nhà xe cùng chạy tuyến này với giá khác nhau.',
    'Giá có thể khác nhau tùy theo từng nhà xe.', 'Chênh lệch giá giữa các nhà xe không lớn.',
  ])('%s', claim => {
    const out = drop(PRE + claim).text
    expect(out).toBe('Vé xe từ 410.000 đồng.')
  })
  it.each([
    'Price varies by operator.', 'The fare depends on the bus company and seat type.', 'Fares differ between carriers.', 'Prices vary with the operator, seat type and time of travel.', 'Several operators run this route at different prices.',
  ])('English: %s', claim => {
    expect(drop('From 410,000 VND. ' + claim, R_ONE, 'en').text).toBe('From 410,000 VND.')
  })
  it('vehicle type and time are also dropped when the rows do not speak of them', () => {
    expect(drop(PRE + 'Giá thay đổi theo loại xe.').text).toBe('Vé xe từ 410.000 đồng.')
    expect(drop(PRE + 'Giá thay đổi theo thời điểm đặt vé.').text).toBe('Vé xe từ 410.000 đồng.')
  })
})

describe('what the rows support is kept', () => {
  it('several operators: variation between operators may be said', () => {
    for (const s of ['Giá tùy nhà xe.', 'Mỗi hãng một mức giá riêng.', 'Một số hãng có giá rẻ hơn.', 'Giá khác nhau giữa các hãng.']) expect(drop(PRE + s, R_MULTI).text).toBe(PRE + s)
    expect(drop('Fares vary by operator.', R_MULTI, 'en').text).toBe('Fares vary by operator.')
  })
  it('one operator but vehicle types in the rows: only the vehicle part stays', () => {
    expect(drop(PRE + 'Giá thay đổi theo hãng và loại xe.', R_VEH).text).toBe(PRE + 'Giá thay đổi theo loại xe.')
    expect(drop('Giá khoảng 400.000đ, tùy nhà xe và loại xe.', R_VEH).text).toBe('Giá khoảng 400.000đ, tùy loại xe.')
  })
  it('time-dependent fares in the rows: variation by time may be said', () => {
    expect(drop(PRE + 'Giá thay đổi theo thời điểm.', R_TIME).text).toBe(PRE + 'Giá thay đổi theo thời điểm.')
  })
  it('sentences that do not make the claim are untouched, even when they name operators', () => {
    for (const s of ['Bạn có thể xem giá của các hãng trên Vexere.', 'Hãng Phương Trang có 29 chuyến mỗi ngày.', 'Giá khoảng 400.000đ.', 'Bạn nên đặt sớm vào cuối tuần.']) expect(drop(PRE + s).text).toBe(PRE + s)
  })
  it('source lines, links and marker blocks are never touched', () => {
    const t = 'Giá từ 410.000đ.\n\nGiá theo kết quả tìm kiếm của: [vexere.com](https://vexere.com/x)\n\n🔗 Liên kết đối tác: [Vexere](https://www.tappyai.com/go/at?u=x)\n\n[FOLLOWUPS]Giá tùy hãng|Khác nhau giữa các nhà xe[/FOLLOWUPS]'
    expect(drop(t).text).toBe(t)
  })
  it('a reply made only of such a claim is left to the caller (never emptied here)', () => {
    expect(drop('Giá tùy hãng.').text).toBe('Giá tùy hãng.')
  })
})

describe('shapeCoachReply and the settle step (flag on)', () => {
  const rowsFull = R_ONE.map(r => ({ title: '', link: r.url, snippet: r.text }))
  const TEXT = 'Ngày **24/10/2026**, vé xe khách TP.HCM–Quy Nhơn được niêm yết **từ 410.000 đồng** trên Vexere; giá thực tế thay đổi theo hãng và loại xe. Giá này là mức khởi điểm tham khảo, chưa xác nhận cho từng chuyến ngày đó.'
  async function run(flag: boolean, bus = rowsFull) {
    const Q = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
    const collector = createEnrichmentCollector(Q)
    collector.agentMode = true
    collector.semanticRanking = true
    if (flag) collector.consultative = true
    const frames = [
      '9:{"toolCallId":"t1","toolName":"get_transport_options","args":{"origin":"TP.HCM","destination":"Quy Nhơn","mode":"intercity","date":"2026-10-24"}}',
      'a:' + JSON.stringify({ toolCallId: 't1', result: { type: 'intercity', origin: 'TP.HCM', destination: 'Quy Nhơn', bus_search_results: bus, train_search_results: [], note: 'x' } }),
      '0:' + JSON.stringify(TEXT),
      'd:{"finishReason":"stop"}',
    ]
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, (async () => new Map()) as never, undefined, undefined, true, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
    const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
    return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  }
  it('shapeCoachReply reports the change', () => {
    const r = shapeCoachReply(TEXT, R_ONE, 'vi')
    expect(r.changes).toContain('operator_variance')
    expect(r.text).not.toMatch(/hãng|loại xe/)
  })
  it('flag on: the live round-2 reply loses the claim', async () => {
    const out = await run(true)
    expect(out).not.toMatch(/thay đổi theo hãng/)
    expect(out).toContain('Giá này là mức khởi điểm tham khảo')
  })
  it('CONTROL — flag off: the reply is left exactly as the model wrote it', async () => {
    expect(await run(false)).toMatch(/thay đổi theo hãng và loại xe/)
  })
})
