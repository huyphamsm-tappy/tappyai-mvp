import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decideMaintenance, loadPending, loadExpiredActive, maintainTvi, tviMaintainOn, MAINTAIN_MAX_BATCH, type PendingFact } from './maintain'

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

const NOW = new Date('2026-11-20T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()
const provider = { relation: 'SUPPORTS' as const, sourceType: 'PROVIDER_API' as const, sourceDomain: 'maps.google.com' }

const pending = (over: Partial<PendingFact> = {}): PendingFact => ({
  factId: 'f1', versionId: 'v1', rowVersion: 1, factType: 'address', retrievedAt: ago(2), validUntil: null, status: 'CANDIDATE', evidence: [provider], ...over,
})

describe('the flag', () => {
  it('is off by default, on only for "1", locked in a production runtime unless the owner lists it', () => {
    expect(tviMaintainOn({})).toBe(false)
    expect(tviMaintainOn({ TVI_MAINTAIN: 'true' })).toBe(false)
    expect(tviMaintainOn({ TVI_MAINTAIN: '1' })).toBe(true)
    expect(tviMaintainOn({ TVI_MAINTAIN: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(tviMaintainOn({ TVI_MAINTAIN: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'TVI_MAINTAIN' })).toBe(true)
  })
})

describe('decideMaintenance', () => {
  it('promotes a fresh single-source provider address as PARTIALLY_VERIFIED', () => {
    expect(decideMaintenance(pending(), NOW)).toEqual({ kind: 'promote', verification: 'PARTIALLY_VERIFIED', reason: 'single_source_allowed_for_type' })
  })
  it('holds a stale fact, a price (needs two sources) and a fact with no evidence', () => {
    expect(decideMaintenance(pending({ retrievedAt: ago(400) }), NOW).kind).toBe('hold')
    expect(decideMaintenance(pending({ factType: 'ticket_price' }), NOW).kind).toBe('hold')
    expect(decideMaintenance(pending({ evidence: [] }), NOW).kind).toBe('hold')
  })
  it('a popularity source never promotes anything', () => {
    expect(decideMaintenance(pending({ evidence: [{ relation: 'SUPPORTS', sourceType: 'KOL', sourceDomain: 'x.vn' }] }), NOW).kind).toBe('hold')
  })
  it('reports a dispute when an authoritative source refutes', () => {
    const d = decideMaintenance(pending({ evidence: [provider, { relation: 'REFUTES', sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'quan.vn' }] }), NOW)
    expect(d.kind).toBe('dispute')
  })
  it('two independent sources promote as VERIFIED', () => {
    const d = decideMaintenance(pending({ evidence: [provider, { relation: 'SUPPORTS', sourceType: 'OFFICIAL_BUSINESS', sourceDomain: 'quan.vn' }] }), NOW)
    expect(d).toMatchObject({ kind: 'promote', verification: 'VERIFIED' })
  })
})

describe('maintainTvi', () => {
  const mk = (items: PendingFact[], expired: Array<{ factId: string; rowVersion: number }> = []) => {
    const promote = vi.fn(async () => ({ ok: true as const, outcome: 'promoted' as const, rowVersion: 2 }))
    const retire = vi.fn(async () => ({ ok: true as const, outcome: 'retired' as const, rowVersion: 2 }))
    return { promote, retire, deps: { loadPending: async () => items, loadExpired: async () => expired, promote, retire } }
  }

  it('promotes the eligible, leaves the rest, and writes as the SYSTEM actor with the row version it read', async () => {
    const { promote, deps } = mk([pending(), pending({ factId: 'f2', versionId: 'v2', evidence: [] })])
    const c = await maintainTvi(deps, { now: NOW })
    expect(promote).toHaveBeenCalledTimes(1)
    expect(promote).toHaveBeenCalledWith(expect.objectContaining({ factId: 'f1', versionId: 'v1', expectedRowVersion: 1, verification: 'PARTIALLY_VERIFIED', actorType: 'SYSTEM', actor: 'tvi.maintain' }))
    expect(c).toMatchObject({ examined: 2, promoted: 1, held: 1, disputed: 0, conflicts: 0, failed: 0 })
  })
  it('a dispute is counted but writes nothing (no store transition exists for it)', async () => {
    const { promote, retire, deps } = mk([pending({ evidence: [provider, { relation: 'REFUTES', sourceType: 'GOVERNMENT', sourceDomain: 'gov.vn' }] })])
    const c = await maintainTvi(deps, { now: NOW })
    expect([promote.mock.calls.length, retire.mock.calls.length]).toEqual([0, 0])
    expect(c.disputed).toBe(1)
  })
  it('counts a compare-and-set conflict and a store failure without throwing', async () => {
    const { deps } = mk([pending(), pending({ factId: 'f2', versionId: 'v2' })])
    let n = 0
    deps.promote = vi.fn(async () => (n++ === 0 ? { ok: false as const, reason: 'conflict' as const } : { ok: false as const, reason: 'store_error' as const })) as never
    const c = await maintainTvi(deps, { now: NOW })
    expect(c).toMatchObject({ promoted: 0, conflicts: 1, failed: 1 })
  })
  it('retires an ACTIVE fact whose validity has ended as EXPIRED', async () => {
    const { retire, deps } = mk([], [{ factId: 'f9', rowVersion: 4 }])
    const c = await maintainTvi(deps, { now: NOW })
    expect(retire).toHaveBeenCalledWith(expect.objectContaining({ factId: 'f9', expectedRowVersion: 4, to: 'EXPIRED', reason: 'validity_ended', actorType: 'SYSTEM' }))
    expect(c.expired).toBe(1)
  })
  it('never throws when the loader fails', async () => {
    const c = await maintainTvi({ loadPending: async () => { throw new Error('x') }, loadExpired: async () => [], promote: vi.fn(), retire: vi.fn() } as never, { now: NOW })
    expect(c.failed).toBe(1)
  })
  it('bounds one run', () => { expect(MAINTAIN_MAX_BATCH).toBeLessThanOrEqual(500) })
})

// a tiny PostgREST stand-in: select/eq/in/not/lt/order/limit over in-memory tables
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const from = (name: string) => {
    let rows = [...(tables[name] ?? [])]
    const b: Record<string, unknown> = {}
    const chain = (fn: (r: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => (..._a: unknown[]) => { rows = fn(rows); return b }
    b.select = () => b
    b.eq = (c: string, v: unknown) => chain(r => r.filter(x => x[c] === v))()
    b.in = (c: string, v: unknown[]) => chain(r => r.filter(x => v.includes(x[c])))()
    b.not = (c: string, _op: string, v: unknown) => chain(r => r.filter(x => x[c] !== v))()
    b.lt = (c: string, v: string) => chain(r => r.filter(x => typeof x[c] === 'string' && (x[c] as string) < v))()
    b.order = () => b
    b.limit = (n: number) => chain(r => r.slice(0, n))()
    b.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null })
    return b
  }
  return { from } as never
}

describe('loadPending', () => {
  const tables = {
    knowledge_fact_state: [
      { fact_id: 'f1', current_version_id: 'v1', candidate_version_id: null, status: 'CANDIDATE', row_version: 3 },
      { fact_id: 'f2', current_version_id: 'v2old', candidate_version_id: 'v2new', status: 'ACTIVE', row_version: 5 },
      { fact_id: 'f3', current_version_id: 'v3', candidate_version_id: null, status: 'ACTIVE', row_version: 1 },
    ],
    knowledge_facts: [{ id: 'f1', fact_type: 'phone' }, { id: 'f2', fact_type: 'address' }],
    knowledge_fact_versions: [
      { id: 'v1', fact_id: 'f1', retrieved_at: '2026-11-18T00:00:00Z', valid_until: null },
      { id: 'v2new', fact_id: 'f2', retrieved_at: '2026-11-19T00:00:00Z', valid_until: null },
    ],
    knowledge_fact_evidence: [
      { fact_version_id: 'v1', evidence_id: 'e1', relation: 'SUPPORTS', status: 'ACTIVE' },
      { fact_version_id: 'v1', evidence_id: 'e2', relation: 'SUPPORTS', status: 'RETRACTED' },
    ],
    knowledge_evidence: [{ id: 'e1', source_id: 's1' }, { id: 'e2', source_id: 's1' }],
    knowledge_sources: [{ id: 's1', source_type: 'PROVIDER_API', canonical_domain: 'maps.google.com' }],
  }
  it('reads pending candidates (a new fact, and a changed value waiting on an active one) with their evidence', async () => {
    const out = await loadPending(fakeDb(tables), 50)
    expect(out.map(p => [p.factId, p.versionId, p.rowVersion, p.factType, p.status])).toEqual([['f1', 'v1', 3, 'phone', 'CANDIDATE'], ['f2', 'v2new', 5, 'address', 'ACTIVE']])
    expect(out[0].evidence).toEqual([
      { relation: 'SUPPORTS', sourceType: 'PROVIDER_API', sourceDomain: 'maps.google.com', active: true },
      { relation: 'SUPPORTS', sourceType: 'PROVIDER_API', sourceDomain: 'maps.google.com', active: false },
    ])
    expect(out[1].evidence).toEqual([])
  })
  it('a store failure is an empty list, never a throw', async () => {
    const bad = { from: () => { throw new Error('down') } } as never
    expect(await loadPending(bad, 10)).toEqual([])
    expect(await loadExpiredActive(bad, NOW, 10)).toEqual([])
  })
})

describe('loadExpiredActive', () => {
  it('finds ACTIVE facts whose current version validity has ended', async () => {
    const db = fakeDb({
      knowledge_fact_versions: [{ id: 'v1', fact_id: 'f1', valid_until: '2026-11-01T00:00:00Z' }, { id: 'v2', fact_id: 'f2', valid_until: '2027-01-01T00:00:00Z' }, { id: 'v3', fact_id: 'f3', valid_until: '2026-10-01T00:00:00Z' }],
      knowledge_fact_state: [
        { fact_id: 'f1', current_version_id: 'v1', status: 'ACTIVE', row_version: 7 },
        { fact_id: 'f2', current_version_id: 'v2', status: 'ACTIVE', row_version: 2 },
        { fact_id: 'f3', current_version_id: 'v3', status: 'EXPIRED', row_version: 3 },
      ],
    })
    expect(await loadExpiredActive(db, NOW, 50)).toEqual([{ factId: 'f1', rowVersion: 7 }])
  })
})
