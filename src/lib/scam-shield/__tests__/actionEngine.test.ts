import { describe, it, expect } from 'vitest'
import { getRecommendedActions } from '../engine/actionEngine'
import type { EvidenceReport, OfficialEntity } from '../types'

const emptyEvidence: EvidenceReport = {
  items: [],
  summary: { criticalCount: 0, warningCount: 0, safeCount: 0, totalSources: 0, respondedSources: 0 },
}

const mockEntity: OfficialEntity = {
  id: 'vcb',
  brand: 'Vietcombank',
  category: 'bank',
  domains: ['vietcombank.com.vn'],
  website: 'https://vietcombank.com.vn',
  hotline: '1900 545413',
}

describe('getRecommendedActions', () => {
  it('returns DO_NOT_OPEN for CRITICAL', () => {
    const actions = getRecommendedActions('CRITICAL', emptyEvidence, null)
    expect(actions[0].action).toBe('DO_NOT_OPEN')
    expect(actions[0].priority).toBe('primary')
    expect(actions.some(a => a.action === 'REPORT')).toBe(true)
  })

  it('returns DO_NOT_OPEN for HIGH', () => {
    const actions = getRecommendedActions('HIGH', emptyEvidence, null)
    expect(actions[0].action).toBe('DO_NOT_OPEN')
  })

  it('includes USE_OFFICIAL and CALL_HOTLINE when directory match found (HIGH/CRITICAL)', () => {
    const actions = getRecommendedActions('HIGH', emptyEvidence, mockEntity)
    expect(actions.some(a => a.action === 'USE_OFFICIAL')).toBe(true)
    expect(actions.some(a => a.action === 'CALL_HOTLINE')).toBe(true)
    const hotline = actions.find(a => a.action === 'CALL_HOTLINE')!
    expect(hotline.label_vi).toContain('1900 545413')
  })

  it('returns PROCEED_WITH_CAUTION for MEDIUM', () => {
    const actions = getRecommendedActions('MEDIUM', emptyEvidence, null)
    expect(actions[0].action).toBe('PROCEED_WITH_CAUTION')
    expect(actions.some(a => a.action === 'VERIFY_IDENTITY')).toBe(true)
  })

  it('includes CHECK_OFFICIAL for MEDIUM with directory match', () => {
    const actions = getRecommendedActions('MEDIUM', emptyEvidence, mockEntity)
    expect(actions.some(a => a.action === 'CHECK_OFFICIAL')).toBe(true)
  })

  it('returns LIKELY_SAFE for LOW', () => {
    const actions = getRecommendedActions('LOW', emptyEvidence, null)
    expect(actions[0].action).toBe('LIKELY_SAFE')
    expect(actions).toHaveLength(1)
  })

  it('returns LIKELY_SAFE for SAFE', () => {
    const actions = getRecommendedActions('SAFE', emptyEvidence, null)
    expect(actions[0].action).toBe('LIKELY_SAFE')
    expect(actions[0].icon).toBe('check')
  })

  it('provides bilingual labels', () => {
    const actions = getRecommendedActions('CRITICAL', emptyEvidence, null)
    for (const a of actions) {
      expect(a.label_vi).toBeTruthy()
      expect(a.label_en).toBeTruthy()
    }
  })

  it('does not include CALL_HOTLINE when entity has no hotline', () => {
    const noHotline: OfficialEntity = { ...mockEntity, hotline: undefined }
    const actions = getRecommendedActions('HIGH', emptyEvidence, noHotline)
    expect(actions.some(a => a.action === 'CALL_HOTLINE')).toBe(false)
  })
})

/**
 * REGRESSION (permanent): confidence was never passed to getRecommendedActions, so a check in
 * which every provider failed produced score 0 -> level SAFE -> "This link appears safe" while
 * nothing had actually been verified. calculateRisk only sums COMPLETED signals, which makes
 * "nothing bad found" and "nothing found at all" score identically; confidence is the only thing
 * that distinguishes them, and the reassuring branch is the one place it must be consulted.
 */
describe('getRecommendedActions — reassurance requires evidence', () => {
  it('does not claim safety when no provider completed', () => {
    const actions = getRecommendedActions('SAFE', emptyEvidence, null, 0)

    expect(actions[0].action).toBe('INCONCLUSIVE')
    expect(actions.some(a => a.action === 'LIKELY_SAFE')).toBe(false)
  })

  it('withdraws reassurance for LOW on partial evidence too', () => {
    const actions = getRecommendedActions('LOW', emptyEvidence, null, 20)

    expect(actions[0].action).toBe('INCONCLUSIVE')
  })

  /** The boundary is the UI's own low/medium confidence split, so badge and action agree. */
  it('reassures at the confidence threshold but not below it', () => {
    expect(getRecommendedActions('SAFE', emptyEvidence, null, 50)[0].action).toBe('LIKELY_SAFE')
    expect(getRecommendedActions('SAFE', emptyEvidence, null, 49)[0].action).toBe('INCONCLUSIVE')
  })

  /** Asymmetry is the point: low confidence may withdraw reassurance, never a warning. */
  it('never suppresses a warning for low confidence', () => {
    expect(getRecommendedActions('CRITICAL', emptyEvidence, null, 0)[0].action).toBe('DO_NOT_OPEN')
    expect(getRecommendedActions('HIGH', emptyEvidence, null, 0)[0].action).toBe('DO_NOT_OPEN')
    expect(getRecommendedActions('MEDIUM', emptyEvidence, null, 0)[0].action)
      .toBe('PROCEED_WITH_CAUTION')
  })

  /** An unverified result must not read as reassurance in either language. */
  it('states the check did not complete, in both languages', () => {
    const [primary] = getRecommendedActions('SAFE', emptyEvidence, null, 0)

    expect(primary.label_vi).toContain('chưa thể kết luận')
    expect(primary.label_en).toContain('cannot be confirmed safe')
    expect(primary.icon).not.toBe('check')
  })

  it('still points at the official site when one is known', () => {
    const actions = getRecommendedActions('SAFE', emptyEvidence, mockEntity, 0)

    expect(actions.some(a => a.action === 'CHECK_OFFICIAL')).toBe(true)
    expect(actions.some(a => a.action === 'VERIFY_IDENTITY')).toBe(true)
  })

  /** Full evidence must still reassure — the guard above must not swallow the normal path. */
  it('reassures normally when the evidence base completed', () => {
    expect(getRecommendedActions('SAFE', emptyEvidence, null, 100)[0].action).toBe('LIKELY_SAFE')
  })
})
