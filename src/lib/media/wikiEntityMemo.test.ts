import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWikiEntity, wikiLanglink } from './wikiEntity'

// Latency, quality-neutral: identical default-fetch lookups share one request (also while it is still in flight); a miss is never kept; a test's own fetch is never memoised.
const page = (title: string) => ({ ok: true, json: async () => ({ type: 'standard', title, extract: 'x', thumbnail: { source: 'https://upload.wikimedia.org/a.jpg' }, content_urls: { desktop: { page: `https://vi.wikipedia.org/wiki/${title}` } } }) })

afterEach(() => { vi.unstubAllGlobals() })

describe('memoised Wikipedia lookups', () => {
  it('two identical lookups at the same time make ONE request and return the same card', async () => {
    const f = vi.fn(async () => page('Tokyo'))
    vi.stubGlobal('fetch', f)
    const [a, b] = await Promise.all([fetchWikiEntity('Tokyo', 'vi'), fetchWikiEntity('Tokyo', 'vi')])
    expect(f).toHaveBeenCalledTimes(1)
    expect(a?.name).toBe('Tokyo')
    expect(b).toEqual(a)
  })

  it('a later identical lookup reuses the result', async () => {
    const f = vi.fn(async () => page('Seoul'))
    vi.stubGlobal('fetch', f)
    await fetchWikiEntity('Seoul', 'vi')
    await fetchWikiEntity('Seoul', 'vi')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('an empty result is not kept: the next lookup asks again', async () => {
    const f = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    vi.stubGlobal('fetch', f)
    expect(await fetchWikiEntity('Nowhereland', 'en')).toBeNull()
    expect(await fetchWikiEntity('Nowhereland', 'en')).toBeNull()
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('a caller-supplied fetch is never memoised', async () => {
    const f = vi.fn(async () => page('Hanoi'))
    await fetchWikiEntity('Hanoi', 'vi', f as never)
    await fetchWikiEntity('Hanoi', 'vi', f as never)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('the language-link lookup is memoised the same way', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: [{ langlinks: [{ lang: 'en', title: 'Tesla (unit)' }] }] } }) }))
    vi.stubGlobal('fetch', f)
    expect(await wikiLanglink('Tesla', 'vi', 'en')).toBe('Tesla (unit)')
    expect(await wikiLanglink('Tesla', 'vi', 'en')).toBe('Tesla (unit)')
    expect(f).toHaveBeenCalledTimes(1)
  })
})
