// TAPPY_ANSWER_V4 · per-tool time budgets (RuntimeInput.toolTimeouts). UAT 19/10, u29: the hosted web search took 21.8 s and 16.3 s; the runtime cut
// every tool at 15 s, so both searches came back as TIMEOUT — the model got nothing and answered "I can't verify", while the searches ran on (billed)
// and the model searched a second time. A tool with its own budget runs to it, and a timed-out one receives the abort (it really stops).
// Scripted model, fake tools, short budgets. No network.
import { describe, it, expect } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}${Math.random().toString(36).slice(2)}`, toolName, args })),
})

function run(webMs: number, over: Partial<RuntimeInput> = {}) {
  const script = [step('', [['web_search', { queries: ['lãi suất vay'] }]]), step('Đáp.')]
  const seen: { signal: AbortSignal | null; aborted: boolean } = { signal: null, aborted: false }
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'hi' }], schemas: { web_search: {} },
    tools: {
      web_search: {
        execute: (_a: Record<string, unknown>, ctx?: { abortSignal?: AbortSignal }) => new Promise(resolve => {
          seen.signal = ctx?.abortSignal ?? null
          ctx?.abortSignal?.addEventListener('abort', () => { seen.aborted = true })
          setTimeout(() => resolve({ tool_state: 'SUCCESS', web_findings: '- 5,6%/năm [S1]' }), webMs)
        }),
      } as never,
    },
    callModel: async () => script.shift() ?? step('Đáp.'),
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace,
    limits: { toolTimeoutMs: 40, finalReserveMs: 0 },
    ...over,
  }
  return { result: runAgentRuntime(input), seen }
}

// the loop floors every tool budget at 1 s (loop.ts `Math.max(1_000, …)`): the default here is that 1 s
describe('toolTimeouts', () => {
  it('without its own budget (V3): a 1.4 s search is cut at the 1 s default, and gets no abort signal (unchanged)', async () => {
    const r = run(1_400)
    const out = await r.result
    expect(out.toolEvents[0].outcome).toBe('timeout')
    expect(r.seen.signal).toBeNull()
  })
  it('with its own budget (V4 hosted search): the 1.4 s search finishes and its findings reach the model', async () => {
    const r = run(1_400, { toolTimeouts: { web_search: 3_000 } })
    const out = await r.result
    expect(out.toolEvents[0].outcome).toBe('ok')
    expect(r.seen.aborted).toBe(false)
  })
  it('past its own budget: a timeout at that budget, and the tool receives the abort (the call really stops)', async () => {
    const r = run(4_000, { toolTimeouts: { web_search: 1_500 } })
    const t0 = Date.now()
    const out = await r.result
    expect(out.toolEvents[0].outcome).toBe('timeout')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1_400)
    expect(Date.now() - t0).toBeLessThan(3_000)
    expect(r.seen.signal).not.toBeNull()
    expect(r.seen.aborted).toBe(true)
  })
  it('the deadline still bounds it: a budget beyond (deadline − final reserve) is cut there', async () => {
    const r = run(4_000, { toolTimeouts: { web_search: 30_000 }, deadlineAt: Date.now() + 3_500, limits: { toolTimeoutMs: 40, finalReserveMs: 2_000 } })
    const t0 = Date.now()
    const out = await r.result
    expect(out.toolEvents[0].outcome).toBe('timeout')
    expect(Date.now() - t0).toBeLessThan(3_000)
  })
}, 20_000)
