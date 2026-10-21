/**
 * Phase 8 M7 at route level (TAPPY_AGENT=2): nothing searches before Luna decides (no pre-search, search is an optional tool), and the
 * settle path never writes a second "Mình chọn …" under a reply that already states Luna's pick (Luna owns the answer; the evidence
 * sentence is only a backstop for a pick the guards cut). Model scripted, places fixed, no network.
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
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
})
afterEach(() => { delete process.env.TAPPY_AGENT })

const text = (body: string) => body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

describe('M7 · route', () => {
  it('no pre-search: a place question Luna answers without a tool triggers no search at all', async () => {
    h.state.steps = [{ text: 'Bạn muốn ăn món gì, ở khu nào? Mình gợi ý vài hướng: phở, cơm tấm, bún chả.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    expect(h.state.placeCalls).toEqual([])
    expect(h.state.stepCalls).toHaveLength(1)
    expect(h.state.streamCalls).toBe(0) // no legacy AI.stream path
  })

  it('search is Luna\'s choice: when it calls search_places the search runs once, inside the runtime', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'quán ăn trưa', location: 'Quận 1' })] }, { text: 'Mình chọn **Cơm Tấm Ba Ghiền** cho bữa trưa gần bạn.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    expect(h.state.placeCalls).toHaveLength(1)
  })

  it('a short reply that already states Luna\'s pick is not followed by a code-written second pick sentence', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'quán ăn trưa', location: 'Quận 1' })] }, { text: 'Mình chọn **Cơm Tấm Ba Ghiền**.', toolCalls: [] }]
    const { body } = await turn([{ role: 'user', content: 'Tìm quán ăn trưa ngon ở Quận 1' }])
    const t = text(body)
    expect(t.match(/Mình chọn/g)?.length ?? 0).toBe(1)
    expect(t).toContain('Cơm Tấm Ba Ghiền')
  })
})
