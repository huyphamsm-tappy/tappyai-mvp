// C2 Phase 2/3 — the levers as wired in a real runtime turn (index.ts): flags OFF = the request is unchanged; the tool gate empties the tool
// schemas; the tool-round effort reaches tool-offering steps only; a rescue keeps the SAME output cap (P2); P1 status frames come first, carry fixed
// copy only (never the user's words, a query or tool data) and never answer text. AI.step is mocked — no network, no API key, no cost.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({
  calls: [] as Array<Record<string, any>>,
  script: [] as Array<{ text: string; calls?: Array<[string, Record<string, unknown>]>; finish?: string; throwAfter?: number }>,
}))
vi.mock('@/lib/ai/llm', async orig => {
  const m = await orig<typeof import('@/lib/ai/llm')>()
  return {
    ...m,
    AI: {
      ...m.AI,
      step: vi.fn(async (o: Record<string, any>) => {
        H.calls.push(o)
        // the answer-before-lookup check (maxTokens 700) is not part of the script
        const s = o.maxTokens === 700 ? { text: '' } : H.script.shift() ?? { text: 'Mặc định.' }
        return {
          text: s.text, finishReason: s.finish ?? (s.calls?.length ? 'tool-calls' : 'stop'),
          toolCalls: (s.calls ?? []).map(([toolName, args], k) => ({ toolCallId: `t${H.calls.length}_${k}`, toolName, args })),
          usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0 } } }, response: { modelId: 'mock' },
        }
      }),
      // C2_STREAM_DATASTREAM: the streamed step — the script's text is handed out line by line (then the same result shape as `step`)
      stepStream: vi.fn(async (o: Record<string, any>) => {
        H.calls.push({ ...o, streamed: true })
        const s = H.script.shift() ?? { text: 'Mặc định.' }
        const parts = s.text.match(/[^\n]*\n|[^\n]+$/g) ?? []
        parts.forEach((p, k) => { if (s.throwAfter !== undefined && k >= s.throwAfter) throw new Error('upstream died mid-stream'); o.onTextDelta(p) })
        if (s.throwAfter !== undefined) throw new Error('upstream died mid-stream')
        return { text: s.text, finishReason: s.finish ?? 'stop', toolCalls: [], usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0 } } }, response: { modelId: 'mock' } }
      }),
    },
  }
})

import { startAgentRuntimeTurn } from './index'
import { AgentRunTrace } from './trace'
import { __resetPageCache } from './readPage'
import { PROGRESS_ANNOTATION_KIND, TURN_STATUS_KIND } from '@/lib/recommendation/progressAnnotation'
import { incompleteNote } from './c2Policy'
import { RequestBudget, withRequestBudget } from '@/lib/ai/budget/requestBudget'
import { agentStreamResult } from '../dataStream'
import { CONSULT_V3_SYSTEM } from './consultV3'

const FLAGS = ['C2_TOOL_GATE', 'C2_ROUND_CAP', 'C2_BATCH_NOTE', 'C2_LENGTH_RECOVERY', 'C2_PROGRESS', 'C2_TOOL_ROUND_EFFORT', 'C2_SOFT_BUDGET_MS', 'C2_REASONING_HEADROOM_TOKENS', 'C2_REQUEST_BUDGET', 'C2_STREAM_DATASTREAM']
beforeEach(() => { H.calls.length = 0; H.script.length = 0; for (const k of FLAGS) delete process.env[k] })
afterEach(() => { __resetPageCache(); vi.restoreAllMocks(); for (const k of FLAGS) delete process.env[k] })

async function turn(userText: string, earlier: string[] = [], o: { places?: boolean; hasLoc?: boolean; promptVersion?: string; news?: boolean } = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const r = startAgentRuntimeTurn({
    routeTools: {
      web_search: { description: 'web', parameters: undefined, execute: async () => ({ results: [{ title: 'kết quả TOOL-DATA-777', link: 'https://x.example/a', snippet: 'TOOL-DATA-777' }] }) },
      ...(o.places ? { search_places: { description: 'places', parameters: undefined, execute: async () => ({ results: [{ name: 'Quán TOOL-DATA-777' }] }) } } : {}),
      ...(o.news ? { get_news: { description: 'news', parameters: undefined, execute: async () => ({ articles: [{ title: 'Giá xăng giảm từ chiều nay', url: 'https://news.example/xang', summary: 'Giá xăng giảm từ chiều nay theo kỳ điều hành mới.', source: 'news.example' }] }) } } : {}),
    },
    ...(o.hasLoc ? { hasCurrentLocation: true } : {}),
    ...(o.promptVersion ? { promptVersion: o.promptVersion } : {}),
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [...earlier.flatMap(e => [{ role: 'user', content: e }, { role: 'assistant', content: 'Được.' }]), { role: 'user', content: userText }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: (q: string) => ({ query: q, cut: [] }), trace,
    research: { fetchPage: async (u: string) => ({ ok: false, url: u, reason: 'http_error', status: 404, redirects: 0, ms: 1 }) as never },
  } as never)
  const body = await r.toDataStreamResponse().text()
  const lines = body.split('\n').filter(Boolean)
  const all8 = lines.filter(l => l.startsWith('8:')).flatMap(l => JSON.parse(l.slice(2)) as Array<Record<string, any>>)
  const frames = all8.filter(a => a.kind === PROGRESS_ANNOTATION_KIND)
  const statuses = all8.filter(a => a.kind === TURN_STATUS_KIND)
  const text = lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const scripted = H.calls.filter(c => c.maxTokens !== 700)
  return { trace, lines, frames, statuses, text, scripted }
}
const offersTools = (c: Record<string, any>) => !!c.tools && Object.keys(c.tools).length > 0

describe('W0 · all C2 flags OFF = the request is unchanged', () => {
  it('tools offered, role budget 800, no effort override, no status frames, no C2 trace entries', async () => {
    H.script.push({ text: '', calls: [['web_search', { queries: ['giá vàng'] }]] }, { text: 'Đáp.' })
    const t = await turn('Giá vàng hôm nay?')
    expect(t.scripted.length).toBe(2)
    expect(t.scripted.every(offersTools)).toBe(true)
    expect(t.scripted.every(c => c.maxTokens === 800)).toBe(true)
    expect(t.scripted.every(c => !('effort' in c))).toBe(true)
    expect(t.frames).toEqual([])
    expect(t.trace.events.filter(e => e.kind === 'budget' && ['c2_tool_gate', 'round_cap', 'round_allowed', 'empty_length_rerun'].includes(String(e.decision)))).toEqual([])
    expect(t.text).toBe('Đáp.')
  })
})

describe('W1 · C2_TOOL_GATE', () => {
  it('a stable-knowledge question is answered in one round with NO tool schema; the decision is traced without the text', async () => {
    process.env.C2_TOOL_GATE = '1'
    H.script.push({ text: 'Định luật Ohm: U = I·R.' })
    const t = await turn('Giải thích định luật Ohm cho học sinh lớp 9')
    expect(t.scripted).toHaveLength(1)
    expect(offersTools(t.scripted[0])).toBe(false)
    const g = t.trace.events.find(e => e.decision === 'c2_tool_gate')!
    expect(g).toMatchObject({ gate: 'no_tools', reason: 'stable_task' })
    expect(JSON.stringify(g)).not.toContain('Ohm')
    expect(t.text).toBe('Định luật Ohm: U = I·R.')
  })
  it('a gated turn has no executable tool either: a tool call the model names anyway runs nothing', async () => {
    process.env.C2_TOOL_GATE = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['x'] }]] }, { text: 'Định luật Ohm: U = I·R.' })
    const t = await turn('Giải thích định luật Ohm cho học sinh lớp 9')
    // every planned call leaves a tool_result line; a gated turn's one is a refusal (unknown_tool), never an executed lookup
    expect(t.trace.events.filter(e => e.kind === 'tool_result').map(e => e.outcome)).toEqual(['unknown_tool'])
    expect(t.trace.events.find(e => e.kind === 'tool_call')).toMatchObject({ admitted: false, outcome_planned: 'unknown_tool' })
    expect(t.lines.some(l => l.includes('TOOL-DATA-777'))).toBe(false)
  })
  it('a follow-up in a conversation that needed data keeps the tools', async () => {
    process.env.C2_TOOL_GATE = '1'
    H.script.push({ text: 'Đáp.' })
    const t = await turn('Chủ yếu để code', ['Mình muốn mua MacBook', 'Tầm 25 triệu'])
    expect(offersTools(t.scripted[0])).toBe(true)
    expect(t.trace.events.find(e => e.decision === 'c2_tool_gate')).toMatchObject({ gate: 'tools', reason: 'conversation_needs_data' })
  })
  it('a question needing fresh data keeps the tools', async () => {
    process.env.C2_TOOL_GATE = '1'
    H.script.push({ text: 'Đáp.' })
    const t = await turn('Giải thích vì sao giá vàng hôm nay tăng')
    expect(offersTools(t.scripted[0])).toBe(true)
    expect(t.trace.events.find(e => e.decision === 'c2_tool_gate')).toMatchObject({ gate: 'tools', reason: 'needs_data_sign' })
  })
})

describe('W2 · C2_ROUND_CAP + C2_TOOL_ROUND_EFFORT + C2_BATCH_NOTE', () => {
  it('after one lookup round the answer round is final (no tools); the effort override reaches the tool round only; the batch note only the tool round', async () => {
    process.env.C2_ROUND_CAP = '1'; process.env.C2_TOOL_ROUND_EFFORT = 'low'; process.env.C2_BATCH_NOTE = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['giá vàng SJC'] }]] }, { text: 'Giá vàng hôm nay theo nguồn.' })
    const t = await turn('Giá vàng hôm nay?')
    expect(t.scripted).toHaveLength(2)
    expect([offersTools(t.scripted[0]), offersTools(t.scripted[1])]).toEqual([true, false])
    expect([t.scripted[0].effort, t.scripted[1].effort]).toEqual(['low', undefined])
    expect(t.scripted[0].system).toMatch(/cùng bước này/)
    expect(t.scripted[1].system).not.toMatch(/cùng bước này/)
    expect(t.trace.events.find(e => e.decision === 'round_cap')).toMatchObject({ reason: 'round_cap' })
  })
  it('a plan turn is allowed more lookup rounds', async () => {
    process.env.C2_ROUND_CAP = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['Đà Lạt'] }]] }, { text: '', calls: [['web_search', { queries: ['Đà Lạt ăn gì'] }]] }, { text: 'Lịch trình.' })
    const t = await turn('Lên lịch trình Đà Lạt 3 ngày 2 đêm')
    // rounds 2 and 3 still offer tools (plan_task); the model answers in round 3 on its own
    expect(t.scripted.map(offersTools)).toEqual([true, true, true])
    expect(t.trace.events.filter(e => e.decision === 'round_allowed').map(e => e.reason)).toEqual(['plan_task', 'plan_task'])
    expect(t.text).toBe('Lịch trình.')
  })
})

describe('W3 · C2_LENGTH_RECOVERY (P2 contract: one rescue, same cap, status as an annotation)', () => {
  it('a cut answer gets one continuation with the SAME output cap; still cut → a tappy.turn_status.v1 `incomplete` annotation, nothing appended to the text', async () => {
    process.env.C2_LENGTH_RECOVERY = '1'
    H.script.push({ text: 'Phần đầu', finish: 'length' }, { text: 'phần sau', finish: 'length' })
    const t = await turn('Kể chuyện cổ tích')
    expect(t.scripted.map(c => c.maxTokens)).toEqual([800, 800])
    expect(offersTools(t.scripted[1])).toBe(false)
    expect(t.text).toBe('Phần đầu phần sau')
    expect(t.text).not.toContain(incompleteNote('vi').trim())
    expect(t.statuses).toEqual([{ kind: TURN_STATUS_KIND, v: 1, status: 'incomplete', reason: 'length_limit' }])
  })
  it('a normal answer carries no turn status', async () => {
    process.env.C2_LENGTH_RECOVERY = '1'
    H.script.push({ text: 'Đủ.' })
    const t = await turn('Kể chuyện cổ tích')
    expect(t.statuses).toEqual([])
  })
})

describe('W3b · C2_REQUEST_BUDGET (the ledger as the runtime sees it; owner §7.2: consult_v3 turns only)', () => {
  it('a ledger with no room left for even the final answer: NO model call, an `incomplete` (request_budget) annotation, the fallback line as text', async () => {
    process.env.C2_REQUEST_BUDGET = '1'
    const b = new RequestBudget()
    b.settle(b.reserve('earlier', 'main', 18_000, 0)!, { inputTokens: 18_000, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, usd: 0 })
    H.script.push({ text: 'không được gọi' })
    const t = await withRequestBudget(b, () => turn('Giá vàng hôm nay?', [], { promptVersion: 'consult_v3' }))
    expect(t.scripted).toHaveLength(0)
    expect(t.statuses).toEqual([{ kind: TURN_STATUS_KIND, v: 1, status: 'incomplete', reason: 'request_budget' }])
  })
  it('with room for the answer but not for a lookup AND the answer, round 1 is already the final, tool-less one', async () => {
    process.env.C2_REQUEST_BUDGET = '1'
    const b = new RequestBudget()
    // already spent: 13 500 of 20 000 — room for the V3 answer round (≈ 4 000 prompt + 800 out), not for a lookup round AND the answer
    // (§7.2 moved this test to the V3 prompt, ~3 900 estimated tokens vs ~6 300 of the base prompt, so the earlier 9 000 left room for both)
    b.settle(b.reserve('earlier', 'main', 13_500, 0)!, { inputTokens: 13_500, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, usd: 0 })
    H.script.push({ text: 'Đáp ngắn trong ngân sách.' })
    const t = await withRequestBudget(b, () => turn('Giá vàng hôm nay?', [], { promptVersion: 'consult_v3' }))
    expect(t.scripted).toHaveLength(1)
    expect(offersTools(t.scripted[0])).toBe(false)
    expect(t.text).toBe('Đáp ngắn trong ngân sách.')
  })
  it('§7.2 scope mismatch: a ledger on a NON-V3 prompt is not used (no budget gate — the same nearly-full ledger stops nothing) and is logged loudly', async () => {
    process.env.C2_REQUEST_BUDGET = '1'
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(String(a[0])) })
    const b = new RequestBudget()
    b.settle(b.reserve('earlier', 'main', 18_000, 0)!, { inputTokens: 18_000, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, usd: 0 })
    H.script.push({ text: 'Đáp.' })
    const t = await withRequestBudget(b, () => turn('Giá vàng hôm nay?', [], { promptVersion: 'agent_v2_base' }))
    expect(t.scripted).toHaveLength(1)
    expect(offersTools(t.scripted[0])).toBe(true)
    expect(t.statuses).toEqual([])
    expect(errors.map(e => JSON.parse(e))).toContainEqual({ type: 'tappyai_prompt_scope_mismatch', prompt_version: 'agent_v2_base', ledger: true })
  })
  it('§7.2 the prompt the model gets follows the classified version (one decision): consult_v3 → the V3 prompt, agent_v2_base → not', async () => {
    H.script.push({ text: 'Đáp.' }, { text: 'Đáp.' })
    await turn('Giá vàng hôm nay?', [], { promptVersion: 'consult_v3' })
    const v3System = H.calls.filter(c => c.maxTokens !== 700).map(c => c.systemShared)
    H.calls.length = 0
    await turn('Giá vàng hôm nay?', [], { promptVersion: 'agent_v2_base' })
    const baseSystem = H.calls.filter(c => c.maxTokens !== 700).map(c => c.systemShared)
    expect(v3System.length).toBeGreaterThan(0); expect(baseSystem.length).toBeGreaterThan(0)
    expect(v3System.every(s => s === CONSULT_V3_SYSTEM)).toBe(true)
    expect(baseSystem.some(s => s === CONSULT_V3_SYSTEM)).toBe(false)
  })
  it('no ledger (flag on but outside a request) → no gate, the turn runs as before', async () => {
    process.env.C2_REQUEST_BUDGET = '1'
    H.script.push({ text: 'Đáp.' })
    const t = await turn('Giá vàng hôm nay?')
    expect(offersTools(t.scripted[0])).toBe(true)
  })
})

describe('W5 · C2_STREAM_DATASTREAM (the runtime → data stream)', () => {
  it('flag off → the streamed step is never used', async () => {
    process.env.C2_ROUND_CAP = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: 'Đáp.' })
    const t = await turn('Giá vàng hôm nay?')
    expect(t.scripted.some(c => c.streamed)).toBe(false)
  })
  it('the answer round streams: its lines leave as `0:` frames AFTER the tool frames, once each; the whole text is the final answer', async () => {
    process.env.C2_ROUND_CAP = '1'; process.env.C2_STREAM_DATASTREAM = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: 'Giá vàng hôm nay:\n- SJC: theo nguồn.\nNguồn ở dưới.' })
    const t = await turn('Giá vàng hôm nay?')
    expect(t.scripted.map(c => !!c.streamed)).toEqual([false, true])
    const firstText = t.lines.findIndex(l => l.startsWith('0:'))
    const lastTool = t.lines.map((l, k) => (/^[9a]:/.test(l) ? k : -1)).reduce((a, b) => Math.max(a, b), -1)
    expect(lastTool).toBeGreaterThanOrEqual(0)
    expect(firstText).toBeGreaterThan(lastTool)
    expect(t.text).toBe('Giá vàng hôm nay:\n- SJC: theo nguồn.\nNguồn ở dưới.')
    expect(t.lines.filter(l => l.startsWith('0:')).length).toBeGreaterThanOrEqual(2)
  })
  it('an error mid-stream → the part shown stays, NO fallback line appended, an `interrupted` annotation', async () => {
    process.env.C2_ROUND_CAP = '1'; process.env.C2_STREAM_DATASTREAM = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: 'Phần đầu.\nPhần sau.\n', throwAfter: 1 })
    const t = await turn('Giá vàng hôm nay?')
    expect(t.text).toBe('Phần đầu.')
    expect(t.text).not.toMatch(/Xin lỗi/)
    expect(t.statuses).toEqual([{ kind: TURN_STATUS_KIND, v: 1, status: 'interrupted', reason: 'provider_error' }])
  })
  it('a plan turn never streams', async () => {
    process.env.C2_ROUND_CAP = '1'; process.env.C2_STREAM_DATASTREAM = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: '', calls: [['web_search', { queries: ['b'] }]] }, { text: '', calls: [['web_search', { queries: ['c'] }]] }, { text: 'Lịch trình.' })
    const t = await turn('Lên lịch trình Đà Lạt 3 ngày 2 đêm')
    expect(t.scripted.some(c => c.streamed)).toBe(false)
  })
  it('6.1: under CONSULT_V3_FINAL_REWRITE=1 (the answer is rewritten after the run) nothing streams', async () => {
    process.env.C2_ROUND_CAP = '1'; process.env.C2_STREAM_DATASTREAM = '1'; process.env.CONSULT_V3_FINAL_REWRITE = '1'
    try {
      H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: 'Đáp.\nHết.' })
      const t = await turn('Giá vàng hôm nay?')
      expect(t.scripted.some(c => c.streamed)).toBe(false)
    } finally { delete process.env.CONSULT_V3_FINAL_REWRITE }
  })
  it('6.0 F-1: an answer with a [S#] marker (no page read → planCitations removes it after the run) — the user gets EXACTLY the flag-off text, no divergence', async () => {
    const answer = 'Giá vàng tăng nhẹ.\nTheo bài báo [S1] thì giá SJC tăng.\n[S2] Một dòng mở bằng marker.\nHết.'
    process.env.C2_ROUND_CAP = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: answer })
    const off = await turn('Giá vàng hôm nay?')
    H.calls.length = 0
    process.env.C2_STREAM_DATASTREAM = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: answer })
    const on = await turn('Giá vàng hôm nay?')
    expect(on.scripted.map(c => !!c.streamed)).toEqual([false, true])
    expect(on.text).toBe(off.text)
    expect(on.statuses).toEqual([])
    const streamedFrames = on.lines.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string)
    expect(streamedFrames[0]).toBe('Giá vàng tăng nhẹ.')
  })
  it('6.0 F-1: a turn holding news / editorial results does not stream (the attribution may rewrite any sentence); traced; same text as flag off', async () => {
    const answer = 'Giá xăng giảm từ chiều nay theo kỳ điều hành mới.\nBạn nên đổ xăng sau giờ điều chỉnh.'
    process.env.C2_ROUND_CAP = '1'
    H.script.push({ text: '', calls: [['get_news', { topic: 'giá xăng' }]] }, { text: answer })
    const off = await turn('Tin tức giá xăng hôm nay?', [], { news: true })
    H.calls.length = 0
    process.env.C2_STREAM_DATASTREAM = '1'
    H.script.push({ text: '', calls: [['get_news', { topic: 'giá xăng' }]] }, { text: answer })
    const on = await turn('Tin tức giá xăng hôm nay?', [], { news: true })
    expect(on.trace.events.filter(e => e.kind === 'tool_result').map(e => e.tool)).toContain('get_news')
    expect(on.scripted.some(c => c.streamed)).toBe(false)
    expect(on.trace.events.find(e => e.decision === 'stream_skipped')).toMatchObject({ reason: 'news_or_editorial_sources' })
    expect(on.text).toBe(off.text)
    expect(on.statuses).toEqual([])
  })
})

describe('W6 · the data stream refuses to send a second, different copy', () => {
  it('a final text that does not begin with what streamed → nothing more is sent, an `interrupted` (stream_divergence) annotation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = agentStreamResult(async emit => { emit('0:"Đã gửi.\\n"\n'); return { text: 'Một phiên bản khác.', steps: [], streamed: { released: 'Đã gửi.\n', stop: null } } as never })
    const body = await r.toDataStreamResponse().text()
    const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).join('')
    expect(text).toBe('Đã gửi.\n')
    expect(body).toContain('"reason":"stream_divergence"')
    expect(await r.text).toBe('Đã gửi.\n')
  })
  it('a final that begins with what streamed → only the rest is sent', async () => {
    const r = agentStreamResult(async emit => { emit('0:"Dòng một.\\n"\n'); return { text: 'Dòng một.\nDòng hai.', steps: [], streamed: { released: 'Dòng một.\n', stop: null } } as never })
    const body = await r.toDataStreamResponse().text()
    expect(body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).join('')).toBe('Dòng một.\nDòng hai.')
  })
})

describe('W4 · C2_PROGRESS (P1)', () => {
  it('a status line is the FIRST line of the stream, before any model call returns; one per lookup kind; "writing" when the answer round starts', async () => {
    process.env.C2_PROGRESS = '1'; process.env.C2_ROUND_CAP = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['QUERY-ARG-XYZ'] }]] }, { text: 'Đáp.' })
    const t = await turn('Giá vàng hôm nay SECRET-Q-123?')
    expect(t.lines[0].startsWith('8:')).toBe(true)
    expect(t.frames.map(f => f.stage)).toEqual(['thinking', 'researching', 'writing'])
    expect(t.frames.map(f => f.text)).toEqual(['Tappy đang suy nghĩ…', 'Đang tìm trên web…', 'Đang viết câu trả lời…'])
    // the first answer text comes after every status line
    const firstText = t.lines.findIndex(l => l.startsWith('0:'))
    const lastStatus = t.lines.map((l, k) => (l.startsWith('8:') && l.includes(PROGRESS_ANNOTATION_KIND) ? k : -1)).reduce((a, b) => Math.max(a, b), -1)
    expect(lastStatus).toBeLessThan(firstText)
  })
  it('status lines never carry the user text, a query, tool data or answer text', async () => {
    process.env.C2_PROGRESS = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['QUERY-ARG-XYZ'] }]] }, { text: 'ANSWER-TEXT-555' })
    const t = await turn('Giá vàng hôm nay SECRET-Q-123?')
    const raw = JSON.stringify(t.frames)
    for (const s of ['SECRET-Q-123', 'QUERY-ARG-XYZ', 'TOOL-DATA-777', 'ANSWER-TEXT-555', 'Giá vàng']) expect(raw, s).not.toContain(s)
    expect(t.frames.every(f => Object.keys(f).sort().join() === 'kind,stage,text,v')).toBe(true)
  })
  it('a place search gets its own line when there is no current location; around a real location only the existing "searching" line (no duplicate)', async () => {
    process.env.C2_PROGRESS = '1'
    H.script.push({ text: '', calls: [['search_places', { query: 'phở quận 1' }]] }, { text: 'Đáp.' })
    const a = await turn('Quán phở nào ngon ở quận 1?', [], { places: true })
    expect(a.frames.map(f => [f.stage, f.text])).toContainEqual(['researching', 'Đang tìm địa điểm…'])
    H.script.push({ text: '', calls: [['search_places', { query: 'phở gần đây' }]] }, { text: '', calls: [['search_places', { query: 'phở gần đây 2' }]] }, { text: 'Đáp.' })
    const b = await turn('Quán phở nào ngon gần đây?', [], { places: true, hasLoc: true })
    expect(b.frames.filter(f => f.stage === 'searching')).toHaveLength(1)
    expect(b.frames.filter(f => f.stage === 'researching')).toEqual([])
  })
  it('a second call of the same tool kind does not repeat its status line', async () => {
    process.env.C2_PROGRESS = '1'
    H.script.push({ text: '', calls: [['web_search', { queries: ['a'] }]] }, { text: '', calls: [['web_search', { queries: ['b'] }]] }, { text: 'Đáp.' })
    const t = await turn('Giá vàng hôm nay?')
    expect(t.frames.filter(f => f.stage === 'researching')).toHaveLength(1)
  })
})
