import { describe, it, expect, vi } from 'vitest'
import { FACT_TYPES, freshnessOf, isKnownFactType, policyFor } from './factTypes'
import { canonicalJson, contentHashOf, placeEntityKey } from './contentHash'
import { stageFact, promoteFact, retireFact } from './tviStore'

const NOW = new Date('2026-11-10T08:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

describe('fact types and freshness', () => {
  it('each type has its own window: a price goes stale long before an address', () => {
    expect(freshnessOf('ticket_price', daysAgo(6), NOW)).toBe('FRESH')
    expect(freshnessOf('ticket_price', daysAgo(8), NOW)).toBe('STALE')
    expect(freshnessOf('address', daysAgo(100), NOW)).toBe('FRESH')
    expect(freshnessOf('address', daysAgo(200), NOW)).toBe('STALE')
  })
  it('the window is inclusive at its edge; a date in the future is fresh; an unreadable date is stale', () => {
    expect(freshnessOf('opening_hours', daysAgo(30), NOW)).toBe('FRESH')
    expect(freshnessOf('opening_hours', new Date(NOW.getTime() + 3_600_000), NOW)).toBe('FRESH')
    expect(freshnessOf('opening_hours', 'not a date', NOW)).toBe('STALE')
    expect(freshnessOf('opening_hours', daysAgo(30).toISOString(), NOW)).toBe('FRESH')
  })
  it('an unknown type is reported as such, never guessed', () => {
    expect(freshnessOf('moon_phase', daysAgo(1), NOW)).toBe('UNKNOWN_TYPE')
    expect(isKnownFactType('opening_hours')).toBe(true)
    expect(isKnownFactType('toString')).toBe(false) // not an inherited property
    expect(policyFor('constructor')).toBeNull()
  })
  it('every policy id is versioned and distinct', () => {
    const ids = Object.values(FACT_TYPES).map(p => p.policyId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/\.v\d+$/)
  })
})

describe('content hash and entity key', () => {
  it('object key order does not change the hash; the content does', () => {
    const a = contentHashOf({ factType: 'opening_hours', value: { open: '08:00', close: '22:00' } })
    const b = contentHashOf({ factType: 'opening_hours', value: { close: '22:00', open: '08:00' } })
    const c = contentHashOf({ factType: 'opening_hours', value: { open: '09:00', close: '22:00' } })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('the type, the subject and the unit are part of the content', () => {
    const base = { factType: 'ticket_price', value: 50000 }
    const h = contentHashOf(base)
    expect(contentHashOf({ ...base, factType: 'menu_price' })).not.toBe(h)
    expect(contentHashOf({ ...base, subjectKey: 'child' })).not.toBe(h)
    expect(contentHashOf({ ...base, valueUnit: 'VND' })).not.toBe(h)
    expect(contentHashOf({ ...base, subjectKey: '' })).toBe(h)
  })
  it('canonical JSON sorts nested keys and drops undefined members', () => {
    expect(canonicalJson({ b: [{ z: 1, a: 2 }], a: undefined, c: null })).toBe('{"b":[{"a":2,"z":1}],"c":null}')
  })
  it('a place is keyed by its provider id, else by its normalised name and city', () => {
    expect(placeEntityKey({ placeId: 'ChIJabc', name: 'x' })).toBe('place:ChIJabc')
    expect(placeEntityKey({ name: 'Quán Ăn Ngon', city: 'Hồ Chí Minh' })).toBe('place:name:quan-an-ngon|ho-chi-minh')
    expect(placeEntityKey({ name: 'quan an ngon', city: 'ho chi minh' })).toBe('place:name:quan-an-ngon|ho-chi-minh')
    expect(placeEntityKey({ name: '   ', city: 'Hà Nội' })).toBeNull()
    expect(placeEntityKey({})).toBeNull()
  })
})

describe('the store adapter maps to the SQL functions and never throws', () => {
  const base = { entityType: 'place', entityKey: 'place:quan-a', canonicalName: 'Quán A', city: 'Hà Nội', factType: 'opening_hours', value: { open: '08:00' }, observedAt: NOW, retrievedAt: NOW }
  const rpcReturning = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as never

  it('stage: sends the policy id and the content hash, returns the outcome', async () => {
    const db = rpcReturning([{ fact_id: 'f1', version_id: 'v1', version_number: 1, outcome: 'created' }])
    const r = await stageFact(base, db)
    expect(r).toEqual({ ok: true, outcome: 'created', factId: 'f1', versionId: 'v1', versionNumber: 1 })
    const [name, args] = (db as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0]
    expect(name).toBe('tvi_stage_fact')
    expect(args.p_policy).toBe('opening_hours.v1')
    expect(args.p_content_hash).toBe(contentHashOf({ factType: 'opening_hours', value: { open: '08:00' } }))
    expect(args.p_market).toBe('VN'); expect(args.p_subject_key).toBe(''); expect(args.p_published_at).toBeNull()
  })
  it('stage: an unknown fact type and bad input are refused before the store is called', async () => {
    const db = rpcReturning([])
    expect(await stageFact({ ...base, factType: 'moon_phase' }, db)).toEqual({ ok: false, reason: 'unknown_fact_type' })
    expect(await stageFact({ ...base, entityKey: '  ' }, db)).toEqual({ ok: false, reason: 'invalid_input' })
    expect(await stageFact({ ...base, retrievedAt: new Date('x') }, db)).toEqual({ ok: false, reason: 'invalid_input' })
    expect((db as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })
  it('a store error or an exception is a result, not a throw', async () => {
    expect(await stageFact(base, rpcReturning(null, { message: 'x' }))).toEqual({ ok: false, reason: 'store_error' })
    const boom = { rpc: vi.fn(async () => { throw new Error('network') }) } as never
    expect(await stageFact(base, boom)).toEqual({ ok: false, reason: 'store_error' })
    expect(await promoteFact({ factId: 'f', versionId: 'v', expectedRowVersion: 1, verification: 'VERIFIED', reason: 'r', actorType: 'VERIFIER' }, boom)).toEqual({ ok: false, reason: 'store_error' })
    expect(await retireFact({ factId: 'f', expectedRowVersion: 1, to: 'EXPIRED', reason: 'r', actorType: 'SYSTEM' }, boom)).toEqual({ ok: false, reason: 'store_error' })
  })
  it('promote and retire: outcomes map, and a conflict carries the row version to retry from', async () => {
    expect(await promoteFact({ factId: 'f', versionId: 'v', expectedRowVersion: 1, verification: 'VERIFIED', reason: 'r', actorType: 'VERIFIER' }, rpcReturning([{ outcome: 'promoted', row_version: 2 }]))).toEqual({ ok: true, outcome: 'promoted', rowVersion: 2 })
    expect(await promoteFact({ factId: 'f', versionId: 'v', expectedRowVersion: 1, verification: 'VERIFIED', reason: 'r', actorType: 'VERIFIER' }, rpcReturning([{ outcome: 'conflict', row_version: 5 }]))).toEqual({ ok: false, reason: 'conflict', rowVersion: 5 })
    expect(await retireFact({ factId: 'f', expectedRowVersion: 2, to: 'EXPIRED', reason: 'r', actorType: 'SYSTEM' }, rpcReturning([{ outcome: 'retired', row_version: 3 }]))).toEqual({ ok: true, outcome: 'retired', rowVersion: 3 })
    expect(await retireFact({ factId: 'f', expectedRowVersion: 2, to: 'EXPIRED', reason: ' ', actorType: 'SYSTEM' }, rpcReturning([]))).toEqual({ ok: false, reason: 'invalid_input' })
  })
})
