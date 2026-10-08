// Phase 8 M1 — the agent runtime loop (TAPPY_AGENT=2): answer / ask / tools / iterate, hard ceilings, cancellation, trace.
// The model is scripted; tools are fakes. No network.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace, traceTailStream, resultCount, traceQuery, toolInputHash } from './trace'
import { parseAskUser, renderAsk, ASK_USER } from './controlTools'
import { AGENT_SYSTEM_V2 } from './prompt'
import { AGENT_SYSTEM } from '../prompt'
import { RUNTIME_LIMITS, serperCeiling } from './limits'
import { sanitizePayload } from '@/lib/observability/events'

type Script = Array<RuntimeStep | ((o: { final: boolean; signal: AbortSignal; tools?: Record<string, unknown> }) => Promise<RuntimeStep>)>

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${Math.random().toString(36).slice(2)}${i}`, toolName, args })),
})

function harness(script: Script, over: Partial<RuntimeInput> = {}) {
  const calls: Array<{ final: boolean; hadTools: boolean }> = []
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const toolRuns: Array<{ name: string; args: Record<string, unknown> }> = []
  const tools = {
    web_search: { execute: async (a: Record<string, unknown>) => { toolRuns.push({ name: 'web_search', args: a }); return { results: [{ title: 'r', link: 'https://x.example/a', snippet: 's' }] } } },
    search_places: { execute: async (a: Record<string, unknown>) => { toolRuns.push({ name: 'search_places', args: a }); return { results: [{ name: 'Quán A' }, { name: 'Quán B' }] } } },
  }
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'hi' }], tools, schemas: { web_search: {}, search_places: {}, [ASK_USER]: {} },
    callModel: async o => {
      calls.push({ final: o.final, hadTools: !!o.tools })
      const next = script.shift()
      if (!next) return step(o.final ? 'Câu trả lời cuối.' : 'Mặc định.')
      return typeof next === 'function' ? next(o) : next
    },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace, ...over,
  }
  return { input, calls, trace, toolRuns }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('M1 · answer / ask / tool', () => {
  it('answers directly: one model round, no tool, trace decision "answer"', async () => {
    const h = harness([step('Phở bò dùng xương bò.')])
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('answered')
    expect(run.modelCalls).toBe(1)
    expect(run.toolCalls).toBe(0)
    expect(h.trace.events.map(e => e.kind)).toEqual(['model_round'])
    expect(h.trace.events[0].decision).toBe('answer')
  })

  it('ask_user ends the turn with the question; choices become quick-reply chips; other calls of that step are dropped', async () => {
    const h = harness([step('', [[ASK_USER, { question: 'Bạn dùng laptop để làm gì và tầm bao nhiêu tiền', choices: ['Văn phòng', 'Đồ hoạ', 'Gaming'], why: 'cần nhu cầu' }], ['web_search', { query: 'laptop tốt' }]])])
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('asked')
    expect(run.stopReason).toBe('asked')
    expect(run.text).toBe('Bạn dùng laptop để làm gì và tầm bao nhiêu tiền?\n\n[FOLLOWUPS]Văn phòng|Đồ hoạ|Gaming[/FOLLOWUPS]')
    expect(h.toolRuns).toHaveLength(0)
    expect(h.trace.events.find(e => e.kind === 'budget')).toMatchObject({ decision: 'ask_preempts_tools', dropped: ['web_search'] })
    expect(h.trace.events.find(e => e.kind === 'ask')).toMatchObject({ choices: 3 })
  })

  it('an unusable ask (empty question) is not a reply: the other calls still run', async () => {
    const h = harness([step('', [[ASK_USER, { question: '' }], ['web_search', { query: 'x' }]]), step('Xong.')])
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('answered')
    expect(h.toolRuns).toHaveLength(1)
  })

  it('iterative research: search → search again → answer (three rounds, tools fed back each time)', async () => {
    const h = harness([
      step('', [['web_search', { query: 'macbook air m1 cycle count bình thường' }]]),
      step('', [['web_search', { query: 'kiểm tra MDM macbook cũ' }]]),
      step('Kiểm tra số chu kỳ sạc, Activation Lock và MDM.'),
    ])
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('answered')
    expect(run.modelCalls).toBe(3)
    expect(run.toolCalls).toBe(2)
    expect(h.calls.every(c => c.hadTools)).toBe(true)
    const kinds = h.trace.events.map(e => e.kind)
    expect(kinds).toEqual(['model_round', 'tool_call', 'tool_result', 'model_round', 'tool_call', 'tool_result', 'model_round'])
  })

  it('early stop: the model may answer after one lookup — the ceilings are never used up for their own sake', async () => {
    const h = harness([step('', [['search_places', { query: 'phở quận 1' }]]), step('**Quán A** gần bạn.')])
    const run = await runAgentRuntime(h.input)
    expect(run.modelCalls).toBe(2)
    expect(run.toolCalls).toBe(1)
  })
})

describe('M1 · hard ceilings', () => {
  it('tool calls ≤ 8: further calls are refused, traced, and the next step is the tool-less final answer', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ['web_search', { query: `q${i}` }] as [string, Record<string, unknown>])
    const h = harness([step('', many)])
    const run = await runAgentRuntime(h.input)
    expect(h.toolRuns).toHaveLength(RUNTIME_LIMITS.maxToolCalls)
    expect(run.toolCalls).toBe(8)
    expect(run.status).toBe('answered_after_tool_budget')
    expect(h.calls.at(-1)).toEqual({ final: true, hadTools: false })
    expect(h.trace.counters.budgetRefusals).toBe(2)
    expect(h.trace.events.filter(e => e.kind === 'budget' && e.decision === 'tool_refused')).toHaveLength(2)
  })

  it('model rounds ≤ 6: a model that never stops searching is forced to answer on round 6', async () => {
    const script: Script = Array.from({ length: 10 }, (_, i) => step('', [['web_search', { query: `vòng ${i}` }]]))
    const h = harness(script)
    const run = await runAgentRuntime(h.input)
    expect(run.modelCalls).toBe(RUNTIME_LIMITS.maxModelRounds)
    expect(run.status).toBe('answered_after_round_budget')
    expect(h.calls.filter(c => c.final)).toHaveLength(1)
    expect(h.calls.at(-1)?.hadTools).toBe(false)
  })

  it('deadline: with less than the final reserve left, the step is the final one (no tools, time_budget)', async () => {
    const h = harness([step('Trả lời nhanh.')], { deadlineAt: Date.now() + 10_000 })
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('answered_after_time_budget')
    expect(h.calls[0]).toEqual({ final: true, hadTools: false })
  })

  it('deadline: below the minimum step time no model call starts at all', async () => {
    const h = harness([], { deadlineAt: Date.now() + 500 })
    const run = await runAgentRuntime(h.input)
    expect(run.modelCalls).toBe(0)
    expect(run.stopReason).toBe('time_budget')
    expect(run.text).toMatch(/Xin lỗi/)
  })

  it('Serper ceilings: 12 normal, 15 travel research', () => {
    expect(serperCeiling(false)).toBe(12)
    expect(serperCeiling(true)).toBe(15)
    expect(RUNTIME_LIMITS.deadlineMs).toBe(85_000)
  })
})

describe('M1 · failures, timeouts and cancellation', () => {
  it('a tool that throws becomes an error result the model reads; the turn continues', async () => {
    const h = harness([step('', [['web_search', { query: 'x' }]]), step('Phần này chưa kiểm tra được.')], {})
    h.input.tools.web_search = { execute: async () => { throw new Error('boom') } }
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('answered')
    expect(run.toolEvents[0].outcome).toBe('error')
    expect(h.trace.events.find(e => e.kind === 'error')).toMatchObject({ scope: 'tool', tool: 'web_search' })
  })

  it('a tool that times out is CANCELLED (its signal aborts) before the loop moves on', async () => {
    let seen: AbortSignal | null = null
    const h = harness([step('', [['web_search', { query: 'chậm' }]]), step('Chưa kiểm tra được phần đó.')], {
      limits: { toolTimeoutMs: 30, finalReserveMs: 0 },
      runTool: async (_n, signal, fn) => { seen = signal; return { value: await fn(), credits: 1 } },
    })
    h.input.tools.web_search = { execute: () => new Promise(() => { /* never settles */ }) }
    const run = await runAgentRuntime(h.input)
    expect(seen).not.toBeNull()
    expect(seen!.aborted).toBe(true)
    expect(run.toolEvents[0].outcome).toBe('timeout')
    expect(h.trace.events.find(e => e.kind === 'timeout')).toMatchObject({ scope: 'tool', cancelled: true })
    expect(run.status).toBe('answered')
  })

  it('a model step that times out is CANCELLED (its signal aborts); the next step is the tool-less final answer', async () => {
    let first: AbortSignal | null = null
    const h = harness([
      o => { first = o.signal; return new Promise(() => { /* hangs */ }) },
      step('Câu trả lời sau khi bước trước bị huỷ.'),
    ], { limits: { stepTimeoutMs: 30 } })
    const run = await runAgentRuntime(h.input)
    expect(first!.aborted).toBe(true)
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]).toEqual({ final: true, hadTools: false })
    expect(run.text).toContain('sau khi bước trước bị huỷ')
    expect(h.trace.counters.timeouts).toBe(1)
  })

  it('the outer request signal aborts the turn', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const h = harness([step('x')], { signal: ctrl.signal })
    const run = await runAgentRuntime(h.input)
    expect(run.status).toBe('aborted')
  })

  it('a model-layer retry is traced (primary aborted before the retry)', async () => {
    const s = step('ok')
    s.providerMetadata = { tappy: { fellBack: true, primaryAborted: true, fallbackReason: 'first_part_timeout_25000ms' } }
    const h = harness([s])
    await runAgentRuntime(h.input)
    expect(h.trace.counters.retries).toBe(1)
    expect(h.trace.events.find(e => e.kind === 'retry')).toMatchObject({ scope: 'model', primary_aborted: true })
  })

  it('duplicate calls are refused; control tools are never executed; disallowed tools are blocked', async () => {
    const h = harness([step('', [['web_search', { query: 'A' }], ['web_search', { query: 'a ' }], ['save_price_watch', { q: 1 }]]), step('xong')], { disallowedTools: new Set(['save_price_watch']) })
    const run = await runAgentRuntime(h.input)
    expect(h.toolRuns).toHaveLength(1)
    expect(run.toolEvents.map(e => e.outcome)).toEqual(['ok', 'duplicate', 'blocked'])
  })
})

describe('M1 · trace', () => {
  it('finish() emits ONE console trace and ONE allow-listed Cloud Logging event; idempotent', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const h = harness([step('', [['search_places', { query: 'phở quận 1 email a@b.co' }]]), step('**Quán A**.')])
    await runAgentRuntime(h.input)
    h.trace.guard('place_claim', 'abcdef', 'abc')
    h.trace.finish({ delivered: '**Quán A**.', cards: 2 })
    h.trace.finish({ delivered: 'again', cards: 0 })
    const lines = log.mock.calls.map(c => String(c[0])).filter(s => s.includes('tappyai_agent_run_trace'))
    expect(lines).toHaveLength(1)
    const t = JSON.parse(lines[0])
    expect(t).toMatchObject({ final_output_type: 'cards', status: 'answered', model_role: 'agent', flag: 'TAPPY_AGENT=2', limits: { serper: 12, deadline_ms: 85_000 } })
    expect(t.trace_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(t.totals).toMatchObject({ modelRounds: 2, toolCalls: 1, guardChanges: 1, guardCharsRemoved: 3 })
    const call = t.events.find((e: { kind: string }) => e.kind === 'tool_call')
    expect(call.query).not.toContain('a@b.co') // contact data never logged
    expect(call.input_hash).toMatch(/^[0-9a-f]{16}$/)
    expect(t.events.find((e: { kind: string }) => e.kind === 'tool_result')).toMatchObject({ result_count: 2 })
    expect(t.events.at(-1)).toMatchObject({ kind: 'final', output_type: 'cards' })
  })

  it('the Cloud Logging summary survives the allow-list intact (no field dropped)', () => {
    const ev = { type: 'tappyai_agent_run', traceId: 'x', agentStatus: 'answered', stopReason: 'model_answered', outputType: 'text', providerId: 'openai', modelRole: 'agent', modelRounds: 1, toolCalls: 0, serperCredits: 0, serperLimit: 12, timeouts: 0, retries: 0, budgetRefusals: 0, errors: 0, guardChanges: 0, promptTokens: 1, completionTokens: 1, costMicroUsd: 1, elapsedMs: 1 }
    expect(Object.keys(sanitizePayload(ev)).sort()).toEqual(Object.keys(ev).sort())
  })

  it('traceTailStream passes every byte through unchanged and reads output type at the end', async () => {
    const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const body = '9:{"toolCallId":"1"}\n0:"Ngày 1 "\n0:"[TAPPY_PLAN]{\\"days\\":[]}[/TAPPY_PLAN]"\nd:{}\n'
    const out = await new Response(new Response(body).body!.pipeThrough(traceTailStream(trace))).text()
    expect(out).toBe(body)
    const t = JSON.parse(String(log.mock.calls.find(c => String(c[0]).includes('tappyai_agent_run_trace'))![0]))
    expect(t.final_output_type).toBe('plan')
  })

  it('null trace = plain pass-through (TAPPY_AGENT unset / 1)', async () => {
    const out = await new Response(new Response('0:"x"\n').body!.pipeThrough(traceTailStream(null))).text()
    expect(out).toBe('0:"x"\n')
  })

  it('helpers: result rows, redacted query, stable input hash', () => {
    expect(resultCount({ hotels: { results: [1, 2] }, attractions: { results: [1] }, food: { results: [] } })).toBe(3)
    expect(traceQuery({ query: 'quán ăn sk-abcdefghijklmnopqrstu' })).not.toContain('sk-')
    expect(toolInputHash('t', { b: 1, a: 2 })).toBe(toolInputHash('t', { a: 2, b: 1 }))
  })
})

describe('M1 · ask_user parsing and prompt', () => {
  it('normalises the question and drops unusable choices', () => {
    expect(parseAskUser({ question: '  Bạn muốn đi đâu  ' })).toEqual({ question: 'Bạn muốn đi đâu?', choices: [] })
    expect(parseAskUser({ question: 'Ngân sách?', choices: ['Dưới 10tr', 'a|b', '', 'https://evil.example x'] })?.choices).toEqual(['Dưới 10tr', 'a b', 'x'])
    expect(parseAskUser({ question: 'x' })).toBeNull()
    expect(parseAskUser({ question: 'Hỏi gì? [TAPPY_PLAN]' })?.question).not.toContain('TAPPY_PLAN')
    expect(renderAsk({ question: 'Đi đâu?', choices: [] })).toBe('Đi đâu?')
  })

  it('AGENT_SYSTEM_V2 rewrites the Phase 7 limits; AGENT_SYSTEM (TAPPY_AGENT=1) is unchanged', () => {
    expect(AGENT_SYSTEM_V2).not.toContain('Tối đa 3 lần gọi công cụ')
    expect(AGENT_SYSTEM_V2).toContain('đủ để trả lời tốt chưa?')
    expect(AGENT_SYSTEM_V2).toContain('ask_user')
    expect(AGENT_SYSTEM).toContain('Tối đa 3 lần gọi công cụ')
    expect(AGENT_SYSTEM_V2).toContain('[TAPPY_PLAN]') // the Make Plan contract stays in the instructions
  })
})
