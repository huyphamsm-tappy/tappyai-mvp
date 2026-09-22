import { describe, expect, it } from 'vitest'
import { applyRiskBackstop, coveredRiskTopics, guardNumericThresholds, isSecondHandPurchaseAdvice, RISK_BLOCK } from './riskBackstop'

// ── F-043 (2026-09-22): the deterministic half of "risks first" ──────────────
//
// Golden T4 t2 on final2-v2 came back cosmetic-first with "(dưới 70% giá mới)" and "(nếu chênh
// >20% = pin chai)" after the prompt rule had held on three earlier runs. The fixtures below are
// that reply (abridged) and the compliant one from the run before it.

const T4_THREAD = ['muốn mua máy macbook pro m1', 'mua máy cũ thì cần check cái gì']
const COSMETIC_FIRST = [
  'Khi mua MacBook Pro M1 cũ, bạn cần check những điều này theo thứ tự:',
  '',
  '**Trước khi gặp (qua ảnh/video):**',
  '- Yêu cầu shop gửi ảnh chi tiết: màn hình, bàn phím, trackpad, cạnh máy, đáy máy',
  '- Kiểm tra giá: nếu rẻ bất thường so với giá chung (dưới 70% giá mới) → cần nghi ngờ',
  '',
  '**Khi gặp trực tiếp (QUAN TRỌNG):**',
  '1. **Pin** — mở System Report → Power → xem "Condition" (phải là "Normal"), dung lượng thiết kế vs hiện tại (nếu chênh >20% = pin chai)',
  '2. **Màn hình** — bật màn hình trắng, xem có chấm đen, vết sáng, hay vết trầy không',
  '',
  '[FOLLOWUPS]Kiểm tra pin thế nào|Shop nào uy tín[/FOLLOWUPS]',
].join('\n')
const COMPLIANT = [
  'Khi mua máy cũ, bạn cần check những điều này theo thứ tự **RỦI RO TRƯỚC, TÌNH TRẠNG SAU**:',
  '1. **Quyền sở hữu & giấy tờ** — máy có bị khóa iCloud không, có bị khóa Activation Lock không',
  '2. **Cách thanh toán an toàn** — gặp trực tiếp, kiểm tra xong mới trả tiền (KHÔNG chuyển tiền trước qua link lạ)',
  '3. Dấu hiệu lừa đảo: cọc trước rồi biến mất, giá rẻ bất thường',
  'Trước khi chuyển tiền, bạn dán tin nhắn, link hoặc mã QR của người bán vào **Cảnh báo lừa đảo** trong TappyAI để kiểm tra nhé.',
].join('\n')

describe('isSecondHandPurchaseAdvice', () => {
  it('the golden threads', () => {
    expect(isSecondHandPurchaseAdvice(T4_THREAD)).toBe(true)
    expect(isSecondHandPurchaseAdvice(['mua iPhone 13 cũ thì cần check gì'])).toBe(true)
    expect(isSecondHandPurchaseAdvice(['mua xe máy cũ Honda Wave cần kiểm tra gì'])).toBe(true)
    expect(isSecondHandPurchaseAdvice(['mua ô tô cũ tầm 300 triệu cần check gì'])).toBe(true)
    expect(isSecondHandPurchaseAdvice(['mua đồ cũ trên group Facebook thì lưu ý gì'])).toBe(true)
  })
  it('not a place turn, not a new-product search, not the first T4 turn alone', () => {
    expect(isSecondHandPurchaseAdvice(['trưa nay ăn gì cho ngon'])).toBe(false)
    expect(isSecondHandPurchaseAdvice(['mua iPhone 15 mới ở đâu rẻ'])).toBe(false)
    expect(isSecondHandPurchaseAdvice(['muốn mua máy macbook pro m1'])).toBe(false)
    expect(isSecondHandPurchaseAdvice(['quán cà phê cũ kỹ ở Quận 3'])).toBe(false)
  })
})

describe('coveredRiskTopics', () => {
  it('reads the four topics off the compliant reply and misses them on the cosmetic one', () => {
    expect([...coveredRiskTopics(COMPLIANT)].sort()).toEqual(['fraud', 'lock', 'ownership', 'payment'])
    const cosmetic = coveredRiskTopics(COSMETIC_FIRST)
    expect(cosmetic.has('ownership')).toBe(false)
    expect(cosmetic.has('lock')).toBe(false)
    expect(cosmetic.has('payment')).toBe(false)
  })
})

describe('applyRiskBackstop', () => {
  it('🚨 the measured cosmetic-first reply gets the missing lines, the pointer, and loses its threshold parentheticals', () => {
    const out = applyRiskBackstop(COSMETIC_FIRST, T4_THREAD, 'vi')
    expect(out.appended).toEqual(expect.arrayContaining(['ownership', 'lock', 'payment']))
    expect(out.pointerAppended).toBe(true)
    expect(out.thresholdsRemoved).toBe(2)
    expect(out.text).not.toContain('dưới 70% giá mới')
    expect(out.text).not.toContain('>20%')
    expect(out.text).toContain(RISK_BLOCK.vi.header)
    expect(out.text).toContain(RISK_BLOCK.vi.lines.ownership)
    expect(out.text).toContain(RISK_BLOCK.vi.pointer)
    // Appended BEFORE the structured block, so the client still finds its marker.
    expect(out.text.indexOf(RISK_BLOCK.vi.pointer)).toBeLessThan(out.text.indexOf('[FOLLOWUPS]'))
    // The model's own prose is intact (parentheticals aside).
    expect(out.text).toContain('- Kiểm tra giá: nếu rẻ bất thường so với giá chung → cần nghi ngờ')
    expect(out.text).toContain('bật màn hình trắng')
  })

  it('a compliant reply is left byte-identical', () => {
    const out = applyRiskBackstop(COMPLIANT, T4_THREAD, 'vi')
    expect(out.text).toBe(COMPLIANT)
    expect(out.appended).toEqual([])
    expect(out.pointerAppended).toBe(false)
  })

  it('a reply that covers three topics gets ONE line, not the whole block', () => {
    const threeOfFour = COMPLIANT.split('\n').filter(l => !/Cách thanh toán/.test(l)).join('\n')
    const out = applyRiskBackstop(threeOfFour, T4_THREAD, 'vi')
    expect(out.appended).toEqual(['payment'])
    expect(out.text).not.toContain(RISK_BLOCK.vi.lines.ownership)
    expect(out.text).toContain(RISK_BLOCK.vi.lines.payment)
  })

  it('inert outside a second-hand purchase thread, whatever the reply says', () => {
    const out = applyRiskBackstop('Quán này 4.8⭐ (dưới 50% khách chê).', ['trưa nay ăn gì'], 'vi')
    expect(out.text).toBe('Quán này 4.8⭐ (dưới 50% khách chê).')
  })

  it('live path: appends at the END (markers already on the wire) and removes nothing', () => {
    const out = applyRiskBackstop(COSMETIC_FIRST, T4_THREAD, 'vi', { live: true })
    expect(out.text.startsWith(COSMETIC_FIRST)).toBe(true)
    expect(out.thresholdsRemoved).toBe(0)
    expect(out.thresholdHedged).toBe(true)
    expect(out.text).toContain(RISK_BLOCK.vi.thresholdHedge)
    expect(out.text.indexOf(RISK_BLOCK.vi.pointer)).toBeGreaterThan(out.text.indexOf('[/FOLLOWUPS]'))
  })

  it('the block never mentions a phone number or bank account', () => {
    for (const l of [RISK_BLOCK.vi, RISK_BLOCK.en]) {
      const all = [l.header, ...Object.values(l.lines), l.pointer, l.thresholdHedge].join('\n')
      expect(all).not.toMatch(/số điện thoại|sđt|số tài khoản|tài khoản ngân hàng|phone number|bank account|account number/i)
      expect(all).not.toMatch(/\d+\s*%/)
    }
  })

  it('English thread gets the English block', () => {
    const out = applyRiskBackstop('Check the screen and the keyboard.', ['should I buy a used macbook, what to check'], 'en')
    expect(out.text).toContain(RISK_BLOCK.en.header)
    expect(out.text).toContain(RISK_BLOCK.en.pointer)
  })
})

describe('guardNumericThresholds', () => {
  it('drops threshold parentheticals only', () => {
    const out = guardNumericThresholds('Lốp còn bao nhiêu % (nên ≥50%), phuộc có lỏng không. Pin (dưới 70% là chai) thay đi.', 'vi')
    expect(out.removed).toBe(2)
    expect(out.text).toBe('Lốp còn bao nhiêu %, phuộc có lỏng không. Pin thay đi.')
    expect(out.hedged).toBe(false)
  })
  it('an inline threshold is hedged, not cut', () => {
    const out = guardNumericThresholds('Giá rẻ hơn thị trường chênh >30% là cần nghi.', 'vi')
    expect(out.removed).toBe(0)
    expect(out.hedged).toBe(true)
    expect(out.text).toContain('chênh >30%')
    expect(out.text).toContain(RISK_BLOCK.vi.thresholdHedge)
  })
  it('a reported percentage is not a threshold', () => {
    expect(guardNumericThresholds('Thời tiết có mưa nhẹ (46% khả năng mưa).', 'vi')).toEqual({ text: 'Thời tiết có mưa nhẹ (46% khả năng mưa).', removed: 0, hedged: false })
  })
})
