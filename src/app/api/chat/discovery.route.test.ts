/**
 * Round 28 at route level (TAPPY_AGENT=2): "understand the need first, then search" (discoveryGate.ts). Model scripted, tools counted, no network, no real model.
 * The model in these tests behaves like the live UAT turn: it reaches for get_news / get_weather / search_places FIRST. What the tests pin is what the SYSTEM does about it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, any>>,
    placeCalls: 0, newsCalls: 0, weatherCalls: 0,
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
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) }),
    step: (opts: Record<string, any>) => {
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
    searchPlaces: async (_q: string, location?: string) => {
      h.state.placeCalls++
      const row = (name: string, id: string, i: number) => ({ name, place_id: id, rating_value: 4.5 - i / 10, rating_count: 900 - i * 50, google_rating: `${4.5 - i / 10}⭐`, address: `${i + 1} Đường Giả, Quận 1, TP.HCM`, maps_link: `https://maps.google.com/?cid=${100 + i}`, open_now: true, place_types: ['Khu vui chơi'] })
      const results = [row('Bida Sài Gòn', 'p1', 0), row('Game Zone Quận 1', 'p2', 1)]
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
    getNews: async () => { h.state.newsCalls++; return { source: 'test', articles: [] } },
  }
})
vi.mock('@/lib/ai/tools/weather', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/weather')>()
  return { ...real, getWeather: async () => { h.state.weatherCalls++; return { location: 'x', source: 'test' } } }
})

import { POST } from '@/app/api/chat/route'
// R42 R3 (LOC-DEFAULT-HCM-01 regression run): no network, ever — a fetch the mocks above do not cover fails at once instead of going online.
beforeEach(() => { vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { vi.unstubAllGlobals() })

const post = async (messages: unknown[], withGps = false) => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, ...(withGps ? { userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } } : {}) }),
    signal: undefined,
  }
  const res = await POST(req as never)
  return res.text()
}
const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })
const text = (body: string) => body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
const ASK = 'Bạn đang ở khu vực nào và muốn chơi kiểu nào — xem phim, chơi game/bida, ăn uống hay đi dạo?'
const U = (content: string) => ({ role: 'user', content })
const A = (content: string) => ({ role: 'assistant', content })
const OPEN = 'nay có gì dzui ko pa'
const toolNames = (i: number): string[] => Object.keys((h.state.stepCalls[i]?.tools ?? {}) as Record<string, unknown>)

async function turn(messages: unknown[], o: { gps?: boolean } = {}) {
  const logs: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  const body = await post(messages, o.gps)
  log.mockRestore()
  const gate = logs.filter(l => l.includes('"type":"tappyai_discovery_gate"')).map(l => JSON.parse(l) as Record<string, any>)
  const statuses = logs.filter(l => l.includes('"ev":"tool_status"')).map(l => JSON.parse(l) as { tool: string; status: string })
  return { body, gate, statuses }
}
/** What the live UAT model did: reach for get_news, get_weather and a place search before knowing what the user wants. */
const eager = () => [{ text: '', toolCalls: [call('get_news', { query: 'sự kiện vui chơi hôm nay' }), call('get_weather', { location: 'Hồ Chí Minh' }), call('search_places', { query: 'địa điểm vui chơi', type: 'attraction' })] }, { text: ASK, toolCalls: [] }]
const none = () => expect([h.state.placeCalls, h.state.newsCalls, h.state.weatherCalls]).toEqual([0, 0, 0])

beforeEach(() => {
  __resetAiQuestionQuotaLocal()
  h.state.steps = []; h.state.stepCalls = []; h.state.placeCalls = 0; h.state.newsCalls = 0; h.state.weatherCalls = 0
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'TAPPY_AUDIT_TRACE', 'NEXT_PUBLIC_SUPABASE_URL']) delete process.env[k] })

describe('flag ON: a vague discovery question is asked about BEFORE any lookup', () => {
  beforeEach(() => { process.env.CONSULTATIVE_IN_AGENT = '1' })

  it('"nay có gì dzui ko pa": get_news / get_weather / search_places are proposed → blocked; executed external lookups = 0; the reply is the question; no card', async () => {
    h.state.steps = eager()
    const x = await turn([U(OPEN)])
    none()
    expect(text(x.body)).toBe(ASK)
    expect(toolNames(0)).toEqual(expect.not.arrayContaining(['search_places', 'get_news', 'get_weather', 'web_search']))
    expect(h.state.stepCalls[0].system).toContain('LƯỢT NÀY CHƯA ĐƯỢC TRA CỨU')
    expect(h.state.stepCalls[0].system).toContain('KHÔNG đoán hay nhận xét sở thích')
    expect(x.gate).toEqual([expect.objectContaining({ action: 'ask', kind: 'where_and_what' })])
    expect(x.body).not.toContain('tappy.places')
  })
  it('with a location (GPS) the question is only about what', async () => {
    h.state.steps = eager()
    const x = await turn([U(OPEN)], { gps: true })
    none()
    expect(x.gate[0]).toMatchObject({ action: 'ask', kind: 'what', has_gps: true })
    expect(h.state.stepCalls[0].system).toContain('đi với ai')
  })
  it('(c) the user answers only "TP.HCM": still not searched — asks what, once more', async () => {
    h.state.steps = eager()
    const x = await turn([U(OPEN), A(ASK), U('TP.HCM')])
    none()
    expect(x.gate[0]).toMatchObject({ action: 'ask', kind: 'what_again' })
    expect(h.state.stepCalls[0].system).toContain('Đây là câu hỏi cuối')
  })
  it('(d) the user names the activity: the search runs at once and the question is not repeated', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'chơi game bida', location: 'Hồ Chí Minh', type: 'attraction' })] }, { text: 'Mình thấy **Bida Sài Gòn** hợp để chơi bida.', toolCalls: [] }]
    const x = await turn([U(OPEN), A(ASK), U('TP.HCM, thích chơi game/bida.')])
    expect(h.state.placeCalls).toBe(1)
    expect(x.gate).toEqual([])
    expect(toolNames(0)).toContain('search_places')
  })
  it('(e) still vague after two questions: it searches, and the system note says the assumption must be said out loud', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'địa điểm vui chơi', location: 'Hồ Chí Minh', type: 'attraction' })] }, { text: 'Mình chưa rõ bạn thích gì, nên gợi ý theo giả định: **Bida Sài Gòn**.', toolCalls: [] }]
    const x = await turn([U(OPEN), A(ASK), U('TP.HCM'), A('Bạn thích kiểu nào?'), U('gì cũng được')])
    expect(x.gate[0]).toMatchObject({ action: 'assume' })
    expect(h.state.placeCalls).toBe(1)
    expect(h.state.stepCalls[0].system).toContain('KHÔNG hỏi thêm')
  })
  it('a clear request is searched at once, with no gate: "tìm quán chay Quận 1 dưới 200k"', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'quán chay quận 1', location: 'Quận 1', type: 'restaurant' })] }, { text: 'Có **Bida Sài Gòn**.', toolCalls: [] }]
    const x = await turn([U('tìm quán chay Quận 1 dưới 200k')])
    expect(h.state.placeCalls).toBe(1)
    expect(x.gate).toEqual([])
  })
  it('need + area + time stated: no extra question', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'bida quận 3', location: 'Quận 3', type: 'attraction' })] }, { text: 'Có **Game Zone Quận 1**.', toolCalls: [] }]
    const x = await turn([U('tối nay tìm chỗ chơi bida ở quận 3 dưới 150k')])
    expect(h.state.placeCalls).toBe(1)
    expect(x.gate).toEqual([])
  })
  it('the tool_status trace (trace on) names every proposed call and its state: proposed → blocked, nothing executed', async () => {
    process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
    h.state.steps = eager()
    const x = await turn([U(OPEN)])
    expect(x.statuses.map(s => `${s.tool}:${s.status}`)).toEqual(['get_news:proposed', 'get_news:blocked', 'get_weather:proposed', 'get_weather:blocked', 'search_places:proposed', 'search_places:blocked'])
    none()
  })
  it('trace off: no tool_status line, the gate still works', async () => {
    h.state.steps = eager()
    const x = await turn([U(OPEN)])
    expect(x.statuses).toEqual([])
    none()
  })
})

describe('flag OFF (control): the same vague question behaves as before', () => {
  it('the retrieval tools are offered and what the model proposes runs; no gate line, no note, no tool_status', async () => {
    process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
    h.state.steps = [{ text: '', toolCalls: [call('get_news', { query: 'x' }), call('search_places', { query: 'địa điểm vui chơi', location: 'Hồ Chí Minh', type: 'attraction' })] }, { text: 'Mình thấy **Bida Sài Gòn**.', toolCalls: [] }]
    const x = await turn([U(OPEN)])
    expect(h.state.newsCalls).toBe(1)
    expect(h.state.placeCalls).toBe(1)
    expect(x.gate).toEqual([])
    expect(x.statuses).toEqual([])
    expect(h.state.stepCalls[0].system).not.toContain('CHƯA ĐƯỢC TRA CỨU')
    expect(toolNames(0)).toContain('search_places')
  })
})
