// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'

// Round 33, defect B — FINAL OUTPUT tests. Every case runs through the settle path that produces the text the user reads (applyPlaceEnrichmentStreamFilter: the guards, the
// price↔source step, the coach shaping) with a scripted model text and the coach rows of the turn, and asserts the WHOLE final text. Each case also prints one line
// `CASE {…}` (model input, final text, verdict) so the report can quote them.
//
// The rule under test: a clause that says the price varies by operator / vehicle type / time is kept only when the rows support it. Vehicle types are supported only when the rows
// show DIFFERENT fares for different types; a row that lists types beside ONE fare ("Xe giường nằm & Limousine VIP" beside "từ 165.000đ") does not.

const U = 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html'
// the six rows of the live 2026-10-12 coach turn (Round 33, chat A)
const LIVE_ROWS = [
  { title: 'FUTA Bus Lines', link: 'https://futabus.vn/', snippet: 'Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện thoại tổng đài đặt vé xe phương trang: 1900 6067.' },
  { title: 'Vé xe Phương Trang từ Sài Gòn đi Quy Nhơn - Bình Định', link: U, snippet: 'Với giá vé chỉ từ 410000 đ và các tiện ích trên xe như: Đang cập nhật. Mỗi ngày nhà xe Phương Trang có 29 chuyến xe đi Sài Gòn đi Quy Nhơn - Bình Định.' },
  { title: 'công ty phương trang khai trương tuyến bến xe an sương', link: 'https://futabus.vn/tin-tuc/cong-ty-phuong-trang-khai-truong-tuyen-ben-xe-an-suong-ben-xe-quy-nhon', snippet: 'Với mức giá ưu đãi chỉ 350.000 VNĐ, Quý Khách sẽ được trải nghiệm hành trình 625km trên dòng xe cao cấp KimLong 99 VIP.' },
  { title: 'BẾN XE QUY NHƠN ⏰Vừa qua, Công ty Phương Trang đã ...', link: 'https://www.facebook.com/xephuongtrang/posts/c%C3%B4ng-ty', snippet: 'Với mức giá ưu đãi chỉ 350.000 VNĐ, Quý Khách sẽ được trải nghiệm hành trình 625km trên dòng xe cao cấp KimLong 99 VIP. Xe được thiết kế với ...' },
  { title: 'Xe Phương Trang | Đặt Vé Online, Giá Vé 2026 & Số điện ...', link: 'https://www.redbus.vn/ve-xe-khach/nha-xe/phuong-trang', snippet: 'Đặt vé xe Phương Trang (FUTA Bus Lines) online tại redBus. Giá vé từ 165.000đ, 92 tuyến, 350+ điểm bán. Xe giường nằm & Limousine VIP — chọn ghế, trả online ...' },
  { title: 'Công ty cổ phần xe khách Phương Trang', link: 'https://futabus.vn/tin-tuc/phuong-trang-futa-bus-lines-nang-cap', snippet: 'Đặt vé xe Phương Trang đi liên tỉnh trực tuyến. Số điện tổng đài thoại đặt vé xe phương trang: 1900 6067. Đặt vé nhanh qua ứng dụng Android, ...' },
]
// rows where the fare DIFFERS by vehicle type (one operator, two types, two fares)
const TYPED_ROWS = [
  { title: 'Xe giường nằm Phương Trang', link: 'https://a.example/giuong-nam', snippet: 'Xe giường nằm Phương Trang TP.HCM đi Quy Nhơn giá 450.000đ một chiều.' },
  { title: 'Xe limousine Phương Trang', link: 'https://b.example/limousine', snippet: 'Xe limousine Phương Trang TP.HCM đi Quy Nhơn giá 650.000đ một chiều.' },
]

const QV = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
const QE = 'Bus from Ho Chi Minh City to Quy Nhon on 24/10/2026, how much?'
async function final(rows: typeof LIVE_ROWS, text: string, o: { flag: boolean; lang?: 'vi' | 'en' }) {
  const lang = o.lang ?? 'vi'
  const Q = lang === 'en' ? QE : QV
  const collector = createEnrichmentCollector(Q)
  collector.agentMode = true
  collector.semanticRanking = true
  if (o.flag) collector.consultative = true
  const frames = [
    '9:{"toolCallId":"t1","toolName":"get_transport_options","args":{"origin":"TP.HCM","destination":"Quy Nhơn","mode":"intercity","date":"2026-10-24"}}',
    'a:' + JSON.stringify({ toolCallId: 't1', result: { type: 'intercity', origin: 'TP.HCM', destination: 'Quy Nhơn', bus_search_results: rows, train_search_results: [], note: 'x' } }),
    '0:' + JSON.stringify(text),
    'd:{"finishReason":"stop"}',
  ]
  const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), lang, collector, (async () => new Map()) as never, undefined, undefined, true, Q, false, (async () => ({ perPlace: new Map(), batch: null })) as never)
  const lines = (await new Response(res.body).text()).split('\n').filter(Boolean)
  return lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
}
const SRC = /^\s*(?:Giá theo kết quả tìm kiếm của|Prices as listed in the search results of|Nguồn|Sources)\b/
/** The reply without its source lines must read as finished prose: no dangling punctuation, no doubled spaces, no empty brackets, every line ends like a sentence. */
function readable(t: string) {
  const body = t.split('\n').filter(l => l.trim() && !SRC.test(l))
  for (const l of body) {
    expect(l).not.toMatch(/[;,]\s*[.!?]/)
    expect(l).not.toMatch(/[ \t]{2,}/)
    expect(l).not.toMatch(/\(\s*\)|\*\*\s*\*\*/)
    expect(l).not.toMatch(/\s[,;.!?](?!\d)/)
    expect(l).not.toMatch(/^[\s,;.]/)
    expect(l.trim()).toMatch(/[.!?…)*\]]$/)
  }
}
const log = (name: string, input: string, out: string, verdict: string) => console.log('CASE ' + JSON.stringify({ name, model_input: input, final: out, verdict }))
const SRC_LINE = `\n\nGiá theo kết quả tìm kiếm của: [vexere.com](${U})`

describe('DROPPED: variation by vehicle type the rows do not support (one fare, types only listed)', () => {
  it('LIVE round 2 — the model wrote "theo nhà xe và loại xe"; the redbus row lists "Xe giường nằm & Limousine VIP" beside ONE fare → the whole clause goes', async () => {
    const input = 'Vé xe khách TP.HCM–Quy Nhơn ngày **24/10/2026** đang được niêm yết **từ 410.000đ/chiều** trên Vexere; giá thực tế thay đổi theo nhà xe và loại xe. tra cứu ngày 12/10/2026.'
    const out = await final(LIVE_ROWS, input, { flag: true })
    expect(out).toBe('Vé xe khách TP.HCM–Quy Nhơn ngày **24/10/2026** đang được niêm yết **từ 410.000đ/chiều** trên Vexere. tra cứu ngày 12/10/2026.' + SRC_LINE)
    readable(out)
    expect(out).toContain('**từ 410.000đ/chiều**') // the price is unchanged
    expect(out).toContain(`](${U})`) // so is the source link
    log('live_r2_operator_and_vehicle', input, out, 'DROPPED (operator: one operator in the rows; vehicle type: types listed beside one fare)')
  })
  it('the round-3 wording on the same rows', async () => {
    const input = 'Vé xe từ **410.000đ/chiều**. Giá thay đổi theo loại xe.'
    const out = await final(LIVE_ROWS, input, { flag: true })
    expect(out).toBe('Vé xe từ **410.000đ/chiều**.' + SRC_LINE)
    readable(out)
    log('vehicle_only_sentence', input, out, 'DROPPED')
  })
  it.each([
    ['Giá từ 410.000đ, tùy loại ghế.', 'Giá từ 410.000đ.'],
    ['Giá từ 410.000đ, tuỳ theo loại xe và giờ chạy.', 'Giá từ 410.000đ.'],
    ['Giá từ 410.000đ; mức giá còn khác nhau giữa các loại xe.', 'Giá từ 410.000đ.'],
  ])('trailing phrase: %s', async (input, expected) => {
    const out = await final(LIVE_ROWS, input, { flag: true })
    expect(out).toBe(expected + SRC_LINE)
    readable(out)
    log('trailing_' + input.slice(0, 24), input, out, 'DROPPED')
  })
  it('English: "Prices vary by seat type and operator" is dropped whole, "From 410,000đ." stays', async () => {
    const input = 'From 410,000đ. Prices vary by seat type and operator.'
    const out = await final(LIVE_ROWS, input, { flag: true, lang: 'en' })
    expect(out.split('\n')[0]).toBe('From 410,000đ.')
    expect(out).not.toMatch(/vary|seat type|operator/i)
    readable(out)
    log('english_vehicle_and_operator', input, out, 'DROPPED')
  })
  it('English: "The fare depends on the bus type" and "differs by ticket class"', async () => {
    for (const claim of ['The fare depends on the bus type.', 'Fares differ by ticket class.']) {
      const out = await final(LIVE_ROWS, `From 410,000đ. ${claim}`, { flag: true, lang: 'en' })
      expect(out).not.toMatch(/depends|differ/i)
      readable(out)
      log('english_' + claim.slice(0, 20), `From 410,000đ. ${claim}`, out, 'DROPPED')
    }
  })
  it('CONTROL — flag off: the model text reaches the user untouched', async () => {
    const input = 'Vé xe từ **410.000đ/chiều**; giá thực tế thay đổi theo nhà xe và loại xe.'
    const out = await final(LIVE_ROWS, input, { flag: false })
    expect(out).toContain('giá thực tế thay đổi theo nhà xe và loại xe')
    log('control_flag_off', input, out, 'KEPT (flag off: no change)')
  })
})

describe('KEPT: variation by vehicle type the rows support (two types, two different fares)', () => {
  it('the clause stays word for word; prices and sources unchanged', async () => {
    const input = 'Vé xe khách TP.HCM–Quy Nhơn có hai mức: **450.000đ** (giường nằm) và **650.000đ** (limousine); giá thay đổi theo loại xe. Bạn xem thêm trên Vexere.'
    const out = await final(TYPED_ROWS as never, input, { flag: true })
    expect(out).toContain('giá thay đổi theo loại xe. Bạn xem thêm trên Vexere.')
    expect(out).toContain('**450.000đ**')
    expect(out).toContain('**650.000đ**')
    expect(out.startsWith('Vé xe khách TP.HCM–Quy Nhơn có hai mức: **450.000đ** (giường nằm) và **650.000đ** (limousine); giá thay đổi theo loại xe. Bạn xem thêm trên Vexere.')).toBe(true)
    readable(out)
    log('kept_two_types_two_fares', input, out, 'KEPT (giường nằm 450.000đ vs limousine 650.000đ in the rows)')
  })
  it('English: "Price varies by seat type" stays', async () => {
    const input = 'From 450,000đ to 650,000đ. Price varies by seat type.'
    const out = await final(TYPED_ROWS as never, input, { flag: true, lang: 'en' })
    expect(out).toContain('Price varies by seat type.')
    expect(out).toContain('450,000đ')
    expect(out).toContain('650,000đ')
    readable(out)
    log('kept_english_two_types', input, out, 'KEPT')
  })
  it('one operator, two types: "theo hãng và loại xe" loses the operator, keeps the vehicle type', async () => {
    const input = 'Vé xe từ **450.000đ** đến **650.000đ**; giá thay đổi theo hãng và loại xe.'
    const out = await final(TYPED_ROWS as never, input, { flag: true })
    expect(out).toContain('giá thay đổi theo loại xe.')
    expect(out).not.toMatch(/theo hãng|nhà xe/)
    readable(out)
    log('kept_vehicle_dropped_operator', input, out, 'PARTLY KEPT (operator dropped, vehicle type kept)')
  })
})
