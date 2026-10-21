/**
 * Round 42 round 2 (stored location), STEP 1 — scenario (b): the user NAMES a place while the client also sends a location (a fix stored by an earlier session).
 * Full route (POST /api/chat, TAPPY_AGENT=2), scripted model (calls search_places with the place the user named, then answers), `serperPlaces` MOCKED to record the
 * centre (`ll`) and the query it is asked for — no network, no Serper credit. CONSULTATIVE_IN_AGENT = 0 and 1. No product code is changed by this step.
 * Each case prints one `CASE {…}` line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

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

const STALE_DN = { lat: 16.0544, lng: 108.2022, address: 'Đà Nẵng' } // what the client sends today (a fix stored by an earlier session)
const HCM_Q7 = { lat: 10.7296, lng: 106.7219, address: 'Quận 7, TP.HCM' }

async function turn(userText: string, toolLocation: string, userLocation: unknown, flag: '0' | '1') {
  if (flag === '1') process.env.CONSULTATIVE_IN_AGENT = '1'; else delete process.env.CONSULTATIVE_IN_AGENT
  h.state.steps = [
    { text: '', toolCalls: [{ toolCallId: 'c1', toolName: 'search_places', args: { query: 'quán phở', location: toolLocation, type: 'restaurant' } }] },
    { text: 'Mình gợi ý **Phở Hòa Pasteur** ở Quận 3.', toolCalls: [] },
  ]
  h.state.maps = []
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: userText }], ...(userLocation ? { userLocation } : {}) }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let body = ''
  try { body = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const called = js.find(j => j.type === 'tappyai_tool_called' && j.tool === 'search_places' && !j.step) ?? null
  const entry = js.find(j => j.type === 'tappyai_tool_called' && j.tool === 'searchPlaces' && j.step === 'fn_entry') ?? null
  const gates = js.filter(j => ['tappyai_discovery_gate', 'tappyai_intent_gate', 'tappyai_agent_trace'].includes(j.type)).map(j => j.type === 'tappyai_agent_trace' ? { agent: j.status, tools: (j.tools || []).map((t: any) => t.name + ':' + t.outcome) } : j.type === 'tappyai_discovery_gate' ? { discovery: j.action, kind: j.kind, has_gps: j.has_gps } : { intent: j.turnIntent })
  return { maps: [...h.state.maps], called, entry, gates, body }
}
const near = (ll: any, p: { lat: number; lng: number }, km = 25) => !!ll && Math.hypot((ll.lat - p.lat) * 111, (ll.lng - p.lng) * 111) < km

// No network, ever (LOC-DEFAULT-HCM-01, Round 42): a provider the mocks do not cover (the OSM fallback food.ts calls internally,
// Nominatim, photo lookups) fails at once instead of going online.
beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k]; vi.unstubAllGlobals() })

describe('(b) a place the user names, while the client sends a stored fix', () => {
  for (const flag of ['0', '1'] as const) {
    it(`env ${flag}: "quán phở ở Quận 3, TP.HCM" with a stored Đà Nẵng fix — the search is NOT centred on Đà Nẵng (different city → the named place wins)`, async () => {
      const r = await turn('tìm quán phở ở Quận 3, TP.HCM', 'Quận 3, TP.HCM', STALE_DN, flag)
      console.log('CASE ' + JSON.stringify({ name: 'b_named_q3_stale_dn', flag, maps: r.maps, entry: r.entry && { destination: r.entry.destination, remoteDestination: r.entry.remoteDestination, centeredOnUser: r.entry.centeredOnUser } }))
      expect(r.maps.length).toBeGreaterThan(0)
      expect(r.maps.some(m => near(m.ll, STALE_DN))).toBe(false)
      expect(r.entry?.centeredOnUser).toBe(false)
    }, 60000)
    it(`env ${flag}: same city, different district — "quán phở ở Quận 3" with a fix in Quận 7: record whether the search centres on the fix or on Quận 3`, async () => {
      const r = await turn('tìm quán phở ở Quận 3', 'Quận 3, TP.HCM', HCM_Q7, flag)
      console.log('CASE ' + JSON.stringify({ name: 'b_named_q3_fix_q7', flag, maps: r.maps, entry: r.entry && { destination: r.entry.destination, remoteDestination: r.entry.remoteDestination, centeredOnUser: r.entry.centeredOnUser } }))
      expect(r.maps.length).toBeGreaterThan(0)
      // the named district wins: the centre is Quận 3 (≈10.784, 106.684), not the Quận 7 fix, and the query carries "Quận 3"
      expect(near(r.maps[0].ll, { lat: 10.7843, lng: 106.6844 }, 1.5)).toBe(true)
      expect(near(r.maps[0].ll, HCM_Q7, 3)).toBe(false)
      expect(r.maps[0].q).toContain('Quận 3')
    }, 60000)
    it(`env ${flag}: "quán phở gần tôi" with NO location sent (what the client would send after a failed fresh fix) — record what the server does (gates / search)`, async () => {
      const r = await turn('quán phở gần tôi', '', null, flag)
      console.log('CASE ' + JSON.stringify({ name: 'c_near_me_no_location', flag, maps: r.maps, gates: r.gates }))
      expect(r.maps.some(m => near(m.ll, STALE_DN))).toBe(false)
    }, 60000)
    it(`env ${flag}: no named place, "quán phở gần tôi" with the stored Đà Nẵng fix — the server centres on the fix it is given (it cannot know the fix is stale; the client is where staleness must be handled)`, async () => {
      const r = await turn('quán phở gần tôi', '', STALE_DN, flag)
      console.log('CASE ' + JSON.stringify({ name: 'b_near_me_stale_dn', flag, maps: r.maps, entry: r.entry && { destination: r.entry.destination, remoteDestination: r.entry.remoteDestination, centeredOnUser: r.entry.centeredOnUser } }))
      expect(r.maps.some(m => near(m.ll, STALE_DN))).toBe(true)
    }, 60000)
    // ── Bước 3 additions (allowlist cuối: 6, 6c) ──
    // Pre-fix (5b7657a): "quán phở gần tôi" with no location searched around the DEFAULT TP.HCM centre (defaultCentre).
    it(`env ${flag} (6, D1): "quán phở gần tôi" with no location and no named place does NOT search; the tool says the current location is missing`, async () => {
      const r = await turn('quán phở gần tôi', '', null, flag)
      expect(r.maps.length).toBe(0)
      expect(r.body).toContain('no_current_location')
    }, 60000)
    it(`env ${flag} (6c, LOC-DEFAULT-HCM-01 phương án a): no location, no near-me phrase, no named place ("quán cafe view đẹp") asks for the area — no default TP.HCM centre`, async () => {
      const r = await turn('quán cafe view đẹp', '', null, flag)
      console.log('CASE ' + JSON.stringify({ name: 'c6c_no_phrase_no_location', flag, maps: r.maps }))
      expect(r.maps.length).toBe(0)
      expect(r.body).toContain('no_current_location')
    }, 60000)
    it(`CONTROL env ${flag} (6/4): "quán phở gần tôi ở Quận 3" with no location — a named district is a named place: searched, not refused`, async () => {
      const r = await turn('quán phở gần tôi ở Quận 3', 'Quận 3, TP.HCM', null, flag)
      expect(r.maps.length).toBe(1)
      expect(r.body).not.toContain('no_current_location')
    }, 60000)
  }
})
