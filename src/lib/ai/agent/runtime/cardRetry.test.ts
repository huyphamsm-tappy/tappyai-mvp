// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { needsCard, validCard, wantsMultiDay } from './cardRetry'

afterEach(() => { vi.restoreAllMocks() })

// Round 22 live: after get_trip_data the model answered a 3-day plan as text ("Ngày 1 … Ngày 2 …") with no [TAPPY_PLAN] card. Round 23: one extra no-tools call.
const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}`, toolName, args })),
})
const PROSE = 'Mình xếp lịch nhẹ.\n\n**Ngày 1 — Thứ Bảy**\n- 08:00 Ăn sáng chay.\n\n**Ngày 2 — Chủ nhật**\n- 08:00 Ăn sáng chay.\n\n**Ngày 3 — Thứ Hai**\n- 08:00 Trả phòng.'
const CARD = 'Mình xếp lịch nhẹ cho hai bạn.\n\n[TAPPY_PLAN]{"type":"trip","title":"Nha Trang","people":2,"days":[{"label":"Ngày 1","items":[{"time":"08:00","category":"food","name":"X"}]},{"label":"Ngày 2","items":[]},{"label":"Ngày 3","items":[]}]}[/TAPPY_PLAN]'
const TRIP_USER = 'lên kế hoạch đi Nha Trang đi đôi, ăn chay, 3 ngày 2 đêm cuối tuần sau'

interface Call { tools: unknown; final: boolean; system: string; lastUser: string }

async function run(o: { user?: string; script: RuntimeStep[]; cardRetry?: boolean; tool?: string; throwOnRetry?: boolean }) {
  const s = [...o.script]
  const calls: Call[] = []
  const executed: string[] = []
  const toolName = o.tool ?? 'get_trip_data'
  const input: RuntimeInput = {
    system: 'SYS', messages: [{ role: 'user', content: o.user ?? TRIP_USER }], schemas: { [toolName]: {}, ask_user: {} },
    tools: { [toolName]: { execute: async () => { executed.push(toolName); return { places: [{ name: 'Seaside' }] } } } },
    callModel: async x => {
      const last = x.messages[x.messages.length - 1]
      calls.push({ tools: x.tools, final: x.final, system: x.system, lastUser: last.role === 'user' && typeof last.content === 'string' ? last.content : '' })
      if (o.throwOnRetry && calls.length >= 3) throw new Error('boom')
      return s.shift() ?? step('xong')
    },
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 8, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    ...(o.cardRetry ? { cardRetry: true } : {}),
  }
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  const r = await runAgentRuntime(input)
  return { r, calls, executed, retryLog: logs.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(x => x?.type === 'tappyai_card_retry') }
}

describe('card retry (flag on)', () => {
  it('(a) get_trip_data ran, the answer is prose without a card → ONE extra call, no tools offered, the card replaces the text', async () => {
    const x = await run({ cardRetry: true, script: [step('', [['get_trip_data', { destination: 'Nha Trang' }]]), step(PROSE), step(CARD)] })
    expect(x.calls).toHaveLength(3)
    expect(x.calls[2].tools).toBeUndefined()
    expect(x.calls[2].final).toBe(true)
    expect(x.calls[2].system).toContain('KHÔNG gọi công cụ nào')
    expect(x.r.text).toContain('[TAPPY_PLAN]')
    expect(x.r.text).not.toContain('**Ngày 1 — Thứ Bảy**')
    expect(x.r.modelCalls).toBe(3)
    expect(x.executed).toEqual(['get_trip_data'])           // never called again
    expect(x.retryLog).toEqual([expect.objectContaining({ outcome: 'ok' })])
  })
  it('(b) the answer already has the card → no extra call', async () => {
    const x = await run({ cardRetry: true, script: [step('', [['get_trip_data', {}]]), step(CARD)] })
    expect(x.calls).toHaveLength(2)
    expect(x.r.text).toContain('[TAPPY_PLAN]')
    expect(x.retryLog).toEqual([])
  })
  it('(c) not a multi-day plan (hotel question, tool ran, no days) → untouched', async () => {
    const x = await run({ cardRetry: true, user: 'gợi ý khách sạn ở Nha Trang', script: [step('', [['get_trip_data', {}]]), step('Mình gợi ý Seaside vì gần biển.')] })
    expect(x.calls).toHaveLength(2)
    expect(x.r.text).toBe('Mình gợi ý Seaside vì gần biển.')
    expect(x.retryLog).toEqual([])
  })
  it('(c2) a multi-day plan but get_trip_data was NOT used (no-tool plan) → untouched', async () => {
    const x = await run({ cardRetry: true, script: [step(PROSE)] })
    expect(x.calls).toHaveLength(1)
    expect(x.r.text).toBe(PROSE)
  })
  it('(d1) the retry returns no valid card (and tries to call a tool) → text answer kept, tool ignored, no second retry', async () => {
    const x = await run({ cardRetry: true, script: [step('', [['get_trip_data', {}]]), step(PROSE), step('Vẫn là chữ thôi.', [['get_trip_data', { again: true }]]), step(CARD)] })
    expect(x.calls).toHaveLength(3)                          // the 4th scripted step is never requested
    expect(x.r.text).toBe(PROSE)
    expect(x.executed).toEqual(['get_trip_data'])
    expect(x.r.modelCalls).toBe(3)
    expect(x.retryLog).toEqual([expect.objectContaining({ outcome: 'invalid_card', ignored_tool_calls: 1 })])
  })
  it('(d2) a card with fewer than 2 days or broken JSON is not accepted', async () => {
    expect(validCard('[TAPPY_PLAN]{"days":[{"label":"Ngày 1","items":[]}]}[/TAPPY_PLAN]')).toBe(false)
    expect(validCard('[TAPPY_PLAN]{"days": nonsense[/TAPPY_PLAN]')).toBe(false)
    expect(validCard('no block')).toBe(false)
    expect(validCard(CARD)).toBe(true)
    // one closing brace too many (live Round 20) is repaired, so the card still counts
    expect(validCard('[TAPPY_PLAN]{"days":[{"items":[]},{"items":[]}],"cost_breakdown":{}},"local_tips":[]}[/TAPPY_PLAN]')).toBe(true)
  })
  it('(d3) the retry call throws → text answer kept, outcome logged, turn still answered', async () => {
    const x = await run({ cardRetry: true, throwOnRetry: true, script: [step('', [['get_trip_data', {}]]), step(PROSE)] })
    expect(x.r.text).toBe(PROSE)
    expect(x.r.status).toBe('answered')
    expect(x.retryLog).toEqual([expect.objectContaining({ outcome: 'error' })])
  })
})

describe('flag off (control)', () => {
  it('(e) without cardRetry the prose answer is returned as it was, no extra call', async () => {
    const x = await run({ script: [step('', [['get_trip_data', {}]]), step(PROSE), step(CARD)] })
    expect(x.calls).toHaveLength(2)
    expect(x.r.text).toBe(PROSE)
    expect(x.retryLog).toEqual([])
  })
})

describe('helpers', () => {
  it('wantsMultiDay: days named by the user, or laid out by the text; a one-day ask is not multi-day', () => {
    expect(wantsMultiDay('3 ngày 2 đêm', '')).toBe(true)
    expect(wantsMultiDay('kế hoạch 4 days in Hanoi', '')).toBe(true)
    expect(wantsMultiDay('kế hoạch Nha Trang', 'Ngày 1: a. Ngày 2: b.')).toBe(true)
    expect(wantsMultiDay('lịch trình 1 ngày ở Huế', 'Sáng: a. Chiều: b.')).toBe(false)
    expect(wantsMultiDay('quán ăn ngon', 'Quán A.')).toBe(false)
  })
  it('needsCard needs all three: trip tool ok, no card, multi-day', () => {
    const ok = { userText: TRIP_USER, toolEvents: [{ name: 'get_trip_data', outcome: 'ok' }], text: PROSE }
    expect(needsCard(ok)).toBe(true)
    expect(needsCard({ ...ok, toolEvents: [{ name: 'get_trip_data', outcome: 'error' }] })).toBe(false)
    expect(needsCard({ ...ok, toolEvents: [{ name: 'web_search', outcome: 'ok' }] })).toBe(false)
    expect(needsCard({ ...ok, text: CARD })).toBe(false)
  })
})
