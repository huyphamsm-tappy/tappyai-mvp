// RETRIEVAL_V5 as wired in a real runtime turn (index.ts + loop.ts): web_search / get_news run FIND → READ → GAP-FILL on the route's Serper
// search and Tappy's reader; OpenAI's hosted search is never called; the round after the research is the final one, with the V5 note; a
// specialised tool with nothing usable falls through to the research. AI.step is mocked; search, page fetch and gap check use their seams.
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
  return {
    ...m,
    // stepStream: the C2 streamed final round (C2_STREAM_DATASTREAM / C2_AGENT_STREAM) — the same scripted step, so the turn is identical with
    // or without the C2 flags (the measurement server runs with them)
    AI: { ...m.AI, step, stepStream: vi.fn(async (o: Record<string, any>) => step(o)), extract: vi.fn(async () => { throw new Error('no real model call in tests') }) },
  }
})

import { startAgentRuntimeTurn } from './index'
import { AgentRunTrace } from './trace'
import { __resetPageCache } from './readPage'
import type { TurnUnderstanding } from '@/lib/ai/answerV4/understand'
import type { GapCheckFn } from '@/lib/ai/retrievalV5/gapCheck'

const FLAGS = ['C2_TOOL_GATE', 'C2_ROUND_CAP', 'TAPPY_ANSWER_V4', 'CONSULT_V3', 'CONSULTATIVE_IN_AGENT', 'TAPPY_AGENT', 'RETRIEVAL_V5']
beforeEach(() => { H.calls.length = 0; H.script.length = 0; for (const k of FLAGS) delete process.env[k] })
afterEach(() => { __resetPageCache(); vi.restoreAllMocks(); for (const k of FLAGS) delete process.env[k] })

const U = (): TurnUnderstanding => ({ reply_language: 'vi', intent: 'lookup' as never, needs_fresh_data: true, wants_figures: true, sensitivity: 'none', answer_shape: 'list', item_kind: 'other', entities: [] })
const PAGE = '<html><head><title>Giờ tàu</title></head><body><table><tr><th>Tàu</th><th>Đi</th><th>Đến</th></tr><tr><td>SE10</td><td>08:59</td><td>12:15</td></tr><tr><td>SE4</td><td>12:28</td><td>15:10</td></tr></table><p>Giá vé từ 77.000 đồng, mua tại dsvn.vn.</p></body></html>'

async function turn(o: { v5?: boolean; v4?: boolean; transportEmpty?: boolean; gap?: GapCheckFn; fresh?: boolean } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const serper: string[] = []
  const hosted: string[] = []
  const fetched: string[] = []
  const gaps: number[] = []
  const r = startAgentRuntimeTurn({
    routeTools: {
      web_search: { description: 'web', parameters: undefined, execute: async (a: { query?: string }) => { serper.push(String(a.query)); return { results: [{ title: 'Lịch tàu Đà Nẵng Huế', link: 'https://dsvn.vn/lich', snippet: 's' }, { title: 'Vé tàu', link: 'https://vexere.com/tau', snippet: 's' }] } } },
      get_news: { description: 'news', parameters: undefined, execute: async () => ({ articles: [] }) },
      get_transport_options: { description: 'transport', parameters: undefined, execute: async () => (o.transportEmpty ? { type: 'intercity', bus_search_results: [{ title: 'xe' }], train_search_results: [], vexere_link: 'https://vexere.com/x' } : { type: 'intercity', train_search_results: [{ title: 'SE10' }] }) },
    },
    promptVersion: 'consult_v3', consultative: true, answerV4: o.v4 ?? true, retrievalV5: o.v5 ?? true,
    understandExtract: async () => ({ ...U(), needs_fresh_data: o.fresh ?? true }),
    docMediaDeps: { wiki: async () => null, webImages: async () => [] },
    hostedSearch: true, hostedSearchFn: async (x: { input: string }) => { hosted.push(x.input); return { text: 'x', sources: [], searches: 1, usd: 0.01, incomplete: null } },
    gapCheckFn: o.gap ?? (async () => { gaps.push(1); return { result: { aspects: [{ aspect: 'giờ tàu', covered: true, sources: ['S1'] }], missing: [] }, usd: 0.0002 } }),
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: 'Tàu Đà Nẵng đi Huế ngày mai mấy giờ?' }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: (q: string) => ({ query: q, cut: [] }), trace,
    research: { fetchPage: async (u: string) => { fetched.push(u); return { ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: PAGE, bytes: PAGE.length, truncated: false, redirects: 0, ms: 1 } as never } },
  } as never)
  const body = await r.toDataStreamResponse().text()
  const scripted = H.calls.filter(c => c.maxTokens !== 700)
  return { trace, serper, hosted, fetched, gaps, scripted, body }
}

describe('RETRIEVAL_V5 in a runtime turn', () => {
  it('web_search = Serper search + pages read + gap check; OpenAI hosted search never called; the next round writes once with the V5 note', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['giờ tàu Đà Nẵng Huế ngày mai'] }]] }, { text: 'SE10 08:59 → 12:15 [S1].' })
    const t = await turn()
    expect(t.hosted).toEqual([])
    // two variants (sửa đổi 4): the model's query + the user's own question
    expect(t.serper).toEqual(['giờ tàu Đà Nẵng Huế ngày mai', 'Tàu Đà Nẵng đi Huế ngày mai mấy giờ?'])
    expect(t.fetched).toEqual(expect.arrayContaining(['https://dsvn.vn/lich', 'https://vexere.com/tau']))
    expect(t.gaps).toHaveLength(1)
    expect(t.scripted).toHaveLength(2)
    expect(t.scripted[1].tools).toBeUndefined()
    expect(String(t.scripted[1].system)).toContain('VIẾT CÂU TRẢ LỜI NGAY')
    expect(String(t.scripted[1].system)).not.toContain('đã dùng hết số lần tra cứu')
    expect(JSON.stringify(t.scripted[1].messages)).toContain('08:59')
    expect(t.trace.events.some(e => (e as Record<string, unknown>).decision === 'v5_research')).toBe(true)
  })
  it('a transport search with no train in it falls through to the research (u26), and the final round follows', async () => {
    H.script.push({ text: '', calls: [['get_transport_options', { mode: 'train', origin: 'Đà Nẵng', destination: 'Huế' }]] }, { text: 'Đáp [S1].' })
    const t = await turn({ transportEmpty: true })
    expect(t.serper).toHaveLength(1)
    expect(t.fetched.length).toBeGreaterThan(0)
    expect(t.scripted[1].tools).toBeUndefined()
    expect(t.trace.events.some(e => (e as Record<string, unknown>).fallback === 'v5_research')).toBe(true)
    // the research reaches the stream as a web_search frame (its URLs are granted as source links)
    expect(t.body).toContain('"toolName":"web_search"')
  })
  it('a transport search WITH trains is used as it is (no web research)', async () => {
    H.script.push({ text: '', calls: [['get_transport_options', { mode: 'train', origin: 'Đà Nẵng', destination: 'Huế' }]] }, { text: 'Đáp.' })
    const t = await turn({ transportEmpty: false })
    expect(t.serper).toEqual([])
  })
  it('get_news is served by the V5 research too (Serper + pages + gap check), never the hosted search', async () => {
    H.script.push({ text: '', calls: [['get_news', { query: 'tàu Đà Nẵng Huế mới nhất' }]] }, { text: 'Đáp [S1].' })
    const t = await turn()
    expect(t.hosted).toEqual([])
    expect(t.serper).toEqual(['tàu Đà Nẵng Huế mới nhất', 'Tàu Đà Nẵng đi Huế ngày mai mấy giờ?'])
    expect(t.gaps).toHaveLength(1)
    expect(t.scripted[1].tools).toBeUndefined()
  })
  it('needs current facts (understanding) but the model answered without a lookup (u29) → the V5 research runs on the user\'s question', async () => {
    H.script.push({ text: 'Bạn muốn hỏi ở nước nào?' }, { text: 'SE10 08:59 [S1].' })
    const t = await turn()
    expect(t.serper[0]).toBe('Tàu Đà Nẵng đi Huế ngày mai mấy giờ?')
    expect(t.gaps).toHaveLength(1)
    expect(t.trace.events.some(e => (e as Record<string, unknown>).decision === 'forced_lookup')).toBe(true)
  })
  it('no current facts needed: a direct answer stands, nothing is searched', async () => {
    H.script.push({ text: 'Chào bạn!' })
    const t = await turn({ fresh: false })
    expect(t.serper).toEqual([])
  })
  it('a tool call written as text in the final round never reaches the reply (u28)', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: '{"queries":["x"]}\nto=functions.web_search 代' }, { text: 'Câu trả lời sạch [S1].' })
    const t = await turn()
    expect(t.body).not.toContain('to=functions')
    expect(t.body).toContain('Câu trả lời sạch')
  })
  it('V5 needs V4: with V4 off the flag does nothing (no gap check, no V5 research)', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp.' })
    const t = await turn({ v4: false })
    expect(t.gaps).toEqual([])
    expect(t.trace.events.some(e => (e as Record<string, unknown>).decision === 'v5_research')).toBe(false)
  })
  it('V5 off: the V4 hosted search serves web_search as before (Serper not used)', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['q'] }]] }, { text: 'Đáp.' })
    const t = await turn({ v5: false })
    expect(t.hosted).toHaveLength(1)
    expect(t.serper).toEqual([])
    expect(t.gaps).toEqual([])
  })
})
