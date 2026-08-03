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
