import { describe, it, expect } from 'vitest'
import { guardPlaceClaimsInText, type PlaceClaimEvidence } from './placeClaimGuard'

// ─────────────────────────────────────────────────────────────────────────────
// Both defects below were MEASURED on localhost with the retrieval in front of
// them, and both are the same shape: a fact about a place that the provider
// never returned, written as though it had.
// ─────────────────────────────────────────────────────────────────────────────

const ev = (over: Partial<PlaceClaimEvidence> = {}): PlaceClaimEvidence => ({
  ratings: [], distancesKm: [], texts: [], ...over,
})

describe('🚨 RESIDUAL 2 — "highly rated" with no rating anywhere in the data', () => {
  // MEASURED: "spa" (GPS, District 1) → 10 OSM rows, name + address, no rating
  // field at all. Reply: "it's super close to you (just 0.3km away) and highly
  // rated."
  const MEASURED = 'I would pick Tiệm Spa Blue Moon. It is highly rated. Perfect for a quick session.'

  it('removes the quality verdict when no rating was retrieved', () => {
    const out = guardPlaceClaimsInText(MEASURED, ev({ distancesKm: [0.3] }))
    expect(out.redacted).toBe(1)
    expect(out.text).not.toMatch(/highly rated/i)
    expect(out.text).toContain('Tiệm Spa Blue Moon')
  })

  it('removes the Vietnamese phrasings too', () => {
    for (const claim of [
      'Quán này được đánh giá cao.', 'Chỗ này đánh giá tốt.',
      'Spa này có rating cao.', 'Đây là nơi được đánh giá rất tốt.',
    ]) {
      const text = 'Mình chọn Sen Spa. ' + claim + ' Bạn thử nhé.'
      const out = guardPlaceClaimsInText(text, ev())
      expect(out.text, claim).not.toContain(claim.replace(/\.$/, ''))
      expect(out.text, claim).toContain('Mình chọn Sen Spa')
    }
  })

  it('🚨 KEEPS the verdict when a rating really was retrieved', () => {
    // The guard must be inert the moment Google Places is restored.
    const out = guardPlaceClaimsInText(MEASURED, ev({ ratings: [4.7], distancesKm: [0.3] }))
    expect(out.redacted).toBe(0)
    expect(out.text).toBe(MEASURED)
  })

  it('does not touch grounded reasoning that is not a rating claim', () => {
    const text = 'Mình chọn Tiệm Spa Blue Moon vì gần bạn và phù hợp với nhu cầu massage.'
    expect(guardPlaceClaimsInText(text, ev()).text).toBe(text)
  })

  it('a stated score must trace to a retrieved number', () => {
    // Multi-sentence, as a real reply is: the claim goes, the rest stays.
    const text = 'Mình chọn Quán Cà Phê Nhỏ. Quán này 4.8 sao nhé.'
    expect(guardPlaceClaimsInText(text, ev()).text).not.toContain('4.8')
    expect(guardPlaceClaimsInText(text, ev({ ratings: [4.8] })).text).toBe(text)
  })

  it('🚨 a reply that is ONLY the claim is kept, not emptied', () => {
    // Same call redactUnsupportedClaims and redactScheduleAvailability make: an
    // empty answer is a worse failure than a hedged one, and the stream filter
    // would drop an empty string entirely.
    const onlyScore = 'Quán này 4.8 sao nhé.'
    expect(guardPlaceClaimsInText(onlyScore, ev()).text).toBe(onlyScore)
    expect(guardPlaceClaimsInText(onlyScore, ev()).redacted).toBe(0)
  })

  it('🚨 a hotel star class from the row snippet is NOT invented', () => {
    // Measured: booking.com snippet says "cung cấp chỗ nghỉ 3 sao ở Đà Nẵng".
    const text = 'DA NANG BAY HOTEL là khách sạn 3 sao nằm giáp biển.'
    const out = guardPlaceClaimsInText(text, ev({ texts: ['Nằm giáp biển, cung cấp chỗ nghỉ 3 sao ở Đà Nẵng'] }))
    expect(out.redacted).toBe(0)
    expect(out.text).toBe(text)
  })
})

describe('🚨 RESIDUAL 3 — a distance out of world knowledge', () => {
  // MEASURED: "spa cao cấp ở Mường Nhé Điện Biên" retrieved NOTHING, and the
  // reply said Điện Biên Phủ is "cách Mường Nhé khoảng 30-40km". It is roughly
  // 200km. No row, snippet or coordinate carried that number.
  const MEASURED = 'Mình chưa tìm thấy spa nào ở Mường Nhé. Bạn có thể thử thành phố Điện Biên Phủ (cách Mường Nhé khoảng 30-40km) nơi có nhiều spa hơn.'

  it('removes an invented distance when nothing was retrieved', () => {
    const out = guardPlaceClaimsInText(MEASURED, ev())
    expect(out.redacted).toBe(1)
    expect(out.text).not.toMatch(/30-40km|30–40km/)
    // The honest half of the answer survives.
    expect(out.text).toContain('chưa tìm thấy spa nào ở Mường Nhé')
  })

  it('🚨 KEEPS a distance the engine actually computed from coordinates', () => {
    const text = 'Mình chọn Fit24 vì chỉ cách bạn 0.5km.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.5, 0.7, 1.4] }))
    expect(out.redacted).toBe(0)
    expect(out.text).toBe(text)
  })

  it('keeps a distance the provider stated in its own snippet', () => {
    const text = 'Khách sạn cách Bảo tàng Chăm 900 m.'
    const out = guardPlaceClaimsInText(text, ev({ texts: ['cách Bảo tàng Chăm 900 m'] }))
    expect(out.text).toBe(text)
  })

  it('🚨 a walking TIME is not a distance claim and is left alone', () => {
    // Providers really do return "4 phút đi bộ"; only km/m claims are judged here.
    const text = 'Cách Bãi biển Mỹ Khê chỉ 4 phút đi bộ.'
    expect(guardPlaceClaimsInText(text, ev()).text).toBe(text)
  })

  it('removes a bare invented "cách khoảng 12 km"', () => {
    const text = 'Chỗ này ổn. Nó cách trung tâm khoảng 12 km.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.4] }))
    expect(out.text).not.toContain('12 km')
    expect(out.text).toContain('Chỗ này ổn')
  })
})

describe('the guard never writes, and never empties the reply', () => {
  it('every character of the output came from the input', () => {
    const text = 'Mình chọn Sen Spa. Nó được đánh giá cao. Địa chỉ ở Quận 1.'
    const out = guardPlaceClaimsInText(text, ev())
    for (const word of out.text.split(/\s+/).filter(Boolean)) {
      expect(text).toContain(word.replace(/[.,]$/, ''))
    }
  })

  it('keeps the original rather than returning nothing', () => {
    const onlyClaim = 'Được đánh giá cao.'
    expect(guardPlaceClaimsInText(onlyClaim, ev()).text).toBe(onlyClaim)
  })

  it('is inert on prose with no rating or distance claim at all', () => {
    const text = 'Mình tìm được vài quán cafe ở Hà Nội, bạn xem thử nhé.'
    expect(guardPlaceClaimsInText(text, ev()).redacted).toBe(0)
  })

  it('handles empty and whitespace input without throwing', () => {
    expect(guardPlaceClaimsInText('', ev()).text).toBe('')
    expect(guardPlaceClaimsInText('   ', ev()).redacted).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 MEASURED 2026-09-14 on the exact planning probe ("lập kế hoạch ăn chơi
// nhảy múa tối nay cho 2 người, budget 5 triệu ở Sài Gòn"): the model wrote a
// complete [TAPPY_PLAN] (`planEmitted: true`) and the client received prose.
// `sentenceSpans` keeps the block whole as ONE span; this guard judged it as a
// sentence, PHONE_RE matched the longitude inside `maps_link`, the block names
// two venues so no entity phone could vouch for it, and the whole plan went.
// ─────────────────────────────────────────────────────────────────────────────
describe('🚨 a machine block is not a sentence — [TAPPY_PLAN] is never judged', () => {
  const PLAN = '[TAPPY_PLAN]\n' + JSON.stringify({
    type: 'evening', title: 'Tối ăn ngon + nhảy múa ở Sài Gòn', people: [2], budget_total: '5.000.000 VND',
    days: [{ label: 'Tối nay', items: [
      { time: '19:00', category: 'food', name: 'Nhà Hàng Jaspas', description: 'Nhà hàng có wifi, không gian thoải mái.', price: 'chưa có giá', maps_link: 'https://www.google.com/maps?q=10.778168,106.7037041' },
      { time: '21:30', category: 'entertainment', name: 'Mimi Ultra Lounge', description: 'Bar lounge sôi động.', price: 'chưa có giá', address: '61 Nam Kỳ Khởi Nghĩa, Quận 1', maps_link: 'https://www.google.com/maps?q=10.7718973,106.7005703' },
    ] }],
    cost_breakdown: { 'Ăn tối (2 người)': 'chưa có giá', 'Bar': 'chưa có giá' },
  }) + '\n[/TAPPY_PLAN]'
  const evidence = ev({
    placeNames: ['Nhà Hàng Jaspas', 'Mimi Ultra Lounge', 'Quán Bar No.5'],
    phonesByEntity: new Map([['Quán Chill Skybar', ['+84 8 38272372']]]),
    ratingsByEntity: new Map(), reviewCountsByEntity: new Map(),
  })

  it('keeps the whole plan — coordinates in maps_link are not a phone claim', () => {
    const text = 'Tôi đã lên kế hoạch cho tối nay.\n\n' + PLAN + '\n\nMình chọn Nhà Hàng Jaspas trước, rồi Mimi Ultra Lounge.'
    const out = guardPlaceClaimsInText(text, evidence, { scope: 'all' })
    expect(out.redacted).toBe(0)
    expect(out.text).toBe(text)
    expect(out.text).toContain(PLAN)
    expect(out.text).toContain('https://www.google.com/maps?q=10.778168,106.7037041')
    expect(out.text).toContain('https://www.google.com/maps?q=10.7718973,106.7005703')
    expect(out.text).toContain('Nhà Hàng Jaspas')
    expect(out.text).toContain('Mimi Ultra Lounge')
  })

  it('still guards the prose outside the block exactly as before', () => {
    const text = 'Gọi Nhà Hàng Jaspas: 0901 234 567.\n\n' + PLAN + '\n\nMimi Ultra Lounge cách bạn 12 km.'
    const out = guardPlaceClaimsInText(text, evidence, { scope: 'all' })
    expect(out.redacted).toBe(2)
    expect(out.text).not.toContain('0901 234 567')
    expect(out.text).not.toContain('12 km')
    expect(out.text).toContain(PLAN)
  })

  it('the same protection covers the other machine blocks', () => {
    const text = 'Mình chọn Nhà Hàng Jaspas.\n\n[CTA_BUTTONS]\n[{"label":"📞 Gọi - Jaspas","url":"tel:0901234567"}]\n[/CTA_BUTTONS]'
    const out = guardPlaceClaimsInText(text, evidence, { scope: 'all' })
    expect(out.redacted).toBe(0)
    expect(out.text).toBe(text)
  })
})
