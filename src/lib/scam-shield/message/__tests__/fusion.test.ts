import { describe, it, expect } from 'vitest'
import { fuseRisk } from '../fusion'
import type { RuleEvaluation } from '../rules'
import type { UrlCheckSummary } from '../types'
import { assessment } from './fixtures'
import { MIN_CONFIDENCE_FOR_SAFE } from '../../config'

// ── Risk fusion — every direction of influence, pinned ───────────────────────

const noRules: RuleEvaluation = { signals: [], score: 0, floor: null, brand: null }
const telegramRules: RuleEvaluation = {
  signals: [
    { type: 'account_suspension_threat', severity: 'high', explanation: 'r1', source: 'rule' },
    { type: 'verify_phone_request', severity: 'high', explanation: 'r2', source: 'rule' },
    { type: 'urgency_pressure', severity: 'medium', explanation: 'r3', source: 'rule' },
  ],
  score: 75, floor: 'HIGH', brand: null,
}
const noise: RuleEvaluation = {
  signals: [{ type: 'link_click_request', severity: 'medium', explanation: 'r', source: 'rule' }],
  score: 22, floor: null, brand: 'vietcombank',
}
const unknownUrl: UrlCheckSummary = { url: 'https://42777qz.hanveko.cfd/', status: 'checked', level: 'LOW', score: 12, confidence: 90, officialMatch: null }
const safeUrl: UrlCheckSummary = { url: 'https://vietcombank.com.vn/', status: 'checked', level: 'SAFE', score: 0, confidence: 95, officialMatch: null }
const badUrl: UrlCheckSummary = { url: 'https://vcb-secure-login.net/', status: 'checked', level: 'HIGH', score: 79, confidence: 85, officialMatch: { brand: 'Vietcombank', website: 'https://vietcombank.com.vn' } }

const fuse = (over: Partial<Parameters<typeof fuseRisk>[0]>, aiConsulted?: boolean) =>
  fuseRisk({ tier: 1, rules: noRules, ai: null, urlChecks: [], locale: 'en', ...over }, aiConsulted)

describe('the rules floor', () => {
  it('holds at HIGH with no model and an unknown link', () => {
    const r = fuse({ rules: telegramRules, urlChecks: [unknownUrl] })
    expect(['HIGH', 'CRITICAL']).toContain(r.level)
  })
  it('cannot be talked down by a confident "safe" from the model', () => {
    const r = fuse({ rules: telegramRules, ai: assessment({ riskLevel: 'safe', confidence: 0.99 }) })
    expect(['HIGH', 'CRITICAL']).toContain(r.level)
  })
  it('rules alone never reach CRITICAL — that needs a second source', () => {
    const r = fuse({ rules: { ...telegramRules, score: 100 } })
    expect(r.level).toBe('HIGH')
  })
  it('rules + a confident model reach CRITICAL', () => {
    const r = fuse({ rules: telegramRules, ai: assessment({ riskLevel: 'critical', confidence: 0.9 }) })
    expect(r.level).toBe('CRITICAL')
  })
})

describe('the model', () => {
  it('a confident high_risk floors at HIGH with no rules', () => {
    expect(fuse({ ai: assessment({ riskLevel: 'high_risk', confidence: 0.7 }) }).level).toBe('HIGH')
  })
  it('a confident critical floors at CRITICAL', () => {
    expect(fuse({ ai: assessment({ riskLevel: 'critical', confidence: 0.8 }) }).level).toBe('CRITICAL')
  })
  it('a hesitant critical is only HIGH; a hesitant high_risk imposes no floor', () => {
    expect(fuse({ ai: assessment({ riskLevel: 'critical', confidence: 0.65 }) }).level).toBe('HIGH')
    const r = fuse({ ai: assessment({ riskLevel: 'high_risk', confidence: 0.3 }) })
    expect(['LOW', 'MEDIUM']).toContain(r.level)
  })
  it('a hesitant "suspicious" lands in LOW, a confident one in MEDIUM', () => {
    expect(fuse({ ai: assessment({ riskLevel: 'suspicious', confidence: 0.3 }) }).level).toBe('LOW')
    expect(fuse({ ai: assessment({ riskLevel: 'suspicious', confidence: 0.75 }) }).level).toBe('MEDIUM')
  })
  it('a confident "safe" discounts rule noise to SAFE/LOW and drops the noise from the report', () => {
    const r = fuse({ rules: noise, ai: assessment({ riskLevel: 'safe', confidence: 0.85 }), urlChecks: [safeUrl] })
    expect(['SAFE', 'LOW']).toContain(r.level)
    expect(r.signals).toEqual([])
    expect(r.scamType).toBeNull()
  })
  it('a confident "safe" does NOT discount an evidence-positive link', () => {
    const r = fuse({ rules: noise, ai: assessment({ riskLevel: 'safe', confidence: 0.95 }), urlChecks: [badUrl] })
    expect(['HIGH', 'CRITICAL']).toContain(r.level)
    expect(r.signals.some(s => s.source === 'url')).toBe(true)
  })
  it('the model wording wins for a signal both found, with the higher severity', () => {
    const r = fuse({
      rules: { ...noRules, signals: [{ type: 'urgency_pressure', severity: 'high', explanation: 'rule', source: 'rule' }], score: 15 },
      ai: assessment({ riskLevel: 'suspicious', confidence: 0.8, signals: [{ type: 'urgency_pressure', severity: 'low', explanation: 'model' }] }),
    })
    expect(r.signals).toEqual([{ type: 'urgency_pressure', severity: 'high', explanation: 'model', source: 'ai' }])
  })
})

describe('links', () => {
  it('an evidence-positive link is a floor exactly as on the URL tab', () => {
    expect(fuse({ urlChecks: [badUrl], ai: assessment({ riskLevel: 'safe', confidence: 0.6 }) }).level).toBe('HIGH')
    expect(fuse({ urlChecks: [{ ...badUrl, level: 'CRITICAL', score: 95 }] }).level).toBe('CRITICAL')
  })
  it('a failed link check lowers confidence rather than vanishing', () => {
    const ok = fuse({ ai: assessment({ riskLevel: 'safe', confidence: 0.9 }), urlChecks: [safeUrl] })
    const failed = fuse({ ai: assessment({ riskLevel: 'safe', confidence: 0.9 }), urlChecks: [{ url: 'https://x.cfd/', status: 'failed', reason: 'check_failed' }] })
    expect(failed.confidence).toBeLessThan(ok.confidence)
  })
})

describe('reassurance needs coverage', () => {
  it('no model, no findings → INCONCLUSIVE, never SAFE', () => {
    const r = fuse({ urlChecks: [safeUrl] })
    expect(r.level).toBe('INCONCLUSIVE')
    expect(r.confidence).toBeLessThan(MIN_CONFIDENCE_FOR_SAFE)
    expect(r.reasoningSummary).toMatch(/not enough evidence/i)
  })
  it('a model that was consulted but failed says so in the fallback summary', () => {
    const r = fuse({}, true)
    expect(r.reasoningSummary).toMatch(/did not return/i)
  })
  it('a warning stands at low confidence', () => {
    const r = fuse({ rules: telegramRules })
    expect(r.confidence).toBeLessThan(MIN_CONFIDENCE_FOR_SAFE)
    expect(['HIGH', 'CRITICAL']).toContain(r.level)
  })
  it('the Vietnamese fallback summary is Vietnamese', () => {
    expect(fuse({ locale: 'vi' }).reasoningSummary).toMatch(/Chưa đủ bằng chứng/)
  })
})

describe('tier 0 mirrors the URL engine', () => {
  it('reports the worst checked link verbatim', () => {
    const r = fuse({ tier: 0, urlChecks: [safeUrl, unknownUrl] })
    expect(r).toMatchObject({ level: 'LOW', score: 12, confidence: 90, scamType: null })
  })
  it('is INCONCLUSIVE when nothing could be checked', () => {
    expect(fuse({ tier: 0, urlChecks: [{ url: 'https://x.cfd/', status: 'failed', reason: 'private_address' }] }).level).toBe('INCONCLUSIVE')
  })
})

describe('classification', () => {
  it('comes from the model when it gave one', () => {
    const r = fuse({ ai: assessment({ riskLevel: 'high_risk', confidence: 0.8, scamType: 'romance_scam', attackGoal: 'payment_fraud' }) })
    expect(r).toMatchObject({ scamType: 'romance_scam', attackGoal: 'payment_fraud' })
  })
  it('falls back to the rules when the model gave none but the rules floored the verdict', () => {
    const r = fuse({ rules: telegramRules, ai: assessment({ riskLevel: 'suspicious', confidence: 0.5 }) })
    expect(r.attackGoal).toBe('account_takeover')
  })
  it('is cleared on a reassuring verdict', () => {
    const r = fuse({ ai: assessment({ riskLevel: 'safe', confidence: 0.9, scamType: 'other', attackGoal: 'other' }) })
    expect(r).toMatchObject({ scamType: null, attackGoal: null })
  })
})
