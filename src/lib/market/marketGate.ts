// Market & Capability Gate (R13 §5.5, §6): may THIS capability be offered in THIS market, region/city, vertical and action? Pure; the registry is passed in, so no table or provider is needed to test it.
//   · Market lifecycle (PLATFORM_READY / MARKET_READY / MARKET_ACTIVE) and service coverage (FULL / LIMITED / UNAVAILABLE / RESTRICTED) are two independent axes.
//   · An active market does not mean every vertical, provider or action is available: coverage is judged per Market + Region/City + Vertical + Capability + Action.
//   · The most specific scope wins (CITY over REGION over MARKET). No coverage row = UNAVAILABLE (fail closed).
//   · The market is an INPUT, resolved elsewhere from explicit or trusted context. An IP address is not an input and never decides a right or a nationality.
//   · Not wired into the chat route yet: Tappy is Vietnam-first and the existing behaviour already is "Vietnam works". DEFAULT_REGISTRY mirrors exactly that and nothing more.

export type MarketLifecycle = 'PLATFORM_READY' | 'MARKET_READY' | 'MARKET_ACTIVE'
export type Coverage = 'FULL' | 'LIMITED' | 'UNAVAILABLE' | 'RESTRICTED'
export type ScopeType = 'MARKET' | 'REGION' | 'CITY'

export interface MarketDefinition {
  /** the business key; the ISO country code is stored separately (a market may be a country or a business scope) */
  marketId: string
  countryCode: string
  lifecycleStatus: MarketLifecycle
  defaultLocale: string
  supportedLocales: readonly string[]
  defaultCurrency: string
  timezone: string
  /** MARKET_READY may serve only when a sandbox / limited rollout is explicitly allowed for it */
  sandboxAllowed?: boolean
}

export interface CoverageRow {
  marketId: string
  /** never null: a global scope is MARKET with the market id, so uniqueness does not depend on how a database treats NULL */
  scopeType: ScopeType
  scopeId: string
  vertical: string
  capability: string
  /** '*' = every action of the capability, else the listed actions only */
  actions: '*' | readonly string[]
  coverage: Coverage
}

export interface Registry { markets: readonly MarketDefinition[]; coverage: readonly CoverageRow[] }

export interface GateQuery {
  /** the market the Context Resolver settled on (explicit or trusted), or null when it could not */
  marketId: string | null
  regionId?: string | null
  cityId?: string | null
  vertical: string
  capability: string
  action: string
  /** did the person themselves name a market/destination? (a Host's guidance must not switch it for them) */
  userNamedMarket?: boolean
}

export type GateReason = 'ALLOWED' | 'LIMITED_COVERAGE' | 'NO_MARKET' | 'UNKNOWN_MARKET' | 'MARKET_NOT_ACTIVE' | 'NO_COVERAGE' | 'COVERAGE_UNAVAILABLE' | 'COVERAGE_RESTRICTED' | 'ACTION_NOT_COVERED'

export interface GateDecision {
  allowed: boolean
  reason: GateReason
  /** LIMITED coverage: allowed, with the limits stated to the person */
  limited: boolean
  /** which scope decided it */
  decidedBy: { scopeType: ScopeType; scopeId: string } | null
  /** structured status for a Host/client to explain Vietnam-first limits; never an instruction that overrides the server's decision */
  guidance: null | { status: 'UNSUPPORTED_MARKET'; askSupportedDestination: boolean; switchToSupportedMarket: false }
}

const SPECIFICITY: Record<ScopeType, number> = { MARKET: 0, REGION: 1, CITY: 2 }

/** The coverage rows of the query's market that apply to its vertical and capability, scope-matched to the region and city asked. Most specific first. */
function applicable(q: GateQuery, rows: readonly CoverageRow[]): CoverageRow[] {
  return rows
    .filter(r => r.marketId === q.marketId && r.vertical === q.vertical && r.capability === q.capability
      && ((r.scopeType === 'MARKET' && r.scopeId === q.marketId) || (r.scopeType === 'REGION' && !!q.regionId && r.scopeId === q.regionId) || (r.scopeType === 'CITY' && !!q.cityId && r.scopeId === q.cityId)))
    .sort((a, b) => SPECIFICITY[b.scopeType] - SPECIFICITY[a.scopeType])
}

const deny = (reason: GateReason, decidedBy: GateDecision['decidedBy'] = null, q?: GateQuery): GateDecision => ({
  allowed: false, reason, limited: false, decidedBy,
  guidance: q && (reason === 'NO_MARKET' || reason === 'UNKNOWN_MARKET' || reason === 'MARKET_NOT_ACTIVE') ? { status: 'UNSUPPORTED_MARKET', askSupportedDestination: !q.userNamedMarket || reason === 'NO_MARKET', switchToSupportedMarket: false } : null,
})

/** Decide one query against a registry. Fails closed at every step. Pure. */
export function evaluateGate(q: GateQuery, reg: Registry): GateDecision {
  if (!q.marketId) return deny('NO_MARKET', null, q)
  const market = reg.markets.find(m => m.marketId === q.marketId)
  if (!market) return deny('UNKNOWN_MARKET', null, q)
  const serving = market.lifecycleStatus === 'MARKET_ACTIVE' || (market.lifecycleStatus === 'MARKET_READY' && market.sandboxAllowed === true)
  if (!serving) return deny('MARKET_NOT_ACTIVE', null, q)
  const rows = applicable(q, reg.coverage)
  if (rows.length === 0) return deny('NO_COVERAGE')
  // the most specific scope that speaks to this action decides; a more specific row for a different action does not hide a broader one
  const row = rows.find(r => r.actions === '*' || r.actions.includes(q.action))
  if (!row) return deny('ACTION_NOT_COVERED')
  const by = { scopeType: row.scopeType, scopeId: row.scopeId }
  if (row.coverage === 'UNAVAILABLE') return deny('COVERAGE_UNAVAILABLE', by)
  if (row.coverage === 'RESTRICTED') return deny('COVERAGE_RESTRICTED', by)
  return { allowed: true, reason: row.coverage === 'LIMITED' ? 'LIMITED_COVERAGE' : 'ALLOWED', limited: row.coverage === 'LIMITED', decidedBy: by, guidance: null }
}

/** Duplicate coverage rows (same market, scope, vertical and capability) make the decision ambiguous; returns them as readable keys. Pure. */
export function duplicateCoverage(rows: readonly CoverageRow[]): string[] {
  const seen = new Set<string>(); const dup = new Set<string>()
  for (const r of rows) {
    const k = [r.marketId, r.scopeType, r.scopeId, r.vertical, r.capability].join('|')
    if (seen.has(k)) dup.add(k); seen.add(k)
  }
  return [...dup]
}

/** A coverage row with a blank scope id is invalid (a NULL-like scope would break uniqueness). */
export const coverageRowValid = (r: CoverageRow): boolean => !!r.marketId && !!r.scopeId && (r.scopeType !== 'MARKET' || r.scopeId === r.marketId)

/**
 * Today's behaviour, written down: Vietnam is the one active market and the verticals Tappy already serves there are FULL at market scope. This is NOT a claim about any other market,
 * and nothing in it grants a new right; it exists so the gate can be switched on without changing what works now.
 */
export const DEFAULT_REGISTRY: Registry = {
  markets: [{ marketId: 'vn', countryCode: 'VN', lifecycleStatus: 'MARKET_ACTIVE', defaultLocale: 'vi-VN', supportedLocales: ['vi-VN', 'en'], defaultCurrency: 'VND', timezone: 'Asia/Ho_Chi_Minh' }],
  coverage: ['food', 'travel', 'shopping', 'hotels', 'attractions', 'general'].map(vertical => ({ marketId: 'vn', scopeType: 'MARKET' as const, scopeId: 'vn', vertical, capability: 'search', actions: '*' as const, coverage: 'FULL' as const })),
}
