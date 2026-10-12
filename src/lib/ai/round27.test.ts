// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { agentSystemV2For } from './agent/runtime/consultativeVoice'
import { AGENT_SYSTEM_V2 } from './agent/runtime/prompt'
import { AGENT_SYSTEM } from './agent/prompt'
import { askVerdict } from './agent/runtime/askGate'
import { buildLeakDetector } from './consultative/lunaSafety'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './agent/runtime/loop'
import { AgentRunTrace } from './agent/runtime/trace'

// Round 27 (B): "biết tesla ko" — Tappy answered the car brand and asked only about the scope (chat 81d50b17 turn 2: one model call, no tool, no ask_user). Nothing in code or
// prompt forced the car meaning; the prompt had no rule for a proper name with several common meanings. One flag-on rule is added (consultativeVoice.ts).
const RULE = 'Tên riêng nhiều nghĩa: khi người dùng nhắc một tên riêng có nhiều nghĩa phổ biến và ngữ cảnh chưa xác định rõ nghĩa nào'

describe('B — the ambiguous-proper-name rule (flag on only)', () => {
  const on = agentSystemV2For(true)
  it('flag on: the rule is in the prompt, once, with its "clear context → answer directly" half and the "no web needed" half', () => {
    expect(on).toContain(RULE)
    expect(on.split(RULE)).toHaveLength(2)
    expect(on).toContain('Nếu ngữ cảnh đã rõ, trả lời trực tiếp, không hỏi lại máy móc')
    expect(on).toContain('thì không cần tra web')
    expect(on).toContain('hai nghĩa phù hợp nhất')
  })
  it('flag off: the base prompt is returned as is (same string) and has none of it', () => {
    expect(agentSystemV2For(false)).toBe(AGENT_SYSTEM_V2)
    expect(agentSystemV2For(false)).not.toContain('Tên riêng nhiều nghĩa')
    expect(AGENT_SYSTEM).not.toContain('Tên riêng nhiều nghĩa')
  })
  it('the rule does not push the model to search: it says a simple "biết X không" needs no web search', () => {
    const line = on.split('\n').find(l => l.startsWith('- Tên riêng nhiều nghĩa'))!
    expect(line).toMatch(/không cần tra web/)
    expect(line).not.toMatch(/BẮT BUỘC/)
  })
  it('the prompt-echo guard (flag on, runs) does not flag a reply that repeats the example sentence', () => {
    const detect = buildLeakDetector([AGENT_SYSTEM, on], { runs: true })
    expect(detect('Biết chứ. Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?').leak).toBe(false)
  })
})

describe('B — no code path forces the meaning of "Tesla" or blocks the clarification', () => {
  it('the ask gate lets a "which Tesla?" question through, for the ambiguous and for the clear question', () => {
    expect(askVerdict('biết tesla ko', 'Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?', 'vi')).toBeNull()
    expect(askVerdict('Nikola Tesla có bao nhiêu bằng sáng chế?', 'Bạn muốn số bằng sáng chế được cấp hay đã nộp?', 'vi')).toBeNull()
  })
  const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
    text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
    toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}`, toolName, args })),
  })
  async function run(user: string, script: RuntimeStep[]) {
    const s = [...script]
    const executed: string[] = []
    const input: RuntimeInput = {
      system: 'SYS', messages: [{ role: 'user', content: user }], schemas: { web_search: {}, ask_user: {} },
      tools: { web_search: { execute: async () => { executed.push('web_search'); return { results: [{ title: 'Nikola Tesla', link: 'https://vi.wikipedia.org/wiki/Nikola_Tesla', snippet: '278 patents' }] } } } },
      callModel: async () => s.shift() ?? step('xong'),
      deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 8, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
      dedupeParaphrase: true, parallelAnswerFirst: true,
    }
    const r = await runAgentRuntime(input)
    return { r, executed }
  }
  it('"biết tesla ko": a clarifying answer from the model is returned as written (nothing rewrites it into a car-brand question), no tool', async () => {
    const q = 'Biết chứ. Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?'
    const x = await run('biết tesla ko', [step(q)])
    expect(x.r.text).toBe(q)
    expect(x.executed).toEqual([])
    expect(x.r.modelCalls).toBe(1)
  })
  it('"Nikola Tesla có bao nhiêu bằng sáng chế?": the search path stays available and the answer comes straight, with no forced clarification', async () => {
    const a = 'Nikola Tesla có khoảng 278 bằng sáng chế theo Wikipedia.'
    const x = await run('Nikola Tesla có bao nhiêu bằng sáng chế?', [step('', [['web_search', { query: 'Nikola Tesla số bằng sáng chế' }]]), step(a)])
    expect(x.executed).toEqual(['web_search'])
    expect(x.r.text).toContain('278')
    expect(x.r.ask).toBeFalsy()
  })
})
