import { describe, expect, it } from 'vitest'
import { buildGroundedCandidateFactSentence, buildGroundedFactsBlock, comparableOn, groundCandidate } from './groundedFacts'
import { extractDelta, applyDelta, isPluralRejection } from './consultationDelta'
import { rankCandidates } from './candidateRanking'
import { normalizeVN } from './intent'
import { createState, isRejected, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'

const OWNER = ownerScopeFor({ userId: 'alice' })
const place = (name: string, facts: Record<string, string | number> = {}): Candidate => ({
  candidateId: `pid-${name}`, name, type: 'place', source: 'search_places', retrievedAt: 0, facts,
})

/** The real captured shapes: one with hours, one with an address only. */
const COSA = place('Cà Phê Cosa Nostra', { address: '24 Phố Tông Đản', opening_hours: '08:00-12:00' })
const MVTTS = place('Cà Phê MVTTS', { address: '5 Nhà Thờ' })
const ORICK = place('Orick Coffee', { address: '46 Phố Lý Thường Kiệt' })

describe('facts are composed from evidence, never authored', () => {
  it('1. a candidate WITH hours states them', () => {
    expect(buildGroundedCandidateFactSentence(COSA)).toContain('08:00-12:00')
  })

  it('2. a candidate WITHOUT hours yields no hours fragment at all', () => {
    const s = buildGroundedCandidateFactSentence(MVTTS)
    expect(s).toContain('5 Nhà Thờ')
    expect(s).not.toMatch(/giờ mở cửa|mở cả ngày|\d{2}:\d{2}/)
  })

  it('3/4. price appears only when evidenced', () => {
    const priced = place('Shop', { price: '25.800.000 ₫' })
    expect(buildGroundedCandidateFactSentence(priced)).toContain('25.800.000 ₫')
    expect(buildGroundedCandidateFactSentence(MVTTS)).not.toMatch(/giá/)
  })

  it('5. no wifi evidence -> wifi is not a fact, and is listed as a gap', () => {
    const g = groundCandidate(MVTTS)
    expect(g.verifiedFacts.some(f => f.field === 'wifi')).toBe(false)
    expect(g.unknownFields).toContain('wifi')
    expect(buildGroundedCandidateFactSentence(MVTTS)).not.toMatch(/wifi/i)
  })

  it('6. no size evidence -> size is not a fact', () => {
    expect(groundCandidate(MVTTS).unknownFields).toContain('quy mô')
    expect(buildGroundedCandidateFactSentence(MVTTS)).not.toMatch(/quy mô|nhỏ|lớn/)
  })

  it('7. candidate A facts never appear on candidate B', () => {
    const block = buildGroundedFactsBlock([COSA, MVTTS])
    const cosaLine = block.split('\n').find(l => l.includes('Cosa Nostra')) ?? ''
    const mvLine = block.split('\n').find(l => l.includes('MVTTS')) ?? ''

    expect(cosaLine).toContain('08:00-12:00')
    expect(mvLine).not.toContain('08:00-12:00')
    expect(mvLine).toContain('5 Nhà Thờ')
  })

  it('8. a price comparison needs a price on BOTH', () => {
    expect(comparableOn('price', [COSA, MVTTS])).toBe(false)
    expect(comparableOn('price', [place('A', { price: '100k' }), place('B', { price: '150k' })])).toBe(true)
    expect(comparableOn('price', [place('A', { price: '100k' }), MVTTS])).toBe(false)
  })

  it('9. an hours comparison needs hours on BOTH', () => {
    expect(comparableOn('opening_hours', [COSA, MVTTS])).toBe(false)
    expect(comparableOn('opening_hours', [COSA, place('B', { opening_hours: '07:00-22:00' })])).toBe(true)
  })

  it('the block states which comparisons are permitted', () => {
    const block = buildGroundedFactsBlock([COSA, MVTTS])
    expect(block).toMatch(/So sanh gia: KHONG DUOC/)
    expect(block).toMatch(/So sanh gio mo cua: KHONG DUOC/)
  })

  it('10. a user preference is never presented as a candidate fact', () => {
    const block = buildGroundedFactsBlock([COSA, MVTTS])
    // "quiet" is something the user wants; nothing here may assert it of a venue.
    expect(block).toMatch(/uu tien cua user .* KHONG phai su that ve quan/i)
    expect(block).toMatch(/KHONG duoc noi "quan nay yen tinh"/)
    expect(block.split('\n').find(l => l.includes('Cosa Nostra'))).not.toMatch(/yên tĩnh/)
  })

  it('a candidate with no evidence at all says exactly that', () => {
    expect(buildGroundedCandidateFactSentence(place('Trống'))).toMatch(/chưa có dữ liệu nào được xác minh/)
  })
})

describe('rejection resolves singular vs plural', () => {
  function afterReply(named: Candidate[], pool: Candidate[]): ConversationState {
    const s = createState(newConversationId(), OWNER)
    s.candidates = pool
    s.presentedCandidates = named.map(c => c.candidateId)
    s.lastPresentedCandidates = named.map(c => c.candidateId)   // order = order named
    return s
  }

  const POOL = [COSA, ORICK, MVTTS, place('Cà Phê AnAn', { address: '22 Lý Quốc Sư' })]

  it('11. an explicit name rejects only that candidate', () => {
    const s = afterReply([ORICK, COSA], POOL)
    const d = extractDelta('mình không thích Orick Coffee', s, 'rejection', 5)

    expect(d.rejection!.ref).toBe(ORICK.candidateId)
  })

  it('12. singular "quán đó" rejects exactly ONE — the primary recommendation', () => {
    // Measured: this rejected BOTH the recommendation and its alternative.
    const s = afterReply([ORICK, COSA], POOL)
    const d = extractDelta('Mình không thích quán đó.', s, 'rejection', 5)

    expect(d.rejection!.ref).toBe(ORICK.candidateId)
    expect(d.rejection!.ref).not.toContain(COSA.candidateId)
  })

  it('13. plural "mấy quán đó" rejects everything that reply named', () => {
    const s = afterReply([ORICK, COSA], POOL)
    const d = extractDelta('mình không thích mấy quán đó', s, 'rejection', 5)

    expect(d.rejection!.ref).toContain(ORICK.candidateId)
    expect(d.rejection!.ref).toContain(COSA.candidateId)
  })

  it.each([
    ['mấy quán này', true], ['các quán đó', true], ['những chỗ này', true],
    ["I don't like those", true], ['none of these', true], ['deu khong hop', true],
    ['quán đó', false], ['chỗ đó', false], ["I don't like that one", false],
  ])('classifies %s plural=%s', (text, plural) => {
    // The resolver receives normalised text (diacritics stripped), so the
    // classifier is specified against that form.
    expect(isPluralRejection(normalizeVN(String(text).toLowerCase()))).toBe(plural)
  })

  it('15/16/17. the rejected candidate is excluded from ranking on THIS turn', () => {
    const s = afterReply([ORICK, COSA], POOL)
    const after = applyDelta(s, extractDelta('Mình không thích quán đó.', s, 'rejection', 5))

    // applyDelta runs before ranking in the route, so the ranking this turn
    // already excludes it — the reply cannot recommend what it just rejected.
    expect(isRejected(ORICK, after)).toBe(true)
    const ranked = rankCandidates(after.candidates, after).ranked.map(r => r.candidate.name)
    expect(ranked).not.toContain('Orick Coffee')
    expect(buildGroundedFactsBlock(after.candidates.filter(c => !isRejected(c, after)))).not.toContain('Orick Coffee')
  })

  it('18. unrelated candidates remain eligible', () => {
    const s = afterReply([ORICK, COSA], POOL)
    const after = applyDelta(s, extractDelta('Mình không thích quán đó.', s, 'rejection', 5))
    const ranked = rankCandidates(after.candidates, after).ranked.map(r => r.candidate.name)

    expect(ranked).toContain('Cà Phê Cosa Nostra')
    expect(ranked).toContain('Cà Phê MVTTS')
    expect(ranked).toContain('Cà Phê AnAn')
  })

  it('19/20. an earlier rejection persists and does not duplicate', () => {
    const s = afterReply([ORICK, COSA], POOL)
    s.rejections = [{ ref: MVTTS.candidateId, turn: 3 }]
    const after = applyDelta(s, extractDelta('Mình không thích quán đó.', s, 'rejection', 5))

    expect(isRejected(MVTTS, after)).toBe(true)
    expect(isRejected(ORICK, after)).toBe(true)
    expect(after.rejections.filter(r => r.ref === MVTTS.candidateId)).toHaveLength(1)
  })
})
