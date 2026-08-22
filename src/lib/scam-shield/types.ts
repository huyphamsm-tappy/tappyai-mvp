// Scam Shield — shared types for the reusable security capability.
// Every module imports from here; no circular dependencies.

/**
 * `INCONCLUSIVE` is not a point on the scale — it is the absence of one.
 *
 * The other five are ordered by how much risk the evidence shows. `INCONCLUSIVE` says there was
 * not enough evidence to place the link anywhere, and it exists because the scale alone cannot
 * express that: `calculateRisk` sums only COMPLETED provider signals, so "every provider looked
 * and found nothing" and "no provider looked at all" both score 0 — and 0 is SAFE.
 *
 * That is reachable in production, not theoretical. Web Risk is unconfigured, so the remaining
 * providers timing out or tripping the circuit breaker is enough; and `executeProviders` returns
 * an empty array outright when nothing is configured, which lands in the same place.
 *
 * 🚨 It replaces ONLY the reassuring end of the scale. MEDIUM and above are evidence-positive —
 * some provider completed and did find something — and low confidence must never soften them.
 * Low confidence can withdraw reassurance; it can never withdraw a warning.
 */
export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INCONCLUSIVE'

export type InputType = 'url' | 'qr'

export type EvidenceCategory =
  | 'threat_intelligence'
  | 'domain_registration'
  | 'network_behavior'
  | 'certificate'
  | 'brand_impersonation'

export type SignalSeverity = 'safe' | 'info' | 'warning' | 'critical'

export interface CheckTarget {
  url: URL
  hostname: string
  domain: string
}

export interface ProviderSignal {
  provider: string
  status: 'completed' | 'timeout' | 'error' | 'unavailable' | 'circuit_open'
  finding: string
  severity: SignalSeverity
  weight: number
  detail: string
  cachedAt?: number
  raw?: unknown
}

export interface EvidenceItem {
  source: string
  category: EvidenceCategory
  finding: string
  severity: SignalSeverity
  summary: string
  detail: string
  dataPoints: Record<string, unknown>
}

export interface EvidenceReport {
  items: EvidenceItem[]
  summary: {
    criticalCount: number
    warningCount: number
    safeCount: number
    totalSources: number
    respondedSources: number
  }
}

export interface RiskResult {
  score: number
  confidence: number
  level: RiskLevel
  signals: ProviderSignal[]
  completedCount: number
  totalCount: number
}

export interface RecommendedAction {
  priority: 'primary' | 'secondary'
  action: string
  label_vi: string
  label_en: string
  icon: string
}

export interface OfficialEntity {
  id: string
  brand: string
  category: 'bank' | 'government' | 'telecom' | 'airline' | 'ewallet' | 'ecommerce'
  domains: string[]
  website: string
  hotline?: string
  email?: string
  /**
   * Other names this brand is impersonated under — abbreviations, app names, former names.
   *
   * 🚨 C09. The matcher derived its only token from `brand`, so it caught
   * `vietcombank-online.com` and missed `vcb-secure-login.net`, `vcbdigibank-login.com`,
   * `tcb-verify.duckdns.org`, `stb-otp.top` and `vtb-login.xyz` — all NO_MATCH, all scoring
   * 19/LOW. In Vietnam the abbreviation IS the everyday name of a bank, and phishing domains use
   * it far more than the full one. "VCB Digibank" is Vietcombank's actual banking app.
   *
   * Aliases are matched by exactly the same rules as `brand`, so adding one here protects the
   * entity everywhere with no scorer change — the same property the directory already had for
   * whole brands.
   */
  aliases?: string[]
}

export interface CheckResult {
  inputType: InputType
  url: string
  risk: {
    score: number
    confidence: number
    level: RiskLevel
  }
  evidence: EvidenceReport
  officialMatch: OfficialEntity | null
  actions: RecommendedAction[]
  checkedAt: number
  cached: boolean
}
