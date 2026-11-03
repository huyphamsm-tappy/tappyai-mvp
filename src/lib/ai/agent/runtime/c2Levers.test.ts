// C2 Phase 2/3 (+ P2 contract) — the loop levers (loop.ts): round policy, batch note, the request's ONE rescue (empty re-run OR continuation,
// same cap, no ×2), the incomplete flag (no text appended), the budget gate, round-start hook. The model is scripted; tools are fakes. No
// network, no API. Every lever is absent by default: the OFF tests pin that the loop behaves exactly as before (same rounds, same prompts, same text).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { roundDecision, batchNote, continuationPrompt } from './c2Policy'

type Seen = { final: boolean; hadTools: boolean; system: string; rescue: boolean; messages: number; lastUser: string; streamed: boolean; onTextDelta?: (d: string) => void }
const step = (text: string, calls: Array<[string, Record<string, unknown>]> = [], finishReason = 'stop'): RuntimeStep => ({
  text, finishReason, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${Math.random().toString(36).slice(2)}${i}`, toolName, args })),
})

function harness(script: Array<RuntimeStep | ((o: Seen) => RuntimeStep | Promise<RuntimeStep>)>, over: Partial<RuntimeInput> = {}, toolResult: (name: string) => unknown = () => ({ results: [{ title: 'r', link: 'https://x.example/a', snippet: 's' }] })) {
  const seen: Seen[] = []
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const toolRuns: string[] = []
  const tools = {
    web_search: { execute: async () => { toolRuns.push('web_search'); return toolResult('web_search') } },
    get_weather: { execute: async () => { toolRuns.push('get_weather'); return toolResult('get_weather') } },
  }
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'hỏi' }], tools, schemas: { web_search: {}, get_weather: {} },
    callModel: async o => {
      const last = o.messages[o.messages.length - 1]
      const s: Seen = { final: o.final, hadTools: !!o.tools, system: o.system, rescue: o.rescue === true, messages: o.messages.length, lastUser: last?.role === 'user' && typeof last.content === 'string' ? last.content : '', streamed: !!o.onTextDelta, onTextDelta: o.onTextDelta }
      seen.push(s)
      const next = script.shift()
      if (!next) return step(o.final ? 'Câu trả lời cuối.' : 'Mặc định.')
      return typeof next === 'function' ? next(s) : next
    },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace, ...over,
  }
  return { input, seen, trace, toolRuns }
}
const capPolicy = (plan = false, softBudgetMs = 20_000) => (s: { toolRounds: number; lastRoundStates: readonly string[]; elapsedMs: number }) => roundDecision({ ...s, plan, softBudgetMs })
const budgets = (t: AgentRunTrace) => t.events.filter(e => e.kind === 'budget')
const LR = { continuationPrompt: continuationPrompt('vi'), maxMs: 8_000 }

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('L0 · OFF = unchanged', () => {
  it('three lookup rounds still run when no round policy is given (the old behaviour)', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('', [['web_search', { query: 'b' }]]), step('', [['web_search', { query: 'c' }]]), step('Đáp.')])
    const run = await runAgentRuntime(h.input)
    expect(run.modelCalls).toBe(4)
    expect(h.toolRuns).toHaveLength(3)
    expect(h.seen.map(s => s.final)).toEqual([false, false, false, false])
    expect(budgets(h.trace).filter(b => b.decision === 'round_cap' || b.decision === 'round_allowed')).toHaveLength(0)
    expect(run).not.toHaveProperty('incomplete')
  })
  it('no batch note in any prompt; no rescue call; a cut answer is returned as is', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Đáp bị cắt giữa', [], 'length')])
    const run = await runAgentRuntime(h.input)
    expect(h.seen.every(s => s.system === 'SYS')).toBe(true)
    expect(h.seen.every(s => !s.rescue)).toBe(true)
    expect(run.text).toBe('Đáp bị cắt giữa')
    expect(run.modelCalls).toBe(2)
    expect(run).not.toHaveProperty('incomplete')
  })
  it('an empty length-cut round keeps the old path: the next round is the forced final one', async () => {
    const h = harness([step('', [], 'length'), step('Cuối.')])
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => s.final)).toEqual([false, true])
    expect(h.seen[1].rescue).toBe(false)
    expect(run.text).toBe('Cuối.')
  })
})

describe('L1 · C2_ROUND_CAP', () => {
  it('after one good lookup round the next round is final (no tools) and the cap is traced', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Đáp từ kết quả.')], { roundPolicy: capPolicy() })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => [s.final, s.hadTools])).toEqual([[false, true], [true, false]])
    expect(run.status).toBe('answered_after_round_budget')
    expect(run.text).toBe('Đáp từ kết quả.')
    expect(budgets(h.trace).find(b => b.decision === 'round_cap')).toMatchObject({ round: 2, reason: 'round_cap', tool_rounds: 1 })
  })
  it('a first round that answers directly is untouched (the policy is not asked before any lookup)', async () => {
    const h = harness([step('Trả lời luôn.')], { roundPolicy: capPolicy() })
    const run = await runAgentRuntime(h.input)
    expect(run.modelCalls).toBe(1)
    expect(run.status).toBe('answered')
    expect(budgets(h.trace)).toHaveLength(0)
  })
  it('evidence_missing: every lookup came back empty → one more lookup round, then the cap', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('', [['web_search', { query: 'b' }]]), step('Đáp.')], { roundPolicy: capPolicy() }, () => ({ results: [] }))
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => s.final)).toEqual([false, false, true])
    expect(h.toolRuns).toHaveLength(2)
    expect(budgets(h.trace).filter(b => b.decision === 'round_allowed').map(b => b.reason)).toEqual(['evidence_missing'])
    expect(budgets(h.trace).filter(b => b.decision === 'round_cap').map(b => b.reason)).toEqual(['round_cap'])
    expect(run.status).toBe('answered_after_round_budget')
  })
  it('a failing tool counts as missing evidence too', async () => {
    const h = harness([step('', [['get_weather', {}]]), step('', [['web_search', { query: 'b' }]]), step('Đáp.')], { roundPolicy: capPolicy() }, n => { if (n === 'get_weather') throw new Error('boom'); return { results: [{ title: 't' }] } })
    await runAgentRuntime(h.input)
    expect(h.seen.map(s => s.final)).toEqual([false, false, true])
  })
  it('a plan turn may run three lookup rounds before the cap', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('', [['web_search', { query: 'b' }]]), step('', [['web_search', { query: 'c' }]]), step('Kế hoạch.')], { roundPolicy: capPolicy(true) })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => s.final)).toEqual([false, false, false, true])
    expect(budgets(h.trace).filter(b => b.decision === 'round_allowed').map(b => b.reason)).toEqual(['plan_task', 'plan_task'])
    expect(run.text).toBe('Kế hoạch.')
  })
  it('the soft time budget makes the next round final and is reported as a time budget', async () => {
    let t = 1_000_000
    const h = harness([s => { t += 25_000; return step('', [['web_search', { query: 'a' }]]) }, step('Đáp nhanh.')], { roundPolicy: capPolicy(true), now: () => t, deadlineAt: 1_000_000 + 85_000 })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => s.final)).toEqual([false, true])
    expect(budgets(h.trace).find(b => b.decision === 'round_cap')).toMatchObject({ reason: 'soft_time_budget' })
    expect(run.status).toBe('answered_after_time_budget')
  })
  it('a hard ceiling keeps precedence and the policy is not consulted then', async () => {
    const policy = vi.fn(capPolicy())
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Đáp.')], { roundPolicy: policy, limits: { maxModelRounds: 2 } })
    const run = await runAgentRuntime(h.input)
    expect(policy).not.toHaveBeenCalled()
    expect(run.status).toBe('answered_after_round_budget')
  })
  it('a turn with no tool schema never asks the policy', async () => {
    const policy = vi.fn(capPolicy())
    const h = harness([step('Đáp.')], { roundPolicy: policy, schemas: {} })
    await runAgentRuntime(h.input)
    expect(policy).not.toHaveBeenCalled()
  })
})

describe('L2 · C2_BATCH_NOTE', () => {
  it('the note is appended to non-final rounds that offer tools only — never to the final round', async () => {
    const note = batchNote('vi')
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Đáp.')], { toolRoundNote: note, roundPolicy: capPolicy() })
    await runAgentRuntime(h.input)
    expect(h.seen[0].system).toBe('SYS' + note)
    expect(h.seen[1].final).toBe(true)
    expect(h.seen[1].system).not.toContain(note)
  })
  it('no tool schema → no note', async () => {
    const note = batchNote('vi')
    const h = harness([step('Đáp.')], { toolRoundNote: note, schemas: {} })
    await runAgentRuntime(h.input)
    expect(h.seen[0].system).toBe('SYS')
  })
  it('several calls in one round run in one round (parallel) and count as one lookup round for the cap', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }], ['get_weather', {}]]), step('Đáp.')], { toolRoundNote: batchNote('vi'), roundPolicy: capPolicy() })
    const run = await runAgentRuntime(h.input)
    expect(h.toolRuns.sort()).toEqual(['get_weather', 'web_search'])
    expect(run.modelCalls).toBe(2)
    expect(budgets(h.trace).find(b => b.decision === 'round_cap')).toMatchObject({ tool_rounds: 1 })
  })
})

describe('L3 · C2_LENGTH_RECOVERY', () => {
  it('a cut answer gets ONE continuation (no tools, marked as the rescue, same cap), joined without the overlap; a normal success', async () => {
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => { logs.push(String(s)) })
    const h = harness([step('Ngày 1: tham quan hồ Xuân Hương, ăn bánh căn', [], 'length'), step('hồ Xuân Hương, ăn bánh căn ở chợ Đà Lạt. Ngày 2: Langbiang.')], { lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(2)
    expect(h.seen[1]).toMatchObject({ final: true, hadTools: false, rescue: true, lastUser: LR.continuationPrompt })
    expect(run.text).toBe('Ngày 1: tham quan hồ Xuân Hương, ăn bánh căn ở chợ Đà Lạt. Ngày 2: Langbiang.')
    expect(run).not.toHaveProperty('incomplete')
    expect(run.status).toBe('answered')
    expect(h.trace.events.find(e => e.kind === 'model_round' && e.decision === 'continuation')).toBeTruthy()
    expect(logs.map(l => JSON.parse(l)).find(l => l.type === 'tappyai_length_recovery')).toMatchObject({ outcome: 'ok' })
  })
  it('still cut after the continuation → flagged incomplete (length_limit), NOTHING appended to the text, no further call', async () => {
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => { logs.push(String(s)) })
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Phần đầu dài', [], 'length'), step('phần tiếp vẫn bị cắt', [], 'length')], { lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(run.incomplete).toBe(true)
    expect(run.incompleteReason).toBe('length_limit')
    expect(run.text).toBe('Phần đầu dài phần tiếp vẫn bị cắt')
    expect(h.seen).toHaveLength(3)
    expect(h.trace.events.find(e => e.kind === 'final' && e.decision === 'incomplete')).toBeTruthy()
    const parsed = logs.map(l => JSON.parse(l))
    expect(parsed.find(l => l.type === 'tappyai_length_recovery')).toMatchObject({ outcome: 'still_cut' })
    expect(parsed.find(l => l.type === 'tappyai_output_incomplete')).toBeTruthy()
  })
  it('a failed or empty continuation keeps the cut text AS IS (incomplete)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const h1 = harness([step('Đáp bị cắt', [], 'length'), () => { throw new Error('upstream 500') }], { lengthRecovery: LR })
    const r1 = await runAgentRuntime(h1.input)
    expect(r1.incomplete).toBe(true); expect(r1.text).toBe('Đáp bị cắt')
    const h2 = harness([step('Đáp bị cắt', [], 'length'), step('   ')], { lengthRecovery: LR })
    const r2 = await runAgentRuntime(h2.input)
    expect(r2.incomplete).toBe(true); expect(r2.text).toBe('Đáp bị cắt')
  })
  it('no time left for a continuation → no extra call, the text as is, incomplete', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    let t = 0
    const h = harness([() => { t = 84_000; return step('Đáp bị cắt', [], 'length') }], { lengthRecovery: LR, now: () => t, deadlineAt: 85_000 })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(1)
    expect(run.incomplete).toBe(true)
    expect(run.text).toBe('Đáp bị cắt')
  })
  it('the budget gate refuses the continuation → no call, incomplete', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const h = harness([step('Đáp bị cắt', [], 'length')], { lengthRecovery: LR, budgetGate: o => ({ verdict: o.messages.length > 1 ? 'stop' : 'ok', reason: 'request_budget' }) })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(1)
    expect(run).toMatchObject({ incomplete: true, incompleteReason: 'length_limit', text: 'Đáp bị cắt' })
  })
  it('the continuation is bounded by maxMs (a hanging upstream is cancelled)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const h = harness([step('Đáp bị cắt', [], 'length')], { lengthRecovery: { ...LR, maxMs: 50 } })
    let aborted = false
    const base = h.input.callModel
    h.input.callModel = async o => h.seen.length === 0 ? base(o) : new Promise((_, rej) => { o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')) }) })
    const t0 = Date.now()
    const run = await runAgentRuntime(h.input)
    expect(Date.now() - t0).toBeLessThan(2_000)
    expect(aborted).toBe(true)
    expect(run.incomplete).toBe(true)
  })
  it('an answer that ended normally is never continued', async () => {
    const h = harness([step('Đáp đủ.')], { lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(1); expect(run.text).toBe('Đáp đủ.')
  })
  it('an EMPTY round cut by the limit uses the ONE rescue: re-run once (same tools, same cap), not forced final', async () => {
    const h = harness([step('', [], 'length'), step('', [['web_search', { query: 'a' }]]), step('Đáp.')], { lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => [s.final, s.hadTools, s.rescue])).toEqual([[false, true, false], [false, true, true], [false, true, false]])
    expect(budgets(h.trace).find(b => b.decision === 'empty_length_rerun')).toBeTruthy()
    expect(run.text).toBe('Đáp.')
  })
  it('ONE rescue per request: a second empty cut round stops the turn (no further call), incomplete', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const h = harness([step('', [], 'length'), step('', [], 'length'), step('Cuối.')], { lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => [s.final, s.rescue])).toEqual([[false, false], [false, true]])
    expect(run).toMatchObject({ incomplete: true, incompleteReason: 'length_limit', status: 'model_error' })
  })
  it('the rescue is SHARED: after an empty re-run, a cut answer gets no continuation (no call), incomplete', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const h = harness([step('', [], 'length'), step('Đáp bị cắt', [], 'length'), step('không bao giờ được gọi')], { lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(2)
    expect(run).toMatchObject({ incomplete: true, incompleteReason: 'length_limit', text: 'Đáp bị cắt' })
  })
  it('an empty cut FINAL round is re-run once, still final', async () => {
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('', [], 'length'), step('Đáp cuối.')], { lengthRecovery: LR, roundPolicy: capPolicy() })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => [s.final, s.rescue])).toEqual([[false, false], [true, false], [true, true]])
    expect(run.text).toBe('Đáp cuối.')
  })
})

describe('L5 · C2_REQUEST_BUDGET gate (the loop side)', () => {
  it('`final_only` on a round that would offer tools makes it the final, tool-less round (request_budget)', async () => {
    const h = harness([step('Đáp trong ngân sách.')], { budgetGate: o => ({ verdict: o.tools ? 'final_only' : 'ok', reason: 'request_budget' }) })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => [s.final, s.hadTools])).toEqual([[true, false]])
    expect(run).toMatchObject({ status: 'answered_after_request_budget', stopReason: 'request_budget', text: 'Đáp trong ngân sách.' })
    expect(budgets(h.trace).find(b => b.decision === 'request_budget_final')).toBeTruthy()
  })
  it('after the 30 s mark (`lookup_cutoff`) the round answers, reported as a time budget', async () => {
    const h = harness([step('Đáp.')], { budgetGate: o => ({ verdict: o.tools ? 'final_only' : 'ok', reason: 'lookup_cutoff' }) })
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('answered_after_time_budget')
  })
  it('`stop` → no model call at all; incomplete (request_budget or deadline)', async () => {
    const h = harness([step('không được gọi')], { budgetGate: () => ({ verdict: 'stop', reason: 'request_budget' }) })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(0)
    expect(run).toMatchObject({ incomplete: true, incompleteReason: 'request_budget', status: 'answered_after_request_budget' })
    const h2 = harness([step('không được gọi')], { budgetGate: () => ({ verdict: 'stop', reason: 'deadline' }) })
    expect(await runAgentRuntime(h2.input)).toMatchObject({ incomplete: true, incompleteReason: 'deadline' })
  })
  it('a lookup round, then the gate allows only the final one: the cap holds for the rest of the request', async () => {
    let n = 0
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Đáp cuối.')], { budgetGate: o => ({ verdict: o.tools && n++ > 0 ? 'final_only' : 'ok', reason: 'request_budget' }) })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(s => s.final)).toEqual([false, true])
    expect(run.text).toBe('Đáp cuối.')
  })
  it('a call the ledger refuses (RequestBudgetError) ends the turn honestly — never retried around', async () => {
    const err = Object.assign(new Error('request_budget_exhausted: agent'), { name: 'RequestBudgetError' })
    const h = harness([step('', [['web_search', { query: 'a' }]]), () => { throw err }, step('không được gọi')])
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(2)
    expect(run).toMatchObject({ incomplete: true, incompleteReason: 'request_budget', stopReason: 'request_budget' })
  })
})

/** A scripted streamed answer: hands `parts` to the gate as deltas, then returns the whole text (what a streamed step resolves to). */
const streamed = (parts: string[], finishReason = 'stop') => (s: Seen) => { for (const p of parts) s.onTextDelta?.(p); return step(parts.join(''), [], finishReason) }

describe('L6 · C2_STREAM_DATASTREAM (the loop side)', () => {
  const sink = () => { const out: string[] = []; return { out, streamAnswer: (t: string) => { out.push(t) } } }
  it('only the tool-less answer round streams; its lines leave as they are written; the final text begins with them', async () => {
    const s = sink()
    const h = harness([step('', [['web_search', { query: 'a' }]]), streamed(['Dòng một.\n', 'Dòng ', 'hai.\nDòng ba'])], { roundPolicy: capPolicy(), streamAnswer: s.streamAnswer })
    const run = await runAgentRuntime(h.input)
    expect(h.seen.map(x => [x.final, x.streamed])).toEqual([[false, false], [true, true]])
    // 6.0 + latency follow-up: a released line's break leaves as soon as the next line has started (and does not open with a source marker)
    expect(s.out).toEqual(['Dòng một.', '\n', 'Dòng hai.', '\n'])
    expect(run.streamed).toEqual({ released: 'Dòng một.\nDòng hai.\n', stop: null })
    expect(run.text).toBe('Dòng một.\nDòng hai.\nDòng ba')
  })
  it('a round that still offers tools never streams (its text could be a lookup preface)', async () => {
    const s = sink()
    const h = harness([step('Trả lời luôn.')], { streamAnswer: s.streamAnswer })
    await runAgentRuntime(h.input)
    expect(h.seen[0].streamed).toBe(false)
    expect(s.out).toEqual([])
  })
  it('a tool-less turn (the tool gate emptied the schemas) streams its first round', async () => {
    const s = sink()
    const h = harness([streamed(['Kiến thức.\n', 'Xong.'])], { streamAnswer: s.streamAnswer, schemas: {} })
    await runAgentRuntime(h.input)
    expect(h.seen[0].streamed).toBe(true)
    expect(s.out).toEqual(['Kiến thức.', '\n'])
  })
  it('text written before (a preface) → the answer does not stream (prefaces are composed in front of it)', async () => {
    const s = sink()
    const h = harness([step('Mình xem nhé.', [['web_search', { query: 'a' }]]), streamed(['Đáp.\n'])], { roundPolicy: capPolicy(), streamAnswer: s.streamAnswer })
    await runAgentRuntime(h.input)
    expect(h.seen[1].streamed).toBe(false)
    expect(s.out).toEqual([])
  })
  it('streamable:false (plan turn / final rewrite) → never streams', async () => {
    const s = sink()
    const h = harness([step('', [['web_search', { query: 'a' }]]), streamed(['Đáp.\n'])], { roundPolicy: capPolicy(), streamAnswer: s.streamAnswer, streamable: false })
    await runAgentRuntime(h.input)
    expect(h.seen.every(x => !x.streamed)).toBe(true)
  })
  it('a retry that would REPLACE a streamed answer is skipped (logged), never run', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const s = sink()
    const h = harness([streamed(['Ừ.\n'])], { streamAnswer: s.streamAnswer, schemas: {}, contentRetry: true, messages: [{ role: 'user', content: 'Nikola Tesla là ai? Biết không?' }] })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(1)
    expect(h.trace.events.find(e => e.decision === 'content_retry_skipped_streamed')).toBeTruthy()
    expect(run.text.startsWith('Ừ.')).toBe(true)
  })
  it('a provider error AFTER part streamed → interrupted: nothing appended, no further call, an error status (refunded by the route)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const s = sink()
    const h = harness([step('', [['web_search', { query: 'a' }]]), (x: Seen) => { x.onTextDelta?.('Một nửa câu trả lời.\n'); throw new Error('upstream died mid-stream') }, step('không được gọi')], { roundPolicy: capPolicy(), streamAnswer: s.streamAnswer })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(2)
    expect(run).toMatchObject({ interrupted: true, status: 'model_error', streamed: { released: 'Một nửa câu trả lời.', stop: 'error' } })
    expect(s.out).toEqual(['Một nửa câu trả lời.'])
  })
  it('the answer written twice: the copy that STREAMED is the one kept (never replaced by the longer second copy)', async () => {
    const s = sink()
    const para = 'Hà Nội là thủ đô của Việt Nam với lịch sử hơn một nghìn năm văn hiến và nhiều di tích nổi tiếng khắp nơi.'
    const longer = para + ' Bản thứ hai dài hơn nhiều, có thêm rất nhiều chữ để dài hơn bản đầu tiên một cách rõ ràng và chắc chắn hơn hẳn.'
    // taskFrameOn: the V3 final-text steps (incl. scrubDegenerate's second-copy rule) run, as in production
    const h = harness([streamed([para + '\n', 'Thêm một câu nữa ở đây cho đủ dài.\n', longer + '\n', 'Kết thúc bản hai với nhiều chữ hơn nữa để dài hơn bản đầu tiên một cách rõ ràng hơn hẳn.'])], { streamAnswer: s.streamAnswer, schemas: {}, taskFrameOn: true })
    const run = await runAgentRuntime(h.input)
    expect(run.streamed?.stop).toBe('second_copy')
    expect(s.out.join('')).toContain('Thêm một câu nữa')
    expect(run.text.startsWith(s.out.join('').trim())).toBe(true)
  })
  it('a cut streamed answer + its continuation: the head that streamed stays, the continuation is the remainder', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const s = sink()
    const h = harness([step('', [['web_search', { query: 'a' }]]), streamed(['Ngày 1: đi chợ.\n', 'Ngày 2: đi'], 'length'), step('biển và ăn hải sản.')], { roundPolicy: capPolicy(), streamAnswer: s.streamAnswer, lengthRecovery: LR })
    const run = await runAgentRuntime(h.input)
    expect(s.out).toEqual(['Ngày 1: đi chợ.', '\n'])
    expect(run.text).toBe('Ngày 1: đi chợ.\nNgày 2: đi biển và ăn hải sản.')
    expect(h.seen[2]).toMatchObject({ rescue: true, streamed: false })
  })
})

describe('L7 · 6.1 (P2 §6): every post-run step that would REPLACE a streamed answer is skipped — one test per kind, each proven live first', () => {
  // Each fixture first runs NOT streamed: the retry must really run (a 2nd model call) — so a fixture that stops triggering its detector fails
  // here instead of silently proving nothing. Streamed, the same fixture: no 2nd call, the skip is traced with its kind, the text that left stays.
  const sink = () => { const out: string[] = []; return { out, streamAnswer: (t: string) => { out.push(t) } } }
  const user = (content: string) => ({ messages: [{ role: 'user' as const, content }] })
  const cases: Array<[string, Partial<RuntimeInput>, string[]]> = [
    ['thin', { contentRetry: true, ...user('Nikola Tesla là ai? Biết không?') }, ['Ừ.\n']],
    ['full_answer', { fullAnswerRetry: true, ...user('Cho mình hỏi Nikola Tesla là ai vậy') }, ['Nikola Tesla là một nhà phát minh nổi tiếng người Serbia gốc Mỹ, cha đẻ của dòng điện xoay chiều.\n']],
    ['deliverables', { taskFrameOn: true, ...user('Cách luộc trứng lòng đào?') }, ['[TAPPY_TASK]{"kind":"how_to","constraints":[],"servings":null,"missing":[]}[/TAPPY_TASK]\n', 'Bạn cứ làm từ từ là được nhé.\n']],
    ['contract_ask_only', { taskFrameOn: true, ...user('Đi Quy Nhơn 3 ngày 2 đêm cho hai người') }, ['[TAPPY_TASK]{"kind":"trip_plan","constraints":[],"servings":null,"missing":[]}[/TAPPY_TASK]\n', 'Hai bạn đi từ đâu?\n']],
    ['plan_not_question', { taskFrameOn: true, ...user('đà lạt 2N1Đ cho 2 người') }, ['Bạn đi tháng mấy?\n', '1. Tháng 11\n', '2. Tháng 12\n']],
  ]
  it.each(cases)('%s: not streamed → the retry runs; streamed → skipped (traced with its kind), no 2nd call, the streamed text stays', async (kind, over, parts) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const live = harness([step(parts.join('')), step('Câu trả lời thay thế đầy đủ hơn nhiều.')], { schemas: {}, ...over })
    await runAgentRuntime(live.input)
    expect(live.seen, `${kind}: the fixture no longer triggers its retry`).toHaveLength(2)
    const s = sink()
    const h = harness([streamed(parts), step('không được gọi')], { schemas: {}, streamAnswer: s.streamAnswer, ...over })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(1)
    expect(h.trace.events.find(e => e.decision === 'content_retry_skipped_streamed')).toMatchObject({ kind })
    expect(s.out.join('').trim()).not.toBe('')
    expect(run.text.startsWith(s.out.join('').trim())).toBe(true)
  })
  it('final rewrite: a streamed answer is never rewritten (no 2nd call); not streamed it is', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const live = harness([step('Bản nháp trả lời.')], { schemas: {}, finalRewrite: true })
    await runAgentRuntime(live.input)
    expect(live.seen).toHaveLength(2)
    const s = sink()
    const h = harness([streamed(['Bản nháp trả lời.\n', 'Dòng hai.']), step('không được gọi')], { schemas: {}, finalRewrite: true, streamAnswer: s.streamAnswer })
    const run = await runAgentRuntime(h.input)
    expect(h.seen).toHaveLength(1)
    expect(run.text.startsWith('Bản nháp trả lời.')).toBe(true)
  })
  it('a streamable() that turns false (6.0 F-1: sources arrived) stops the NEXT round from streaming — asked before every round', async () => {
    const s = sink()
    let calls = 0
    const h = harness([step('', [['web_search', { query: 'a' }]]), streamed(['Đáp.\n', 'Hết.'])], { roundPolicy: capPolicy(), streamAnswer: s.streamAnswer, streamable: () => { calls++; return calls < 2 } })
    await runAgentRuntime(h.input)
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(h.seen.map(x => x.streamed)).toEqual([false, false])
    expect(s.out).toEqual([])
  })
})

describe('L4 · round-start hook', () => {
  it('reports each round with final / afterLookup; a throwing hook never breaks the turn', async () => {
    const seen: Array<{ round: number; final: boolean; afterLookup: boolean }> = []
    const h = harness([step('', [['web_search', { query: 'a' }]]), step('Đáp.')], { roundPolicy: capPolicy(), onRoundStart: r => { seen.push(r); throw new Error('ui') } })
    const run = await runAgentRuntime(h.input)
    expect(seen).toEqual([{ round: 1, final: false, afterLookup: false }, { round: 2, final: true, afterLookup: true }])
    expect(run.text).toBe('Đáp.')
  })
})

describe('L8 · the final text keeps the script the user wrote in (UAT round 19/10, u03)', () => {
  it('a Thai question: the Thai answer reaches the user; a Vietnamese question: stray Thai letters are still removed', async () => {
    const th = harness([step('เมลเบิร์นตอนนี้ 21°C ท้องฟ้าแจ่มใส')], { messages: [{ role: 'user', content: 'วันนี้อากาศที่เมลเบิร์นเป็นยังไง?' }], schemas: {}, taskFrameOn: true })
    expect((await runAgentRuntime(th.input)).text).toBe('เมลเบิร์นตอนนี้ 21°C ท้องฟ้าแจ่มใส')
    const vi_ = harness([step('Trời đẹp ทดสอบ lắm.')], { messages: [{ role: 'user', content: 'Thời tiết hôm nay?' }], schemas: {}, taskFrameOn: true })
    expect((await runAgentRuntime(vi_.input)).text).not.toMatch(/[฀-๿]/)
  })
})
