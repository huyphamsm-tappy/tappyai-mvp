import { describe, it, expect } from 'vitest'
import { calculateRisk, levelFor } from '../engine/riskEngine'
import { getRecommendedActions } from '../engine/actionEngine'
import { MIN_CONFIDENCE_FOR_SAFE, PROVIDER_MAX_WEIGHTS } from '../config'
import type { EvidenceReport, ProviderSignal } from '../types'

// ── V2-UAT-006: unverified must never become safe ────────────────────────────
//
// `calculateRisk` sums only COMPLETED signals. That makes "every provider looked and found
// nothing" and "no provider found anything because none ran" score identically — 0 — and 0 was
// SAFE. So a link on which zero checks completed was reported to the client as
// `risk.level: 'SAFE'`, and a client renders a green shield from that field.
//
// It is reachable in production, not theoretical. Web Risk is unconfigured, so the rest timing
// out or tripping the circuit breaker is enough; and `executeProviders` returns `[]` outright
// when no provider is configured at all, which lands in the same place with confidence 0.
//
// One case per failure mode below, because they arrive through different `status` values and a
// fix that only handled `error` would leave the others open.
//
// 🚨 THE ASYMMETRY IS PART OF THE CONTRACT AND IS TESTED IN BOTH DIRECTIONS. Low confidence may
// withdraw reassurance; it may never withdraw a warning. A test that only checked "low confidence
// is not SAFE" would happily pass an over-correction that muted a CRITICAL finding into a shrug.

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

/** Every configured provider, all reporting `status` and contributing no weight. */
function allProvidersWith(status: ProviderSignal['status']): ProviderSignal[] {
  return Object.keys(PROVIDER_MAX_WEIGHTS).map(provider =>
    signal({ provider, status, finding: 'ERROR', severity: 'info', weight: 0 }),
  )
}

const NO_EVIDENCE: EvidenceReport = {
  items: [],
  summary: {
    criticalCount: 0,
    warningCount: 0,
    safeCount: 0,
    totalSources: 0,
    respondedSources: 0,
  },
}

describe('a link nothing could check is never reported as safe', () => {
  it('all providers error → INCONCLUSIVE, confidence 0', () => {
    const result = calculateRisk(allProvidersWith('error'))
    expect(result.confidence).toBe(0)
    expect(result.completedCount).toBe(0)
    expect(result.level).toBe('INCONCLUSIVE')
    expect(result.level).not.toBe('SAFE')
  })

  it('all providers time out → INCONCLUSIVE', () => {
    expect(calculateRisk(allProvidersWith('timeout')).level).toBe('INCONCLUSIVE')
  })

  it('all circuit breakers open → INCONCLUSIVE', () => {
    expect(calculateRisk(allProvidersWith('circuit_open')).level).toBe('INCONCLUSIVE')
  })

  it('all providers unavailable → INCONCLUSIVE', () => {
    expect(calculateRisk(allProvidersWith('unavailable')).level).toBe('INCONCLUSIVE')
  })

  it('no provider result at all → INCONCLUSIVE', () => {
    // `executeProviders` returns [] when nothing is configured. The confidence formula divides by
    // the total weight, which is 0 here — the branch that used to fall through to level SAFE.
    const result = calculateRisk([])
    expect(result.totalCount).toBe(0)
    expect(result.confidence).toBe(0)
    expect(result.level).toBe('INCONCLUSIVE')
  })

  it('a malformed signal from an unrecognised provider carries no confidence with it', () => {
    // `PROVIDER_MAX_WEIGHTS` has no entry for an unknown id, so it contributes 0 to both sides of
    // the ratio. A provider that renamed itself must not be able to manufacture coverage.
    const result = calculateRisk([
      signal({ provider: 'not-a-real-provider', status: 'completed', weight: 0 }),
    ])
    expect(result.confidence).toBe(0)
    expect(result.level).toBe('INCONCLUSIVE')
  })

  it('one provider out of six is still enough to answer', () => {
    // The other direction: this must NOT become a feature that shrugs whenever anything fails.
    // webRisk (40) + whois (15) + redirect (15) = 70 of 100 — comfortably above the threshold.
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 0 }),
      signal({ provider: 'whois', weight: 0 }),
      signal({ provider: 'redirect', weight: 0 }),
      signal({ provider: 'ssl', status: 'error', weight: 0 }),
      signal({ provider: 'dns', weight: 0 }),
      signal({ provider: 'blocklist', weight: 0 }),
    ]
    const result = calculateRisk(signals)
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE_FOR_SAFE)
    expect(result.level).toBe('SAFE')
  })

  it('enough providers failing crosses the line into INCONCLUSIVE', () => {
    // webRisk alone is 40 of 100 — below the threshold, and exactly the shape production is in
    // while Web Risk is unconfigured and the small providers are struggling.
    const signals: ProviderSignal[] = [
      signal({ provider: 'webRisk', weight: 0 }),
      ...['whois', 'redirect', 'ssl', 'dns', 'blocklist'].map(provider =>
        signal({ provider, status: 'timeout', weight: 0 }),
      ),
    ]
    const result = calculateRisk(signals)
    expect(result.confidence).toBeLessThan(MIN_CONFIDENCE_FOR_SAFE)
    expect(result.level).toBe('INCONCLUSIVE')
  })

  it('a cached signal is evidence, and stays marked as cached', () => {
    // Cache entries are written only for COMPLETED signals and expire on the provider's own TTL,
    // so a live cache hit is real evidence and should count. What must not happen is the cache
    // quietly turning a failure into coverage — so the failed provider below still drags the
    // result under the threshold even though a cached one sits beside it.
    const cached = signal({ provider: 'webRisk', weight: 0, cachedAt: 1_000 })
    const fresh = calculateRisk([
      cached,
      ...['whois', 'redirect', 'ssl', 'dns', 'blocklist'].map(provider =>
        signal({ provider, status: 'error', weight: 0 }),
      ),
    ])
    expect(fresh.signals.some(s => s.cachedAt !== undefined)).toBe(true)
    expect(fresh.level).toBe('INCONCLUSIVE')
  })
})

describe('low confidence never withdraws a warning', () => {
  // Every level above LOW is evidence-POSITIVE: something completed and something was found. If
  // partial coverage could soften these, the fix would have traded a false negative for a
  // different false negative.
  const cases = [
    { score: 45, expected: 'MEDIUM' },
    { score: 70, expected: 'HIGH' },
    { score: 95, expected: 'CRITICAL' },
  ] as const

  for (const { score, expected } of cases) {
    it(`${expected} survives confidence 0`, () => {
      expect(levelFor(score, 0)).toBe(expected)
      expect(levelFor(score, 100)).toBe(expected)
    })
  }

  it('a single completed provider finding something critical still reports CRITICAL', () => {
    const result = calculateRisk([
      signal({ provider: 'blocklist', weight: 95, severity: 'critical', finding: 'BLOCKLISTED' }),
      ...['webRisk', 'whois', 'redirect', 'ssl', 'dns'].map(provider =>
        signal({ provider, status: 'error', weight: 0 }),
      ),
    ])
    expect(result.confidence).toBeLessThan(MIN_CONFIDENCE_FOR_SAFE)
    expect(result.level).toBe('CRITICAL')
  })
})

describe('the recommended action agrees with the level', () => {
  it('INCONCLUSIVE never offers the reassuring action', () => {
    const actions = getRecommendedActions('INCONCLUSIVE', NO_EVIDENCE, null, 0)
    expect(actions.map(a => a.action)).not.toContain('LIKELY_SAFE')
    expect(actions[0].action).toBe('INCONCLUSIVE')
  })

  it('INCONCLUSIVE says so in both languages, and neither says "safe"', () => {
    const [primary] = getRecommendedActions('INCONCLUSIVE', NO_EVIDENCE, null, 0)
    expect(primary.label_vi).toContain('chưa thể kết luận')
    expect(primary.label_en).toContain('cannot be confirmed safe')
    // The Vietnamese must not read as reassurance either — "an toàn" alone would.
    expect(primary.label_vi.startsWith('Liên kết có vẻ an toàn')).toBe(false)
  })

  it('a level that IS supported by evidence still reassures', () => {
    const actions = getRecommendedActions('SAFE', NO_EVIDENCE, null, 100)
    expect(actions.map(a => a.action)).toContain('LIKELY_SAFE')
  })

  it('the engine and the action engine cannot disagree', () => {
    // The end-to-end shape of the defect: a result whose level says one thing and whose primary
    // action says another. Before the fix, `risk.level` was SAFE while the action said the link
    // could not be confirmed safe — and a client renders the shield from the level.
    const result = calculateRisk(allProvidersWith('error'))
    const [primary] = getRecommendedActions(result.level, NO_EVIDENCE, null, result.confidence)
    expect(result.level).toBe('INCONCLUSIVE')
    expect(primary.action).toBe('INCONCLUSIVE')
  })
})
