import { describe, it, expect } from 'vitest'
import { evaluateFact, promotionFor, SOURCE_AUTHORITY, SINGLE_SOURCE_PROMOTABLE, type EvidenceInput } from './evidenceGate'
import { FACT_TYPES } from './factTypes'

const NOW = new Date('2026-11-10T08:00:00Z')
const recent = new Date('2026-11-05T08:00:00Z')
const longAgo = new Date('2026-01-01T08:00:00Z')

const ev = (over: Partial<EvidenceInput> = {}): EvidenceInput => ({ relation: 'SUPPORTS', sourceType: 'PROVIDER_API', sourceDomain: 'maps.google.com', ...over })
const fact = (evidence: EvidenceInput[], over: Partial<Parameters<typeof evaluateFact>[0]> = {}) => ({ factType: 'address', retrievedAt: recent, evidence, ...over })

describe('evaluateFact: states', () => {
  it('no evidence is INSUFFICIENT; an unknown fact type is INSUFFICIENT too (never guessed)', () => {
    expect(evaluateFact(fact([]), NOW).state).toBe('INSUFFICIENT')
    expect(evaluateFact(fact([ev()], { factType: 'moon_phase' }), NOW).state).toBe('INSUFFICIENT')
  })
  it('one provider source of MEDIUM authority is SINGLE_SOURCE_SUPPORT', () => {
    const r = evaluateFact(fact([ev()]), NOW)
    expect(r).toEqual({ state: 'SINGLE_SOURCE_SUPPORT', independentSupport: 1, bestAuthority: 'MEDIUM' })
  })
  it('two independent sources are STRONG_SUPPORT; the same source twice, or two pages of one publisher, count once', () => {
    expect(evaluateFact(fact([ev(), ev({ sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'quana.vn' })]), NOW).state).toBe('STRONG_SUPPORT')
    expect(evaluateFact(fact([ev(), ev()]), NOW).state).toBe('SINGLE_SOURCE_SUPPORT')
    expect(evaluateFact(fact([ev({ sourceType: 'NEWS', independenceGroup: 'g1' }), ev({ sourceType: 'OFFICIAL_BUSINESS', independenceGroup: 'g1', sourceDomain: 'a.vn' })]), NOW).state).toBe('SINGLE_SOURCE_SUPPORT')
  })
  it('a LOW-authority or merely qualifying source gives PARTIAL_SUPPORT at most', () => {
    expect(evaluateFact(fact([ev({ sourceType: 'NEWS' })]), NOW).state).toBe('PARTIAL_SUPPORT')
    expect(evaluateFact(fact([ev({ relation: 'QUALIFIES' })]), NOW).state).toBe('PARTIAL_SUPPORT')
  })
  it('popularity is not evidence: KOL, community and UGC sources carry no authority for any type', () => {
    for (const t of Object.keys(FACT_TYPES)) {
      for (const sourceType of ['KOL', 'COMMUNITY', 'UGC', 'OTHER'] as const) {
        expect(evaluateFact({ factType: t, retrievedAt: recent, evidence: [ev({ sourceType })] }, NOW).state, `${t}/${sourceType}`).toBe('INSUFFICIENT')
      }
    }
  })
  it('an authoritative refutation makes it CONFLICTING; a refutation from a source with no authority does not', () => {
    expect(evaluateFact(fact([ev(), ev({ relation: 'REFUTES', sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'quana.vn' })]), NOW).state).toBe('CONFLICTING')
    expect(evaluateFact(fact([ev(), ev({ relation: 'REFUTES', sourceType: 'COMMUNITY', sourceDomain: 'forum.vn' })]), NOW).state).toBe('SINGLE_SOURCE_SUPPORT')
  })
  it('retracted evidence is ignored', () => {
    expect(evaluateFact(fact([ev({ active: false })]), NOW).state).toBe('INSUFFICIENT')
    expect(evaluateFact(fact([ev(), ev({ relation: 'REFUTES', sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'q.vn', active: false })]), NOW).state).toBe('SINGLE_SOURCE_SUPPORT')
  })
  it('a supported fact past its freshness window needs revalidation (stale is not expired)', () => {
    expect(evaluateFact(fact([ev()], { factType: 'ticket_price', retrievedAt: longAgo, evidence: [ev({ sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'a.vn' })] }), NOW).state).toBe('STALE_REVALIDATION_REQUIRED')
  })
  it('a version past its validity, or retired, is EXPIRED_OR_SUPERSEDED whatever its evidence', () => {
    expect(evaluateFact(fact([ev(), ev({ sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'a.vn' })], { validUntil: '2026-11-01T00:00:00Z' }), NOW).state).toBe('EXPIRED_OR_SUPERSEDED')
    for (const status of ['EXPIRED', 'SUPERSEDED', 'REJECTED'] as const) expect(evaluateFact(fact([ev()], { status }), NOW).state).toBe('EXPIRED_OR_SUPERSEDED')
    expect(evaluateFact(fact([ev()], { validUntil: '2026-12-01T00:00:00Z' }), NOW).state).toBe('SINGLE_SOURCE_SUPPORT')
  })
})

describe('promotionFor: when a candidate may become ACTIVE', () => {
  it('two independent sources: promote as VERIFIED', () => {
    expect(promotionFor(fact([ev(), ev({ sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'quana.vn' })]), NOW)).toEqual({ action: 'promote', verification: 'VERIFIED', reason: 'two_independent_sources' })
  })
  it('one provider source: promote as PARTIALLY_VERIFIED for address, phone, website and opening hours only', () => {
    for (const t of SINGLE_SOURCE_PROMOTABLE) expect(promotionFor({ factType: t, retrievedAt: recent, evidence: [ev()] }, NOW).action, t).toBe('promote')
    expect(promotionFor(fact([ev()]), NOW)).toEqual({ action: 'promote', verification: 'PARTIALLY_VERIFIED', reason: 'single_source_allowed_for_type' })
  })
  it('one source is NOT enough for prices or "permanently closed": they wait for a second source', () => {
    expect(promotionFor({ factType: 'ticket_price', retrievedAt: recent, evidence: [ev({ sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'a.vn' })] }, NOW)).toEqual({ action: 'hold', reason: 'single_source_not_enough_for_type' })
    expect(promotionFor({ factType: 'permanently_closed', retrievedAt: recent, evidence: [ev()] }, NOW).action).toBe('hold')
  })
  it('conflict disputes, stale and expired and thin evidence hold', () => {
    expect(promotionFor(fact([ev(), ev({ relation: 'REFUTES', sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'q.vn' })]), NOW).action).toBe('dispute')
    expect(promotionFor(fact([ev()], { retrievedAt: longAgo, factType: 'ticket_price' }), NOW).action).toBe('hold')
    expect(promotionFor(fact([ev()], { status: 'EXPIRED' }), NOW)).toEqual({ action: 'hold', reason: 'expired_or_superseded' })
    expect(promotionFor(fact([ev({ sourceType: 'NEWS' })]), NOW)).toEqual({ action: 'hold', reason: 'only_partial_support' })
    expect(promotionFor(fact([]), NOW)).toEqual({ action: 'hold', reason: 'insufficient_evidence' })
  })
})

describe('the authority table', () => {
  it('has an entry for every known fact type, and never gives a popularity source any authority', () => {
    expect(Object.keys(SOURCE_AUTHORITY).sort()).toEqual(Object.keys(FACT_TYPES).sort())
    for (const t of Object.keys(SOURCE_AUTHORITY) as Array<keyof typeof SOURCE_AUTHORITY>) {
      for (const s of ['KOL', 'COMMUNITY', 'UGC', 'OTHER'] as const) expect(SOURCE_AUTHORITY[t][s]).toBeUndefined()
    }
  })
  it('a business is the authority on its own hours and prices; the government on addresses and state attractions', () => {
    expect(SOURCE_AUTHORITY.opening_hours.OFFICIAL_BUSINESS).toBe('HIGH')
    expect(SOURCE_AUTHORITY.menu_price.OFFICIAL_BUSINESS).toBe('HIGH')
    expect(SOURCE_AUTHORITY.address.GOVERNMENT).toBe('HIGH')
    expect(SOURCE_AUTHORITY.opening_hours.NEWS).toBe('LOW')
  })
})
