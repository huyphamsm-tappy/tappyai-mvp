// Scam Shield — shared types for the reusable security capability.
// Every module imports from here; no circular dependencies.

export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

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
