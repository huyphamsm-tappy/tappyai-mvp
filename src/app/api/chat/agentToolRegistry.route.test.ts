/**
 * Phase 8 M6 at route level (TAPPY_AGENT=2): a deferred tool reached through use_tool behaves EXACTLY like a direct call — the real
 * tool runs with the route's own argument preparation, its frames carry its own name, and the whole stream (text, frames,
 * annotations) equals the direct call's. A direct question sends no deferred schema. Model scripted; hotels mocked (no network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    streamCalls: 0,
    extractCalls: 0,
    placeCalls: [] as string[],
    writes: [] as unknown[],
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
vi.mock('@/lib/ai/actions/runAction', () => ({ runAiWriteAction: vi.fn(async (o: unknown) => { h.state.writes.push(o); return { ok: true, result: { ok: true, id: 'w1' } } }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => { h.state.extractCalls++; return Promise.reject(new Error('no provider in this test')) },
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
    searchPlaces: async (query: string, location?: string) => {
      h.state.placeCalls.push(query)
      const results = [
        { name: 'Cơm Tấm Ba Ghiền', rating_value: 4.6, rating_count: 2400, google_rating: '4.6⭐ (2.400 đánh giá)', price_range_text: '1-70.000 ₫', distance_km: 1.2, open_now: true, address: '84 Đặng Văn Ngữ' },
        { name: 'Phở Lệ Nguyễn Trãi', rating_value: 4.4, rating_count: 1850, google_rating: '4.4⭐ (1.850 đánh giá)', price_range_text: '1-90.000 ₫', distance_km: 1.8, open_now: true, address: '413 Nguyễn Trãi' },
      ]
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
  }
})

vi.mock('@/lib/ai/tools/travel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/travel')>()
  return {
    ...real,
    getHotelPrices: async (location: string) => ({
      location, source: 'test',
      hotel_list: [
        { name: 'Hanami Hotel Danang', place_id: 'h1', address: '61 Hoàng Kế Viêm, Ngũ Hành Sơn, Đà Nẵng', google_rating: '4.6⭐ (2.251 đánh giá)', rating_value: 4.6, rating_count: 2251, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=1' },
        { name: 'Sea Breeze Mỹ Khê', place_id: 'h2', address: '12 Võ Nguyên Giáp, Sơn Trà, Đà Nẵng', google_rating: '4.2⭐ (310 đánh giá)', rating_value: 4.2, rating_count: 310, place_types: ['Khách sạn'], maps_link: 'https://maps.google.com/?cid=2' },
      ],
    }),
  }
})

import { POST } from '@/app/api/chat/route'

const post = async (messages: unknown[], chatSessionId?: string) => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }, ...(chatSessionId ? { chatSessionId } : {}) }),
    signal: undefined,
  }
  const res = await POST(req as never)
  return res.text()
}
const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })

/** The tappyai_agent_run_trace lines this turn logged. */
async function turn(messages: unknown[], chatSessionId?: string): Promise<{ body: string; traces: Array<Record<string, unknown>> }> {
  const log = vi.spyOn(console, 'log')
  const body = await post(messages, chatSessionId)
  const traces = log.mock.calls.map(c => String(c[0])).filter(s => s.startsWith('{"type":"tappyai_agent_run_trace"')).map(s => JSON.parse(s) as Record<string, unknown>)
  log.mockRestore()
  return { body, traces }
}


beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.streamCalls = 0; h.state.extractCalls = 0; h.state.placeCalls = []; h.state.writes = []
  __resetAiQuestionQuotaLocal()
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
})
afterEach(() => { delete process.env.TAPPY_AGENT })


describe('M6 · route: deferred tools', () => {
  it('a direct question carries no deferred schema; use_tool lists them', async () => {
    h.state.steps = [{ text: '120.', toolCalls: [] }]
    await turn([{ role: 'user', content: '15% của 800 là bao nhiêu?' }])
    const tools = Object.keys((h.state.stepCalls[0] as { tools: Record<string, unknown> }).tools)
    expect(tools).toEqual(expect.arrayContaining(['web_search', 'read_page', 'search_places', 'ask_user', 'use_tool']))
    for (const d of ['get_hotel_prices', 'get_flight_prices', 'get_weather', 'get_gold_price', 'get_news', 'search_products', 'get_transport_options', 'get_now_showing', 'get_movie_showtimes', 'request_action', 'get_trip_data']) expect(tools).not.toContain(d)
    const desc = ((h.state.stepCalls[0] as { tools: Record<string, { description: string }> }).tools.use_tool).description
    expect(desc).toContain('get_hotel_prices(location')
  })

  it('8 · get_hotel_prices through use_tool produces the SAME stream as a direct call (frames under its own name, route args, text, annotations); no extra round', async () => {
    const reply = 'Mình chọn **Sea Breeze Mỹ Khê** vì sát biển và đi bộ ra bãi tắm chỉ vài phút, hợp cuối tuần.\n\n[TAPPY_RANK]{"picks":[{"name":"Sea Breeze Mỹ Khê","why":"sát biển, đi bộ ra bãi"}],"none":false,"confidence":"medium"}[/TAPPY_RANK]'
    /** The stream without per-run ids, timings and cost lines. */
    const norm = (b: string) => b.split('\n').filter(l => /^(0|8|9|a):/.test(l) && !l.includes('tappy.turn.v1')).map(l => l.replace(/"toolCallId":"[^"]+"/g, '"toolCallId":"X"').replace(/"t":\d+/g, '"t":0')).join('\n')
    const q = 'Chỗ ở nào gần bãi Mỹ Khê cho cuối tuần?'
    h.state.steps = [{ text: '', toolCalls: [call('get_hotel_prices', { location: 'Đà Nẵng' })] }, { text: reply, toolCalls: [] }]
    const direct = await turn([{ role: 'user', content: q }])
    h.state.stepCalls = []; __resetAiQuestionQuotaLocal()
    h.state.steps = [{ text: '', toolCalls: [call('use_tool', { tool: 'get_hotel_prices', args: { location: 'Đà Nẵng' } })] }, { text: reply, toolCalls: [] }]
    const proxied = await turn([{ role: 'user', content: q }])
    expect(proxied.body).toMatch(/^9:.*"toolName":"get_hotel_prices".*"checkIn"/m) // the route's own argument preparation applied
    expect(proxied.body).not.toMatch(/"toolName":"use_tool"/)
    expect(proxied.body).not.toContain('TAPPY_RANK')
    expect(norm(proxied.body)).toBe(norm(direct.body))
    const ev = (proxied.traces[0] as { events: Array<Record<string, unknown>> }).events
    expect(ev.find(e => e.kind === 'tool_call')).toMatchObject({ tool: 'get_hotel_prices', via: 'use_tool', admitted: true })
    expect(h.state.stepCalls).toHaveLength(2) // no extra round to discover the tool
  })

  it('a hotel question preselects get_hotel_prices (its full schema this turn, no proxy needed)', async () => {
    h.state.steps = [{ text: 'ok.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tìm khách sạn ở Đà Nẵng gần biển' }])
    expect(Object.keys((h.state.stepCalls[0] as { tools: Record<string, unknown> }).tools)).toContain('get_hotel_prices')
  })
})
