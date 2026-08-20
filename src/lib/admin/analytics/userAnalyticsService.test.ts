import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deriveGrowth,
  deriveEngagement,
  deriveFunnel,
  userAnalyticsService,
  type GrowthRow,
  type SubscriptionRow,
} from './userAnalyticsService'

// Module 04 User Analytics — the derivation layer.
//
// SOURCES ARE ALREADY-ROLLED-UP TABLES, never raw events:
//   • daily_snapshots (M01)  — grain VN day × platform. total/new users, DAU/WAU/MAU.
//   • subscriptions          — per-user plan + status.
//
// `01_ARCH` §8: *"Dashboards read pre-computed rollups, never live aggregate
// queries."* That is why nothing here touches `user_events`.
//
// THE RULES, and why each exists. Every one of them is a way a dashboard states
// something it did not measure:
//
//   1. NO DATA IS NOT ZERO — the M01 rule, and it applies identically here.
//   2. A RATIO WITH NO DENOMINATOR IS NOT ZERO. Stickiness with MAU = 0 is
//      undefined, not 0%. Conversion with no users is undefined, not 0%.
//   3. A PERIOD-OVER-PERIOD RATE NEEDS TWO PERIODS. MoM against one month is
//      the same fabrication as a delta against nothing.
//
// NOT SHIPPED, and named so the omission is deliberate rather than forgotten:
// retention cohorts (need `cohort_metrics`, which does not exist), churn rate
// (no authoritative definition of churn), and session count / average session
// duration (`user_events` carries `session_id` but no session end, so any number
// would be an invented approximation).

const snap = (over: Partial<GrowthRow> = {}): GrowthRow => ({
  snapshot_date: '2026-08-20',
  total_users: 1000,
  new_users: 20,
  returning_users: 300,
  dau: 400,
  wau: 700,
  mau: 900,
  ...over,
})

const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  plan: 'pro',
  status: 'active',
  ...over,
})

describe('rule 1 — no data is not zero', () => {
  it('growth from an empty table is EMPTY', () => {
    const g = deriveGrowth([])
    expect(g.status).toBe('empty')
    expect(g.series).toEqual([])
    expect(g.momGrowthRate).toBeNull()
  })

  it('engagement from an empty table is EMPTY', () => {
    expect(deriveEngagement([]).status).toBe('empty')
  })

  it('a real zero day is OK and reports zero', () => {
    const e = deriveEngagement([snap({ dau: 0, mau: 0 })])
    expect(e.status).toBe('ok')
    expect(e.series[0].dau).toBe(0)
  })
})

describe('rule 2 — a ratio with no denominator is undefined, not zero', () => {
  it('stickiness is DAU/MAU', () => {
    const e = deriveEngagement([snap({ dau: 250, mau: 1000 })])
    expect(e.series[0].stickiness).toBeCloseTo(0.25, 6)
  })

  it('stickiness is NULL when MAU is zero — never 0, never Infinity, never NaN', () => {
    const e = deriveEngagement([snap({ dau: 0, mau: 0 })])
    expect(e.series[0].stickiness).toBeNull()
  })

  it('stickiness stays null even when DAU is somehow non-zero with MAU zero', () => {
    // Should be impossible — MAU is a superset window — but a divide-by-zero
    // that yields Infinity would render as a KPI, so it is closed here.
    const e = deriveEngagement([snap({ dau: 5, mau: 0 })])
    expect(e.series[0].stickiness).toBeNull()
  })

  it('conversion rate is NULL when there are no users at all', () => {
    const f = deriveFunnel([], 0)
    expect(f.status).toBe('empty')
    expect(f.conversionRate).toBeNull()
  })

  it('conversion rate is pro / total', () => {
    const f = deriveFunnel([sub(), sub()], 200)
    expect(f.pro).toBe(2)
    expect(f.free).toBe(198)
    expect(f.conversionRate).toBeCloseTo(0.01, 6)
  })
})

describe('rule 3 — a month-over-month rate needs two months', () => {
  it('one month yields NO rate', () => {
    const g = deriveGrowth([snap({ snapshot_date: '2026-08-20', total_users: 1000 })])
    expect(g.momGrowthRate).toBeNull()
  })

  it('two months compare the LAST day of each month', () => {
    // Month-end is the cumulative total for that month; picking any other day
    // would report a partial month as if it were complete.
    const g = deriveGrowth([
      snap({ snapshot_date: '2026-07-15', total_users: 700 }),
      snap({ snapshot_date: '2026-07-31', total_users: 800 }),
      snap({ snapshot_date: '2026-08-20', total_users: 1000 }),
    ])
    expect(g.momGrowthRate).toBeCloseTo(0.25, 6) // 1000/800 - 1
  })

  it('a fall is negative', () => {
    const g = deriveGrowth([
      snap({ snapshot_date: '2026-07-31', total_users: 1000 }),
      snap({ snapshot_date: '2026-08-20', total_users: 900 }),
    ])
    expect(g.momGrowthRate).toBeCloseTo(-0.1, 6)
  })

  it('is NULL when the previous month total is zero — no denominator', () => {
    const g = deriveGrowth([
      snap({ snapshot_date: '2026-07-31', total_users: 0 }),
      snap({ snapshot_date: '2026-08-20', total_users: 50 }),
    ])
    expect(g.momGrowthRate).toBeNull()
  })

  it('compares ADJACENT months only — a gap yields no rate', () => {
    // June → August is not a month-over-month change.
    const g = deriveGrowth([
      snap({ snapshot_date: '2026-06-30', total_users: 500 }),
      snap({ snapshot_date: '2026-08-20', total_users: 1000 }),
    ])
    expect(g.momGrowthRate).toBeNull()
  })
})

describe('ordering and shape', () => {
  it('the series is returned oldest-first regardless of arrival order', () => {
    const g = deriveGrowth([
      snap({ snapshot_date: '2026-08-20' }),
      snap({ snapshot_date: '2026-08-18' }),
      snap({ snapshot_date: '2026-08-19' }),
    ])
    expect(g.series.map((p) => p.date)).toEqual(['2026-08-18', '2026-08-19', '2026-08-20'])
  })

  it('growth carries only the growth fields — engagement is a separate view', () => {
    const g = deriveGrowth([snap()])
    expect(Object.keys(g.series[0]).sort()).toEqual(['date', 'newUsers', 'totalUsers'])
  })

  it('engagement carries only the engagement fields', () => {
    const e = deriveEngagement([snap()])
    expect(Object.keys(e.series[0]).sort()).toEqual(['date', 'dau', 'mau', 'stickiness', 'wau'])
  })
})

describe('the subscription funnel counts only ACTIVE pro', () => {
  it('a cancelled pro subscription is not a pro user', () => {
    const f = deriveFunnel([sub({ status: 'canceled' }), sub({ status: 'active' })], 100)
    expect(f.pro).toBe(1)
  })

  it('a non-pro plan is not counted, whatever its status', () => {
    const f = deriveFunnel([sub({ plan: 'free', status: 'active' })], 100)
    expect(f.pro).toBe(0)
  })

  it('free is never negative even if the data disagrees with itself', () => {
    // More active pro rows than known users means one of the two sources is
    // stale. Reporting a negative population would be worse than clamping and
    // is impossible to read as anything but a bug.
    const f = deriveFunnel([sub(), sub(), sub()], 2)
    expect(f.free).toBe(0)
  })

  it('status matching is case-insensitive and trims — Stripe casing varies', () => {
    const f = deriveFunnel([sub({ plan: ' Pro ', status: ' ACTIVE ' })], 10)
    expect(f.pro).toBe(1)
  })
})

describe('reading — an unreachable table is not an empty one', () => {
  function client(result: { data: unknown; error: { message: string } | null } | Error): SupabaseClient {
    const terminal = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
    const proxy: SupabaseClient = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => terminal().then(res, rej)
          }
          return () => proxy
        },
      }
    ) as unknown as SupabaseClient
    return { from: () => proxy } as unknown as SupabaseClient
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('a query error is ERROR, never empty', async () => {
    const g = await userAnalyticsService.getGrowth(client({ data: null, error: { message: 'boom' } }), {})
    expect(g.status).toBe('error')
  })

  it('a thrown driver failure is ERROR and does not propagate', async () => {
    const e = await userAnalyticsService.getEngagement(client(new Error('socket closed')), {})
    expect(e.status).toBe('error')
  })

  it('a successful empty read is EMPTY — the distinction survives the query layer', async () => {
    const g = await userAnalyticsService.getGrowth(client({ data: [], error: null }), {})
    expect(g.status).toBe('empty')
  })
})
