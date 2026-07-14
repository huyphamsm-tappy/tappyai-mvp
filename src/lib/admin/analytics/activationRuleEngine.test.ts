import { describe, it, expect } from 'vitest'
import { evaluateActivationRule, type DomainEvent } from './activationRuleEngine'
import { ACTIVATION_RULE_V1 } from './activationRules/registry'
import { inCodeActivationRuleProvider, isEffective } from './activationRuleProvider'

function ev(event_type: string, session_id: string, client_timestamp: string): DomainEvent {
  return { event_type, session_id, client_timestamp }
}

describe('evaluateActivationRule — Rule v1 (ALL, same session)', () => {
  it('activates when both signals occur in the same (first) session', () => {
    const events = [
      ev('chat_response_received', 's1', '2026-07-01T00:00:00Z'),
      ev('search_result_saved', 's1', '2026-07-01T00:05:00Z'),
    ]
    const result = evaluateActivationRule(ACTIVATION_RULE_V1, events)
    expect(result.activation_result).toBe(true)
    expect(result.activation_rule_version).toBe('v1')
    expect(result.matched_signals).toEqual({
      ai_answer: '2026-07-01T00:00:00Z',
      place_saved: '2026-07-01T00:05:00Z',
    })
    expect(result.missing_signals).toEqual([])
  })

  it('does not activate when only one signal is present', () => {
    const events = [ev('chat_response_received', 's1', '2026-07-01T00:00:00Z')]
    const result = evaluateActivationRule(ACTIVATION_RULE_V1, events)
    expect(result.activation_result).toBe(false)
    expect(result.matched_signals).toEqual({ ai_answer: '2026-07-01T00:00:00Z' })
    expect(result.missing_signals).toEqual(['place_saved'])
  })

  it('does not activate when signals occur in different sessions (window enforced)', () => {
    const events = [
      ev('chat_response_received', 's1', '2026-07-01T00:00:00Z'),
      ev('search_result_saved', 's2', '2026-07-02T00:00:00Z'),
    ]
    const result = evaluateActivationRule(ACTIVATION_RULE_V1, events)
    expect(result.activation_result).toBe(false)
    expect(result.missing_signals).toEqual(['place_saved'])
  })

  it('picks the earliest matching event per signal', () => {
    const events = [
      ev('chat_response_received', 's1', '2026-07-01T00:10:00Z'),
      ev('chat_response_received', 's1', '2026-07-01T00:00:00Z'),
      ev('search_result_saved', 's1', '2026-07-01T00:05:00Z'),
    ]
    const result = evaluateActivationRule(ACTIVATION_RULE_V1, events)
    expect(result.matched_signals.ai_answer).toBe('2026-07-01T00:00:00Z')
  })

  it('returns no matches for an empty event list', () => {
    const result = evaluateActivationRule(ACTIVATION_RULE_V1, [])
    expect(result.activation_result).toBe(false)
    expect(result.missing_signals).toEqual(['ai_answer', 'place_saved'])
  })
})

describe('combinators (generic, not v1-specific)', () => {
  const anyRule = { ...ACTIVATION_RULE_V1, combinator: { type: 'ANY' as const } }
  const atLeastRule = {
    ...ACTIVATION_RULE_V1,
    signals: [
      { key: 'a', eventType: 'evt_a' },
      { key: 'b', eventType: 'evt_b' },
      { key: 'c', eventType: 'evt_c' },
    ],
    combinator: { type: 'AT_LEAST' as const, count: 2 },
  }

  it('ANY is satisfied by a single matching signal', () => {
    const result = evaluateActivationRule(anyRule, [ev('chat_response_received', 's1', '2026-07-01T00:00:00Z')])
    expect(result.activation_result).toBe(true)
  })

  it('AT_LEAST(2) requires exactly that many, not all', () => {
    const events = [
      ev('evt_a', 's1', '2026-07-01T00:00:00Z'),
      ev('evt_b', 's1', '2026-07-01T00:01:00Z'),
    ]
    const result = evaluateActivationRule(atLeastRule, events)
    expect(result.activation_result).toBe(true)
    expect(result.missing_signals).toEqual(['c'])
  })

  it('AT_LEAST(2) fails with only one matching signal', () => {
    const result = evaluateActivationRule(atLeastRule, [ev('evt_a', 's1', '2026-07-01T00:00:00Z')])
    expect(result.activation_result).toBe(false)
  })
})

describe('inCodeActivationRuleProvider', () => {
  it('getActiveRule returns the enabled, effective v1 rule', () => {
    const rule = inCodeActivationRuleProvider.getActiveRule()
    expect(rule?.ruleVersion).toBe('v1')
  })

  it('getRuleById resolves a rule by id', () => {
    const rule = inCodeActivationRuleProvider.getRuleById('activation-v1')
    expect(rule?.id).toBe('activation-v1')
  })

  it('getRuleById returns null for an unknown id', () => {
    expect(inCodeActivationRuleProvider.getRuleById('does-not-exist')).toBeNull()
  })

  it('getActiveRule accepts an asOf param (v1 has no bounds, so it stays effective)', () => {
    const rule = inCodeActivationRuleProvider.getActiveRule(new Date('2020-01-01T00:00:00Z'))
    expect(rule?.ruleVersion).toBe('v1')
  })
})

describe('isEffective (lifecycle metadata filtering, §2.2)', () => {
  const now = new Date('2026-07-14T00:00:00Z')

  it('is false when disabled, regardless of effective window', () => {
    expect(isEffective({ ...ACTIVATION_RULE_V1, enabled: false }, now)).toBe(false)
  })

  it('is false before effectiveFrom', () => {
    const rule = { ...ACTIVATION_RULE_V1, effectiveFrom: '2027-01-01T00:00:00Z' }
    expect(isEffective(rule, now)).toBe(false)
  })

  it('is false at/after effectiveTo', () => {
    const rule = { ...ACTIVATION_RULE_V1, effectiveTo: '2026-01-01T00:00:00Z' }
    expect(isEffective(rule, now)).toBe(false)
  })

  it('is true when enabled and within [effectiveFrom, effectiveTo)', () => {
    const rule = { ...ACTIVATION_RULE_V1, effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: '2027-01-01T00:00:00Z' }
    expect(isEffective(rule, now)).toBe(true)
  })
})
