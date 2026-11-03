import { describe, it, expect } from 'vitest'
import { agreedChatDecision, mergeIntentWithRules } from './luna'
import { consultChatDomainAgreementOn, CONSULT_CHAT_DOMAIN_AGREEMENT_FLAG } from '@/lib/config/consultFlags'
import type { ConsultDecision } from './consultBrain'

const dec = (turn: ConsultDecision['turn'], domains: ConsultDecision['domains']): ConsultDecision => ({ turn, domains, known: {}, assumptions: [] })
const routedOf = (turn: ConsultDecision['turn'], domains: ConsultDecision['domains'], confidence: 'rule' | 'unsure' = 'unsure') => ({ decision: dec(turn, domains), confidence })

describe('agreedChatDecision (C-PRE-2) - pure, structural', () => {
  it('rules unsure with no domain + intent "chat [food]" (E9/E10/E11/E25 shape): the one-sided domain is dropped', () => {
    const luna = dec('chat', ['food']); const routed = routedOf('chat', [])
    const merged = mergeIntentWithRules(luna, routed)
    expect(merged.decision.domains).toEqual(['food'])               // live control: the merge alone keeps it
    expect(agreedChatDecision(merged, luna, routed).decision.domains).toEqual([])
  })
  it('rules "ask [food]" + intent "chat [shopping]" (E21 shape): disagreement, nothing is kept', () => {
    const luna = dec('chat', ['shopping']); const routed = routedOf('ask', ['food'], 'rule')
    const merged = mergeIntentWithRules(luna, routed)
    expect(merged.decision.turn).toBe('chat'); expect(merged.decision.domains).toEqual(['shopping'])
    expect(agreedChatDecision(merged, luna, routed).decision.domains).toEqual([])
  })
  it('rules "ask [entertainment]" + intent "chat []" (E17 shape): the rules-only domain the merge adopted is dropped too', () => {
    const luna = dec('chat', []); const routed = routedOf('ask', ['entertainment'], 'rule')
    const merged = mergeIntentWithRules(luna, routed)
    expect(merged.decision.turn).toBe('chat'); expect(merged.decision.domains).toEqual(['entertainment'])
    expect(agreedChatDecision(merged, luna, routed).decision.domains).toEqual([])
  })
  it('both readers name the same domain on a chat turn: returned as it was (the very same object)', () => {
    const luna = dec('chat', ['food']); const routed = routedOf('pick', ['food'], 'rule')
    const merged = mergeIntentWithRules(luna, routed)
    expect(merged.decision.turn).toBe('chat'); expect(merged.decision.domains).toEqual(['food'])
    expect(agreedChatDecision(merged, luna, routed)).toBe(merged)
  })
  it('two domains, only one shared: the shared one stays', () => {
    const luna = dec('chat', ['food', 'shopping']); const routed = routedOf('chat', ['food'])
    const m = { decision: dec('chat', ['food', 'shopping']) }
    expect(agreedChatDecision(m, luna, routed).decision.domains).toEqual(['food'])
  })
  it('no rules reading at all (routed null): a chat domain is not agreed', () => {
    const luna = dec('chat', ['food'])
    expect(agreedChatDecision({ decision: luna }, luna, null).decision.domains).toEqual([])
  })
  it('every turn type other than chat is returned untouched (a real venue request keeps its domain)', () => {
    for (const t of ['pick', 'ask', 'more', 'compare', 'reject', 'plan', 'followup'] as const) {
      const m = { decision: dec(t as ConsultDecision['turn'], ['food']) }
      expect(agreedChatDecision(m, dec('chat', ['food']), routedOf('chat', [])), t).toBe(m)
    }
  })
  it('a chat turn with no domain is returned untouched', () => {
    const m = { decision: dec('chat', []) }
    expect(agreedChatDecision(m, dec('chat', ['food']), routedOf('chat', ['food']))).toBe(m)
  })
  it('does not modify its inputs', () => {
    const luna = dec('chat', ['food']); const routed = routedOf('chat', []); const m = { decision: dec('chat', ['food']) }
    const snap = JSON.stringify([luna, routed, m])
    agreedChatDecision(m, luna, routed)
    expect(JSON.stringify([luna, routed, m])).toBe(snap)
  })
})

describe('consultChatDomainAgreementOn', () => {
  it('only the exact string "1" outside production; not tied to the capability level', () => {
    expect(CONSULT_CHAT_DOMAIN_AGREEMENT_FLAG).toBe('CONSULT_CHAT_DOMAIN_AGREEMENT')
    expect(consultChatDomainAgreementOn({})).toBe(false)
    expect(consultChatDomainAgreementOn({ CONSULT_CHAT_DOMAIN_AGREEMENT: '1' })).toBe(true)
    for (const v of ['0', 'true', 'TRUE', '1 ', ' 1', '01', 'yes', '']) expect(consultChatDomainAgreementOn({ CONSULT_CHAT_DOMAIN_AGREEMENT: v }), JSON.stringify(v)).toBe(false)
    for (const level of ['0', '1', '2', '3', '4']) expect(consultChatDomainAgreementOn({ CONSULT_CAPABILITY_LEVEL: level }), `level ${level}`).toBe(false)
    expect(consultChatDomainAgreementOn({ CONSULT_CHAT_DOMAIN_AGREEMENT: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(consultChatDomainAgreementOn({ CONSULT_CHAT_DOMAIN_AGREEMENT: '1', NODE_ENV: 'production' })).toBe(false)
  })
})
