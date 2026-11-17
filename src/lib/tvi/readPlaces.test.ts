// TVI read for places (14/11/2026): a stored fact fills only what the live call did not return, carries its date and freshness, and a failing or slow store changes nothing.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tviReadOn, mergeStoredFacts, readTviForPlaces, placeRowKey, READ_MAX_ROWS } from './readPlaces'
import { readFacts, READ_MAX_ENTITIES, type StoredFact } from './tviStore'

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

const NOW = new Date('2026-11-14T08:00:00Z')
const stored = (over: Partial<StoredFact> & Pick<StoredFact, 'factType' | 'value'>): StoredFact => ({ entityKey: 'place:p1', subjectKey: '', valueUnit: null, retrievedAt: '2026-11-10T07:00:00.000Z', validUntil: null, status: 'CANDIDATE', verification: 'UNVERIFIED', ...over })
const WEEK = { 'Thứ Hai': '08:00–21:00' }
const row = (extra: Record<string, unknown> = {}) => ({ name: 'Quán A', place_id: 'p1', ...extra })

describe('the flag', () => {
  it('is off by default, on only for "1", and locked in a production runtime unless the owner lists it', () => {
    expect(tviReadOn({})).toBe(false)
    expect(tviReadOn({ TVI_READ: 'true' })).toBe(false)
    expect(tviReadOn({ TVI_READ: '1' })).toBe(true)
    expect(tviReadOn({ TVI_READ: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(tviReadOn({ TVI_READ: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'TVI_READ' })).toBe(true)
  })
})

describe('mergeStoredFacts', () => {
  it('fills a field the live row lacks, with the date it was read, its freshness and its verification', () => {
    const r = mergeStoredFacts({ results: [row({ address: '1 Lê Lợi' })] }, [stored({ factType: 'opening_hours', value: { week: WEEK }, verification: 'PARTIALLY_VERIFIED', status: 'ACTIVE' })], { now: NOW })
    expect(r).toMatchObject({ rowsFilled: 1, factsAdded: 1 })
    const out = (r.result as { results: Array<Record<string, unknown>> }).results[0]
    expect(out.known_facts).toEqual([{ fact_type: 'opening_hours', value: WEEK, retrieved_at: '2026-11-10T07:00:00.000Z', freshness: 'FRESH', verification: 'PARTIALLY_VERIFIED', from: 'stored' }])
    expect(out.address).toBe('1 Lê Lợi') // the live row is untouched
    expect(out.opening_hours_week).toBeUndefined() // a stored fact is never written over a live field
  })
  it('the live row wins: a field it has is never replaced or repeated', () => {
    const live = row({ opening_hours_week: { 'Thứ Hai': '09:00–17:00' }, phone: '0900' })
    const r = mergeStoredFacts({ results: [live] }, [stored({ factType: 'opening_hours', value: { week: WEEK } }), stored({ factType: 'phone', value: { number: '0111' } })], { now: NOW })
    expect(r.rowsFilled).toBe(0)
    expect(r.result).toEqual({ results: [live] })
  })
  it('reads each stored value back in the shape of the field it stands for', () => {
    const r = mergeStoredFacts({ results: [row()] }, [
      stored({ factType: 'address', value: { text: '24 Lê Văn Hưu' } }), stored({ factType: 'phone', value: { number: '024 3943 4106' } }), stored({ factType: 'website', value: { url: 'https://example.vn' } }),
    ], { now: NOW })
    const known = ((r.result as { results: Array<{ known_facts: Array<{ fact_type: string; value: unknown }> }> }).results[0].known_facts)
    expect(Object.fromEntries(known.map(k => [k.fact_type, k.value]))).toEqual({ address: '24 Lê Văn Hưu', phone: '024 3943 4106', website: 'https://example.vn' })
  })
  it('a fact past its policy window is STALE, said so, not hidden and not called wrong', () => {
    const r = mergeStoredFacts({ results: [row()] }, [stored({ factType: 'opening_hours', value: { week: WEEK }, retrievedAt: '2026-09-01T00:00:00.000Z' })], { now: NOW })
    expect((r.result as { results: Array<{ known_facts: Array<{ freshness: string }> }> }).results[0].known_facts[0].freshness).toBe('STALE')
  })
  it('of two stored versions of one fact type the most recently read wins', () => {
    const r = mergeStoredFacts({ results: [row()] }, [
      stored({ factType: 'address', value: { text: 'cũ' }, retrievedAt: '2026-10-01T00:00:00.000Z' }), stored({ factType: 'address', value: { text: 'mới' }, retrievedAt: '2026-11-12T00:00:00.000Z' }),
    ], { now: NOW })
    expect((r.result as { results: Array<{ known_facts: Array<{ value: unknown }> }> }).results[0].known_facts[0].value).toBe('mới')
  })
  it('matches a place by the same key the capture wrote: the provider id, else name and city', () => {
    expect(placeRowKey({ name: 'Quán Ăn Ngon' }, 'Hồ Chí Minh')).toBe('place:name:quan-an-ngon|ho-chi-minh')
    const r = mergeStoredFacts({ results: [{ name: 'Quán Ăn Ngon' }] }, [stored({ entityKey: 'place:name:quan-an-ngon|ho-chi-minh', factType: 'phone', value: { number: '1' } })], { city: 'Hồ Chí Minh', now: NOW })
    expect(r.rowsFilled).toBe(1)
    expect(mergeStoredFacts({ results: [row()] }, [stored({ entityKey: 'place:other', factType: 'phone', value: { number: '1' } })], { now: NOW }).rowsFilled).toBe(0)
  })
  it('never stored: prices, other fact types, a sub-subject, an empty or malformed value', () => {
    const r = mergeStoredFacts({ results: [row()] }, [
      stored({ factType: 'menu_price', value: { text: '50k' } }), stored({ factType: 'ticket_price', value: { text: '100k' } }), stored({ factType: 'phone', subjectKey: 'extension', value: { number: '1' } }),
      stored({ factType: 'address', value: { text: '   ' } }), stored({ factType: 'website', value: 'not an object' }),
    ], { now: NOW })
    expect(r.rowsFilled).toBe(0)
  })
  it('only the first rows are read, and a result without rows is returned as it is', () => {
    const rows = Array.from({ length: READ_MAX_ROWS + 2 }, (_, i) => ({ name: `Q${i}`, place_id: `p${i}` }))
    const facts = rows.map((_, i) => stored({ entityKey: `place:p${i}`, factType: 'phone', value: { number: String(i) } }))
    expect(mergeStoredFacts({ results: rows }, facts, { now: NOW }).rowsFilled).toBe(READ_MAX_ROWS)
    const none = { results: [] }
    expect(mergeStoredFacts(none, facts).result).toBe(none)
    expect(mergeStoredFacts('x', facts).result).toBe('x')
  })
})

describe('readTviForPlaces', () => {
  const result = { results: [row()] }
  it('asks the store for the keys of the rows and merges what comes back, logging counts only', async () => {
    const read = vi.fn(async (_keys: readonly string[]) => [stored({ factType: 'phone', value: { number: '0123' } })])
    const out = await readTviForPlaces(result, {}, { read }) as { results: Array<{ known_facts?: unknown[] }> }
    expect(read).toHaveBeenCalledWith(['place:p1'])
    expect(out.results[0].known_facts).toHaveLength(1)
    const logged = JSON.stringify((console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls)
    expect(logged).toContain('tappyai_tvi_read')
    expect(logged).not.toContain('0123')
  })
  it('a store that throws or answers nothing leaves the result exactly as it was', async () => {
    expect(await readTviForPlaces(result, {}, { read: async () => { throw new Error('db down') } })).toBe(result)
    expect(await readTviForPlaces(result, {}, { read: async () => [] })).toBe(result)
  })
  it('a store slower than the timeout is not waited for', async () => {
    const t0 = Date.now()
    const out = await readTviForPlaces(result, {}, { read: () => new Promise<StoredFact[]>(res => setTimeout(() => res([stored({ factType: 'phone', value: { number: '1' } })]), 2000)), timeoutMs: 30 })
    expect(out).toBe(result)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
  it('rows with nothing to key on, or no rows, never reach the store', async () => {
    const read = vi.fn(async () => [])
    await readTviForPlaces({ results: [{ address: 'x' }] }, {}, { read })
    await readTviForPlaces({ nothing: true }, {}, { read })
    expect(read).not.toHaveBeenCalled()
  })
})

describe('readFacts (the store side)', () => {
  const dbReturning = (payload: { data: unknown; error?: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ in: async () => payload }) }) }) }) as never
  const entity = (state: Record<string, unknown> | null, type = 'phone', key = 'place:p1') => ({ entity_key: key, knowledge_facts: [{ fact_type: type, subject_key: '', knowledge_fact_state: state }] })
  const cur = (over: Record<string, unknown> = {}) => ({ value: { number: '1' }, value_unit: null, retrieved_at: '2026-11-10T07:00:00.000Z', valid_until: null, ...over })

  it('returns the current version of ACTIVE and CANDIDATE facts only', async () => {
    const data = [
      entity({ status: 'ACTIVE', verification_status: 'VERIFIED', current: cur() }, 'phone', 'place:a'),
      entity({ status: 'CANDIDATE', verification_status: 'UNVERIFIED', current: cur() }, 'address', 'place:b'),
      entity({ status: 'REJECTED', verification_status: 'UNVERIFIED', current: cur() }, 'website', 'place:c'),
      entity({ status: 'EXPIRED', verification_status: 'UNVERIFIED', current: cur() }, 'website', 'place:d'),
      entity({ status: 'SUPERSEDED', verification_status: 'UNVERIFIED', current: cur() }, 'website', 'place:e'),
    ]
    const out = await readFacts(['place:a', 'place:b'], dbReturning({ data }), { now: NOW })
    expect(out.map(f => [f.entityKey, f.status])).toEqual([['place:a', 'ACTIVE'], ['place:b', 'CANDIDATE']])
    expect(out[0]).toMatchObject({ factType: 'phone', verification: 'VERIFIED', retrievedAt: '2026-11-10T07:00:00.000Z' })
  })
  it('a fact whose validity has ended is not read; one with a future end is', async () => {
    const data = [
      entity({ status: 'ACTIVE', verification_status: 'VERIFIED', current: cur({ valid_until: '2026-11-01T00:00:00.000Z' }) }, 'phone', 'place:a'),
      entity({ status: 'ACTIVE', verification_status: 'VERIFIED', current: cur({ valid_until: '2027-01-01T00:00:00.000Z' }) }, 'phone', 'place:b'),
    ]
    expect((await readFacts(['place:a', 'place:b'], dbReturning({ data }), { now: NOW })).map(f => f.entityKey)).toEqual(['place:b'])
  })
  it('an error, junk, an exception, or no keys give an empty list and never throw', async () => {
    expect(await readFacts(['place:a'], dbReturning({ data: null, error: { message: 'x' } }))).toEqual([])
    expect(await readFacts(['place:a'], dbReturning({ data: 'junk' }))).toEqual([])
    expect(await readFacts(['place:a'], { from: () => { throw new Error('boom') } } as never)).toEqual([])
    expect(await readFacts([], dbReturning({ data: [] }))).toEqual([])
    expect(await readFacts(['  '], dbReturning({ data: [] }))).toEqual([])
  })
  it('asks for at most READ_MAX_ENTITIES distinct keys, in one query', async () => {
    const asked: string[][] = []
    const db = { from: () => ({ select: () => ({ eq: () => ({ in: async (_c: string, keys: string[]) => { asked.push(keys); return { data: [] } } }) }) }) } as never
    await readFacts(Array.from({ length: 30 }, (_, i) => `place:${i % 20}`), db)
    expect(asked).toHaveLength(1)
    expect(asked[0].length).toBe(READ_MAX_ENTITIES)
    expect(new Set(asked[0]).size).toBe(asked[0].length)
  })
})
