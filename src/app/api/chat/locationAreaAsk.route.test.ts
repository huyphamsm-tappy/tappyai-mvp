/**
 * Round 42 — LOC-DEFAULT-HCM-01 phương án (a): no valid GPS and no area the user named → no place search (never the default TP.HCM centre),
 * the tool answers `no_current_location`, and the CODE ends the final message with the fixed area question (areaAsk.ts). A valid GPS fix →
 * searched around it; a city / district the user names (this turn, or as the answer to the question) → searched there.
 * Full route (POST /api/chat), scripted model, Serper `/maps` mocked (records the centre), no network. Two paths, as in production:
 *   LEGACY — TAPPY_AGENT unset: `AI.stream` is scripted to run `search_places` itself while the reply streams;
 *   AGENT  — TAPPY_AGENT=2 with CONSULTATIVE_IN_AGENT 0 and 1: `AI.step` scripts the tool call.
 * Every assertion reads the FINAL message text the client receives (the `0:` frames), not the tool note.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { AREA_ASK_VI } from '@/lib/ai/consultative/areaAsk'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Call[] }>,
    maps: [] as Array<{ q: string; ll: unknown }>,
    legacy: null as null | { call: Call; text: string },
    legacyToolResult: undefined as unknown,
    /** One account per path: a server runs ONE path, so per-account in-process state never crosses from legacy turns into agent turns. */
    userId: 'u-area-ask',
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: h.state.userId }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async () => [], webSearch: async () => ({ results: [] }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()),
  // The row sits at the centre the search asked for, so no geography guard drops it and no fallback provider is reached.
  serperPlaces: async (q: string, ll?: { lat: number; lng: number } | null) => {
    h.state.maps.push({ q, ll: ll ?? null })
    return ll ? [{ title: 'Cà phê Mây', address: 'Cà phê Mây', rating: 4.5, ratingCount: 300, placeId: 'p1', latitude: ll.lat + 0.001, longitude: ll.lng + 0.001 }] : []
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    // LEGACY: the scripted turn runs the tool while the reply streams, exactly as the SDK would (9: call, a: result, 0: text, d: finish).
    stream: (opts: Record<string, any>) => ({
      toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
        async start(c) {
          const enc = new TextEncoder()
          const s = h.state.legacy
          if (s && opts.tools?.[s.call.toolName]) {
            c.enqueue(enc.encode(`9:${JSON.stringify(s.call)}\n`))
            const result = await opts.tools[s.call.toolName].execute(s.call.args, { toolCallId: s.call.toolCallId, messages: [] })
            h.state.legacyToolResult = result
            c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: s.call.toolCallId, result })}\n`))
          }
          if (s?.text) c.enqueue(enc.encode(`0:${JSON.stringify(s.text)}\n`))
          c.enqueue(enc.encode('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'))
          c.close()
        },
      }), { status: 200, headers: { 'content-type': 'text/plain' } }),
    }),
    // AGENT: one scripted step per call.
    step: (opts: Record<string, any>) => {
      const s = h.state.steps.shift() ?? { text: '', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
const HCM_CENTRE = { lat: 10.7769, lng: 106.7009 }
const DN = { lat: 16.0544, lng: 108.2022 }
const Q3 = { lat: 10.7843, lng: 106.6844 }
const near = (ll: any, p: { lat: number; lng: number }, km = 3) => !!ll && Math.hypot((ll.lat - p.lat) * 111, (ll.lng - p.lng) * 111) < km

type Mode = 'legacy' | 'agent0' | 'agent1'
type Msg = { role: 'user' | 'assistant'; content: string }
/** One turn; `location: undefined` = the model names no location at all, '' = an empty string (both seen in practice). */
async function turn(mode: Mode, messages: Msg[], tool: { query: string; location?: string } | null, userLocation: unknown, reply = 'Mình gợi ý **Cà phê Mây**.') {
  if (mode === 'legacy') delete process.env.TAPPY_AGENT; else process.env.TAPPY_AGENT = '2'
  if (mode === 'agent1') process.env.CONSULTATIVE_IN_AGENT = '1'; else delete process.env.CONSULTATIVE_IN_AGENT
  const call: Call | null = tool ? { toolCallId: 'c1', toolName: 'search_places', args: { query: tool.query, type: 'cafe', ...(tool.location !== undefined ? { location: tool.location } : {}) } } : null
  h.state.steps = call ? [{ text: '', toolCalls: [call] }, { text: reply, toolCalls: [] }] : [{ text: reply, toolCalls: [] }]
  h.state.legacy = { call: call ?? { toolCallId: 'none', toolName: 'none', args: {} }, text: reply }
  h.state.legacyToolResult = undefined
  h.state.userId = `u-area-ask-${mode}`
  h.state.maps = []
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, ...(userLocation ? { userLocation } : {}) }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  return {
    raw, text, maps: [...h.state.maps],
    refused: js.some(j => j.type === 'tappyai_tool_called' && j.step === 'no_current_location'),
    merged: js.some(j => j.type === 'tappyai_area_ask' && j.step === 'answer_merged_for_routing'),
    defaultCentre: lines.some(l => l.includes('"step":"default_centre"')),
    asks: text.split(AREA_ASK_VI).length - 1,
  }
}
const one = (u: string): Msg[] => [{ role: 'user', content: u }]

// No network, ever: a provider the mocks above do not cover (OSM, Nominatim, photo lookups) fails at once instead of going online.
beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k]; vi.unstubAllGlobals() })

// LEGACY (Consult V2 on, as in production): a first café request with no style is answered by the router's own ask card ("Kiểu quán nào?",
// consultRouter.ts — code, no model, no search). The place search — and so the area question — comes on the turn that answers it.
const ASK_STYLE = 'Để chọn đúng quán cà phê cho bạn:'
// The card exactly as turn 1 returns it (asserted below) — the later turns send it back as the assistant message, as the client does.
const ASK_CARD = `${ASK_STYLE}\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"dish","q":"Kiểu quán nào?","options":["Yên tĩnh","View đẹp","Sân vườn","Ngồi làm việc"]}]}[/TAPPY_ASK]\n\nChọn nhanh bên dưới, hoặc gõ thẳng ý bạn — trả lời một phần cũng được.`
describe('LOC-DEFAULT-HCM-01 — LEGACY path, the conversation as production runs it', () => {
  it('turn 1 "tìm quán cà phê ngon": the router asks the style first — no search, no TP.HCM centre', async () => {
    const r = await turn('legacy', one('tìm quán cà phê ngon'), { query: 'quán cà phê ngon' }, null, '')
    console.log('CASE ' + JSON.stringify({ name: 'L1_first_turn', maps: r.maps, refused: r.refused, text: r.text.slice(0, 200) }))
    expect(r.maps.length).toBe(0)
    expect(r.defaultCentre).toBe(false)
    expect(r.text.trim()).toBe(ASK_CARD)
  }, 60000)
  it('turn 2 "View đẹp" (no GPS, still no area): no search, the final message ends with the fixed area question', async () => {
    const thread: Msg[] = [{ role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: ASK_CARD }, { role: 'user', content: 'View đẹp' }]
    const r = await turn('legacy', thread, { query: 'quán cà phê view đẹp' }, null, '')
    console.log('CASE ' + JSON.stringify({ name: 'L2_style_answer_no_area', maps: r.maps, refused: r.refused, text: r.text }))
    expect(r.maps.length).toBe(0)
    expect(r.defaultCentre).toBe(false)
    expect(r.refused).toBe(true)
    expect(r.asks).toBe(1)
    expect(r.text.trim().endsWith(AREA_ASK_VI)).toBe(true)
  }, 60000)
  for (const loc of [undefined, ''] as const) {
    it(`turn 3 "ở Đà Nẵng" answering the area question, model location ${JSON.stringify(loc ?? null)}: searched in Đà Nẵng, never TP.HCM, not asked again`, async () => {
      const thread: Msg[] = [
        { role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: ASK_CARD },
        { role: 'user', content: 'View đẹp' }, { role: 'assistant', content: AREA_ASK_VI },
        { role: 'user', content: 'ở Đà Nẵng' },
      ]
      const r = await turn('legacy', thread, { query: 'quán cà phê view đẹp', ...(loc !== undefined ? { location: loc } : {}) }, null)
      console.log('CASE ' + JSON.stringify({ name: 'L3_answer_da_nang', loc: loc ?? null, maps: r.maps, refused: r.refused, text: r.text.slice(0, 200) }))
      expect(r.maps.length).toBeGreaterThan(0)
      expect(r.maps.every(m => near(m.ll, DN, 15))).toBe(true)
      expect(r.defaultCentre).toBe(false)
      expect(r.refused).toBe(false)
      expect(r.asks).toBe(0)
    }, 60000)
  }
  // S5 — the reply to the area question. Positive: a reply that is ONLY an area is routed as part of the café request it answers.
  const afterAsk = (reply: string): Msg[] => [
    { role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: ASK_CARD },
    { role: 'user', content: 'View đẹp' }, { role: 'assistant', content: AREA_ASK_VI },
    { role: 'user', content: reply },
  ]
  for (const [reply, centre, km] of [['Đà Nẵng', DN, 15], ['Quận 3', Q3, 1.5]] as const) {
    it(`S5 positive: the bare area "${reply}" after the area question → merged for routing, searched there, not asked again, never TP.HCM`, async () => {
      const r = await turn('legacy', afterAsk(reply), { query: 'quán cà phê view đẹp' }, null)
      console.log('CASE ' + JSON.stringify({ name: 'L3_positive', reply, merged: r.merged, maps: r.maps, text: r.text.slice(0, 160) }))
      expect(r.merged).toBe(true)
      expect(r.maps.length).toBeGreaterThan(0)
      expect(r.maps.every(m => near(m.ll, centre, km))).toBe(true)
      expect(r.defaultCentre).toBe(false)
      expect(r.asks).toBe(0)
    }, 60000)
  }
  // S5 — NEGATIVE (owner 14/10): a reply with its own intent is NOT folded into the café request, even when it names a city.
  for (const reply of ['Thôi, tôi muốn đi du lịch Đà Nẵng.', 'đặt vé máy bay đi Đà Nẵng']) {
    it(`S5 negative: "${reply}" after the area question → NOT merged, routed as a new request (no café search in Đà Nẵng)`, async () => {
      const r = await turn('legacy', afterAsk(reply), { query: 'quán cà phê view đẹp' }, null)
      console.log('CASE ' + JSON.stringify({ name: 'L3_negative_intent', reply, merged: r.merged, maps: r.maps, text: r.text.slice(0, 200) }))
      expect(r.merged).toBe(false)
      expect(r.maps.length).toBe(0)
      expect(r.defaultCentre).toBe(false)
    }, 60000)
  }
  it('S5 negative: a reply that names no area ("quán nào cũng được") → NOT merged', async () => {
    const r = await turn('legacy', afterAsk('quán nào cũng được'), { query: 'quán cà phê view đẹp' }, null, '')
    console.log('CASE ' + JSON.stringify({ name: 'L3_negative_no_area', merged: r.merged, maps: r.maps, text: r.text.slice(0, 200) }))
    expect(r.merged).toBe(false)
    expect(r.defaultCentre).toBe(false)
  }, 60000)
  it('S5 negative: the area question is NOT the previous turn (two turns since) → "ở Đà Nẵng" is NOT merged', async () => {
    const thread: Msg[] = [
      { role: 'user', content: 'View đẹp' }, { role: 'assistant', content: AREA_ASK_VI },
      { role: 'user', content: 'cho mình hỏi thêm' }, { role: 'assistant', content: 'Bạn cứ hỏi nhé.' },
      { role: 'user', content: 'ở Đà Nẵng' },
    ]
    const r = await turn('legacy', thread, { query: 'quán cà phê view đẹp' }, null)
    console.log('CASE ' + JSON.stringify({ name: 'L3_negative_not_previous', merged: r.merged, maps: r.maps, text: r.text.slice(0, 200) }))
    expect(r.merged).toBe(false)
  }, 60000)
  it('"quán phở ở Quận 3": searched in Quận 3, no area question', async () => {
    const r = await turn('legacy', one('quán phở ở Quận 3'), { query: 'quán phở', location: 'Quận 3, TP.HCM' }, null)
    console.log('CASE ' + JSON.stringify({ name: 'L4_named_district', maps: r.maps, text: r.text.slice(0, 200) }))
    expect(r.maps.length).toBeGreaterThan(0)
    expect(r.maps.every(m => near(m.ll, Q3, 1.5))).toBe(true)
    expect(r.refused).toBe(false)
    expect(r.asks).toBe(0)
  }, 60000)
  it('a valid GPS fix in Hà Nội + "quán cà phê gần tôi": never the TP.HCM centre, no area question', async () => {
    const r = await turn('legacy', one('quán cà phê gần tôi'), { query: 'quán cà phê', location: '' }, GPS_HN)
    console.log('CASE ' + JSON.stringify({ name: 'L5_gps_hanoi', maps: r.maps, text: r.text.slice(0, 200) }))
    expect(r.maps.length).toBeGreaterThan(0)
    expect(r.maps.every(m => near(m.ll, GPS_HN, 3))).toBe(true)
    expect(r.defaultCentre).toBe(false)
    expect(r.asks).toBe(0)
  }, 60000)
})

describe('LOC-DEFAULT-HCM-01 — AGENT path (TAPPY_AGENT=2): ask for the area, never the default TP.HCM centre', () => {
  for (const mode of ['agent0', 'agent1'] as const) {
    it(`${mode}: no GPS, no area ("tìm quán cà phê ngon") — no search, the final message ends with the fixed area question`, async () => {
      const r = await turn(mode, one('tìm quán cà phê ngon'), { query: 'quán cà phê ngon' }, null, '')
      console.log('CASE ' + JSON.stringify({ name: 's1_no_gps_no_area', mode, maps: r.maps, refused: r.refused, text: r.text }))
      expect(r.maps.length).toBe(0)
      expect(r.defaultCentre).toBe(false)
      expect(r.refused).toBe(true)
      expect(r.asks).toBe(1)
      expect(r.text.trim().endsWith(AREA_ASK_VI)).toBe(true)
    }, 60000)
    it(`${mode}: "quán cà phê gần tôi" with no GPS (location '') — no search, the area is asked once`, async () => {
      const r = await turn(mode, one('quán cà phê gần tôi'), { query: 'quán cà phê', location: '' }, null, 'Mình chưa có vị trí hiện tại của bạn.')
      console.log('CASE ' + JSON.stringify({ name: 's2_near_me_no_gps', mode, maps: r.maps, text: r.text }))
      expect(r.maps.length).toBe(0)
      expect(r.defaultCentre).toBe(false)
      expect(r.asks).toBe(1)
    }, 60000)
    it(`${mode}: "quán phở ở Quận 3" — searched in Quận 3, no area question`, async () => {
      const r = await turn(mode, one('quán phở ở Quận 3'), { query: 'quán phở', location: 'Quận 3, TP.HCM' }, null)
      console.log('CASE ' + JSON.stringify({ name: 's3_named_district', mode, maps: r.maps, text: r.text.slice(0, 300), raw: r.raw.slice(0, 600) }))
      expect(r.maps.length).toBe(1)
      expect(near(r.maps[0].ll, Q3, 1.5)).toBe(true)
      expect(r.refused).toBe(false)
      expect(r.asks).toBe(0)
    }, 60000)
    it(`${mode}: a valid GPS fix in Hà Nội + "quán cà phê gần tôi" — searched around the fix, not TP.HCM, no area question`, async () => {
      const r = await turn(mode, one('quán cà phê gần tôi'), { query: 'quán cà phê', location: '' }, GPS_HN)
      console.log('CASE ' + JSON.stringify({ name: 's4_gps_hanoi', mode, maps: r.maps }))
      expect(r.maps.length).toBe(1)
      expect(near(r.maps[0].ll, GPS_HN, 3)).toBe(true)
      expect(near(r.maps[0].ll, HCM_CENTRE, 50)).toBe(false)
      expect(r.asks).toBe(0)
    }, 60000)
    for (const loc of [undefined, ''] as const) {
      it(`${mode}: the answer "ở Đà Nẵng" after the area question, model location ${JSON.stringify(loc ?? null)} — searched in Đà Nẵng, never TP.HCM, not asked again`, async () => {
        const thread: Msg[] = [{ role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: AREA_ASK_VI }, { role: 'user', content: 'ở Đà Nẵng' }]
        const r = await turn(mode, thread, { query: 'quán cà phê ngon', ...(loc !== undefined ? { location: loc } : {}) }, null)
        console.log('CASE ' + JSON.stringify({ name: 's5_answer_da_nang', mode, loc: loc ?? null, maps: r.maps }))
        expect(r.maps.length).toBe(1)
        expect(near(r.maps[0].ll, DN, 15)).toBe(true)
        expect(r.defaultCentre).toBe(false)
        expect(r.refused).toBe(false)
        expect(r.asks).toBe(0)
      }, 60000)
    }
  }
})
