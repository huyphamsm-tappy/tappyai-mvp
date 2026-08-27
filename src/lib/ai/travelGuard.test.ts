import { describe, it, expect } from 'vitest'
import { guardTravelClaimsInText } from './travelGuard'
import { detectTravelIntent } from './intent'

// The fail-closed boundary for dynamic travel facts (P0). The production bug —
// "Flights are typically 200k–400k VND ($8–16 USD)…" with no evidence — must be
// impossible: with no live fare, every travel price the model states is removed.
// The guard is a pure function, so these are exact input→output assertions.

const NO_FARES: number[] = []

describe('travel guard — fail-closed on dynamic prices with no live evidence', () => {
  it('CRITICAL: strips the exact production hallucination (VND + USD, no fares)', () => {
    const text = 'Flights are typically 200k–400k VND ($8–16 USD) one-way on budget airlines like Vietjet or Bamboo Airways.'
    const out = guardTravelClaimsInText(text, NO_FARES, 'flights hcm to nha trang')
    expect(out.text).not.toMatch(/200k|400k|\$8|\$16|200[.,]?000|400[.,]?000/)
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('1. flight without provider (no fares) → the fare is removed', () => {
    const out = guardTravelClaimsInText('Vé máy bay khoảng 350.000 VND một chiều.', NO_FARES, 'đi từ HCM đi Nha Trang')
    expect(out.text).not.toMatch(/350[.,]?000|350k/)
  })

  it('2. flight tool ERROR (no structured fare) → removed', () => {
    const out = guardTravelClaimsInText('Giá vé thường tầm 500k–1.2 triệu.', NO_FARES, 'vé máy bay hà nội đà nẵng')
    expect(out.text).not.toMatch(/500k|1\.2 triệu|1\.200\.000/)
  })

  it('3. flight tool NOT called (pure memory) → removed', () => {
    const out = guardTravelClaimsInText('Bay từ HCM đi Nha Trang chỉ khoảng 300.000đ thôi.', NO_FARES, 'đi từ HCM đi Nha Trang')
    expect(out.text).not.toMatch(/300[.,]?000|300k/)
  })

  it('4. flight WITH valid live fare → the matching fare is kept, a non-matching one removed', () => {
    const fares = [387000]
    const kept = guardTravelClaimsInText('Vietjet 387.000 VND một chiều.', fares, 'vé máy bay')
    expect(kept.text).toMatch(/387[.,]?000/)
    expect(kept.redacted).toBe(0)
    const mixed = guardTravelClaimsInText('Vietjet 387.000 VND, nhưng cũng có chuyến chỉ 99.000 VND.', fares, 'vé máy bay')
    expect(mixed.text).toMatch(/387[.,]?000/)
    expect(mixed.text).not.toMatch(/99[.,]?000/)
  })

  it('5. hotel without a structured price (snippet only) → any stated price removed', () => {
    const out = guardTravelClaimsInText('Khách sạn ở Đà Nẵng khoảng 1.200.000 VND/đêm.', NO_FARES, 'khách sạn đà nẵng')
    expect(out.text).not.toMatch(/1\.200\.000|1\.2 triệu/)
  })

  it('6. a verified structured price passed as evidence is kept', () => {
    const out = guardTravelClaimsInText('Phòng đôi 850.000 VND/đêm.', [850000], 'khách sạn đà nẵng')
    expect(out.text).toMatch(/850[.,]?000/)
    expect(out.redacted).toBe(0)
  })

  it('7. unsupported VND range → removed', () => {
    expect(guardTravelClaimsInText('Tầm 200k–400k VND.', NO_FARES, 'x').text).not.toMatch(/200k|400k/)
  })

  it('8. unsupported USD range → removed', () => {
    expect(guardTravelClaimsInText('Around $8–16 USD one way.', NO_FARES, 'x').text).not.toMatch(/\$8|\$16/)
  })

  it('9. availability hallucination → the sentence is removed', () => {
    const out = guardTravelClaimsInText('Vietjet khai thác tuyến này. Hiện còn 3 chỗ cho chuyến sáng mai.', NO_FARES, 'x')
    expect(out.text).not.toMatch(/còn 3 chỗ/)
    expect(out.text).toMatch(/khai thác tuyến này/) // the static fact stays
  })

  it('10. schedule hallucination → the sentence is removed', () => {
    const out = guardTravelClaimsInText('Vietjet bay tuyến này. Chuyến thường khởi hành lúc 8 giờ sáng.', NO_FARES, 'x')
    expect(out.text).not.toMatch(/8 giờ sáng|khởi hành lúc 8/)
    expect(out.text).toMatch(/bay tuyến này/)
  })

  it('11. discount hallucination (monetary) → removed', () => {
    expect(guardTravelClaimsInText('Đang giảm 500.000 VND cho chặng này.', NO_FARES, 'x').text).not.toMatch(/500[.,]?000/)
  })

  it('12. a booking URL with NO price is left intact (a link is not a claim)', () => {
    const text = 'Bạn xem giá trực tiếp ở đây: [Traveloka](https://www.traveloka.com/flight?from=SGN&to=CXR&d=2026-09-01).'
    const out = guardTravelClaimsInText(text, NO_FARES, 'x')
    expect(out.text).toContain('https://www.traveloka.com/flight?from=SGN&to=CXR')
    expect(out.redacted).toBe(0)
  })

  it('13. a price the USER stated is NEVER stripped', () => {
    const out = guardTravelClaimsInText('Trong tầm 500k của bạn thì có vài lựa chọn.', NO_FARES, 'tìm vé dưới 500k')
    expect(out.text).toMatch(/500k/)
    expect(out.redacted).toBe(0)
  })

  it('14. static travel facts (no dynamic number) are untouched', () => {
    const text = 'Vietjet và Bamboo Airways đều khai thác tuyến HCM–Nha Trang. Khách sạn này có hồ bơi trên sân thượng.'
    const out = guardTravelClaimsInText(text, NO_FARES, 'x')
    expect(out.text).toBe(text)
    expect(out.redacted).toBe(0)
  })

  it('15/16. a prior/known fare passed as evidence survives a follow-up/refinement', () => {
    const out = guardTravelClaimsInText('Như đã tìm, Vietjet 387.000 VND vẫn là rẻ nhất.', [387000], 'còn chuyến nào rẻ hơn không')
    expect(out.text).toMatch(/387[.,]?000/)
  })

  it('17. insufficient-evidence turn keeps prose but drops the invented number', () => {
    const out = guardTravelClaimsInText('Mình chưa có giá vé trực tuyến, nhưng thường tầm 250.000 VND.', NO_FARES, 'x')
    expect(out.text).toMatch(/chưa có giá vé trực tuyến/)
    expect(out.text).not.toMatch(/250[.,]?000/)
  })

  it('18/19. works in both Vietnamese and English', () => {
    expect(guardTravelClaimsInText('Vé tầm 300.000đ.', NO_FARES, 'x').text).not.toMatch(/300[.,]?000/)
    expect(guardTravelClaimsInText('Tickets usually run about 300,000 VND.', NO_FARES, 'x').text).not.toMatch(/300[.,]?000/)
  })

  it('is a no-op when there is nothing dynamic to guard', () => {
    const text = 'Chúc bạn chuyến đi vui vẻ nhé!'
    const out = guardTravelClaimsInText(text, NO_FARES, 'x')
    expect(out.text).toBe(text)
    expect(out.redacted).toBe(0)
  })
})

describe('detectTravelIntent — the guard trigger must catch a bare route', () => {
  it('CRITICAL: catches "đi từ HCM đi Nha Trang" (the case that has no tool keyword)', () => {
    expect(detectTravelIntent('Đi từ HCM đi Nha Trang')).toBe(true)
  })
  it('catches explicit flight/hotel queries', () => {
    expect(detectTravelIntent('giá vé máy bay hà nội đà nẵng')).toBe(true)
    expect(detectTravelIntent('tìm khách sạn ở Phú Quốc')).toBe(true)
    expect(detectTravelIntent('flight from SGN to HAN')).toBe(true)
  })
  it('does not fire on ordinary chitchat/shopping', () => {
    expect(detectTravelIntent('xin chào bạn khỏe không')).toBe(false)
    expect(detectTravelIntent('tư vấn mua tai nghe bluetooth')).toBe(false)
  })
})
