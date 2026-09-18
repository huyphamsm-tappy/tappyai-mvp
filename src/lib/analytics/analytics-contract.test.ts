import { describe, it, expect } from 'vitest'
import {
  ANALYTICS_EVENTS, ANALYTICS_SOURCES, RESULT_ACTION_TYPES, D7_WINDOW, G1_GATES, G1_DEFINITIONS,
  coerceSource, isAnalyticsEvent, isAnalyticsSource, isResultActionType, validateG1Event,
} from './analytics-contract'

// The G1 contract is the thing every metric, gate and test agrees on. These
// tests pin its VALUES, not just its shape: a silent edit to the D7 window or
// a gate threshold must fail here, by design.

describe('G1 analytics contract — enums', () => {
  it('has exactly the seven canonical events', () => {
    expect([...ANALYTICS_EVENTS]).toEqual(['first_visit', 'query', 'result_action', 'share_created', 'share_viewed', 'signup', 'return'])
  })

  it('has the fourteen canonical sources, tgdd reserved but present', () => {
    expect([...ANALYTICS_SOURCES]).toEqual([
      'wedge_scam', 'share_out', 'zalo_mini', 'zalo_link', 'qr_pos', 'tgdd',
      'geo_google', 'geo_chatgpt', 'direct_share', 'web_share_target', 'direct',
      'browser_extension', 'bing_search', 'pwa_shortcut',
    ])
    expect(isAnalyticsSource('tgdd')).toBe(true)
  })

  it('has the five result action types that define a useful result', () => {
    expect([...RESULT_ACTION_TYPES]).toEqual(['outbound_booking', 'outbound_map', 'outbound_tiktok', 'follow_up_query', 'share'])
  })

  it('rejects unknown sources, events and actions', () => {
    expect(isAnalyticsSource('facebook_ads')).toBe(false)
    expect(isAnalyticsSource('')).toBe(false)
    expect(isAnalyticsSource(undefined)).toBe(false)
    expect(isAnalyticsEvent('page_view')).toBe(false)
    expect(isResultActionType('copy')).toBe(false)
  })

  it('coerces an invalid source to direct rather than storing it', () => {
    expect(coerceSource('utm_whatever')).toBe('direct')
    expect(coerceSource('qr_pos')).toBe('qr_pos')
    expect(coerceSource(null, 'share_out')).toBe('share_out')
  })
})

describe('G1 analytics contract — event validation', () => {
  it('accepts a well-formed event', () => {
    expect(validateG1Event('query', { source: 'direct' })).toBeNull()
    expect(validateG1Event('result_action', { source: 'share_out', action_type: 'outbound_map' })).toBeNull()
    expect(validateG1Event('share_viewed', { source: 'zalo_link', share_id: 'abc' })).toBeNull()
    expect(validateG1Event('return', { source: 'direct', days_since_first_query: 6 })).toBeNull()
  })

  it('rejects an invalid source — the enum is closed', () => {
    expect(validateG1Event('query', { source: 'organic' })).toBe('invalid_source')
    expect(validateG1Event('query', {})).toBe('invalid_source')
  })

  it('rejects an unknown event and malformed props', () => {
    expect(validateG1Event('page_view', { source: 'direct' })).toBe('unknown_event')
    expect(validateG1Event('query', null)).toBe('missing_props')
    expect(validateG1Event('result_action', { source: 'direct', action_type: 'like' })).toBe('invalid_action_type')
    expect(validateG1Event('share_created', { source: 'direct' })).toBe('missing_share_id')
    expect(validateG1Event('return', { source: 'direct' })).toBe('missing_days_since_first_query')
  })
})

describe('G1 analytics contract — definitions and gates are pinned', () => {
  it('D7 is the deliberately widened day 5–9 window, cohort by first query', () => {
    expect(D7_WINDOW).toEqual({ fromDay: 5, toDay: 9 })
    expect(G1_DEFINITIONS.d7).toMatch(/first query/i)
    expect(G1_DEFINITIONS.d7).toContain('5–9')
  })

  it('TGDĐ activation is a first query with source tgdd, never an install', () => {
    expect(G1_DEFINITIONS.tgddActivation).toMatch(/not activation/i)
  })

  it('gate thresholds match the v1 heuristics', () => {
    expect(G1_GATES.gate0_product_signal.activationTarget).toBe(0.5)
    expect(G1_GATES.gate0_product_signal.activationFail).toBe(0.3)
    expect(G1_GATES.gate1_retention.sampleMin).toBe(300)
    expect(G1_GATES.gate1_retention.d7Target).toBe(0.2)
    expect(G1_GATES.gate1_retention.d7Fail).toBe(0.1)
    expect(G1_GATES.gate2_viral.kFactorTarget).toBe(0.2)
    expect(G1_GATES.gate2_viral.kFactorFail).toBe(0.1)
  })
})
