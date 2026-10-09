// @vitest-environment node
// Phase 8 POST-UAT (2026-10-09) · Fix group 1 — No-Fabrication Gate false positives (B2, UAT-07). Pure: no network, no model.
import { describe, it, expect } from 'vitest'
import { noFabricationGate, evalExpression, arithmeticIn, type GateEvidence } from '@/lib/ai/noFabricationGate'

const ev = (o: Partial<GateEvidence> = {}): GateEvidence => ({ corpus: [], userTexts: [], tools: [], ...o })
const gate = (text: string, o: Partial<GateEvidence> = {}) => noFabricationGate(text, ev(o), { lang: 'vi' })

describe('POST-UAT B2 · deterministic arithmetic', () => {
  it.each([
    ['100 triệu × 5% × 12/12', 5_000_000],
    ['100 triệu + 5 triệu', 105_000_000],
    ['100.000.000 x (1 + 5%)^2', 110_250_000],
    ['50 triệu - 32 triệu', 18_000_000],
    ['1.200.000 × (100% - 15%)', 1_020_000],
    ['200 USD × 25.000', 5_000_000],
    ['3 x 150k', 450_000],
  ])('%s = %d', (expr, v) => {
    const r = evalExpression(expr.replace('USD ', ''))
    expect(r).not.toBeNull()
    expect(Math.abs((r as number) - v)).toBeLessThan(1)
  })
  it('a shown result is checked against its own formula: right → checked, wrong → wrong', () => {
    expect(arithmeticIn('Tổng cộng = 100 triệu + 5 triệu = 105 triệu đồng.').checked).toContain(105_000_000)
    expect(arithmeticIn('Tổng cộng = 100 triệu + 5 triệu = 106 triệu đồng.').wrong).toContain(106_000_000)
    expect(arithmeticIn('Không có phép tính nào ở đây, chỉ 105 triệu.')).toEqual({ checked: [], wrong: [] })
  })
})

describe('POST-UAT B2 · valid derived results stay visible (UAT-07 and the calculation family)', () => {
  const U07 = 'Tôi gửi 100 triệu đồng với lãi suất giả định 5%/năm, tính lãi đơn trong 12 tháng. Tôi nhận được bao nhiêu tiền lãi và tổng cộng bao nhiêu?'
  it('UAT-07 as measured: interest, then the total on its own line — both kept, no warning appended', () => {
    const reply = 'Lãi đơn = 100 triệu × 5% × 12/12 = 5 triệu đồng.\n\nTổng cộng bạn nhận được 105 triệu đồng (100 triệu gốc + 5 triệu lãi).'
    const r = gate(reply, { userTexts: [U07] })
    expect(r.text).toBe(reply)
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.noteAdded).toBe(false)
  })
  it('UAT-07 variant: the total stated BEFORE its parts are spelled out (a × (1 + p%))', () => {
    const reply = 'Bạn nhận tổng cộng 105 triệu đồng sau 12 tháng, trong đó tiền lãi là 5 triệu đồng.'
    const r = gate(reply, { userTexts: [U07] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('compound interest with explicit assumptions', () => {
    const u = 'Gửi 100 triệu, lãi kép giả định 5%/năm trong 2 năm thì được bao nhiêu?'
    const reply = 'Sau 2 năm: 100 triệu × (1 + 5%)^2 = 110,25 triệu đồng, tức lãi 10,25 triệu đồng.'
    const r = gate(reply, { userTexts: [u] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('revenue minus expenses', () => {
    const u = 'Doanh thu tháng 80 triệu, chi phí 62 triệu. Lợi nhuận bao nhiêu, biên lợi nhuận bao nhiêu %?'
    const reply = 'Lợi nhuận = 80 triệu − 62 triệu = 18 triệu đồng. Biên lợi nhuận = 18/80 = 22,5%.'
    const r = gate(reply, { userTexts: [u] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('percentage discount', () => {
    const u = 'Áo giá 1.200.000đ giảm 15% thì còn bao nhiêu?'
    const reply = 'Bạn được giảm 180.000đ, giá sau giảm là 1.020.000đ.'
    const r = gate(reply, { userTexts: [u] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('budget allocation from the user budget (estimates labelled)', () => {
    const u = 'Ngân sách 10 triệu cho đám cưới nhỏ, chia giúp mình.'
    const reply = 'Gợi ý chia ngân sách 10 triệu:\n- Ăn uống: khoảng 6 triệu (60%).\n- Trang trí: khoảng 2 triệu (20%).\n- Dự phòng: 2 triệu.'
    const r = gate(reply, { userTexts: [u] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('loan payment (equal principal) calculation', () => {
    const u = 'Vay 120 triệu trả trong 12 tháng, lãi suất giả định 10%/năm tính trên dư nợ ban đầu. Mỗi tháng trả bao nhiêu?'
    const reply = 'Gốc mỗi tháng = 120 triệu / 12 = 10 triệu. Lãi mỗi tháng = 120 triệu × 10% / 12 = 1 triệu. Mỗi tháng trả 11 triệu đồng.'
    const r = gate(reply, { userTexts: [u] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('currency conversion with a user-supplied hypothetical rate', () => {
    const u = 'Giả sử 1 USD = 25.000 đồng, 200 USD là bao nhiêu tiền Việt?'
    const reply = '200 USD × 25.000 = 5.000.000 đồng.'
    const r = gate(reply, { userTexts: [u] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
})

describe('POST-UAT B2 · unsupported current market figures stay blocked', () => {
  it('a current exchange rate with no source is removed', () => {
    const r = gate('Tỷ giá USD hôm nay là 25.480 đồng.', { userTexts: ['Tỷ giá USD hôm nay bao nhiêu?'] })
    expect(r.counts.FABRICATED).toBeGreaterThan(0)
    expect(r.text).not.toMatch(/25\.480/)
  })
  it('a current gold price with no source is removed; the note does not claim a source was checked when none was', () => {
    const r = gate('Giá vàng SJC hôm nay khoảng 143 triệu đồng/lượng.', { userTexts: ['Giá vàng hôm nay?'] })
    expect(r.text).not.toMatch(/143/)
    expect(r.text).toMatch(/chưa có nguồn tra cứu/)
    expect(r.text).not.toMatch(/từ nguồn đã tra/)
  })
  it('with a lookup this turn the note still says "from the sources checked"', () => {
    const r = gate('Giá vàng SJC hôm nay khoảng 143 triệu đồng/lượng.', { userTexts: ['Giá vàng hôm nay?'], tools: ['web_search'], corpus: ['{"results":[]}'] })
    expect(r.text).toMatch(/từ nguồn đã tra/)
  })
  it('a wrong calculation is not made true by being written as one', () => {
    const u = 'Tôi gửi 100 triệu đồng lãi 5%/năm 12 tháng, tổng bao nhiêu?'
    const r = gate('Tổng = 100 triệu + 5 triệu = 107 triệu đồng.', { userTexts: [u] })
    expect(r.text).not.toMatch(/107/)
    expect(r.counts.FABRICATED).toBe(1)
  })
  it('an invented input does not become valid because the arithmetic on it is right', () => {
    const r = gate('iPhone 17 Pro Max giá 34.990.000đ, mua 2 chiếc = 34.990.000đ × 2 = 69.980.000đ.', { userTexts: ['Mua 2 iPhone 17 Pro Max hết bao nhiêu?'] })
    expect(r.text).not.toMatch(/34\.990\.000/)
    expect(r.counts.FABRICATED).toBeGreaterThan(0)
  })
  it('an unrelated plain statement next to a calculation gets no warning', () => {
    const u = 'Lãi 5% của 100 triệu là bao nhiêu?'
    const r = gate('5% của 100 triệu là 5 triệu đồng. Đây là phép tính đơn giản trên số bạn đưa.', { userTexts: [u] })
    expect(r.noteAdded).toBe(false)
  })
})

describe('POST-UAT B3 · the gate agrees with the budget scope (runs after snippet_price)', () => {
  it('UAT-25: an allocation of the user envelope passes the gate (no "khoảng" needed)', () => {
    const reply = 'Chia ngân sách tham khảo như sau:\n- Ăn sáng: 40.000đ\n- Ăn trưa: 70.000đ\n- Vé tham quan: 65.000đ\n- Dự phòng: 255.000đ'
    const r = gate(reply, { userTexts: ['Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng.', 'Giảm ngân sách xuống 700.000 đồng.'] })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('a place-named line in the same split is still a merchant claim → removed', () => {
    const r = gate('Chia ngân sách như sau:\n- Ăn trưa ở Phở Hòa Pasteur: 95.000đ\n- Cà phê: 50.000đ', { userTexts: ['ngân sách 700.000 đồng'] })
    expect(r.text).not.toMatch(/95\.000/)
    expect(r.text).toMatch(/Cà phê: 50\.000đ/)
  })
  it('without a planning frame or a user envelope, a bare price stays judged', () => {
    const r = gate('Ăn trưa: 70.000đ.', { userTexts: ['quán ăn trưa nào ngon?'] })
    expect(r.counts.FABRICATED).toBe(1)
  })
})

describe('POST-UAT B3 · gate allocation rule, sharpened after the mutation run (P5 / P5b / P5c survived)', () => {
  const U = ['Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng.', 'Giảm ngân sách xuống 700.000 đồng.']
  it('P5 — non-derivable split items (no "khoảng") are kept only by the allocation rule', () => {
    const reply = 'Chia ngân sách tham khảo như sau:\n- Ăn sáng: 45.000đ\n- Ăn trưa: 85.000đ\n- Cà phê: 55.000đ\n- Ăn tối: 135.000đ'
    const r = gate(reply, { userTexts: U })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(reply)
  })
  it('P5b — a price for the place named on the line above is that place\'s price, not an allowance', () => {
    // (no "phí" in the sentence: "phí" makes the amount a market figure, judged on another path)
    const r = gate('Mình chọn **Phở Lệ Quận 5** cho bữa trưa.\nDự kiến bữa này hết 85.000đ/người.', { userTexts: U })
    expect(r.text).not.toMatch(/85\.000/)
  })
  it('P5c — "hợp ngân sách" is a mention, not a split: an unsupported price stays judged', () => {
    const r = gate('Bữa trưa ở đây 85.000đ/người, rất hợp ngân sách của bạn.', { userTexts: U })
    expect(r.text).not.toMatch(/85\.000/)
  })
})

describe('POST-UAT · gate on the UAT-25 post-fix shapes', () => {
  const U = ['Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng.', 'Giảm ngân sách xuống 700.000 đồng.']
  it('an itinerary time-slot label is not an opening-hours claim', () => {
    const t = '- **10:30–12:00:** Đi bộ quanh khu trung tâm hoặc nghỉ ở công viên ven sông; ưu tiên hoạt động miễn phí.'
    const r = gate(t, { userTexts: U })
    expect(r.text).toBe(t)
  })
  it('but a venue\'s hours stated in the sentence are still judged', () => {
    const r = gate('- **10:30–12:00:** Dinh Độc Lập mở cửa từ 8:00 đến 16:30.', { userTexts: U })
    expect(r.text).not.toMatch(/16:30/)
  })
  it('itinerary slot allowances pass the gate with the user envelope', () => {
    const t = 'Lịch một ngày:\n- **07:30–08:30:** Ăn sáng bình dân: **45–65 nghìn**.\n- **16:00–17:00:** Cà phê: **35–55 nghìn**.'
    const r = gate(t, { userTexts: U })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(t)
  })
})

describe('POST-UAT · UAT-25 t1 post-fix shapes: an expense breakdown is not a market fee', () => {
  const U = ['Lập kế hoạch một ngày ở TP.HCM theo ngân sách 1 triệu đồng, có lịch trình và các lựa chọn ăn uống phù hợp.']
  it('"Ngân sách dự kiến: ăn uống 410.000đ + … + vé/chi phí phát sinh 200.000đ = 910.000đ" is kept, even after a named restaurant', () => {
    const t = '- **12:00 – 13:00 | Ăn trưa:** **Nhà Hàng Hai Lúa Sài Gòn** hoặc cơm tấm bình dân.\n**Ngân sách dự kiến:** ăn uống **410.000đ** + cà phê **100.000đ** + đi lại **200.000đ** + vé/chi phí phát sinh **200.000đ** = **910.000đ**.'
    const r = gate(t, { userTexts: U })
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).toBe(t)
  })
  it('a fee is still a market figure ("phí giao hàng 15.000đ" from memory is removed)', () => {
    expect(gate('Phí giao hàng hiện là 15.000đ.', { userTexts: ['ship đồ ăn mất bao nhiêu'] }).text).not.toMatch(/15\.000/)
  })
})

describe('POST-UAT · labelled sums are checked too', () => {
  it('right → checked; wrong → wrong', () => {
    expect(arithmeticIn('Ngân sách dự kiến: ăn uống 410.000đ + cà phê 100.000đ + đi lại 200.000đ = 710.000đ.').checked).toContain(710_000)
    expect(arithmeticIn('Ngân sách dự kiến: ăn uống 410.000đ + cà phê 100.000đ + đi lại 200.000đ = 760.000đ.').wrong).toContain(760_000)
  })
})
