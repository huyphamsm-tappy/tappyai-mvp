// Bounded agent — architecture tests (loop limits, tool policy, context, protocol). No network: the model step is scripted.
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runBoundedAgent, AGENT_LIMITS, stripWhy, type AgentStep } from './loop'
import { toModelSchemas, requestActionTool, confirmationOf, isRejectionTurn, SIDE_EFFECT_TOOLS, type PendingAction } from './agentTools'
import { agentCalendar, agentContext, codeResolvedDate, AGENT_SYSTEM } from './prompt'
import { agentStreamResult, textFrames } from './dataStream'
import { withSerperToolBudget, admitWithinToolBudget } from '@/lib/ai/tools/serperToolBudget'

const NOW = new Date('2026-10-04T05:00:00Z') // Sunday 04/10/2026 12:00 GMT+7
const call = (toolName: string, args: Record<string, unknown> = {}, id = Math.random().toString(36).slice(2)) => ({ toolCallId: id, toolName, args })
const step = (o: Partial<AgentStep>): AgentStep => ({ text: '', toolCalls: [], finishReason: 'stop', ...o })
/** A scripted model: returns the queued steps in order and records what it was given. */
function script(steps: AgentStep[]) {
  const seen: Array<{ tools: boolean; final: boolean; system: string; n: number }> = []
  let i = 0
  const fn = vi.fn(async (o: { system: string; messages: unknown[]; tools?: Record<string, unknown>; final: boolean }) => {
    seen.push({ tools: !!o.tools, final: o.final, system: o.system, n: o.messages.length })
    return steps[Math.min(i++, steps.length - 1)]
  })
  return { fn, seen }
}
const echoTool = () => ({ execute: vi.fn(async (a: Record<string, unknown>) => ({ ok: true, a })) })
const base = (over: Partial<Parameters<typeof runBoundedAgent>[0]> = {}) => ({
  system: 'SYS', messages: [{ role: 'user' as const, content: 'hi' }], schemas: {}, lang: 'vi', deadlineAt: Date.now() + 100_000, tools: {}, ...over,
}) as Parameters<typeof runBoundedAgent>[0]

describe('agent loop — decisions', () => {
  it('a simple question: answered directly, 0 tool calls, 1 model call', async () => {
    const m = script([step({ text: 'Hà Nội là thủ đô của Việt Nam.' })])
    const r = await runBoundedAgent(base({ callModel: m.fn }))
    expect(r).toMatchObject({ status: 'answered', stopReason: 'model_answered', toolCalls: 0, modelCalls: 1 })
    expect(r.text).toContain('thủ đô')
  })
  it('current information: tool → answer; the result is fed back to the model', async () => {
    const t = echoTool()
    const m = script([step({ toolCalls: [call('web_search', { query: 'giá vàng hôm nay', why: 'giá hiện tại' })] }), step({ text: 'Giá vàng hôm nay …' })])
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn }))
    expect(t.execute).toHaveBeenCalledTimes(1)
    expect(t.execute.mock.calls[0][0]).toEqual({ query: 'giá vàng hôm nay' }) // `why` never reaches the tool
    expect(r).toMatchObject({ status: 'answered', toolCalls: 1, modelCalls: 2 })
    expect(r.toolEvents[0]).toMatchObject({ name: 'web_search', why: 'giá hiện tại', outcome: 'ok' })
    expect(m.seen[1].n).toBe(3) // user + assistant(tool-call) + tool(result)
  })
  it('multi-step research: tool → tool → answer', async () => {
    const a = echoTool(), b = echoTool()
    const m = script([step({ toolCalls: [call('search_places', { query: 'phở' })] }), step({ toolCalls: [call('get_weather', { city: 'HN' })] }), step({ text: 'Đây là gợi ý.' })])
    const r = await runBoundedAgent(base({ tools: { search_places: a, get_weather: b }, callModel: m.fn }))
    expect(r.toolEvents.map(e => e.name)).toEqual(['search_places', 'get_weather'])
    expect(r.status).toBe('answered')
  })
})

describe('agent loop — hard limits', () => {
  it('exactly 3 tool calls, then a FORCED final step with no tools and the budget note', async () => {
    const t = echoTool()
    const m = script([1, 2, 3, 4, 5].map(i => step({ toolCalls: [call('web_search', { query: `q${i}` })] })).concat([step({ text: 'trả lời' })]))
    m.fn.mockImplementation(async (o) => {
      m.seen.push({ tools: !!o.tools, final: o.final, system: o.system, n: o.messages.length })
      return o.final ? step({ text: 'Trả lời từ dữ liệu đã có.' }) : step({ toolCalls: [call('web_search', { query: `q${m.seen.length}` })] })
    })
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn }))
    expect(t.execute).toHaveBeenCalledTimes(AGENT_LIMITS.maxToolCalls)
    expect(r.toolCalls).toBe(3)
    expect(r.modelCalls).toBe(4)
    expect(m.seen[3]).toMatchObject({ tools: false, final: true })
    expect(m.seen[3].system).toMatch(/TRẢ LỜI NGAY/)
    expect(r).toMatchObject({ status: 'answered_after_tool_budget', stopReason: 'tool_budget' })
  })
  it('several calls in one step beyond the budget: the excess is answered tool_budget_exhausted, not executed', async () => {
    const t = echoTool()
    const m = script([step({ toolCalls: [1, 2, 3, 4, 5].map(i => call('web_search', { query: `q${i}` })) }), step({ text: 'ok' })])
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn }))
    expect(t.execute).toHaveBeenCalledTimes(3)
    expect(r.toolEvents.filter(e => e.outcome === 'budget')).toHaveLength(2)
  })
  it('no infinite loop: a model that never stops calling tools still ends in a bounded number of rounds', async () => {
    const t = echoTool()
    let n = 0
    const fn = vi.fn(async (o: { final: boolean }) => (n++, o.final ? step({ text: 'xong' }) : step({ toolCalls: [call('web_search', { query: String(n) })] })))
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: fn as never }))
    expect(fn.mock.calls.length).toBeLessThanOrEqual(AGENT_LIMITS.maxToolCalls + 3)
    expect(r.text).toBe('xong')
  })
  it('the same tool with the same arguments is executed once (dedupe is case/space-insensitive)', async () => {
    const t = echoTool()
    const m = script([step({ toolCalls: [call('web_search', { query: 'Phở Hà Nội' })] }), step({ toolCalls: [call('web_search', { query: ' phở hà nội ' })] }), step({ text: 'ok' })])
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn }))
    expect(t.execute).toHaveBeenCalledTimes(1)
    expect(r.toolEvents[1].outcome).toBe('duplicate')
  })
  it('a tool error does not crash the turn: the model reads an error result and answers', async () => {
    const bad = { execute: vi.fn(async () => { throw new Error('provider down') }) }
    const m = script([step({ toolCalls: [call('search_places', { query: 'bún' })] }), step({ text: 'Mình chưa kiểm tra được quán lúc này.' })])
    const r = await runBoundedAgent(base({ tools: { search_places: bad }, callModel: m.fn }))
    expect(r.toolEvents[0]).toMatchObject({ outcome: 'error', error: 'provider down' })
    expect(r.status).toBe('answered')
  })
  it('a slow tool times out and the turn continues', async () => {
    const slow = { execute: vi.fn(() => new Promise(() => {})) }
    const m = script([step({ toolCalls: [call('search_places', { query: 'bún' })] }), step({ text: 'chưa kiểm tra được' })])
    const r = await runBoundedAgent(base({ tools: { search_places: slow }, callModel: m.fn, limits: { toolTimeoutMs: 20 } }))
    expect(r.toolEvents[0].outcome).toBe('timeout')
    expect(r.text).toBe('chưa kiểm tra được')
  })
  it('out of time: no tool runs, the final step answers and is told what is unchecked', async () => {
    const t = echoTool()
    const m = script([step({ text: 'Trả lời ngắn từ những gì có.' })])
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn, deadlineAt: Date.now() + 5_000 }))
    expect(t.execute).not.toHaveBeenCalled()
    expect(m.seen[0]).toMatchObject({ tools: false, final: true })
    expect(r.status).toBe('answered_after_time_budget')
  })
  it('a model step that hangs is cut by the step timeout; the turn still returns text', async () => {
    const fn = vi.fn(() => new Promise<AgentStep>(() => {}))
    const r = await runBoundedAgent(base({ callModel: fn as never, limits: { stepTimeoutMs: 20 }, deadlineAt: Date.now() + 100_000 }))
    expect(r.status).toBe('model_error')
    expect(r.text.length).toBeGreaterThan(0)
  })
  it('a tool cannot reach the agent: it receives only its arguments and a call id', async () => {
    const t = { execute: vi.fn(async (_a: unknown, ctx: unknown) => ({ ctxKeys: Object.keys(ctx as object) })) }
    const m = script([step({ toolCalls: [call('web_search', { query: 'x' })] }), step({ text: 'ok' })])
    await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn }))
    const ctx = t.execute.mock.calls[0][1] as { toolCallId: string; messages: unknown[] }
    expect(Object.keys(ctx).sort()).toEqual(['messages', 'toolCallId'])
    expect(ctx.messages).toEqual([])
  })
  it('provider fan-out inside ONE tool is capped separately and makes no extra agent round', async () => {
    const fanOut = { execute: vi.fn(async () => { let admitted = 0; for (let i = 0; i < 12; i++) if (admitWithinToolBudget(1)) admitted++; return { admitted } }) }
    const m = script([step({ toolCalls: [call('search_products', { query: 'tai nghe' })] }), step({ text: 'ok' })])
    let last: unknown
    const r = await runBoundedAgent(base({
      tools: { search_products: fanOut }, callModel: m.fn,
      runTool: async (_n, fn) => { const x = await withSerperToolBudget(AGENT_LIMITS.serperCreditsPerTool, fn); last = x; return x.value },
    }))
    expect(last).toMatchObject({ spent: 8, refused: 4 })
    expect(r.modelCalls).toBe(2)
    expect(r.toolCalls).toBe(1)
    expect(admitWithinToolBudget(100)).toBe(true) // outside an agent tool call nothing is capped
  })
  it('prepareArgs overrides a model-written date with the code-resolved one before the tool runs', async () => {
    const t = echoTool()
    const m = script([step({ toolCalls: [call('get_flight_prices', { origin: 'SGN', destination: 'DAD', departDate: '2026-10-11' })] }), step({ text: 'ok' })])
    await runBoundedAgent(base({ tools: { get_flight_prices: t }, callModel: m.fn, prepareArgs: (_n, a) => ({ ...a, departDate: '2026-10-06' }) }))
    expect(t.execute.mock.calls[0][0]).toMatchObject({ departDate: '2026-10-06' })
  })
  it('stripWhy never leaks the reason', () => { expect(stripWhy({ a: 1, why: 'x' })).toEqual({ a: 1 }) })
})

describe('tool policy', () => {
  const routeTools = {
    search_places: { description: 'Tìm địa điểm', parameters: z.object({ query: z.string() }), execute: async () => ({}) },
    save_price_watch: { description: 'Theo dõi giá', parameters: z.object({ product_name: z.string(), target_price: z.number(), search_query: z.string() }), execute: vi.fn(async () => ({ ok: true })) },
  }
  it('side-effect tools are never given to the model; every tool carries an optional why', () => {
    const s = toModelSchemas(routeTools) as Record<string, { parameters: z.ZodObject<z.ZodRawShape> }>
    expect(Object.keys(s)).toEqual(['search_places'])
    expect(SIDE_EFFECT_TOOLS.has('save_price_watch')).toBe(true)
    expect(Object.keys(s.search_places.parameters.shape)).toContain('why')
    expect(s.search_places.parameters.safeParse({ query: 'phở' }).success).toBe(true)
  })
  it('request_action validates, parks the action for confirmation, and executes NOTHING', async () => {
    let parked: PendingAction | null = null
    const t = requestActionTool({ tools: routeTools, canConfirm: true, lang: 'vi', park: p => { parked = p } })
    const r = await (t as unknown as { execute: (a: unknown) => Promise<Record<string, unknown>> }).execute({ action: 'save_price_watch', args: { product_name: 'AirPods Pro', target_price: 4_000_000, search_query: 'airpods pro' } })
    expect(r.status).toBe('awaiting_user_confirmation')
    expect(parked).toMatchObject({ tool: 'save_price_watch', summary: expect.stringContaining('AirPods Pro') })
    expect(routeTools.save_price_watch.execute).not.toHaveBeenCalled()
  })
  it('request_action refuses unknown actions, invalid arguments, and anonymous users', async () => {
    const run = (o: { canConfirm: boolean }, a: unknown) => (requestActionTool({ tools: routeTools, canConfirm: o.canConfirm, lang: 'vi', park: () => {} }) as unknown as { execute: (a: unknown) => Promise<Record<string, unknown>> }).execute(a)
    expect((await run({ canConfirm: true }, { action: 'pay_now', args: {} })).status).toBe('refused')
    expect((await run({ canConfirm: true }, { action: 'save_price_watch', args: { product_name: 'x' } })).reason).toBe('invalid_arguments')
    expect((await run({ canConfirm: false }, { action: 'save_price_watch', args: { product_name: 'x', target_price: 1, search_query: 'x' } })).status).toBe('refused')
  })
  it('confirmation words; a cancel word wins', () => {
    expect(confirmationOf('Xác nhận')).toBe('confirm')
    expect(confirmationOf('ok làm đi')).toBe('confirm')
    expect(confirmationOf('thôi huỷ đi')).toBe('cancel')
    expect(confirmationOf('quán nào gần hơn?')).toBeNull()
  })
  it('rejection turns', () => {
    for (const t of ['thôi món này không ngon tìm món khác đi', 'đổi quán khác', 'tìm chỗ khác giúp mình']) expect(isRejectionTurn(t), t).toBe(true)
    for (const t of ['quán thứ hai thì sao', 'rẻ hơn đi', 'cảm ơn']) expect(isRejectionTurn(t), t).toBe(false)
  })
})

describe('context: the calendar is computed by code, state is first-class', () => {
  it('today, the next 14 days and every relative phrase the user used', () => {
    const c = agentCalendar(NOW, 'thứ 3 tuần sau bay Đà Nẵng, về chủ nhật tuần sau')
    expect(c).toContain('Chủ nhật 04/10/2026')
    expect(c).toContain('"thu 3 tuan sau" = Thứ ba 06/10/2026')
    expect(c).toContain('"chu nhat tuan sau" = Chủ nhật 11/10/2026')
    expect(agentCalendar(NOW, 'cuối tuần này có gì vui')).toContain('"cuoi tuan nay" = Chủ nhật 04/10/2026')
    expect(agentCalendar(NOW, 'ngày mai')).toContain('"ngay mai" = Thứ hai 05/10/2026')
  })
  it('codeResolvedDate only when the user used a relative-day word', () => {
    expect(codeResolvedDate('thứ 3 tuần sau bay Đà Nẵng', NOW)).toBe('2026-10-06')
    expect(codeResolvedDate('bay Đà Nẵng 15/10', NOW)).toBeUndefined()
  })
  it('app state: cards in display order, facts, rejected, pending action — in the DATA block, never in the system message; GPS means "do not ask where"', () => {
    const ctx = agentContext({ now: NOW, userText: 'rẻ hơn đi', lang: 'vi', gps: true, address: 'Quận 1', statedArea: null, state: {
      cards: ['Quán A', 'Quán B'], facts: [{ name: 'Quán A', price: '1-100.000 ₫', rating: 4.5, reviews: 100, km: 0.6 }], pick: 'Quán A', rejected: ['Quán Z'], pendingAction: { summary: 'Theo dõi giá X' },
    } })
    const c = ctx.data ?? ''
    expect(c).toContain('1. Quán A · 2. Quán B')
    expect(c).toContain('giá 1-100.000 ₫')
    expect(c).toContain('KHÔNG đề xuất lại): Quán Z')
    expect(c).toContain('chờ người dùng xác nhận: Theo dõi giá X')
    expect(c).toContain('Địa chỉ gần đúng của thiết bị: Quận 1') // client-sent address is data, not instructions
    expect(c.startsWith('<<<DỮ LIỆU PHIÊN')).toBe(true)
    expect(ctx.system).toMatch(/không hỏi "ở đâu"/)
    expect(ctx.system).not.toMatch(/Quán A|Quán Z|Theo dõi giá X|Quận 1/)
  })
  it('the instructions do not impose the old scaffolding and keep the hard rules', () => {
    expect(AGENT_SYSTEM).toMatch(/Không mở bằng "Mình hiểu…"/)
    expect(AGENT_SYSTEM).toMatch(/Tối đa 3 lần gọi công cụ/)
    expect(AGENT_SYSTEM).toMatch(/Không viết URL, link, ảnh/)
    expect(AGENT_SYSTEM).toMatch(/request_action/)
    expect(AGENT_SYSTEM).not.toMatch(/BẮT BUỘC có đủ 4 phần|Mẹo \(theo kinh nghiệm chung\):/)
  })
})

describe('protocol: the agent speaks the AI SDK data stream the guards and clients read', () => {
  it('tool frames as they happen, then text, then finish frames; onFinish gets SDK-shaped steps', async () => {
    const onFinish = vi.fn()
    const r = agentStreamResult(async emit => {
      emit('9:{"toolCallId":"t1","toolName":"search_places","args":{"query":"phở"}}')
      emit('a:{"toolCallId":"t1","result":{"results":[]}}')
      return { text: 'Dòng 1\nDòng 2', status: 'answered', stopReason: 'model_answered', steps: [{ text: 'Dòng 1\nDòng 2', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.001 } } } }], toolEvents: [], modelCalls: 1, toolCalls: 1 }
    }, onFinish)
    const body = await r.toDataStreamResponse().text()
    const lines = body.trim().split('\n').map(l => l.slice(0, 2))
    expect(lines).toEqual(['9:', 'a:', '0:', '0:', 'e:', 'd:'])
    expect(onFinish.mock.calls[0][0]).toMatchObject({ usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, steps: [{ providerMetadata: { tappy: { cost: { usd: 0.001 } } } }] })
    expect(await r.text).toBe('Dòng 1\nDòng 2')
  })
  it('textFrames keeps the text byte-for-byte', () => {
    const t = 'A\nB **c**\n'
    const joined = textFrames(t).trim().split('\n').map(l => JSON.parse(l.slice(2))).join('')
    expect(joined).toBe(t)
  })
})

import { cityFromGps } from './prompt'
describe('GPS → city (default departure point for travel tools)', () => {
  it('a fix in District 1 is TP.HCM; one in Hoàn Kiếm is Hà Nội; the open sea is nothing', () => {
    expect(cityFromGps(10.7769, 106.7009)).toBe('TP.HCM')
    expect(cityFromGps(21.03, 105.85)).toBe('Hà Nội')
    expect(cityFromGps(12.0, 112.0)).toBeNull()
  })
  it('the context states it as the default departure point', () => {
    const c = agentContext({ now: NOW, userText: 'thứ 3 tuần sau bay Đà Nẵng', lang: 'vi', gps: true, gpsCity: 'TP.HCM', state: {} })
    expect(c.system).toContain('Người dùng đang ở TP.HCM (theo GPS)')
    expect(c.data).toBeNull()
  })
})

import { belowAnswerFrame } from './dataStream'
describe('sponsored slot (extension point only)', () => {
  it('nothing is emitted without items; with items it is its own annotation kind, apart from the answer text', () => {
    expect(belowAnswerFrame([])).toBe('')
    const f = belowAnswerFrame([{ label: 'X', url: 'https://example.com', sponsor: 'Y' }])
    expect(f.startsWith('8:')).toBe(true)
    expect(JSON.parse(f.slice(2))[0].kind).toBe('tappy.sponsored.v1')
  })
})

describe('CP3 — parallel read-only tools in one step', () => {
  it('two independent reads run concurrently (both start before either ends) and each counts against the budget', async () => {
    const order: string[] = []
    const slow = (name: string) => ({ execute: vi.fn(async () => { order.push(`start:${name}`); await new Promise(r => setTimeout(r, 30)); order.push(`end:${name}`); return { name } }) })
    const a = slow('a'), b = slow('b')
    const m = script([step({ toolCalls: [call('get_hotel_prices', { location: 'Đà Nẵng' }), call('search_places', { query: 'hải sản Đà Nẵng' })] }), step({ text: 'ok' })])
    const r = await runBoundedAgent(base({ tools: { get_hotel_prices: a, search_places: b }, callModel: m.fn }))
    expect(order.slice(0, 2).every(x => x.startsWith('start:'))).toBe(true)
    expect(r.toolCalls).toBe(2)
    expect(r.modelCalls).toBe(2)
  })
  it('a duplicate inside the same step is refused before anything runs', async () => {
    const t = echoTool()
    const m = script([step({ toolCalls: [call('web_search', { query: 'x' }), call('web_search', { query: 'X ' })] }), step({ text: 'ok' })])
    const r = await runBoundedAgent(base({ tools: { web_search: t }, callModel: m.fn }))
    expect(t.execute).toHaveBeenCalledTimes(1)
    expect(r.toolEvents.map(e => e.outcome)).toEqual(['ok', 'duplicate'])
  })
  it('request_action never runs concurrently with reads', async () => {
    const order: string[] = []
    const read = { execute: vi.fn(async () => { order.push('read:start'); await new Promise(r => setTimeout(r, 20)); order.push('read:end'); return {} }) }
    const act = { execute: vi.fn(async () => { order.push('action'); return {} }) }
    const m = script([step({ toolCalls: [call('request_action', { action: 'save_price_watch', args: {} }), call('web_search', { query: 'q' })] }), step({ text: 'ok' })])
    await runBoundedAgent(base({ tools: { request_action: act, web_search: read }, callModel: m.fn }))
    expect(order).toEqual(['read:start', 'read:end', 'action'])
  })
})
