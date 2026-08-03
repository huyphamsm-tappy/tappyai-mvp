import { describe, it, expect } from 'vitest'
import { calculateRisk } from '../engine/riskEngine'
import type { ProviderSignal } from '../types'

function signal(overrides: Partial<ProviderSignal> & { provider: string }): ProviderSignal {
  return {
    status: 'completed',
    finding: 'TEST',
    severity: 'safe',
    weight: 0,
    detail: 'test signal',
    ...overrides,
  }
}

describe('calculateRisk', () => {
  it('returns score 0 and SAFE for all-safe signals', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 0 }),
      signal({ provider: 'whois', weight: 0 }),
      signal({ provider: 'ssl', weight: 0 }),
    ]
    const result = calculateRisk(signals)
    expect(result.score).toBe(0)
    expect(result.level).toBe('SAFE')
  })

  it('sums weights from completed signals', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 40 }),
      signal({ provider: 'whois', weight: 10 }),
    ]
    const result = calculateRisk(signals)
    expect(result.score).toBe(50)
    expect(result.level).toBe('MEDIUM')
  })

  it('clamps score to 100', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 40 }),
      signal({ provider: 'whois', weight: 15 }),
      signal({ provider: 'redirect', weight: 15 }),
      signal({ provider: 'ssl', weight: 10 }),
      signal({ provider: 'dns', weight: 10 }),
      signal({ provider: 'blocklist', weight: 10 }),
    ]
    const result = calculateRisk(signals)
    expect(result.score).toBe(100)
    expect(result.level).toBe('CRITICAL')
  })

  it('excludes non-completed signals from score', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 40 }),
      signal({ provider: 'whois', weight: 15, status: 'timeout' }),
    ]
    const result = calculateRisk(signals)
    expect(result.score).toBe(40)
  })

  it('calculates confidence as ratio of completed max weights', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 0 }),
      signal({ provider: 'whois', weight: 0, status: 'error' }),
    ]
    const result = calculateRisk(signals)
    // webRisk completed (max 40), whois errored (max 15)
    // confidence = 40 / (40 + 15) * 100 = 72.7 → 73
    expect(result.confidence).toBe(73)
  })

  it('returns 100% confidence when all providers complete', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 0 }),
      signal({ provider: 'whois', weight: 0 }),
      signal({ provider: 'dns', weight: 0 }),
      signal({ provider: 'ssl', weight: 0 }),
      signal({ provider: 'redirect', weight: 0 }),
      signal({ provider: 'blocklist', weight: 0 }),
    ]
    const result = calculateRisk(signals)
    expect(result.confidence).toBe(100)
    expect(result.completedCount).toBe(6)
    expect(result.totalCount).toBe(6)
  })

  it('returns 0% confidence when no signals provided', () => {
    const result = calculateRisk([])
    expect(result.confidence).toBe(0)
    expect(result.score).toBe(0)
  })

  it('tracks completed and total counts', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 0 }),
      signal({ provider: 'whois', weight: 0, status: 'timeout' }),
      signal({ provider: 'dns', weight: 0, status: 'circuit_open' }),
    ]
    const result = calculateRisk(signals)
    expect(result.completedCount).toBe(1)
    expect(result.totalCount).toBe(3)
  })

  it('clamps score to 0 minimum', () => {
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: -5 }),
    ]
    const result = calculateRisk(signals)
    expect(result.score).toBe(0)
  })
})
