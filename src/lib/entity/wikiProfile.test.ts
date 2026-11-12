import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validEntityTitle, summaryUrl, wikimediaImage, profileFromSummary, fetchWikiProfile, lookupWikiProfile, __clearWikiProfileCache, type GetText } from './wikiProfile'

const musk = {
  type: 'standard', title: 'Elon Musk', description: 'Doanh nhân', extract: 'Elon Reeve Musk là một doanh nhân.',
  thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a/Elon.jpg/320px-Elon.jpg' },
  content_urls: { desktop: { page: 'https://vi.wikipedia.org/wiki/Elon_Musk' } },
}

const answer = (json: unknown, finalUrl: string): GetText => async () => ({ text: JSON.stringify(json), finalUrl })

beforeEach(() => __clearWikiProfileCache())

describe('validEntityTitle', () => {
  it('accepts ordinary names, Vietnamese and punctuation Wikipedia titles use', () => {
    for (const ok of ['Elon Musk', 'Đà Lạt', 'Tesla, Inc.', 'Bank of America', "O'Neil", 'AT&T', 'Sài Gòn (thành phố)', 'X']) expect(validEntityTitle(ok), ok).toBe(ok)
  })
  it('rejects a path traversal, slashes, percent escapes, namespaces, control characters and URLs', () => {
    for (const bad of ['../../etc/passwd', '..', '.', 'a/b', 'a\\b', '%2e%2e%2fadmin', 'File:Evil.jpg', 'Special:Random', 'a\u0000b', 'a\nb', 'https://evil.test', '//evil.test/x', 'a?b=c', 'a#b', 'a<b>', '', '   ', '-', 'a..b']) {
      expect(validEntityTitle(bad), JSON.stringify(bad)).toBeNull()
    }
    expect(validEntityTitle('x'.repeat(81))).toBeNull()
    expect(validEntityTitle(42 as unknown as string)).toBeNull()
  })
})

describe('summaryUrl', () => {
  it('uses a fixed host and the title encoded as ONE path segment (no way to change host or path)', () => {
    expect(summaryUrl('vi', 'Elon Musk')).toBe('https://vi.wikipedia.org/api/rest_v1/page/summary/Elon_Musk?redirect=true')
    expect(summaryUrl('en', 'Tesla, Inc.')).toBe('https://en.wikipedia.org/api/rest_v1/page/summary/Tesla%2C_Inc.?redirect=true')
    const u = new URL(summaryUrl('en', 'a/../b@evil.test'))
    expect(u.hostname).toBe('en.wikipedia.org')
    expect(u.pathname).toBe('/api/rest_v1/page/summary/a%2F..%2Fb%40evil.test')
  })
})

describe('wikimediaImage', () => {
  it('only an https picture on Wikimedia\'s two image hosts (the summary serves thumbnails from thumb.wikimedia.org)', () => {
    expect(wikimediaImage('https://upload.wikimedia.org/x.jpg')).toBe('https://upload.wikimedia.org/x.jpg')
    expect(wikimediaImage('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a/E.jpg/330px-E.jpg?utm_source=vi.wikipedia.org')).toContain('thumb.wikimedia.org')
    for (const bad of ['http://upload.wikimedia.org/x.jpg', 'https://evil.test/x.jpg', 'https://upload.wikimedia.org.evil.test/x.jpg', 'https://user:p@upload.wikimedia.org/x.jpg', 'https://upload.wikimedia.org:8443/x.jpg', 'https://commons.wikimedia.org/x.jpg', 'javascript:alert(1)', 5]) {
      expect(wikimediaImage(bad), String(bad)).toBeNull()
    }
  })
})

describe('profileFromSummary', () => {
  it('builds a profile from a standard article that matches the name', () => {
    const p = profileFromSummary(musk, 'Elon Musk', 'vi')
    expect(p).toMatchObject({ name: 'Elon Musk', title: 'Elon Musk', description: 'Doanh nhân', lang: 'vi', source: 'Wikipedia', href: 'https://vi.wikipedia.org/wiki/Elon_Musk' })
    expect(p?.image).toContain('upload.wikimedia.org')
  })
  it('refuses a disambiguation page, a different subject, an empty extract and a foreign link (no chip)', () => {
    expect(profileFromSummary({ ...musk, type: 'disambiguation' }, 'Elon Musk', 'vi')).toBeNull()
    expect(profileFromSummary({ ...musk, title: 'Mark Zuckerberg' }, 'Elon Musk', 'vi')).toBeNull()
    expect(profileFromSummary({ ...musk, extract: '  ' }, 'Elon Musk', 'vi')).toBeNull()
    // no short description = the bare homonym of a word (vi "Tesla" is the unit of magnetic flux density): no chip
    expect(profileFromSummary({ ...musk, description: '' }, 'Elon Musk', 'vi')).toBeNull()
    expect(profileFromSummary({ ...musk, description: undefined }, 'Elon Musk', 'vi')).toBeNull()
    expect(profileFromSummary({ ...musk, content_urls: { desktop: { page: 'https://evil.test/wiki/Elon' } } }, 'Elon Musk', 'vi')).toBeNull()
    expect(profileFromSummary(null, 'Elon Musk', 'vi')).toBeNull()
  })
  it('drops a picture that is not on upload.wikimedia.org but keeps the profile', () => {
    const p = profileFromSummary({ ...musk, thumbnail: { source: 'https://evil.test/p.jpg' } }, 'Elon Musk', 'vi')
    expect(p?.image).toBeNull()
  })
  it('strips control characters and bounds the text', () => {
    const p = profileFromSummary({ ...musk, extract: 'a\u0000b\u0007c' + 'x'.repeat(2000) }, 'Elon Musk', 'vi')
    expect(p?.extract.length).toBeLessThanOrEqual(800)
    expect(p?.extract).not.toMatch(/[\u0000-\u001f]/)
  })
})

describe('fetchWikiProfile', () => {
  it('asks only the two fixed hosts (Vietnamese first), never anything else', async () => {
    const urls: string[] = []
    const getText: GetText = async url => { urls.push(url); throw new Error('404') }
    expect(await fetchWikiProfile('Tên Không Có', getText)).toBeNull()
    expect(urls.map(u => new URL(u).hostname)).toEqual(['vi.wikipedia.org', 'en.wikipedia.org'])
  })
  it('falls back to English when Vietnamese has no such article', async () => {
    const getText: GetText = async url => {
      if (url.startsWith('https://vi.')) throw new Error('404')
      return { text: JSON.stringify({ ...musk, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Elon_Musk' } } }), finalUrl: url }
    }
    const p = await fetchWikiProfile('Elon Musk', getText)
    expect(p?.lang).toBe('en')
  })
  it('does not even call out for an invalid title (path traversal, SSRF-shaped input)', async () => {
    const getText = vi.fn<GetText>(async () => { throw new Error('should not be called') })
    for (const bad of ['../../admin', 'http://169.254.169.254/latest', '//internal.local/x', '127.0.0.1/../../x', 'a\\b']) expect(await fetchWikiProfile(bad, getText)).toBeNull()
    expect(getText).not.toHaveBeenCalled()
  })
  it('refuses an answer whose final host moved away from the wiki asked (redirect to elsewhere)', async () => {
    const p = await fetchWikiProfile('Elon Musk', answer(musk, 'https://evil.test/api/rest_v1/page/summary/Elon_Musk'))
    expect(p).toBeNull()
  })
  it('turns bad JSON, a timeout-like failure and an oversized read into null, never a throw', async () => {
    expect(await fetchWikiProfile('Elon Musk', async () => ({ text: 'not json', finalUrl: 'https://vi.wikipedia.org/x' }))).toBeNull()
    expect(await fetchWikiProfile('Elon Musk', async () => { throw new Error('Response too large') })).toBeNull()
  })
  it('passes the byte limit and an abort signal to the fetcher', async () => {
    let seen: { maxBytes: number; aborted: boolean } | null = null
    const getText: GetText = async (_u, signal, opts) => { seen = { maxBytes: opts.maxBytes, aborted: signal.aborted }; throw new Error('x') }
    await fetchWikiProfile('Elon Musk', getText)
    expect(seen).toEqual({ maxBytes: 80_000, aborted: false })
  })
})

describe('lookupWikiProfile (cache)', () => {
  it('asks Wikipedia once for the same name within the lifetime, also for a miss; asks again after it', async () => {
    const getText = vi.fn<GetText>(answer(musk, 'https://vi.wikipedia.org/wiki/Elon_Musk'))
    const t0 = 1_000_000
    expect((await lookupWikiProfile('Elon Musk', getText, t0))?.title).toBe('Elon Musk')
    expect((await lookupWikiProfile('elon musk', getText, t0 + 1000))?.name).toBe('elon musk')
    expect(getText).toHaveBeenCalledTimes(1)
    await lookupWikiProfile('Elon Musk', getText, t0 + 7 * 3600_000)
    expect(getText).toHaveBeenCalledTimes(2)

    const miss = vi.fn<GetText>(async () => { throw new Error('404') })
    await lookupWikiProfile('Không Có Gì', miss, t0)
    await lookupWikiProfile('Không Có Gì', miss, t0 + 60_000)
    expect(miss).toHaveBeenCalledTimes(2) // vi + en on the first lookup, nothing on the second
  })
})
