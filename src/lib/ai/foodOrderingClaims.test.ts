// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlaceClaimsInText, mayRedactPlaceClaim, isOrderingClaim } from './placeClaimGuard'
import { safeFlushPoint } from './progressiveFlush'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 THE ORDERING VOCABULARY GAP, CLOSED.
//
// The rule was right and its word list was not. Across three UATs the model kept
// asserting delivery in wording `ORDERING_RE` did not know, each time after the
// previous wording was blocked:
//
//   UAT 1  "có đặt online qua ShopeeFood/GrabFood"   → blocked
//   UAT 2  "cũng đều có giao hàng"                   → blocked
//   UAT 3  "... (chỉ 0.7km) và giao hàng"            → LEAKED (bare "giao hàng")
//   UAT 3  "gọi món qua ShopeeFood ... để giao tận nhà" → LEAKED
//   UAT 4  "có đặt bàn và giao hàng"                 → LEAKED
//
// None of these was a streaming leak — the guard genuinely returned redacted=0,
// so guard and flush agreed. The evidence semantics are unchanged: only a DIRECT
// entity-level ordering page (`orderablePlaces`) can support such a claim; the
// injected `shopeefood.vn/tim-kiem?q=` links are search pages and prove nothing.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH = ['Bún Bò Huế Đông Ba', 'nhà hàng bún bò nam bộ', 'Bún Bò Huế Gia Hội']
const ev = (o: object = {}) => ({
  ratings: [] as number[], distancesKm: [0.7], texts: [] as string[], placeNames: BATCH,
  ratingsByEntity: new Map<string, number[]>(),
  reviewCountsByEntity: new Map<string, number[]>(),
  phonesByEntity: new Map<string, string[]>(),
  ...o,
})
const TAIL = '\nQuán nằm ở Quận 1.'

/** The exact sentences observed leaking, verbatim. */
const LEAKED = [
  'Mình chọn **Bún Bò Huế Đông Ba** — quán này gần bạn nhất (chỉ 0.7km) và giao hàng.',
  'Bạn có thể gọi món qua ShopeeFood hoặc GrabFood để giao tận nhà.',
  'Mình chọn **Bún Bò Huế Đông Ba** — quán này gần bạn nhất, có đặt bàn và giao hàng.',
  'Quán nằm ở Quận 1 và nhận đơn online.',
]

describe('ordering: the wording that leaked is now a claim', () => {
  it.each(LEAKED)('removes the unsupported ordering claim: %s', (sentence) => {
    const out = guardPlaceClaimsInText(sentence + TAIL, ev())
    expect(out.redacted).toBeGreaterThan(0)
  })

  it.each(LEAKED)('and holds it back from early streaming: %s', (sentence) => {
    expect(mayRedactPlaceClaim(sentence)).toBe(true)
    expect(safeFlushPoint(sentence + ' Còn nhiều lựa chọn khác.')).toBe(0)
  })
})

describe('ordering: evidence semantics are unchanged', () => {
  it('a DIRECT entity-level ordering page still supports the claim', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba có giao hàng.' + TAIL,
      ev({ orderablePlaces: new Set(['Bún Bò Huế Đông Ba']) }))
    expect(out.redacted).toBe(0)
  })

  it('a direct page for ANOTHER venue does not', () => {
    const out = guardPlaceClaimsInText('Bún Bò Huế Đông Ba có giao hàng.' + TAIL,
      ev({ orderablePlaces: new Set(['Bún bò Na - Nguyễn Cảnh Chân']) }))
    expect(out.redacted).toBeGreaterThan(0)
  })

  it('search pages prove nothing, however many there are', () => {
    // The injected ShopeeFood/GrabFood links are `tim-kiem?q=` search URLs.
    expect(guardPlaceClaimsInText('Bún Bò Huế Đông Ba có đặt bàn và giao hàng.' + TAIL, ev()).redacted)
      .toBeGreaterThan(0)
  })
})

describe('ordering: the honest phrasing must survive', () => {
  // 🔑 The prompt teaches "bạn có thể tìm trên ShopeeFood" precisely because the
  // link is a search. Widening the vocabulary must not delete that.
  it('keeps a search framing that claims nothing', () => {
    const text = 'Bạn có thể tìm Bún Bò Huế Đông Ba trên ShopeeFood để đặt món.'
    expect(isOrderingClaim(text)).toBe(false)
    expect(guardPlaceClaimsInText(text + TAIL, ev()).redacted).toBe(0)
  })

  it('but possession still wins over a search framing', () => {
    const text = 'Bạn có thể tìm trên ShopeeFood và quán có giao hàng tận nơi.'
    expect(isOrderingClaim(text)).toBe(true)
    expect(guardPlaceClaimsInText(text + TAIL, ev()).redacted).toBeGreaterThan(0)
  })

  it('leaves a question alone', () => {
    const q = 'Bạn muốn đặt online hay đi ăn tại quán?'
    expect(isOrderingClaim(q)).toBe(false)
    expect(guardPlaceClaimsInText(q, ev()).redacted).toBe(0)
  })

  it('does not fire on ordinary prose that mentions no service', () => {
    for (const t of ['Quán mở cửa từ 6h sáng.', 'Bún bò Huế có nước dùng đậm đà.']) {
      expect(isOrderingClaim(t)).toBe(false)
    }
  })
})

describe('guard and flush cannot drift on ordering', () => {
  it('every sentence the guard removes is one the flush holds', () => {
    for (const s of LEAKED) {
      expect(guardPlaceClaimsInText(s + TAIL, ev()).redacted).toBeGreaterThan(0)
      expect(mayRedactPlaceClaim(s)).toBe(true)
    }
  })
})
