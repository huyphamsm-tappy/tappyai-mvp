import type { ProviderSignal, EvidenceItem, EvidenceReport, EvidenceCategory } from '../types'

const CATEGORY_MAP: Record<string, EvidenceCategory> = {
  webRisk: 'threat_intelligence',
  blocklist: 'threat_intelligence',
  whois: 'domain_registration',
  redirect: 'network_behavior',
  dns: 'network_behavior',
  ssl: 'certificate',
  // `brand_impersonation` has been a declared EvidenceCategory since the type was written, with
  // nothing on the producing end — the category existed, the finding did not. B01.
  impersonation: 'brand_impersonation',
}

export function buildEvidence(signals: ProviderSignal[]): EvidenceReport {
  const completed = signals.filter(s => s.status === 'completed')
  const items: EvidenceItem[] = completed.map(s => ({
    source: s.provider,
    category: CATEGORY_MAP[s.provider] ?? 'threat_intelligence',
    finding: s.finding,
    severity: s.severity,
    summary: s.detail,
    detail: s.detail,
    dataPoints: extractDataPoints(s),
  }))

  return {
    items,
    summary: {
      criticalCount: items.filter(i => i.severity === 'critical').length,
      warningCount: items.filter(i => i.severity === 'warning').length,
      safeCount: items.filter(i => i.severity === 'safe').length,
      totalSources: signals.length,
      respondedSources: completed.length,
    },
  }
}

function extractDataPoints(signal: ProviderSignal): Record<string, unknown> {
  if (signal.raw == null || typeof signal.raw !== 'object' || Array.isArray(signal.raw)) return {}
  const raw = signal.raw as Record<string, unknown>
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || Array.isArray(v)) {
      safe[k] = v
    }
  }
  return safe
}
