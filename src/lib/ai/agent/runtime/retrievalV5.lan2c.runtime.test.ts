// RETRIEVAL_V5 lần 2c (B1) as wired in a runtime turn (index.ts): the understanding's geographic context and reply language reach the research
// (the region on the second variant) and the final note — and a foreign place is never re-aimed. AI.step mocked; search / pages / gap seams.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({
  calls: [] as Array<Record<string, any>>,
  script: [] as Array<{ text: string; calls?: Array<[string, Record<string, unknown>]> }>,
}))
vi.mock('@/lib/ai/llm', async orig => {
  const m = await orig<typeof import('@/lib/ai/llm')>()
  const step = vi.fn(async (o: Record<string, any>) => {
    H.calls.push(o)
    const s = o.maxTokens === 700 ? { text: '' } : H.script.shift() ?? { text: 'Default.' }
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
import type { TurnUnderstanding } from '@/lib/ai/answerV4/understand'

const FLAGS = ['C2_TOOL_GATE', 'C2_ROUND_CAP', 'TAPPY_ANSWER_V4', 'CONSULT_V3', 'CONSULTATIVE_IN_AGENT', 'TAPPY_AGENT', 'RETRIEVAL_V5']
beforeEach(() => { H.calls.length = 0; H.script.length = 0; for (const k of FLAGS) delete process.env[k] })
afterEach(() => { __resetPageCache(); vi.restoreAllMocks(); for (const k of FLAGS) delete process.env[k] })

// every page states a different rate for the same focus (the u22 / u09 shape: page-level numbers that are not about one named subject)
let pageNo = 0
const PAGE = () => {
  pageNo++
  const s = pageNo % 2 ? 'Thực hiện Nghị quyết số 57-NQ/TW ngày 22/12/2024 về vụ việc ở Cần Thơ mới nhất. ' : 'Vụ việc ở Cần Thơ mới nhất: hai công ty chi hơn 2,6 tỉ đồng cho các đoàn đi nước ngoài. '
  return '<main><p>' + s.repeat(8) + '</p></main>'
}
const conflicts = (trace: AgentRunTrace) => (trace.events as unknown as Array<Record<string, unknown>>).filter(e => e.kind === 'evidence' && typeof e.conflict === 'number').reduce((n, e) => n + (e.conflict as number), 0)
async function turn(userText: string, u: Partial<TurnUnderstanding>, o: { v5?: boolean } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const serper: string[] = []
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const r = startAgentRuntimeTurn({
    routeTools: { web_search: { description: 'web', parameters: undefined, execute: async (a: { query?: string }) => { serper.push(String(a.query)); return { results: [{ title: 'r', link: `https://bank${serper.length}.example/a`, snippet: 's' }, { title: 'r2', link: `https://other${serper.length}.example/b`, snippet: 's' }] } } } },
    promptVersion: 'consult_v3', consultative: true, answerV4: true, retrievalV5: o.v5 ?? true,
    understandExtract: async () => ({ reply_language: 'en', intent: 'lookup' as never, needs_fresh_data: true, wants_figures: true, sensitivity: 'none', answer_shape: 'list', item_kind: 'other', entities: [], ...u }),
    docMediaDeps: { wiki: async () => null, webImages: async () => [] },
    hostedSearch: false,
    gapCheckFn: async () => ({ result: { aspects: [], missing: [] }, usd: 0 }),
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: userText }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: (q: string) => ({ query: q, cut: [] }),
    trace,
    research: { fetchPage: async (x: string) => { const body = PAGE(); return { ok: true, url: x, finalUrl: x, status: 200, contentType: 'text/html', body, bytes: body.length, truncated: false, redirects: 0, ms: 1 } as never } },
  } as never)
  await r.toDataStreamResponse().text()
  const scripted = H.calls.filter(c => c.maxTokens !== 700)
  return { serper, finalSystem: String(scripted[scripted.length - 1]?.system ?? ''), trace }
}

describe('RETRIEVAL_V5 lần 2c · geography and reply language in a runtime turn', () => {
  it('an English question naming no place (u29 shape): one variant aimed at Việt Nam; the final note says so AND keeps English', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['small business loan rates US'] }]] }, { text: 'Rates [S1].' })
    const t = await turn('Best small-business loan rates today?', {})
    expect(t.serper[0]).toBe('small business loan rates US')
    expect(t.serper[1]).toMatch(/Việt Nam$/)
    expect(t.finalSystem).toContain('trả lời theo Việt Nam')
    expect(t.finalSystem).toContain('(en)')
  })
  it('B3 · the V5 turn\'s ledger pairs no page-level numbers into conflicts; the V4 turn (read_page) still does (unchanged)', async () => {
    const ask = 'Ở Cần Thơ mới có vụ chi nóng?'
    H.script.push({ text: '', calls: [['web_search', { queries: ['Cần Thơ vụ việc mới nhất'] }]] }, { text: 'Vụ việc [S1].' })
    pageNo = 0
    const v5 = await turn(ask, { reply_language: 'vi', entities: [{ name: 'Cần Thơ', type: 'place', wiki_title: null }] as never })
    expect(conflicts(v5.trace)).toBe(0)
    H.calls.length = 0
    pageNo = 0
    H.script.push(
      { text: '', calls: [['web_search', { queries: ['Cần Thơ vụ việc mới nhất'] }]] },
      { text: '', calls: [['read_page', { urls: ['https://bank1.example/a', 'https://other1.example/b'], focus: ask, kind: 'other' }]] },
      { text: 'Vụ việc [S1].' },
    )
    const v4 = await turn(ask, { reply_language: 'vi' }, { v5: false })
    expect(conflicts(v4.trace)).toBeGreaterThan(0)
  })
  it('a foreign place (Boston): no region, no geographic note; the reply language line stays', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['Boston weather today'] }]] }, { text: 'Weather [S1].' })
    const t = await turn('Weather in Boston today?', { entities: [{ name: 'Boston', type: 'place', wiki_title: null }] as never })
    expect(t.serper.some(q => /Việt Nam/.test(q))).toBe(false)
    expect(t.finalSystem).not.toContain('trả lời theo Việt Nam')
    expect(t.finalSystem).toContain('(en)')
  })
})
