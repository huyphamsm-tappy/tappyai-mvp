/**
 * Round 42 — LOC-CHIP-01 (allowlist cons-allowlist-ex1-u2.md): the "Đang tìm chỗ quanh bạn…" chip is sent only for a place search around a VALID current
 * location the request carried. Full route (POST /api/chat, TAPPY_AGENT=2), scripted model, Serper mocked, no network. CONSULTATIVE_IN_AGENT = 0 and 1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { hasValidCurrentLocation } from '@/lib/location/currentLocation'

const h = vi.hoisted(() => {
  const state = { steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>, maps: [] as Array<{ q: string; ll: unknown }> }
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
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async () => [], webSearch: async () => ({ results: [] }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()),
  serperPlaces: async (q: string, ll?: unknown) => {
    h.state.maps.push({ q, ll: ll ?? null })
    return [{ title: 'Phở Hòa Pasteur', address: '260C Pasteur, Phường 8, Quận 3, TP.HCM', rating: 4.4, ratingCount: 900, placeId: 'p1', latitude: 10.7869, longitude: 106.6889 }]
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: (opts: Record<string, any>) => {
      const s = h.state.steps.shift() ?? { text: 'Mình gợi ý Phở Hòa Pasteur.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const HCM_Q7 = { lat: 10.7296, lng: 106.7219, address: 'Quận 7, TP.HCM' }
const place = (loc: string) => [
  { text: '', toolCalls: [{ toolCallId: 'c1', toolName: 'search_places', args: { query: 'quán phở', location: loc, type: 'restaurant' } }] },
  { text: 'Mình gợi ý **Phở Hòa Pasteur** ở Quận 3.', toolCalls: [] },
]
const bus = [
  { text: '', toolCalls: [{ toolCallId: 'c1', toolName: 'get_transport_options', args: { origin: 'TP.HCM', destination: 'Quy Nhơn', mode: 'intercity', date: '2026-10-24' } }] },
  { text: 'Vé xe khách TP.HCM–Quy Nhơn mình chưa tìm được giá đúng ngày.', toolCalls: [] },
]
async function turn(userText: string, steps: Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>, userLocation: unknown, flag: '0' | '1') {
  if (flag === '1') process.env.CONSULTATIVE_IN_AGENT = '1'; else delete process.env.CONSULTATIVE_IN_AGENT
  h.state.steps = JSON.parse(JSON.stringify(steps))
  h.state.maps = []
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: userText }], ...(userLocation ? { userLocation } : {}) }), signal: undefined,
  }
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  let body = ''
  try { body = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  return { body, chip: body.includes('"stage":"searching"'), maps: h.state.maps.length }
}

beforeEach(() => { process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2' })
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k] })

describe('hasValidCurrentLocation — one definition for the chip and the area question', () => {
  it('finite coordinates in range only', () => {
    expect(hasValidCurrentLocation(null)).toBe(false)
    expect(hasValidCurrentLocation({ lat: '1' as unknown as number, lng: 106 })).toBe(false)
    expect(hasValidCurrentLocation({ lat: Number.NaN, lng: 106 })).toBe(false)
    expect(hasValidCurrentLocation({ lat: 91, lng: 106 })).toBe(false)
    expect(hasValidCurrentLocation({ lat: 10.7, lng: 106.7 })).toBe(true)
  })
})

describe('LOC-CHIP-01 — the "searching around you" chip', () => {
  for (const flag of ['0', '1'] as const) {
    it(`env ${flag}: "quán phở gần tôi" with no location (no_current_location) — no chip`, async () => {
      const r = await turn('quán phở gần tôi', place(''), null, flag)
      expect(r.body).toContain('no_current_location')
      expect(r.chip).toBe(false)
    }, 60000)
    it(`env ${flag}: a named place ("tìm quán phở ở Quận 3") with no GPS — searched, no chip (a place name is not a current location)`, async () => {
      const r = await turn('tìm quán phở ở Quận 3', place('Quận 3, TP.HCM'), null, flag)
      expect(r.maps).toBeGreaterThan(0)
      expect(r.chip).toBe(false)
    }, 60000)
    it(`env ${flag}: a place search with a valid current location — the chip is sent`, async () => {
      const r = await turn('tìm quán phở ở Quận 3', place('Quận 3, TP.HCM'), HCM_Q7, flag)
      expect(r.chip).toBe(true)
    }, 60000)
    it(`env ${flag}: not a place search (coach fares) even with a location — no chip`, async () => {
      const r = await turn('Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?', bus, HCM_Q7, flag)
      expect(r.chip).toBe(false)
    }, 60000)
  }
})
