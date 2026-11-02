import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLeanResearch, robotsAwareFetch, RESEARCH_MAX_READS, RESEARCH_STEPS, __resetSharedRobots } from './researchLoop'
import { createRobotsGate } from '@/lib/security/robotsTxt'
import { pageFigures, pageTexts } from './pageFigures'
import type { PageFetchResult } from '@/lib/security/safePageFetch'
import { __resetPageCache } from '@/lib/ai/agent/runtime/readPage'

const okPage = (body: string, contentType = 'text/html'): PageFetchResult => ({ ok: true, url: 'x', finalUrl: 'x', status: 200, contentType, body, bytes: body.length, truncated: false, redirects: 0, ms: 1 })
const notFound: PageFetchResult = { ok: false, url: 'x', reason: 'http_error', status: 404, redirects: 0, ms: 1 }

beforeEach(() => { __resetPageCache(); __resetSharedRobots() })
afterEach(() => { vi.unstubAllGlobals() })

describe('W1 researchLoop · constants', () => {
  it('six steps (four tool rounds with the last two kept for writing) and four pages', () => {
    expect(RESEARCH_STEPS).toBe(6)
    expect(RESEARCH_MAX_READS).toBe(4)
  })
})

describe('W1 researchLoop · robotsAwareFetch', () => {
  const mk = (robots: string | PageFetchResult) => {
    const inner = vi.fn(async (_u: string) => okPage('<html><body>page</body></html>'))
    const gate = createRobotsGate({ fetchPage: async () => (typeof robots === 'string' ? okPage(robots, 'text/plain') : robots) })
    return { f: robotsAwareFetch(inner, gate), inner }
  }
  it('an allowed page is fetched', async () => {
    const { f, inner } = mk('User-agent: *\nDisallow: /nope')
    expect((await f('https://s.example/ok')).ok).toBe(true)
    expect(inner).toHaveBeenCalledTimes(1)
  })
  it('a forbidden page is never fetched and the failure is typed', async () => {
    const { f, inner } = mk('User-agent: *\nDisallow: /nope')
    const r = await f('https://s.example/nope/x')
    expect(r).toMatchObject({ ok: false, reason: 'robots_disallowed' })
    expect(inner).not.toHaveBeenCalled()
  })
  it('an unreachable robots.txt blocks the page; a missing one does not', async () => {
    const a = mk({ ok: false, url: 'x', reason: 'http_error', status: 500, redirects: 0, ms: 1 })
    expect(await a.f('https://s.example/p')).toMatchObject({ ok: false, reason: 'robots_unreachable' })
    expect(a.inner).not.toHaveBeenCalled()
    const b = mk(notFound)
    expect((await b.f('https://s.example/p')).ok).toBe(true)
  })
})

describe('Wave 3-FIX R3-05 · robots on every redirect hop', () => {
  const robotsByOrigin: Record<string, string> = { 'https://shop.example': 'User-agent: *\nAllow: /', 'https://other.example': 'User-agent: *\nDisallow: /private' }
  const asked: string[] = []
  const gate = () => createRobotsGate({ fetchPage: async u => { asked.push(u); return okPage(robotsByOrigin[new URL(u).origin] ?? '', 'text/plain') } })
  // an inner fetcher that behaves like fetchPublicPage with a redirect: it asks the hop gate for the first URL and for the target
  const redirecting = (target: string) => vi.fn(async (u: string, _s?: AbortSignal, hopGate?: (url: URL, s: AbortSignal) => Promise<string | null>) => {
    for (const hop of [u, target]) { const refused = await hopGate?.(new URL(hop), new AbortController().signal); if (refused) return { ok: false as const, url: u, reason: refused as never, redirects: 1, ms: 1 } }
    return okPage('<html><body>page</body></html>')
  })
  it('a page whose redirect target the TARGET host\'s robots.txt forbids is not opened, and that robots.txt was read', async () => {
    asked.length = 0
    const inner = redirecting('https://other.example/private/page')
    const r = await robotsAwareFetch(inner, gate())('https://shop.example/go')
    expect(r).toMatchObject({ ok: false, reason: 'robots_disallowed' })
    expect(asked).toContain('https://other.example/robots.txt')
  })
  it('the same redirect to an allowed path of that host is opened', async () => {
    asked.length = 0
    const r = await robotsAwareFetch(redirecting('https://other.example/public'), gate())('https://shop.example/go')
    expect(r.ok).toBe(true)
  })
  it('the research reader\'s default fetcher hands the gate to fetchPublicPage as hopGate', async () => {
    const { __setPageFetchOverride } = await import('@/lib/security/safePageFetch')
    let got: unknown = null
    __setPageFetchOverride(async (u, o) => { got = o.hopGate; return okPage('<html><body>p</body></html>') })
    try {
      const r = createLeanResearch({ lang: 'vi', userTexts: ['xem https://shop.example/go'], robots: createRobotsGate({ fetchPage: async () => notFound }) })
      await (r.tool as unknown as { execute: (a: unknown, c: unknown) => Promise<unknown> }).execute({ url: 'https://shop.example/go' }, { toolCallId: 't1', messages: [] })
    } finally { __setPageFetchOverride(null) }
    expect(typeof got).toBe('function')
  })
})

describe('Wave 3-FIX R3-09 · the trace never carries a host the user typed', () => {
  const GOOD = '<html><head><title>Thực đơn</title></head><body><p>Cà phê 45.000đ</p></body></html>'
  const run = async (userText: string, readUrl: string, toolUrls: string[] = []) => {
    const events: Array<{ ev: string; data: Record<string, unknown> }> = []
    const fetchPage = async (u: string): Promise<PageFetchResult> => (u.endsWith('/robots.txt') ? notFound : { ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: GOOD, bytes: GOOD.length, truncated: false, redirects: 0, ms: 1 })
    const r = createLeanResearch({ lang: 'vi', userTexts: [userText], emit: (ev, data) => events.push({ ev, data }), fetchPage, robots: createRobotsGate({ fetchPage }) })
    if (toolUrls.length > 0) await r.collectUrls({ search: { execute: async (_a: unknown, _c: unknown) => ({ results: toolUrls.map(link => ({ link })) }) } }).search.execute({}, {})
    await (r.tool as unknown as { execute: (a: unknown, c: unknown) => Promise<unknown> }).execute({ url: readUrl }, { toolCallId: 't1', messages: [] })
    return events
  }
  it('a URL the user typed: page_read and evidence carry the fixed label, not the host name (canary)', async () => {
    const events = await run('xem giúp https://canary-user-host.example/secret?q=1', 'https://canary-user-host.example/secret?q=1')
    const dump = JSON.stringify(events)
    expect(events.some(e => e.ev === 'page_read')).toBe(true) // non-vacuous: the page was read and traced
    expect(dump).not.toContain('canary-user-host')
    expect(events.filter(e => e.ev === 'page_read' || e.ev === 'evidence').map(e => `${e.ev}:${String(e.data.host)}`)).toEqual(['page_read:user_url', 'evidence:user_url'])
  })
  it('a host that came back in a tool result is still recorded by name, also when the user typed the same host', async () => {
    const a = await run('không có link', 'https://tool-host.example/menu', ['https://tool-host.example/menu'])
    expect(JSON.stringify(a)).toContain('tool-host.example')
    const b = await run('xem https://both-host.example/x', 'https://both-host.example/x', ['https://www.both-host.example/y'])
    expect(JSON.stringify(b)).toContain('both-host.example')
  })
})

describe('W1 researchLoop · the reader with the REAL fetcher refuses what the address policy refuses (no network is touched)', () => {
  it('private / loopback / link-local / metadata / internal names: every page is an error, fetch is never called', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('network must not be used') })
    vi.stubGlobal('fetch', fetchSpy)
    const urls = ['http://169.254.169.254/latest/meta-data/', 'http://localhost:3000/admin', 'http://127.0.0.1/', 'http://10.0.0.5/secret', 'http://[::1]/', 'http://metadata.google.internal/computeMetadata/v1/', 'http://printer.local/', 'http://192.168.1.1/']
    const r = createLeanResearch({ lang: 'vi', userTexts: [`Xem giúp ${urls.join(' ')}`] })
    const out = await (r.tool as unknown as { execute: (a: unknown, c: unknown) => Promise<{ pages: Array<{ url: string; error?: string; reason?: string }> }> }).execute({ urls: urls.slice(0, 3), focus: 'x' }, { toolCallId: 'a', messages: [] })
    const r2 = createLeanResearch({ lang: 'vi', userTexts: [`Xem giúp ${urls.join(' ')}`] }) // a fresh turn: every attempt (even a refused one) counts against a turn's page budget
    const out2 = await (r2.tool as unknown as { execute: (a: unknown, c: unknown) => Promise<{ pages: Array<{ url: string; error?: string; reason?: string }> }> }).execute({ urls: urls.slice(3, 6), focus: 'x' }, { toolCallId: 'b', messages: [] })
    for (const p of [...out.pages, ...out2.pages]) {
      // "[::1]" is not even picked up as a link from the user's text (url_not_from_results); every other address is refused by the address policy before any socket is opened
      expect(['page_unreadable', 'url_not_from_results'], p.url).toContain(p.error)
      if (p.error === 'page_unreadable') expect(p.reason, p.url).toMatch(/robots_unreachable|blocked|robots_disallowed/)
    }
    expect(out.pages.filter(p => p.error === 'page_unreadable').length).toBeGreaterThanOrEqual(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('W1 researchLoop · collectUrls and the allowed set', () => {
  it('the URLs a tool result carries become openable; the result is returned unchanged; read_page itself is not wrapped; a throwing tool still throws', async () => {
    const pages: Record<string, PageFetchResult> = { 'https://a.example/robots.txt': notFound, 'https://a.example/menu': okPage('<html><head><title>T</title></head><body><p>Giá 50.000đ</p></body></html>') }
    const fetchPage = vi.fn(async (u: string) => pages[u] ?? notFound)
    const r = createLeanResearch({ lang: 'vi', userTexts: ['không có link'], fetchPage, robots: createRobotsGate({ fetchPage }) })
    expect(r.allowedCount()).toBe(0)
    const resultObj = { results: [{ title: 'T', link: 'https://a.example/menu' }], website: 'https://b.example/' }
    const tools = r.collectUrls({
      web_search: { description: 'd', execute: async () => resultObj },
      boom: { description: 'd', execute: async () => { throw new Error('tool failed') } },
      read_page: r.tool,
      noExec: { description: 'no execute' },
    }) as unknown as Record<string, { execute?: (a: unknown, c: unknown) => Promise<unknown> }>
    expect(tools.read_page).toBe(r.tool)
    expect(tools.noExec).toEqual({ description: 'no execute' })
    await expect(tools.boom!.execute!({}, {})).rejects.toThrow('tool failed')
    expect(r.allowedCount()).toBe(0)
    expect(await tools.web_search!.execute!({}, {})).toBe(resultObj)
    expect(r.allowedCount()).toBe(2)
    const out = await (r.tool as unknown as { execute: (a: unknown, c: unknown) => Promise<{ pages: Array<{ url: string; error?: string }> }> }).execute({ urls: ['https://a.example/menu', 'https://zzz.example/'], focus: 'giá' }, { toolCallId: 'c', messages: [] })
    expect(out.pages.find(p => p.url.includes('a.example'))?.error).toBeUndefined()
    expect(out.pages.find(p => p.url.includes('zzz.example'))?.error).toBe('url_not_from_results')
    expect(fetchPage.mock.calls.map(c => c[0]).some(u => u.includes('zzz'))).toBe(false)
  })
  it('the user\'s own links are allowed from the start; the allowed set is bounded', () => {
    const r = createLeanResearch({ lang: 'vi', userTexts: ['https://u.example/one và https://u.example/two.'] })
    expect(r.allowedCount()).toBe(2)
    const many = createLeanResearch({ lang: 'vi', userTexts: [Array.from({ length: 900 }, (_, i) => `https://m.example/p${i}`).join(' ')] })
    expect(many.allowedCount()).toBeLessThanOrEqual(400)
  })
})

describe('W1 pageFigures / pageTexts', () => {
  const result = { pages: [{ url: 'https://a.example', page_content: 'Cà phê sữa 45.000đ, bạc xỉu 52.000đ, combo 1,2 triệu. Gọi 0912345678. Năm 2026.', evidence: [{ value: '45.000đ', quote: 'Cà phê sữa | 45.000đ' }], passages: ['Menu 60.000 đồng'] }, { url: 'https://b.example', error: 'page_unreadable' }] }
  it('amounts (>= 1.000) from the content, the evidence values and the passages, with unit words read', () => {
    const f = pageFigures(result)
    expect(f).toEqual(expect.arrayContaining([45000, 52000, 1200000, 60000]))
    expect(f.every(n => n >= 1000)).toBe(true)
  })
  it('texts: content, passages, evidence quotes', () => {
    const t = pageTexts(result)
    expect(t.join('\n')).toContain('bạc xỉu')
    expect(t.join('\n')).toContain('Menu 60.000')
    expect(t.join('\n')).toContain('Cà phê sữa | 45.000đ')
  })
  it('anything else gives []; the text is bounded', () => {
    for (const x of [null, undefined, 'x', 5, {}, { pages: 'x' }, { pages: [] }, { pages: [null] }]) { expect(pageFigures(x)).toEqual([]); expect(pageTexts(x)).toEqual(x && typeof x === 'object' && 'pages' in (x as object) ? [] : []) }
    const huge = { pages: [{ page_content: `${'giá 50.000đ. '.repeat(100_000)}` }] }
    expect(pageTexts(huge).join('').length).toBeLessThanOrEqual(60_000)
    expect(pageFigures(huge)).toContain(50000)
  })
})
