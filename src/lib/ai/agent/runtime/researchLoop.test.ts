// Phase 8 M3 — the research loop inside a real runtime turn: search → read → evaluate → search again → read → answer; early stop;
// budgets; no crawl chains; citations; evidence persisted to the task, re-used on the next turn, flagged after a constraint change.
// Model, search, pages and claims are scripted (no network).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { startAgentRuntimeTurn, type TaskBox } from './index'
import { AgentRunTrace } from './trace'
import { createTask, conversationIdOf, taskContextLines, applyTaskDelta } from './task'
import { __resetPageCache } from './readPage'
import type { RuntimeStep } from './loop'
import type { PageFetchResult } from '@/lib/security/safePageFetch'

const conv = conversationIdOf('55555555-5555-4555-8555-555555555555')
const APPLE = 'https://www.apple.com/airpods-pro/specs/'
const REVIEW = 'https://some-blog.example/airpods-review'
const html = (title: string, body: string) => `<html><head><title>${title}</title></head><body><main><p>${body}</p><p>${'Thông tin thêm về sản phẩm và cách dùng hằng ngày. '.repeat(12)}</p></main></body></html>`
const PAGES: Record<string, string> = {
  [APPLE]: html('AirPods Pro 2 - Tech Specs - Apple', `Up to 6 hours of listening time with a single charge. Up to 30 hours with the case. See also <a href="https://deep-link.example/hidden">this</a>.`),
  [REVIEW]: html('AirPods Pro 2 review', 'In our test the battery lasted 4 hours of listening with noise cancellation.'),
}
const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({ text, finishReason: 'stop', toolCalls: calls.map(([toolName, args], k) => ({ toolCallId: `c${Math.random().toString(36).slice(2)}${k}`, toolName, args })) })
const page = (u: string): PageFetchResult => PAGES[u] ? { ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: PAGES[u], bytes: PAGES[u].length, truncated: false, redirects: 0, ms: 3 } : { ok: false, url: u, reason: 'http_error', status: 404, redirects: 0, ms: 3 }
function turn(script: RuntimeStep[], o: { box?: TaskBox; userText?: string; searches?: Array<Record<string, unknown>> } = {}) {
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const modelSaw: Array<{ messages: unknown[]; tools?: Record<string, unknown> }> = []
  const searches = [...(o.searches ?? [])]
  const fetchPage = vi.fn(async (u: string) => page(u))
  const cited: Array<Array<{ id: string; host: string; url: string }>> = []
  const r = startAgentRuntimeTurn({
    routeTools: { web_search: { description: 'web', parameters: undefined, execute: async () => searches.shift() ?? { results: [] } } },
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: o.userText ?? 'AirPods Pro 2 pin bao lâu theo Apple?' }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: q => ({ query: q, cut: [] }), trace,
    ...(o.box ? { taskBox: o.box } : {}),
    research: { fetchPage },
    onCitationSources: s => { cited.push(s) },
    callModel: async x => { modelSaw.push({ messages: x.messages, tools: x.tools }); return script.shift() ?? step('Xong.') },
  })
  return { trace, fetchPage, modelSaw, cited, text: async () => { vi.spyOn(console, 'log').mockImplementation(() => {}); const b = await r.toDataStreamResponse().text(); return b.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('') } }
}
const results = (...links: string[]) => ({ results: links.map((link, k) => ({ title: `kết quả ${k + 1}`, link, snippet: 'đoạn trích' })) })

afterEach(() => { __resetPageCache(); vi.restoreAllMocks() })

describe('M3 · research loop', () => {
  it('search → read → evaluate → search again → read → answer; conflict surfaced; trace explains the chain', async () => {
    const t = turn([
      step('', [['web_search', { queries: ['AirPods Pro 2 battery life'] }]]),
      step('', [['read_page', { urls: [REVIEW], focus: 'battery listening hours', kind: 'spec' }]]),
      step('', [['web_search', { queries: ['AirPods Pro 2 battery site:apple.com'] }]]),
      step('', [['read_page', { urls: [APPLE], focus: 'battery listening hours', kind: 'spec' }]]),
      step('Theo Apple pin nghe tối đa 6 giờ [S2]; một bài thử nghiệm đo 4 giờ khi bật chống ồn [S1] — hai nguồn khác nhau, số của Apple là thông số chính thức.'),
    ], { searches: [results(REVIEW), results(APPLE)] })
    const text = await t.text()
    // The runtime keeps the checked markers; the enrichment site turns them into links from these sources.
    expect(text).toContain('[S2]')
    expect(text).toContain('[S1]')
    expect(t.cited[0]).toEqual([{ id: 'S1', host: 'some-blog.example', url: REVIEW }, { id: 'S2', host: 'apple.com', url: APPLE }])
    const kinds = t.trace.events.map(e => e.kind).filter(k => ['tool_call', 'page_read', 'evidence', 'model_round'].includes(k))
    expect(kinds).toEqual(['model_round', 'tool_call', 'model_round', 'tool_call', 'page_read', 'evidence', 'model_round', 'tool_call', 'model_round', 'tool_call', 'page_read', 'evidence', 'model_round'])
    expect(t.trace.events.filter(e => e.kind === 'evidence').map(e => e.conflict)).toEqual([0, 1])
    expect(t.trace.citations).toBe(2)
    // The model saw typed evidence and the conflict in the read_page result.
    const lastToolMsg = JSON.stringify(t.modelSaw[4].messages.at(-1))
    expect(lastToolMsg).toContain('CONFLICT')
    expect(lastToolMsg).toContain('"source_type":"official"')
  })

  it('early stop: one official page is enough — no further lookups', async () => {
    const t = turn([step('', [['web_search', { queries: ['AirPods Pro 2 battery apple'], read: 1, focus: 'battery listening hours', kind: 'spec' }]]), step('6 giờ [S1].')], { searches: [results(APPLE)] })
    await t.text()
    // Normal research in TWO model rounds: one step searches AND opens the official page; the next answers.
    expect(t.trace.counters.toolCalls).toBe(1)
    expect(t.trace.counters.modelRounds).toBe(2)
    expect(t.fetchPage).toHaveBeenCalledTimes(1)
  })

  it('no crawl chain: a link found INSIDE a read page cannot be opened', async () => {
    const t = turn([step('', [['web_search', { queries: ['x'] }]]), step('', [['read_page', { urls: [APPLE], focus: 'battery' }]]), step('', [['read_page', { urls: ['https://deep-link.example/hidden'], focus: 'x' }]]), step('ok')], { searches: [results(APPLE)] })
    await t.text()
    expect(t.fetchPage).toHaveBeenCalledTimes(1)
    expect(t.trace.events.find(e => e.kind === 'page_read' && e.status === 'refused_not_from_results')).toBeTruthy()
  })

  it('a link the USER sent can be opened without a search', async () => {
    const t = turn([step('', [['read_page', { urls: [APPLE], focus: 'battery' }]]), step('6 giờ [S1].')], { userText: `Trang này nói pin bao lâu? ${APPLE}` })
    expect(await t.text()).toContain('[S1]')
    expect(t.cited[0][0]).toMatchObject({ host: 'apple.com' })
    expect(t.fetchPage).toHaveBeenCalledTimes(1)
  })

  it('budgets hold: ≤ 4 page reads, ≤ 8 tool calls — then the tool-less final answer', async () => {
    const urls = Array.from({ length: 6 }, (_, k) => `https://site${k}.example/p`)
    for (const u of urls) PAGES[u] = html(`Trang ${u}`, 'Một trang bất kỳ với nội dung đủ dài để đọc được ở đây.')
    const t = turn([step('', [['web_search', { queries: ['x'] }]]), step('', [['read_page', { urls: urls.slice(0, 3), focus: 'x' }]]), step('', [['read_page', { urls: urls.slice(3), focus: 'x' }]])], { searches: [results(...urls)] })
    await t.text()
    expect(t.fetchPage).toHaveBeenCalledTimes(4)
    expect(t.trace.events.find(e => e.kind === 'budget' && e.decision === 'page_read_refused')).toBeTruthy()
    expect(t.trace.counters.modelRounds).toBeLessThanOrEqual(6)
  })

  it('no research needed → no tool, no page, no sources line (search stays optional)', async () => {
    const t = turn([step('Phở bò dùng xương bò.')])
    expect(await t.text()).toBe('Phở bò dùng xương bò.')
    expect(t.fetchPage).not.toHaveBeenCalled()
  })
})

describe('M3 · evidence in the task (M2): persisted, re-used, flagged after new constraints', () => {
  const box = (): TaskBox => ({ task: createTask(conv, new Date()), history: [], conversationId: conv, persisted: true, turn: { userText: 'x', previousReply: null, cards: [] }, extract: async () => ({ new_task: false, task_type: null, goal: null, set_constraints: [], remove_constraints: [], set_preferences: [], add_entities: [], selected_items: null, status: null }) })

  it('evidence references are stored on the task (no page text) and the next turn may re-open the same source without a new search', async () => {
    const b = box()
    await turn([step('', [['web_search', { queries: ['x'] }]]), step('', [['read_page', { urls: [APPLE], focus: 'battery listening hours', kind: 'spec' }]]), step('6 giờ [S1].')], { box: b, searches: [results(APPLE)] }).text()
    expect(b.task.research_state.evidence).toEqual([expect.objectContaining({ host: 'apple.com', source_type: 'official', claims: [expect.objectContaining({ attribute: 'battery_listening_hours', value: 'Up to 6 hours', type: 'FACT' })] })])
    expect(JSON.stringify(b.task)).not.toContain('Thông tin thêm về sản phẩm')
    // Next turn: the context shows the stored evidence; the source can be re-opened (allowed) — no search needed.
    expect(taskContextLines(b.task, [], new Date()).join('\n')).toContain('Nguồn đã đọc: apple.com (official')
    const t2 = turn([step('', [['read_page', { urls: [APPLE], focus: 'warranty' }]]), step('Bảo hành 1 năm [S1].')], { box: b, userText: 'Còn bảo hành thì sao?' })
    await t2.text()
    expect(t2.trace.events.find(e => e.kind === 'page_read' && e.status === 'refused_not_from_results')).toBeUndefined()
  })

  it('after the constraints change, earlier evidence is flagged "read before the constraints changed" (Luna decides to research again)', async () => {
    const b = box()
    b.task = applyTaskDelta(b.task, [], { set_constraints: [{ key: 'ngan_sach', value: '5 triệu' }] }, { now: new Date(), conversationId: conv }).task
    await turn([step('', [['web_search', { queries: ['x'] }]]), step('', [['read_page', { urls: [APPLE], focus: 'battery' }]]), step('ok [S1]')], { box: b, searches: [results(APPLE)] }).text()
    expect(taskContextLines(b.task, [], new Date()).join('\n')).not.toContain('TRƯỚC khi đổi ràng buộc')
    b.task = applyTaskDelta(b.task, [], { set_constraints: [{ key: 'ngan_sach', value: '3 triệu' }] }, { now: new Date(), conversationId: conv }).task
    expect(taskContextLines(b.task, [], new Date()).join('\n')).toContain('đọc TRƯỚC khi đổi ràng buộc')
  })
})
