// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'

// Round 28: on a vague discovery turn (discoveryGate.ts) the loop runs NO lookup: every proposed tool is blocked, recorded, and answered with "ask the user"; the tool_status trace says
// proposed → executed | blocked for every call (only with the flag-on option AND the audit trace on).
const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}`, toolName, args })),
})
const ASK = 'Bạn đang ở khu vực nào và muốn chơi kiểu nào (xem phim, chơi game/bida, ăn uống, đi dạo)?'

async function run(o: { script: RuntimeStep[]; blockRetrieval?: boolean; toolStatusTrace?: boolean }) {
  const s = [...o.script]
  const executed: string[] = []
  const calls: Array<{ tools: unknown; final: boolean }> = []
  const mk = (name: string) => ({ execute: async () => { executed.push(name); return { results: [{ name: 'X' }] } } })
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: 'nay có gì dzui ko pa' }],
    schemas: { search_places: {}, get_news: {}, get_weather: {}, web_search: {}, ask_user: {} },
    tools: { search_places: mk('search_places'), get_news: mk('get_news'), get_weather: mk('get_weather'), web_search: mk('web_search') },
    callModel: async x => { calls.push({ tools: x.tools, final: x.final }); return s.shift() ?? step('xong') },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 8, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    ...(o.blockRetrieval ? { blockRetrieval: true } : {}), ...(o.toolStatusTrace ? { toolStatusTrace: true } : {}),
  }
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  const r = await runAgentRuntime(input)
  const statuses = logs.filter(l => l.includes('"ev":"tool_status"')).map(l => JSON.parse(l) as { tool: string; status: string; round: number; outcome?: string; planned?: string })
  return { r, executed, calls, statuses }
}
afterEach(() => { vi.restoreAllMocks(); delete process.env.TAPPY_AUDIT_TRACE; delete process.env.NEXT_PUBLIC_SUPABASE_URL })
const traceOn = () => { process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co' }

describe('blockRetrieval — a turn that must ask first executes NO lookup', () => {
  it('the model proposes get_news, get_weather and search_places (the live Round 28 pattern): all three are blocked, none runs, the next step asks', async () => {
    traceOn()
    const x = await run({ blockRetrieval: true, toolStatusTrace: true, script: [step('', [['get_news', { query: 'x' }], ['get_weather', { location: 'x' }], ['search_places', { query: 'x' }]]), step(ASK)] })
    expect(x.executed).toEqual([])
    expect(x.r.toolEvents.map(e => `${e.name}:${e.outcome}`)).toEqual(['get_news:blocked', 'get_weather:blocked', 'search_places:blocked'])
    expect(x.r.toolCalls).toBe(0)
    expect(x.r.text).toBe(ASK)
    expect(x.r.modelCalls).toBe(2)
    expect(x.statuses.map(s => `${s.tool}:${s.status}`)).toEqual(['get_news:proposed', 'get_news:blocked', 'get_weather:proposed', 'get_weather:blocked', 'search_places:proposed', 'search_places:blocked'])
  })
  it('a model that keeps proposing is cut off after two blocked rounds: the next step is the final tool-less one; still nothing executed', async () => {
    const x = await run({ blockRetrieval: true, script: [step('', [['search_places', { query: 'a' }]]), step('', [['web_search', { query: 'b' }]]), step(ASK)] })
    expect(x.executed).toEqual([])
    expect(x.r.toolEvents.every(e => e.outcome === 'blocked')).toBe(true)
    expect(x.r.text).toBe(ASK)
    expect(x.calls[2].final).toBe(true)
    expect(x.calls[2].tools).toBeUndefined()
  })
  it('no answer-first side call and no Serper credit on a blocked turn', async () => {
    const x = await run({ blockRetrieval: true, script: [step('', [['search_places', { query: 'a' }]]), step(ASK)] })
    expect(x.r.modelCalls).toBe(2)
    expect(x.r.answerFirst).not.toBe('provided')
  })
  it('without blockRetrieval the same proposal runs normally (control)', async () => {
    const x = await run({ script: [step('', [['get_news', { query: 'x' }]]), step('Có tin.')] })
    expect(x.executed).toEqual(['get_news'])
    expect(x.r.toolEvents[0].outcome).toBe('ok')
  })
})

describe('tool_status — proposed / executed / blocked, only with the flag-on option AND the trace on', () => {
  it('an executed call: proposed → executed; an unknown tool and a duplicate: proposed → blocked', async () => {
    traceOn()
    const x = await run({ toolStatusTrace: true, script: [step('', [['get_news', { query: 'x' }], ['nope_tool', {}]]), step('', [['get_news', { query: 'x' }]]), step('Xong.')] })
    expect(x.statuses.map(s => `${s.tool}:${s.status}${s.outcome ? `(${s.outcome})` : ''}`)).toEqual([
      'get_news:proposed', 'nope_tool:proposed', 'get_news:executed(ok)', 'nope_tool:blocked(unknown_tool)',
      'get_news:proposed', 'get_news:blocked(duplicate)',
    ])
    expect(x.executed).toEqual(['get_news'])
  })
  it('trace off → no tool_status line (the option alone is not enough)', async () => {
    const x = await run({ blockRetrieval: true, toolStatusTrace: true, script: [step('', [['get_news', { query: 'x' }]]), step(ASK)] })
    expect(x.statuses).toEqual([])
  })
  it('flag-on option off (flag off) → no tool_status line even with the trace on', async () => {
    traceOn()
    const x = await run({ script: [step('', [['get_news', { query: 'x' }]]), step('Có tin.')] })
    expect(x.statuses).toEqual([])
  })
})
