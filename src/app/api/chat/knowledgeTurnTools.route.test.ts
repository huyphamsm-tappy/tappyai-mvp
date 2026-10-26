/**
 * Wave 2I · B — CONSULT_KNOWLEDGE_TURN_TOOLS at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network).
 * Measured (paid run 4, E10/E11): after the search-now gate (C) the code no longer starts a place lookup on a knowledge turn, but the MODEL still called search_places (no location ->
 * `no_current_location`) and the area question was appended to a knowledge answer; and on the lean path (Luna domain "food") the model was not given web_search at all.
 * Claims (flag = CONSULT_KNOWLEDGE_TURN_TOOLS, needs CONSULT_SEARCH_NOW_INTENT_GATE):
 *   · ON, turn blocked by the gate: web_search is offered next to search_places; the area question is NOT appended when the model's own place lookup failed for want of a location AND the rules
 *     router did not read the message as a place request; the tool result then tells the model to ask for a place itself if the user really wants one;
 *   · ON, a real place request the intent layer misread as chat (the rules router reads it as a venue request): the area question is still appended, exactly as before;
 *   · ON, a place stated by the user / pick / ask turns: nothing changes (compared directly with the flag OFF);
 *   · OFF (unset, "0", "true", " 1"), or ON without the gate: the old behaviour.
 * The messages are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { AREA_ASK_VI } from '@/lib/ai/consultative/areaAsk'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{ q: string; ll: unknown }>,
    legacy: null as null | { call: Call; text: string },
    luna: null as null | Record<string, unknown>,
    toolNames: [] as string[],
    system: '' as string,
    toolResult: null as unknown,
    webCalls: [] as string[],
    userId: 'u-knowledge-turn-tools',
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
      h.state.toolNames = Object.keys(opts.tools ?? {})
      try { h.state.system = JSON.stringify({ system: opts.system }) } catch { h.state.system = '' }
      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            const s = h.state.legacy
            if (s && opts.tools?.[s.call.toolName]) {
              c.enqueue(enc.encode(`9:${JSON.stringify(s.call)}\n`))
              const result = await opts.tools[s.call.toolName].execute(s.call.args, { toolCallId: s.call.toolCallId, messages: [] })
              h.state.toolResult = result
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: s.call.toolCallId, result })}\n`))
            }
            if (s?.text) c.enqueue(enc.encode(`0:${JSON.stringify(s.text)}\n`))
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
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})
const CHAT_FOOD = lunaIntent('chat', ['food'])
const one = (u: string): Msg[] => [{ role: 'user', content: u }]

interface TurnOpts { gate?: string; know?: string; trace?: boolean; luna?: Record<string, unknown> | null; tool?: { name?: string; query: string; location?: string } | null; gps?: unknown; reply?: string }
async function turn(messages: Msg[], o: TurnOpts = {}) {
  delete process.env.TAPPY_AGENT
  const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  set('CONSULT_SEARCH_NOW_INTENT_GATE', o.gate); set('CONSULT_KNOWLEDGE_TURN_TOOLS', o.know); set('CONSULT_TRACE_DIAGNOSTICS', o.trace ? '1' : undefined)
  const reply = o.reply ?? 'Đây là câu trả lời bằng kiến thức chung.'
  const toolName = o.tool?.name ?? 'search_places'
  const call: Call | null = o.tool ? { toolCallId: 'c1', toolName, args: toolName === 'search_places' ? { query: o.tool.query, type: 'attraction', ...(o.tool.location !== undefined ? { location: o.tool.location } : {}) } : { query: o.tool.query } } : null
  h.state.legacy = { call: call ?? { toolCallId: 'none', toolName: 'none', args: {} }, text: reply }
  h.state.luna = o.luna ?? null
  h.state.toolNames = []; h.state.system = ''; h.state.toolResult = null; h.state.maps = []; h.state.webCalls = []
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
    raw, text, maps: [...h.state.maps], web: [...h.state.webCalls], toolNames: [...h.state.toolNames], system: h.state.system, toolResult: h.state.toolResult as Record<string, any> | null,
    refused: js.some(j => j.type === 'tappyai_tool_called' && j.step === 'no_current_location'),
    asks: text.split(AREA_ASK_VI).length - 1,
    consultTurn: (js.find(j => j.type === 'tappyai_consult') ?? {}).turn as string | undefined,
    traceEvents: js.filter(j => j.type === 'tappyai_trace') as Array<Record<string, any>>,
    rawLog: lines.join('\n'),
  }
}

beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'CONSULT_TRACE_DIAGNOSTICS', 'NODE_ENV', 'VERCEL_ENV']) { if (k !== 'NODE_ENV') delete process.env[k] } vi.unstubAllGlobals() })

const KNOW_1 = 'Tiểu sử ngắn gọn của Nikola Tesla và các sáng chế chính.'
const KNOW_2 = 'Cho mình biết Marie Curie đã nhận giải Nobel nào và vì công trình gì?'
const outcome = (r: { traceEvents: Array<Record<string, any>> }) => r.traceEvents.find(e => e.ev === 'search_now_gate_outcome')

describe('B — flag ON (with the gate): a knowledge turn gets web_search and no area question', () => {
  for (const q of [KNOW_1, KNOW_2]) {
    it(`E10/E11-shaped ("${q.slice(0, 40)}…"): the model's own place lookup fails for want of a location -> web_search is offered and the area question is NOT appended`, async () => {
      const on = await turn(one(q), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
      expect(on.consultTurn).toBe('chat')
      expect(on.toolNames).toContain('web_search')
      expect(on.toolNames).toContain('search_places')
      expect(on.refused).toBe(true)
      expect(on.asks).toBe(0)
      expect(on.text.trim()).toBe('Trả lời kiến thức.')
      expect(JSON.stringify(on.toolResult)).not.toContain('KHÔNG tự đặt câu hỏi khu vực')
      expect(on.maps).toEqual([])
    }, 60000)
    it(`same turn, flag OFF (gate only): web_search is not offered on the lean path and the area question is appended, as in run 4`, async () => {
      const off = await turn(one(q), { gate: '1', know: undefined, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
      expect(off.toolNames).not.toContain('web_search')
      expect(off.asks).toBe(1)
      expect(off.text.trim().endsWith(AREA_ASK_VI)).toBe(true)
    }, 60000)
  }

  it('the model calls web_search itself: it runs once, no place lookup, no area question', async () => {
    const on = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { name: 'web_search', query: 'tiểu sử nhà phát minh' }, reply: 'Có nguồn.' })
    expect(on.web.length).toBe(1)
    expect(on.maps).toEqual([])
    expect(on.asks).toBe(0)
  }, 60000)

  it('the one-line tool rule for such a turn reaches the model only with the flag ON', async () => {
    const on = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, reply: 'x' })
    const off = await turn(one(KNOW_1), { gate: '1', know: undefined, luna: CHAT_FOOD, reply: 'x' })
    expect(on.system).toContain('web_search')
    expect(on.system.length).toBeGreaterThan(off.system.length)
  }, 60000)
})

describe('B — two sides: a real place request keeps its area question', () => {
  const REAL = ['tìm quán phở bò ngon cho 2 người dưới 100k', 'tìm quán nhậu cho nhóm 6 người']
  for (const q of REAL) {
    it(`"${q}" misread as chat, no GPS, the model looks the place up: the rules read a venue request -> STILL asked for the area (flag ON == flag OFF)`, async () => {
      const on = await turn(one(q), { gate: '1', know: '1', trace: true, luna: CHAT_FOOD, tool: { query: 'quán' }, reply: '' })
      const off = await turn(one(q), { gate: '1', know: undefined, luna: CHAT_FOOD, tool: { query: 'quán' }, reply: '' })
      expect(on.refused).toBe(true)
      expect(on.asks).toBe(1)
      expect(on.text).toBe(off.text)
      expect(outcome(on)?.areaAskSuppressed).toBe(false)
      expect(outcome(on)?.areaAskKeptReason).toBe('venue_request_by_rules')
    }, 60000)
    it(`"${q}" with GPS: the model's lookup goes ahead exactly as without the flag`, async () => {
      const on = await turn(one(q), { gate: '1', know: '1', luna: CHAT_FOOD, gps: GPS_HN, tool: { query: 'quán' }, reply: 'ok' })
      const off = await turn(one(q), { gate: '1', know: undefined, luna: CHAT_FOOD, gps: GPS_HN, tool: { query: 'quán' }, reply: 'ok' })
      expect(on.maps).toEqual(off.maps)
      expect(on.maps.length).toBeGreaterThan(0)
      expect(on.text).toBe(off.text)
    }, 60000)
  }
})

describe('B — nothing else changes', () => {
  it('a place the user states (district): the gate does not block, so the flag changes nothing', async () => {
    const q = 'quán cà phê yên tĩnh ở quận 3'
    const on = await turn(one(q), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { query: 'cà phê' }, reply: 'ok' })
    const off = await turn(one(q), { gate: '1', know: undefined, luna: CHAT_FOOD, tool: { query: 'cà phê' }, reply: 'ok' })
    expect(on.toolNames).toEqual(off.toolNames)
    expect(on.maps).toEqual(off.maps)
    expect(on.text).toBe(off.text)
    expect(on.asks).toBe(off.asks)
  }, 60000)

  it('an ask / pick turn (E1–E5-shaped, pick + places + GPS): identical with and without the flag', async () => {
    const q = 'cho mình chỗ hát karaoke tối nay'
    const luna = lunaIntent('pick', ['entertainment'], { query: 'karaoke' })
    const on = await turn(one(q), { gate: '1', know: '1', luna, gps: GPS_HN, tool: { query: 'karaoke' }, reply: 'ok' })
    const off = await turn(one(q), { gate: '1', know: undefined, luna, gps: GPS_HN, tool: { query: 'karaoke' }, reply: 'ok' })
    expect(on.toolNames).toEqual(off.toolNames)
    expect(on.maps).toEqual(off.maps)
    expect(on.text).toBe(off.text)
    expect(on.asks).toBe(off.asks)
  }, 60000)

  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    it(`flag value ${JSON.stringify(v)}: the old behaviour (area question appended, no web_search on the lean path)`, async () => {
      const r = await turn(one(KNOW_1), { gate: '1', know: v, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
      expect(r.toolNames).not.toContain('web_search')
      expect(r.asks).toBe(1)
    }, 60000)
  }

  it('flag ON without the gate: no effect at all (same as both OFF)', async () => {
    const a = await turn(one(KNOW_1), { gate: undefined, know: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    const b = await turn(one(KNOW_1), { gate: undefined, know: undefined, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    expect(a.toolNames).toEqual(b.toolNames)
    expect(a.text).toBe(b.text)
    expect(a.asks).toBe(b.asks)
  }, 60000)

  it('a production runtime reads the flag as OFF even when it is "1"', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    try {
      const r = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'x' })
      expect(r.toolNames).not.toContain('web_search')
    } finally { vi.unstubAllEnvs() }
  }, 60000)
})

describe('B — trace (CONSULT_TRACE_DIAGNOSTICS=1 only): labels, never the user text', () => {
  it('the outcome line carries knowledgeToolsApplied / webSearchOffered / areaAskSuppressed; no word of the question is in the log', async () => {
    const r = await turn(one(KNOW_1), { gate: '1', know: '1', trace: true, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    const o = outcome(r)
    expect(o).toBeTruthy()
    expect(o).toMatchObject({ knowledgeToolsApplied: true, webSearchOffered: true, areaAskSuppressed: true, areaAskAppended: false })
    expect(o?.areaAskKeptReason ?? null).toBeNull()
    expect(r.toolNames.length).toBeGreaterThan(0)
    // Only the lines of the gate (old Wave 2C `tool` events and `tappyai_tool_called` log the model's own query: F-9, out of scope here).
    const gateLines = JSON.stringify(r.traceEvents.filter(e => /^search_now_gate/.test(String(e.ev)) || e.ev === 'loop'))
    expect(gateLines).not.toContain('Nikola')
    expect(gateLines).not.toContain('sáng chế')
    expect(gateLines).not.toContain('Tiểu sử')
  }, 60000)

  it('flag OFF: the outcome line has none of the new fields (the trace is byte-compatible with run 4)', async () => {
    const r = await turn(one(KNOW_1), { gate: '1', know: undefined, trace: true, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'x' })
    const o = outcome(r)
    expect(o).toBeTruthy()
    for (const k of ['knowledgeToolsApplied', 'webSearchOffered', 'areaAskSuppressed', 'areaAskKeptReason']) expect(o).not.toHaveProperty(k)
  }, 60000)
})
