import { describe, it, expect, vi, beforeEach } from 'vitest'
import { savePhotoCopy, loadPhotoCopy, clearPhotoCopies, PHOTO_CACHE_NAME, MAX_COPIES } from './photoCache'

/** The browser's own copy of a shown picture: saved once by message id, read back when the server no longer has it, cleared on sign-out; every failure is silent. */

function fakeStore() {
  const entries = new Map<string, Response>()
  const cache = {
    match: async (k: string) => entries.get(k)?.clone(),
    put: async (k: string, r: Response) => { entries.set(k, r) },
    keys: async () => [...entries.keys()].map(k => new Request(k)),
    delete: async (k: Request | string) => entries.delete(typeof k === 'string' ? k : k.url),
  }
  const opened: string[] = []
  const store = {
    open: async (name: string) => { opened.push(name); return cache },
    delete: vi.fn(async () => { entries.clear(); return true }),
  }
  return { store: store as unknown as CacheStorage, entries, opened, deleteFn: store.delete }
}
const imageResponse = (type = 'image/webp', bytes = 5) => () => Promise.resolve(new Response(new Blob([new Uint8Array(bytes)], { type }), { status: 200 }))

beforeEach(() => { vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:copy', revokeObjectURL: () => {} })) })

describe('the device cache stays small (owner 21/11/2026: not an archive; the server keeps everything)', () => {
  it('keeps only the most recent MAX_COPIES pictures: the oldest are dropped, the newest stay', async () => {
    const { store, entries } = fakeStore()
    const f = vi.fn(imageResponse())
    for (let i = 0; i < MAX_COPIES + 5; i++) await savePhotoCopy(`m${i}`, `https://storage.example/${i}.webp`, { caches: store, fetchImpl: f as never })
    expect(entries.size).toBe(MAX_COPIES)
    const names = [...entries.keys()]
    expect(names.some(k => k.endsWith('/m0'))).toBe(false)               // the oldest went
    expect(names.some(k => k.endsWith(`/m${MAX_COPIES + 4}`))).toBe(true) // the newest stayed
  })
})

describe('savePhotoCopy', () => {
  it('fetches the link once, keys the copy by the message id (never by the link), and does not fetch again when it already has it', async () => {
    const { store, entries } = fakeStore()
    const f = vi.fn(imageResponse())
    expect(await savePhotoCopy('m1', 'https://storage.example/signed/a?token=1', { caches: store, fetchImpl: f as never })).toBe(true)
    expect([...entries.keys()].every(k => k.includes('m1') && !k.includes('token'))).toBe(true)
    expect(await savePhotoCopy('m1', 'https://storage.example/signed/a?token=2', { caches: store, fetchImpl: f as never })).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ mode: 'cors', credentials: 'omit' })
  })

  it.each([
    ['a non-https link', 'http://x.example/a.webp', imageResponse()],
    ['a failed fetch', 'https://x.example/a', () => Promise.resolve(new Response('', { status: 403 }))],
    ['a non-image answer', 'https://x.example/a', imageResponse('text/html')],
    ['an empty body', 'https://x.example/a', imageResponse('image/webp', 0)],
    ['a body over the ceiling', 'https://x.example/a', imageResponse('image/webp', 6 * 1024 * 1024 + 1)],
    ['a thrown error (CORS)', 'https://x.example/a', () => Promise.reject(new TypeError('cors'))],
  ])('%s saves nothing and says so', async (_n, url, f) => {
    const { store, entries } = fakeStore()
    expect(await savePhotoCopy('m1', url, { caches: store, fetchImpl: f as never })).toBe(false)
    expect(entries.size).toBe(0)
  })

  it('without Cache Storage it quietly does nothing', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await savePhotoCopy('m1', 'https://x.example/a', { fetchImpl: imageResponse() as never })).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('loadPhotoCopy', () => {
  it('returns an object URL for a saved copy and null for one it never saved; both use the named cache', async () => {
    const { store, opened } = fakeStore()
    await savePhotoCopy('m1', 'https://x.example/a', { caches: store, fetchImpl: imageResponse() as never })
    expect(await loadPhotoCopy('m1', { caches: store })).toBe('blob:copy')
    expect(await loadPhotoCopy('other', { caches: store })).toBeNull()
    expect(new Set(opened)).toEqual(new Set([PHOTO_CACHE_NAME]))
  })

  it('a cache that throws is "no copy"', async () => {
    const broken = { open: async () => { throw new Error('quota') }, delete: async () => true } as unknown as CacheStorage
    expect(await loadPhotoCopy('m1', { caches: broken })).toBeNull()
  })
})

describe('clearPhotoCopies', () => {
  it('deletes the whole named cache (sign-out), and never throws', async () => {
    const { store, deleteFn } = fakeStore()
    await clearPhotoCopies({ caches: store })
    expect(deleteFn).toHaveBeenCalledWith(PHOTO_CACHE_NAME)
    const broken = { open: async () => null, delete: async () => { throw new Error('x') } } as unknown as CacheStorage
    await expect(clearPhotoCopies({ caches: broken })).resolves.toBeUndefined()
  })
})
