/**
 * Phase 8 M1: TAPPY_AGENT=2 at route level. The new runtime runs (role agent, AGENT_SYSTEM_V2, ask_user offered), one structured
 * run trace per turn, the Phase 7 regex planner gate is replaced by the ask, and the flag is isolated: TAPPY_AGENT=1 and unset
 * keep their paths and emit no Phase 8 trace. Model scripted (AI.step), places fixed, no network.
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
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
})
afterEach(() => { delete process.env.TAPPY_AGENT })

describe('TAPPY_AGENT=2 — the Phase 8 runtime', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '2' })

  it('answers directly with the runtime role and instructions; ask_user is offered; one trace line', async () => {
    h.state.steps = [{ text: 'Phở bò dùng xương bò, phở gà dùng gà.', toolCalls: [] }]
    const { body, traces } = await turn([{ role: 'user', content: 'phở bò với phở gà khác gì?' }])
    expect(h.state.stepCalls).toHaveLength(1)
    const o = h.state.stepCalls[0] as { role: string; systemShared: string; tools: Record<string, unknown> }
    expect(o.role).toBe('agent')
    expect(o.systemShared).toContain('đủ để trả lời tốt chưa?')
    expect(Object.keys(o.tools)).toEqual(expect.arrayContaining(['ask_user', 'search_places', 'web_search', 'read_page']))
    expect(Object.keys(o.tools)).not.toContain('save_price_watch')
    // M2: exactly one structured call per turn = the task tracker (runtime/taskTracker.ts), never a stream / intent call.
    expect(h.state.streamCalls).toBe(0)
    expect(h.state.extractCalls).toBe(1)
    expect(body).toContain('Phở bò dùng xương bò')
    expect(traces).toHaveLength(1)
    expect(traces[0]).toMatchObject({ flag: 'TAPPY_AGENT=2', status: 'answered', final_output_type: 'text', model_role: 'agent', limits: { serper: 12, deadline_ms: 85_000 } })
  })

  it('ask_user: the reply is the question + quick-reply chips; nothing is searched; output type "ask"', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('ask_user', { question: 'Bạn cần laptop cho việc gì', choices: ['Văn phòng', 'Đồ hoạ'] })] }]
    const { body, traces } = await turn([{ role: 'user', content: 'Mua laptop nào tốt?' }])
    expect(body).toContain('Bạn cần laptop cho việc gì?')
    expect(body).toContain('[FOLLOWUPS]Văn phòng|Đồ hoạ[/FOLLOWUPS]')
    expect(h.state.placeCalls).toHaveLength(0)
    expect(traces[0]).toMatchObject({ status: 'asked', stop_reason: 'asked', final_output_type: 'ask' })
  })

  it('a trip with no destination goes to Luna (no Phase 7 regex canned question)', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('ask_user', { question: 'Cuối tuần này bạn muốn đi đâu', choices: ['Đà Lạt', 'Vũng Tàu'] })] }]
    const { body } = await turn([{ role: 'user', content: 'Lên kế hoạch du lịch cuối tuần' }])
    expect(h.state.stepCalls).toHaveLength(1)
    expect(body).toContain('Cuối tuần này bạn muốn đi đâu?')
  })

  it('iterates: search → search again → answer; cards and tool frames keep their contract; the trace has every round', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'cơm tấm quận 1', location: 'Quận 1' })] },
      { text: '', toolCalls: [call('web_search', { query: 'cơm tấm ba ghiền giờ mở cửa' })] },
      { text: '**Cơm Tấm Ba Ghiền** (4,6⭐) hợp bữa trưa; **Phở Lệ Nguyễn Trãi** là lựa chọn thay thế.', toolCalls: [] },
    ]
    const { body, traces } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    expect(h.state.stepCalls).toHaveLength(3)
    expect(body).toMatch(/^9:.*search_places/m)
    expect(body).toMatch(/^a:/m)
    expect(body).toContain('tappy.places.v1')
    expect(body).toContain('Cơm Tấm Ba Ghiền')
    const t = traces[0] as { events: Array<{ kind: string; tool?: string }>; totals: Record<string, number>; final_output_type: string }
    expect(t.events.filter(e => e.kind === 'model_round')).toHaveLength(3)
    expect(t.events.filter(e => e.kind === 'tool_call').map(e => e.tool)).toEqual(['search_places', 'web_search'])
    expect(t.totals.toolCalls).toBe(2)
    expect(t.final_output_type).toBe('cards')
  })

  it('guard actions reach the trace: a claim cut by a settle-path guard is recorded as a guard event', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'cơm tấm quận 1' })] },
      { text: '**Cơm Tấm Ba Ghiền** ngon. **Quán Không Có Thật** được 4,9⭐ với 9.999 đánh giá.', toolCalls: [] },
    ]
    const { traces } = await turn([{ role: 'user', content: 'Tìm quán cơm tấm ở Quận 1' }])
    const guards = (traces[0].events as Array<{ kind: string; stage?: string; removed?: number }>).filter(e => e.kind === 'guard')
    expect(guards.length).toBeGreaterThan(0)
    expect(guards.every(g => typeof g.stage === 'string')).toBe(true)
    expect((traces[0].totals as Record<string, number>).guardChanges).toBe(guards.length)
  })

  it('route wiring: the 85 s hard deadline and the Phase 8 Serper ceilings come from runtime/limits.ts', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(src).toContain('deadlineAt: startTime + RUNTIME_LIMITS.deadlineMs')
    expect(src).toContain("serperCeiling(travelIntent || planningIntent === 'trip')")
    expect(src).toContain('.pipeThrough(traceTailStream(agentRunTrace))')
  })
})

describe('flag isolation', () => {
  it('TAPPY_AGENT=1: the Phase 7 agent (role consult, no ask_user, no Phase 8 trace)', async () => {
    process.env.TAPPY_AGENT = '1'
    h.state.steps = [{ text: 'Phở là món nước.', toolCalls: [] }]
    const { traces } = await turn([{ role: 'user', content: 'phở là gì?' }])
    const o = h.state.stepCalls[0] as { role: string; tools: Record<string, unknown> }
    expect(o.role).toBe('consult')
    expect(Object.keys(o.tools)).not.toContain('ask_user')
    expect(Object.keys(o.tools)).not.toContain('read_page') // M3 page reading is TAPPY_AGENT=2 only
    expect(traces).toHaveLength(0)
  })

  it('TAPPY_AGENT=1 keeps the Phase 7 regex planner question (0 model steps)', async () => {
    process.env.TAPPY_AGENT = '1'
    await turn([{ role: 'user', content: 'Lên kế hoạch du lịch cuối tuần' }])
    expect(h.state.stepCalls).toHaveLength(0)
  })

  it('unset (production today): the legacy path, no agent step, no Phase 8 trace', async () => {
    const { traces } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ở Quận 1, ưu tiên rẻ.' }])
    expect(h.state.stepCalls).toHaveLength(0)
    expect(traces).toHaveLength(0)
  })

  it('any other value (e.g. "3", "true", "2 ") is NOT an agent', async () => {
    for (const v of ['3', 'true', '2 ']) {
      process.env.TAPPY_AGENT = v
      h.state.stepCalls = []
      await turn([{ role: 'user', content: 'phở là gì?' }])
      expect(h.state.stepCalls).toHaveLength(0)
    }
  })
})

describe('M3 · citations through the real stream pipeline (TAPPY_AGENT=2)', () => {
  it('a page the agent read is cited: the [S1] marker becomes a sanitised link at the enrichment site, and survives the guards', async () => {
    const { __setPageFetchOverride } = await import('@/lib/security/safePageFetch')
    const { __resetPageCache } = await import('@/lib/ai/agent/runtime/readPage')
    __resetPageCache()
    const url = 'https://www.apple.com/airpods-pro/specs/'
    const html = '<html><head><title>AirPods Pro 2 - Tech Specs - Apple</title></head><body><main><p>Up to 6 hours of listening time with a single charge.</p><p>' + 'Thông tin thêm. '.repeat(40) + '</p></main></body></html>'
    __setPageFetchOverride(async u => ({ ok: true, url: u, finalUrl: u, status: 200, contentType: 'text/html', body: html, bytes: html.length, truncated: false, redirects: 0, ms: 1 }))
    try {
      process.env.TAPPY_AGENT = '2'
      h.state.steps = [
        { text: '', toolCalls: [call('read_page', { url, focus: 'battery life' })] },
        { text: 'Theo Apple, AirPods Pro 2 nghe tối đa 6 giờ mỗi lần sạc [S1].', toolCalls: [] },
      ]
      const { body } = await turn([{ role: 'user', content: `Trang này nói pin bao lâu? ${url}` }])
      const reply = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
      expect(reply).toContain('([apple.com](https://www.apple.com/airpods-pro/specs/))')
      expect(reply).not.toContain('[S1]')
    } finally { __setPageFetchOverride(null) }
  })
})
