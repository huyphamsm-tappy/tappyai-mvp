// Unwind S6 (28/10/2026): a web search reads its top pages (S6A), one follow-up search per turn (S6B), the reader reads PDFs (S6C). Mocks only.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { searchWithReads, createOnce, topResultUrls, resultTitles, pagesReadCount, SEARCH_READ_TOP, GAP_READ_TOP, S6_MAX_READS, MIN_PAGES_READ } from './searchReads'
import { createLeanResearch } from './researchLoop'
import { consultUnwindS6aOn, consultUnwindS6bOn, consultUnwindS6cOn, CONSULT_UNWIND_S6A_FLAG, CONSULT_UNWIND_S6B_FLAG, CONSULT_UNWIND_S6C_FLAG } from '@/lib/config/consultFlags'
import type { PageFetchResult } from '@/lib/security/safePageFetch'

const search = (n: number, prefix = 'a') => ({ query: 'q', results: Array.from({ length: n }, (_, i) => ({ title: `T${prefix}${i}`, link: `https://${prefix}${i}.vn/p`, snippet: 's' })) })
const readOk = (urls: string[]) => ({ pages: urls.map(u => ({ url: u, passages: ['x'] })), progress: '' })

describe('S6 flags: exactly "1", never in production; S6B needs S6A', () => {
  for (const [name, on] of [[CONSULT_UNWIND_S6A_FLAG, consultUnwindS6aOn], [CONSULT_UNWIND_S6C_FLAG, consultUnwindS6cOn]] as const) {
    it(name, () => {
      expect(on({})).toBe(false)
      expect(on({ [name]: 'true' })).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      expect(on({ [name]: '1', NODE_ENV: 'production' })).toBe(false)
    })
  }
  it(CONSULT_UNWIND_S6B_FLAG, () => {
    expect(consultUnwindS6bOn({ [CONSULT_UNWIND_S6B_FLAG]: '1' })).toBe(false)
    expect(consultUnwindS6bOn({ [CONSULT_UNWIND_S6B_FLAG]: '1', [CONSULT_UNWIND_S6A_FLAG]: '1' })).toBe(true)
    expect(consultUnwindS6bOn({ [CONSULT_UNWIND_S6B_FLAG]: '1', [CONSULT_UNWIND_S6A_FLAG]: '1', VERCEL_ENV: 'production' })).toBe(false)
  })
})

describe('pure helpers', () => {
  it('top result links in rank order, distinct, http(s) only', () => {
    const r = { results: [{ link: 'https://a.vn' }, { link: 'https://a.vn' }, { link: 'ftp://x' }, { url: 'http://b.vn' }, { link: 'https://c.vn' }, { link: 'https://d.vn' }] }
    expect(topResultUrls(r, 3)).toEqual(['https://a.vn', 'http://b.vn', 'https://c.vn'])
    expect(topResultUrls({ note: 'x' }, 3)).toEqual([])
  })
  it('titles without URLs; read count ignores error entries', () => {
    expect(resultTitles({ results: [{ title: 'Giá vàng https://evil.example hôm nay' }, { title: '' }] })).toEqual(['Giá vàng hôm nay'])
    expect(pagesReadCount({ pages: [{ url: 'u' }, { error: 'page_unreadable' }] })).toBe(1)
    expect(pagesReadCount({ pages: [{ url: 'a', status: 'ok' }, { url: 'b', status: 'empty' }, { url: 'c', status: 'thin' }] })).toBe(1)
    expect(pagesReadCount(null)).toBe(0)
  })
})

describe('searchWithReads', () => {
  it('reads the top pages of the search in ONE read call and attaches them as pages_read', async () => {
    const calls: string[][] = []
    const r = await searchWithReads({ query: 'giá vàng', base: search(5), read: async urls => { calls.push(urls); return readOk(urls) } })
    expect(calls).toEqual([['https://a0.vn/p', 'https://a1.vn/p', 'https://a2.vn/p']])
    expect(calls[0].length).toBe(SEARCH_READ_TOP)
    expect((r.result as { pages_read: unknown[] }).pages_read).toHaveLength(3)
    expect((r.result as { results: unknown[] }).results).toHaveLength(5)
    expect(r.pagesRead).toBe(3)
  })
  it('read-on: all three top pages unreadable -> the next three results are read, and their pages are what the model gets', async () => {
    const calls: string[][] = []
    const failAll = (urls: string[]) => ({ pages: urls.map(u => ({ url: u, error: 'page_unreadable' })) })
    const r = await searchWithReads({ query: 'q', base: search(6), read: async urls => { calls.push(urls); return calls.length === 1 ? failAll(urls) : readOk(urls) } })
    expect(calls).toEqual([['https://a0.vn/p', 'https://a1.vn/p', 'https://a2.vn/p'], ['https://a3.vn/p', 'https://a4.vn/p', 'https://a5.vn/p']])
    expect(r.pagesRead).toBe(3)
    expect(((r.result as { pages_read: Array<{ url: string; error?: string }> }).pages_read).filter(p => !p.error).map(p => p.url)).toEqual(['https://a3.vn/p', 'https://a4.vn/p', 'https://a5.vn/p'])
  })
  it('read-on: one readable page -> two more results are read; two readable pages -> nothing more', async () => {
    const calls: string[][] = []
    const oneOk = (urls: string[]) => ({ pages: urls.map((u, k) => (k === 0 ? { url: u, passages: ['x'] } : { url: u, error: 'page_unreadable' })) })
    const r = await searchWithReads({ query: 'q', base: search(6), read: async urls => { calls.push(urls); return calls.length === 1 ? oneOk(urls) : readOk(urls) } })
    expect(calls[1]).toEqual(['https://a3.vn/p', 'https://a4.vn/p'])
    expect(r.pagesRead).toBe(3)
    const calls2: string[][] = []
    const twoOk = (urls: string[]) => ({ pages: urls.map((u, k) => (k < 2 ? { url: u, passages: ['x'] } : { url: u, error: 'page_unreadable' })) })
    await searchWithReads({ query: 'q', base: search(6), read: async urls => { calls2.push(urls); return twoOk(urls) } })
    expect(calls2.length).toBe(1)
    expect(MIN_PAGES_READ).toBe(2)
  })
  it('read-on: the follow-up search never re-reads a link the read-on already opened', async () => {
    const reads: string[][] = []
    const failAll = (urls: string[]) => ({ pages: urls.map(u => ({ url: u, error: 'page_unreadable' })) })
    await searchWithReads({
      query: 'q', base: search(6),
      read: async urls => { reads.push(urls); return reads.length === 1 ? failAll(urls) : readOk(urls) },
      gap: { find: async () => 'khac', search: async () => ({ results: [{ title: 't', link: 'https://a4.vn/p' }, { title: 'u', link: 'https://new.vn/x' }] }) },
    })
    expect(reads[2]).toEqual(['https://new.vn/x'])
  })
  it('a failed or empty read leaves the search result as it came (same object)', async () => {
    const base = search(2)
    expect((await searchWithReads({ query: 'q', base, read: async () => null })).result).toBe(base)
    expect((await searchWithReads({ query: 'q', base, read: async () => { throw new Error('x') } })).result).toBe(base)
    expect((await searchWithReads({ query: 'q', base, read: async () => ({ pages: [{ error: 'page_budget_exhausted' }] }) })).result).toBe(base)
    const noLinks = { note: 'search budget used' }
    expect((await searchWithReads({ query: 'q', base: noLinks, read: async u => readOk(u) })).result).toBe(noLinks)
  })
  it('the follow-up: one gap query, one search, its top NEW pages read, attached as follow_up', async () => {
    const reads: string[][] = [], searches: string[] = []
    const r = await searchWithReads({
      query: 'giá đất chung cư đà nẵng',
      base: search(4),
      read: async urls => { reads.push(urls); return readOk(urls) },
      gap: { find: async titles => { expect(titles).toEqual(['Ta0', 'Ta1', 'Ta2', 'Ta3']); return 'giá chung cư đà nẵng quý 3 2026 báo cáo' }, search: async q => { searches.push(q); return { results: [{ title: 'x', link: 'https://a0.vn/p' }, { title: 'y', link: 'https://n1.vn' }, { title: 'z', link: 'https://n2.vn' }, { title: 'w', link: 'https://n3.vn' }] } } },
    })
    expect(searches).toEqual(['giá chung cư đà nẵng quý 3 2026 báo cáo'])
    expect(reads[1]).toEqual(['https://n1.vn', 'https://n2.vn'])
    expect(reads[1].length).toBe(GAP_READ_TOP)
    const fu = (r.result as { follow_up: { query: string; pages_read: unknown[]; results: unknown[] } }).follow_up
    expect(fu.query).toBe('giá chung cư đà nẵng quý 3 2026 báo cáo')
    expect(fu.pages_read).toHaveLength(2)
    expect(r.followUp).toBe(true)
  })
  it('no follow-up when the gap call says nothing is missing, repeats the query, fails, or the search fails', async () => {
    let n = 0
    const base = search(2)
    const s = async () => { n++; return search(2, 'n') }
    for (const find of [async () => null, async () => 'Q', async () => { throw new Error('model down') }]) {
      const r = await searchWithReads({ query: 'q', base, read: async u => readOk(u), gap: { find, search: s } })
      expect(r.followUp).toBe(false)
    }
    expect(n).toBe(0)
    const failed = await searchWithReads({ query: 'q', base, read: async u => readOk(u), gap: { find: async () => 'khac', search: async () => { throw new Error('x') } } })
    expect(failed.followUp).toBe(false)
  })
  it('a URL in the gap query is removed before it is searched', async () => {
    const seen: string[] = []
    await searchWithReads({ query: 'q', base: search(1), read: async u => readOk(u), gap: { find: async () => 'xem https://evil.example/p giá', search: async q => { seen.push(q); return search(1, 'n') } } })
    expect(seen).toEqual(['xem giá'])
  })
})

describe('S6C — the reader reads a PDF through the RETRIEVAL_V5 path', () => {
  const robots = { check: async () => ({ allowed: true, reason: 'allowed' as const }), __reset() {} }
  const pdfAnswer: PageFetchResult = { ok: true, url: 'https://x.vn/a.pdf', finalUrl: 'https://x.vn/a.pdf', status: 200, contentType: 'application/pdf', body: '', raw: new Uint8Array([1, 2, 3]), bytes: 3, truncated: false, redirects: 0 } as unknown as PageFetchResult
  const readPdf = async (v5: boolean) => {
    const research = createLeanResearch({ lang: 'vi', userTexts: ['https://x.vn/a.pdf'], robots: robots as never, ...(v5 ? { v5Reading: true } : {}), fetchPage: async () => pdfAnswer })
    const out = await (research.tool.execute as unknown as (a: unknown, c: unknown) => Promise<{ pages: Array<Record<string, unknown>> }>)({ urls: ['https://x.vn/a.pdf'], focus: 'x' }, { toolCallId: 't', messages: [] })
    return out.pages[0]
  }
  it('with v5Reading a PDF answer goes through the PDF text path (a file with no text layer is a named failure, never raw bytes)', async () => {
    expect((await readPdf(true)).reason).toBe('pdf_no_text')
  })
  it('without it the reader is HEAD: the PDF path is never taken', async () => {
    expect((await readPdf(false)).reason).not.toBe('pdf_no_text')
  })
  it('the option reaches the real fetch only on the default path (the test seam replaces it): checked on the source', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/ai/consultative/researchLoop.ts'), 'utf8')
    expect(src).toContain('fetchPublicPage(u, { signal: s, ...(o.v5Reading ? V5_FETCH : {}), ...(hopGate ? { hopGate } : {}) })')
    expect(src).toContain("...(o.v5Reading ? { retrievalV5: true } : {}),")
  })
})

describe('route wiring', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
  it('S6A only with the flag and a read_page tool on the turn; links registered before the read; reads through the turn\'s own read_page', () => {
    expect(src).toContain('if (tools && researchReader && consultUnwindS6aOn()) {')
    expect(src).toContain('if (ws?.execute && rp?.execute) {')
    expect(src).toContain('researchReader.collectFrom(base)')
    expect(src).toContain("read: (urls, focus) => innerRead({ urls, focus, kind: 'other' }")
    expect(src.indexOf('consultUnwindS6aOn()) {')).toBeGreaterThan(src.indexOf('if (tools && requestCapTurn) wrapToolsWithRequestCap('))
  })
  it('S6B once per turn, its search through the same capped web_search; S6C and the page budget only with the flags', () => {
    expect(src).toContain('const followUpOnce = createOnce()')
    expect(src).toContain('const withGap = consultUnwindS6bOn() && followUpOnce()')
    const once = createOnce()
    expect([once(), once(), once()]).toEqual([true, false, false])
    expect(src).toContain('const b2 = await innerSearch({ query: q2 }, o); researchReader.collectFrom(b2)')
    expect(src).toContain('maxReads: consultUnwindS6aOn() ? Math.max(S6_MAX_READS, levelLimits.researchMaxReads) : levelLimits.researchMaxReads, ...(consultUnwindS6cOn() ? { v5Reading: true } : {})')
    expect(S6_MAX_READS).toBe(10)
  })
})
