import { describe, it, expect } from 'vitest'
import { guardPlaceClaimsInText, isOrderingClaim, type PlaceClaimEvidence } from './placeClaimGuard'

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

describe('a sentence that denies the capability is not an ordering claim (live UAT 14 Sep 2026)', () => {
  it('keeps the honest "not supported" sentence and still removes a possession claim', () => {
    expect(isOrderingClaim('Hiện TappyAI chưa hỗ trợ đặt bàn trực tuyến 😊')).toBe(false)
    expect(isOrderingClaim('Mình không thể hỗ trợ đặt bàn qua ứng dụng.')).toBe(false)
    expect(isOrderingClaim('Mình hiểu bạn muốn đặt bàn cho 4 người tối nay 🍽️')).toBe(false)
    expect(isOrderingClaim('Quán có đặt bàn qua điện thoại.')).toBe(true)
    expect(isOrderingClaim('Quán không có giao hàng.')).toBe(true)
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

// PLACE_CLAIM_KEEP_VERIFIED_PRICE (default OFF): a sentence removed only for a quality phrase keeps its verified price.
// Fixture B is the Gate-3 scenario: the quality clause "được đánh giá cao nên" sits in front of a verified 8.000.000đ.
describe('PLACE_CLAIM_KEEP_VERIFIED_PRICE', () => {
  const B = 'Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền.'
  const VERIFIED = { verifiedPrices: [{ value: 8000000, name: 'Sony WH-1000XM5' }] }
  const withFlag = <T,>(v: string | undefined, fn: () => T): T => {
    const saved = process.env.PLACE_CLAIM_KEEP_VERIFIED_PRICE
    if (v === undefined) delete process.env.PLACE_CLAIM_KEEP_VERIFIED_PRICE
    else process.env.PLACE_CLAIM_KEEP_VERIFIED_PRICE = v
    try { return fn() } finally {
      if (saved === undefined) delete process.env.PLACE_CLAIM_KEEP_VERIFIED_PRICE
      else process.env.PLACE_CLAIM_KEEP_VERIFIED_PRICE = saved
    }
  }

  it('flag OFF: fixture B keeps the legacy output (the whole sentence goes, price with it)', () => {
    const out = withFlag(undefined, () => guardPlaceClaimsInText(B, ev(), VERIFIED))
    expect(out.text).toBe('Tôi đã tìm được một lựa chọn phù hợp.')
  })

  it('flag ON: the quality clause goes, the verified 8.000.000đ stays, the place name stays', () => {
    const out = withFlag('1', () => guardPlaceClaimsInText(B, ev(), VERIFIED))
    expect(out.text).not.toMatch(/được đánh giá cao/)
    expect(out.text).toContain('Sony WH-1000XM5 giá 8.000.000đ rất đáng tiền.')
    expect(out.text).toContain('Tôi đã tìm được một lựa chọn phù hợp.')
  })

  it('flag ON, diacritic-free: "duoc danh gia cao nen" is cut with its "duoc", the price stays', () => {
    const text = 'Sony WH-1000XM5 duoc danh gia cao nen gia 8.000.000d rat dang tien.'
    const out = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(out.text).not.toMatch(/duoc|danh gia cao/)
    expect(out.text).toContain('Sony WH-1000XM5 gia 8.000.000d rat dang tien.')
  })

  it('flag ON, quality-only sentence with no verified amount: same as OFF (fail-closed)', () => {
    const text = 'Mình chọn Sen Spa. Quán này được đánh giá cao. Bạn thử nhé.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
    expect(on.text).not.toMatch(/được đánh giá cao/)
  })

  it('flag ON, a sentence with an unverified amount beside the verified one: same as OFF, no unverified price survives', () => {
    const text = 'Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ, bản khác 3.000.000đ.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
    expect(on.text).not.toContain('3.000.000')
    expect(on.text).not.toMatch(/được đánh giá cao/)
  })

  // The flag contract for the shapes below: whatever the established path returns is what ON returns. That says nothing about
  // whether the established path itself is right — the it.fails cases further down record where it is not.
  it('flag does not change overlapping or malformed shapes (on === off)', () => {
    const shapes = [
      'Sony WH-1000XM5 giá 8.000.000đ, được đánh giá cao.', // the amount comes before the claim
      'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ, được đánh giá cao nữa.', // two quality phrases
      'Sony WH-1000XM5 được đánh giá cao 8.000.000đ.', // no clause edge before the price
    ]
    for (const text of shapes) {
      const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
      const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
      expect(on.text, text).toBe(off.text)
    }
  })

  // Outcome pin only: the `found.length !== 1` guard is redundant with the `re.test(out)` check that follows (a second phrase
  // survives the cut and fails it), so this test cannot isolate the branch. It pins that two phrases take the established path.
  it('two quality phrases in the sentence take the established path (on === off); outcome pin for the found.length branch', () => {
    const text = 'Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ, được đánh giá cao nữa.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
  })

  it('fail-closed branch delimiter-not-found: no clause edge between the claim and the price takes the established path (on === off)', () => {
    const text = 'Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 được đánh giá cao 8.000.000đ.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
  })

  // Outcome pin only: when the cut drops the named place, the existing survivor-name check after `trim` rejects it too, so
  // `keptOk` changes the result only when the established clause trim would succeed where the cut fails; no such sentence was
  // found, so this test cannot isolate `keptOk`. The contrast half does prove the place evidence is what blocks the cut.
  it('a cut that drops a named place takes the established path (on === off), while the same sentence without place evidence is cut; outcome pin for keptOk', () => {
    // "Sen Spa" sits inside the clause the cut removes, so the survivor no longer names the place the sentence named.
    const text = 'Sony WH-1000XM5 được đánh giá cao tại Sen Spa nên giá 8.000.000đ rất tốt.'
    const withPlace = ev({ placeNames: ['Sen Spa'] })
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, withPlace, VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, withPlace, VERIFIED))
    expect(on.text).toBe(off.text)
    // Contrast, same sentence, no place evidence: nothing is named, so the cut is allowed and keeps the verified price.
    const cut = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(cut.text).toContain('8.000.000đ')
    expect(cut.text).not.toMatch(/được đánh giá cao/)
  })

  it('flag does not change the shape with an un-dotted amount ("3000000đ") (on === off)', () => {
    // Contract only. The established path keeps this sentence as it is (see the it.fails case below); the flag adds nothing to it.
    const text = 'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền, bản cũ 3000000đ.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
  })

  // With a clean first sentence the established path removes a sentence that carries unsupported quality claims, whatever their
  // number, and an un-dotted amount in it goes with the sentence. Observed in the 23/10 run: the two-phrase sentence below was
  // removed once it followed a clean sentence. These are the established-path truths the three PC-V1-LAST-RESORT-01 it.fails cases below do NOT hold for.
  it('established path: with a clean first sentence, a sentence with two quality phrases or an un-dotted amount is removed (flag does not change it)', () => {
    const lead = 'Tôi đã tìm được một lựa chọn phù hợp. '
    for (const claim of [
      'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ, được đánh giá cao nữa.',
      'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền, bản cũ 3000000đ.',
    ]) {
      const off = withFlag(undefined, () => guardPlaceClaimsInText(lead + claim, ev(), VERIFIED))
      const on = withFlag('1', () => guardPlaceClaimsInText(lead + claim, ev(), VERIFIED))
      expect(on.text, claim).toBe(off.text)
      expect(off.text, claim).not.toMatch(/được đánh giá cao/)
      expect(off.text, claim).not.toContain('3000000')
    }
  })

  // PC-V1-LAST-RESORT-01 (open gate, pre-existing, NOT fixed by PLACE_CLAIM_KEEP_VERIFIED_PRICE). Root cause, read from source
  // (placeClaimGuard.ts, end of guardPlaceClaimsInText): whenever EVERY sentence of the text is removed as carrying an
  // unsupported claim (a lone sentence, or several), the v1 path returns the ORIGINAL text, claims included ("the same last
  // resort this guard always had"); v2 returns what is left instead. The same path applies to every claim kind the guard
  // judges, not only quality phrases. A reply made only of claim sentences therefore keeps them, however many phrases they have
  // and whatever amounts they hold. These three cases assert the DESIRED behaviour and are expected to fail today; they are not
  // a fix. (An it.fails case also passes if the code throws; the plain cases above pin the non-throwing behaviour.) Remove the
  // marks in the commit that changes the last resort.
  it.fails('PC-V1-LAST-RESORT-01 (two quality phrases): DESIRED — no quality phrase survives a reply made only of that sentence', () => {
    const text = 'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ, được đánh giá cao nữa.'
    const out = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(out.text).not.toMatch(/được đánh giá cao/)
  })

  it.fails('PC-V1-LAST-RESORT-01 (no clause edge before the price): DESIRED — no quality phrase survives a reply made only of that sentence', () => {
    const text = 'Sony WH-1000XM5 được đánh giá cao 8.000.000đ.'
    const out = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(out.text).not.toMatch(/được đánh giá cao/)
  })

  it.fails('PC-V1-LAST-RESORT-01 (un-dotted amount): DESIRED — an unverified un-dotted amount does not survive a reply made only of that sentence', () => {
    const text = 'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền, bản cũ 3000000đ.'
    const out = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(out.text).not.toContain('3000000')
  })

  it('variant names: a verified price of "Sony WH-1000XM5" is not kept for a sentence naming a variant (on === off)', () => {
    const variants = [
      'Pro', 'pro', 'Max', 'Ultra', 'Plus', 'Mini', 'Lite', 'SE', 'Air', 'II', 'III', 'IV', 'V2', 'Gen', 'Black', '2024',
      'bản', 'phiên', 'đời', 'thế', 'cũ', 'xách', 'refurbished', '[Pro]', '*Pro*', 'pro/max', '(Pro)',
    ]
    for (const v of variants) {
      // A clean first sentence keeps the established path out of its last resort (it would return a lone claim sentence unchanged).
      const text = `Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5 ${v} được đánh giá cao nên giá 8.000.000đ rất đáng tiền.`
      const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
      const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
      expect(on.text, text).toBe(off.text)
      expect(on.text, text).not.toContain('8.000.000')
    }
  })

  it('variant names: a separator glued to the row name ("XM5/XM6", "XM5-B", "XM5+") is a different product, not kept (on === off)', () => {
    for (const glued of ['/XM6', '-B', '+', '_x', '`x`']) {
      const text = `Tôi đã tìm được một lựa chọn phù hợp. Sony WH-1000XM5${glued} được đánh giá cao nên giá 8.000.000đ rất đáng tiền.`
      const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
      const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
      expect(on.text, text).toBe(off.text)
      expect(on.text, text).not.toContain('8.000.000')
    }
  })

  it('variant names: the exact row name followed by lowercase Vietnamese words still keeps the price', () => {
    const text = 'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền.'
    const out = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(out.text).toContain('Sony WH-1000XM5 giá 8.000.000đ rất đáng tiền.')
  })

  it('variant names: when the row IS the variant ("Sony WH-1000XM5 Pro") and the sentence follows it with lowercase words, the price is kept', () => {
    const pro = { verifiedPrices: [{ value: 8000000, name: 'Sony WH-1000XM5 Pro' }] }
    const text = 'Sony WH-1000XM5 Pro được đánh giá cao nên giá 8.000.000đ rất đáng tiền.'
    const out = withFlag('1', () => guardPlaceClaimsInText(text, ev(), pro))
    expect(out.text).toContain('Sony WH-1000XM5 Pro giá 8.000.000đ rất đáng tiền.')
    expect(out.text).not.toMatch(/được đánh giá cao/)
  })

  it('flag ON: a sentence with bold markup takes the established path', () => {
    const text = 'Sony WH-1000XM5 **được đánh giá cao** nên giá 8.000.000đ rất đáng tiền.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
  })

  it('flag ON: the sentence "Quán Sen Spa …" with a price that belongs to another row: same as OFF, unchanged by the flag', () => {
    // Restored original case (it had been replaced). Source reason for the expected value: the reply is one claim sentence, so
    // the established path takes its v1 last resort and returns the ORIGINAL text (placeClaimGuard.ts, end of
    // guardPlaceClaimsInText); observed in the 23/10 run: ON === OFF === the input. Pre-existing (PC-V1-LAST-RESORT-01), not an
    // effect of the flag, which must not change it.
    const text = 'Quán Sen Spa được đánh giá cao nên giá 8.000.000đ rất tốt.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
    expect(on.text).toBe(text)
  })

  it('flag ON: the same sentence after a clean first sentence — the price is not attributed to the verified row, the sentence goes as in OFF', () => {
    const text = 'Tôi đã tìm được một lựa chọn phù hợp. Quán Sen Spa được đánh giá cao nên giá 8.000.000đ rất tốt.'
    const off = withFlag(undefined, () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    const on = withFlag('1', () => guardPlaceClaimsInText(text, ev(), VERIFIED))
    expect(on.text).toBe(off.text)
    expect(on.text).toBe('Tôi đã tìm được một lựa chọn phù hợp.')
  })

  it('flag ON: a verified price of ANOTHER row is not kept for this place (attribution fails closed)', () => {
    // Additional case. The verified row here is another product: the sentence names "Sony WH-1000XM5", so the 8.000.000đ is not attributed to it.
    const otherRow = { verifiedPrices: [{ value: 8000000, name: 'Tai nghe khác' }] }
    const off = withFlag(undefined, () => guardPlaceClaimsInText(B, ev(), otherRow))
    const on = withFlag('1', () => guardPlaceClaimsInText(B, ev(), otherRow))
    expect(on.text).toBe(off.text)
    expect(on.text).toBe('Tôi đã tìm được một lựa chọn phù hợp.')
    expect(on.text).not.toContain('8.000.000')
  })
})
