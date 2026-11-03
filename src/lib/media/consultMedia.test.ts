import { describe, it, expect, vi } from 'vitest'
import { isAllowedMediaImage, isAllowedMediaPage, sanitizeMediaBlock, parseMediaBlocks } from './mediaHosts'
import { fetchWikiEntity, mainSubjectOf, sameSubject, wikiLanglink } from './wikiEntity'
import { rssItemImage } from '@/lib/ai/tools/food'

// CONSULT_V3 layouts (owner 17/10): the media block's URL rules, the Wikipedia subject card, the RSS picture. Pure units (fetch faked).

describe('mediaHosts', () => {
  it('images: only https on the news CDNs / Wikimedia', () => {
    expect(isAllowedMediaImage('https://i1-vnexpress.vnecdn.net/2026/10/15/a.jpg')).toBe(true)
    expect(isAllowedMediaImage('https://cdn.tuoitre.vn/thumb_w/x.jpg')).toBe(true)
    expect(isAllowedMediaImage('https://cdnphoto.dantri.com.vn/y.jpg')).toBe(true)
    expect(isAllowedMediaImage('https://upload.wikimedia.org/wikipedia/commons/a/b.jpg')).toBe(true)
    // the REST summary's thumbnail host (measured on vi.wikipedia.org, 17/10)
    expect(isAllowedMediaImage('https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Elon_Musk.jpg/330px-Elon_Musk.jpg?utm_source=vi.wikipedia.org')).toBe(true)
    expect(isAllowedMediaImage('https://thumb.wikimedia.org.evil.example/x.jpg')).toBe(false)
    for (const bad of ['http://i1-vnexpress.vnecdn.net/a.jpg', 'https://evil.example/a.jpg', 'https://vnecdn.net.evil.example/a.jpg', 'javascript:alert(1)', 'https://user:pw@upload.wikimedia.org/a.jpg', 'https://127.0.0.1/a.jpg']) expect(isAllowedMediaImage(bad)).toBe(false)
  })
  it('pages: article pages of the outlets, Wikipedia /wiki/ pages only', () => {
    expect(isAllowedMediaPage('https://vnexpress.net/tesla-4801.html')).toBe(true)
    expect(isAllowedMediaPage('https://vi.wikipedia.org/wiki/Elon_Musk')).toBe(true)
    expect(isAllowedMediaPage('https://vi.wikipedia.org/w/index.php?title=x&action=edit')).toBe(false)
    expect(isAllowedMediaPage('https://evil.example/wiki/x')).toBe(false)
  })
  it('sanitize drops every item with a disallowed URL, and the block when nothing is left', () => {
    const b = sanitizeMediaBlock({ v: 1, kind: 'news', items: [
      { src: 'https://i1-vnexpress.vnecdn.net/a.jpg', href: 'https://vnexpress.net/a.html', label: 'VnExpress', title: 'A' },
      { src: 'https://evil.example/b.jpg', href: 'https://vnexpress.net/b.html', label: 'X', title: 'B' },
      { src: 'https://i1-vnexpress.vnecdn.net/c.jpg', href: 'https://evil.example/c', label: 'X', title: 'C' },
    ] })
    expect(b).toEqual({ v: 1, kind: 'news', items: [{ src: 'https://i1-vnexpress.vnecdn.net/a.jpg', href: 'https://vnexpress.net/a.html', label: 'VnExpress', title: 'A' }] })
    expect(sanitizeMediaBlock({ v: 1, kind: 'news', items: [{ src: 'https://evil.example/b.jpg', href: 'https://vnexpress.net/b.html' }] })).toBeNull()
    expect(sanitizeMediaBlock({ v: 2, kind: 'news', items: [] })).toBeNull()
    expect(sanitizeMediaBlock({ v: 1, kind: 'entity', entity: { name: 'X', summary: 'y', href: 'https://evil.example/wiki/X' } })).toBeNull()
  })
  it('parse: every block is stripped from the text; only valid ones come back; an unclosed block never shows', () => {
    const good = JSON.stringify({ v: 1, kind: 'entity', entity: { name: 'Elon Musk', summary: 'Doanh nhân.', href: 'https://vi.wikipedia.org/wiki/Elon_Musk', image: 'https://evil.example/x.jpg' } })
    const r = parseMediaBlocks(`Chào.\n\n[TAPPY_MEDIA]${good}[/TAPPY_MEDIA]\n\n[TAPPY_MEDIA]{"v":1,"kind":"news","items":[{"src":"https://evil.example/a.jpg","href":"https://vnexpress.net/a"}]}[/TAPPY_MEDIA]`)
    expect(r.text).toBe('Chào.')
    expect(r.blocks).toEqual([{ v: 1, kind: 'entity', entity: { name: 'Elon Musk', summary: 'Doanh nhân.', href: 'https://vi.wikipedia.org/wiki/Elon_Musk', source: 'Wikipedia' } }])
    expect(parseMediaBlocks('Đang viết [TAPPY_MEDIA]{"v":1,"ki').text).toBe('Đang viết')
  })
})

describe('wikiEntity', () => {
  const summary = (over: object = {}) => ({ type: 'standard', title: 'Elon Musk', extract: 'Elon Reeve Musk là doanh nhân…', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Elon.jpg/320px-Elon.jpg' }, content_urls: { desktop: { page: 'https://vi.wikipedia.org/wiki/Elon_Musk' } }, ...over })
  const fake = (byHost: Record<string, unknown>) => vi.fn(async (url: string) => {
    const host = new URL(url).hostname
    if (!(host in byHost)) throw new Error('unexpected host ' + host)
    const body = byHost[host]
    return { ok: body !== null, json: async () => body }
  })
  it('with the user\'s message: the subject must be what the user asked about (eval 17/10: "Tappy" racing drivers, the unit "Tesla")', () => {
    expect(mainSubjectOf('**Tesla:** xe điện. **Elon Musk** là doanh nhân.', 'biết elon musk không')).toBe('Elon Musk')
    expect(mainSubjectOf('Mình là **Tappy**, trợ lý AI.', 'ê tappy, ông là ai vậy, làm được gì')).toBe('Tappy') // named by the user → allowed
    expect(mainSubjectOf('Mình là **Tappy**, trợ lý AI.', 'ông là ai vậy, làm được gì')).toBeNull()
    expect(mainSubjectOf('À, ông nói **Adolf Hitler** đó.', 'ông biết hít le không')).toBe('Adolf Hitler')
    expect(mainSubjectOf('**SpaceX** và **Tesla** là hai công ty.', 'biết elon musk không')).toBeNull()
  })
  it('the main subject is the first bold name that is not a heading', () => {
    expect(mainSubjectOf('Biết chứ 😄 **Elon Musk** là doanh nhân.\n- **Tesla:** xe điện')).toBe('Elon Musk')
    expect(mainSubjectOf('- **Tesla:** xe\n**Adolf Hitler** là…')).toBe('Adolf Hitler')
    expect(mainSubjectOf('**một ý nhỏ** thôi')).toBeNull()
  })
  it('a standard vi article whose title matches → card with picture and article link; the request goes to the fixed host with the title encoded', async () => {
    const f = fake({ 'vi.wikipedia.org': summary() })
    const e = await fetchWikiEntity('Elon Musk', 'vi', f)
    expect(e).toEqual({ name: 'Elon Musk', summary: 'Elon Reeve Musk là doanh nhân…', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Elon.jpg/320px-Elon.jpg', href: 'https://vi.wikipedia.org/wiki/Elon_Musk', source: 'Wikipedia' })
    expect(f.mock.calls[0][0]).toBe('https://vi.wikipedia.org/api/rest_v1/page/summary/Elon_Musk?redirect=true')
  })
  it('a disambiguation page, another person, or no vi article → falls back to en, then nothing', async () => {
    expect(await fetchWikiEntity('Elon Musk', 'vi', fake({ 'vi.wikipedia.org': summary({ type: 'disambiguation' }), 'en.wikipedia.org': null }))).toBeNull()
    expect(await fetchWikiEntity('Elon Musk', 'vi', fake({ 'vi.wikipedia.org': summary({ title: 'Kimbal Musk' }), 'en.wikipedia.org': summary({ title: 'Kimbal Musk', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Kimbal_Musk' } } }) }))).toBeNull()
    const en = await fetchWikiEntity('Elon Musk', 'vi', fake({ 'vi.wikipedia.org': null, 'en.wikipedia.org': summary({ content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Elon_Musk' } } }) }))
    expect(en?.href).toBe('https://en.wikipedia.org/wiki/Elon_Musk')
  })
  it('a picture off Wikimedia is dropped (the card stays, without it); a network failure gives no card', async () => {
    const e = await fetchWikiEntity('Elon Musk', 'vi', fake({ 'vi.wikipedia.org': summary({ thumbnail: { source: 'https://evil.example/x.jpg' } }) }))
    expect(e?.image).toBeUndefined()
    expect(await fetchWikiEntity('Elon Musk', 'vi', vi.fn(async () => { throw new Error('down') }))).toBeNull()
  })
  it('wikiLanglink: the same article in the other Wikipedia, from the fixed host with the title encoded; anything odd → null', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: [{ title: 'Tesla', langlinks: [{ lang: 'en', title: 'Tesla (unit)' }] }] } }) }))
    expect(await wikiLanglink('Tesla', 'vi', 'en', f)).toBe('Tesla (unit)')
    expect((f.mock.calls[0] as unknown[])[0]).toBe('https://vi.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=langlinks&redirects=1&lllang=en&titles=Tesla')
    const g = vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: [{ langlinks: [{ lang: 'vi', title: 'Tesla, Inc.' }] }] } }) }))
    expect(await wikiLanglink('Tesla, Inc.', 'en', 'vi', g)).toBe('Tesla, Inc.')
    expect((g.mock.calls[0] as unknown[])[0]).toContain('https://en.wikipedia.org/w/api.php?')
    expect((g.mock.calls[0] as unknown[])[0]).toContain('&titles=Tesla%2C%20Inc.')
    expect(await wikiLanglink('X', 'vi', 'en', vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: [{ title: 'X' }] } }) })))).toBeNull()
    expect(await wikiLanglink('X', 'vi', 'en', vi.fn(async () => ({ ok: true, json: async () => ({ query: { pages: [{ langlinks: [{ lang: 'fr', title: 'Y' }] }] } }) })))).toBeNull()
    expect(await wikiLanglink('X', 'vi', 'en', vi.fn(async () => ({ ok: false, json: async () => ({}) })))).toBeNull()
    expect(await wikiLanglink('X', 'vi', 'en', vi.fn(async () => { throw new Error('down') }))).toBeNull()
    expect(await wikiLanglink('X', 'vi', 'vi', f)).toBeNull()
  })
  it('sameSubject: Tesla is not Tesla, Inc. nor Tesla (unit); the same title is', () => {
    expect(sameSubject('Tesla', 'Tesla, Inc.')).toBe(false)
    expect(sameSubject('Tesla (unit)', 'Tesla, Inc.')).toBe(false)
    expect(sameSubject('Tesla, Inc.', 'Tesla, Inc.')).toBe(true)
    expect(sameSubject('Battle of Dien Bien Phu', 'Battle of Dien Bien Phu')).toBe(true)
  })
})

describe('rssItemImage', () => {
  it('the first <img src> of the item (or its enclosure) on the outlet CDN; anything else is ignored', () => {
    expect(rssItemImage('<description><![CDATA[<a href="x"><img src="https://i1-vnexpress.vnecdn.net/2026/a.jpg?w=500&amp;h=300"></a>Tin]]></description>')).toBe('https://i1-vnexpress.vnecdn.net/2026/a.jpg?w=500&h=300')
    expect(rssItemImage('<enclosure type="image/jpeg" url="https://cdnphoto.dantri.com.vn/b.jpg"/>')).toBe('https://cdnphoto.dantri.com.vn/b.jpg')
    expect(rssItemImage('<img src="https://tracker.evil.example/p.gif">')).toBeNull()
    expect(rssItemImage('<description>no picture</description>')).toBeNull()
  })
})
