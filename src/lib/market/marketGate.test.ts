import { describe, it, expect } from 'vitest'
import { evaluateGate, duplicateCoverage, coverageRowValid, DEFAULT_REGISTRY, type Registry, type CoverageRow, type MarketDefinition } from './marketGate'

const mk = (id: string, lifecycleStatus: MarketDefinition['lifecycleStatus'] = 'MARKET_ACTIVE', extra: Partial<MarketDefinition> = {}): MarketDefinition =>
  ({ marketId: id, countryCode: id.toUpperCase(), lifecycleStatus, defaultLocale: 'en', supportedLocales: ['en'], defaultCurrency: 'USD', timezone: 'UTC', ...extra })
const row = (o: Partial<CoverageRow> = {}): CoverageRow => ({ marketId: 'aa', scopeType: 'MARKET', scopeId: 'aa', vertical: 'food', capability: 'search', actions: '*', coverage: 'FULL', ...o })
const reg = (coverage: CoverageRow[], markets: MarketDefinition[] = [mk('aa')]): Registry => ({ markets, coverage })
const q = (o = {}) => ({ marketId: 'aa', vertical: 'food', capability: 'search', action: 'query', ...o })

describe('market lifecycle and coverage are two axes', () => {
  it('an active market with FULL coverage allows', () => {
    expect(evaluateGate(q(), reg([row()]))).toMatchObject({ allowed: true, reason: 'ALLOWED', limited: false, guidance: null })
  })
  it('an active market does not mean every vertical: no coverage row is UNAVAILABLE (fail closed)', () => {
    expect(evaluateGate(q({ vertical: 'hotels' }), reg([row()]))).toMatchObject({ allowed: false, reason: 'NO_COVERAGE' })
    expect(evaluateGate(q({ capability: 'booking' }), reg([row()]))).toMatchObject({ allowed: false, reason: 'NO_COVERAGE' })
  })
  it('a market that is not ACTIVE does not serve; MARKET_READY serves only with an explicit sandbox allowance', () => {
    expect(evaluateGate(q(), reg([row()], [mk('aa', 'PLATFORM_READY')])).reason).toBe('MARKET_NOT_ACTIVE')
    expect(evaluateGate(q(), reg([row()], [mk('aa', 'MARKET_READY')])).reason).toBe('MARKET_NOT_ACTIVE')
    expect(evaluateGate(q(), reg([row()], [mk('aa', 'MARKET_READY', { sandboxAllowed: true })])).allowed).toBe(true)
  })
  it('LIMITED is allowed with the limit flagged; UNAVAILABLE and RESTRICTED deny with their own reasons', () => {
    expect(evaluateGate(q(), reg([row({ coverage: 'LIMITED' })]))).toMatchObject({ allowed: true, limited: true, reason: 'LIMITED_COVERAGE' })
    expect(evaluateGate(q(), reg([row({ coverage: 'UNAVAILABLE' })]))).toMatchObject({ allowed: false, reason: 'COVERAGE_UNAVAILABLE' })
    expect(evaluateGate(q(), reg([row({ coverage: 'RESTRICTED' })]))).toMatchObject({ allowed: false, reason: 'COVERAGE_RESTRICTED' })
  })
})

describe('scope and action granularity', () => {
  it('the most specific scope decides: a city can be RESTRICTED inside a FULL market, or FULL inside a LIMITED one', () => {
    const r = reg([row(), row({ scopeType: 'CITY', scopeId: 'c1', coverage: 'RESTRICTED' })])
    expect(evaluateGate(q({ cityId: 'c1' }), r)).toMatchObject({ allowed: false, reason: 'COVERAGE_RESTRICTED', decidedBy: { scopeType: 'CITY', scopeId: 'c1' } })
    expect(evaluateGate(q({ cityId: 'other' }), r).allowed).toBe(true)
    const r2 = reg([row({ coverage: 'LIMITED' }), row({ scopeType: 'REGION', scopeId: 'r1', coverage: 'FULL' })])
    expect(evaluateGate(q({ regionId: 'r1' }), r2)).toMatchObject({ allowed: true, limited: false })
    expect(evaluateGate(q(), r2)).toMatchObject({ limited: true })
  })
  it('a row for one action does not cover another; a broader row still answers when the specific one is for a different action', () => {
    const r = reg([row({ actions: ['query'] })])
    expect(evaluateGate(q({ action: 'save' }), r)).toMatchObject({ allowed: false, reason: 'ACTION_NOT_COVERED' })
    const r2 = reg([row(), row({ scopeType: 'CITY', scopeId: 'c1', actions: ['save'], coverage: 'RESTRICTED' })])
    expect(evaluateGate(q({ cityId: 'c1', action: 'query' }), r2).allowed).toBe(true)
    expect(evaluateGate(q({ cityId: 'c1', action: 'save' }), r2).allowed).toBe(false)
  })
})

describe('unknown market and Host guidance', () => {
  it('no resolved market, an unknown market and an inactive one are denied with structured guidance, never a silent switch', () => {
    for (const marketId of [null, 'zz']) {
      const d = evaluateGate(q({ marketId }), reg([row()]))
      expect(d.allowed).toBe(false); expect(d.guidance).toMatchObject({ status: 'UNSUPPORTED_MARKET', switchToSupportedMarket: false })
    }
  })
  it('when the person named their own market the guidance does not tell the Host to push them elsewhere; when no market is known it asks', () => {
    expect(evaluateGate(q({ marketId: 'zz', userNamedMarket: true }), reg([row()])).guidance).toMatchObject({ askSupportedDestination: false, switchToSupportedMarket: false })
    expect(evaluateGate(q({ marketId: null }), reg([row()])).guidance).toMatchObject({ askSupportedDestination: true })
  })
  it('the query has no field for an IP address: the gate cannot be handed one', () => {
    expect(Object.keys(q())).not.toContain('ip'); expect(evaluateGate.length).toBe(2)
  })
})

describe('coverage uniqueness', () => {
  it('scope ids are never blank, so uniqueness does not rest on NULL semantics', () => {
    expect(coverageRowValid(row())).toBe(true)
    expect(coverageRowValid(row({ scopeId: '' }))).toBe(false)
    expect(coverageRowValid(row({ scopeType: 'MARKET', scopeId: 'other' }))).toBe(false)
    expect(coverageRowValid(row({ scopeType: 'CITY', scopeId: 'c1' }))).toBe(true)
  })
  it('duplicates of one scope are reported; the same vertical at different scopes is fine', () => {
    expect(duplicateCoverage([row(), row({ coverage: 'LIMITED' })])).toEqual(['aa|MARKET|aa|food|search'])
    expect(duplicateCoverage([row(), row({ scopeType: 'CITY', scopeId: 'c1' })])).toEqual([])
  })
})

describe('DEFAULT_REGISTRY: today behaviour only', () => {
  it('Vietnam works for the verticals Tappy serves now; any other market is denied; no duplicates', () => {
    expect(evaluateGate({ marketId: 'vn', vertical: 'food', capability: 'search', action: 'query' }, DEFAULT_REGISTRY).allowed).toBe(true)
    expect(evaluateGate({ marketId: 'th', vertical: 'food', capability: 'search', action: 'query' }, DEFAULT_REGISTRY)).toMatchObject({ allowed: false, reason: 'UNKNOWN_MARKET' })
    expect(duplicateCoverage(DEFAULT_REGISTRY.coverage)).toEqual([])
    expect(DEFAULT_REGISTRY.coverage.every(coverageRowValid)).toBe(true)
  })
})
