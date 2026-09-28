import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperSearch, serperShopping, fetchPlacePhotosByName, __clearToolCache } from './common'
import { serperPlaces } from './serperPlaces'
import { serperSnapshot, serperDelta } from './serperMeter'
import {
  serperCacheGet, serperCacheSet, serperSharedCacheKey, serperAreaKey, serperCacheTtlSeconds,
  SERPER_CACHE_MAX_BYTES,
} from './serperCache'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { __resetSerperAlerts } from './serperClient'

// A fake Upstash REST store behind a stubbed fetch, next to a fake Serper. The code under test
// talks to both through `fetch`, exactly as it does in production.

const KV = 'https://kv.test'
let kv: Map<string, { value: string; ex?: number }>
let serperCalls: Array<{ endpoint: string; body: Record<string, unknown> }>
let kvCalls: string[][]
let kvMode: 'up' | 'http500' | 'throw' | 'hang'
let serperPayload: Record<string, unknown>
let serperOk: boolean

function install() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body ?? 'null'))
    if (url.startsWith('https://google.serper.dev/')) {
      serperCalls.push({ endpoint: url.slice('https://google.serper.dev/'.length), body })
      return new Response(JSON.stringify(serperPayload), { status: serperOk ? 200 : 500 })
    }
    if (url === `${KV}/pipeline`) {
      // The daily credit counter (kvCounter.ts) — always answers, so the ceiling never interferes.
      return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 })
    }
    if (url === KV) {
      const cmd = body as string[]
      kvCalls.push(cmd)
      if (kvMode === 'throw') throw new Error('network down')
      if (kvMode === 'http500') return new Response('boom', { status: 500 })
      if (kvMode === 'hang') return new Promise<Response>(() => {})
      if (cmd[0] === 'GET') {
        const e = kv.get(cmd[1])
        return new Response(JSON.stringify({ result: e ? e.value : null }), { status: 200 })
      }
      if (cmd[0] === 'SET') {
        kv.set(cmd[1], { value: cmd[2], ex: Number(cmd[4]) })
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 })
      }
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
}

beforeEach(() => {
  __clearToolCache(); __resetKvCounters(); __resetSerperAlerts()
  kv = new Map(); serperCalls = []; kvCalls = []; kvMode = 'up'; serperOk = true
  serperPayload = {}
  vi.stubEnv('SERPER_API_KEY', 'test-key')
  vi.stubEnv('KV_REST_API_URL', KV)
  vi.stubEnv('KV_REST_API_TOKEN', 'kv-token')
  vi.stubEnv('VERCEL_ENV', '')
  install()
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

const ORGANIC = { organic: [{ title: 'Bún bò', link: 'https://a.example/x', snippet: 's' }] }
const MAPS = { places: [{ title: 'Quán A', priceLevel: '1-100.000 ₫', rating: 4.5 }] }
const SHOP = { shopping: [{ title: 'MacBook', link: 'https://shop.example/m', price: '₫6.490.000', source: 'Tiki' }] }

describe('keys', () => {
  it('equal for queries that differ only by case / whitespace / NFC vs NFD (cacheKeyPart)', () => {
    const nfc = 'Quán Ăn  Ngon'.normalize('NFC')
    const nfd = 'quán ăn ngon'.normalize('NFD')
    expect(serperSharedCacheKey('search', nfc, null)).toBe(serperSharedCacheKey('search', ` ${nfd} `, null))
  })
  it('different when diacritics differ — tone marks are meaning, not noise', () => {
    expect(serperSharedCacheKey('search', 'quán ăn', null)).not.toBe(serperSharedCacheKey('search', 'quan an', null))
  })
  it('different by area and by endpoint; coordinates round to 2 decimals', () => {
    const q = 'khách sạn'
    const hcm = serperSharedCacheKey('maps', q, { lat: 10.7769, lng: 106.7009 })
    const dn = serperSharedCacheKey('maps', q, { lat: 16.0544, lng: 108.2022 })
    expect(hcm).not.toBe(dn)
    expect(hcm).not.toBe(serperSharedCacheKey('maps', q, null))
    expect(hcm).not.toBe(serperSharedCacheKey('search', q, { lat: 10.7769, lng: 106.7009 }))
    expect(serperSharedCacheKey('maps', q, { lat: 10.7771, lng: 106.7012 })).toBe(hcm)
    expect(serperAreaKey({ lat: 10.7769, lng: 106.7009, zoom: 12 })).toBe('ll=10.78,106.70,12')
    expect(serperAreaKey('  Đà  Nẵng ')).toBe(serperAreaKey('đà nẵng'))
    expect(serperAreaKey(null)).toBe('none')
  })
  it('is environment-namespaced and never contains the raw query text', () => {
    const k = serperSharedCacheKey('search', 'bí mật', null, undefined, { VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)
    expect(k.startsWith('preview:serper:v1:search:')).toBe(true)
    expect(k).not.toContain('bí')
  })
  it('TTL defaults to 24 h and honours SERPER_CACHE_TTL_SECONDS', () => {
    expect(serperCacheTtlSeconds({} as NodeJS.ProcessEnv)).toBe(86_400)
    expect(serperCacheTtlSeconds({ SERPER_CACHE_TTL_SECONDS: '3600' } as unknown as NodeJS.ProcessEnv)).toBe(3600)
    expect(serperCacheTtlSeconds({ SERPER_CACHE_TTL_SECONDS: 'x' } as unknown as NodeJS.ProcessEnv)).toBe(86_400)
  })
})

describe('serperSearch through the shared cache', () => {
  it('miss → pays once and writes with a 24 h EX; a second instance (L1 cleared) hits and does NOT call Serper', async () => {
    serperPayload = ORGANIC
    const a = await serperSearch('Bún bò Huế')
    expect(serperCalls).toHaveLength(1)
    const sets = kvCalls.filter(c => c[0] === 'SET')
    expect(sets).toHaveLength(1)
    expect(sets[0].slice(3)).toEqual(['EX', '86400'])
    __clearToolCache() // another lambda: empty L1
    const before = serperSnapshot()
    const b = await serperSearch('bún bò huế')
    expect(serperCalls).toHaveLength(1)
    expect(b).toEqual(a)
    const d = serperDelta(before)
    expect(d.hits.search).toBe(1)
    expect(d.calls.search).toBe(0)
    expect(d.credits).toBe(0)
    expect(d.creditsSaved).toBe(1)
  })
  it('an empty answer is not written', async () => {
    serperPayload = { organic: [] }
    expect(await serperSearch('nothing here')).toEqual([])
    expect(kvCalls.filter(c => c[0] === 'SET')).toHaveLength(0)
  })
  it('an HTTP error is not written', async () => {
    serperOk = false
    expect(await serperSearch('upstream down')).toBeNull()
    expect(kvCalls.filter(c => c[0] === 'SET')).toHaveLength(0)
  })
  it.each(['throw', 'http500'] as const)('KV %s → falls through to Serper, returns the result, never throws', async (mode) => {
    kvMode = mode
    serperPayload = ORGANIC
    const out = await serperSearch('kv outage')
    expect(out).toHaveLength(1)
    expect(serperCalls).toHaveLength(1)
  })
  it('a KV that hangs is abandoned after the short timeout (fail open)', async () => {
    kvMode = 'hang'
    serperPayload = ORGANIC
    const t = Date.now()
    const out = await serperSearch('kv hang')
    expect(out).toHaveLength(1)
    expect(serperCalls).toHaveLength(1)
    expect(Date.now() - t).toBeLessThan(2000) // two bounded KV waits (get + set), ~300 ms each
  })
  it('no KV configured → no KV traffic, plain Serper', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    serperPayload = ORGANIC
    expect(await serperSearch('no store')).toHaveLength(1)
    expect(kvCalls).toHaveLength(0)
  })
})

describe('serperShopping through the shared cache', () => {
  it('hit avoids the paid call; `num` separates entries', async () => {
    serperPayload = SHOP
    await serperShopping('macbook', 20)
    expect(serperCalls).toHaveLength(1)
    const hit = await serperShopping('MacBook', 20)
    expect(serperCalls).toHaveLength(1)
    expect(hit![0]).toMatchObject({ title: 'MacBook', price: 6_490_000, source: 'Tiki' })
    await serperShopping('macbook', 12)
    expect(serperCalls).toHaveLength(2)
  })
  it('an empty listing is not written', async () => {
    serperPayload = { shopping: [] }
    expect(await serperShopping('none')).toEqual([])
    expect(kvCalls.filter(c => c[0] === 'SET')).toHaveLength(0)
  })
})

describe('serperPlaces through the shared cache', () => {
  const HCM = { lat: 10.7769, lng: 106.7009 }
  it('hit avoids serperPost; a different area misses', async () => {
    serperPayload = MAPS
    await serperPlaces('quán ăn', HCM)
    expect(serperCalls).toHaveLength(1)
    __clearToolCache()
    const before = serperSnapshot()
    const hit = await serperPlaces('Quán ăn', HCM)
    expect(hit![0].title).toBe('Quán A')
    expect(serperCalls).toHaveLength(1)
    expect(serperDelta(before)).toMatchObject({ hits: { maps: 1 }, creditsSaved: 3, credits: 0 })
    await serperPlaces('quán ăn', { lat: 16.0544, lng: 108.2022 })
    expect(serperCalls).toHaveLength(2)
  })
  it('price retry: the FINAL (banded) answer is stored under the ORIGINAL key', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body ?? 'null'))
      if (url.startsWith('https://google.serper.dev/')) {
        n++
        const row = n === 1 ? { title: 'Quán A' } : { title: 'Quán A', priceLevel: '₫₫' }
        return new Response(JSON.stringify({ places: [row] }), { status: 200 })
      }
      if (url === `${KV}/pipeline`) return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 })
      const cmd = body as string[]
      if (cmd[0] === 'SET') kv.set(cmd[1], { value: cmd[2] })
      return new Response(JSON.stringify({ result: cmd[0] === 'GET' ? (kv.get(cmd[1])?.value ?? null) : 'OK' }), { status: 200 })
    }))
    const out = await serperPlaces('quán ăn', HCM)
    expect(n).toBe(2)
    expect(out![0].priceLevel).toBe('₫₫')
    const stored = kv.get(serperSharedCacheKey('maps', 'quán ăn', HCM))
    expect(JSON.parse(stored!.value)[0].priceLevel).toBe('₫₫')
    expect(kv.size).toBe(1)
  })
  it('KV failure → Serper still answers', async () => {
    kvMode = 'throw'
    serperPayload = MAPS
    expect(await serperPlaces('quán ăn', HCM)).toHaveLength(1)
    expect(serperCalls).toHaveLength(1)
  })
})

describe('photos are NOT shared-cached (owner decision pending)', () => {
  it('fetchPlacePhotosByName never reads or writes the shared store', async () => {
    serperPayload = { images: [{ imageUrl: 'https://img.example/a.jpg', thumbnailUrl: 'https://img.example/t.jpg' }] }
    await fetchPlacePhotosByName('pid', 'Quán A')
    expect(serperCalls.map(c => c.endpoint)).toEqual(['images'])
    expect(kvCalls).toHaveLength(0)
  })
  it('the cache layer itself refuses the images endpoint', async () => {
    await serperCacheSet('images' as never, 'q', null, [{ a: 1 }])
    expect(await serperCacheGet('images' as never, 'q', null)).toBeNull()
    expect(kvCalls).toHaveLength(0)
  })
})

describe('size cap and malformed values', () => {
  it('a value over 200 KB is not written', async () => {
    await serperCacheSet('search', 'big', null, [{ blob: 'x'.repeat(SERPER_CACHE_MAX_BYTES + 1) }])
    expect(kvCalls).toHaveLength(0)
  })
  it('a malformed or empty stored value reads as a miss', async () => {
    kv.set(serperSharedCacheKey('search', 'bad', null), { value: '{not json' })
    kv.set(serperSharedCacheKey('search', 'empty', null), { value: '[]' })
    expect(await serperCacheGet('search', 'bad', null)).toBeNull()
    expect(await serperCacheGet('search', 'empty', null)).toBeNull()
  })
})

describe('serperDelta back-compat', () => {
  it('keeps calls/credits and accepts a snapshot without hits', () => {
    const d = serperDelta({ maps: 0, search: 0, shopping: 0, images: 0 })
    expect(d).toHaveProperty('calls')
    expect(d).toHaveProperty('credits')
    expect(d).toHaveProperty('hits')
  })
})
