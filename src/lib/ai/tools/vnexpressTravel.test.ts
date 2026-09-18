import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { __clearToolCache } from './common'
import {
  searchVnExpressTravel, parseRss, parseSearchResults, parseArticle, buildExtract, classifyFreshness, relevanceScore,
  dedupeCandidates, editorialDestination, editorialIntentFor, editorialGate, destinationAliases, withTravelEditorial,
  articleIdOf, datedLabel, createTurnEditorial, INTENT_QUERY_TERM, MAX_ARTICLES, EXTRACT_MAX_CHARS, TOTAL_BUDGET_MS, RSS_TTL_MS, ARTICLE_TTL_MS, type Candidate,
} from './vnexpressTravel'
import { mayStateAsFact } from '@/lib/ai/consultative/evidenceProvenance'
import { deriveDecisionFrame } from '@/lib/ai/consultative/decisionFrame'
import { deriveNeedProfile } from '@/lib/ai/consultative/needProfile'
import { guardTravelClaimsInText } from '@/lib/ai/travelGuard'

// ─────────────────────────────────────────────────────────────────────────────
// VnExpress Travel — the LIMITED editorial supplement.
//
// Fixtures are SYNTHETIC, shaped exactly like the markup measured on
// vnexpress.net on 2026-09-15 (RSS items, `timkiem` result articles, article
// JSON-LD + `tt_list_folder_name`), with invented text — no article body is
// copied here.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-09-15T08:00:00+07:00')
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString()
const rfc = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toUTCString()

const rssItem = (id: string, title: string, desc: string, daysAgo: number) => `
    <item>
      <title>${title}</title>
      <description><![CDATA[<a href="https://vnexpress.net/x-${id}.html"><img src="https://i1-dulich.vnecdn.net/a.jpg"></a></br>${desc}]]></description>
      <pubDate>${rfc(daysAgo)}</pubDate>
      <link>https://vnexpress.net/x-${id}.html</link>
      <guid>https://vnexpress.net/x-${id}.html</guid>
      <enclosure type="image/jpeg" length="1200" url="https://i1-dulich.vnecdn.net/a.jpg?w=1200&amp;h=0"/>
    </item>`
const rss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Du lịch - VnExpress RSS</title>${items}</channel></rss>`

const searchItem = (id: string, title: string, desc: string, daysAgo: number) => `
<article data-url="https://vnexpress.net/y-${id}.html" class="item-news item-news-common" data-publishtime="${Math.floor((NOW - daysAgo * 86_400_000) / 1000)}">
  <div class="thumb-art"><a title="${title}" href="https://vnexpress.net/y-${id}.html" class="thumb thumb-5x3"><picture><img alt=""></picture></a></div>
  <h3 class="title-news"><a href="https://vnexpress.net/y-${id}.html" title="${title}"> ${title}</a></h3>
  <p class="description"><a title="${title}" href="https://vnexpress.net/y-${id}.html"><span class="location-stamp">Lâm Đồng</span>${desc}</a></p>
</article>`

const article = (o: { id: string; title: string; folders: string; tags?: string; published: string; modified?: string; lastmod?: string; paragraphs?: string[]; description?: string; canonical?: string }) => {
  const url = o.canonical ?? `https://vnexpress.net/x-${o.id}.html`
  const ld = { '@context': 'http://schema.org', '@type': 'NewsArticle', headline: o.title, description: o.description ?? `Mô tả ${o.title}`, datePublished: o.published, ...(o.modified ? { dateModified: o.modified } : {}), mainEntityOfPage: { '@id': url } }
  const body = (o.paragraphs ?? ['Đoạn mở đầu của bài viết dài hơn hai mươi ký tự.']).map(p => `<p class="Normal">${p}</p>`).join('\n')
  return `<!DOCTYPE html><html><head><title>${o.title} - Báo VnExpress</title>
<link rel="canonical" href="${url}"/>
<meta name="tt_list_folder_name" content="VnExpress,Du lịch,${o.folders}"/>
<meta property="article:tag" content="${o.tags ?? ''}"/>
<meta content="${o.published}" itemprop="datePublished" name="pubdate"/>
<meta content="${o.lastmod ?? o.published}" itemprop="dateModified" name="lastmod"/>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
</head><body><article class="fck_detail ">${body}<figure><figcaption>Ảnh minh hoạ dài hơn hai mươi ký tự</figcaption></figure></article></body></html>`
}

type Route = Record<string, string | { status: number } | ((url: string) => Promise<string>)>
const calls: string[] = []
function stubFetch(routes: Route) {
  calls.length = 0
  return vi.fn(async (input: string, init?: RequestInit) => {
    calls.push(input)
    const key = Object.keys(routes).find(k => input.startsWith(k))
    const r = key ? routes[key] : undefined
    if (r === undefined) return { ok: false, status: 404, text: async () => '' } as unknown as Response
    if (typeof r === 'function') {
      const p = r(input)
      // Honour the caller's abort so a "slow" route really times out.
      const aborted = new Promise<never>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))
      const text = await Promise.race([p, aborted])
      return { ok: true, status: 200, text: async () => text } as unknown as Response
    }
    if (typeof r === 'object') return { ok: r.status < 400, status: r.status, text: async () => '' } as unknown as Response
    return { ok: true, status: 200, text: async () => r } as unknown as Response
  })
}
const RSS = 'https://vnexpress.net/rss/du-lich.rss'
const SEARCH = 'https://timkiem.vnexpress.net/'
const art = (id: string) => `https://vnexpress.net/x-${id}.html`

beforeEach(() => { __clearToolCache() })
afterEach(() => { vi.useRealTimers() })

// ═════════════════════════════════════════════════════════════════════════════
describe('parsers', () => {
  it('1. RSS: title, link/guid, pubDate, description text (image markup stripped); non-article links skipped', () => {
    const xml = rss(rssItem('5120380', 'Lễ hội ở Italy', 'Mô tả ngắn.', 0) + rssItem('1234567', 'Đà Lạt mùa thu', 'Bài về Đà Lạt.', 2)
      + '<item><title>video</title><link>https://video.vnexpress.net/du-lich/abc</link><pubDate>x</pubDate></item>')
    const items = parseRss(xml)
    expect(items.map(i => i.article_id)).toEqual(['5120380', '1234567'])
    expect(items[1]).toMatchObject({ title: 'Đà Lạt mùa thu', summary: 'Bài về Đà Lạt.', url: 'https://vnexpress.net/x-1234567.html', origin: 'rss' })
    expect(items[1].publishedMs).toBe(NOW - 2 * 86_400_000)
  })

  it('2. on-site search: data-url, data-publishtime, title-news, description (location stamp kept as text)', () => {
    const html = `<html><body>${searchItem('5119395', "Đường đèo D'ran nối Đà Lạt sạt lở", 'Mưa lớn khiến đất đá tràn xuống đèo.', 3)}<article class="item-news"><h3 class="title-news"><a href="https://vnexpress.net/du-lich">no id</a></h3></article></body></html>`
    const items = parseSearchResults(html)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ article_id: '5119395', url: 'https://vnexpress.net/y-5119395.html', title: "Đường đèo D'ran nối Đà Lạt sạt lở", origin: 'search' })
    expect(items[0].summary).toContain('Lâm Đồng')
    expect(items[0].summary).toContain('Mưa lớn')
    expect(items[0].publishedMs).toBe(Math.floor((NOW - 3 * 86_400_000) / 1000) * 1000)
  })

  it('3. article: JSON-LD headline/description/dates, canonical URL, body paragraphs (figures dropped)', () => {
    const html = article({ id: '4478268', title: 'Cẩm nang du lịch Cô Tô', folders: 'Cẩm nang', published: '2022-06-22T10:00:00+07:00', modified: '2026-08-17T07:25:01+07:00', paragraphs: ['Cô Tô mùa nào đẹp nhất trong năm.', 'Di chuyển ra đảo bằng tàu cao tốc từ cảng.', 'ngắn'] })
    const meta = parseArticle(html, 'https://vnexpress.net/x-4478268.html?utm=1')!
    expect(meta.title).toBe('Cẩm nang du lịch Cô Tô')
    expect(meta.url).toBe('https://vnexpress.net/x-4478268.html')
    expect(meta.publishedAt).toBe('2022-06-22T10:00:00+07:00')
    expect(meta.modifiedAt).toBe('2026-08-17T07:25:01+07:00')
    expect(meta.summary).toBe('Mô tả Cẩm nang du lịch Cô Tô')
    expect(meta.paragraphs).toEqual(['Cô Tô mùa nào đẹp nhất trong năm.', 'Di chuyển ra đảo bằng tàu cao tốc từ cảng.'])
  })

  it('4. dateModified: JSON-LD wins over a stale meta lastmod; the meta fills in only when JSON-LD has none', () => {
    const stale = article({ id: '4478268', title: 'Guide', folders: 'Cẩm nang', published: '2020-07-21T07:37:00+07:00', modified: '2026-08-17T07:25:01+07:00', lastmod: '2020-07-21T07:37:00+07:00' })
    expect(parseArticle(stale, art('4478268'))!.modifiedAt).toBe('2026-08-17T07:25:01+07:00')
    const noLd = article({ id: '4478268', title: 'Guide', folders: 'Cẩm nang', published: '2020-07-21T07:37:00+07:00', lastmod: '2021-01-01T00:00:00+07:00' }).replace(/<script type="application\/ld\+json">\{"@context":"http:\/\/schema.org","@type":"NewsArticle"[\s\S]*?<\/script>/, '')
    expect(parseArticle(noLd, art('4478268'))!.modifiedAt).toBe('2021-01-01T00:00:00+07:00')
  })

  it('5. taxonomy: the folders below "Du lịch" from tt_list_folder_name, plus article:tag', () => {
    const html = article({ id: '3969969', title: 'Đà Lạt trong sương mù', folders: 'Điểm đến,Việt Nam,Đà Lạt', tags: 'Du lịch Đà Lạt,Lâm Đồng', published: '2019-09-03T16:17:52+07:00' })
    const meta = parseArticle(html, art('3969969'))!
    expect(meta.taxonomy).toEqual(['Điểm đến', 'Việt Nam', 'Đà Lạt'])
    expect(meta.tags).toEqual(['Du lịch Đà Lạt', 'Lâm Đồng'])
  })

  it('article ids: only <slug>-<7 digits>.html on the apex host', () => {
    expect(articleIdOf('https://vnexpress.net/da-lat-trong-suong-mu-3969969.html')).toBe('3969969')
    expect(articleIdOf('https://video.vnexpress.net/da-lat-3969969.html')).toBeNull()
    expect(articleIdOf('http://vnexpress.net/da-lat-3969969.html')).toBeNull()
    expect(articleIdOf('https://vnexpress.net/du-lich')).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('relevance, intent, dedupe, extract', () => {
  const c = (title: string, summary = '', url = 'https://vnexpress.net/bai-viet-1234567.html'): Candidate => ({ article_id: '1234567', url, title, summary, publishedMs: null, origin: 'rss' })

  it('6. destination relevance: any known spelling, in title / summary / slug / taxonomy; nothing else scores', () => {
    expect(relevanceScore(c('Đà Lạt mùa thu'), 'Đà Lạt', 'general')).toBeGreaterThan(0)
    expect(relevanceScore(c('Lên Dalat cuối tuần'), 'Đà Lạt', 'general')).toBeGreaterThan(0)
    expect(relevanceScore(c('Một bài viết', '', 'https://vnexpress.net/da-lat-mua-mua-1234567.html'), 'Đà Lạt', 'general')).toBeGreaterThan(0)
    expect(relevanceScore(c('Một bài viết'), 'Đà Lạt', 'general', ['Điểm đến', 'Việt Nam', 'Đà Lạt'])).toBe(5)
    expect(relevanceScore(c('Lễ hội ở Italy', 'Trento ném người vào lồng'), 'Đà Lạt', 'general')).toBe(0)
    // "Huế" is short: whole word, so "huệ" (folded "hue") in "hoa huệ" is a false hit only when it stands alone — a heading name is enough.
    expect(relevanceScore(c('Ăn gì ở Huế'), 'Huế', 'general')).toBeGreaterThan(0)
    expect(destinationAliases('Hạ Long')).toEqual(['ha long', 'halong', 'quang ninh'])
  })

  it('7. intent relevance: a matching angle adds to the score; the user text decides the angle', () => {
    const base = relevanceScore(c('Đà Lạt mùa thu'), 'Đà Lạt', 'general')
    expect(relevanceScore(c('Ăn gì ở Đà Lạt: 10 đặc sản'), 'Đà Lạt', 'an_gi')).toBeGreaterThan(base)
    expect(relevanceScore(c('Đà Lạt mùa thu'), 'Đà Lạt', 'an_gi')).toBe(base)
    expect(editorialIntentFor('Đà Lạt ăn gì ngon?', 'recommend')).toBe('an_gi')
    expect(editorialIntentFor('kinh nghiệm đi Đà Lạt lần đầu', 'inform')).toBe('kinh_nghiem')
    expect(editorialIntentFor('Đà Lạt chơi đâu 2 ngày', 'recommend')).toBe('choi_dau')
    expect(editorialIntentFor('cẩm nang du lịch Đà Lạt', 'inform')).toBe('cam_nang')
    expect(editorialIntentFor('lên kế hoạch đi Đà Lạt 3 ngày', 'plan')).toBe('cam_nang')
    expect(editorialIntentFor('Đà Lạt có gì hay', 'inform')).toBe('general')
  })

  it('8. deduplication by article id — RSS (which carries a summary) beats the duplicate search hit', () => {
    const a: Candidate = { article_id: '1111111', url: 'https://vnexpress.net/a-1111111.html', title: 'A', summary: '', publishedMs: 1, origin: 'search' }
    const b: Candidate = { ...a, summary: 'from rss', origin: 'rss' }
    const other: Candidate = { ...a, article_id: '2222222', url: 'https://vnexpress.net/b-2222222.html' }
    const out = dedupeCandidates([a, b, other])
    expect(out).toHaveLength(2)
    expect(out.find(x => x.article_id === '1111111')!.origin).toBe('rss')
  })

  it('10. the extract is ≤ 1,500 chars, intent/destination paragraphs first, cut at a sentence', () => {
    const filler = 'Câu văn dài để lấp đầy đoạn cho tới khi vượt giới hạn ký tự của phần trích. '.repeat(30)
    const paragraphs = [filler, 'Ở Đà Lạt nên ăn gì: đặc sản bánh căn và lẩu gà lá é.', filler]
    const ex = buildExtract(paragraphs, 'Đà Lạt', 'an_gi')
    expect(ex.length).toBeLessThanOrEqual(EXTRACT_MAX_CHARS)
    expect(ex.startsWith('Ở Đà Lạt nên ăn gì')).toBe(true)
    const single = buildExtract([filler], 'Đà Lạt', 'general')
    expect(single.length).toBeLessThanOrEqual(EXTRACT_MAX_CHARS)
    expect(single.endsWith('.')).toBe(true)
    expect(EXTRACT_MAX_CHARS).toBe(1500)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('freshness', () => {
  const guide = { taxonomy: ['Cẩm nang'], tags: [], title: 'Cẩm nang du lịch Nha Trang' }
  const news = { taxonomy: ['Tin tức'], tags: ['Tin nóng'], title: 'Tắc bến phà, du khách chờ 12 tiếng' }

  it('11. classification: news folder / hot tag / incident wording → time_sensitive; stories → historical; the rest stable', () => {
    expect(classifyFreshness({ ...guide, publishedAt: iso(30), modifiedAt: null }, NOW).klass).toBe('stable')
    expect(classifyFreshness({ ...news, publishedAt: iso(1), modifiedAt: null }, NOW).klass).toBe('time_sensitive')
    expect(classifyFreshness({ taxonomy: ['Điểm đến'], tags: [], title: 'Dừng tham quan hang vì đá rơi', publishedAt: iso(1), modifiedAt: null }, NOW).klass).toBe('time_sensitive')
    expect(classifyFreshness({ taxonomy: ['Dấu chân'], tags: [], title: 'Chàng trai bỏ việc về quê làm du lịch', publishedAt: iso(1), modifiedAt: null }, NOW).klass).toBe('historical')
    // Folded ambiguity: a museum ("bảo tàng") or a vegetarian place ("quán chay") is not an incident.
    expect(classifyFreshness({ taxonomy: ['Điểm đến'], tags: [], title: 'Bảo tàng cà phê và quán chay ở Đà Lạt', publishedAt: iso(1), modifiedAt: null }, NOW).klass).toBe('stable')
  })

  it('12. a time-sensitive article expires after 14 days; within the window it is usable and dated', () => {
    expect(classifyFreshness({ ...news, publishedAt: iso(10), modifiedAt: null }, NOW).usable).toBe(true)
    expect(classifyFreshness({ ...news, publishedAt: iso(15), modifiedAt: null }, NOW).usable).toBe(false)
    // An update inside the window revives it — dateModified precedence.
    expect(classifyFreshness({ ...news, publishedAt: iso(40), modifiedAt: iso(3) }, NOW).usable).toBe(true)
  })

  it('13. stable editorial is accepted for ~3 years from its newest date, then dropped; undated is never used', () => {
    const v = classifyFreshness({ ...guide, publishedAt: '2020-07-21T07:37:00+07:00', modifiedAt: '2026-08-17T07:25:01+07:00' }, NOW)
    expect(v).toMatchObject({ klass: 'stable', usable: true })
    expect(datedLabel(v.effectiveMs)).toBe('08/2026')
    expect(classifyFreshness({ ...guide, publishedAt: '2020-07-21T07:37:00+07:00', modifiedAt: null }, NOW).usable).toBe(false)
    expect(classifyFreshness({ ...guide, publishedAt: iso(1000), modifiedAt: null }, NOW).usable).toBe(true)
    expect(classifyFreshness({ ...guide, publishedAt: null, modifiedAt: null }, NOW).usable).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('searchVnExpressTravel — the supplement end to end', () => {
  const now = () => NOW
  const goodRoutes = (): Route => ({
    [RSS]: rss(
      rssItem('5001001', 'Đà Lạt mùa hoa dã quỳ', 'Cuối năm Đà Lạt vàng rực.', 2)
      + rssItem('5001002', 'Lễ hội ở Italy', 'Trento.', 1)
      + rssItem('5001003', 'Sạt lở đèo nối Đà Lạt', 'Mưa lớn, cấm đường tối 11/9.', 3),
    ),
    [SEARCH]: `<html>${searchItem('5001004', 'Cẩm nang du lịch Đà Lạt từ A-Z', 'Mùa nào đẹp, di chuyển, ăn gì, chơi đâu.', 100)}${searchItem('5001001', 'Đà Lạt mùa hoa dã quỳ', '', 2)}${searchItem('5001005', 'Đà Lạt 2019', 'Bài cũ.', 2500)}</html>`,
    [art('5001001')]: article({ id: '5001001', title: 'Đà Lạt mùa hoa dã quỳ', folders: 'Điểm đến,Việt Nam,Đà Lạt', published: iso(2), paragraphs: ['Dã quỳ nở khắp các triền đồi Đà Lạt vào cuối năm.', 'Vé vào một vườn hoa là 50.000 đồng một người theo bảng giá năm nay.'] }),
    [art('5001003')]: article({ id: '5001003', title: 'Sạt lở đèo nối Đà Lạt', folders: 'Tin tức', tags: 'Tin nóng', published: iso(3), paragraphs: ['Chính quyền tạm thời cấm đường để đảm bảo an toàn.'] }),
    ['https://vnexpress.net/y-5001004.html']: article({ id: '5001004', title: 'Cẩm nang du lịch Đà Lạt từ A-Z', folders: 'Cẩm nang', published: '2022-05-23T00:00:00+07:00', modified: iso(30), canonical: 'https://vnexpress.net/y-5001004.html', paragraphs: ['Đà Lạt mùa nào đẹp: tháng 11 đến tháng 3.', 'Di chuyển: máy bay tới Liên Khương rồi xe khách lên thành phố.'] }),
    ['https://vnexpress.net/y-5001005.html']: article({ id: '5001005', title: 'Đà Lạt 2019', folders: 'Điểm đến', published: iso(2500), canonical: 'https://vnexpress.net/y-5001005.html' }),
  })

  it('9. + 17. empty destination → no request; irrelevant results → empty list', async () => {
    const f = stubFetch(goodRoutes())
    expect(await searchVnExpressTravel('   ', 'general', 'vi', { fetchImpl: f, now })).toEqual({ travel_editorial: [] })
    expect(calls).toHaveLength(0)
    const r = await searchVnExpressTravel('Vũng Tàu', 'general', 'vi', { fetchImpl: f, now, fallbackSearch: async () => [] })
    expect(r.travel_editorial).toEqual([])
  })

  it('9. selects at most 3 relevant, fresh articles, fetches at most 3, dedupes RSS/search, drops the stale one', async () => {
    const f = stubFetch(goodRoutes())
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'cam_nang', 'vi', { fetchImpl: f, now })
    expect(travel_editorial.length).toBeLessThanOrEqual(MAX_ARTICLES)
    expect(MAX_ARTICLES).toBe(3)
    const ids = travel_editorial.map(i => i.article_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('5001004')          // the guide, updated 30 days ago
    expect(ids).not.toContain('5001005')      // 2019, stable window exceeded
    expect(ids).not.toContain('5001002')      // Italy — not the destination
    const articleFetches = calls.filter(u => /-\d{7}\.html$/.test(u))
    expect(articleFetches.length).toBeLessThanOrEqual(MAX_ARTICLES)
    expect(calls.filter(u => u === RSS)).toHaveLength(1)
    // cam_nang: the destination page AND the "cẩm nang" page — two search requests, one retrieval.
    const searches = calls.filter(u => u.startsWith(SEARCH)).map(decodeURIComponent)
    expect(searches).toHaveLength(2)
    expect(searches.every(u => u.includes('cate_code=du-lich'))).toBe(true)
    expect(searches).toContain(`${SEARCH}?q=Đà Lạt&cate_code=du-lich`)
    expect(searches).toContain(`${SEARCH}?q=Đà Lạt cẩm nang&cate_code=du-lich`)
  })

  it('6. + 14. every item is REVIEW_SUPPORTED editorial with title/url/dates/section/extract/dated — never FACT', async () => {
    const f = stubFetch(goodRoutes())
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'choi_dau', 'vi', { fetchImpl: f, now })
    expect(travel_editorial.length).toBeGreaterThan(0)
    for (const item of travel_editorial) {
      expect(item.source).toBe('VnExpress')
      expect(item.provenance).toBe('REVIEW_SUPPORTED')
      expect(mayStateAsFact({ evidence_type: item.provenance })).toBe(false)
      expect(item.url).toMatch(/^https:\/\/vnexpress\.net\/.+-\d{7}\.html$/)
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.publishedAt).toMatch(/^\d{4}-/)
      expect(item.dated).toMatch(/^\d{2}\/\d{4}$/)
      expect(item.extract.length).toBeLessThanOrEqual(EXTRACT_MAX_CHARS)
      expect(typeof item.section).toBe('string')
    }
    const flower = travel_editorial.find(i => i.article_id === '5001001')!
    expect(flower.section).toBe('Điểm đến > Việt Nam > Đà Lạt')
    // The price sentence in the extract stays REVIEW_SUPPORTED text — and the travel guard,
    // which reads only structured live fares, redacts a fare a reply states from it.
    expect(flower.extract).toContain('50.000')
    const reply = 'Vé vào vườn hoa là 50.000 đồng một người. Dã quỳ nở cuối năm.'
    const guarded = guardTravelClaimsInText(reply, [], 'Đà Lạt chơi đâu')
    expect(guarded.text).not.toContain('50.000')
    expect(guarded.text).toContain('Dã quỳ')
  })

  it('12. a time-sensitive article is served inside its window, marked, and expires after it', async () => {
    const f = stubFetch(goodRoutes())
    const inWindow = await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now })
    const news = inWindow.travel_editorial.find(i => i.article_id === '5001003')
    expect(news?.freshness).toBe('time_sensitive')
    __clearToolCache()
    const later = await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: stubFetch(goodRoutes()), now: () => NOW + 20 * 86_400_000 })
    expect(later.travel_editorial.find(i => i.article_id === '5001003')).toBeUndefined()
  })

  it('15. timeout: a publisher that never answers yields an empty list within the budget; nothing throws', async () => {
    const never = () => new Promise<string>(() => {})
    const f = stubFetch({ [RSS]: never, [SEARCH]: never })
    const t0 = Date.now()
    const r = await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, fallbackSearch: async () => null })
    expect(r).toEqual({ travel_editorial: [] })
    expect(Date.now() - t0).toBeLessThan(TOTAL_BUDGET_MS + 500)
  }, 10_000)

  it('16. a removed (404) article is dropped; the others are still served', async () => {
    const routes = goodRoutes()
    routes[art('5001001')] = { status: 404 }
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: stubFetch(routes), now })
    expect(travel_editorial.map(i => i.article_id)).not.toContain('5001001')
    expect(travel_editorial.length).toBeGreaterThan(0)
  })

  it('18. + 19. cache: the second call for the same destination makes no network request; RSS 15 min, articles 24 h', async () => {
    const f = stubFetch(goodRoutes())
    await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now })
    const first = calls.length
    expect(first).toBeGreaterThan(0)
    await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now })
    expect(calls.length).toBe(first)                       // hit
    __clearToolCache()
    await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now })
    expect(calls.length).toBeGreaterThan(first)            // miss
    expect(RSS_TTL_MS).toBe(15 * 60 * 1000)
    expect(ARTICLE_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('20. fallback: only when BOTH publisher reads fail, the existing site-scoped search supplies candidates', async () => {
    const fallbackSearch = vi.fn(async (q: string) => {
      expect(q).toBe('site:vnexpress.net/du-lich Đà Lạt')
      return [{ title: 'Đà Lạt mùa hoa dã quỳ', link: art('5001001'), snippet: 'Cuối năm.' }, { title: 'x', link: 'https://vnexpress.net/du-lich', snippet: '' }]
    })
    const routes = goodRoutes()
    routes[RSS] = { status: 503 }
    routes[SEARCH] = { status: 503 }
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: stubFetch(routes), now, fallbackSearch })
    expect(fallbackSearch).toHaveBeenCalledTimes(1)
    expect(travel_editorial.map(i => i.article_id)).toEqual(['5001001'])
    // …and NOT when the publisher answered.
    __clearToolCache()
    const spy = vi.fn(async () => [])
    await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: stubFetch(goodRoutes()), now, fallbackSearch: spy })
    expect(spy).not.toHaveBeenCalled()
  })

  it('never fetches off the publisher hosts, whatever a listing says', async () => {
    const routes: Route = {
      [RSS]: rss('<item><title>Đà Lạt</title><link>https://evil.example/da-lat-1234567.html</link><pubDate>x</pubDate></item>'),
      [SEARCH]: '<html></html>',
    }
    const f = stubFetch(routes)
    await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now, fallbackSearch: async () => [{ title: 'Đà Lạt', link: 'https://evil.example/da-lat-1234567.html', snippet: '' }] })
    expect(calls.every(u => u.startsWith('https://vnexpress.net/') || u.startsWith('https://timkiem.vnexpress.net/'))).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('POINT 2 — the intent-specific second search page (cam_nang / an_gi only)', () => {
  const now = () => NOW
  const DEST_PAGE = `${SEARCH}?q=${encodeURIComponent('Đà Lạt')}&cate_code=du-lich`
  const GUIDE_PAGE = `${SEARCH}?q=${encodeURIComponent('Đà Lạt cẩm nang')}&cate_code=du-lich`
  const FOOD_PAGE = `${SEARCH}?q=${encodeURIComponent('Đà Lạt ăn gì')}&cate_code=du-lich`
  const searchCalls = () => calls.filter(u => u.startsWith(SEARCH))

  /** The destination page carries only news; the guide and the food piece exist ONLY on their intent pages. */
  const routes = (): Route => ({
    [RSS]: rss(rssItem('5002001', 'Đà Lạt mùa hoa dã quỳ', 'Cuối năm.', 2)),
    [DEST_PAGE]: `<html>${searchItem('5002001', 'Đà Lạt mùa hoa dã quỳ', '', 2)}${searchItem('5002002', 'Đà Lạt đón khách dịp lễ', 'Đông.', 3)}</html>`,
    [GUIDE_PAGE]: `<html>${searchItem('5002010', 'Cẩm nang du lịch Đà Lạt từ A-Z', 'Mùa nào đẹp, di chuyển, ăn gì, chơi đâu.', 200)}${searchItem('5002001', 'Đà Lạt mùa hoa dã quỳ', '', 2)}</html>`,
    [FOOD_PAGE]: `<html>${searchItem('5002020', 'Đến Đà Lạt ăn gì?', 'Bánh căn, lẩu gà lá é.', 40)}</html>`,
    [art('5002001')]: article({ id: '5002001', title: 'Đà Lạt mùa hoa dã quỳ', folders: 'Điểm đến,Việt Nam,Đà Lạt', published: iso(2) }),
    ['https://vnexpress.net/y-5002002.html']: article({ id: '5002002', title: 'Đà Lạt đón khách dịp lễ', folders: 'Điểm đến', published: iso(3), canonical: 'https://vnexpress.net/y-5002002.html' }),
    ['https://vnexpress.net/y-5002010.html']: article({ id: '5002010', title: 'Cẩm nang du lịch Đà Lạt từ A-Z', folders: 'Cẩm nang', published: '2022-05-23T00:00:00+07:00', modified: iso(20), canonical: 'https://vnexpress.net/y-5002010.html', paragraphs: ['Đà Lạt mùa nào đẹp: tháng 11 đến tháng 3.'] }),
    ['https://vnexpress.net/y-5002020.html']: article({ id: '5002020', title: 'Đến Đà Lạt ăn gì?', folders: 'Ẩm thực', published: iso(40), canonical: 'https://vnexpress.net/y-5002020.html' }),
  })

  it('1. + 3. + 4. cam_nang: destination page + "cẩm nang" page in ONE retrieval; the guide the plain page lacks is served', async () => {
    const f = stubFetch(routes())
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'cam_nang', 'vi', { fetchImpl: f, now })
    expect(searchCalls()).toEqual(expect.arrayContaining([DEST_PAGE, GUIDE_PAGE]))
    expect(searchCalls()).toHaveLength(2)
    expect(calls.filter(u => u === RSS)).toHaveLength(1)
    expect(travel_editorial.map(i => i.article_id)).toContain('5002010')
    expect(travel_editorial.find(i => i.article_id === '5002010')!.section).toBe('Cẩm nang')
  })

  it('2. an_gi: destination page + "ăn gì" page; the food piece is served', async () => {
    const f = stubFetch(routes())
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'an_gi', 'vi', { fetchImpl: f, now })
    expect(searchCalls()).toEqual(expect.arrayContaining([DEST_PAGE, FOOD_PAGE]))
    expect(searchCalls()).toHaveLength(2)
    expect(travel_editorial.map(i => i.article_id)).toContain('5002020')
    expect(INTENT_QUERY_TERM).toEqual({ cam_nang: 'cẩm nang', an_gi: 'ăn gì' })
  })

  it('5. + 6. an article on both pages is one candidate; at most 3 selected and fetched', async () => {
    const f = stubFetch(routes())
    const { travel_editorial } = await searchVnExpressTravel('Đà Lạt', 'cam_nang', 'vi', { fetchImpl: f, now })
    const ids = travel_editorial.map(i => i.article_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter(i => i === '5002001')).toHaveLength(1)
    expect(travel_editorial.length).toBeLessThanOrEqual(MAX_ARTICLES)
    expect(calls.filter(u => /-\d{7}\.html$/.test(u)).length).toBeLessThanOrEqual(MAX_ARTICLES)
    // Maximum publisher requests for one logical retrieval: 1 RSS + 2 search + 3 articles.
    expect(calls.length).toBeLessThanOrEqual(6)
  })

  it('7. cache keys: the destination page and the intent page are cached separately, each reused', async () => {
    const f = stubFetch(routes())
    await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now })   // warms vnx:search:<dest> only
    expect(searchCalls()).toEqual([DEST_PAGE])
    await searchVnExpressTravel('Đà Lạt', 'cam_nang', 'vi', { fetchImpl: f, now })  // dest page is a hit; the intent page is a miss
    expect(searchCalls()).toEqual([DEST_PAGE, GUIDE_PAGE])
    await searchVnExpressTravel('Đà Lạt', 'cam_nang', 'vi', { fetchImpl: f, now })  // both hits
    expect(searchCalls()).toEqual([DEST_PAGE, GUIDE_PAGE])
    await searchVnExpressTravel('Đà Lạt', 'an_gi', 'vi', { fetchImpl: f, now })     // a different intent key
    expect(searchCalls()).toEqual([DEST_PAGE, GUIDE_PAGE, FOOD_PAGE])
  })

  it('8. both search pages share the one 4 s deadline — a hanging intent page cannot extend the retrieval', async () => {
    const hang = () => new Promise<string>(() => {})
    const r = routes()
    r[GUIDE_PAGE] = hang
    const t0 = Date.now()
    const out = await searchVnExpressTravel('Đà Lạt', 'cam_nang', 'vi', { fetchImpl: stubFetch(r), fallbackSearch: async () => null })
    expect(Date.now() - t0).toBeLessThan(TOTAL_BUDGET_MS + 500)
    // The plain page answered, so the retrieval still has candidates from it.
    expect(out.travel_editorial.length).toBeGreaterThan(0)
    expect(out.travel_editorial.map(i => i.article_id)).not.toContain('5002010')
  }, 10_000)

  it('9. + 10. concurrent tools, same destination + angle: one retrieval, both pages once, fallback bounded', async () => {
    const f = stubFetch(routes())
    const retrieve = vi.fn((d: string, i: Parameters<typeof searchVnExpressTravel>[1], l: string) => searchVnExpressTravel(d, i, l, { fetchImpl: f, now }))
    const turn = createTurnEditorial(retrieve)
    await Promise.all([turn('Đà Lạt', 'cam_nang', 'vi'), turn('Đà Lạt', 'cam_nang', 'vi'), turn('Đà Lạt', 'cam_nang', 'vi')])
    expect(retrieve).toHaveBeenCalledTimes(1)
    expect(searchCalls()).toHaveLength(2)
    __clearToolCache()
    const fallbackSearch = vi.fn(async () => [])
    const down: Route = { [RSS]: { status: 503 }, [DEST_PAGE]: { status: 503 }, [GUIDE_PAGE]: { status: 503 } }
    const fd = stubFetch(down)
    const turn2 = createTurnEditorial((d, i, l) => searchVnExpressTravel(d, i, l, { fetchImpl: fd, now, fallbackSearch }))
    await Promise.all([turn2('Đà Lạt', 'cam_nang', 'vi'), turn2('Đà Lạt', 'cam_nang', 'vi')])
    expect(fallbackSearch).toHaveBeenCalledTimes(1)
  })

  it('11. the other angles stay destination-only: kinh_nghiem, choi_dau, general make ONE search request', async () => {
    for (const intent of ['kinh_nghiem', 'choi_dau', 'general'] as const) {
      __clearToolCache()
      const f = stubFetch(routes())
      await searchVnExpressTravel('Đà Lạt', intent, 'vi', { fetchImpl: f, now })
      expect(searchCalls(), intent).toEqual([DEST_PAGE])
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('one retrieval per destination per turn', () => {
  const now = () => NOW
  const routes = (): Route => ({
    [RSS]: rss(rssItem('5001001', 'Đà Lạt mùa hoa dã quỳ', 'Cuối năm.', 2) + rssItem('5001010', 'Hội An đêm rằm', 'Phố cổ.', 1)),
    [SEARCH]: '<html></html>',
    [art('5001001')]: article({ id: '5001001', title: 'Đà Lạt mùa hoa dã quỳ', folders: 'Điểm đến', published: iso(2) }),
    [art('5001010')]: article({ id: '5001010', title: 'Hội An đêm rằm', folders: 'Điểm đến', published: iso(1) }),
  })

  it('MEASURED DEFECT: two CONCURRENT calls both miss the tool cache and both hit the publisher', async () => {
    const f = stubFetch(routes())
    await Promise.all([
      searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now }),
      searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, now }),
    ])
    // The cache only helps after a retrieval COMPLETED — this is why the turn memo exists.
    expect(calls.filter(u => u === RSS)).toHaveLength(2)
    expect(calls.filter(u => u.startsWith(SEARCH))).toHaveLength(2)
  })

  it('a multi-tool Travel turn (hotel + transport + places, one step, same destination) retrieves ONCE', async () => {
    const f = stubFetch(routes())
    const retrieve = vi.fn((d: string, i: Parameters<typeof searchVnExpressTravel>[1], l: string) => searchVnExpressTravel(d, i, l, { fetchImpl: f, now }))
    const turn = createTurnEditorial(retrieve)
    // What ai@4.3.19 does with a step's tool calls: Promise.all — concurrent execute()s.
    const [hotel, transport, places] = await Promise.all([turn('Đà Lạt', 'general', 'vi'), turn('Đà Lạt', 'general', 'vi'), turn('Đà Lạt', 'general', 'vi')])
    expect(retrieve).toHaveBeenCalledTimes(1)
    expect(calls.filter(u => u === RSS)).toHaveLength(1)
    expect(calls.filter(u => u.startsWith(SEARCH))).toHaveLength(1)
    expect(hotel).toBe(transport)   // the very same result, attached to each tool result
    expect(places.map(i => i.article_id)).toEqual(['5001001'])
    // A later step (sequential) for the same destination: still no new retrieval.
    await turn('Đà Lạt', 'general', 'vi')
    expect(retrieve).toHaveBeenCalledTimes(1)
  })

  it('two destinations in one turn are two retrievals; the RSS read is shared through the tool cache', async () => {
    const f = stubFetch(routes())
    const retrieve = vi.fn((d: string, i: Parameters<typeof searchVnExpressTravel>[1], l: string) => searchVnExpressTravel(d, i, l, { fetchImpl: f, now }))
    const turn = createTurnEditorial(retrieve)
    await turn('Hội An', 'general', 'vi')
    await turn('Đà Nẵng', 'general', 'vi')
    expect(retrieve).toHaveBeenCalledTimes(2)
    expect(calls.filter(u => u === RSS)).toHaveLength(1)
    expect(calls.filter(u => u.startsWith(SEARCH))).toHaveLength(2)
  })

  it('the fallback search fires at most once per destination+angle per turn, even under concurrent misses', async () => {
    const fallbackSearch = vi.fn(async () => [{ title: 'Đà Lạt mùa hoa dã quỳ', link: art('5001001'), snippet: '' }])
    const down: Route = { [RSS]: { status: 503 }, [SEARCH]: { status: 503 }, [art('5001001')]: routes()[art('5001001')] }
    const f = stubFetch(down)
    const turn = createTurnEditorial((d, i, l) => searchVnExpressTravel(d, i, l, { fetchImpl: f, now, fallbackSearch }))
    await Promise.all([turn('Đà Lạt', 'general', 'vi'), turn('Đà Lạt', 'general', 'vi'), turn('Đà Lạt', 'cam_nang', 'vi')])
    // Same destination, two angles → two logical retrievals; never three.
    expect(fallbackSearch).toHaveBeenCalledTimes(2)
  })

  it('a non-Travel turn never reaches the memo: the gate returns null before any retrieval', async () => {
    const retrieve = vi.fn()
    const turn = createTurnEditorial(retrieve as never)
    const gate = editorialGate({ domains: ['shopping'], goal: 'recommend' }, 'Đà Lạt', 'mua áo khoác đi Đà Lạt')
    expect(gate).toBeNull()
    if (gate) await turn('x', 'general', 'vi')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('a failed retrieval resolves the shared promise to [] — no tool in the step is failed by it', async () => {
    const turn = createTurnEditorial(async () => { throw new Error('boom') })
    await expect(turn('Đà Lạt', 'general', 'vi')).resolves.toEqual([])
  })

  it('budget scope: one retrieval = one 4 s deadline; parallel article fetches share the remainder, never add to it', async () => {
    const slow = () => new Promise<string>(() => {})
    const f = stubFetch({ [RSS]: rss(rssItem('5001001', 'Đà Lạt A', '', 1) + rssItem('5001002', 'Đà Lạt B', '', 2) + rssItem('5001003', 'Đà Lạt C', '', 3)), [SEARCH]: '<html></html>', [art('5001001')]: slow, [art('5001002')]: slow, [art('5001003')]: slow })
    const t0 = Date.now()
    const r = await searchVnExpressTravel('Đà Lạt', 'general', 'vi', { fetchImpl: f, fallbackSearch: async () => null })
    expect(r.travel_editorial).toEqual([])
    expect(Date.now() - t0).toBeLessThan(TOTAL_BUDGET_MS + 500)
    expect(calls.filter(u => /-\d{7}\.html$/.test(u))).toHaveLength(3)
  }, 10_000)
})

// ═════════════════════════════════════════════════════════════════════════════
describe('gate — travel only, from the real DecisionFrame', () => {
  const frameFor = (text: string, planningIntent: 'trip' | 'evening' | null = null) => {
    const messages = [{ role: 'user' as const, content: text }]
    const need = deriveNeedProfile(messages, { storedPreferences: null, gps: null })
    return deriveDecisionFrame({ messages, need, planningIntent, forcedTool: null, hasGps: false, storedPreferences: null, now: new Date(NOW) })
  }

  it('21. a travel turn about a known destination activates, with the destination and angle resolved', () => {
    const g = editorialGate(frameFor('Đà Lạt có gì chơi cuối tuần này, đi du lịch 2 ngày'), null, 'Đà Lạt có gì chơi cuối tuần này, đi du lịch 2 ngày')
    expect(g?.destination.term).toBe('Đà Lạt')
    expect(g?.intent).toBe('choi_dau')
    const tool = editorialGate({ domains: ['travel'], goal: 'recommend' }, 'Nha Trang', 'khách sạn đẹp gần biển')
    expect(tool?.destination.term).toBe('Nha Trang')
    // The tool's own location wins over the text when both name a city.
    expect(editorialGate({ domains: ['travel'], goal: 'plan' }, 'Hội An', 'đi Đà Nẵng rồi ghé Hội An')?.destination.term).toBe('Hội An')
  })

  it('22. non-travel domains never activate — shopping, a meal at home, spa, utility', () => {
    for (const text of ['mua tai nghe bluetooth dưới 1 triệu', 'trưa nay ăn gì gần đây', 'spa massage tốt ở quận 1', 'tỷ giá USD hôm nay']) {
      const frame = frameFor(text)
      expect(frame.domains, text).not.toContain('travel')
      expect(editorialGate(frame, 'Đà Lạt', text), text).toBeNull()
    }
    // Travel, but no destination the table knows → nothing.
    expect(editorialGate({ domains: ['travel'], goal: 'plan' }, 'Reykjavik', 'du lịch Iceland 5 ngày')).toBeNull()
    // Travel, but a comparison/decision goal → nothing.
    expect(editorialGate({ domains: ['travel'], goal: 'compare' }, 'Đà Lạt', 'so sánh 2 khách sạn')).toBeNull()
    expect(editorialDestination('Quận 1, TP HCM', 'x')?.term).toBe('TP HCM')
    expect(editorialDestination(null, 'đi Huế ăn bún bò')?.term).toBe('Huế')
  })

  it('withTravelEditorial attaches only a non-empty list, only to an object result', () => {
    const item = { source: 'VnExpress' as const, article_id: '1', title: 't', url: 'u', publishedAt: 'p', modifiedAt: null, section: '', summary: '', extract: '', freshness: 'stable' as const, provenance: 'REVIEW_SUPPORTED' as const, dated: '09/2026' }
    expect(withTravelEditorial({ results: [] }, [])).toEqual({ results: [] })
    expect(withTravelEditorial('error', [item])).toBe('error')
    expect(withTravelEditorial({ results: [] }, [item])).toEqual({ results: [], travel_editorial: [item] })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('architecture contracts (source)', () => {
  const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
  const mod = readFileSync('src/lib/ai/tools/vnexpressTravel.ts', 'utf8')
  const prompt = readFileSync('src/lib/ai/promptBuilder.ts', 'utf8')
  const stream = readFileSync('src/lib/ai/streamEnrichment.ts', 'utf8')

  // Comments stripped the way architectureLock.test.ts does: every fix here quotes the construct it forbids.
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

  it('23. no additional model call: the module never imports the AI layer, and the route still streams once', () => {
    expect(code(mod)).not.toMatch(/AI\.(stream|generate|vision)\(|from '@\/lib\/ai\/llm|@ai-sdk|from 'ai'/)
    expect((code(route).match(/AI\.stream\(/g) ?? []).length).toBe(1)
    expect(code(route)).not.toContain('AI.generate(')
  })

  it('runs INSIDE the tools\' execute(), gated on the frame the route already derived — never as a prefetch', () => {
    expect(route).toMatch(/const travelEditorialFor = async/)
    expect(route).toMatch(/editorialGate\(decisionFrame, toolLocation, lastText\)/)
    // One request-scoped memo per turn, created after the frame, used by every tool.
    expect(route).toMatch(/const turnEditorial = createTurnEditorial\(\)/)
    expect(route).toMatch(/await turnEditorial\(gate\.destination\.term, gate\.intent, lang\)/)
    expect(route).not.toMatch(/searchVnExpressTravel\(/)
    for (const tool of ['searchPlaces(query, location, type, lang, userLocation, placesBudget), travelEditorialFor(location)', 'getHotelPrices(location, checkIn, checkOut, budget?.max, lang), travelEditorialFor(location)', 'travelEditorialFor(destination)', 'webSearch(query, lang), travelEditorialFor(null)']) {
      expect(route, tool).toContain(tool)
    }
    // Attached to the tool result, the same seam price_search_results uses; nothing runs before generation.
    expect((route.match(/withTravelEditorial\(/g) ?? []).length).toBe(4)
    expect(route.indexOf('const travelEditorialFor')).toBeGreaterThan(route.indexOf('const decisionFrame = deriveDecisionFrame'))
  })

  it('source policy: RSS + on-site search + ≤3 article fetches; no sitemap, no pagination, no persistence', () => {
    expect(mod).toContain("'https://vnexpress.net/rss/du-lich.rss'")
    expect(mod).toContain("'https://timkiem.vnexpress.net/'")
    expect(code(mod)).not.toMatch(/sitemap|du-lich-p\d|createClient|supabase|from\('|\.insert\(|\.upsert\(|embedding/i)
    expect(mod).toMatch(/ranked\.slice\(0, MAX_ARTICLES\)/)
    expect(mod).toMatch(/setCache\(articleKey\(id\), meta, ARTICLE_TTL_MS\)/)
  })

  it('24. the guards keep reading their own fields — the editorial text feeds only the place guard\'s retrieved text', () => {
    expect(stream).toMatch(/for \(const e of \(res\.result\?\.travel_editorial \?\? \[\]\)/)
    const block = stream.slice(stream.indexOf('res.result?.travel_editorial'), stream.indexOf('res.result?.travel_editorial') + 400)
    expect(block).toContain('placeTexts.push')
    expect(block).not.toMatch(/travelFares|snippetPrices|addSpecRecords/)
  })

  it('the prompt teaches the citation format and the freshness rule in the cached shared segment', () => {
    expect(prompt).toContain('theo [VnExpress: <title>](url) (<dated>)')
    expect(prompt).toMatch(/16c\) Voi 'travel_editorial'/)
    expect(prompt).toContain("VnExpress khong co thong tin")
    expect(prompt).toMatch(/BAI BAO VNEXPRESS: CHI dan link bai bao khi 'url' nam trong 'travel_editorial'/)
  })
})
