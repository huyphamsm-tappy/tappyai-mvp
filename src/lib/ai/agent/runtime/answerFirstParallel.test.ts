// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'

// The answer-before-lookup check (a text-only model call) runs WHILE the lookup runs when `parallelAnswerFirst` is set: same text, less waiting.

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}`, toolName, args })),
})
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run(parallel: boolean) {
  const order: string[] = []
  const script = [step('', [['web_search', { query: 'x' }]]), step('Trả lời sau tra cứu.')]
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'giá xăng?' }], schemas: { web_search: {} },
    tools: { web_search: { execute: async () => { order.push('tool_start'); await sleep(80); order.push('tool_end'); return { results: [{ title: 'r', link: 'https://x.example/a', snippet: 's' }] } } } },
    callModel: async () => script.shift() ?? step('xong'),
    answerFirstModel: async () => { order.push('check_start'); await sleep(80); order.push('check_end'); return { text: 'Phần đã biết trước khi tra cứu: giá xăng thay đổi theo kỳ điều hành.' } },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 8, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    ...(parallel ? { parallelAnswerFirst: true } : {}),
  }
  const t0 = Date.now()
  const r = await runAgentRuntime(input)
  return { r, ms: Date.now() - t0, order }
}

describe('answer-first check in parallel with the lookup (flag on)', () => {
  it('same final text and same answerFirst outcome; the two overlap; faster than sequential', async () => {
    const seq = await run(false)
    const par = await run(true)
    expect(par.r.text).toBe(seq.r.text)
    expect(par.r.text).toContain('Phần đã biết trước khi tra cứu')
    expect(par.r.answerFirst).toBe('provided')
    expect(seq.order.join()).toBe('check_start,check_end,tool_start,tool_end')
    expect(par.order.slice(0, 2).sort().join()).toBe('check_start,tool_start')
    expect(par.ms).toBeLessThan(seq.ms - 40)
  })
  it('a failing check never breaks the turn (parallel)', async () => {
    const input: RuntimeInput = {
      system: 'SYS', messages: [{ role: 'user', content: 'x' }], schemas: { web_search: {} },
      tools: { web_search: { execute: async () => ({ results: [] }) } },
      callModel: (() => { const s = [step('', [['web_search', { query: 'x' }]]), step('Xong.')]; return async () => s.shift() ?? step('xong') })(),
      answerFirstModel: async () => { throw new Error('boom') },
      deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 8, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
      parallelAnswerFirst: true,
    }
    const r = await runAgentRuntime(input)
    expect(r.status).toBe('answered')
    expect(r.answerFirst).toBe('failed')
    expect(r.text).toContain('Xong.')
  })
})
