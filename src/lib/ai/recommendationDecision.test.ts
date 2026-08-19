import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { REASON_CODES, renderRecommendation, validateDecision, type RecommendationDecision } from './recommendationDecision'
import { createState, newConversationId, ownerScopeFor, type Candidate, type ConversationState } from './conversationState'

const OWNER = ownerScopeFor({ userId: 'alice' })
const cand = (name: string, facts: Record<string, string | number> = {}, type: 'place' | 'product' = 'place'): Candidate => ({
  candidateId: `pid-${name}`, name, type, source: type === 'place' ? 'search_places' : 'search_products',
  retrievedAt: 0, facts,
})

/** Real captured shapes: hours on two, nothing but an address on the third. */
const COSA = cand('Cosa Nostra', { address: '24 Tông Đản', opening_hours: '08:00-12:00' })
const ANAN = cand('AnAn', { address: '22 Lý Quốc Sư', opening_hours: 'Mo-Su 08:00-22:30', wifi: 'true' })
const MVTTS = cand('MVTTS', { address: '5 Nhà Thờ' })

function stateWith(cands: Candidate[]): ConversationState {
  const s = createState(newConversationId(), OWNER)
  s.candidates = cands
  return s
}
const decide = (d: Partial<RecommendationDecision>, s: ConversationState, ranked = s.candidates) =>
  validateDecision({ recommendedId: '', reasonCodes: [], ...d } as RecommendationDecision, s, ranked)

describe('candidate identity', () => {
  const s = stateWith([COSA, ANAN, MVTTS])

  it('accepts a valid id', () => {
    expect(decide({ recommendedId: COSA.candidateId }, s).recommended?.name).toBe('Cosa Nostra')
  })

  it('falls back to the top ranked on an unknown id, never to nothing', () => {
    const v = decide({ recommendedId: 'pid-does-not-exist' }, s)
    expect(v.recommended?.name).toBe('Cosa Nostra')
    expect(v.dropped[0].why).toMatch(/unknown, rejected or ineligible/)
  })

  it('collapses a duplicate alternative', () => {
    const v = decide({ recommendedId: COSA.candidateId, alternativeId: COSA.candidateId }, s)
    expect(v.alternative).toBeUndefined()
  })

  it('a REJECTED candidate can be neither recommended nor an alternative', () => {
    const r = stateWith([COSA, ANAN])
    r.rejections = [{ ref: COSA.candidateId, turn: 2 }]
    const v = decide({ recommendedId: COSA.candidateId, alternativeId: COSA.candidateId }, r)

    expect(v.recommended?.name).toBe('AnAn')
    expect(v.alternative).toBeUndefined()
  })

  it('a rejected candidate cannot supply a fact either', () => {
    const r = stateWith([COSA, ANAN])
    r.rejections = [{ ref: COSA.candidateId, turn: 2 }]
    const v = decide({
      recommendedId: ANAN.candidateId,
      reasonCodes: [{ code: 'BETTER_OPENING_HOURS', candidateId: ANAN.candidateId, otherId: COSA.candidateId }],
    }, r)

    expect(v.reasons).toHaveLength(0)
    expect(renderRecommendation(v)).not.toContain('Cosa Nostra')
  })
})

describe('reason codes are closed and evidence-checked', () => {
  const s = stateWith([COSA, ANAN, MVTTS])

  it('rejects a code outside the vocabulary', () => {
    const v = decide({ recommendedId: COSA.candidateId, reasonCodes: [{ code: 'IS_COSY' }] }, s)
    expect(v.reasons).toHaveLength(0)
    expect(v.dropped[0].why).toMatch(/closed vocabulary/)
  })

  it('a comparative needs BOTH sides to have the dimension', () => {
    const ok = decide({
      recommendedId: ANAN.candidateId,
      reasonCodes: [{ code: 'BETTER_OPENING_HOURS', candidateId: ANAN.candidateId, otherId: COSA.candidateId }],
    }, s)
    expect(ok.reasons).toHaveLength(1)

    // MVTTS has no opening_hours — the comparison is dropped, not softened.
    const bad = decide({
      recommendedId: ANAN.candidateId,
      reasonCodes: [{ code: 'BETTER_OPENING_HOURS', candidateId: ANAN.candidateId, otherId: MVTTS.candidateId }],
    }, s)
    expect(bad.reasons).toHaveLength(0)
    expect(bad.dropped[0].why).toMatch(/opening_hours.*missing/)
  })

  it('a comparative with no second candidate is dropped', () => {
    const v = decide({ recommendedId: ANAN.candidateId, reasonCodes: [{ code: 'BETTER_RATING' }] }, stateWith([ANAN]))
    expect(v.reasons).toHaveLength(0)
  })

  it('QUIET can never become a venue fact — only PREFERENCE_UNVERIFIED', () => {
    const claimed = decide({
      recommendedId: COSA.candidateId,
      reasonCodes: [{ code: 'MATCHES_PREFERENCE', candidateId: COSA.candidateId, key: 'quiet' }],
    }, s)
    expect(claimed.reasons).toHaveLength(0)
    expect(claimed.dropped[0].why).toMatch(/no evidence for preference "quiet"/)

    const honest = decide({
      recommendedId: COSA.candidateId,
      reasonCodes: [{ code: 'PREFERENCE_UNVERIFIED', key: 'quiet' }],
    }, s)
    expect(renderRecommendation(honest)).toMatch(/chưa có dữ liệu xác minh/)
  })

  it('WiFi true renders; WiFi absent stays unknown and is never negated', () => {
    const yes = decide({
      recommendedId: ANAN.candidateId,
      reasonCodes: [{ code: 'MATCHES_PREFERENCE', candidateId: ANAN.candidateId, key: 'wifi' }],
    }, s)
    expect(renderRecommendation(yes)).toMatch(/WiFi/)

    const no = decide({
      recommendedId: MVTTS.candidateId,
      reasonCodes: [{ code: 'MATCHES_PREFERENCE', candidateId: MVTTS.candidateId, key: 'wifi' }],
    }, s)
    expect(no.reasons).toHaveLength(0)
    expect(renderRecommendation(no)).not.toMatch(/không có WiFi|no Wi-Fi/i)
  })

  it('a hard constraint needs the field on that candidate', () => {
    const p = cand('MacBook', { price: '22.390.000 ₫', ram_gb: 32 }, 'product')
    const ps = stateWith([p])
    expect(decide({ recommendedId: p.candidateId, reasonCodes: [{ code: 'SATISFIES_HARD_CONSTRAINT', key: 'ram_gb' }] }, ps).reasons).toHaveLength(1)
    expect(decide({ recommendedId: p.candidateId, reasonCodes: [{ code: 'SATISFIES_HARD_CONSTRAINT', key: 'storage_gb' }] }, ps).reasons).toHaveLength(0)
  })

  it('distance needs distance evidence on both sides', () => {
    const near = cand('Near', { address: 'x', distance_km: 0.4 })
    const far = cand('Far', { address: 'y', distance_km: 2.1 })
    const noGps = cand('NoGps', { address: 'z' })
    expect(decide({ recommendedId: near.candidateId, reasonCodes: [{ code: 'CLOSER', candidateId: near.candidateId, otherId: far.candidateId }] }, stateWith([near, far])).reasons).toHaveLength(1)
    expect(decide({ recommendedId: near.candidateId, reasonCodes: [{ code: 'CLOSER', candidateId: near.candidateId, otherId: noGps.candidateId }] }, stateWith([near, noGps])).reasons).toHaveLength(0)
  })

  it('deduplicates an identical code', () => {
    const v = decide({
      recommendedId: ANAN.candidateId,
      reasonCodes: [
        { code: 'BETTER_OPENING_HOURS', candidateId: ANAN.candidateId, otherId: COSA.candidateId },
        { code: 'BETTER_OPENING_HOURS', candidateId: ANAN.candidateId, otherId: COSA.candidateId },
      ],
    }, s)
    expect(v.reasons).toHaveLength(1)
  })
})

describe('products keep their richer grounding', () => {
  const a = cand('Macbook Pro 16 2019 32GB/512GB', { price: '22.390.000 ₫', price_vnd: 22_390_000, ram_gb: 32, storage_gb: 512, condition: 'used', source_site: 'Lapvip' }, 'product')
  const b = cand('Macbook Pro 14 M1 Pro 32GB/512GB', { price: '29.550.000 ₫', price_vnd: 29_550_000, ram_gb: 32, storage_gb: 512, condition: 'used', source_site: 'Bạch Long' }, 'product')

  it('compares price when both are priced, and quotes each listing verbatim', () => {
    const v = decide({
      recommendedId: a.candidateId, alternativeId: b.candidateId,
      reasonCodes: [
        { code: 'BETTER_PRICE', candidateId: a.candidateId, otherId: b.candidateId },
        { code: 'SATISFIES_HARD_CONSTRAINT', candidateId: a.candidateId, key: 'ram_gb' },
      ],
    }, stateWith([a, b]))
    const out = renderRecommendation(v)

    expect(v.reasons).toHaveLength(2)
    expect(out).toContain('22.390.000 ₫')
    expect(out).toContain('29.550.000 ₫')
    expect(out).toMatch(/yêu cầu ram_gb[^)]*\(32\)/)
  })

  it('price level is ordinal and never becomes an amount', () => {
    const p1 = cand('P1', { price_level: 'PRICE_LEVEL_INEXPENSIVE' })
    const p2 = cand('P2', { price_level: 'PRICE_LEVEL_MODERATE' })
    const out = renderRecommendation(decide({
      recommendedId: p1.candidateId,
      reasonCodes: [{ code: 'BETTER_PRICE_LEVEL', candidateId: p1.candidateId, otherId: p2.candidateId }],
    }, stateWith([p1, p2])))

    expect(out).toContain('PRICE_LEVEL_INEXPENSIVE')
    expect(out).not.toMatch(/₫|VND|triệu/)
  })
})

describe('rendering is server-owned', () => {
  const s = stateWith([COSA, ANAN, MVTTS])

  it('a candidate never inherits another candidate\'s fact', () => {
    const out = renderRecommendation(decide({
      recommendedId: MVTTS.candidateId,
      reasonCodes: [{ code: 'MATCHES_PREFERENCE', candidateId: MVTTS.candidateId, key: 'wifi' }],
    }, s))
    expect(out).not.toContain('08:00-22:30')
    expect(out).not.toContain('22 Lý Quốc Sư')
  })

  it('with every reason dropped it states what IS known, inventing nothing', () => {
    const out = renderRecommendation(decide({
      recommendedId: MVTTS.candidateId,
      reasonCodes: [{ code: 'MATCHES_PREFERENCE', candidateId: MVTTS.candidateId, key: 'quiet' }],
    }, s))
    expect(out).toContain('MVTTS')
    expect(out).toContain('5 Nhà Thờ')
    expect(out).not.toMatch(/yên tĩnh(?!.*chưa có dữ liệu)/)
  })

  it('renders English when asked', () => {
    const out = renderRecommendation(decide({
      recommendedId: ANAN.candidateId,
      reasonCodes: [{ code: 'PREFERENCE_UNVERIFIED', key: 'quiet' }],
    }, s), 'en')
    expect(out).toMatch(/If it were me/)
    expect(out).toMatch(/no verified data/)
  })

  it('empty reason list still yields a safe factual reply', () => {
    const out = renderRecommendation(decide({ recommendedId: COSA.candidateId, reasonCodes: [] }, s))
    expect(out).toContain('Cosa Nostra')
    expect(out).toContain('08:00-12:00')
  })

  it('malformed input degrades safely instead of throwing', () => {
    expect(() => decide({ recommendedId: undefined as never, reasonCodes: undefined as never }, s)).not.toThrow()
    const v = decide({ recommendedId: undefined as never, reasonCodes: undefined as never }, s)
    expect(v.recommended).toBeTruthy()
  })

  it('an empty candidate pool says so rather than naming anything', () => {
    const out = renderRecommendation(decide({ recommendedId: 'x' }, stateWith([])))
    expect(out).toMatch(/chưa có lựa chọn nào đủ dữ liệu/)
  })
})

describe('the toolChoice amendment stays narrow', () => {
  const root = 'C:/Users/Admin/Claude/Projects/TappyAI/tappyai-d3'
  const types = readFileSync(`${root}/src/lib/ai/llm/types.ts`, 'utf8')
  const ai = readFileSync(`${root}/src/lib/ai/llm/ai.ts`, 'utf8')

  it('AIStreamOptions carries a NAMED-tool choice only', () => {
    expect(types).toContain("toolChoice?: { type: 'tool'; toolName: string }")
  })

  it('the provider forwards it, and only when set', () => {
    expect(ai).toContain('...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {})')
  })

  it('the maxSteps:1 pairing requirement is documented where it is declared', () => {
    expect(types).toMatch(/MUST be paired with `maxSteps: 1`/)
  })

  it('the closed vocabulary has no free-text escape hatch', () => {
    expect(REASON_CODES).toContain('PREFERENCE_UNVERIFIED')
    expect(REASON_CODES.some(c => /TEXT|NOTE|CUSTOM|OTHER/i.test(c))).toBe(false)
  })
})
