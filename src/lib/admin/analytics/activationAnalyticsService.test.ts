import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  activationRate, avgTimeToActivation, summarizeRollup, sourceBreakdown, platformBreakdown, dailyTrend,
  fetchRollup, activationAnalyticsService, type ActivationRollupRow,
} from './activationAnalyticsService'
import type { ActivationRuleProvider } from './activationRuleProvider'
import { ACTIVATION_RULE_V1 } from './activationRules/registry'

const rows: ActivationRollupRow[] = [
  { snapshot_date: '2026-07-14', platform: 'web', signup_source: 'organic', rule_version: 'v1', signups_in_cohort: 10, activated_count: 4, activated_within_7d_count: 3, avg_time_to_activation_seconds: 100 },
  { snapshot_date: '2026-07-14', platform: 'android', signup_source: 'organic', rule_version: 'v1', signups_in_cohort: 5, activated_count: 1, activated_within_7d_count: 1, avg_time_to_activation_seconds: 200 },
  { snapshot_date: '2026-07-15', platform: 'web', signup_source: 'utm_x', rule_version: 'v1', signups_in_cohort: 8, activated_count: 0, activated_within_7d_count: 0, avg_time_to_activation_seconds: null },
]

describe('activationRate', () => {
  it('computes ratio, 0 for zero signups', () => {
    expect(activationRate(4, 10)).toBe(0.4)
    expect(activationRate(0, 0)).toBe(0)
  })
})

describe('avgTimeToActivation', () => {
  it('weights by activated_count and ignores rows with no activations', () => {
    expect(avgTimeToActivation(rows)).toBeCloseTo((100 * 4 + 200 * 1) / 5)
  })
  it('returns null when nothing activated', () => {
    expect(avgTimeToActivation([{ ...rows[0], activated_count: 0, avg_time_to_activation_seconds: null }])).toBeNull()
  })
})

describe('summarizeRollup', () => {
  it('sums signups/activated and computes the rate + weighted avg', () => {
    const s = summarizeRollup(rows, 'v1')
    expect(s.signups).toBe(23)
    expect(s.activated_count).toBe(5)
    expect(s.activation_rate).toBeCloseTo(5 / 23)
    expect(s.rule_version).toBe('v1')
  })
})

describe('sourceBreakdown / platformBreakdown / dailyTrend', () => {
  it('groups by source', () => {
    const b = sourceBreakdown(rows)
    expect(b.find(x => x.signup_source === 'organic')).toEqual({ signup_source: 'organic', signups: 15, activated_count: 5, activation_rate: 5 / 15 })
  })
  it('groups by platform', () => {
    const b = platformBreakdown(rows)
    expect(b.find(x => x.platform === 'android')).toEqual({ platform: 'android', signups: 5, activated_count: 1, activation_rate: 0.2 })
  })
  it('groups by day, sorted ascending', () => {
    const t = dailyTrend(rows)
    expect(t.map(p => p.date)).toEqual(['2026-07-14', '2026-07-15'])
    expect(t[0]).toEqual({ date: '2026-07-14', signups: 15, activated_count: 5, activation_rate: 5 / 15 })
  })
})

describe('fetchRollup', () => {
  it('defaults rule_version to the active rule when not specified in the filter', async () => {
    const eq = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnValue({ eq, gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis() })
    const from = vi.fn().mockReturnValue({ select })
    const query: Record<string, unknown> = {}
    // Build a minimal chainable query mock that resolves at the end.
    const chain: any = {
      gte: () => chain, lte: () => chain, eq: (...args: unknown[]) => { query.eq = args; return chain },
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }
    const client = { from: () => ({ select: () => chain }) } as unknown as SupabaseClient
    const provider: ActivationRuleProvider = { getActiveRule: () => ACTIVATION_RULE_V1, getRuleById: () => ACTIVATION_RULE_V1 }
    const { ruleVersion } = await fetchRollup({}, client, provider)
    expect(ruleVersion).toBe('v1')
    expect(query.eq).toEqual(['rule_version', 'v1'])
  })
})

describe('activationAnalyticsService.getActiveRule / getRuleById', () => {
  it('resolves through the given provider', () => {
    const provider: ActivationRuleProvider = { getActiveRule: () => ACTIVATION_RULE_V1, getRuleById: (id) => (id === 'x' ? ACTIVATION_RULE_V1 : null) }
    expect(activationAnalyticsService.getActiveRule(provider)?.ruleVersion).toBe('v1')
    expect(activationAnalyticsService.getRuleById('x', provider)?.id).toBe('activation-v1')
    expect(activationAnalyticsService.getRuleById('nope', provider)).toBeNull()
  })
})

describe('activationAnalyticsService.getEvaluationResult', () => {
  it('computes live from fetched events, never persisting anything', async () => {
    const data = [
      { event_type: 'chat_response_received', session_id: 's1', client_timestamp: '2026-07-14T00:00:00Z' },
      { event_type: 'search_result_saved', session_id: 's1', client_timestamp: '2026-07-14T00:05:00Z' },
    ]
    const chain: any = { eq: () => chain, in: () => chain, then: (resolve: (v: unknown) => void) => resolve({ data, error: null }) }
    const client = { from: () => ({ select: () => chain }), rpc: vi.fn() } as unknown as SupabaseClient
    const provider: ActivationRuleProvider = { getActiveRule: () => ACTIVATION_RULE_V1, getRuleById: () => ACTIVATION_RULE_V1 }
    const result = await activationAnalyticsService.getEvaluationResult('u1', undefined, client, provider)
    expect(result?.activation_result).toBe(true)
    expect((client as any).rpc).not.toHaveBeenCalled()
  })

  it('returns null when no rule resolves', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient
    const provider: ActivationRuleProvider = { getActiveRule: () => null, getRuleById: () => null }
    expect(await activationAnalyticsService.getEvaluationResult('u1', undefined, client, provider)).toBeNull()
  })
})
