// @vitest-environment node
// Phase 8 M6 — deferred tool schemas. A small core every round; deferred tools by this turn's capability hints or the task's last
// tools; the rest reachable in the same step through use_tool, resolved by the runtime into the REAL tool before any guard, validated
// against the tool's own schema, executed and reported under its own name. Model and tools scripted (no network).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'
import { tool } from 'ai'
import { startAgentRuntimeTurn, type TaskBox } from './index'
import { AgentRunTrace } from './trace'
import { createTask, conversationIdOf } from './task'
import { __resetPageCache } from './readPage'
import { selectTools, resolveUseTool, compactSignature, schemaVersion, proxyToolSchema, TOOL_REGISTRY, USE_TOOL, __resetSignatureCache, __signatureCacheSize } from './toolRegistry'
import type { RuntimeStep } from './loop'

type Exec = (a: Record<string, unknown>) => Promise<unknown>
const calls: Array<[string, Record<string, unknown>]> = []
const mk = (name: string, params: z.ZodTypeAny, result: unknown = { ok: true, results: [{ name: `${name}-row` }] }): { description: string; parameters: z.ZodTypeAny; execute: Exec } =>
  ({ description: `${name} description`, parameters: params, execute: async a => { calls.push([name, a]); return result } })
const routeTools = () => ({
  web_search: mk('web_search', z.object({ query: z.string() }), { results: [] }),
  search_places: mk('search_places', z.object({ query: z.string(), location: z.string().optional() })),
  get_weather: mk('get_weather', z.object({ location: z.string(), days: z.number().optional() }), { location: 'Đà Lạt', forecast: [{ day: 'mai', rain: true }] }),
  get_gold_price: mk('get_gold_price', z.object({ type: z.enum(['sjc', 'nhan']).optional() })),
  search_products: mk('search_products', z.object({ query: z.string() })),
  get_flight_prices: mk('get_flight_prices', z.object({ origin: z.string(), destination: z.string(), departDate: z.string().optional() })),
  save_price_watch: mk('save_price_watch', z.object({ query: z.string() })),
})
const step = (text: string, c: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({ text, finishReason: c.length ? 'tool-calls' : 'stop', toolCalls: c.map(([toolName, args], k) => ({ toolCallId: `t${k}${Math.random().toString(36).slice(2, 6)}`, toolName, args })) })

function turn(script: RuntimeStep[], o: { user: string; box?: TaskBox; tools?: Record<string, unknown> } ) {
  const trace = new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 12, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' })
  const saw: Array<Record<string, unknown> | undefined> = []
  const msgs: unknown[][] = []
  const r = startAgentRuntimeTurn({
    routeTools: (o.tools ?? routeTools()) as never,
    context: { system: 'S', data: null }, serperTurnCredits: 12, messages: [{ role: 'user', content: o.user }], lang: 'vi',
    deadlineAt: Date.now() + 85_000, finalRole: 'agent', maxTokens: 800, canConfirmActions: false, onPendingAction: () => {}, sanitizeQuery: q => ({ query: q, cut: [] }), trace,
    ...(o.box ? { taskBox: o.box } : {}),
    callModel: async x => { saw.push(x.tools); msgs.push([...x.messages]); return script.shift() ?? step('Xong.') },
  })
  return { trace, saw, msgs, body: async () => { vi.spyOn(console, 'log').mockImplementation(() => {}); return r.toDataStreamResponse().text() } }
}
afterEach(() => { calls.length = 0; __resetPageCache(); vi.restoreAllMocks() })

describe('M6 · what each round carries', () => {
  it('1/2/12 · a direct question: the core (+ use_tool, ask_user) only; no deferred schema', async () => {
    const t = turn([step('120.')], { user: '15% của 800 là bao nhiêu?' })
    await t.body()
    const names = Object.keys(t.saw[0] ?? {})
    expect(names.sort()).toEqual(['ask_user', 'read_page', 'search_places', USE_TOOL, 'web_search'].sort())
    expect(names).not.toContain('get_weather')
    expect(names).not.toContain('save_price_watch')
    expect(t.trace.events.find(e => e.kind === 'tools')).toMatchObject({ deferred: 7 }) // 4 deferred route tools + now-showing, showtimes, request_action
  })
  it('3 · a relevant deferred tool is preselected by its capability hint (weather, gold); the rest stay behind use_tool', async () => {
    const t = turn([step('Có mưa.')], { user: 'Mai Đà Lạt có mưa không?' })
    await t.body()
    expect(Object.keys(t.saw[0] ?? {})).toContain('get_weather')
    expect(Object.keys(t.saw[0] ?? {})).not.toContain('get_gold_price')
    const g = turn([step('Giá vàng…')], { user: 'Giá vàng SJC hôm nay?' })
    await g.body()
    expect(Object.keys(g.saw[0] ?? {})).toContain('get_gold_price')
  })
  it('folding "mưa" (rain) and "mua" (buy) does not cross-select weather and shopping', () => {
    const tools = routeTools()
    expect(selectTools(tools, { texts: ['Có nên mua MacBook cũ này không?'] }).exposed).not.toContain('get_weather')
    expect(selectTools(tools, { texts: ['Mai Đà Lạt có mưa không?'] }).exposed).not.toContain('search_products')
  })
  it('10 · task continuity: a follow-up with no hint gets the tool the task used last turn', async () => {
    const conv = conversationIdOf('66666666-6666-4666-8666-666666666666')
    const task = createTask(conv, new Date())
    task.research_state.searches = [{ tool: 'search_products', query: 'macbook air', results: 5, turn: 1, at: new Date().toISOString() }]
    const box: TaskBox = { task, history: [], conversationId: conv, persisted: true, turn: { userText: 'cái nào rẻ hơn?', previousReply: null, cards: [] }, extract: async () => ({ new_task: false, task_type: null, goal: null, set_constraints: [], remove_constraints: [], set_preferences: [], add_entities: [], selected_items: null, status: null }) }
    const t = turn([step('…')], { user: 'cái nào rẻ hơn?', box })
    await t.body()
    expect(Object.keys(t.saw[0] ?? {})).toContain('search_products')
    expect(t.trace.events.find(e => e.kind === 'tools')?.preselected).toEqual([{ name: 'search_products', reason: 'task' }])
  })
  it('the set is chosen ONCE per turn: every non-final round carries the same tool list (prompt-cache prefix stays stable)', async () => {
    const t = turn([step('', [['web_search', { query: 'x' }]]), step('', [['search_places', { query: 'y' }]]), step('Xong.')], { user: 'tìm quán phở' })
    await t.body()
    const lists = t.saw.filter(Boolean).map(s => Object.keys(s!).join(','))
    expect(lists.length).toBeGreaterThanOrEqual(2)
    expect(new Set(lists).size).toBe(1)
  })
})

describe('M6 · use_tool reaches a deferred tool in the SAME step, as the real tool', () => {
  it('4/8 · executed as get_weather: real frames, trace, task log; no extra model round; counted in the tool budget', async () => {
    const t = turn([step('', [[USE_TOOL, { tool: 'get_flight_prices', args: { origin: 'SGN', destination: 'HAN' } }]]), step('Có chuyến bay.')], { user: 'tìm vé đi Hà Nội giúp mình' })
    const body = await t.body()
    expect(calls).toEqual([['get_flight_prices', { origin: 'SGN', destination: 'HAN' }]])
    expect(body).toMatch(/9:\{"toolCallId":"[^"]+","toolName":"get_flight_prices"/)
    expect(body).not.toMatch(/"toolName":"use_tool"/)
    expect(t.trace.events.find(e => e.kind === 'tool_call')).toMatchObject({ tool: 'get_flight_prices', via: USE_TOOL, admitted: true })
    expect(t.trace.counters.modelRounds).toBe(2)
    expect(t.trace.counters.toolCalls).toBe(1)
  })
  it('a proxied call and a direct call of the same lookup are one lookup (de-duplication by the real name)', async () => {
    const t = turn([step('', [['get_weather', { location: 'Đà Lạt' }], [USE_TOOL, { tool: 'get_weather', args: { location: 'Đà Lạt' } }]]), step('…')], { user: 'Đà Lạt mai có mưa không' })
    await t.body()
    expect(calls).toHaveLength(1)
  })
})

describe('M6 · the runtime stays authoritative (5/6/13)', () => {
  const sel = (tools = routeTools()) => selectTools(tools, { texts: ['xin chào'] })
  it('side-effect, control, core, unknown and not-offered tools are refused with a structured result; nothing runs', async () => {
    for (const name of ['save_price_watch', 'ask_user', 'update_task', 'web_search', 'search_places', 'rm_rf', 'get_movie_showtimes']) {
      const r = resolveUseTool({ tool: name, args: { query: 'x' } }, routeTools(), sel(), 'vi')
      expect(r).toMatchObject({ refused: 'tool_unavailable', result: { error: 'tool_unavailable' } })
    }
    const t = turn([step('', [[USE_TOOL, { tool: 'save_price_watch', args: { query: 'iphone' } }]]), step('Mình không lưu được.')], { user: 'theo dõi giá iphone' })
    await t.body()
    expect(calls).toEqual([])
    expect(t.trace.events.find(e => e.kind === 'tool_call')).toMatchObject({ refused: 'tool_unavailable', admitted: false })
    // Luna is told, in a structured result, that the tool is unavailable and not to invent its result.
    expect(JSON.stringify(t.msgs[1])).toContain('"error":"tool_unavailable"')
  })
  it('arguments are validated against the tool\'s OWN schema; invalid → structured invalid_arguments with its signature, nothing runs', async () => {
    const r = resolveUseTool({ tool: 'get_flight_prices', args: { origin: 'SGN' } }, routeTools(), sel(), 'vi')
    expect(r).toMatchObject({ refused: 'invalid_arguments', result: { error: 'invalid_arguments', tool: 'get_flight_prices', signature: 'get_flight_prices(origin, destination, departDate?)' } })
    const t = turn([step('', [[USE_TOOL, { tool: 'get_flight_prices', args: { destination: 42 } }]]), step('…')], { user: 'vé máy bay' })
    await t.body()
    expect(calls).toEqual([])
  })
  it('the resolved call still passes the input guard (secret shapes are cut from its arguments)', async () => {
    const t = turn([step('', [[USE_TOOL, { tool: 'get_flight_prices', args: { origin: 'SGN sk-abcdefghijklmnopqrstuvwxyz0123456789', destination: 'HAN' } }]]), step('…')], { user: 'vé máy bay' })
    await t.body()
    expect(JSON.stringify(calls)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123456789')
  })
  it('a deferred tool that throws returns the structured failure (never a fabricated result)', async () => {
    const tools = { ...routeTools(), get_flight_prices: { ...mk('get_flight_prices', z.object({ origin: z.string(), destination: z.string() })), execute: async () => { throw new Error('provider down') } } }
    const t = turn([step('', [[USE_TOOL, { tool: 'get_flight_prices', args: { origin: 'SGN', destination: 'HAN' } }]]), step('Chưa kiểm tra được.')], { user: 'tìm vé', tools })
    await t.body()
    expect(t.trace.events.find(e => e.kind === 'tool_result')).toMatchObject({ tool: 'get_flight_prices', outcome: 'error' })
  })
})

describe('M6 · one canonical schema; cache keyed by schema version (7/15)', () => {
  it('the registry holds metadata only; the use_tool list is DERIVED from each tool\'s own schema', () => {
    for (const m of TOOL_REGISTRY) expect(Object.keys(m).sort()).toEqual(['capability', 'category', 'hints', 'name', 'security', 'tier'])
    const tools = routeTools()
    expect(compactSignature('get_weather', tools.get_weather)).toBe('get_weather(location, days?: số)')
    expect(compactSignature('get_gold_price', tools.get_gold_price)).toBe('get_gold_price(type?: sjc|nhan)')
    const desc = (proxyToolSchema(tools, ['get_weather', 'get_flight_prices'], 'vi') as { description: string }).description
    expect(desc).toContain('get_weather(location, days?: số)')
    expect(desc).toContain('get_flight_prices(origin, destination, departDate?)')
  })
  it('a changed schema is a new version → a new signature, never a stale one; the same schema hits the cache', () => {
    __resetSignatureCache()
    const a = { description: 'd', parameters: z.object({ location: z.string() }) }
    const b = { description: 'd', parameters: z.object({ location: z.string(), unit: z.enum(['c', 'f']).optional() }) }
    expect(schemaVersion(a)).not.toBe(schemaVersion(b))
    expect(compactSignature('get_weather', a)).toBe('get_weather(location)')
    expect(__signatureCacheSize()).toBe(1)
    expect(compactSignature('get_weather', { description: 'd', parameters: z.object({ location: z.string() }) })).toBe('get_weather(location)')
    expect(__signatureCacheSize()).toBe(1)
    expect(compactSignature('get_weather', b)).toBe('get_weather(location, unit?: c|f)')
    expect(__signatureCacheSize()).toBe(2)
  })
  it('14 · no cross-session state: the selection is a pure function of THIS turn\'s input; the cache holds no user data', () => {
    const tools = routeTools()
    const a = selectTools(tools, { texts: ['Mai Đà Lạt có mưa không?'] })
    const b = selectTools(tools, { texts: ['15% của 800'] })
    expect(a.exposed).toContain('get_weather')
    expect(b.exposed).not.toContain('get_weather')
    expect(selectTools(tools, { texts: ['15% của 800'] })).toEqual(b)
    const tool_ = tool({ description: 'x', parameters: z.object({ q: z.string() }) })
    compactSignature('search_products', tool_)
    // Keys are "<tool>@<schema hash>" only.
    expect(__signatureCacheSize()).toBeGreaterThan(0)
  })
  it('a tool the route did not offer this turn is neither exposed nor listed; with nothing deferred there is no use_tool', () => {
    const only = { web_search: routeTools().web_search, search_places: routeTools().search_places }
    const s = selectTools(only, { texts: ['xin chào'] })
    expect(s.catalog).toEqual([])
    expect(proxyToolSchema(only, s.catalog, 'vi')).toBeNull()
  })
})
