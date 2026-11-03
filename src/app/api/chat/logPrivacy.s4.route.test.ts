/**
 * S4 — the user's words never reach a production log line (review S4, design probe2/s4-design.md). ALWAYS ON, no flag (Owner, Wave 5).
 * Full POST /api/chat with the REAL tools (search_places, the pre-search, the evening frame, the flight pre-search) behind a stub network that answers only google.serper.dev;
 * a fake model, a fake Supabase, VERCEL_ENV=production. A private token typed by the user must appear in NO console line (log / warn / error / info), and each line S4 changed
 * (A-H) must really be emitted by its scenario (a line that is never reached proves nothing). Mock only: no key, no network, no cost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache, withSingleFlight } from '@/lib/ai/tools/common'
import { __resetRequestCap } from '@/lib/ai/tools/serperRequestCap'

const h = vi.hoisted(() => {
  const state = { answer: 'ok', logs: [] as string[], luna: null as null | Record<string, unknown> }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-log-privacy' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} }) : Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response(`0:${JSON.stringify(h.state.answer)}\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`, { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: () => Promise.resolve({ text: 'ok', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))
import { POST } from '@/app/api/chat/route'
import { applyHardConstraintGate } from '@/lib/ai/consultative/hardConstraintGate'
import type { ShoppingConstraints } from '@/lib/ai/consultative/shoppingConstraints'
import { logText } from '@/lib/ai/logSafeText'

const TOKEN = 'zqvexcanary7781'
const PLACE_ROW = { title: 'Phở Thử Nghiệm Một', address: '12 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.77, longitude: 106.70, rating: 4.5, ratingCount: 321, type: 'Quán phở', types: ['Quán phở'], cid: '111' }
const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'; delete process.env.TAPPY_AGENT
  h.state.logs = []; h.state.answer = 'ok'; h.state.luna = null
  __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  for (const m of ['log', 'warn', 'error', 'info'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { h.state.logs.push(a.map(x => (typeof x === 'string' ? x : x instanceof Error ? x.message : JSON.stringify(x))).join(' ')) })
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      const endpoint = new URL(u).pathname
      return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], places: endpoint === '/maps' ? [PLACE_ROW] : [], images: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (u.includes('duckduckgo.com')) return new Response('<html></html>', { status: 200 })
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey })

type Msg = { role: 'user' | 'assistant'; content: string }
const user = (content: string): Msg => ({ role: 'user', content })
async function turn(messages: Msg[], o: { legacy?: boolean; v1Only?: boolean; env?: Record<string, string>; production?: boolean; keepCache?: boolean } = {}) {
  if (!o.keepCache) __clearToolCache()
  __resetRequestCap(); __resetAiQuestionQuotaLocal()
  h.state.logs = []
  vi.stubEnv('CONSULTATIVE_V1', o.legacy ? '0' : '1'); vi.stubEnv('CONSULT_V2', o.legacy || o.v1Only ? '0' : '1')
  vi.stubEnv('VERCEL_ENV', o.production === false ? 'preview' : 'production')
  for (const [k, v] of Object.entries(o.env ?? {})) vi.stubEnv(k, v)
  const req = { url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'), headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }), json: () => Promise.resolve({ messages, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1' } }), signal: undefined }
  const body = await (await POST(req as never)).text()
  const lines = [...h.state.logs]
  const json = lines.map(l => { try { return JSON.parse(l) as Record<string, any> } catch { return null } }).filter((x): x is Record<string, any> => !!x)
  // which line TYPES carry the token (the line itself is never printed by a failing assertion)
  const leaking = [...new Set(lines.filter(l => l.toLowerCase().includes(TOKEN)).map(l => { try { const j = JSON.parse(l); return `${j.type ?? '?'}${j.step ? ':' + j.step : ''}${j.tool ? ':' + j.tool : ''}` } catch { return 'non-json:' + l.slice(0, 24).replace(new RegExp(TOKEN, 'gi'), 'TOKEN') } }))]
  return { body, lines, json, leaking }
}
// A venue the user names: the code pre-searches with their words as the place query (measured on the code before S4: the token reached tappyai_presearch,
// tappyai_tool_called search_places + fn_entry, tappyai_place_evidence and, on a second turn, tappyai_places_budget cache_hit).
const PLACE: Msg[] = [user(`quán Zqvexcanary7781 Munt ở quận 1 có ngon không`)]
const EVENING: Msg[] = [user(`tối nay đi chơi ở quận 1, ăn tối rồi đi cafe, lập kế hoạch giúp mình cho 2 người, mã ${TOKEN}`)]

describe('S4 · logText: the shape a log line keeps of a free text', () => {
  it('only a length and a source label - never a character of the text', () => {
    const t = logText(`quán ${TOKEN} quận 1`, 'code')
    expect(t).toEqual({ len: `quán ${TOKEN} quận 1`.length, kind: 'code' })
    expect(JSON.stringify(t)).not.toContain(TOKEN)
    expect(JSON.stringify(t)).not.toContain('quán')
    for (const v of [undefined, null, '', '   ', 42, {}]) expect(logText(v, 'tool_arg')).toEqual({ len: 0, kind: 'none' })
    expect(logText('  ab  ', 'stored')).toEqual({ len: 2, kind: 'stored' })
  })
})

describe('S4 · production: the user\'s words reach no log line', () => {
  it('a place turn (pre-search, search_places, the place search itself, the evidence save, the frame): no line carries the token; lines A, C, D, E, F are emitted, in their new shape', async () => {
    const r = await turn(PLACE)
    const pre = r.json.find(j => j.type === 'tappyai_presearch' && !j.tool)
    const called = r.json.find(j => j.type === 'tappyai_tool_called' && j.tool === 'search_places' && !j.step)
    const entry = r.json.find(j => j.type === 'tappyai_tool_called' && j.tool === 'searchPlaces' && j.step === 'fn_entry')
    const saved = r.json.find(j => j.type === 'tappyai_place_evidence' && j.step === 'saved')
    const frame = r.json.find(j => j.type === 'tappyai_consultative_v1' && j.step === 'frame')
    expect({ pre: !!pre, called: !!called, entry: !!entry, saved: !!saved, frame: !!frame }).toEqual({ pre: true, called: true, entry: true, saved: true, frame: true })
    expect(r.leaking).toEqual([])
    // A
    expect(pre!.query).toEqual({ len: expect.any(Number), kind: expect.stringMatching(/^(code|stored)$/) }); expect(pre!.query.len).toBeGreaterThan(0)
    expect(pre).not.toHaveProperty('location'); expect(typeof pre!.hasLocation).toBe('boolean')
    // C, D
    for (const x of [called!, entry!]) { expect(x.query).toEqual({ len: expect.any(Number), kind: 'tool_arg' }); expect(x).not.toHaveProperty('location'); expect(typeof x.hasLocation).toBe('boolean') }
    expect(entry).toHaveProperty('centeredOnUser') // the operational fields of fn_entry are kept
    // E
    expect(saved!.query).toEqual({ len: expect.any(Number), kind: 'tool_arg' })
    // F
    expect(frame!.place).toEqual({ len: expect.any(Number), kind: expect.any(String) }); expect(frame).toHaveProperty('stated_area')
  }, 60000)
  it('the same place search again (served from the cache): the cache-hit line keeps the length of the key, not the key (it holds the query)', async () => {
    await turn(PLACE)
    const again = await turn(PLACE, { keepCache: true })
    const hit = again.json.find(j => j.type === 'tappyai_places_budget' && j.step === 'cache_hit')
    expect(hit).toBeTruthy() // live control: the second turn really was served from the cache
    expect(again.leaking).toEqual([])
    expect(hit!.cacheKey).toEqual({ len: expect.any(Number), kind: 'tool_arg' }); expect(hit!.cacheKey.len).toBeGreaterThan(0)
  }, 60000)
  it('an evening plan (legacy path): no line carries the token; line G keeps a count of searches and whether a location was set, not the words', async () => {
    const r = await turn(EVENING, { legacy: true })
    const ev = r.json.find(j => j.type === 'tappyai_evening_frame')
    expect(ev).toBeTruthy()
    expect(r.leaking).toEqual([])
    expect(typeof ev!.searches).toBe('number'); expect(ev!.searches).toBeGreaterThan(0)
    expect(ev).not.toHaveProperty('location'); expect(typeof ev!.hasLocation).toBe('boolean')
    expect(Array.isArray(ev!.stops)).toBe(true)
  }, 60000)
  it('a flight pre-search: line B states whether an origin, a destination and a date were given - not which', async () => {
    // the planner's own example shape (presearch.test.ts): two airports and a dd/mm date; measured: the fare pre-search runs with Consultative V1 on and CONSULT_V2 off
    // (with CONSULT_V2 on the travel consultation takes the turn and its own pre-call)
    const r = await turn([user('Vé máy bay Sài Gòn Hà Nội 12/11 rẻ nhất')], { v1Only: true })
    const fl = r.json.find(j => j.type === 'tappyai_presearch' && j.tool === 'get_flight_prices')
    expect(fl).toBeTruthy()
    expect(r.leaking).toEqual([])
    for (const k of ['origin', 'destination', 'departDate']) expect(fl).not.toHaveProperty(k)
    expect(fl).toMatchObject({ hasOrigin: true, hasDestination: true, departDateKind: expect.stringMatching(/^(given|none)$/) })
  }, 60000)
  it('J: CONSULT_DECISION_LOG=1 writes nothing in production; outside production its line keeps the KEY NAMES of what is known and whether an area was given, never the values', async () => {
    const prod = await turn(PLACE, { env: { CONSULT_DECISION_LOG: '1' } })
    expect(prod.json.filter(j => j.type === 'tappyai_consult_decision')).toEqual([])
    const preview = await turn(PLACE, { env: { CONSULT_DECISION_LOG: '1' }, production: false })
    const d = preview.json.find(j => j.type === 'tappyai_consult_decision')
    expect(d).toBeTruthy() // live control: the line exists outside production
    expect(Array.isArray(d!.known)).toBe(true)
    for (const k of d!.known as unknown[]) expect(typeof k).toBe('string')
    expect(d).not.toHaveProperty('area'); expect(typeof d!.hasArea).toBe('boolean')
    expect(preview.lines.filter(l => l.includes('"type":"tappyai_consult_decision"') && l.toLowerCase().includes(TOKEN))).toEqual([])
  }, 60000)
})

describe('S4 · a call that joins one already running (single flight)', () => {
  it('the join line keeps the length of the key, never the key', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>(r => { release = r })
    const key = `places:quán ${TOKEN}|quận 1`
    const first = withSingleFlight(key, async () => { await gate; return 1 })
    const second = withSingleFlight(key, async () => 2)
    release()
    expect(await Promise.all([first, second])).toEqual([1, 1]) // the second really joined the first
    const join = h.state.logs.map(l => { try { return JSON.parse(l) } catch { return null } }).find(j => j?.step === 'single_flight_join')
    expect(join).toBeTruthy()
    expect(join.key).toEqual({ len: key.length, kind: 'tool_arg' })
    expect(h.state.logs.join('\n').toLowerCase()).not.toContain(TOKEN)
  })
})

describe('S4 · H: an unknown product type the user typed', () => {
  it('the warn line keeps the length of the text, never the text', () => {
    const warns: string[] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(String(a[0])) })
    try {
      applyHardConstraintGate('search_products', { search_results: [] }, null, 'vi', { shopping: { unknownType: `máy ${TOKEN}`, productType: null } as unknown as ShoppingConstraints })
    } finally { spy.mockRestore() }
    const line = warns.map(l => { try { return JSON.parse(l) } catch { return null } }).find(j => j?.type === 'tappyai_shopping_constraints')
    expect(line).toBeTruthy()
    expect(line).not.toHaveProperty('text')
    expect(line.textLen).toBe(`máy ${TOKEN}`.length)
    expect(warns.join('\n')).not.toContain(TOKEN)
  })
})
