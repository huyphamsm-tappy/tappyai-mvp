/**
 * Round 25 — one simulated TURN through route.ts → the agent runtime → the settle path (streamEnrichment guards), no real model and no network.
 * Fixtures are the Round 24 live trace (r25TripFixtures.ts): the model's answer before any guard, and the get_trip_data rows.
 *
 * SIMULATED here: POST /api/chat (auth, quota, rate-limit mocked), the real runtime loop with scripted model steps, the REAL get_trip_data tool (hotel / places
 * fetchers mocked with the trace rows), the real tool-result handling, the real settle path (plan guards, caveats, leak guard, budget table), the data-stream framing.
 * NOT simulated / NOT proven: the real model's behaviour, real Serper / Maps / hotel data, the audit / persistence side (Supabase mocked), the CLIENT (frame parsing,
 * TripPlanCard rendering, tabs, tips block under every tab, scrolling, images) — a passing harness says nothing about the frontend.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { R24_USER, R24_MODEL_ANSWER } from '@/lib/ai/r25TripFixtures'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    placeCalls: [] as string[],
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
vi.mock('@/lib/ai/actions/runAction', () => ({ runAiWriteAction: vi.fn(async () => ({ ok: true, result: { ok: true, id: 'w1' } })) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) }),
    // Only calls that offer tools consume the script (the answer-first side call has none and answers nothing).
    step: (opts: Record<string, unknown>) => {
      h.state.stepCalls.push(opts)
      if (!opts.tools) return Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 1 }, providerMetadata: {} })
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: s.toolCalls, finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  const fx = await import('@/lib/ai/r25TripFixtures')
  return {
    ...real,
    searchPlaces: async (query: string, location?: string) => {
      h.state.placeCalls.push(query)
      const results = /tham quan/i.test(query) ? fx.R24_ATTRACTIONS : fx.R24_RESTAURANTS
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
  }
})
vi.mock('@/lib/ai/tools/travel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/travel')>()
  // Round 24: the hotel search returned no hotel row.
  return { ...real, getHotelPrices: async (location: string) => ({ location, source: 'test', hotel_list: [] }) }
})

import { POST } from '@/app/api/chat/route'
// R42 R3 (LOC-DEFAULT-HCM-01 regression run): no network, ever — a fetch the mocks above do not cover fails at once instead of going online.
beforeEach(() => { vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { vi.unstubAllGlobals() })

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

interface Plan { days: Array<{ label?: string; items: Array<Record<string, unknown>> }>; local_tips?: unknown[]; budget_lines?: unknown[] }
interface Turn { frames: string[]; prefixes: string[]; text: string; plan: Plan | null; lead: string; tail: string; logs: string[] }

async function turn(): Promise<Turn> {
  const logs: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  const body = await post([{ role: 'user', content: R24_USER }])
  log.mockRestore()
  const frames = body.split('\n').filter(Boolean)
  const text = frames.filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const a = text.indexOf('[TAPPY_PLAN]'), b = text.indexOf('[/TAPPY_PLAN]')
  let plan: Plan | null = null
  try { plan = JSON.parse(text.slice(a + 12, b).trim()) as Plan } catch { plan = null }
  return { frames, prefixes: frames.map(l => l.slice(0, 2)), text, plan, lead: a > 0 ? text.slice(0, a) : '', tail: b > 0 ? text.slice(b + 13) : '', logs }
}

beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.placeCalls = []
  __resetAiQuestionQuotaLocal()
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
  h.state.steps = [{ text: '', toolCalls: [call('get_trip_data', { destination: 'Nha Trang', interests: 'ăn chay' })] }, { text: R24_MODEL_ANSWER, toolCalls: [] }]
})
afterEach(() => { delete process.env.TAPPY_AGENT; delete process.env.CONSULTATIVE_IN_AGENT })

const names = (t: Turn, day: number) => (t.plan?.days[day].items ?? []).map(i => String(i.name))

describe('one simulated trip turn (Round 24 trace fixtures), flag ON', () => {
  it('event order: tool frames before the plan text, one finish frame and it is last; the tool ran once', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const t = await turn()
    const firstText = t.prefixes.indexOf('0:')
    const toolIdx = t.prefixes.map((p, i) => (p === '9:' || p === 'a:' ? i : -1)).filter(i => i >= 0)
    expect(toolIdx.length).toBeGreaterThan(0)
    expect(Math.max(...toolIdx)).toBeLessThan(t.prefixes.lastIndexOf('0:'))
    expect(firstText).toBeGreaterThanOrEqual(0)
    expect(t.prefixes.filter(p => p === 'd:')).toHaveLength(1)
    expect(t.prefixes[t.prefixes.length - 1]).toBe('d:')
    expect(h.state.placeCalls).toHaveLength(2) // attractions + restaurants, once each
    expect(h.state.stepCalls.filter(c => c.tools)).toHaveLength(2) // tool step + answer step: no card retry (the card was there)
  })

  it('content: lead once, ONE complete plan block that parses with 3 days, tail once, nothing cut, nothing doubled', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const t = await turn()
    expect(t.text.match(/\[TAPPY_PLAN\]/g)).toHaveLength(1)
    expect(t.text.match(/\[\/TAPPY_PLAN\]/g)).toHaveLength(1)
    expect(t.plan?.days).toHaveLength(3)
    expect(t.text.match(/khởi hành \*\*thứ Bảy 24\/10\/2026\*\*/g) ?? t.text.match(/thứ Bảy 24\/10\/2026/g)).toHaveLength(1)
    expect(t.text.match(/Lịch này ưu tiên điểm tham quan trong thành phố/g)).toHaveLength(1)
    expect(t.tail.trim().endsWith('cần chỉnh lại.')).toBe(true)
    expect(t.text).not.toContain('Mình không chia sẻ hướng dẫn nội bộ') // the leak guard did not replace the answer
  })

  it('guards work on the real data: description grounded, generic check-in / check-out kept, non-vegetarian rows become meal slots, repeated sight dropped', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const t = await turn()
    const tram = t.plan!.days[0].items.find(i => String(i.name).includes('Tháp Trầm Hương'))!
    expect(String(tram.description)).toBe('Điểm thu hút khách du lịch, Công viên; theo dữ liệu tra cứu: Mở cửa cả ngày.')
    expect(names(t, 0)).toContain('Gửi hành lý / nhận phòng')
    expect(names(t, 2)).toContain('Trả phòng, gửi hành lý')
    const stay = t.plan!.days[0].items.find(i => i.name === 'Gửi hành lý / nhận phòng')!
    expect(stay.category).toBe('rest')
    for (const f of ['address', 'maps_link', 'place_id', 'booking_link']) expect(stay[f] ?? '').toBe('')
    expect(names(t, 0)).not.toContain('Quán Chay Nhà Bụt')   // place_types ["Nhà hàng"] only
    expect(names(t, 2)).not.toContain('Quán Chay Sen Vàng')  // place_types ["Quán ăn nhỏ"] only
    expect(names(t, 2)).toContain('SHAKTI VEGGIES BISTRO ( Chay )') // vegetarian place_types kept
    expect(names(t, 2).some(n => n.includes('Tháp Trầm Hương'))).toBe(false)
    const unnamed = t.plan!.days[1].items.find(i => i.name === 'Dạo ven biển Trần Phú')!
    expect(String(unnamed.description)).toContain('(gợi ý chưa kiểm chứng)')
    expect(unnamed.address ?? '').toBe('')
    // budget_lines is consumed by the settle path (planBudget): it becomes the budget text, with every line "chưa có dữ liệu" because the data carries no price
    expect(t.text).toMatch(/Ngân sách/)
    expect(t.text).toMatch(/chưa có dữ liệu/)
    expect(t.text).not.toMatch(/\d[\d.]*\s?(?:đ|₫|VND)\b/) // no invented amount (the fixture has no priced source)
  })
})

describe('the same turn, flag OFF (control)', () => {
  it('the settle path keeps the old behaviour: no grounded description, generic check-out dropped, no unverified marker', async () => {
    const t = await turn()
    expect(t.plan?.days).toHaveLength(3)
    expect(t.text).not.toContain('(gợi ý chưa kiểm chứng)')
    expect(JSON.stringify(t.plan)).not.toContain('theo dữ liệu tra cứu: Mở cửa cả ngày')
    expect(names(t, 2)).not.toContain('Trả phòng, gửi hành lý')
    expect(t.prefixes[t.prefixes.length - 1]).toBe('d:')
  })
})
