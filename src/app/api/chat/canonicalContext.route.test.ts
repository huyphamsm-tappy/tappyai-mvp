/**
 * CANONICAL_CONTEXT in the chat route (R13 §3.3-3.5, §7.1), default OFF.
 *   OFF: the route is as it was (same system prompt, no trace line).
 *   ON : one counts-only trace line per turn and, only when the target / reply language differs from what the model would assume, ONE fact line in the system prompt.
 *   The market the gate judges is NOT changed by the target: with MARKET_GATE ON a Bangkok / Tokyo target still runs the search tools (the registry serves Viet Nam only today).
 * Mocks are those of r13Wiring.route.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = { calls: { spend: 0, model: 0, intent: 0 }, opts: null as null | Record<string, any> }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  const client = { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) }
  return { state, client, admin: client }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u1' }, supabase: h.client }) }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return { ...real, consumeAiQuestion: async () => { h.state.calls.spend++; return { ok: true, remaining: 10, limit: 15 } } }
})
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    extract: () => { h.state.calls.intent++; return Promise.resolve({}) },
    stream: (o: Record<string, any>) => { h.state.calls.model++; h.state.opts = o; return { toDataStreamResponse: () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return { ...real, searchPlaces: async () => ({ source: 'test', count: 0, location: '', results: [], place_search_status: 'empty' }) }
})

import { POST } from '@/app/api/chat/route'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const HANOI = { lat: 21.03, lng: 105.85 }
const TOKYO = { lat: 35.66, lng: 139.7 }
const post = async (text: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
  const body = { messages: [{ role: 'user', content: text }], ...extra }
  return POST({
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', ...headers }),
    json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)), signal: undefined,
  } as never)
}
const system = (): string => String(h.state.opts?.system ?? '')
const LINE = '[Resolved context, facts only'
const search = () => (h.state.opts?.tools as Record<string, { execute: (a: unknown, o: unknown) => Promise<any> }> | undefined)?.search_places?.execute({ query: 'cafe', location: 'x' }, { toolCallId: 't', messages: [] })

let logs: string[] = []
beforeEach(() => {
  h.state.calls = { spend: 0, model: 0, intent: 0 }; h.state.opts = null; __resetAiQuestionQuotaLocal(); logs = []
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T03:00:00Z'))
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks() })
const traces = () => logs.filter(l => l.includes('tappyai_canonical_context')).map(l => JSON.parse(l))

describe('CANONICAL_CONTEXT in the chat route', () => {
  const BANGKOK = 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình'
  const TOKYO_Q = 'Tôi đang ở Tokyo, quán cà phê gần Shibuya nào ngon?'

  it('OFF (default): no trace line, no fact line, and the system prompt is what it was', async () => {
    await post(BANGKOK, { userLocation: HANOI })
    expect(h.state.calls.model).toBe(1)
    expect(traces()).toEqual([])
    expect(system()).not.toContain(LINE)
  })

  it('OFF vs ON on a turn with nothing to tell: the system prompt is byte-for-byte the same', async () => {
    await post('Tìm quán bún bò ngon ở Quận 1')
    const off = system()
    vi.stubEnv('CANONICAL_CONTEXT', '1')
    await post('Tìm quán bún bò ngon ở Quận 1')
    expect(system()).toBe(off)
    expect(traces().length).toBe(1)
  })

  it('ON: Hanoi -> Bangkok gets the fact line (target, role of the GPS) and a counts-only trace', async () => {
    vi.stubEnv('CANONICAL_CONTEXT', '1')
    await post(BANGKOK, { userLocation: HANOI })
    expect(system()).toContain(LINE)
    expect(system()).toMatch(/Target place: Bangkok \(.*\), Thailand/)
    expect(system()).toContain('Current location (GPS): Hà Nội')
    const [t] = traces()
    expect(t).toMatchObject({ type: 'tappyai_canonical_context', intent: 'TRAVEL_PLANNING', target_resolved: true, target_country: 'TH', location_source: 'GPS', cross_border: true, ambiguity_count: 0, query_lang: 'vi', response_lang: 'vi' })
    const raw = logs.find(l => l.includes('tappyai_canonical_context')) ?? ''
    for (const needle of ['Bangkok', 'Hà Nội', 'lịch trình', '21.03', '105.85']) expect(raw).not.toContain(needle)
  })

  // the trip-plan turn itself carries no search tool in the route (its own plan frame), so the gate cases use a search-shaped Bangkok turn
  const BKK_SEARCH = 'Tìm quán ăn ngon ở Bangkok'

  it('ON + MARKET_GATE: a Bangkok target does NOT make the gate deny the search tool (the market stays the user/service market), and the tool set is the one OFF gives', async () => {
    vi.stubEnv('MARKET_GATE', '1')
    await post(BKK_SEARCH, { userLocation: HANOI })
    const offTools = Object.keys((h.state.opts?.tools ?? {}) as object).sort()
    vi.stubEnv('CANONICAL_CONTEXT', '1')
    await post(BKK_SEARCH, { userLocation: HANOI })
    expect(system()).toContain(LINE)
    expect(system()).toMatch(/Target place: Bangkok/)
    expect(Object.keys((h.state.opts?.tools ?? {}) as object).sort()).toEqual(offTools)
    expect(offTools).toContain('search_places')
    expect(JSON.stringify(await search())).not.toContain('market_unavailable')
    expect(logs.some(l => l.includes('tappyai_market_gate_denied'))).toBe(false)
  })

  it('ON + MARKET_GATE: "Tôi đang ở Tokyo, quán cà phê gần Shibuya nào ngon?" with Tokyo GPS still runs the search tool', async () => {
    vi.stubEnv('CANONICAL_CONTEXT', '1'); vi.stubEnv('MARKET_GATE', '1')
    await post(TOKYO_Q, { userLocation: TOKYO })
    expect(h.state.calls.model).toBe(1)
    expect(JSON.stringify(await search())).not.toContain('market_unavailable')
    expect(traces()[0]).toMatchObject({ intent: 'NEARBY_DISCOVERY', target_country: 'JP', location_source: 'GPS', location_role: 'SECONDARY', cross_border: true })
    expect(system()).not.toContain(LINE) // Shibuya is in the city the person is in: nothing to tell the model
  })

  it('ON: the gate still refuses an explicit foreign MARKET header exactly as before (the target never widens it)', async () => {
    vi.stubEnv('CANONICAL_CONTEXT', '1'); vi.stubEnv('MARKET_GATE', '1')
    await post(BKK_SEARCH, { userLocation: HANOI }, { 'x-tappy-market': 'th' })
    expect(await search()).toMatchObject({ error: 'market_unavailable', reason: 'UNKNOWN_MARKET' })
  })

  it('ON: an explicit reply language gets one line and the question language is read without the instruction', async () => {
    vi.stubEnv('CANONICAL_CONTEXT', '1')
    await post('用中文回答：Phở Thìn Hà Nội có gì đặc biệt?')
    expect(system()).toContain('Reply language: Simplified Chinese')
    expect(traces()[0]).toMatchObject({ intent: 'GENERAL_INFORMATION', query_lang: 'vi', response_lang: 'zh', response_source: 'EXPLICIT_REQUEST' })
  })

  it('ON: an IP-only / no-location "near me" turn is traced with the ambiguity count and tells the model nothing', async () => {
    vi.stubEnv('CANONICAL_CONTEXT', '1')
    await post('Quán phở nào gần đây?')
    expect(traces()[0]).toMatchObject({ intent: 'NEARBY_DISCOVERY', target_resolved: false, location_source: 'UNKNOWN', ambiguity_count: 1 })
    expect(system()).not.toContain(LINE)
  })

  it('ON in a production runtime without the owner\'s allow-list: locked (no trace, no line)', async () => {
    vi.stubEnv('CANONICAL_CONTEXT', '1'); vi.stubEnv('VERCEL_ENV', 'production')
    await post(BANGKOK, { userLocation: HANOI })
    expect(traces()).toEqual([])
    expect(system()).not.toContain(LINE)
  })

  it('another flag does not switch it on', async () => {
    vi.stubEnv('MARKET_GATE', '1'); vi.stubEnv('ATTACHMENT_ONLY_POLICY', '1')
    await post(BANGKOK, { userLocation: HANOI })
    expect(traces()).toEqual([])
  })
})
