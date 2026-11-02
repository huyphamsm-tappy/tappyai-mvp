import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serperSearchEx, webSearch } from './common'
import { serperSearchCacheKey, webSearchCacheKey } from './cacheKeys'

// P1-4 (audit 29/10, owner 30/10): the model used to get {title, link, snippet} only. Serper also returns each result's date, an answer box and a
// knowledge graph, and the country / language of the search were fixed to Vietnam / Vietnamese. They now reach the model; the model picks the region.

const l2 = vi.hoisted(() => ({ gets: [] as string[], sets: [] as string[] }))
vi.mock('./serperCache', async (importOriginal) => {
  const m = await importOriginal<typeof import('./serperCache')>()
  return {
    ...m,
    serperCacheGetMeta: async (_e: string, q: string, ...rest: unknown[]) => { l2.gets.push(q); return (m.serperCacheGetMeta as (...a: unknown[]) => Promise<unknown>)(_e, q, ...rest) },
    serperCacheSet: async (_e: string, q: string, ...rest: unknown[]) => { l2.sets.push(q); return (m.serperCacheSet as (...a: unknown[]) => Promise<unknown>)(_e, q, ...rest) },
  }
})

type Body = { q: string; gl: string; hl: string; num: number }
let bodies: Body[]
let payload: Record<string, unknown>

beforeEach(() => {
  bodies = []
  payload = {
    organic: [
      { title: 'Giá vàng hôm nay', link: 'https://news.example/gia-vang', snippet: 'SJC 150 triệu', date: '2 giờ trước' },
      { title: 'Bài cũ', link: 'https://news.example/cu', snippet: 'không ngày' },
    ],
    answerBox: { title: 'Giá vàng SJC', answer: '150.000.000 đồng/lượng', link: 'https://sjc.example/gia', snippet: 'Cập nhật 10:00' },
    knowledgeGraph: { title: 'Vàng', type: 'Kim loại quý', description: 'Nguyên tố hóa học Au.', website: 'https://vi.wikipedia.org/wiki/V%C3%A0ng', attributes: { 'Số nguyên tử': '79', 'Ký hiệu': 'Au' } },
  }
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('serper.dev/search')) { bodies.push(JSON.parse(String(init?.body ?? '{}')) as Body); return new Response(JSON.stringify(payload), { status: 200 }) }
    return new Response('{}', { status: 404 })
  }))
  process.env.SERPER_API_KEY = 'test-key-not-a-real-secret'
})
afterEach(() => { vi.unstubAllGlobals() })

describe('the date of each result reaches the model', () => {
  it('a result that carries a date keeps it, one that does not has none', async () => {
    const out = await serperSearchEx('rich fields date case one')
    expect(out.rows?.[0]).toMatchObject({ title: 'Giá vàng hôm nay', date: '2 giờ trước' })
    expect(out.rows?.[1]).not.toHaveProperty('date')
  })
})

describe('answer box and knowledge graph reach the model (web_search result)', () => {
  it('compact, text only, under answer_box / knowledge_graph', async () => {
    const r = await webSearch('rich fields answerbox case one') as Record<string, any>
    expect(r.answer_box).toEqual({ title: 'Giá vàng SJC', answer: '150.000.000 đồng/lượng', link: 'https://sjc.example/gia', snippet: 'Cập nhật 10:00' })
    expect(r.knowledge_graph).toMatchObject({ title: 'Vàng', type: 'Kim loại quý', description: 'Nguyên tố hóa học Au.', attributes: { 'Số nguyên tử': '79', 'Ký hiệu': 'Au' } })
    expect(r.results).toHaveLength(2)
  })
  it('a result without them has neither key (nothing invented)', async () => {
    payload = { organic: [{ title: 'Chỉ organic', link: 'https://x.example/a', snippet: 's' }] }
    const r = await webSearch('rich fields no extras case') as Record<string, any>
    expect(r).not.toHaveProperty('answer_box')
    expect(r).not.toHaveProperty('knowledge_graph')
  })
  it('long text is cut and the attribute list is capped', async () => {
    payload = { organic: [{ title: 'T', link: 'https://x.example/b', snippet: 's' }], answerBox: { title: 'A', answer: 'x'.repeat(2000) }, knowledgeGraph: { title: 'K', description: 'd'.repeat(2000), attributes: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v'])) } }
    const r = await webSearch('rich fields long text case') as Record<string, any>
    expect(String(r.answer_box.answer).length).toBeLessThanOrEqual(400)
    expect(String(r.knowledge_graph.description).length).toBeLessThanOrEqual(400)
    expect(Object.keys(r.knowledge_graph.attributes).length).toBeLessThanOrEqual(8)
  })
  it('the extras survive the in-process cache of the same search', async () => {
    const a = await serperSearchEx('rich fields extras cache case')
    const b = await serperSearchEx('rich fields extras cache case')
    expect(bodies.length).toBe(1)
    expect(b.state).toBe('cache')
    expect(b.extras?.answer_box?.title).toBe(a.extras?.answer_box?.title)
  })
})

describe('the model chooses the country and the language of the search', () => {
  it('default: Vietnam / Vietnamese, exactly as before', async () => {
    await serperSearchEx('rich fields region default case')
    expect(bodies[0]).toMatchObject({ gl: 'vn', hl: 'vi' })
  })
  it('a two-letter country and language are sent', async () => {
    await serperSearchEx('rich fields region thai case', { gl: 'th', hl: 'th' })
    expect(bodies[0]).toMatchObject({ gl: 'th', hl: 'th' })
  })
  it('anything that is not two letters is ignored (the default stays)', async () => {
    for (const bad of ['xyz', 'V N', '', '1a', 'vn;drop', 'Việt']) {
      bodies = []
      await serperSearchEx(`rich fields region bad ${bad}`, { gl: bad, hl: bad })
      expect(bodies[0], bad).toMatchObject({ gl: 'vn', hl: 'vi' })
    }
  })
  it('upper case is folded', async () => {
    await serperSearchEx('rich fields region fold case', { gl: 'US', hl: 'EN' })
    expect(bodies[0]).toMatchObject({ gl: 'us', hl: 'en' })
  })
  it('the same query in two regions is two searches; the same region twice is one', async () => {
    await serperSearchEx('rich fields region cache case', { gl: 'us', hl: 'en' })
    await serperSearchEx('rich fields region cache case', { gl: 'us', hl: 'en' })
    expect(bodies.length).toBe(1)
    await serperSearchEx('rich fields region cache case')
    expect(bodies.length).toBe(2)
    expect(bodies[1]).toMatchObject({ gl: 'vn', hl: 'vi' })
  })
  it('the shared (L2) cache is keyed on the query alone, so only the default region reads or writes it', async () => {
    l2.gets.length = 0; l2.sets.length = 0
    await serperSearchEx('rich fields l2 other region case', { gl: 'th', hl: 'th' })
    expect(l2.gets).toEqual([])
    expect(l2.sets).toEqual([])
    await serperSearchEx('rich fields l2 default region case')
    expect(l2.gets).toEqual(['rich fields l2 default region case'])
    expect(l2.sets).toEqual(['rich fields l2 default region case'])
  })
  it('the default keys are unchanged (no suffix), a region adds one', () => {
    expect(serperSearchCacheKey('abc')).toBe(serperSearchCacheKey('abc', { gl: 'vn', hl: 'vi' }))
    expect(serperSearchCacheKey('abc', { gl: 'th', hl: 'th' })).not.toBe(serperSearchCacheKey('abc'))
    expect(webSearchCacheKey('abc', 'vi')).toBe(webSearchCacheKey('abc', 'vi', { gl: 'vn', hl: 'vi' }))
    expect(webSearchCacheKey('abc', 'vi', { gl: 'jp', hl: 'ja' })).not.toBe(webSearchCacheKey('abc', 'vi'))
  })
  it('webSearch passes the region through', async () => {
    await webSearch('rich fields websearch region case', 'vi', { gl: 'jp', hl: 'ja' })
    expect(bodies[0]).toMatchObject({ gl: 'jp', hl: 'ja' })
  })
})

describe('wiring', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('the web_search tool lets the model name a country and a language', () => {
    const src = read('src/app/api/chat/route.ts')
    expect(src).toContain('country: z.string().optional()')
    expect(src).toContain('language: z.string().optional()')
    expect(src).toContain('const searchRegion = oneBrain ? { gl: country, hl: language } : null')
    expect(src).toContain('searchRegion ? webSearch(query, lang, searchRegion) : webSearch(query, lang), travelEditorialFor(null)')
    expect(src).toContain('...(oneBrain ? {\n            country: z.string().optional()') // only the one-brain schema carries them
  })
  it('the new fields are source URLs, never action URLs', () => {
    const src = read('src/lib/ai/security/urlGrants.ts')
    expect(src).toContain("'answer_box.link': 'source'")
    expect(src).toContain("'knowledge_graph.website': 'source'")
  })
})
