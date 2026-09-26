import { describe, it, expect } from 'vitest'
import { planAnalysis } from '../router'
import { buildAdvice } from '../advice'
import type { RuleEvaluation } from '../rules'
import { TIER2_MIN_CHARS, URL_ONLY_MAX_PROSE_LETTERS } from '../config'

const rules = (over: Partial<RuleEvaluation> = {}): RuleEvaluation => ({ signals: [], score: 0, floor: null, brand: null, ...over })
const plan = (over: Partial<Parameters<typeof planAnalysis>[0]> = {}) =>
  planAnalysis({ inputType: 'message', proseLetters: 200, hasUrl: false, textLength: 300, rules: rules(), ...over })

describe('planAnalysis — the cheapest correct answer wins', () => {
  it('a bare link is LEVEL 0', () => {
    expect(plan({ hasUrl: true, proseLetters: 0 })).toEqual({ tier: 0, reason: 'url_only' })
    expect(plan({ hasUrl: true, proseLetters: URL_ONLY_MAX_PROSE_LETTERS })).toEqual({ tier: 0, reason: 'url_only' })
  })
  it('a link with a real message around it is not', () => {
    expect(plan({ hasUrl: true, proseLetters: URL_ONLY_MAX_PROSE_LETTERS + 1 }).tier).toBeGreaterThan(0)
  })
  it('nothing at all is LEVEL 0', () => {
    expect(plan({ proseLetters: 0 })).toEqual({ tier: 0, reason: 'no_content' })
  })
  it('an ordinary message goes to the economical model', () => {
    expect(plan()).toEqual({ tier: 1, reason: 'ordinary' })
  })
  it('a rules HIGH floor is high-stakes → stronger model', () => {
    expect(plan({ rules: rules({ floor: 'HIGH', score: 70 }) })).toEqual({ tier: 2, reason: 'high_stakes' })
  })
  it('an ambiguous rule score → stronger model', () => {
    expect(plan({ rules: rules({ score: 30 }) })).toEqual({ tier: 2, reason: 'ambiguous_rules' })
  })
  it('a long message → stronger model', () => {
    expect(plan({ textLength: TIER2_MIN_CHARS })).toEqual({ tier: 2, reason: 'long_message' })
  })
  it('a screenshot → stronger model', () => {
    expect(plan({ inputType: 'screenshot' })).toEqual({ tier: 2, reason: 'screenshot' })
  })
  it('never picks the reserved tier 3', () => {
    for (const score of [0, 10, 30, 60, 100]) expect(plan({ rules: rules({ score }) }).tier).not.toBe(3)
  })
})

describe('buildAdvice — deterministic, bilingual, shaped by what the message asks for', () => {
  const sig = (type: Parameters<typeof buildAdvice>[0]['signals'][number]['type']) => ({ type, severity: 'high' as const, explanation: '', source: 'rule' as const })

  it('SAFE/LOW: nothing to avoid, stay alert', () => {
    const a = buildAdvice({ level: 'SAFE', signals: [], attackGoal: null, urlChecks: [] })
    expect(a.doNot).toEqual([])
    expect(a.doNow.map(x => x.code)).toEqual(['STAY_ALERT'])
  })
  it('INCONCLUSIVE: says it could not conclude and, with a link, not to open it', () => {
    const a = buildAdvice({ level: 'INCONCLUSIVE', signals: [], attackGoal: null, urlChecks: [{ url: 'https://x.cfd/', status: 'failed' }] })
    expect(a.doNow.map(x => x.code)).toEqual(['COULD_NOT_CONCLUDE', 'VERIFY_SENDER_INDEPENDENTLY'])
    expect(a.doNot.map(x => x.code)).toEqual(['NO_CLICK_LINK'])
  })
  it('account takeover leads with OTP / password / recovery codes and the official app', () => {
    const a = buildAdvice({ level: 'HIGH', signals: [sig('verify_phone_request'), sig('urgency_pressure')], attackGoal: 'account_takeover', urlChecks: [{ url: 'https://x.cfd/', status: 'checked', level: 'LOW' }] })
    expect(a.doNot.map(x => x.code)).toEqual(['NO_OTP', 'NO_PASSWORD', 'NO_RECOVERY_CODES', 'NO_CLICK_LINK', 'NO_RUSH'])
    expect(a.doNow.map(x => x.code)).toEqual(['VERIFY_IN_OFFICIAL_APP', 'CHANGE_PASSWORD_IF_ENTERED', 'ENABLE_2FA', 'REPORT_SCAM'])
  })
  it('money scams lead with the transfer, crypto adds its own line', () => {
    const a = buildAdvice({ level: 'HIGH', signals: [sig('transfer_request'), sig('crypto_request')], attackGoal: 'investment_scam', urlChecks: [] })
    expect(a.doNot.map(x => x.code)).toEqual(['NO_TRANSFER', 'NO_CRYPTO'])
    expect(a.doNow.map(x => x.code)).toContain('CONTACT_BANK_IF_PAID')
  })
  it('a look-alike link names the official site and hotline', () => {
    const a = buildAdvice({ level: 'CRITICAL', signals: [], attackGoal: 'credential_theft', urlChecks: [{ url: 'https://vcb-x.net/', status: 'checked', level: 'HIGH', officialMatch: { brand: 'Vietcombank', website: 'https://vietcombank.com.vn', hotline: '1900 54 54 13' } }] })
    expect(a.doNow.find(x => x.code === 'USE_OFFICIAL')?.label_en).toContain('https://vietcombank.com.vn')
    expect(a.doNow.find(x => x.code === 'CALL_HOTLINE')?.label_vi).toContain('1900 54 54 13')
  })
  it('every item carries both languages', () => {
    const a = buildAdvice({ level: 'HIGH', signals: [sig('remote_access_request'), sig('app_install_request'), sig('platform_switch_request'), sig('fake_legal_notice')], attackGoal: 'remote_access_compromise', urlChecks: [] })
    for (const item of [...a.doNot, ...a.doNow]) {
      expect(item.label_vi.length).toBeGreaterThan(0)
      expect(item.label_en.length).toBeGreaterThan(0)
      expect(item.code).toMatch(/^[A-Z_]+$/)
    }
    expect(a.doNot.map(x => x.code)).toEqual(expect.arrayContaining(['NO_INSTALL', 'NO_REMOTE_ACCESS', 'NO_MOVE_PLATFORM', 'NO_PERSONAL_INFO']))
  })
  it('MEDIUM with nothing specific still says not to follow the requests', () => {
    const a = buildAdvice({ level: 'MEDIUM', signals: [sig('other')], attackGoal: null, urlChecks: [] })
    expect(a.doNot.map(x => x.code)).toEqual(['NO_REPLY'])
  })
})
