/**
 * Phase 8 WS2 at route level (TAPPY_AGENT=2): the structured recommendation decision (decisionRecord.ts), the chitchat presentation
 * shortcut boundary, the Places provider quota ownership, and Luna deciding research on trip-plan turns. Model scripted, places fixed,
 * no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { PLACES_BUDGET_AGENT } from '@/lib/ai/tools/placesBudget'
import { RUNTIME_LIMITS } from '@/lib/ai/agent/runtime/limits'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    streamCalls: 0,
    extracts: [] as string[],
    decision: null as null | { picks: Array<{ name: string; why: string | null; tradeoff: string | null }>; none: boolean; confidence: 'high' | 'medium' | 'low' },
    decisionPrompts: [] as string[],
    placeCalls: [] as Array<{ query: string; type?: string; location?: string; budgetLimit: number | null; allowed: boolean }>,
  }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-agent-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: (o: { schemaName?: string; messages: Array<{ content: string }> }) => {
      h.state.extracts.push(o.schemaName ?? '?')
      if (o.schemaName === 'recommendation_decision' && h.state.decision) { h.state.decisionPrompts.push(o.messages[0].content); return Promise.resolve({ object: h.state.decision, providerMetadata: {} }) }
      return Promise.reject(new Error('no provider in this test'))
    },
    stream: () => { h.state.streamCalls++; return { toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) } },
    step: (opts: Record<string, unknown>) => {
      h.state.stepCalls.push(opts)
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    // The real searchPlaces claims the turn's Places budget before any Google call; so does this stand-in.
    searchPlaces: async (query: string, location?: string, type?: string, _lang?: string, _bias?: unknown, budget?: { claim: (t?: string, l?: string) => { allowed: boolean }; limit: number }) => {
      const allowed = budget ? budget.claim(type, location).allowed : true
      h.state.placeCalls.push({ query, type, location, budgetLimit: budget?.limit ?? null, allowed })
      if (!allowed) return { source: 'test', count: 0, location: location ?? '', results: [], place_search_status: 'budget_exhausted' }
      const results = [
        { name: 'Cơm Tấm Ba Ghiền', rating_value: 4.6, rating_count: 2400, google_rating: '4.6⭐ (2.400 đánh giá)', price_range_text: '1-70.000 ₫', distance_km: 1.2, open_now: true, address: '84 Đặng Văn Ngữ', maps_link: 'https://maps.google.com/?cid=111' },
        { name: 'Phở Lệ Nguyễn Trãi', rating_value: 4.4, rating_count: 1850, google_rating: '4.4⭐ (1.850 đánh giá)', price_range_text: '1-90.000 ₫', distance_km: 1.8, open_now: true, address: '413 Nguyễn Trãi', maps_link: 'https://maps.google.com/?cid=222' },
        { name: 'Bún Chả Hương Liên', rating_value: 4.2, rating_count: 900, google_rating: '4.2⭐ (900 đánh giá)', price_range_text: '1-80.000 ₫', distance_km: 2.4, open_now: true, address: '24 Lê Văn Hưu', maps_link: 'https://maps.google.com/?cid=333' },
      ]
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
  }
})

import { POST } from '@/app/api/chat/route'

const post = async (messages: unknown[]) => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } }),
    signal: undefined,
  }
  const res = await POST(req as never)
  return res.text()
}
const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })
async function turn(messages: unknown[]): Promise<{ body: string; traces: Array<Record<string, any>> }> {
  const log = vi.spyOn(console, 'log')
  const body = await post(messages)
  const traces = log.mock.calls.map(c => String(c[0])).filter(s => s.startsWith('{"type":"tappyai_agent_run_trace"')).map(s => JSON.parse(s) as Record<string, any>)
  log.mockRestore()
  return { body, traces }
}
const text = (body: string) => body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
function finalCards(body: string): { items: Array<{ name: string; recommended?: boolean; reasons?: Array<{ evidence: string }>; tradeOff?: { evidence: string } | null; contextualActions?: Array<{ kind: string; url: string }> }> } | null {
  const anns = body.split('\n').filter(l => l.startsWith('8:')).flatMap(l => { try { return JSON.parse(l.slice(2)) as Array<Record<string, unknown>> } catch { return [] } })
  return (anns.filter(a => a.kind === 'tappy.places.v1' && !a.preliminary).at(-1) as never) ?? null
}
const rankingEvent = (traces: Array<Record<string, any>>) => (traces[0]?.events ?? []).find((e: { kind: string }) => e.kind === 'ranking')
const COM = 'Cơm Tấm Ba Ghiền', PHO = 'Phở Lệ Nguyễn Trãi', BUN = 'Bún Chả Hương Liên'
const search = () => ({ text: '', toolCalls: [call('search_places', { query: 'quán ăn trưa', location: 'Quận 1' })] })

beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.streamCalls = 0; h.state.extracts = []; h.state.decision = null; h.state.decisionPrompts = []; h.state.placeCalls = []
  __resetAiQuestionQuotaLocal()
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
})
afterEach(() => { delete process.env.TAPPY_AGENT })

describe('WS2 · the recommendation decision is structured and reliable (no dependence on a hidden text line)', () => {
  it('no inline block → the decision is RECORDED from the answer (one structured Luna call): order, recommended card, reason, trade-off', async () => {
    h.state.steps = [search(), { text: `Mình chọn **${PHO}** cho bữa trưa — nước dùng thanh, đi bộ được; nếu muốn rẻ hơn thì **${COM}**.`, toolCalls: [] }]
    h.state.decision = { picks: [{ name: PHO, why: 'Nước dùng thanh, đi bộ được', tradeoff: 'Đắt hơn cơm tấm' }, { name: COM, why: 'Rẻ hơn', tradeoff: null }], none: false, confidence: 'high' }
    const { body, traces } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    const c = finalCards(body)!
    expect(c.items.map(i => i.name)).toEqual([PHO, COM])
    expect(c.items[0].recommended).toBe(true)
    expect(c.items[0].reasons?.[0]?.evidence).toBe('Nước dùng thanh, đi bộ được')
    expect(c.items[1].recommended).toBeFalsy()
    // Real action links stay on the cards (the decision orders them; it never writes or drops a link).
    expect(JSON.stringify(c.items[0])).toContain('maps.google.com/?cid=222')
    expect(rankingEvent(traces)).toMatchObject({ block: 'ok', via: 'structured', picks: 2 })
    expect(h.state.extracts).toContain('recommendation_decision')
    // The record call reads the answer and the candidates as DATA.
    expect(h.state.decisionPrompts[0]).toContain(PHO)
    expect(text(body)).not.toMatch(/TAPPY_RANK|recommendation_decision/)
  })

  it('a valid inline block is used as is: no record call', async () => {
    h.state.steps = [search(), { text: `Mình chọn **${COM}**.\n\n[TAPPY_RANK]${JSON.stringify({ picks: [{ name: COM, why: 'Gần và rẻ' }], none: false, confidence: 'high' })}[/TAPPY_RANK]`, toolCalls: [] }]
    h.state.decision = { picks: [{ name: PHO, why: 'x', tradeoff: null }], none: false, confidence: 'low' }
    const { body, traces } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    expect(finalCards(body)!.items.map(i => i.name)).toEqual([COM])
    expect(h.state.extracts).not.toContain('recommendation_decision')
    expect(rankingEvent(traces)).toMatchObject({ block: 'ok', via: 'inline' })
  })

  it('no fit → the recorded "none": no recommended card, no filler cards', async () => {
    h.state.steps = [search(), { text: 'Mình chưa thấy quán nào có phòng riêng cho 10 người trong kết quả này — bạn muốn mình tìm rộng hơn không?', toolCalls: [] }]
    h.state.decision = { picks: [], none: true, confidence: 'medium' }
    const { body, traces } = await turn([{ role: 'user', content: 'Tìm quán có phòng riêng cho 10 người ở Quận 1' }])
    const c = finalCards(body)
    expect(c === null || c.items.length === 0).toBe(true)
    expect(body).not.toMatch(/"recommended":true/)
    expect(rankingEvent(traces)).toMatchObject({ via: 'structured', none: true })
  })

  it('the record can never introduce a recommendation: a recorded pick the answer does not name is dropped by code', async () => {
    h.state.steps = [search(), { text: `Mình chọn **${COM}** cho bữa trưa.`, toolCalls: [] }]
    h.state.decision = { picks: [{ name: BUN, why: 'x', tradeoff: null }, { name: COM, why: 'Gần, rẻ', tradeoff: null }], none: false, confidence: 'high' }
    const { body } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    const c = finalCards(body)!
    expect(c.items.map(i => i.name)).toEqual([COM])
    expect(c.items[0].recommended).toBe(true)
  })

  it('a preference change re-ranks: the next turn\'s decision reorders the cards', async () => {
    h.state.steps = [search(), { text: `Mình chọn **${COM}**, rồi tới **${PHO}**.`, toolCalls: [] }]
    h.state.decision = { picks: [{ name: COM, why: 'Rẻ nhất', tradeoff: null }, { name: PHO, why: 'Ngon', tradeoff: null }], none: false, confidence: 'high' }
    const t1 = await turn([{ role: 'user', content: 'Tìm quán ăn trưa rẻ ở Quận 1' }])
    expect(finalCards(t1.body)!.items.map(i => i.name)).toEqual([COM, PHO])
    __resetAiQuestionQuotaLocal()
    h.state.steps = [search(), { text: `Ưu tiên ngon hơn rẻ thì mình chọn **${PHO}** trước, **${COM}** sau.`, toolCalls: [] }]
    h.state.decision = { picks: [{ name: PHO, why: 'Ngon hơn', tradeoff: 'Đắt hơn' }, { name: COM, why: 'Rẻ', tradeoff: null }], none: false, confidence: 'high' }
    const t2 = await turn([{ role: 'user', content: 'Tìm quán ăn trưa rẻ ở Quận 1' }, { role: 'assistant', content: text(t1.body) }, { role: 'user', content: 'Thôi bỏ tiêu chí rẻ, ưu tiên ngon' }])
    expect(finalCards(t2.body)!.items.map(i => i.name)).toEqual([PHO, COM])
  })

  it('a recommendation without candidates (no cards) makes no record call', async () => {
    h.state.steps = [{ text: 'Phở bò đậm vị hơn, phở gà thanh hơn — thích nhẹ bụng thì chọn phở gà.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Phở bò với phở gà nên ăn cái nào buổi sáng?' }])
    expect(h.state.extracts).not.toContain('recommendation_decision')
  })

  it('the record failing (timeout / provider error) fails open: the answer is unchanged, cards follow the names (pre-M5)', async () => {
    h.state.steps = [search(), { text: `Mình chọn **${COM}** cho bữa trưa.`, toolCalls: [] }]
    h.state.decision = null // extract rejects
    const { body, traces } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    expect(text(body)).toContain(COM)
    expect(finalCards(body)!.items.map(i => i.name)).toEqual([COM])
    expect(rankingEvent(traces)).toMatchObject({ block: 'absent', via: null })
  })
})

describe('WS2 · chitchat is an explicit presentation shortcut (architecture B), locked', () => {
  it('a pure greeting: canned reply, NO model call of any kind, no tool, no runtime turn (no task load / save, no trace)', async () => {
    const { body, traces } = await turn([{ role: 'user', content: 'chào bạn' }])
    expect(text(body).length).toBeGreaterThan(0)
    expect(h.state.stepCalls).toHaveLength(0)
    expect(h.state.extracts).toEqual([])
    expect(h.state.streamCalls).toBe(0)
    expect(h.state.placeCalls).toEqual([])
    expect(traces).toHaveLength(0)
  })
  it('a greeting WITH a request is not chitchat: Luna answers it through the runtime', async () => {
    h.state.steps = [{ text: 'Chào bạn! Bạn muốn ăn phở hay cơm?', toolCalls: [] }]
    const { traces } = await turn([{ role: 'user', content: 'chào bạn, tìm giúp mình quán phở ngon ở Quận 1' }])
    expect(h.state.stepCalls.length).toBeGreaterThan(0)
    expect(traces).toHaveLength(1)
  })
  it('the canned copy carries no recommendation, no fact and no research (presentation only)', async () => {
    const { body } = await turn([{ role: 'user', content: 'cảm ơn nhé' }])
    const t = text(body)
    expect(t).not.toMatch(/\d{2,}|https?:\/\/|⭐|đ\b|VND/)
    expect(t.length).toBeLessThan(160)
  })
})

describe('WS2 · Places quota is a provider safety quota, not a Phase 7 orchestration constant', () => {
  it('agent turns get the provider quota (PLACES_BUDGET_AGENT), enforced: a 4th distinct intent is refused, never sent to Google', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán ăn', location: 'Quận 1', type: 'restaurant' }), call('search_places', { query: 'cà phê', location: 'Quận 1', type: 'cafe' })] },
      { text: '', toolCalls: [call('search_places', { query: 'spa', location: 'Quận 1', type: 'spa' }), call('search_places', { query: 'bar', location: 'Quận 1', type: 'bar' })] },
      { text: 'Đây là vài chỗ ở Quận 1.', toolCalls: [] },
    ]
    await turn([{ role: 'user', content: 'Tối nay ở Quận 1: ăn tối, cà phê, spa rồi bar — gợi ý giúp mình' }])
    expect(h.state.placeCalls.length).toBeGreaterThanOrEqual(4)
    expect(new Set(h.state.placeCalls.map(c => c.budgetLimit))).toEqual(new Set([PLACES_BUDGET_AGENT]))
    expect(h.state.placeCalls.filter(c => c.allowed)).toHaveLength(PLACES_BUDGET_AGENT)
  })
  it('the route reads the provider constant, never an agent loop limit', () => {
    const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(src).toMatch(/createPlacesBudget\(agentOn \? PLACES_BUDGET_AGENT :/)
    expect(src).not.toMatch(/createPlacesBudget\([^)]*(AGENT_LIMITS|RUNTIME_LIMITS)/)
    expect(PLACES_BUDGET_AGENT).toBe(3)
    expect(PLACES_BUDGET_AGENT).not.toBe(RUNTIME_LIMITS.maxToolCalls)
  })
})

describe('WS2 · research is Luna\'s decision on trip-plan turns too', () => {
  it('a plan request with no data words keeps the tools on TAPPY_AGENT=2 (Luna may research weather / hours / prices or answer directly)', async () => {
    h.state.steps = [{ text: 'Lịch trình Đà Nẵng 3 ngày: Ngày 1 …', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Lên lịch trình Đà Nẵng 3 ngày 2 đêm cho 2 người' }])
    const tools = Object.keys((h.state.stepCalls[0]?.tools ?? {}) as Record<string, unknown>)
    expect(tools).toEqual(expect.arrayContaining(['web_search']))
  })
})
