// RETRIEVAL_V5 lần 2c (owner 20/10, "chốt code V5"): the old V4 tests that go red under RETRIEVAL_V5=1 protect properties of the hosted search
// path that V5 replaces. Their own expectations are NOT changed; this file checks, for each of them, that the user-facing property they protect
// still holds on the V5 path (or does not exist on it). No network: search, page fetch, gap check and understanding use their seams.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({
  calls: [] as Array<Record<string, any>>,
  script: [] as Array<{ text: string; calls?: Array<[string, Record<string, unknown>]> }>,
}))
vi.mock('@/lib/ai/llm', async orig => {
  const m = await orig<typeof import('@/lib/ai/llm')>()
  const step = vi.fn(async (o: Record<string, any>) => {
    H.calls.push(o)
    const s = o.maxTokens === 700 ? { text: '' } : H.script.shift() ?? { text: 'Mặc định.' }
    return {
      text: s.text, finishReason: s.calls?.length ? 'tool-calls' : 'stop',
      toolCalls: (s.calls ?? []).map(([toolName, args], k) => ({ toolCallId: `t${H.calls.length}_${k}`, toolName, args })),
      usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0 } } }, response: { modelId: 'mock' },
    }
  })
  return { ...m, AI: { ...m.AI, step, stepStream: vi.fn(async (o: Record<string, any>) => step(o)), extract: vi.fn(async () => { throw new Error('no real model call in tests') }) } }
})

import { startAgentRuntimeTurn } from './index'
import { AgentRunTrace } from './trace'
import { __resetPageCache } from './readPage'
import { RUNTIME_LIMITS } from './limits'
import { V5_TOOL_TIMEOUT_MS, V5_LIMITS } from '@/lib/ai/retrievalV5/research'
import type { TurnUnderstanding } from '@/lib/ai/answerV4/understand'

const FLAGS = ['C2_TOOL_GATE', 'C2_ROUND_CAP', 'TAPPY_ANSWER_V4', 'CONSULT_V3', 'CONSULTATIVE_IN_AGENT', 'TAPPY_AGENT', 'RETRIEVAL_V5']
beforeEach(() => { H.calls.length = 0; H.script.length = 0; for (const k of FLAGS) delete process.env[k] })
afterEach(() => { __resetPageCache(); vi.restoreAllMocks(); for (const k of FLAGS) delete process.env[k] })

const U = (o: Partial<TurnUnderstanding> = {}): TurnUnderstanding => ({ reply_language: 'vi', intent: 'lookup' as never, needs_fresh_data: true, wants_figures: true, sensitivity: 'none', answer_shape: 'list', item_kind: 'other', entities: [], ...o })
const PAGE = '<html><head><title>Giờ tàu</title></head><body><main><table><tr><th>Tàu</th><th>Đi</th><th>Đến</th></tr><tr><td>SE10</td><td>08:59</td><td>12:15</td></tr></table><p>Giá vé từ 77.000 đồng, mua vé trực tuyến tại trang của Đường sắt Việt Nam.</p></main></body></html>'

async function turn(userText: string, o: { understand?: () => Promise<TurnUnderstanding> } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const serper: string[] = [], rss: string[] = [], hosted: string[] = []
  const signals: unknown[] = []
  const r = startAgentRuntimeTurn({
    routeTools: {
      web_search: { description: 'web', parameters: undefined, execute: async (a: { query?: string }, ctx?: { abortSignal?: AbortSignal }) => { serper.push(String(a.query)); signals.push(ctx?.abortSignal); return { results: [{ title: 'Lịch tàu', link: 'https://dsvn.vn/lich', snippet: 's' }] } } },
      get_news: { description: 'news', parameters: undefined, execute: async () => { rss.push('get_news'); return { articles: [{ title: 'Bài RSS không liên quan', url: 'https://vnexpress.net/x.html', summary: 's', source: 'VnExpress' }] } } },
    },
    promptVersion: 'consult_v3', consultative: true, answerV4: true, retrievalV5: true,
    understandExtract: o.understand ?? (async () => U()),
    docMediaDeps: { wiki: async () => null, webImages: async () => [] },
    hostedSearch: true, hostedSearchFn: async (x: { input: string }) => { hosted.push(x.input); return { text: 'x', sources: [], searches: 1, usd: 0.01, incomplete: null } },
    gapCheckFn: async () => ({ result: { aspects: [{ aspect: 'giờ tàu', covered: true, sources: ['S1'] }], missing: [] }, usd: 0.0002 }),
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: userText }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: (q: string) => ({ query: q, cut: [] }), trace,
    research: { fetchPage: async (u: string) => ({ ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: PAGE, bytes: PAGE.length, truncated: false, redirects: 0, ms: 1 }) as never },
  } as never)
  const body = await r.toDataStreamResponse().text()
  const scripted = H.calls.filter(c => c.maxTokens !== 700)
  return { trace, serper, rss, hosted, signals, scripted, body }
}

describe('V5 parity with the V4 hosted-search tests (answerV4.runtime.test.ts "V4 lookup engine")', () => {
  it('[≙ "the model\'s web_search reaches the hosted search…"] the model\'s query reaches the search; the model gets the page facts, a [S#] id and the source URL', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['giờ tàu Đà Nẵng Huế ngày mai'] }]] }, { text: 'SE10 khởi hành 08:59 [S1].' })
    const t = await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?')
    expect(t.serper[0]).toBe('giờ tàu Đà Nẵng Huế ngày mai')
    expect(t.hosted).toEqual([])
    const toolMsg = JSON.stringify(t.scripted[1]?.messages ?? [])
    expect(toolMsg).toContain('SE10 | 08:59 | 12:15')
    expect(toolMsg).toContain('https://dsvn.vn/lich')
    expect(toolMsg).toMatch(/\[S1\]/)
  })
  it('[≙ "the reply language … reaches the hosted search"] V5 has no model-written brief: the only model calls are the turn\'s own rounds (no intermediate text in another language can be written)', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['small business loan rates'] }]] }, { text: 'Rates [S1].' })
    const t = await turn('Best small-business loan rates today?', { understand: async () => U({ reply_language: 'en' }) })
    expect(t.hosted).toEqual([])
    // round 1 (asks for the search) and the final round: nothing else was asked of the model (the gap check is the seam above, JSON only)
    expect(t.scripted).toHaveLength(2)
    // the tool result is page DATA + Tappy's fixed note, not a model summary
    expect(JSON.stringify(t.scripted[1]?.messages ?? [])).toContain('SE10 | 08:59 | 12:15')
  })
  it('[≙ "a failed understanding: the search runs at once"] the V5 search does not wait for a failed understanding', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp [S1].' })
    const t0 = Date.now()
    const t = await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?', { understand: async () => { throw new Error('model down') } })
    expect(t.serper.length).toBeGreaterThan(0)
    expect(Date.now() - t0).toBeLessThan(2_500)
  })
  it('[≙ "the hosted search runs on its own time budget … and receives the cancellation signal"] V5 lookups have their own budget (≥ 2 × the tool default) and the search receives the abort signal', async () => {
    expect(V5_TOOL_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * RUNTIME_LIMITS.toolTimeoutMs)
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp [S1].' })
    const t = await turn('Lãi suất vay doanh nghiệp nhỏ hôm nay?')
    expect(t.signals.length).toBeGreaterThan(0)
    for (const s of t.signals) expect(s).toBeInstanceOf(AbortSignal)
  })
  it('[≙ "a news request (get_news) is served by the hosted search too — the RSS matcher never runs"] under V5 the RSS matcher never runs either; the unrelated RSS item never reaches the model', async () => {
    H.script.push({ text: '', calls: [['get_news', { query: 'Cần Thơ tin nóng' }]] }, { text: 'Đáp.' })
    const t = await turn('Ở Cần Thơ mới có vụ chi nóng chi rứa?')
    expect(t.rss).toEqual([])
    expect(t.hosted).toEqual([])
    expect(JSON.stringify(t.scripted[1]?.messages ?? [])).not.toContain('Bài RSS không liên quan')
  })
  it('[≙ "switch off (or V3): the former web search runs, the hosted search is never called"] under V5 the Serper search runs (2 variants, ≤ the 3-search cap) and the hosted search is never called', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp.' })
    const t = await turn('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?')
    expect(t.serper).toEqual(['q', 'Tàu Đà Nẵng đi Huế ngày mai mấy giờ?'])
    expect(t.serper.length).toBeLessThanOrEqual(V5_LIMITS.serperSearches)
    expect(t.hosted).toEqual([])
  })
})
