import { describe, it, expect } from 'vitest'
import { noFabricationGate } from './noFabricationGate'

// CONSULT_V3 Đợt 2 (owner 17/10): with source chips shown (`quietAged`), the "Lưu ý: … giá ở trên …" line is not added; the claim itself is
// judged exactly as before (same counts). Fixture shaped like freshness.test.ts.
const corpus = [JSON.stringify({ results: [{ title: 'iPhone 16 128GB', price: 19990000, snippet: 'Giá 19.990.000đ' }], retrieved_at: '2026-10-08T20:00:00Z', freshness: { data_class: 'price', status: 'stale' } })]
const ev = { corpus, userTexts: ['iPhone 16 giá bao nhiêu'], tools: ['search_products'], agedPrices: [{ amount: 19990000, at: null }] }
const reply = 'iPhone 16 128GB đang bán 19.990.000đ ở shop A.'

describe('noFabricationGate — labelEstimates (CONSULT_V3, eval 17/10 rc-5)', () => {
  const noEv = { corpus: [] as string[], userTexts: ['món chay đơn giản cho 2 người ăn tối'], tools: [] as string[] }
  it('a generic cost with no source is kept and marked "(ước tính)" instead of cutting the sentence', () => {
    const r = noFabricationGate('- Đậu hũ sốt cà chua: dễ nấu, chi phí 60.000đ cho 2 người.', noEv, { labelEstimates: true })
    expect(r.text).toContain('60.000đ (ước tính)')
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.text).not.toContain('chưa xác minh')
  })
  it('a cost already said as an estimate ("khoảng") is kept as is', () => {
    const t = '- Canh rau củ: khoảng 40.000đ cho 2 người.'
    expect(noFabricationGate(t, noEv, { labelEstimates: true }).text).toBe(t)
  })
  it('without the option (unchanged): the generic cost sentence is cut with the note', () => {
    const r = noFabricationGate('- Đậu hũ sốt cà chua: dễ nấu, chi phí 60.000đ cho 2 người.', noEv)
    expect(r.text).not.toContain('60.000đ')
  })
  it('a price said of a NAMED place with no source is still cut, even with the option', () => {
    const ev = { corpus: [JSON.stringify({ results: [{ name: 'Phở Lệ', address: '413 Nguyễn Trãi' }] })], userTexts: ['phở ngon'], tools: ['search_places'] }
    const r = noFabricationGate('**Phở Lệ** giá 85.000đ một tô.', ev, { labelEstimates: true })
    expect(r.text).not.toContain('85.000đ')
  })
})

describe('noFabricationGate — CONSULT_V3 availability admissions and the plain note (UAT 17/10, "iPhone Duo")', () => {
  const noEv = { corpus: [] as string[], userTexts: ['muốn mua cái iphone duo, coi sài gòn chổ nào còn hàng tui mua'], tools: [] as string[] }
  // the model's own draft from the UAT log
  const DUO = 'Pa nói **“iPhone Duo”** — tui chưa xác định được đây là mẫu iPhone nào, nên chưa thể kiểm tra cửa hàng ở Sài Gòn còn hàng để mua. Tui không muốn đoán nhầm mẫu rồi chỉ pa chạy lòng vòng. **Pa đang muốn mua mẫu nào?**\n1. iPhone 17\n2. iPhone 17 Pro / Pro Max\n3. iPhone Air\n4. Mẫu khác — gửi tên nhé'
  it('"chưa thể kiểm tra … còn hàng" admits; it states no availability — kept, no note', () => {
    const r = noFabricationGate(DUO, noEv, { labelEstimates: true })
    expect(r.text).toBe(DUO)
    expect(r.counts.FABRICATED).toBe(0)
    expect(r.noteAdded).toBe(false)
  })
  it('without the option (unchanged): the admission is cut and the bracketed note added — the measured defect', () => {
    const r = noFabricationGate(DUO, noEv)
    expect(r.text).toContain('(chưa có nguồn tra cứu cho số liệu này)')
  })
  it('V3: a real availability claim with no source is still cut; the note is one plain sentence BEFORE the closing question', () => {
    const t = 'Cửa hàng ABC ở Quận 1 đang còn hàng iPhone 17.\n\n**Bạn muốn mua bản nào?**\n1. 256GB\n2. 512GB'
    const r = noFabricationGate(t, noEv, { labelEstimates: true })
    expect(r.text).not.toContain('còn hàng iPhone 17')
    expect(r.text).not.toContain('(chưa có nguồn')
    expect(r.text).toBe('Mình chưa có nguồn đáng tin cho tình trạng còn chỗ / còn hàng / đang mở, nên chưa nêu cụ thể.\n\n**Bạn muốn mua bản nào?**\n1. 256GB\n2. 512GB')
  })
})

describe('noFabricationGate — quietAged', () => {
  it('default: the unknown-time note is added (unchanged)', () => {
    const r = noFabricationGate(reply, ev)
    expect(r.text).toContain('chưa rõ giá ở trên được lấy lúc nào')
    expect(r.noteAdded).toBe(true)
  })
  it('quietAged: no note, the sentence and the claim verdicts are the same', () => {
    const loud = noFabricationGate(reply, ev)
    const quiet = noFabricationGate(reply, ev, { quietAged: true })
    expect(quiet.text).not.toContain('Lưu ý')
    expect(quiet.text).toContain('19.990.000đ')
    expect(quiet.noteAdded).toBe(false)
    expect(quiet.counts).toEqual(loud.counts)
  })
  it('quietAged never hides a fabricated figure: an unsupported price is still removed with its line', () => {
    const r = noFabricationGate('iPhone 16 128GB đang bán 12.345.000đ ở shop B.', ev, { quietAged: true })
    expect(r.text).not.toContain('12.345.000đ')
    expect(r.counts.FABRICATED).toBeGreaterThan(0)
  })
})
