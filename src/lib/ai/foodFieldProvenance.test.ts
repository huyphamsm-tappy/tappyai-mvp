// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlaceClaimsInText, mayRedactPlaceClaim } from './placeClaimGuard'

// ─────────────────────────────────────────────────────────────────────────────
// FIELD PROVENANCE AUDIT — rating, review count, phone.
//
// Every case below was REPRODUCED against the shipped guard on 2026-09-09 before
// being fixed; each comment records what it did then.
//
// Fixtures are production-shaped: the six bún bò venues live Overpass returns
// for District 1, and a Vietnamese food listicle of the kind the price search
// actually retrieves — it names several venues, and therefore names none.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH = [
  'Bún Bò Huế Đông Ba', 'nhà hàng bún bò nam bộ', 'Bún Bò Huế Gia Hội',
  'Bún Bò 5T', 'Bún bò Xuà', 'Quán Bún Bò Gánh',
]

/** A real-shaped listicle: an aggregate score and a crowd size, about a DISTRICT. */
const AREA_LISTICLE = 'Top 10 quán bún bò Quận 1 ngon nhất - Đánh giá 4.5/5 từ hơn 1.200 thực khách'
/** A snippet that names exactly one of the batch. */
const ENTITY_SNIPPET = 'Bún Bò Huế Đông Ba - quán được chấm 4.2/5 trên trang ẩm thực'

// The PRODUCTION evidence shape: `streamEnrichment` always supplies the
// per-entity maps (empty when the turn rated nothing), so these fixtures do too.
// A caller that omits them keeps the older batch reading by design — that
// additive rule is asserted separately in placeClaimGuard.test.ts.
const ev = (o: object = {}) => ({
  ratings: [] as number[], distancesKm: [] as number[], texts: [] as string[],
  placeNames: BATCH,
  ratingsByEntity: new Map<string, number[]>(),
  reviewCountsByEntity: new Map<string, number[]>(),
  phonesByEntity: new Map<string, string[]>(),
  ...o,
})
const TAIL = '\nQuán nằm ở Quận 1.'

describe('rating: an area score is not an entity rating', () => {
  // WAS: redacted=0. The listicle 4.5 sat in `ratingPool`, reached through `texts`.
  it('does not let a district listicle validate one restaurant rating', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba được 4.5 sao.' + TAIL,
      ev({ texts: [AREA_LISTICLE] }))
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('4.5')
  })

  it('removes a rating when nothing was retrieved (control, already correct)', () => {
    expect(guardPlaceClaimsInText('Bún Bò Huế Đông Ba được 4.5 sao.' + TAIL, ev()).redacted).toBeGreaterThan(0)
  })

  // WAS: redacted=0. `ratings` was batch-wide, so ANY rated row justified ANY venue.
  it('does not lend one restaurant another restaurant rating', () => {
    const out = guardPlaceClaimsInText('Bún Bò 5T được 4.5 sao.' + TAIL, ev({
      ratings: [4.5], ratingsByEntity: new Map([['Bún Bò Huế Đông Ba', [4.5]]]),
    }))
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('keeps the rating on the venue it actually belongs to', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba được 4.5 sao.' + TAIL, ev({
      ratings: [4.5], ratingsByEntity: new Map([['Bún Bò Huế Đông Ba', [4.5]]]),
    }))
    expect(out.redacted).toBe(0)
    expect(out.text).toContain('4.5')
  })

  it('accepts a score from text that named that very venue', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba được 4.2/5.' + TAIL, ev({
      texts: [AREA_LISTICLE, ENTITY_SNIPPET],
      entityTexts: new Map([['Bún Bò Huế Đông Ba', [ENTITY_SNIPPET]]]),
    }))
    expect(out.redacted).toBe(0)
  })

  // WAS: redacted=0 — a verdict rode on some OTHER row having a rating.
  it('does not let another row rating justify a quality verdict', () => {
    const out = guardPlaceClaimsInText('Bún Bò 5T được đánh giá cao.' + TAIL, ev({
      ratings: [4.5], ratingsByEntity: new Map([['Bún Bò Huế Đông Ba', [4.5]]]),
    }))
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('separates a rating from generic popularity', () => {
    const rated = ev({ ratings: [4.5], ratingsByEntity: new Map([['Bún Bò Huế Đông Ba', [4.5]]]) })
    expect(guardPlaceClaimsInText('Bún Bò Huế Đông Ba được đánh giá cao.' + TAIL, rated).redacted).toBe(0)
    // With no rating anywhere, popularity wording cannot stand in for one.
    expect(guardPlaceClaimsInText('Bún Bò Huế Đông Ba được nhiều người yêu thích.' + TAIL, ev()).redacted).toBeGreaterThan(0)
  })
})

describe('review count: a number about a business, not a district', () => {
  // WAS: redacted=0 with NO evidence at all — no rule matched the phrase, so an
  // invented count sailed through while the rating beside it was being removed.
  it('removes an invented review count', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba có 2.847 đánh giá trên Google Maps.' + TAIL, ev())
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('2.847')
  })

  // The listicle says "hơn 1.200 thực khách" — a district's crowd, not a venue's reviews.
  it('does not let a listicle crowd size become a venue review count', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba có 1.200 đánh giá.' + TAIL,
      ev({ texts: [AREA_LISTICLE] }))
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('keeps a review count the provider actually returned for that venue', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba có 2.847 đánh giá.' + TAIL, ev({
      reviewCountsByEntity: new Map([['Bún Bò Huế Đông Ba', [2847]]]),
    }))
    expect(out.redacted).toBe(0)
    expect(out.text).toContain('2.847')
  })

  it('matches the English phrasing too', () => {
    expect(guardPlaceClaimsInText('Bún Bò Huế Đông Ba has 2,847 reviews.' + TAIL, ev()).redacted).toBeGreaterThan(0)
  })

  it('follows the subject across sentences', () => {
    // The count names nobody; the venue was named one sentence earlier.
    const out = guardPlaceClaimsInText('Mình chọn Bún Bò Huế Đông Ba. Quán này có 2.847 đánh giá.' + TAIL, ev({
      reviewCountsByEntity: new Map([['Bún Bò Huế Đông Ba', [2847]]]),
    }))
    expect(out.redacted).toBe(0)
  })
})

describe('phone: the number must be the venue own', () => {
  /** Verbatim from live Overpass: Bún Bò 5T, Nguyễn Trường Tộ. */
  const OSM_PHONE = '+84949833668'
  /** A real-shaped snippet about a DIFFERENT restaurant, carrying its number. */
  const OTHER = 'Quán bún bò Nam Giao - 028 3822 1234 - 248 Bùi Viện, Quận 1'

  // WAS: redacted=0 — a number lifted from an area snippet about another quán.
  it('removes a phone number that is not this venue', () => {
    const out = guardPlaceClaimsInText('Bạn có thể gọi Bún Bò Huế Đông Ba qua số 028 3822 1234.' + TAIL,
      ev({ texts: [OTHER] }))
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('3822')
  })

  it('keeps the venue own number, however it is spaced', () => {
    const out = guardPlaceClaimsInText('Gọi Bún Bò Huế Đông Ba: 0949 833 668.' + TAIL,
      ev({ phonesByEntity: new Map([['Bún Bò Huế Đông Ba', [OSM_PHONE]]]) }))
    expect(out.redacted).toBe(0)
    expect(out.text).toContain('0949 833 668')
  })

  it('does not mistake a price, a house number or an address for a phone', () => {
    for (const t of ['Bún Bò Huế Đông Ba ở 248 Bùi Viện.', 'Tô khoảng 25.000 đồng.']) {
      expect(guardPlaceClaimsInText(t + TAIL, ev()).redacted).toBe(0)
    }
  })
})

describe('the flush boundary covers the new fields too', () => {
  it('holds a review count and a phone back from early release', () => {
    expect(mayRedactPlaceClaim('Bún Bò Huế Đông Ba có 2.847 đánh giá.')).toBe(true)
    expect(mayRedactPlaceClaim('Gọi 028 3822 1234 để đặt bàn.')).toBe(true)
    expect(mayRedactPlaceClaim('Mình tìm bún bò ngon ở Quận 1 cho bạn nhé!')).toBe(false)
  })
})

describe('removal must not leave a lead-in promising a list that is gone', () => {
  // 🚨 MEASURED on the phone UAT 2026-09-09: the model wrote "Bạn có thể:" and
  // then bullet lines carrying an unsupported phone number. The bullets were
  // removed, the colon stayed, and the reply promised a list that was not there.
  it('drops a colon lead-in when everything it introduced was removed', () => {
    const text = 'Kết quả không hiển thị số điện thoại của quán này.\nBạn có thể:\nGọi trực tiếp qua số 028 3822 1234.'
    const out = guardPlaceClaimsInText(text, ev())
    expect(out.text).not.toContain('3822')
    expect(out.text).not.toContain('Bạn có thể:')
    expect(out.text).toContain('không hiển thị số điện thoại')
  })

  it('keeps the lead-in when something it introduced survives', () => {
    const text = 'Bạn có thể:\nGọi trực tiếp qua số 0949 833 668.\nHoặc ghé quán vào buổi sáng.'
    const out = guardPlaceClaimsInText(text, ev({ phonesByEntity: new Map([['Bún Bò Huế Đông Ba', ['+84949833668']]]) }))
    expect(out.text).toContain('Bạn có thể:')
    expect(out.text).toContain('Hoặc ghé quán')
  })

  it('leaves a lead-in alone when it never introduced anything', () => {
    const text = 'Bún Bò Huế Đông Ba ở Quận 1.'
    expect(guardPlaceClaimsInText(text, ev()).redacted).toBe(0)
  })
})

describe('review: customer sentiment needs entity-level review evidence', () => {
  // 🚨 MEASURED on the review UAT 2026-09-09. Asked "khách nói gì về quán?", the
  // reply produced these with NO review evidence for the venue at all — the
  // rating and review count beside them were correctly removed, but "what
  // customers said" was not checked by anything.
  const MEASURED = [
    'Bún Bò Huế Đông Ba được nhiều khách review.',
    'Khách thường khen bún bò Huế ở đây thơm ngon, nước dùng đậm đà.',
    'Bún Bò Huế Đông Ba được review tốt.',
    'Khách hàng đánh giá quán rất tốt.',
  ]

  it.each(MEASURED)('removes unsupported customer sentiment: %s', (sentence) => {
    const out = guardPlaceClaimsInText(sentence + TAIL, ev())
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('keeps it when retrieved text actually named that venue', () => {
    const own = 'Bún Bò Huế Đông Ba - thực khách khen nước dùng đậm đà, quán sạch sẽ'
    const out = guardPlaceClaimsInText('Khách thường khen Bún Bò Huế Đông Ba nước dùng đậm đà.' + TAIL,
      ev({ texts: [own], entityTexts: new Map([['Bún Bò Huế Đông Ba', [own]]]) }))
    expect(out.redacted).toBe(0)
  })

  it('does not rest customer sentiment on an area listicle', () => {
    const out = guardPlaceClaimsInText('Khách thường khen Bún Bò Huế Đông Ba nước dùng đậm đà.' + TAIL,
      ev({ texts: [AREA_LISTICLE] }))
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('leaves a plain description of the dish alone', () => {
    // Describing bún bò is not a claim about what customers said.
    const text = 'Bún bò Huế có nước dùng từ xương bò và sả.' + TAIL
    expect(guardPlaceClaimsInText(text, ev()).redacted).toBe(0)
  })
})

describe('phone: a hotline is a number the user will dial', () => {
  it('removes an unsupported 1900 hotline', () => {
    const out = guardPlaceClaimsInText('Gọi hotline 1900 1234 để đặt bàn.' + TAIL, ev())
    expect(out.redacted).toBeGreaterThan(0)
    expect(out.text).not.toContain('1900')
  })

  it('holds a hotline back from early release too', () => {
    expect(mayRedactPlaceClaim('Gọi hotline 1900 1234 để đặt bàn.')).toBe(true)
  })
})

describe('a trimmed survivor must stand on its own', () => {
  // 🚨 MEASURED on the review UAT 2026-09-09: trimming the head clause left
  // "nước dùng đậm đà, topping đầy đủ." glued onto the previous sentence — a
  // list of qualities with no subject to attach them to.
  it('removes the whole sentence when the head clause carried the claim', () => {
    const text = 'Mình chọn Bún Bò Huế Đông Ba.\nKhách thường khen bún bò Huế ở đây thơm ngon, nước dùng đậm đà, topping đầy đủ.'
    const out = guardPlaceClaimsInText(text, ev())
    expect(out.text).not.toContain('Khách thường khen')
    expect(out.text).not.toContain('nước dùng đậm đà')
    expect(out.text).toContain('Mình chọn Bún Bò Huế Đông Ba.')
  })

  it('still trims when the head clause survives and carries the venue', () => {
    const text = 'Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất và có giao hàng.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.7] }))
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toContain('giao hàng')
  })

  it('still trims a head clause when the survivor names the venue itself', () => {
    const text = 'Có giao hàng và **Bún Bò Huế Đông Ba** cách bạn 0.7km.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.7] }))
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toContain('giao hàng')
  })
})
