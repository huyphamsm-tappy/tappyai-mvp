// Phase 8 orchestration fix — evidence reuse and "no tool unless needed", asserted on the loop's DECISIONS (tool calls), not on prose.
// The model is scripted (the real choice is Luna's and is judged in live UAT, not here); what these pin is what CODE does with the
// choice: nothing runs on a no-tool turn, an ask runs no tool, an identical call is refused, and what a lookup received is
// remembered so the next turn's context names it. No network.
import { describe, it, expect } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { ASK_USER } from './controlTools'
import { createTask, conversationIdOf, recordResearch, taskContextLines } from './task'

const NOW = new Date('2026-10-09T05:00:00Z')
const conv = conversationIdOf('22222222-2222-4222-8222-222222222222')!

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}${toolName}`, toolName, args })),
})

function turn(script: RuntimeStep[]) {
  const toolRuns: Array<{ name: string; args: Record<string, unknown> }> = []
  const tools = {
    web_search: { execute: async (a: Record<string, unknown>) => { toolRuns.push({ name: 'web_search', args: a }); return { results: [{ title: 'r', link: 'https://x.example/a', snippet: 's' }] } } },
    search_places: { execute: async (a: Record<string, unknown>) => { toolRuns.push({ name: 'search_places', args: a }); return { results: [{ name: 'Quán A' }] } } },
  }
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'hi' }], tools, schemas: { web_search: {}, search_places: {}, [ASK_USER]: {} },
    callModel: async o => script.shift() ?? step(o.final ? 'Câu trả lời cuối.' : 'Mặc định.'),
    deadlineAt: Date.now() + 85_000, lang: 'vi',
    trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
  }
  return { input, toolRuns }
}

describe('tool-call decisions (count of executed tools per scenario)', () => {
  it('thanks / confirmation: answered in one round, 0 tools', async () => {
    const t = turn([step('Không có gì nha!')])
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.modelCalls, run.toolCalls, t.toolRuns.length]).toEqual(['answered', 1, 0, 0])
  })

  it('a missing result-changing detail: ask_user ends the turn, the same step\'s search is dropped (0 tools)', async () => {
    const t = turn([step('', [[ASK_USER, { question: 'Bạn dùng để làm gì', choices: ['Văn phòng', 'Gaming'], why: 'cần nhu cầu' }], ['web_search', { queries: ['laptop tốt nhất'] }]])])
    const run = await runAgentRuntime(t.input)
    expect([run.status, run.toolCalls, t.toolRuns.length]).toEqual(['asked', 0, 0])
  })

  it('identical effective arguments in one turn run ONCE (second is refused as duplicate)', async () => {
    const t = turn([
      step('', [['web_search', { queries: ['giá vé tàu hà nội sài gòn'] }]]),
      step('', [['web_search', { queries: ['giá vé tàu hà nội sài gòn'] }]]),
      step('Giá vé từ …'),
    ])
    const run = await runAgentRuntime(t.input)
    expect(t.toolRuns.filter(r => r.name === 'web_search')).toHaveLength(1)
    expect(run.toolEvents.map(e => e.outcome)).toEqual(['ok', 'duplicate'])
  })
})

describe('what a lookup received is remembered and shown to the next turn (the web_search empty-query defect)', () => {
  it('turn 1 searches with `queries`; turn 2\'s context names those queries — never an empty one', async () => {
    const t1 = turn([step('', [['web_search', { queries: ['giá vé tàu hà nội sài gòn', 'lịch tàu SE1'] }]]), step('Xong.')])
    const run1 = await runAgentRuntime(t1.input)
    let task = recordResearch(createTask(conv, NOW), run1.toolEvents.map(e => ({ name: e.name, args: e.args, outcome: e.outcome, results: 3 })), NOW)
    const ctx = taskContextLines(task, [], new Date(NOW.getTime() + 60_000)).join('\n')
    expect(ctx).toContain('web_search "giá vé tàu hà nội sài gòn"')
    expect(ctx).toContain('web_search "lịch tàu SE1"')
    expect(ctx).not.toContain('web_search ""')
    // a different query is a different entry, not folded into the first one
    task = recordResearch(task, [{ name: 'web_search', args: { queries: ['giá vé tàu hà nội huế'] }, outcome: 'ok', results: 2 }], NOW)
    expect(task.research_state.searches.map(s => s.query)).toEqual(expect.arrayContaining(['giá vé tàu hà nội sài gòn', 'giá vé tàu hà nội huế']))
  })
})
