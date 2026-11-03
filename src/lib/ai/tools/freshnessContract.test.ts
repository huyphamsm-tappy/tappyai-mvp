import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { webSearch, serperSearch, __clearToolCache } from './common'
import { serperPlaces } from './serperPlaces'
import { serperCacheGetMeta, serperCacheSet, serperSharedCacheKey, SERPER_CACHE_FORMAT } from './serperCache'
import { noteRetrieval, withRetrievalClock, withRetrievedAt } from './retrievalClock'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { __resetSerperAlerts } from './serperClient'

// Phase 8 freshness contract — WHEN were these rows really fetched, through every cache layer:
//   live call = now · L1 hit = the stored fetch time · L2 hit = the time stored in the envelope · a legacy L2 row = unknown.
// A tool result is stamped `retrieved_at` with the OLDEST of those; an unknown time leaves it unstamped (= "unknown" downstream); an
// existing stamp is never overwritten (a cached tool result keeps its original time).

const KV = 'https://kv.test'
let kv: Map<string, { value: string }>
let serperCalls = 0

function install() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body ?? 'null'))
    if (url.startsWith('https://google.serper.dev/')) {
      serperCalls++
      return new Response(JSON.stringify({ organic: [{ title: 'Giá iPhone 16', link: 'https://shop.example/iphone16', snippet: 'Giá từ 19.990.000đ' }], shopping: [], places: [] }), { status: 200 })
    }
    if (url === `${KV}/pipeline`) return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 })
    if (url === KV) {
      const cmd = body as string[]
      if (cmd[0] === 'GET') return new Response(JSON.stringify({ result: kv.get(cmd[1])?.value ?? null }), { status: 200 })
      if (cmd[0] === 'SET') { kv.set(cmd[1], { value: cmd[2] }); return new Response(JSON.stringify({ result: 'OK' }), { status: 200 }) }
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
}

beforeEach(() => {
  __clearToolCache(); __resetKvCounters(); __resetSerperAlerts()
  kv = new Map(); serperCalls = 0
  vi.stubEnv('SERPER_API_KEY', 'test-key'); vi.stubEnv('KV_REST_API_URL', KV); vi.stubEnv('KV_REST_API_TOKEN', 'kv-token')
  install()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const row = { title: 'Giá iPhone 16', link: 'https://shop.example/iphone16', snippet: 'Giá từ 19.990.000đ' }
const seed = (query: string, value: string) => kv.set(serperSharedCacheKey('search', query, null), { value })

describe('retrievalClock', () => {
  it('keeps the OLDEST noted time; one unknown makes the whole unknown; no clock → no-op', async () => {
    noteRetrieval(Date.now()) // outside any clock: nothing happens
    const a = await withRetrievalClock(async () => { noteRetrieval(Date.parse(ago(5))); noteRetrieval(Date.parse(ago(1))); return 1 })
    expect(Math.abs(Date.parse(a.retrievedAt!) - Date.parse(ago(5)))).toBeLessThan(1000)
    expect(a.unknown).toBe(false)
    const b = await withRetrievalClock(async () => { noteRetrieval(Date.now()); noteRetrieval(null) })
    expect(b.unknown).toBe(true)
  })
  it('withRetrievedAt: stamps an object result, never overwrites, leaves unknown / arrays / null untouched', async () => {
    const fresh = await withRetrievedAt(async () => { noteRetrieval(Date.parse(ago(2))); return { a: 1 } as Record<string, unknown> })
    expect(typeof fresh.retrieved_at).toBe('string')
    const kept = await withRetrievedAt(async () => { noteRetrieval(Date.now()); return { a: 1, retrieved_at: 'ORIGINAL' } as Record<string, unknown> })
    expect(kept.retrieved_at).toBe('ORIGINAL')
    const unknown = await withRetrievedAt(async () => { noteRetrieval(null); noteRetrieval(Date.now()); return { a: 1 } as Record<string, unknown> })
    expect('retrieved_at' in unknown).toBe(false)
    expect(await withRetrievedAt(async () => [1, 2])).toEqual([1, 2])
    expect(await withRetrievedAt(async () => null)).toBeNull()
  })
})

describe('shared cache envelope (v3) — the fetch time travels with the rows', () => {
  it('writes { v: 3, at, rows }; reads it back with the time', async () => {
    await serperCacheSet('search', 'iphone 16 gia', null, [row])
    const raw = JSON.parse([...kv.values()][0].value)
    expect(raw).toMatchObject({ v: SERPER_CACHE_FORMAT, rows: [row] })
    expect(Number.isFinite(Date.parse(raw.at))).toBe(true)
    const hit = await serperCacheGetMeta<typeof row>('search', 'iphone 16 gia', null)
    expect(hit?.rows).toEqual([row])
    expect(hit?.at).toBe(raw.at)
  })
  it('a LEGACY bare-array entry still hits, with at = null (time unknown)', async () => {
    seed('iphone 16 gia', JSON.stringify([row]))
    const hit = await serperCacheGetMeta<typeof row>('search', 'iphone 16 gia', null)
    expect(hit).toEqual({ rows: [row], at: null })
  })
  it('malformed / empty entries are misses', async () => {
    seed('q1', JSON.stringify({ v: 3, at: ago(1), rows: [] }))
    seed('q2', JSON.stringify({ v: 9, at: ago(1), rows: [row] }))
    seed('q3', 'not json')
    for (const q of ['q1', 'q2', 'q3']) expect(await serperCacheGetMeta('search', q, null)).toBeNull()
  })
})

describe('through the real provider layers: webSearch is stamped with the oldest REAL fetch time', () => {
  it('live call → now', async () => {
    const r = await webSearch('giá iphone 16 hôm nay') as { retrieved_at?: string }
    expect(serperCalls).toBe(1)
    expect(Math.abs(Date.now() - Date.parse(r.retrieved_at!))).toBeLessThan(5000)
  })
  it('L2 hit with a stored time 10 h old → that time (not now); no Serper request', async () => {
    const at = ago(10)
    seed('giá iphone 16 hôm nay', JSON.stringify({ v: 3, at, rows: [row] }))
    const r = await webSearch('giá iphone 16 hôm nay') as { retrieved_at?: string }
    expect(serperCalls).toBe(0)
    expect(r.retrieved_at).toBe(new Date(at).toISOString())
  })
  it('L2 hit on a legacy entry → UNSTAMPED (unknown), and still no Serper request', async () => {
    seed('giá iphone 16 hôm nay', JSON.stringify([row]))
    const r = await webSearch('giá iphone 16 hôm nay') as Record<string, unknown>
    expect(serperCalls).toBe(0)
    expect('retrieved_at' in r).toBe(false)
    expect(Array.isArray(r.results)).toBe(true)
  })
  it('the same tool call again (tool-level L1 hit) keeps the ORIGINAL stamp', async () => {
    const first = await webSearch('giá iphone 16 hôm nay') as { retrieved_at?: string }
    await new Promise(r => setTimeout(r, 15))
    const second = await webSearch('giá iphone 16 hôm nay') as { retrieved_at?: string }
    expect(second.retrieved_at).toBe(first.retrieved_at)
    expect(serperCalls).toBe(1)
  })
  it('callers that JOIN one in-flight request are stamped too (serperFlight replays the leader\'s time)', async () => {
    const [a, b] = await Promise.all([withRetrievalClock(() => serperSearch('giá iphone 16 chính hãng')), withRetrievalClock(() => serperSearch('giá iphone 16 chính hãng'))])
    expect(serperCalls).toBe(1)
    expect(a.retrievedAt).not.toBeNull()
    expect(b.retrievedAt).not.toBeNull()
  })
  it('an in-process (L1) hit of serperSearch reports the ORIGINAL fetch time, not "now"', async () => {
    const first = await withRetrievalClock(() => serperSearch('giá iphone 16 trả góp'))
    await new Promise(r => setTimeout(r, 80))
    const second = await withRetrievalClock(() => serperSearch('giá iphone 16 trả góp'))
    expect(serperCalls).toBe(1)
    expect(first.retrievedAt).not.toBeNull()
    // the stored time and the stamped time are two Date.now() reads of the same fetch (a ms apart under load);
    // what matters is that the hit does NOT report the later "now" (80 ms after the fetch)
    expect(Math.abs(Date.parse(second.retrievedAt!) - Date.parse(first.retrievedAt!))).toBeLessThan(20)
  })
  it('serperPlaces: an L2 hit carries its stored time', async () => {
    const at = ago(30)
    const place = { title: 'Quán A', address: 'Q1', latitude: 10.7, longitude: 106.7, rating: 4.5, ratingCount: 10, cid: 'c1' }
    kv.set(serperSharedCacheKey('maps', 'quán ăn', { lat: 10.78, lng: 106.7 }), { value: JSON.stringify({ v: 3, at, rows: [place] }) })
    const r = await withRetrievalClock(() => serperPlaces('quán ăn', { lat: 10.78, lng: 106.7 }))
    expect(serperCalls).toBe(0)
    expect(r.retrievedAt).toBe(new Date(at).toISOString())
  })
})
