import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deriveHomeKpis,
  fetchHomeKpis,
  HOME_STALE_AFTER_DAYS,
  type DailySnapshotRow,
} from './homeSnapshotService'

// Module 01 Home Dashboard — the KPI derivation.
//
// Separated from the query so the rules below are testable without a database,
// and so a change to any of them fails loudly. The rules exist because a
// dashboard's failure mode is not an exception — it is a plausible-looking
// number, which an operator then acts on.
//
//   1. NO DATA IS NOT ZERO. An empty table means the pipeline has not run.
//      Rendering `DAU 0` would state a measurement that was never taken.
//   2. OLD DATA MUST SAY SO. A snapshot from last week is not today's DAU.
//   3. A DELTA NEEDS TWO POINTS. With one snapshot there is no trend, and
//      `+100%` against nothing is the classic fabricated metric.

const row = (over: Partial<DailySnapshotRow> = {}): DailySnapshotRow => ({
  snapshot_date: '2026-08-20',
  total_users: 100,
  new_users: 5,
  returning_users: 20,
  dau: 25,
  wau: 60,
  mau: 90,
  is_final: false,
  ...over,
})

const kpi = (result: ReturnType<typeof deriveHomeKpis>, key: string) =>
  result.kpis.find((k) => k.key === key)

describe('no data is not zero', () => {
  it('an empty table is EMPTY, not a set of zeros', () => {
    const result = deriveHomeKpis([], '2026-08-20')
    expect(result.status).toBe('empty')
    expect(result.kpis).toEqual([])
    expect(result.snapshotDate).toBeNull()
  })

  it('a real zero day is OK, and reports zero', () => {
    // The other half of rule 1: a day nobody was active is a measurement.
    const result = deriveHomeKpis([row({ dau: 0, new_users: 0 })], '2026-08-20')
    expect(result.status).toBe('ok')
    expect(kpi(result, 'dau')?.value).toBe(0)
  })
})

describe('old data must say so', () => {
  it('a snapshot from today is fresh', () => {
    expect(deriveHomeKpis([row({ snapshot_date: '2026-08-20' })], '2026-08-20').status).toBe('ok')
  })

  it(`a snapshot ${HOME_STALE_AFTER_DAYS} days old is still fresh — the cron runs 00:05 VN`, () => {
    // The window has to tolerate the gap between midnight and the cron, and a
    // single missed run, or the dashboard cries stale every morning.
    const result = deriveHomeKpis([row({ snapshot_date: '2026-08-18' })], '2026-08-20')
    expect(result.status).toBe('ok')
  })

  it('a snapshot older than that is STALE, and still shows its numbers', () => {
    // Stale, not hidden: an operator who can see the age can judge the number.
    // Hiding it would look identical to a broken page.
    const result = deriveHomeKpis([row({ snapshot_date: '2026-08-10' })], '2026-08-20')
    expect(result.status).toBe('stale')
    expect(kpi(result, 'dau')?.value).toBe(25)
    expect(result.ageDays).toBe(10)
  })

  it('reports the age in days so the UI never has to compute it', () => {
    expect(deriveHomeKpis([row({ snapshot_date: '2026-08-19' })], '2026-08-20').ageDays).toBe(1)
  })
})

describe('a delta needs two points', () => {
  it('a single snapshot yields NO delta — never a fabricated 100%', () => {
    const result = deriveHomeKpis([row()], '2026-08-20')
    expect(kpi(result, 'dau')?.deltaVsPrevious).toBeNull()
  })

  it('two snapshots yield the absolute change', () => {
    const result = deriveHomeKpis(
      [row({ snapshot_date: '2026-08-20', dau: 25 }), row({ snapshot_date: '2026-08-19', dau: 20 })],
      '2026-08-20'
    )
    expect(kpi(result, 'dau')?.deltaVsPrevious).toBe(5)
  })

  it('a fall is negative', () => {
    const result = deriveHomeKpis(
      [row({ snapshot_date: '2026-08-20', dau: 10 }), row({ snapshot_date: '2026-08-19', dau: 18 })],
      '2026-08-20'
    )
    expect(kpi(result, 'dau')?.deltaVsPrevious).toBe(-8)
  })

  it('the previous row must be the day BEFORE — a gap yields no delta', () => {
    // Comparing today with a snapshot from four days ago and calling it a daily
    // change is the same fabrication as comparing against nothing.
    const result = deriveHomeKpis(
      [row({ snapshot_date: '2026-08-20', dau: 25 }), row({ snapshot_date: '2026-08-16', dau: 20 })],
      '2026-08-20'
    )
    expect(kpi(result, 'dau')?.deltaVsPrevious).toBeNull()
  })

  it('rows arriving out of order are still read newest-first', () => {
    const result = deriveHomeKpis(
      [row({ snapshot_date: '2026-08-19', dau: 20 }), row({ snapshot_date: '2026-08-20', dau: 25 })],
      '2026-08-20'
    )
    expect(result.snapshotDate).toBe('2026-08-20')
    expect(kpi(result, 'dau')?.deltaVsPrevious).toBe(5)
  })
})

describe('reading — an unreachable table is not an empty one', () => {
  // Mutation T6 collapsed `error` into `empty` and SURVIVED: the whole read path
  // was untested. The two states produce different words on screen for a reason
  // — "the rollup has not run" sends an operator to the cron; "the table is
  // unreachable" sends them to the database.
  function client(result: { data: unknown; error: { message: string } | null } | Error): SupabaseClient {
    const terminal = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
    const builder: Record<string, unknown> = {}
    const proxy: SupabaseClient = new Proxy(builder, {
      get(_t, prop: string) {
        // BOTH handlers must be forwarded. Passing only `resolve` leaves a
        // rejection unhandled, so the await never settles and the test times
        // out instead of failing — a hang that looks nothing like the bug.
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => terminal().then(res, rej)
        }
        return () => proxy
      },
    }) as unknown as SupabaseClient
    return { from: () => proxy } as unknown as SupabaseClient
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('a query error is ERROR, never empty', async () => {
    const result = await fetchHomeKpis(client({ data: null, error: { message: 'boom' } }), '2026-08-20')
    expect(result.status).toBe('error')
    expect(result.kpis).toEqual([])
  })

  it('a thrown driver failure is ERROR, and does not propagate', async () => {
    // The Home must not 500 because one panel's table is unreachable.
    const result = await fetchHomeKpis(client(new Error('socket closed')), '2026-08-20')
    expect(result.status).toBe('error')
  })

  it('a successful read with no rows is EMPTY — the distinction survives the query layer', async () => {
    const result = await fetchHomeKpis(client({ data: [], error: null }), '2026-08-20')
    expect(result.status).toBe('empty')
  })

  it('a successful read derives through the same rules', async () => {
    const result = await fetchHomeKpis(client({ data: [row()], error: null }), '2026-08-20')
    expect(result.status).toBe('ok')
    expect(kpi(result, 'dau')?.value).toBe(25)
  })
})

describe('the KPI set is exactly the six columns with a real source', () => {
  it('exposes those six and nothing else', () => {
    const result = deriveHomeKpis([row()], '2026-08-20')
    expect(result.kpis.map((k) => k.key)).toEqual([
      'dau', 'wau', 'mau', 'new_users', 'returning_users', 'total_users',
    ])
  })

  it('carries the provisional flag through, so the UI can mark it', () => {
    // 04 §7A: a row inside the reconciliation window may still change.
    expect(deriveHomeKpis([row({ is_final: false })], '2026-08-20').isFinal).toBe(false)
    expect(deriveHomeKpis([row({ is_final: true })], '2026-08-20').isFinal).toBe(true)
  })

  it('every value comes from the row — none is computed in the UI layer', () => {
    const result = deriveHomeKpis([row({ dau: 1, wau: 2, mau: 3, new_users: 4, returning_users: 5, total_users: 6 })], '2026-08-20')
    expect(result.kpis.map((k) => k.value)).toEqual([1, 2, 3, 4, 5, 6])
  })
})
