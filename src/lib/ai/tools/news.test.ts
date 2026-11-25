// 19/11 final UAT: "economic news this week" came back empty. The words "tin", "tuan nay", "Viet Nam" matched nothing special, the economy question read the general feed, and an empty match was a dead end.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getNews, newsFeedsFor, newsQueryTerms, foldAccents } from './food'

const rss = (titles: string[]) => `<rss><channel>${titles.map((t, i) => `<item><title><![CDATA[${t}]]></title><description><![CDATA[desc ${i}]]></description><link>https://x.test/${i}</link><pubDate>Thu, 19 Nov 2026 08:00:00 +0700</pubDate></item>`).join('')}</channel></rss>`

afterEach(() => { vi.unstubAllGlobals() })

describe('news feeds and words', () => {
  it('an economy question reads the business feeds, a general one the latest feeds', () => {
    expect(newsFeedsFor('tin kinh te Viet Nam').every(f => f.url.includes('kinh-doanh'))).toBe(true)
    expect(newsFeedsFor('tin moi nhat hom nay').some(f => f.url.includes('tin-moi-nhat'))).toBe(true)
  })
  it('filler words are not search words, accents do not matter', () => {
    expect(newsQueryTerms('tin kinh te Viet Nam dang chu y tuan nay')).toEqual(['kinh'])
    expect(foldAccents('Kinh T' + String.fromCharCode(0x1ebf))).toBe('kinh te')
  })
})

describe('getNews', () => {
  it('headlines that match none of the words still come back (the newest of the feed), never an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => rss(['Gia xang giam', 'Lai suat tang']) })))
    const r = await getNews('khong lien quan zzzqq', 'vi') as { articles: unknown[] }
    expect(r.articles.length).toBeGreaterThan(0)
  })
  it('every outlet keeps its own share', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => rss(Array.from({ length: 10 }, (_, i) => `${url.includes('vnexpress') ? 'A' : 'B'} kinh doanh ${i}`)) })))
    const r = await getNews('kinh doanh ban moi', 'vi') as { articles: Array<{ source: string }> }
    expect(new Set(r.articles.map(a => a.source)).size).toBeGreaterThan(1)
  })
  it('all feeds down: the empty note, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const r = await getNews('tin tuc cuoi cung', 'vi') as { articles: unknown[] }
    expect(r.articles).toEqual([])
  })
})
