// 01/11 (owner UAT: a history answer linked AIHAY, a competing AI product, as a reference; "nghiêm cấm không được sử dụng nguồn của bất cứ AI nào").
// Policy on SOURCES (the page's own address), never on what the person typed: pages written by another AI product's chat or answer engine are
// neither read nor cited. A company's own site (its blog, its announcements) is a primary source and stays.
import { describe, it, expect } from 'vitest'
import { isAiProductSource, withoutAiSources, wrapToolsWithoutAiSources } from './aiSourcePolicy'

describe('isAiProductSource', () => {
  it('is true for the AI products\' answer and chat pages, on the domain or any subdomain, with or without www', () => {
    for (const u of [
      'https://aihay.vn/hoi-dap/quang-trung', 'https://www.aihay.vn/x', 'https://chat.aihay.vn/c/1', 'https://aihay.net/a', 'https://aihay.com/a',
      'https://chatgpt.com/share/abc', 'https://chat.openai.com/share/abc', 'https://www.perplexity.ai/search/x', 'https://gemini.google.com/share/x',
      'https://claude.ai/share/x', 'https://copilot.microsoft.com/shares/x', 'https://poe.com/s/x', 'https://grok.com/share/x', 'https://chat.deepseek.com/a',
      'https://you.com/search?q=x', 'https://www.phind.com/search?q=x', 'https://meta.ai/p/x', 'https://character.ai/chat/x', 'https://chat.mistral.ai/chat',
    ]) expect(isAiProductSource(u), u).toBe(true)
  })
  it('is false for ordinary sources, for a company\'s own site, for look-alike hosts and for what is not a URL', () => {
    for (const u of [
      'https://vi.wikipedia.org/wiki/Quang_Trung', 'https://vnexpress.net/x', 'https://openai.com/index/x', 'https://www.anthropic.com/news/x', 'https://google.com/search?q=x',
      'https://notaihay.vn/x', 'https://aihay.vn.evil.example/x', 'https://example.com/?u=https://aihay.vn', 'javascript:alert(1)', 'not a url', '',
    ]) expect(isAiProductSource(u), u).toBe(false)
  })
})

describe('AIHAY: its site (ai-hay.vn) and its app, owner 01/11', () => {
  it('blocks ai-hay.vn on any subdomain', () => {
    for (const u of ['https://ai-hay.vn/', 'https://www.ai-hay.vn/hoi-dap/1', 'https://app.ai-hay.vn/c/2']) expect(isAiProductSource(u), u).toBe(true)
  })
  it('blocks its app\'s store pages (the store host alone is not a reason: the page must be AIHAY\'s)', () => {
    for (const u of [
      'https://play.google.com/store/apps/details?id=vn.aihay.app', 'https://play.google.com/store/apps/details?id=vn.ai_hay.app&hl=vi',
      'https://apps.apple.com/vn/app/aihay/id1234567', 'https://apps.apple.com/vn/app/ai-hay-tro-ly-ai/id1234567',
    ]) expect(isAiProductSource(u), u).toBe(true)
    for (const u of ['https://play.google.com/store/apps/details?id=com.zing.zalo', 'https://apps.apple.com/vn/app/zalo/id579523206', 'https://vnexpress.net/ai-hay-nhat-2026-123.html']) expect(isAiProductSource(u), u).toBe(false)
  })
  it('drops a store row whose address does not say it but whose title does', () => {
    const rows = [
      { title: 'AIHAY - Trợ lý AI - Ứng dụng trên Google Play', link: 'https://play.google.com/store/apps/details?id=com.x.y1' },
      { title: 'Zalo - Ứng dụng trên Google Play', link: 'https://play.google.com/store/apps/details?id=com.zing.zalo' },
    ]
    expect(withoutAiSources({ results: rows }).value).toEqual({ results: [rows[1]] })
  })
})

describe('review 01/11: forms of an address that used to get past', () => {
  it('a scheme-less address, a protocol-relative one and a displayed link are read as what they say', () => {
    for (const u of ['chatgpt.com/share/x', 'aihay.vn/hoi-dap/1', '//ai-hay.vn/x', 'www.perplexity.ai/search/q']) expect(isAiProductSource(u), u).toBe(true)
    expect(isAiProductSource('vnexpress.net/the-gioi')).toBe(false)
    expect(isAiProductSource('not a url at all')).toBe(false)
  })
  it('redirectors, archives and readers around an AI page are unwrapped', () => {
    for (const u of [
      'https://www.google.com/url?q=https://chatgpt.com/share/x&sa=U', 'https://www.google.com/url?sa=t&url=https%3A%2F%2Faihay.vn%2Fa',
      'https://r.jina.ai/https://claude.ai/share/x', 'https://web.archive.org/web/20261001000000/https://ai-hay.vn/a', 'https://webcache.googleusercontent.com/search?q=cache:https://perplexity.ai/x',
    ]) expect(isAiProductSource(u), u).toBe(true)
    for (const u of ['https://www.google.com/url?q=https://vnexpress.net/x', 'https://web.archive.org/web/2026/https://vnexpress.net/', 'https://www.google.com/search?q=aihay', 'https://example.com/?u=https://aihay.vn']) expect(isAiProductSource(u), u).toBe(false)
  })
  it('more of the product family: other TLDs of AIHAY, AI Studio, DuckDuckGo AI, Bing chat, Hugging Face chat', () => {
    for (const u of ['https://aihay.ai/x', 'https://aihay.org/x', 'https://aihay.app/x', 'https://ai-hay.com/x', 'https://aistudio.google.com/prompts/x', 'https://duck.ai/chat', 'https://www.bing.com/chat?q=x', 'https://huggingface.co/chat/conversation/x']) expect(isAiProductSource(u), u).toBe(true)
    for (const u of ['https://www.bing.com/search?q=x', 'https://huggingface.co/docs/transformers', 'https://x.ai/news/grok']) expect(isAiProductSource(u), u).toBe(false)
  })
  it('a malformed percent escape does not switch the store-page block off', () => {
    expect(isAiProductSource('https://play.google.com/store/apps/details?id=vn.aihay&hl=%E0%A4%A')).toBe(true)
  })
  it('the other link keys are read too (href, sourceUrl, pageUrl, canonical, displayedLink, site)', () => {
    for (const k of ['href', 'sourceUrl', 'source_url', 'pageUrl', 'canonical', 'displayedLink', 'site', 'uri']) {
      expect(withoutAiSources({ results: [{ title: 't', [k]: 'https://aihay.vn/a' }, { title: 'ok', [k]: 'https://vnexpress.net/a' }] }).value, k).toEqual({ results: [{ title: 'ok', [k]: 'https://vnexpress.net/a' }] })
    }
    expect(withoutAiSources({ results: [{ title: 't', displayedLink: 'aihay.vn › hoi-dap › 1' }] }).value).toEqual({ results: [] })
  })
  it('a single object (a Serper answer box, a knowledge graph) and a top-level page result are checked too, not only array rows', () => {
    const r = withoutAiSources({ answerBox: { title: 'a', link: 'https://chatgpt.com/share/x' }, knowledgeGraph: { title: 'k', website: 'https://aihay.vn/a' }, organic: [{ title: 'ok', link: 'https://vnexpress.net/a' }] })
    expect(r.value).toEqual({ organic: [{ title: 'ok', link: 'https://vnexpress.net/a' }] })
    expect(r.dropped).toBe(2)
    const top = withoutAiSources({ url: 'https://claude.ai/share/x', content: 'text' })
    expect((top.value as { error?: string }).error).toBe('source_not_allowed')
    expect(top.dropped).toBe(1)
  })
})

describe('withoutAiSources', () => {
  const rows = [
    { title: 'Wiki', link: 'https://vi.wikipedia.org/wiki/Quang_Trung', snippet: 'a' },
    { title: 'AIHAY', link: 'https://aihay.vn/hoi-dap/1', snippet: 'b' },
    { title: 'Báo', url: 'https://vnexpress.net/x', text: 'c' },
    { title: 'Chat', url: 'https://chatgpt.com/share/1', text: 'd' },
  ]
  it('drops the rows whose address is an AI product, at any depth, and says how many', () => {
    const input = { results: rows, extras: { related: [{ title: 'r', link: 'https://perplexity.ai/x' }, { title: 's', link: 'https://example.org/s' }] }, note: 'kept' }
    const out = withoutAiSources(input)
    expect(out.value).toEqual({ results: [rows[0], rows[2]], extras: { related: [{ title: 's', link: 'https://example.org/s' }] }, note: 'kept' })
    expect(out.dropped).toBe(3)
    expect(input.results).toHaveLength(4) // the input is not changed
  })
  it('leaves a result with nothing to drop as it was', () => {
    const input = { results: [rows[0]], n: 1 }
    const out = withoutAiSources(input)
    expect(out.value).toEqual(input)
    expect(out.dropped).toBe(0)
  })
})

describe('wrapToolsWithoutAiSources', () => {
  const call = (t: unknown, a: unknown) => (t as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(a, {})
  it('filters what a tool returns before anything else sees it', async () => {
    const tools = { web_search: { execute: async () => ({ results: [{ title: 'x', link: 'https://aihay.vn/a' }, { title: 'y', link: 'https://vnexpress.net/b' }] }) } }
    wrapToolsWithoutAiSources(tools as never)
    expect(await call(tools.web_search, { query: 'q' })).toEqual({ results: [{ title: 'y', link: 'https://vnexpress.net/b' }] })
  })
  it('never reads a page that is an AI product: those urls are removed from the call, and a call left with none is refused', async () => {
    const seen: unknown[] = []
    const tools = { read_page: { execute: async (a: unknown) => { seen.push(a); return { pages: [] } } } }
    wrapToolsWithoutAiSources(tools as never)
    await call(tools.read_page, { urls: ['https://aihay.vn/a', 'https://vnexpress.net/b'], focus: 'f' })
    expect(seen[0]).toEqual({ urls: ['https://vnexpress.net/b'], focus: 'f' })
    const refused = await call(tools.read_page, { urls: ['https://chatgpt.com/share/1'] }) as { error?: string }
    expect(refused.error).toBe('source_not_allowed')
    expect(seen).toHaveLength(1) // the reader was not called the second time
  })
  it('leaves a tool without execute alone', () => {
    const tools = { think: { description: 'x' } }
    expect(() => wrapToolsWithoutAiSources(tools as never)).not.toThrow()
  })
})
