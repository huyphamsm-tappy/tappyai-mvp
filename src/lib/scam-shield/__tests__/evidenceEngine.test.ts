import { describe, it, expect } from 'vitest'
import { buildEvidence } from '../engine/evidenceEngine'
import type { ProviderSignal } from '../types'

function signal(overrides: Partial<ProviderSignal> & { provider: string }): ProviderSignal {
  return {
    status: 'completed',
    finding: 'TEST',
    severity: 'safe',
    weight: 0,
    detail: 'test',
    ...overrides,
  }
}

describe('buildEvidence', () => {
  it('converts completed signals to evidence items', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', finding: 'CLEAN', severity: 'safe', detail: 'No threats' }),
      signal({ provider: 'whois', finding: 'ESTABLISHED', severity: 'safe', detail: 'Old domain' }),
    ]
    const report = buildEvidence(signals)
    expect(report.items).toHaveLength(2)
    expect(report.items[0].source).toBe('webRisk')
    expect(report.items[0].category).toBe('threat_intelligence')
    expect(report.items[1].source).toBe('whois')
    expect(report.items[1].category).toBe('domain_registration')
  })

  it('excludes non-completed signals', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk' }),
      signal({ provider: 'whois', status: 'timeout' }),
      signal({ provider: 'ssl', status: 'error' }),
    ]
    const report = buildEvidence(signals)
    expect(report.items).toHaveLength(1)
    expect(report.summary.totalSources).toBe(3)
    expect(report.summary.respondedSources).toBe(1)
  })

  it('counts severity levels correctly', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', severity: 'critical' }),
      signal({ provider: 'dns', severity: 'warning' }),
      signal({ provider: 'ssl', severity: 'safe' }),
      signal({ provider: 'whois', severity: 'safe' }),
    ]
    const report = buildEvidence(signals)
    expect(report.summary.criticalCount).toBe(1)
    expect(report.summary.warningCount).toBe(1)
    expect(report.summary.safeCount).toBe(2)
  })

  it('maps provider IDs to correct categories', () => {
    const providers = [
      { id: 'webRisk', expected: 'threat_intelligence' },
      { id: 'blocklist', expected: 'threat_intelligence' },
      { id: 'whois', expected: 'domain_registration' },
      { id: 'redirect', expected: 'network_behavior' },
      { id: 'dns', expected: 'network_behavior' },
      { id: 'ssl', expected: 'certificate' },
    ]
    for (const { id, expected } of providers) {
      const report = buildEvidence([signal({ provider: id })])
      expect(report.items[0].category).toBe(expected)
    }
  })

  it('extracts safe data points from raw', () => {
    const signals: ProviderSignal[] = [
      signal({
        provider: 'whois',
        raw: { ageDays: 500, registrar: 'GoDaddy', nested: { a: 1 } },
      }),
    ]
    const report = buildEvidence(signals)
    expect(report.items[0].dataPoints).toEqual({ ageDays: 500, registrar: 'GoDaddy' })
  })

  it('returns empty report for no signals', () => {
    const report = buildEvidence([])
    expect(report.items).toHaveLength(0)
    expect(report.summary.totalSources).toBe(0)
  })
})
