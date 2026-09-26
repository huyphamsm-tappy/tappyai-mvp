// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { guardPlaceClaimsInText } from './placeClaimGuard'
import { guardSnippetPricesInText, type SnippetPriceScope } from './snippetPriceGuard'

// ── 1.2 (2026-09-19, measured E6 GATE B) — a delimiter INSIDE a bold venue name is not a clause boundary ──
//
// "Mình chọn **Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm** cho nhóm bạn — 4.7⭐ (2.122 đánh giá),
// cách 3.4km và mở cửa cả ngày, rất phù hợp cho nhóm 10 người." reached the user as
// "Mình chọn **Karaoke ICOOL và mở cửa cả ngày, rất phù hợp cho nhóm 10 người." — the clause guard
// split the sentence at the " - " inside the name and dropped the name's tail with the claims.
// Both clause-cutting guards are covered: the place-claim guard (unsupported facts) and the
// snippet-price guard (unsupported prices). Names with " - ", " – ", " — " and ", " must survive intact.

const NAMES = [
  'Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm',
  'Quán Ăn Ngon – Phan Bội Châu',
  'Vua Chả Cá — Trần Hưng Đạo',
  'Bún Bò Huế Đông Ba',
]
const ev = (o: object = {}) => ({
  ratings: [] as number[], distancesKm: [] as number[], texts: [] as string[],
  placeNames: NAMES,
  ratingsByEntity: new Map<string, number[]>(),
  reviewCountsByEntity: new Map<string, number[]>(),
  phonesByEntity: new Map<string, string[]>(),
  ...o,
})

describe('place-claim guard — the clause split never opens inside **…**', () => {
  it.each([
    ['**Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm**', ' - '],
    ['**Quán Ăn Ngon – Phan Bội Châu**', ' – '],
    ['**Vua Chả Cá — Trần Hưng Đạo**', ' — '],
  ])('%s keeps its full name when a later clause is cut (%s)', (bold) => {
    // "có giao hàng" is an ordering claim no evidence supports ⇒ that clause goes; the name must not.
    const text = `Mình chọn ${bold} cho nhóm bạn — quán này gần nhất và có giao hàng.`
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.7] }))
    expect(out.text).toContain(bold)
    expect(out.text).not.toContain('giao hàng')
    // the closing ** is still there: no half-open bold span
    expect((out.text.match(/\*\*/g) ?? []).length % 2).toBe(0)
  })

  it('the E6 shape: the name survives, the unsupported ordering clause goes, no orphan "**Karaoke ICOOL và"', () => {
    const text = 'Mình chọn **Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm** cho nhóm bạn — 4.7⭐ (2.122 đánh giá), có giao hàng tận nơi và mở cửa cả ngày, rất phù hợp cho nhóm 10 người.'
    const out = guardPlaceClaimsInText(text, ev({
      ratings: [4.7], distancesKm: [3.4],
      ratingsByEntity: new Map([['Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm', [4.7]]]),
      reviewCountsByEntity: new Map([['Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm', [2122]]]),
    }))
    expect(out.text).toContain('**Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm**')
    expect(out.text).not.toMatch(/\*\*Karaoke ICOOL và/)
    expect(out.text).not.toContain('giao hàng')
    expect(out.text).toContain('mở cửa cả ngày')
  })

  // The shape that reproduces E6 on the old guard: the clause holding the name's TAIL is itself an
  // offender (the name carries the claim word "Giao Hàng"), so the old split dropped "Giao Hàng Tận
  // Nơi** cho bạn" and returned "Mình chọn **Cơm Tấm Sài Gòn — quán này gần nhất." — a half-open bold
  // span, a name the user cannot look up. The name is atomic now and never a claim: the survivor
  // keeps the whole name and loses only the real "có giao hàng" clause.
  it('E6 reproduced: a name whose tail clause reads as a claim is never cut in half', () => {
    const text = 'Mình chọn **Cơm Tấm Sài Gòn - Giao Hàng Tận Nơi** cho bạn — quán này gần nhất và có giao hàng.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.7], placeNames: [...NAMES, 'Cơm Tấm Sài Gòn - Giao Hàng Tận Nơi'] }))
    expect(out.text).toBe('Mình chọn **Cơm Tấm Sài Gòn - Giao Hàng Tận Nơi** cho bạn — quán này gần nhất.')
  })

  it('a delimiter OUTSIDE the bold name is still a boundary (the fix is scoped to the name)', () => {
    const text = 'Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất và có giao hàng.'
    const out = guardPlaceClaimsInText(text, ev({ distancesKm: [0.7] }))
    expect(out.text).toContain('Bún Bò Huế Đông Ba')
    expect(out.text).not.toContain('giao hàng')
  })
})

describe('snippet-price guard — the price clause never opens or ends inside **…**', () => {
  const scope: SnippetPriceScope = { byEntity: new Map(), placeNames: NAMES }
  const v2 = (text: string) => guardSnippetPricesInText(text, [], '', scope, { v2: true, priceBandsByEntity: new Map() })

  it.each([
    ['**Karaoke ICOOL - Trần Não Vòng Xoay Thủ Thiêm**'],
    ['**Quán Ăn Ngon – Phan Bội Châu**'],
    ['**Vua Chả Cá — Trần Hưng Đạo**'],
  ])('%s: an unsupported price clause after the name is cut without touching the name', (bold) => {
    const text = `Hoặc ${bold} (4.7⭐, 556 đánh giá) nếu bạn thích không gian rộng, mở đến 23h với giá khoảng 500-900k.`
    const r = v2(text)
    expect(r.text).toContain(bold)
    expect(r.text).not.toContain('500-900k')
    expect((r.text.match(/\*\*/g) ?? []).length % 2).toBe(0)
  })

  it('a parenthesis inside the bold name is not the price parenthetical', () => {
    const text = 'Hoặc **Vua Chả Cá — Trần Hưng Đạo (chi nhánh 2)** (4.7⭐, 556 đánh giá), mở đến 23h với giá khoảng 500-900k.'
    const r = v2(text)
    expect(r.text).toContain('**Vua Chả Cá — Trần Hưng Đạo (chi nhánh 2)**')
    expect(r.text).not.toContain('500-900k')
  })
})
