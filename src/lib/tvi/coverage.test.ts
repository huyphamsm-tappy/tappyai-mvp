import { describe, it, expect } from 'vitest'
import { summarizeCoverage, loadCoverageRows, type CoverageRow } from './coverage'

const NOW = new Date('2026-11-20T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString()
const row = (o: Partial<CoverageRow> = {}): CoverageRow => ({ factType: 'address', status: 'CANDIDATE', verification: 'UNVERIFIED', retrievedAt: ago(1), ...o })

describe('summarizeCoverage', () => {
  it('counts facts by type, status and verification, and the active share', () => {
    const s = summarizeCoverage([
      row(), row({ status: 'ACTIVE', verification: 'PARTIALLY_VERIFIED' }), row({ factType: 'phone', status: 'ACTIVE', verification: 'VERIFIED' }), row({ factType: 'phone', status: 'EXPIRED' }),
    ], 7, NOW)
    expect(s.entities).toBe(7)
    expect(s.facts).toBe(4)
    expect(s.byType).toEqual({ address: 2, phone: 2 })
    expect(s.byStatus).toEqual({ CANDIDATE: 1, ACTIVE: 2, EXPIRED: 1 })
    expect(s.byVerification).toEqual({ UNVERIFIED: 2, PARTIALLY_VERIFIED: 1, VERIFIED: 1 })
    expect(s.activeShare).toBeCloseTo(0.5)
  })
  it('judges freshness per type with the policy table, over the facts still in use (candidate or active)', () => {
    const s = summarizeCoverage([
      row({ factType: 'address', retrievedAt: ago(100) }), // fresh (180 d)
      row({ factType: 'opening_hours', retrievedAt: ago(100) }), // stale (30 d)
      row({ factType: 'opening_hours', status: 'EXPIRED', retrievedAt: ago(100) }), // not in use: not counted
    ], 2, NOW)
    expect(s.freshness).toEqual({ FRESH: 1, STALE: 1 })
    expect(s.staleByType).toEqual({ opening_hours: 1 })
  })
  it('an empty store is all zeros, never NaN', () => {
    const s = summarizeCoverage([], 0, NOW)
    expect(s).toMatchObject({ entities: 0, facts: 0, activeShare: 0, freshness: {}, staleByType: {} })
  })
})

describe('loadCoverageRows', () => {
  it('pages through the facts and reads their state and current version', async () => {
    const mkRow = (i: number) => ({ fact_type: 'address', knowledge_fact_state: { status: 'ACTIVE', verification_status: 'VERIFIED', current: { retrieved_at: ago(i % 3) } } })
    const all = Array.from({ length: 2300 }, (_, i) => mkRow(i))
    const calls: Array<[number, number]> = []
    const db = {
      from: (t: string) => ({
        select: (_s: string, o?: { count?: string; head?: boolean }) => {
          if (o?.head) return Promise.resolve({ count: 42, error: null })
          return { order: () => ({ range: (a: number, b: number) => { calls.push([a, b]); return Promise.resolve({ data: all.slice(a, b + 1), error: null }) } }) }
        },
        _t: t,
      }),
    } as never
    const r = await loadCoverageRows(db)
    expect(r.entities).toBe(42)
    expect(r.rows).toHaveLength(2300)
    expect(r.rows[0]).toEqual({ factType: 'address', status: 'ACTIVE', verification: 'VERIFIED', retrievedAt: all[0].knowledge_fact_state.current.retrieved_at })
    expect(calls.length).toBe(3)
  })
  it('a store failure gives an empty report, never a throw', async () => {
    const db = { from: () => { throw new Error('down') } } as never
    expect(await loadCoverageRows(db)).toEqual({ entities: 0, rows: [] })
  })
})
