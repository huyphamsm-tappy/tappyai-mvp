// C2 P2 — the research-loop guarantees with the C2 flags ON (the flag-on twins of researchLoop.test.ts, which keeps testing the default).
// Under C2_ROUND_CAP an ordinary turn gets ONE lookup round, a plan turn up to three — so the multi-round scripts run on a plan turn; the
// guarantees themselves (no crawl chain, ≤ 4 page reads, a tool-less final answer) must hold exactly as before. Model and pages are scripted.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { startAgentRuntimeTurn } from './index'
import { AgentRunTrace } from './trace'
import { __resetPageCache } from './readPage'
import type { RuntimeStep } from './loop'
import type { PageFetchResult } from '@/lib/security/safePageFetch'

const ON: Record<string, string> = { C2_ROUND_CAP: '1', C2_TOOL_GATE: '1', C2_BATCH_NOTE: '1', C2_LENGTH_RECOVERY: '1', C2_PROGRESS: '1', C2_STREAM_DATASTREAM: '1', C2_REQUEST_BUDGET: '1' }
beforeEach(() => { for (const [k, v] of Object.entries(ON)) process.env[k] = v })
afterEach(() => { __resetPageCache(); vi.restoreAllMocks(); for (const k of Object.keys(ON)) delete process.env[k] })

const APPLE = 'https://www.apple.com/airpods-pro/specs/'
const html = (title: string, body: string) => `<html><head><title>${title}</title></head><body><main><p>${body}</p><p>${'Thông tin thêm về sản phẩm và cách dùng hằng ngày. '.repeat(12)}</p></main></body></html>`
const PAGES: Record<string, string> = { [APPLE]: html('AirPods Pro 2 - Tech Specs - Apple', `Up to 6 hours of listening time. See also <a href="https://deep-link.example/hidden">this</a>.`) }
const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({ text, finishReason: 'stop', toolCalls: calls.map(([toolName, args], k) => ({ toolCallId: `c${Math.random().toString(36).slice(2)}${k}`, toolName, args })) })
const page = (u: string): PageFetchResult => PAGES[u] ? { ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: PAGES[u], bytes: PAGES[u].length, truncated: false, redirects: 0, ms: 3 } : { ok: false, url: u, reason: 'http_error', status: 404, redirects: 0, ms: 3 }
const results = (...links: string[]) => ({ results: links.map((link, k) => ({ title: `kết quả ${k + 1}`, link, snippet: 'đoạn trích' })) })
const PLAN_Q = 'Lên lịch trình 3 ngày đi Đà Lạt, tra giúp mình thông tin'

function turn(script: RuntimeStep[], o: { userText?: string; searches?: Array<Record<string, unknown>> } = {}) {
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const finals: boolean[] = []
  const searches = [...(o.searches ?? [])]
  const fetchPage = vi.fn(async (u: string) => page(u))
  const r = startAgentRuntimeTurn({
    routeTools: { web_search: { description: 'web', parameters: undefined, execute: async () => searches.shift() ?? { results: [] } } },
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: o.userText ?? PLAN_Q }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: (q: string) => ({ query: q, cut: [] }), trace,
    research: { fetchPage },
    callModel: async (x: { final: boolean }) => { finals.push(x.final); return script.shift() ?? step('Xong.') },
  } as never)
  return { trace, fetchPage, finals, text: async () => { vi.spyOn(console, 'log').mockImplementation(() => {}); const b = await r.toDataStreamResponse().text(); return b.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('') } }
}

describe('research guarantees with every C2 flag on', () => {
  it('no crawl chain: a link found INSIDE a read page cannot be opened (plan turn: three lookup rounds allowed)', async () => {
    const t = turn([step('', [['web_search', { queries: ['x'] }]]), step('', [['read_page', { urls: [APPLE], focus: 'battery' }]]), step('', [['read_page', { urls: ['https://deep-link.example/hidden'], focus: 'x' }]]), step('ok')], { searches: [results(APPLE)] })
    await t.text()
    expect(t.fetchPage).toHaveBeenCalledTimes(1)
    expect(t.trace.events.find(e => e.kind === 'page_read' && e.status === 'refused_not_from_results')).toBeTruthy()
  })
  it('budgets hold: ≤ 4 page reads, then the tool-less final answer', async () => {
    const urls = Array.from({ length: 6 }, (_, k) => `https://site${k}.example/p`)
    for (const u of urls) PAGES[u] = html(`Trang ${u}`, 'Một trang bất kỳ với nội dung đủ dài để đọc được ở đây.')
    const t = turn([step('', [['web_search', { queries: ['x'] }]]), step('', [['read_page', { urls: urls.slice(0, 3), focus: 'x' }]]), step('', [['read_page', { urls: urls.slice(3), focus: 'x' }]])], { searches: [results(...urls)] })
    await t.text()
    expect(t.fetchPage).toHaveBeenCalledTimes(4)
    expect(t.trace.events.find(e => e.kind === 'budget' && e.decision === 'page_read_refused')).toBeTruthy()
    expect(t.finals.at(-1)).toBe(true)
  })
  it('an ordinary (non-plan) turn: one lookup round, then the final, tool-less answer — the deep link is never even asked for', async () => {
    const t = turn([step('', [['web_search', { queries: ['x'] }]]), step('Đáp.')], { userText: 'AirPods Pro 2 pin bao lâu theo Apple?', searches: [results(APPLE)] })
    expect(await t.text()).toContain('Đáp.')
    expect(t.finals).toEqual([false, true])
    expect(t.fetchPage).not.toHaveBeenCalled()
  })
})
