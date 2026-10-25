/**
 * Wave 2D · C — CONSULT_SEARCH_NOW_INTENT_GATE at ROUTE level. Full route (POST /api/chat), scripted intent call (Luna) and scripted model, `serperPlaces` MOCKED to record the query and
 * the centre, no network, no Serper credit. Claims:
 *   · flag ON: a turn the intent layer read as knowledge / conversation ("chat") and that states no place runs NO place lookup by code - neither from a capitalised name (path 1: searchNow.ts
 *     named venue) nor from a word that makes `forcedTool = search_places` (path 2: "gần đây" -> the search-now directive) - and a failed lookup is not turned into the area question;
 *   · flag ON: place requests are untouched (the district / GPS cases, the "no location -> ask the area" semantics, a landmark inside a real place request, web_search turns);
 *   · flag OFF (and anything but the exact "1"): the old behaviour, compared directly on the same inputs.
 * The knowledge questions below are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { AREA_ASK_VI } from '@/lib/ai/consultative/areaAsk'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{ q: string; ll: unknown }>,
    legacy: null as null | { call: Call; text: string },
    /** The scripted intent call (Luna): null = the call fails, as in the other route tests. */
    luna: null as null | Record<string, unknown>,
    streamOpts: '' as string,
    webCalls: [] as string[],
    userId: 'u-search-now-gate',
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
  serperSearch: async (q: string) => { h.state.webCalls.push(String(q)); return [] }, webSearch: async (q: string) => { h.state.webCalls.push(String(q)); return { results: [] } },
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()),
  serperPlaces: async (q: string, ll?: { lat: number; lng: number } | null) => {
    h.state.maps.push({ q, ll: ll ?? null })
    return ll ? [{ title: 'Cà phê Mây', address: 'Cà phê Mây', rating: 4.5, ratingCount: 300, placeId: 'p1', latitude: ll.lat + 0.001, longitude: ll.lng + 0.001 }] : []
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, any>) => {
      try { h.state.streamOpts = JSON.stringify({ system: opts.system, messages: opts.messages }) } catch { h.state.streamOpts = '' }      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            const s = h.state.legacy
            if (s && opts.tools?.[s.call.toolName]) {
              c.enqueue(enc.encode(`9:${JSON.stringify(s.call)}\n`))
              const result = await opts.tools[s.call.toolName].execute(s.call.args, { toolCallId: s.call.toolCallId, messages: [] })
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: s.call.toolCallId, result })}\n`))
            }
            if (s?.text) c.enqueue(enc.encode(`0:${JSON.stringify(s.text)}\n`))
            // the SDK calls onFinish when the stream ends: the trace summary (Wave 2F, M7) reads the finish reason from it
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: s?.text ?? '', steps: [] }) } catch { /* the mock must not fail a turn */ }
            c.enqueue(enc.encode('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'))
            c.close()
          },
        }), { status: 200, headers: { 'content-type': 'text/plain' } }),
      }
    },
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
const Q3 = { lat: 10.7843, lng: 106.6844 }
const near = (ll: any, p: { lat: number; lng: number }, km = 3) => !!ll && Math.hypot((ll.lat - p.lat) * 111, (ll.lng - p.lng) * 111) < km

type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})
const CHAT_FOOD = lunaIntent('chat', ['food']) // what the intent layer wrote for knowledge questions in the paid run: a chat turn that still names a domain

/** One turn. `flag`: the value of CONSULT_SEARCH_NOW_INTENT_GATE (undefined = unset). `tool`: the place search the scripted MODEL itself runs while the reply streams (null = none). */
async function turn(messages: Msg[], o: { flag?: string; luna?: Record<string, unknown> | null; tool?: { name?: string; query: string; location?: string } | null; gps?: unknown; reply?: string } = {}) {
  delete process.env.TAPPY_AGENT
  if (o.flag === undefined) delete process.env.CONSULT_SEARCH_NOW_INTENT_GATE; else process.env.CONSULT_SEARCH_NOW_INTENT_GATE = o.flag
  const reply = o.reply ?? 'Đây là câu trả lời bằng kiến thức chung.'
  const toolName = o.tool?.name ?? 'search_places'
  const call: Call | null = o.tool ? { toolCallId: 'c1', toolName, args: toolName === 'search_places' ? { query: o.tool.query, type: 'attraction', ...(o.tool.location !== undefined ? { location: o.tool.location } : {}) } : { query: o.tool.query } } : null
  h.state.legacy = { call: call ?? { toolCallId: 'none', toolName: 'none', args: {} }, text: reply }
  h.state.luna = o.luna ?? null
  h.state.streamOpts = ''; h.state.maps = []; h.state.webCalls = []
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, ...(o.gps ? { userLocation: o.gps } : {}) }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  return {
    raw, text, maps: [...h.state.maps], web: [...h.state.webCalls],
    /** the code ran a place search before the model */
    presearched: js.some(j => j.type === 'tappyai_presearch' && !j.tool),
    /** any search_places execution (by code or by the model) */
    placeToolRan: js.some(j => j.type === 'tappyai_tool_called' && j.tool === 'search_places' && (j.query !== undefined || j.step === 'no_current_location')),
    refused: js.some(j => j.type === 'tappyai_tool_called' && j.step === 'no_current_location'),
    searchNowLogged: js.some(j => j.type === 'tappyai_consultative_v1' && j.step === 'search_now'),
    /** the "BƯỚC 1 CỦA LƯỢT NÀY" search-now directive reached the model's prompt */
    directive: h.state.streamOpts.includes('BUOC 1 CUA LUOT NAY'),
    asks: text.split(AREA_ASK_VI).length - 1,
    consultTurn: (js.find(j => j.type === 'tappyai_consult') ?? {}).turn as string | undefined,
    gateEvents: js.filter(j => j.type === 'tappyai_trace' && j.ev === 'search_now_gate'),
    /** every `tappyai_trace` line of the turn, in order */
    traceEvents: js.filter(j => j.type === 'tappyai_trace') as Array<Record<string, any>>,
    /** every log line as one string (for "no user text anywhere in it" checks) */
    rawLog: lines.join('\n'),
    logTypes: js.map(j => `${j.type}${j.tool ? ':' + j.tool : ''}${j.step ? ':' + j.step : ''}`),
  }
}
const one = (u: string): Msg[] => [{ role: 'user', content: u }]

beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULT_SEARCH_NOW_INTENT_GATE']) delete process.env[k]; vi.unstubAllGlobals() })

// Written for this test (NOT from any benchmark file). Each knowledge turn is a "chat" turn with domain food, as the intent layer wrote it in the paid run.
// (searchNow.ts reads a run of capitalised words as a named venue only when it is NOT the first word of the message; need profile does the same.)
const NAMED_ONLY = ['Cho mình biết Marie Curie đã nhận giải Nobel nào và vì công trình gì?', 'Theo bạn Isaac Newton phát minh ra phép tính vi phân hay độc lập với Leibniz?', 'Tiểu sử ngắn gọn của Nikola Tesla và các sáng chế chính.']
// A word like "gần đây" (recently) + a food word, no capitalised name: with a location in hand the old code derived a place directive from it (forcedTool = search_places, near-me flag).
const NEARBY_WORD_ONLY = ['Món phở có nguồn gốc từ đâu và các nghiên cứu gần đây về lịch sử của nó nói gì?', 'Cà phê có thật sự tốt cho tim không, các nghiên cứu gần đây cho kết quả ra sao?', 'Trà sữa chứa bao nhiêu đường và tác hại theo các báo cáo gần đây là gì?']
const BOTH = ['Cho mình hỏi Albert Einstein có những đóng góp nào được nhắc lại gần đây cho món ăn hay đồ uống không?']

describe('C — flag ON: a chat turn that states no place never starts a place lookup by code', () => {
  for (const q of [...NAMED_ONLY, ...BOTH]) {
    it(`path 1 (capitalised name): "${q.slice(0, 48)}…" → no pre-search, no place tool, no area question`, async () => {
      const r = await turn(one(q), { flag: '1', luna: CHAT_FOOD, reply: 'Trả lời kiến thức.' })
      expect(r.consultTurn).toBe('chat')
      expect(r.presearched).toBe(false)
      expect(r.placeToolRan).toBe(false)
      expect(r.maps).toEqual([])
      expect(r.asks).toBe(0)
      expect(r.text).toContain('Trả lời kiến thức.')
    }, 60000)
  }
  for (const q of [...NEARBY_WORD_ONLY, ...BOTH]) {
    it(`path 2 ("gần đây" makes forcedTool = search_places): "${q.slice(0, 48)}…" → the search-now directive does not reach the model`, async () => {
      const r = await turn(one(q), { flag: '1', luna: CHAT_FOOD, gps: GPS_HN, reply: 'Trả lời kiến thức.' })
      expect(r.consultTurn).toBe('chat')
      expect(r.directive).toBe(false)
      expect(r.searchNowLogged).toBe(false)
      expect(r.presearched).toBe(false)
      expect(r.placeToolRan).toBe(false)
      expect(r.asks).toBe(0)
    }, 60000)
  }
  // (Wave 2E: the "neither path" loop was removed - its sentences started no lookup with the flag OFF either, so it could not tell a working gate from a broken one. The claim "a request that
  // starts no code lookup is not changed by the flag" is held by the web-search test below and by the four-cell matrix in threadAwareAsk.route.test.ts.)
  it('forcedTool = search_places as the ONLY place signal (a place WORD such as "bảo tàng" in a history question): the consultative place frame is not switched on by it', async () => {
    const q = 'Bảo tàng Louvre được xây dựng từ thế kỷ nào?'
    const on = await turn(one(q), { flag: '1', luna: lunaIntent('chat', []) })
    const off = await turn(one(q), { flag: undefined, luna: lunaIntent('chat', []) })
    expect(off.logTypes).toContain('tappyai_consultative_v1:frame') // not vacuous: without the flag the forced tool turns the place frame on
    expect(on.logTypes).not.toContain('tappyai_consultative_v1:frame')
    for (const r of [on, off]) { expect(r.presearched).toBe(false); expect(r.placeToolRan).toBe(false); expect(r.asks).toBe(0) }
  }, 60000)
  it('rules-only knowledge turn (the intent call failed, rules read it as chat): OFF runs the named-venue pre-search, ON starts nothing', async () => {
    // (a sentence whose name is NOT its first word: the named-venue reader skips the first word, so a sentence that begins with the name starts no lookup in either mode)
    const q = 'Cho mình hỏi Marie Curie là ai và vì sao bà nổi tiếng?'
    const off = await turn(one(q), { flag: undefined, luna: null })
    expect(off.presearched).toBe(true); expect(off.asks).toBe(1)
    const on = await turn(one(q), { flag: '1', luna: null })
    expect(on.presearched).toBe(false); expect(on.placeToolRan).toBe(false); expect(on.asks).toBe(0)
  }, 60000)
  it('Wave 2E (C1) - a place tool call the MODEL itself makes on such a turn, with no location: the user is asked for the area exactly as before (the gate never says "no place needed" to the model)', async () => {
    const q = 'Tiểu sử ngắn gọn của Nikola Tesla và các sáng chế chính.'
    const on = await turn(one(q), { flag: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Tesla là nhà phát minh.' })
    const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Tesla là nhà phát minh.' })
    for (const r of [on, off]) { expect(r.refused).toBe(true); expect(r.maps).toEqual([]); expect(r.asks).toBe(1); expect(r.text.trim().endsWith(AREA_ASK_VI)).toBe(true) }
    expect(on.text).toBe(off.text)
  }, 60000)
  it('Wave 2E (C1) - a real place request the intent layer misreads as chat, no GPS and no district, and the model looks the place up itself: still asked for the location', async () => {
    const q = 'tìm quán phở bò ngon cho 2 người dưới 100k'
    const on = await turn(one(q), { flag: '1', luna: CHAT_FOOD, tool: { query: 'quán phở bò' }, reply: '' })
    const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, tool: { query: 'quán phở bò' }, reply: '' })
    for (const r of [on, off]) { expect(r.refused).toBe(true); expect(r.asks).toBe(1); expect(r.text.trim().endsWith(AREA_ASK_VI)).toBe(true) }
    expect(on.text).toBe(off.text)
  }, 60000)
})

describe('Wave 2E (C2) - the chosen behaviour for a place request misread as chat with a GPS fix and no district (residual risk, measured)', () => {
  const Q = 'tìm quán phở bò ngon cho 2 người dưới 100k'
  it('OFF pre-searches around the fix; ON does not pre-search (nothing independent of the intent layer tells this from a knowledge question), but the model\'s own lookup still searches around the fix', async () => {
    const off = await turn(one(Q), { flag: undefined, luna: CHAT_FOOD, gps: GPS_HN, reply: '' })
    expect(off.presearched).toBe(true) // not vacuous: this is what the gate gives up
    const on = await turn(one(Q), { flag: '1', luna: CHAT_FOOD, gps: GPS_HN, tool: { query: 'quán phở bò' }, reply: 'Gợi ý quán.' })
    expect(on.presearched).toBe(false)
    expect(on.maps.length).toBeGreaterThan(0) // the model keeps its tool: the search runs, around the GPS fix
    expect(on.maps.every(m => near(m.ll, GPS_HN, 3))).toBe(true)
    expect(on.asks).toBe(0)
  }, 60000)
  it('the gate event reports what is needed to measure how often this happens: hasValidGps and the rules\' own reading (no text)', async () => {
    vi.stubEnv('CONSULT_TRACE_DIAGNOSTICS', '1')
    try {
      const on = await turn(one(Q), { flag: '1', luna: CHAT_FOOD, gps: GPS_HN })
      expect(on.gateEvents).toHaveLength(1)
      expect(on.gateEvents[0]).toMatchObject({ blocked: true, hasValidGps: true, rulesTurn: 'pick', rulesConfidence: 'rule', rulesDomains: ['food'] })
      expect(JSON.stringify(on.gateEvents[0])).not.toMatch(/phở|quán/)
      const noGps = await turn(one(Q), { flag: '1', luna: CHAT_FOOD })
      expect(noGps.gateEvents[0]).toMatchObject({ hasValidGps: false })
    } finally { vi.unstubAllEnvs() }
  }, 60000)
})

describe('Wave 2E (C3) - "near me" is not a stated place; a city the code read from the user\'s words is', () => {
  const K = 'Cho mình hỏi Albert Einstein có những đóng góp nào được nhắc lại gần đây cho món phở không?' // "gần đây" = recently; with a GPS fix the intent layer's area "gần đây" survives its own check
  it('the intent layer writes area "gần đây" (checked and kept when there is a GPS fix) on a knowledge turn: still blocked', async () => {
    const luna = lunaIntent('chat', ['food'], { area: 'gần đây' })
    const off = await turn(one(K), { flag: undefined, luna, gps: GPS_HN })
    expect(off.presearched).toBe(true) // not vacuous
    const on = await turn(one(K), { flag: '1', luna, gps: GPS_HN, reply: 'Trả lời kiến thức.' })
    expect(on.presearched).toBe(false); expect(on.placeToolRan).toBe(false); expect(on.asks).toBe(0)
  }, 60000)
  it('a city the user names (read by code, no district) counts as a stated place: the old behaviour, same as OFF', async () => {
    const q = 'Cho mình hỏi Albert Einstein có từng đến Đà Nẵng ăn món gì không?'
    const luna = lunaIntent('chat', ['food'])
    const off = await turn(one(q), { flag: undefined, luna, gps: GPS_HN })
    const on = await turn(one(q), { flag: '1', luna, gps: GPS_HN })
    expect(off.presearched).toBe(true)
    expect(on.presearched).toBe(off.presearched)
    expect(on.maps.map(m => m.q)).toEqual(off.maps.map(m => m.q))
  }, 60000)
})

describe('C — trace (CONSULT_TRACE_DIAGNOSTICS=1 only): the gate says what it decided, never the user text', () => {
  it('flag ON + trace ON: one search_now_gate line with the decision; flag OFF or trace OFF: none', async () => {
    vi.stubEnv('CONSULT_TRACE_DIAGNOSTICS', '1')
    try {
      const q = NAMED_ONLY[0]
      const on = await turn(one(q), { flag: '1', luna: CHAT_FOOD })
      expect(on.gateEvents).toHaveLength(1)
      expect(on.gateEvents[0]).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place', consultTurn: 'chat', statedPlaceFrom: null, droppedType: 'attraction' })
      expect(JSON.stringify(on.gateEvents[0])).not.toContain('Marie Curie')
      const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD })
      expect(off.gateEvents).toHaveLength(0)
      const place = await turn(one('quán phở ở Quận 3'), { flag: '1', tool: { query: 'quán phở', location: 'Quận 3, TP.HCM' } })
      expect(place.gateEvents[0]).toMatchObject({ blocked: false, reason: 'consult_turn' })
    } finally { vi.unstubAllEnvs() }
    const quiet = await turn(one(NAMED_ONLY[0]), { flag: '1', luna: CHAT_FOOD })
    expect(quiet.gateEvents).toHaveLength(0)
  }, 60000)
})

describe('C — flag OFF (unset, "0", and every value but the exact "1"): the old behaviour, compared directly', () => {
  for (const q of NAMED_ONLY) {
    it(`unset: "${q.slice(0, 48)}…" runs the named-venue pre-search and ends with the area question`, async () => {
      const r = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, reply: 'Trả lời kiến thức.' })
      expect(r.presearched).toBe(true)
      expect(r.refused).toBe(true)
      expect(r.asks).toBe(1)
    }, 60000)
  }
  for (const v of ['0', 'true', 'on', ' 1', '1 ', 'yes']) {
    it(`${JSON.stringify(v)} is OFF: same as unset`, async () => {
      const r = await turn(one(NAMED_ONLY[0]), { flag: v, luna: CHAT_FOOD, reply: 'Trả lời kiến thức.' })
      expect(r.presearched).toBe(true); expect(r.asks).toBe(1)
    }, 60000)
  }
  for (const q of NEARBY_WORD_ONLY) {
    it(`path 2 OFF: "${q.slice(0, 40)}…" (a location in hand) still gets the search-now directive (the old behaviour the gate removes)`, async () => {
      const r = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, gps: GPS_HN })
      expect(r.searchNowLogged).toBe(true)
      expect(r.directive || r.presearched).toBe(true)
    }, 60000)
  }
  it('a production runtime reads the flag as OFF even when it is "1"', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    try {
      const r = await turn(one(NAMED_ONLY[0]), { flag: '1', luna: CHAT_FOOD, reply: 'Trả lời kiến thức.' })
      expect(r.presearched).toBe(true); expect(r.asks).toBe(1)
    } finally { vi.unstubAllEnvs() }
  }, 60000)
})

describe('C — flag ON: place requests keep their flow and their semantics', () => {
  it('a district request ("quán phở ở Quận 3"): searched in Quận 3, no area question (same as OFF)', async () => {
    for (const flag of ['1', undefined]) {
      const r = await turn(one('quán phở ở Quận 3'), { flag, tool: { query: 'quán phở', location: 'Quận 3, TP.HCM' } })
      expect(r.maps.length).toBeGreaterThan(0)
      expect(r.maps.every(m => near(m.ll, Q3, 1.5))).toBe(true)
      expect(r.refused).toBe(false); expect(r.asks).toBe(0)
    }
  }, 60000)
  it('a GPS fix + "quán cà phê gần tôi": searched around the fix (same as OFF)', async () => {
    for (const flag of ['1', undefined]) {
      const r = await turn(one('quán cà phê gần tôi'), { flag, tool: { query: 'quán cà phê', location: '' }, gps: GPS_HN })
      expect(r.maps.length).toBeGreaterThan(0)
      expect(r.maps.every(m => near(m.ll, GPS_HN, 3))).toBe(true)
      expect(r.asks).toBe(0)
    }
  }, 60000)
  it('a real place request with NO location still asks the area, exactly as before (the lookup was needed)', async () => {
    const ASK_CARD = 'Để chọn đúng quán cà phê cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"dish","q":"Kiểu quán nào?","options":["Yên tĩnh","View đẹp","Sân vườn","Ngồi làm việc"]}]}[/TAPPY_ASK]\n\nChọn nhanh bên dưới, hoặc gõ thẳng ý bạn — trả lời một phần cũng được.'
    const thread: Msg[] = [{ role: 'user', content: 'tìm quán cà phê ngon' }, { role: 'assistant', content: ASK_CARD }, { role: 'user', content: 'View đẹp' }]
    const on = await turn(thread, { flag: '1', tool: { query: 'quán cà phê view đẹp' }, reply: '' })
    const off = await turn(thread, { flag: undefined, tool: { query: 'quán cà phê view đẹp' }, reply: '' })
    for (const r of [on, off]) { expect(r.maps).toEqual([]); expect(r.refused).toBe(true); expect(r.asks).toBe(1); expect(r.text.trim().endsWith(AREA_ASK_VI)).toBe(true) }
  }, 60000)
  it('a landmark inside a real place request ("quán cà phê yên tĩnh gần Nhà Thờ Đức Bà", pick turn): still pre-searched, same as OFF', async () => {
    const q = 'tìm quán cà phê yên tĩnh gần Nhà Thờ Đức Bà ở Quận 1'
    const luna = lunaIntent('pick', ['food'], { query: 'quán cà phê yên tĩnh', area: 'Quận 1', known: [{ key: 'khu_vuc', value: 'Quận 1' }] })
    const on = await turn(one(q), { flag: '1', luna })
    const off = await turn(one(q), { flag: undefined, luna })
    expect(off.presearched).toBe(true) // not vacuous: the place search runs without the flag...
    expect(on.presearched).toBe(true) // ...and with it
    expect(on.placeToolRan).toBe(off.placeToolRan)
    expect(on.maps.map(m => m.q)).toEqual(off.maps.map(m => m.q))
    expect(on.asks).toBe(off.asks)
  }, 60000)
  it('a web-style knowledge question with no named place and no "gần đây" ("tin mới": forcedTool web_search): the flag changes nothing - same log sequence, same text, same web requests', async () => {
    const q = 'Kết quả mới nhất của cuộc bầu cử giữa kỳ ở Mỹ là gì?'
    const run = (flag: string | undefined) => turn(one(q), { flag, luna: lunaIntent('chat', []), reply: 'Tóm tắt từ kết quả tìm kiếm.' })
    const on = await run('1'), off = await run(undefined)
    expect(on.web).toEqual(off.web)
    expect(on.logTypes).toEqual(off.logTypes)
    expect(on.presearched).toBe(false); expect(on.placeToolRan).toBe(false)
    expect(on.text).toBe(off.text)
  }, 60000)
  it('an ambiguous message the intent layer read as chat with nothing stated (a landmark name inside a sentence): OFF pre-searches it, ON starts no lookup by itself (unsure → no place lookup)', async () => {
    const q = 'Mình vừa đọc về Nhà Thờ Đức Bà, nhưng chưa biết gì thêm.'
    const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD })
    expect(off.presearched).toBe(true) // not vacuous: without the gate this runs
    const r = await turn(one(q), { flag: '1', luna: CHAT_FOOD })
    expect(r.presearched).toBe(false); expect(r.placeToolRan).toBe(false); expect(r.asks).toBe(0)
  }, 60000)
  it('a chat turn that DID state a place (the intent layer wrote an area) keeps the old behaviour', async () => {
    const luna = lunaIntent('chat', ['food'], { area: 'Quận 3' })
    const on = await turn(one('Nhà hàng Ngon Villa ở Quận 3 có từ bao giờ vậy?'), { flag: '1', luna })
    const off = await turn(one('Nhà hàng Ngon Villa ở Quận 3 có từ bao giờ vậy?'), { flag: undefined, luna })
    expect(off.presearched).toBe(true)
    expect(on.presearched).toBe(true)
    expect(on.maps.map(m => m.q)).toEqual(off.maps.map(m => m.q))
  }, 60000)
})

// ── Wave 2F (C-F3, C-F4, C-F5, C-X6): what counts as a STATED place, read at route level through the gate event. Sentences and fixtures are written for this file. ────────────────────────────────
describe('Wave 2F - the gate reads a stated place as a PLACE, not as a word (route level, trace event)', () => {
  const gate = async (q: string, o: { luna?: Record<string, unknown> | null; gps?: unknown } = {}) => {
    vi.stubEnv('CONSULT_TRACE_DIAGNOSTICS', '1')
    try {
      const r = await turn(one(q), { flag: '1', luna: o.luna === undefined ? CHAT_FOOD : o.luna, gps: o.gps })
      return { ev: r.gateEvents[0] as { blocked: boolean; statedPlaceFrom: string | null } | undefined, presearched: r.presearched }
    } finally { vi.unstubAllEnvs() }
  }
  // F3 (b): a city word that is a person / a street / a dish is not a place the user stated
  for (const q of ['Cho mình biết vua Quang Trung Nguyễn Huệ lên ngôi năm nào?', 'Chủ tịch Hồ Chí Minh sinh năm nào và quê ở đâu?', 'Cho mình hỏi Bún bò Huế có nguồn gốc từ đâu?', 'Sa Pa có tuyết rơi vào tháng mấy trong năm?']) {
    it(`F3 (b) "${q.slice(0, 44)}…": no stated place - the gate blocks like any other knowledge turn`, async () => {
      const g = await gate(q, { gps: GPS_HN })
      expect(g.ev).toMatchObject({ blocked: true, statedPlaceFrom: null })
    }, 60000)
  }
  it('F3 (b) route effect: the Huế-named street question starts no pre-search (OFF does)', async () => {
    const q = 'Cho mình biết vua Quang Trung Nguyễn Huệ lên ngôi năm nào?'
    const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, gps: GPS_HN })
    expect(off.presearched).toBe(true) // not vacuous
    const on = await turn(one(q), { flag: '1', luna: CHAT_FOOD, gps: GPS_HN })
    expect(on.presearched).toBe(false); expect(on.maps).toEqual([])
  }, 60000)
  // F3 (a): a city in a place structure IS a stated place - the gate does not block, and the old behaviour (pre-search) stays
  for (const q of ['quán phở Hà Nội', 'khách sạn ở Đà Lạt cuối tuần này', 'ăn gì ở Huế hôm nay', 'tìm quán cà phê quanh Đà Nẵng']) {
    it(`F3 (a) "${q}": a stated city - not blocked, and it is the CITY that says so`, async () => {
      const g = await gate(q, { gps: GPS_HN })
      expect(g.ev).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'user_city' })
    }, 60000)
  }
  // C-X6: the intent layer misreads a place request as chat, but the user DID state a place - not blocked, BẬT = TẮT (pre-search still runs); the control that states nothing is blocked
  // (a sentence the gate really READS AS CHAT - the earlier fixtures were place requests the rules turned into a pick, so the gate never saw a chat turn and these tests could not fail)
  it('X6: a named venue + a DISTRICT on a turn read as chat ⇒ the district is the stated place: not blocked, same pre-search as OFF; the same sentence without it ⇒ blocked', async () => {
    const q = 'Nhà hàng Ngon Villa ở Quận 3 có từ bao giờ vậy?'
    const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, gps: GPS_HN })
    const on = await turn(one(q), { flag: '1', luna: CHAT_FOOD, gps: GPS_HN })
    expect(off.presearched).toBe(true) // not vacuous
    expect(on.presearched).toBe(true)
    expect(on.maps.map(m => m.q)).toEqual(off.maps.map(m => m.q))
    expect((await gate(q, { gps: GPS_HN })).ev).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'user_area' })
    const control = await gate('Nhà hàng Ngon Villa có từ bao giờ vậy?', { gps: GPS_HN })
    expect(control.ev).toMatchObject({ blocked: true, statedPlaceFrom: null })
  }, 60000)
  it('X6: a named venue + a CITY used as a place on a turn read as chat ⇒ the city is the stated place: not blocked, same pre-search as OFF', async () => {
    const q = 'Nhà hàng Ngon Villa ở Đà Nẵng có từ bao giờ vậy?'
    const off = await turn(one(q), { flag: undefined, luna: CHAT_FOOD, gps: GPS_HN })
    const on = await turn(one(q), { flag: '1', luna: CHAT_FOOD, gps: GPS_HN })
    expect(off.presearched).toBe(true) // not vacuous
    expect(on.presearched).toBe(true)
    expect(on.maps.map(m => m.q)).toEqual(off.maps.map(m => m.q))
    expect((await gate(q, { gps: GPS_HN })).ev).toMatchObject({ blocked: false, reason: 'stated_place', statedPlaceFrom: 'user_city' })
  }, 60000)
  // F5 / F4: a landmark in the intent layer's area is a stated place; "near me" words are not
  const LM = 'quán cà phê yên tĩnh gần Nhà Thờ Đức Bà'
  for (const area of ['gần Nhà Thờ Đức Bà', 'gần chợ Bến Thành', 'xung quanh Nhà hát lớn']) {
    it(`F5/F4: intent layer wrote chat with area "${area}" ⇒ a stated place, not blocked`, async () => {
      const g = await gate(`quán cà phê yên tĩnh ${area}`, { luna: lunaIntent('chat', ['food'], { area }), gps: GPS_HN })
      expect(g.ev).toMatchObject({ blocked: false, statedPlaceFrom: 'consult_area' })
    }, 60000)
  }
  // (only the phrases the intent layer's own grounding check lets through reach the gate; the other "near me" shapes are held by the unit tests of isNearMeOnly)
  for (const area of ['gần đây', 'quanh đây']) {
    it(`F5: area "${area}" (grounded in the user's words) is still "near me", not a stated place ⇒ blocked on a chat turn`, async () => {
      const g = await gate(`Cho mình hỏi Albert Einstein có những đóng góp nào được nhắc lại ${area} cho món phở không?`, { luna: lunaIntent('chat', ['food'], { area }), gps: GPS_HN })
      expect(g.ev).toMatchObject({ blocked: true, statedPlaceFrom: null })
    }, 60000)
  }
  it('F4 residual (intended, measured only): a landmark request the intent layer read as chat, NO area written, no GPS ⇒ still blocked', async () => {
    const g = await gate(LM, { luna: CHAT_FOOD })
    expect(g.ev).toMatchObject({ blocked: true })
  }, 60000)
})

// ── Wave 2F · measurement (M1-M7): after ONE approved trace-ON run the log answers "how many turns the gate blocked, what the model did on them, and what it cost" with one query. Trace ON + gate ON only. ──────────
describe('Wave 2F - the gate\'s measurement lines (CONSULT_TRACE_DIAGNOSTICS=1 and CONSULT_SEARCH_NOW_INTENT_GATE=1 only; names, booleans and counts, never the user\'s words)', () => {
  const KNOW = 'Cho mình hỏi Marie Curie đã nhận giải Nobel nào và vì công trình gì?'
  const traced = async (q: string, o: Parameters<typeof turn>[1] = {}) => {
    vi.stubEnv('CONSULT_TRACE_DIAGNOSTICS', '1')
    try { return await turn(one(q), o) } finally { vi.unstubAllEnvs() }
  }
  const outcomes = (r: { traceEvents: Array<Record<string, any>> }) => r.traceEvents.filter(e => e.ev === 'search_now_gate_outcome')
  it('M1 + M5 + M6 + M7: a blocked knowledge turn - the gate line says why (labels, booleans), the summary line says what the turn did (tools offered, who called, area question)', async () => {
    const r = await traced(KNOW, { flag: '1', luna: CHAT_FOOD, reply: 'Trả lời kiến thức.' })
    expect(r.gateEvents).toHaveLength(1)
    expect(r.gateEvents[0]).toMatchObject({ blocked: true, reason: 'chat_turn_no_stated_place', hasValidGps: false, lunaTurn: 'chat', lunaDomains: ['food'], statedDistrict: false, statedCity: false, lunaArea: 'none', rulesTurn: 'chat' })
    const o = outcomes(r)
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({ blocked: true, droppedType: 'attraction', toolsOffered: ['search_places'], modelCalledPlaceTool: false, modelPlaceCalls: 0, codePlaceCalls: 0, areaAskAppended: false, areaAskSource: null, serperRequestsByModel: 0, serperRequestsByCode: 0, finishReason: 'stop' })
    expect(typeof o[0].forcedToolIgnored).toBe('boolean')
  }, 60000)
  it('M2 + M3 + M7: the ANSWER MODEL calls the place tool with no location - the lookup line says by:"model", the area question is appended and its source is "model"', async () => {
    const r = await traced(KNOW, { flag: '1', luna: CHAT_FOOD, tool: { query: 'Marie Curie' }, reply: 'Câu trả lời.' })
    const lookup = r.traceEvents.filter(e => e.ev === 'search_now_gate_model_lookup')
    expect(lookup).toHaveLength(1)
    expect(lookup[0]).toMatchObject({ by: 'model', outcome: 'no_current_location', asked: true, hasValidGps: false })
    expect(r.traceEvents.filter(e => e.ev === 'path_cut' && e.kind === 'area_ask')[0]).toMatchObject({ appended: true, source: 'model' })
    expect(outcomes(r)[0]).toMatchObject({ modelCalledPlaceTool: true, modelPlaceCalls: 1, codePlaceCalls: 0, areaAskAppended: true, areaAskSource: 'model' })
    // every line of the turn carries the same traceId
    expect(new Set(r.traceEvents.map(e => e.traceId)).size).toBe(1)
  }, 60000)
  it('M2 with a GPS fix: the model\'s search goes on to the provider - the lookup line says outcome:"proceeded" and no area question is appended', async () => {
    const r = await traced(KNOW, { flag: '1', luna: CHAT_FOOD, tool: { query: 'Marie Curie' }, gps: GPS_HN, reply: 'Câu trả lời.' })
    const lookup = r.traceEvents.filter(e => e.ev === 'search_now_gate_model_lookup')
    expect(lookup).toHaveLength(1)
    expect(lookup[0]).toMatchObject({ by: 'model', outcome: 'proceeded', asked: false, hasValidGps: true })
    expect(outcomes(r)[0]).toMatchObject({ modelCalledPlaceTool: true, modelPlaceCalls: 1, areaAskAppended: false, areaAskSource: null })
    expect(r.gateEvents[0]).toMatchObject({ hasValidGps: true })
  }, 60000)
  it('M6: the stated places are told apart (district / city read as a place / the intent layer\'s area: none, near-me, place)', async () => {
    const d = await traced('quán phở ở Quận 3', { flag: '1', luna: CHAT_FOOD, gps: GPS_HN })
    expect(d.gateEvents[0]).toMatchObject({ blocked: false, statedDistrict: true, statedPlaceFrom: 'user_area' })
    const c = await traced('khách sạn ở Đà Lạt cuối tuần này', { flag: '1', luna: CHAT_FOOD, gps: GPS_HN })
    expect(c.gateEvents[0]).toMatchObject({ blocked: false, statedCity: true, statedDistrict: false })
    const near = await traced('Cho mình hỏi Albert Einstein có những đóng góp nào được nhắc lại gần đây cho món phở không?', { flag: '1', luna: lunaIntent('chat', ['food'], { area: 'gần đây' }), gps: GPS_HN })
    expect(near.gateEvents[0]).toMatchObject({ blocked: true, lunaArea: 'near_me' })
    const place = await traced('quán cà phê yên tĩnh gần Nhà Thờ Đức Bà', { flag: '1', luna: lunaIntent('chat', ['food'], { area: 'gần Nhà Thờ Đức Bà' }), gps: GPS_HN })
    expect(place.gateEvents[0]).toMatchObject({ blocked: false, lunaArea: 'place', statedPlaceFrom: 'consult_area' })
  }, 60000)
  it('a turn the gate did NOT block writes no summary line and no lookup line', async () => {
    const r = await traced('quán phở ở Quận 3', { flag: '1', luna: CHAT_FOOD, gps: GPS_HN, tool: { query: 'quán phở', location: 'Quận 3, TP.HCM' } })
    expect(r.gateEvents[0]).toMatchObject({ blocked: false })
    expect(outcomes(r)).toHaveLength(0)
    expect(r.traceEvents.filter(e => e.ev === 'search_now_gate_model_lookup')).toHaveLength(0)
  }, 60000)
  it('no trace flag ⇒ not one trace line (and the turn is the same); gate flag OFF with the trace ON ⇒ none of the Wave 2F lines or fields', async () => {
    const quiet = await turn(one(KNOW), { flag: '1', luna: CHAT_FOOD, reply: 'Trả lời kiến thức.' })
    expect(quiet.traceEvents).toEqual([])
    vi.stubEnv('CONSULT_TRACE_DIAGNOSTICS', '1')
    try {
      const off = await turn(one(KNOW), { flag: undefined, luna: CHAT_FOOD, tool: { query: 'Marie Curie' }, reply: 'Câu trả lời.' })
      expect(off.traceEvents.length).toBeGreaterThan(0) // not vacuous: the old trace lines are there
      expect(off.traceEvents.filter(e => /^search_now_gate/.test(e.ev))).toEqual([])
      expect(off.traceEvents.filter(e => e.ev === 'loop').every(e => !('toolsOffered' in e))).toBe(true)
      expect(off.traceEvents.filter(e => e.ev === 'path_cut' && e.kind === 'area_ask').every(e => !('source' in e))).toBe(true)
    } finally { vi.unstubAllEnvs() }
  }, 60000)
  it('no user text in any new line, even when the message carries a key, a token and an e-mail (fake values)', async () => {
    const SECRET = 'sk-abcdef1234567890', MAIL = 'nguoi.dung@example.com', TOK = 'token=abcd1234efgh5678'
    const q = `Cho mình hỏi Marie Curie ${SECRET} ${MAIL} ${TOK} đã nhận giải Nobel nào?`
    const r = await traced(q, { flag: '1', luna: CHAT_FOOD, tool: { query: `Marie Curie ${SECRET}` }, reply: 'Câu trả lời.' })
    const mine = r.traceEvents.filter(e => /^search_now_gate/.test(e.ev) || (e.ev === 'path_cut' && e.kind === 'area_ask') || e.ev === 'loop')
    expect(mine.length).toBeGreaterThanOrEqual(4)
    const text = JSON.stringify(mine)
    for (const s of [SECRET, MAIL, TOK, 'abcd1234', 'Marie Curie', 'Nobel', 'nguoi.dung']) expect(text, s).not.toContain(s)
  }, 60000)
})
