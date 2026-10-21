// RETRIEVAL_V5 in the runtime loop (loop.ts): sửa đổi 1 — an answer holding a tool call written as text is rewritten once without tools, then
// the fixed line; after part of it streamed it is cut before the line; sửa đổi 3 — a turn that needs current facts never ends on a first-round
// answer without a lookup. Scripted model, fake tools. No network.
import { describe, it, expect } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { toolSyntaxGuard } from '@/lib/ai/retrievalV5/toolSyntax'

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}${Math.random().toString(36).slice(2)}`, toolName, args })),
})
const LEAK = '{"queries":["site:x.vn hộ chiếu"]}\nto=functions.web_search 代'

function harness(script: RuntimeStep[], over: Partial<RuntimeInput> = {}) {
  const calls: Array<{ final: boolean; system: string; tools: boolean }> = []
  const toolRuns: Array<Record<string, unknown>> = []
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'Lãi vay doanh nghiệp nhỏ hôm nay?' }], schemas: { web_search: {} },
    tools: { web_search: { execute: async (a: Record<string, unknown>) => { toolRuns.push(a); return { results: [{ title: 'r', link: 'https://x.vn/a', snippet: 's' }] } } } as never },
    callModel: async o => { calls.push({ final: o.final, system: o.system, tools: !!o.tools }); return script.shift() ?? step('Mặc định.') },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace, ...over,
  }
  return { input, calls, toolRuns, trace }
}

describe('sửa đổi 1 · a tool call written as text never reaches the answer', () => {
  it('the final answer is a tool call (u28) → ONE rewrite without tools, with the rewrite note; the clean rewrite is the answer', async () => {
    const h = harness([step('', [['web_search', { queries: ['q'] }]]), step(LEAK), step('Đại sứ quán ở Elsenstraße 3, Berlin [S1].')], { toolSyntax: toolSyntaxGuard('vi'), roundPolicy: () => ({ final: true, reason: 'v5_research_done' }) })
    const run = await runAgentRuntime(h.input)
    expect(run.text).toBe('Đại sứ quán ở Elsenstraße 3, Berlin [S1].')
    expect(h.calls).toHaveLength(3)
    expect(h.calls[2]).toMatchObject({ final: true, tools: false })
    expect(h.calls[2].system).toContain('KHÔNG CÒN CÔNG CỤ')
    expect(h.trace.events.some(e => (e as Record<string, unknown>).stage === 'tool_syntax' && (e as Record<string, unknown>).outcome === 'rewritten')).toBe(true)
  })
  it('the rewrite is a tool call again → the fixed fallback line, never the syntax', async () => {
    const h = harness([step('', [['web_search', { queries: ['q'] }]]), step(LEAK), step(LEAK)], { toolSyntax: toolSyntaxGuard('vi'), roundPolicy: () => ({ final: true, reason: 'v5_research_done' }) })
    const run = await runAgentRuntime(h.input)
    expect(run.text).toBe(toolSyntaxGuard('vi').fallback)
    expect(run.text).not.toContain('functions')
  })
  it('a first-round answer (no lookup) that is a tool call is caught too', async () => {
    const h = harness([step(LEAK), step('Câu trả lời sạch.')], { toolSyntax: toolSyntaxGuard('vi') })
    const run = await runAgentRuntime(h.input)
    expect(run.text).toBe('Câu trả lời sạch.')
  })
  it('the streamed final round: the gate stops before the tool-call line, the answer is cut there (nothing after it is shown)', async () => {
    const released: string[] = []
    const h = harness([step('', [['web_search', { queries: ['q'] }]])], {
      toolSyntax: toolSyntaxGuard('vi'), roundPolicy: () => ({ final: true, reason: 'v5_research_done' }), streamAnswer: (t: string) => released.push(t),
      callModel: async o => {
        if (!o.final) return step('', [['web_search', { queries: ['q'] }]])
        const text = 'Phần đầu đúng.\nto=functions.web_search {"q":1}\nphần sau'
        for (const line of text.split(/(?<=\n)/)) o.onTextDelta?.(line)
        return step(text)
      },
    })
    const run = await runAgentRuntime(h.input)
    expect(released.join('')).toBe('Phần đầu đúng.')
    expect(run.text).toBe('Phần đầu đúng.')
  })
  it('without the guard (V3 / V4) nothing changes', async () => {
    const h = harness([step('', [['web_search', { queries: ['q'] }]]), step(LEAK)], { roundPolicy: () => ({ final: true, reason: 'x' }) })
    const run = await runAgentRuntime(h.input)
    expect(run.text).toContain('to=functions')
  })
})

describe('sửa đổi 3 · a turn that needs current facts never ends without a lookup', () => {
  it('the model answered its first round without tools (u29) → the required lookup runs instead; the draft is dropped', async () => {
    const h = harness([step('Bạn hỏi ở nước nào?'), step('BIDV từ 6%/năm [S1].')], {
      requireLookup: async () => ({ tool: 'web_search', args: { queries: ['Lãi vay doanh nghiệp nhỏ hôm nay?'] } }),
    })
    const run = await runAgentRuntime(h.input)
    expect(h.toolRuns).toEqual([{ queries: ['Lãi vay doanh nghiệp nhỏ hôm nay?'] }])
    expect(run.text).toBe('BIDV từ 6%/năm [S1].')
    expect(h.trace.events.some(e => (e as Record<string, unknown>).decision === 'forced_lookup')).toBe(true)
  })
  it('no current facts needed (requireLookup → null): the direct answer stands', async () => {
    const h = harness([step('Chào bạn!')], { requireLookup: async () => null })
    const run = await runAgentRuntime(h.input)
    expect(run.text).toBe('Chào bạn!')
    expect(h.toolRuns).toEqual([])
  })
  it('the model looked something up itself: nothing is forced', async () => {
    let asked = 0
    const h = harness([step('', [['web_search', { queries: ['q'] }]]), step('Đáp [S1].')], { requireLookup: async () => { asked++; return { tool: 'web_search', args: { queries: ['x'] } } } })
    await runAgentRuntime(h.input)
    expect(asked).toBe(0)
    expect(h.toolRuns).toHaveLength(1)
  })
})
