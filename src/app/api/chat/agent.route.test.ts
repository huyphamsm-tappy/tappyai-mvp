/**
 * TAPPY_AGENT — route-level tests. The model is scripted (AI.step), the place provider returns fixed rows, the write boundary is a spy.
 * OFF must be the existing path; ON must hand the turn to the bounded agent: no intent call, no canned/clarify shortcut, no code-run
 * presearch, tools executed by the loop with client frames, side-effecting actions only after an explicit confirmation turn.
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

beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.streamCalls = 0; h.state.extractCalls = 0; h.state.placeCalls = []; h.state.writes = []
  __resetAiQuestionQuotaLocal()
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
})
afterEach(() => { delete process.env.TAPPY_AGENT })

describe('flag OFF = the existing path', () => {
  it('a film question takes the old route (no agent step); a food question uses AI.stream', async () => {
    const body = await post([{ role: 'user', content: 'tối nay có phim gì đang chiếu không' }])
    expect(h.state.stepCalls).toHaveLength(0)
    expect(body.length).toBeGreaterThan(0)
    await post([{ role: 'user', content: 'Tìm quán ăn trưa ở Quận 1, ưu tiên rẻ.' }])
    expect(h.state.stepCalls).toHaveLength(0)
  })
})

describe('flag ON = the bounded agent decides', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '1' })

  it('a static question is answered directly: one model step, no tool, no intent call, no stream call', async () => {
    h.state.steps = [{ text: 'Phở là món nước truyền thống của Việt Nam.', toolCalls: [] }]
    const body = await post([{ role: 'user', content: 'phở là món gì?' }])
    expect(h.state.stepCalls).toHaveLength(1)
    expect(h.state.extractCalls).toBe(0)
    expect(h.state.streamCalls).toBe(0)
    expect(body).toContain('Phở là món nước')
    expect(body).not.toMatch(/^9:/m)
  })
  it('the model sees the agent instructions, the code-computed calendar, GPS and the tools (with why), never the consult frames', async () => {
    h.state.steps = [{ text: 'ok', toolCalls: [] }]
    await post([{ role: 'user', content: 'thứ 3 tuần sau bay Đà Nẵng' }])
    const o = h.state.stepCalls[0] as { systemShared: string; system: string; tools: Record<string, { parameters: { shape: Record<string, unknown> } }> }
    expect(o.systemShared).toMatch(/Bạn là Tappy/)
    expect(o.system).toMatch(/NGỮ CẢNH LƯỢT NÀY/)
    expect(o.system).toMatch(/"thu 3 tuan sau" = Thứ ba/)
    expect(o.system).toMatch(/không hỏi "ở đâu"/)
    expect(o.system + o.systemShared).not.toMatch(/Mình hiểu bạn cần|KHUNG|LỜI KHUYÊN — BẮT BUỘC/)
    expect(Object.keys(o.tools)).toEqual(expect.arrayContaining(['search_places', 'web_search', 'get_now_showing', 'request_action', 'get_flight_prices']))
    expect(Object.keys(o.tools)).not.toContain('save_price_watch')
    expect(Object.keys(o.tools.search_places.parameters.shape)).toContain('why')
  })
  it('"100k quận 1" is searched straight away (no clarification card), the tool frames reach the client', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán ăn ngon dưới 100k', location: 'Quận 1', why: 'tìm quán theo ngân sách' })] },
      { text: '**Cơm Tấm Ba Ghiền** hợp 100k: giá tham khảo 1–70.000đ, 4,6⭐.', toolCalls: [] },
    ]
    const body = await post([{ role: 'user', content: '100k quận 1' }])
    expect(body).not.toContain('TAPPY_ASK')
    expect(h.state.placeCalls).toHaveLength(1)
    expect(body).toMatch(/^9:.*search_places/m)
    expect(body).toMatch(/^a:/m)
    expect(body).not.toContain('tìm quán theo ngân sách') // the reason is trace-only
    expect(body).toContain('Cơm Tấm Ba Ghiền')
  })
  it('a film question is no longer a canned reply: the agent may call get_now_showing', async () => {
    h.state.steps = [{ text: 'Mình tra danh sách phim nhé.', toolCalls: [] }]
    const body = await post([{ role: 'user', content: 'tối nay có phim gì đang chiếu không' }])
    expect(h.state.stepCalls.length).toBeGreaterThan(0)
    expect(body).not.toContain('Mình chưa có danh sách phim đang chiếu đã kiểm chứng')
  })
  it('a travel date written by the model is overridden by the code-resolved date before the fare tool runs', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
    h.state.steps = [
      { text: '', toolCalls: [call('get_flight_prices', { origin: 'TP.HCM', destination: 'Đà Nẵng', departDate: '2026-10-11' })] },
      { text: 'Chuyến ngày thứ Ba.', toolCalls: [] },
    ]
    const body = await post([{ role: 'user', content: 'thứ 3 tuần sau bay từ Sài Gòn đi Đà Nẵng' }])
    spy.mockRestore()
    const guard = logs.find(l => l.includes('tappyai_agent_date_guard'))
    expect(guard).toBeTruthy()
    expect(JSON.parse(guard!).model).toBe('2026-10-11')
    expect(body).toMatch(/9:[^\n]*get_flight_prices[^\n]*"departDate":"\d{4}-\d{2}-\d{2}"/)
    expect(body).not.toMatch(/9:[^\n]*2026-10-11/)
  })
  it('one trace line per turn: model calls, tools with why/outcome, status', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'phở', why: 'tìm quán phở' })] }, { text: '**Phở Lệ Nguyễn Trãi**', toolCalls: [] }]
    await post([{ role: 'user', content: 'phở ngon gần đây' }])
    spy.mockRestore()
    const traces = logs.filter(l => l.includes('"tappyai_agent_trace"'))
    expect(traces).toHaveLength(1)
    expect(JSON.parse(traces[0])).toMatchObject({ status: 'answered', model_calls: 2, tool_calls: 1, tools: [{ name: 'search_places', why: 'tìm quán phở', outcome: 'ok' }] })
  })
  it('an action is never executed by the model: request → pending; only the user\'s "xác nhận" next turn runs it', async () => {
    const sid = randomUUID()
    h.state.steps = [
      { text: '', toolCalls: [call('request_action', { action: 'save_price_watch', args: { product_name: 'AirPods Pro 2', target_price: 4_000_000, search_query: 'airpods pro 2 giá' } })] },
      { text: 'Mình sẽ theo dõi giá AirPods Pro 2 và báo khi dưới 4 triệu — bạn xác nhận nhé?', toolCalls: [] },
    ]
    const t1 = await post([{ role: 'user', content: 'theo dõi giá airpods pro 2, báo mình khi dưới 4 triệu' }], sid)
    expect(h.state.writes).toHaveLength(0)
    expect(t1).toContain('xác nhận')
    h.state.steps = [{ text: 'Xong, mình đã bật theo dõi giá.', toolCalls: [] }]
    await post([
      { role: 'user', content: 'theo dõi giá airpods pro 2, báo mình khi dưới 4 triệu' },
      { role: 'assistant', content: 'Mình sẽ theo dõi giá AirPods Pro 2 và báo khi dưới 4 triệu — bạn xác nhận nhé?' },
      { role: 'user', content: 'xác nhận' },
    ], sid)
    expect(h.state.writes).toHaveLength(1)
    const last = h.state.stepCalls.at(-1) as { system: string; messages: Array<{ role: string; content: unknown }> }
    const data = last.messages.map(m => typeof m.content === 'string' ? m.content : '').find(c => c.startsWith('<<<DỮ LIỆU PHIÊN')) ?? ''
    expect(data).toMatch(/Kết quả hành động người dùng vừa xác nhận: Đã thực hiện/)
    expect(last.system).not.toMatch(/AirPods/) // the action summary (user words) is data, not system text
  })
  it('a cancelled action is never executed', async () => {
    const sid = randomUUID()
    h.state.steps = [{ text: '', toolCalls: [call('request_action', { action: 'save_price_watch', args: { product_name: 'Kindle', target_price: 2_000_000, search_query: 'kindle giá' } })] }, { text: 'Bạn xác nhận nhé?', toolCalls: [] }]
    await post([{ role: 'user', content: 'theo dõi giá kindle dưới 2 triệu' }], sid)
    h.state.steps = [{ text: 'Ok, mình huỷ.', toolCalls: [] }]
    await post([{ role: 'user', content: 'theo dõi giá kindle dưới 2 triệu' }, { role: 'assistant', content: 'Bạn xác nhận nhé?' }, { role: 'user', content: 'thôi huỷ đi' }], sid)
    expect(h.state.writes).toHaveLength(0)
  })
})

describe('flag ON — the legacy empty-result rewrite never replaces the agent answer', () => {
  it('route wiring: getEmpty yields nothing on an agent turn', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(src).toContain('getEmpty: () => (agentOn ? null : emptyPlaceSearch)')
    // …and no server-written trailing question: the agent decides whether to ask.
    expect(src).toContain('askAfterStream(finalResponse.body, agentOn ? null : gateAskAfter, lang)')
  })
})

describe('flag ON — secrets never reach a provider query or the logs (route level)', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '1' })
  it('a key and contact data the model copies into a query are cut before the search; no log line carries them', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'phở ngon sk-proj-abcdefghijklmnopqrstuvwx an@gmail.com', why: 'tìm phở cho an@gmail.com' })] },
      { text: '**Phở Lệ Nguyễn Trãi** đang mở.', toolCalls: [] },
    ]
    await post([{ role: 'user', content: 'tìm phở ngon, key của tôi là sk-proj-abcdefghijklmnopqrstuvwx, email an@gmail.com' }])
    spy.mockRestore()
    expect(h.state.placeCalls[0]).toContain('phở')
    expect(h.state.placeCalls[0]).not.toMatch(/sk-proj|an@gmail/)
    expect(logs.join('\n')).not.toMatch(/sk-proj-abcdefghij|an@gmail\.com/)
  })
})

describe('hardening D — one hard Serper budget per agent turn (tools + card photos)', () => {
  it('route wiring: 8 normal / 10 travel; the photo lookup gets only what the tools left', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(src).toContain("const agentSerperLimit = planningIntent === 'trip' ? 10 : 8")
    expect(src).toContain('serperTurnCredits: agentSerperLimit')
    expect(src).toContain('sharedSerperBudget(Math.max(0, agentSerperLimit - agentSerperSpent))')
    expect(src).toContain('await afterLoopSerper(() => enrichWithTikTok(')
    expect(src).toContain('await afterLoopSerper(() => Promise.all(places.map(')
  })
})

describe('Phase 7 2F — AI Planner pre-search sufficiency gate (route level)', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '1' })
  it('"Lên kế hoạch du lịch cuối tuần" → ONE destination question; no model step, no tool, no place search', async () => {
    const body = await post([{ role: 'user', content: 'Lên kế hoạch du lịch cuối tuần' }])
    expect(body).toContain('Cuối tuần này bạn muốn đi đâu? Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp.')
    expect(h.state.stepCalls).toHaveLength(0)
    expect(h.state.placeCalls).toHaveLength(0)
    expect(body).not.toMatch(/^9:/m)
  })
  it('then "Đà Nẵng": the plan proceeds through the agent (the destination is now known)', async () => {
    h.state.steps = [{ text: 'Lịch Đà Nẵng cuối tuần…', toolCalls: [] }]
    await post([
      { role: 'user', content: 'Lên kế hoạch du lịch cuối tuần' },
      { role: 'assistant', content: 'Cuối tuần này bạn muốn đi đâu? Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp.' },
      { role: 'user', content: 'Đà Nẵng' },
    ])
    expect(h.state.stepCalls.length).toBeGreaterThan(0)
  })
  it('a plan that names its destination is never asked first', async () => {
    h.state.steps = [{ text: 'Lịch Phú Quốc…', toolCalls: [] }]
    const body = await post([{ role: 'user', content: 'lên kế hoạch du lịch Phú Quốc 3 ngày 2 đêm' }])
    expect(body).not.toContain('bạn muốn đi đâu')
    expect(h.state.stepCalls.length).toBeGreaterThan(0)
  })
})

describe('Phase 7 2F — the gate reads the user words however the client encodes them', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '1' })
  it('content as text parts (not a plain string) still triggers the destination question with no model step', async () => {
    const body = await post([{ role: 'user', content: [{ type: 'text', text: 'Lên kế hoạch du lịch cuối tuần' }] }])
    expect(body).toContain('Cuối tuần này bạn muốn đi đâu?')
    expect(h.state.stepCalls).toHaveLength(0)
    expect(h.state.placeCalls).toHaveLength(0)
  })
})
