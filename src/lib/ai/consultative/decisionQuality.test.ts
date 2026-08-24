import { describe, it, expect } from 'vitest'
import {
  derivePick,
  buildPickPayload,
  buildShoppingGroundingBlock,
  isExplicitChoiceRequest,
  type Pick,
} from './pick'
import { rankCandidates, type Candidate, type RankedResult } from './rank'
import { analyzeConsultativeReply } from './replyAnalysis'
import type { NeedProfile } from './needProfile'
import {
  hasUnscopedSuperlative,
  claimsConfigEquivalence,
  titlesSupportConfigEquivalence,
  unsupportedConditionClaim,
} from './claimScope'

// ── Decision quality — the four gaps production UAT exposed on 4c47753 ──────
//
// Every expectation traces to the shipped reply, not to a preference:
//
//   · "Giá tốt nhất" and "giá rẻ nhất trên thị trường hiện tại" were asserted
//     from 6 retrieved rows of 40, a market-wide claim the evidence cannot make;
//   · the turn ended "bạn đã quyết định chọn shop nào rồi?" — handing the
//     decision back to a user who had just asked to be given one;
//   · four of the six shortlisted rows were dropped without a word;
//   · the follow-up called an "M1" and an "M1 Pro" listing "cấu hình hoàn toàn
//     giống nhau".
//
// H below is the follow-up defect from the 2026-08-23 UAT on 6b4e9b2: a CONDITION
// asserted for listings whose titles state none.

function listing(name: string, attrs: Candidate['attrs'] = {}): Candidate {
  return { id: name, name, domain: 'shopping', attrs, link: `https://shop/${encodeURIComponent(name)}`, raw: { title: name } }
}

function shoppingNeed(over: Partial<NeedProfile> = {}): NeedProfile {
  return {
    domain: 'shopping', subject: 'macbook', budget: null, budgetStated: null,
    location: { text: null, gps: null },
    useCases: [], priorities: [], mustHave: [], avoid: [],
    turnsObserved: 1, changedAtTurn: {},
    ...over,
  }
}

/** The production shape: a bare product name, so `needProfile` records NO criteria. */
const NO_CRITERIA = shoppingNeed()

/** A decisive pair — one is cheaper AND better reviewed. */
const DECISIVE = [
  listing('Macbook Pro 14 M1 Pro 32GB/512GB — Zin100', { priceVnd: 25_800_000, rating: 4.7, reviewCount: 704 }),
  listing('Macbook Pro 14 M1 Pro 32GB/512GB — Tin Phat', { priceVnd: 27_500_000, rating: 4.7, reviewCount: 120 }),
]

// ── TEST A — market-wide superlatives ───────────────────────────────────────

describe('A — a superlative may not exceed the evidence', () => {
  it('rejects the exact sentence production shipped', () => {
    expect(hasUnscopedSuperlative('Cấu hình đúng M1 32GB 512GB, giá rẻ nhất trên thị trường hiện tại.')).toBe(true)
  })

  it('rejects a bare superlative heading, which qualifies nothing', () => {
    // "Giá tốt nhất - Zin100.vn: 25.8 triệu" — reads as a market fact precisely
    // because it names no scope.
    expect(hasUnscopedSuperlative('Giá tốt nhất - Zin100.vn: 25.8 triệu')).toBe(true)
  })

  it('accepts the scoped forms', () => {
    for (const ok of [
      'Đây là giá rẻ nhất trong các lựa chọn mình tìm được.',
      'Giá tốt nhất trong danh sách hiện có là 25.8 triệu.',
      'Thấp nhất trong 40 kết quả ở trên.',
    ]) expect(hasUnscopedSuperlative(ok), ok).toBe(false)
  })

  it('judges per sentence — one scoped claim cannot launder an unscoped one', () => {
    const mixed = 'Rẻ nhất trong các lựa chọn mình tìm được. Và đây cũng là giá rẻ nhất trên thị trường.'
    expect(hasUnscopedSuperlative(mixed)).toBe(true)
  })

  it('launders nothing even when the second claim never says "thị trường"', () => {
    // Mutation M05 survived until this existed: judging the WHOLE reply let a
    // correctly scoped first sentence excuse a bare superlative in the second.
    const mixed = 'Rẻ nhất trong các lựa chọn mình tìm được. Giá tốt nhất luôn.'
    expect(hasUnscopedSuperlative(mixed)).toBe(true)
  })

  it('a scope word does not rescue a sentence that also claims the market', () => {
    // Mutation M03 survived until this existed: with the market check removed,
    // the trailing scope phrase made this read as compliant.
    expect(hasUnscopedSuperlative('Rẻ nhất trên thị trường trong các lựa chọn mình tìm được.')).toBe(true)
  })

  it('says nothing about a reply that makes no superlative claim', () => {
    expect(hasUnscopedSuperlative('Zin100 đang bán 25.8 triệu, Tín Phát 27.5 triệu.')).toBe(false)
  })

  it('is stated as a rule the model receives, not only as a test', () => {
    const block = buildShoppingGroundingBlock()
    // The principle, not only the examples — mutation M01 survived on the
    // examples alone.
    expect(block).toContain('PHAM VI CUA MOI SO SANH')
    expect(block).toContain('re nhat tren thi truong')
    expect(block).toContain('re nhat trong cac lua chon minh tim duoc')
  })
})

// ── TEST B — a request to choose is a decidable need ────────────────────────

describe('B — asking Tappy to choose activates the Pick', () => {
  const ranked = rankCandidates(DECISIVE, NO_CRITERIA)

  it('the production phrasings are recognised', () => {
    for (const t of [
      'MacBook Pro 14 M1 32GB 512GB, tư vấn giúp mình chọn',
      'bạn chọn giúp mình với',
      'nên mua cái nào?',
      'theo bạn mình nên chọn cái nào?',
      'which one should I get?',
      'help me choose',
    ]) expect(isExplicitChoiceRequest(t), t).toBe(true)
  })

  it('does not fire on a user REPORTING a decision', () => {
    for (const t of [
      'mình đã chọn xong rồi',
      'mình chọn Zin100 nhé',
      'cho mình xem thêm ảnh',
    ]) expect(isExplicitChoiceRequest(t), t).toBe(false)
  })

  it('without the signal there is still no Pick — the shipped behaviour', () => {
    expect(derivePick(ranked, NO_CRITERIA)).toBeNull()
  })

  it('WITH the signal a Pick is produced, from the same evidence', () => {
    const pick = derivePick(ranked, NO_CRITERIA, { explicitChoiceRequest: true })
    expect(pick).not.toBeNull()
    expect(pick!.candidate).toBe(ranked.ranked[0].candidate)
  })

  // The guards the request must NOT be able to buy past.
  const forged = (over: Partial<RankedResult>): RankedResult => ({
    ranked: [], filtered: [], rankable: true, budgetFilterEmpty: false, ...over,
  })
  const entry = (c: Candidate, score: number, reasons: { key: string; detail: string; contribution: number }[]) =>
    ({ candidate: c, score, reasons, missing: [], unverifiedMustHave: [], unverifiedAvoid: [] })

  it('still null when the list is not rankable', () => {
    const r = rankCandidates(DECISIVE, NO_CRITERIA)
    expect(derivePick({ ...r, rankable: false }, NO_CRITERIA, { explicitChoiceRequest: true })).toBeNull()
  })

  it('still null with fewer than two candidates', () => {
    const r = rankCandidates([DECISIVE[0]], NO_CRITERIA)
    expect(derivePick(r, NO_CRITERIA, { explicitChoiceRequest: true })).toBeNull()
  })

  it('still null when the winner has no grounded reason', () => {
    const r = forged({ ranked: [entry(DECISIVE[0], 1, []), entry(DECISIVE[1], 0.5, [])] })
    expect(derivePick(r, NO_CRITERIA, { explicitChoiceRequest: true })).toBeNull()
  })

  it('still null on an exact tie — nothing to lean on', () => {
    const reasons = [{ key: 'price', detail: '25.8tr', contribution: 1 }]
    const r = forged({ ranked: [entry(DECISIVE[0], 1, reasons), entry(DECISIVE[1], 1, reasons)] })
    expect(derivePick(r, NO_CRITERIA, { explicitChoiceRequest: true })).toBeNull()
  })

  it('is stated as a rule the model receives', () => {
    expect(buildShoppingGroundingBlock()).toContain('KHI USER DA NHO BAN CHON')
  })
})

// ── TESTS C, D, E — recommendation, trade-off, rejected alternatives ────────

describe('C/D/E — the decision is explained, not just made', () => {
  const ranked = rankCandidates(DECISIVE, NO_CRITERIA)
  const pick = derivePick(ranked, NO_CRITERIA, { explicitChoiceRequest: true }) as Pick

  /**
   * A reply of the approved shape: recommend, why, trade-off, rejected, scoped.
   *
   * It NAMES what it picked. A recommendation that does not say which listing it
   * is recommending is not a recommendation, which is why `analyzeConsultativeReply`
   * requires the lean sentence to carry a candidate name — and why naming the shop
   * alone, as the shipped reply did, does not register as one.
   */
  const GOOD = [
    `Mình chọn ${DECISIVE[0].name} cho bạn.`,
    'Vì giá 25.8 triệu là thấp nhất trong các lựa chọn mình tìm được, và shop có 4.7/5 từ 704 đánh giá.',
    `Đánh đổi: ${DECISIVE[1].name} có ít đánh giá hơn nhưng chuyên Apple nên bảo hành có thể tốt hơn.`,
  ].join(' ')

  it('E — the payload carries the runner-up and what it leads on', () => {
    const payload = buildPickPayload(pick)
    expect(payload.pick).toBe(ranked.ranked[0].candidate.name)
    expect(payload.not_chosen).toBe(ranked.ranked[1].candidate.name)
    expect(Array.isArray(payload.decided_by)).toBe(true)
    expect((payload.decided_by as unknown[]).length).toBeGreaterThan(0)
  })

  it('C — a compliant reply reads as a recommendation with a reason', () => {
    const a = analyzeConsultativeReply(GOOD, { ranked, need: NO_CRITERIA, pick })
    expect(a.pick.present).toBe(true)
    expect(a.why.present).toBe(true)
  })

  it('D — a compliant reply states a trade-off', () => {
    const a = analyzeConsultativeReply(GOOD, { ranked, need: NO_CRITERIA, pick })
    expect(a.tradeoff.present).toBe(true)
  })

  it('the reply production shipped does NOT read as a recommendation', () => {
    // It listed options and asked the user to choose. This is the regression anchor.
    const shipped = 'Mình tìm được vài lựa chọn cho bạn. Zin100.vn: 25.8 triệu. Tín Phát: 27.5 triệu. Bạn đã quyết định chọn shop nào rồi?'
    expect(analyzeConsultativeReply(shipped, { ranked, need: NO_CRITERIA, pick }).pick.present).toBe(false)
  })

  it('C/E — stated as rules the model receives', () => {
    const block = buildShoppingGroundingBlock()
    expect(block).toContain('DE XUAT PHAI KEM LY DO VA DANH DOI')
    expect(block).toContain('CAC LUA CHON KHONG CHON')
  })
})

// ── TEST F — configuration equivalence ──────────────────────────────────────

describe('F — equivalence may not be inferred from incomplete titles', () => {
  const M1 = 'Macbook Pro M1 14,2inch | 32GB | 512GB | Likenew'
  const M1_PRO = 'Macbook Pro 14inch (2021) M1 Pro 32GB/512GB Likenew'

  it('M1 and M1 Pro are not the same configuration', () => {
    expect(titlesSupportConfigEquivalence(M1, M1_PRO)).toBe(false)
  })

  it('identical chip, capacity AND condition may be called equivalent', () => {
    expect(titlesSupportConfigEquivalence(M1_PRO, 'MacBook Pro 14 M1 Pro 32GB 512GB likenew — shop B')).toBe(true)
  })

  it('a matching chip is not enough when the condition is unstated', () => {
    expect(titlesSupportConfigEquivalence(M1_PRO, 'MacBook Pro 14 M1 Pro 32GB/512GB')).toBe(false)
  })

  it('a matching chip and condition is not enough when capacity differs', () => {
    // Mutation M17 survived until this existed: nothing else in the suite varied
    // capacity while holding chip and condition equal.
    expect(titlesSupportConfigEquivalence(M1_PRO, 'MacBook Pro 14 M1 Pro 16GB/512GB Likenew')).toBe(false)
  })

  it('detects the claim production shipped', () => {
    expect(claimsConfigEquivalence('cấu hình hoàn toàn giống nhau (M1 32GB 512GB)')).toBe(true)
    expect(claimsConfigEquivalence('hai máy y hệt nhau')).toBe(true)
  })

  it('does not fire on a reply that compares without claiming equivalence', () => {
    expect(claimsConfigEquivalence('Zin100 là bản M1, Tín Phát là M1 Pro nên mạnh hơn.')).toBe(false)
  })

  it('the shipped follow-up is a violation: claim made, titles do not support it', () => {
    const claimed = claimsConfigEquivalence('Giá chênh 1.7 triệu mà cấu hình hoàn toàn giống nhau (M1 32GB 512GB).')
    expect(claimed && !titlesSupportConfigEquivalence(M1, M1_PRO)).toBe(true)
  })

  it('is stated as a rule the model receives', () => {
    expect(buildShoppingGroundingBlock()).toContain('KHONG KHANG DINH HAI TIN DANG CUNG CAU HINH')
  })
})

// ── TEST H — condition / provenance (follow-up defect, prod UAT 2026-08-23) ─
//
// On 6b4e9b2 the reply asserted "Giá rẻ nhất trong các lựa chọn chính hãng".
// Neither the pick nor the runner-up states any condition; the ONE row that says
// "Chính Hãng" is a different, far more expensive machine. Gap D above does not
// reach this — it governs CONFIGURATION equivalence, and none was claimed.

describe('H — a condition belongs only to the listing whose title states it', () => {
  /** The rows production actually had. Only ROW_3 states a condition. */
  const ROW_0 = { title: 'Macbook Pro M1 14,2inch, Apple M1 | 32GB | 512GB', seller: 'Zin100.vn' }
  const ROW_1 = { title: 'Macbook Pro 14inch 2021 M1 (8CPU/14GPU) 32GB/512GB', seller: 'Tín Phát' }
  const ROW_3 = { title: 'MacBook Pro M4 10CPU/10GPU 16GB/512GB Chính Hãng', seller: 'Vender' }
  const SHIPPED = [ROW_0, ROW_1, ROW_3]

  it('rejects the exact sentence production shipped', () => {
    expect(unsupportedConditionClaim('Giá rẻ nhất trong các lựa chọn chính hãng.', SHIPPED)).toBe(true)
  })

  it('an unstated condition may not be claimed for a single listing', () => {
    expect(unsupportedConditionClaim('Máy này là hàng chính hãng.', [{ title: 'M1 32GB 512GB' }])).toBe(true)
  })

  it('the same sentence is fine when that listing states it', () => {
    expect(unsupportedConditionClaim('Máy này là hàng chính hãng.', [{ title: 'M1 32GB 512GB Chính Hãng' }])).toBe(false)
  })

  it('one row stating a condition does not make it true of both', () => {
    const rows = [{ title: 'M1 32GB 512GB Chính Hãng' }, { title: 'M1 32GB 512GB' }]
    expect(unsupportedConditionClaim('Cả hai đều chính hãng.', rows)).toBe(true)
  })

  it('attributing each condition to the row that states it is fine', () => {
    const rows = [{ title: 'M1 32GB 512GB Chính Hãng' }, { title: 'M1 32GB 512GB cũ' }]
    expect(unsupportedConditionClaim('Máy đầu là hàng chính hãng, còn máy sau là máy cũ.', rows)).toBe(false)
  })

  it('a shop name is not evidence of provenance', () => {
    const rows = [{ title: 'M1 32GB 512GB', seller: 'Apple Official Store' }]
    expect(unsupportedConditionClaim('Apple Official Store nên máy chính hãng.', rows)).toBe(true)
    expect(unsupportedConditionClaim('Đây là máy chính hãng.', rows)).toBe(true)
  })

  it('naming a shop pins the claim to THAT row, not to whichever row suits', () => {
    // Zin100 states no condition; the "Chính Hãng" row is a different machine.
    expect(unsupportedConditionClaim('Zin100 bán hàng chính hãng, 25.8 triệu.', SHIPPED)).toBe(true)
  })

  it('protects the whole condition vocabulary, not only "chính hãng"', () => {
    const bare = [{ title: 'M1 32GB 512GB' }]
    for (const claim of [
      'Máy này like new.',
      'Đây là máy cũ.',
      'Hàng còn nguyên seal.',
      'Máy refurbished.',
      'This one is sealed.',
    ]) expect(unsupportedConditionClaim(claim, bare), claim).toBe(true)
  })

  it('judges per sentence — a correct attribution cannot launder a wrong one', () => {
    expect(unsupportedConditionClaim('Vender ghi rõ Chính Hãng. Zin100 cũng chính hãng.', SHIPPED)).toBe(true)
    // Judged as one blob, the shop named in the first sentence would answer for
    // the collective claim in the second, and this would read as compliant.
    expect(unsupportedConditionClaim('Vender là hàng chính hãng. Cả hai máy còn lại đều chính hãng.', SHIPPED)).toBe(true)
  })

  it('leaves the row that DOES state the condition alone', () => {
    expect(unsupportedConditionClaim('Vender bán bản Chính Hãng, 48 triệu.', SHIPPED)).toBe(false)
  })

  it('does not over-block ordinary product and price language', () => {
    for (const ok of [
      'Zin100.vn 25.8 triệu, Tín Phát 27.5 triệu — chênh 1.7 triệu.',
      'Bản M4 mới hơn nhưng đắt gần gấp đôi.',
      'Mình nói cụ thể hơn về giá nhé.',
    ]) expect(unsupportedConditionClaim(ok, SHIPPED), ok).toBe(false)
  })

  it('saying the title does NOT state a condition is the compliant behaviour', () => {
    expect(unsupportedConditionClaim('Tiêu đề không ghi rõ máy chính hãng hay máy cũ.', SHIPPED)).toBe(false)
  })

  it('matching configurations establish nothing about condition', () => {
    // The two evidence dimensions are independent: identical specs, no provenance.
    const rows = [{ title: 'MacBook Pro 14 M1 Pro 32GB 512GB' }, { title: 'MacBook Pro 14 M1 Pro 32GB 512GB' }]
    expect(titlesSupportConfigEquivalence(rows[0].title, rows[1].title)).toBe(false)
    expect(unsupportedConditionClaim('Cả hai đều chính hãng.', rows)).toBe(true)
  })

  it('says nothing when there is no evidence to judge against', () => {
    expect(unsupportedConditionClaim('Máy này là hàng chính hãng.', [])).toBe(false)
  })

  it('is stated as a rule the model receives', () => {
    const block = buildShoppingGroundingBlock()
    expect(block).toContain('TINH TRANG / NGUON GOC LA THUOC TINH RIENG CUA TUNG TIN DANG')
    expect(block).toContain('KHONG suy ra tinh trang tu: ten shop')
    expect(block).toContain('KHONG chuyen tinh trang tu dong nay sang dong khac')
    expect(block).toContain('cac lua chon chinh hang')
  })

  it('does not displace the configuration rule shipped in #171', () => {
    expect(buildShoppingGroundingBlock()).toContain('KHONG KHANG DINH HAI TIN DANG CUNG CAU HINH')
  })
})

// ── TEST G — the follow-up path is untouched ────────────────────────────────

describe('G — nothing here adds a model call or a search', () => {
  it('the Pick is still derived from the ranked result alone', () => {
    // No I/O, no async: derivePick is pure, so a follow-up turn cannot be made
    // to search again by anything added here.
    expect(derivePick.constructor.name).toBe('Function')
    const ranked = rankCandidates(DECISIVE, NO_CRITERIA)
    expect(derivePick(ranked, NO_CRITERIA, { explicitChoiceRequest: true })).not.toBeNull()
  })

  it('the signal is derived from text only — no tool, no network', () => {
    expect(isExplicitChoiceRequest('nên mua cái nào?')).toBe(true)
  })
})
