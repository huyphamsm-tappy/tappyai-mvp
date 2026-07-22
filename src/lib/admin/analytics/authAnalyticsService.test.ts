import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loginSuccessRate, firstLoginConversion, summarizeRollup, providerBreakdown,
  platformBreakdown, dailyTrend, countAcquisitionByDimension, authAnalyticsService,
  type RollupRow, type AcquisitionRow,
} from './authAnalyticsService'

const rollup: RollupRow[] = [
  { snapshot_date: '2026-07-12', platform: 'web', method: 'google', signups: 5, logins_success: 20, logins_failed: 4, first_logins: 5, returning_logins: 15, unique_users: 12 },
  { snapshot_date: '2026-07-12', platform: 'ios', method: 'apple', signups: 2, logins_success: 8, logins_failed: 0, first_logins: 2, returning_logins: 6, unique_users: 5 },
  { snapshot_date: '2026-07-13', platform: 'web', method: 'google', signups: 3, logins_success: 10, logins_failed: 6, first_logins: 3, returning_logins: 7, unique_users: 8 },
]

describe('KPI formulas', () => {
  it('loginSuccessRate handles the zero-attempt case', () => {
    expect(loginSuccessRate(0, 0)).toBe(0)
    expect(loginSuccessRate(9, 1)).toBe(0.9)
  })
  it('firstLoginConversion handles zero signups', () => {
    expect(firstLoginConversion(0, 0)).toBe(0)
    expect(firstLoginConversion(3, 12)).toBe(0.25)
  })
})

describe('summarizeRollup', () => {
  it('sums summable counts and computes KPIs; excludes unique_users', () => {
    const s = summarizeRollup(rollup)
    expect(s.signups).toBe(10)
    expect(s.logins_success).toBe(38)
    expect(s.logins_failed).toBe(10)
    expect(s.first_logins).toBe(10)
    expect(s.returning_logins).toBe(28)
    expect(s.login_success_rate).toBeCloseTo(38 / 48)
    expect(s.first_login_conversion).toBeCloseTo(10 / 10)
    expect('unique_users' in s).toBe(false)
  })
  it('returns zeros for an empty set', () => {
    expect(summarizeRollup([])).toEqual({
      signups: 0, logins_success: 0, logins_failed: 0, first_logins: 0, returning_logins: 0,
      login_success_rate: 0, first_login_conversion: 0,
    })
  })
})

describe('providerBreakdown', () => {
  it('groups by method with per-method success rate', () => {
    const r = providerBreakdown(rollup)
    const google = r.find((x) => x.method === 'google')!
    const apple = r.find((x) => x.method === 'apple')!
    expect(google).toMatchObject({ signups: 8, logins_success: 30, logins_failed: 10 })
    expect(google.login_success_rate).toBeCloseTo(30 / 40)
    expect(apple.login_success_rate).toBe(1)
  })
})

describe('platformBreakdown', () => {
  it('groups by platform', () => {
    const r = platformBreakdown(rollup)
    expect(r.find((x) => x.platform === 'web')).toMatchObject({ signups: 8, logins_success: 30, logins_failed: 10 })
    expect(r.find((x) => x.platform === 'ios')).toMatchObject({ signups: 2, logins_success: 8, logins_failed: 0 })
  })
})

describe('dailyTrend', () => {
  it('groups by date, ascending, summing platform×method per day', () => {
    const t = dailyTrend(rollup)
    expect(t.map((p) => p.date)).toEqual(['2026-07-12', '2026-07-13'])
    expect(t[0]).toMatchObject({ signups: 7, logins_success: 28, logins_failed: 4, unique_users: 17 })
    expect(t[1]).toMatchObject({ signups: 3, logins_success: 10, logins_failed: 6, unique_users: 8 })
  })
})

describe('countAcquisitionByDimension', () => {
  const acq: AcquisitionRow[] = [
    { signup_method: 'google', signup_platform: 'web', signup_app_version: '1.0', signup_country: 'VN', signup_language: 'vi', acquisition_source: 'organic', signup_at: 't' },
    { signup_method: 'google', signup_platform: 'ios', signup_app_version: '1.1', signup_country: 'VN', signup_language: 'vi', acquisition_source: 'utm_x', signup_at: 't' },
    { signup_method: 'zalo', signup_platform: 'web', signup_app_version: null, signup_country: 'US', signup_language: 'en', acquisition_source: null, signup_at: 't' },
  ]
  it('counts by method, sorted desc', () => {
    expect(countAcquisitionByDimension(acq, 'method')).toEqual([{ key: 'google', users: 2 }, { key: 'zalo', users: 1 }])
  })
  it('counts by country and language', () => {
    expect(countAcquisitionByDimension(acq, 'country')).toEqual([{ key: 'VN', users: 2 }, { key: 'US', users: 1 }])
    expect(countAcquisitionByDimension(acq, 'language')).toEqual([{ key: 'vi', users: 2 }, { key: 'en', users: 1 }])
  })
  it('maps null dimension values to "unknown"', () => {
    expect(countAcquisitionByDimension(acq, 'app_version')).toContainEqual({ key: 'unknown', users: 1 })
    expect(countAcquisitionByDimension(acq, 'source')).toContainEqual({ key: 'unknown', users: 1 })
  })
})

// ── service wiring (fetch → pure aggregate) with a chainable mock client ──
function makeClient(data: unknown[]) {
  const rec: { table?: string; ops: [string, string, unknown][] } = { ops: [] }
  const builder: Record<string, unknown> = {
    select: () => builder,
    gte: (c: string, v: unknown) => (rec.ops.push(['gte', c, v]), builder),
    lte: (c: string, v: unknown) => (rec.ops.push(['lte', c, v]), builder),
    eq: (c: string, v: unknown) => (rec.ops.push(['eq', c, v]), builder),
    then: (resolve: (x: unknown) => void) => resolve({ data, error: null }),
  }
  const client = { from: (t: string) => ((rec.table = t), builder) }
  return { client: client as unknown as SupabaseClient, rec }
}

describe('authAnalyticsService (wiring)', () => {
  it('getSummary reads auth_daily_rollup and returns the aggregated summary', async () => {
    const { client, rec } = makeClient(rollup)
    const s = await authAnalyticsService.getSummary({ from: '2026-07-12', to: '2026-07-13', platform: 'web' }, client)
    expect(rec.table).toBe('auth_daily_rollup')
    expect(rec.ops).toContainEqual(['eq', 'platform', 'web'])
    expect(s.signups).toBe(10)
  })

  it('getAcquisitionBreakdown applies app_version/country/language filters on user_acquisition', async () => {
    const { client, rec } = makeClient([])
    await authAnalyticsService.getAcquisitionBreakdown(
      { app_version: '1.2.0', country: 'VN', language: 'vi' }, 'country', client
    )
    expect(rec.table).toBe('user_acquisition')
    expect(rec.ops).toContainEqual(['eq', 'signup_app_version', '1.2.0'])
    expect(rec.ops).toContainEqual(['eq', 'signup_country', 'VN'])
    expect(rec.ops).toContainEqual(['eq', 'signup_language', 'vi'])
  })
})
