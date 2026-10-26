/**
 * Wave 3 · W2 — CONSULT_TOOL_BY_NEED at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network, no key, no cost).
 * Claims (flag = CONSULT_TOOL_BY_NEED, needs CONSULT_SEARCH_NOW_INTENT_GATE; only the exact value "1"; never in a production runtime):
 *   · ON: EVERY lean consult turn (blocked by the gate or not) is offered web_search next to its area tools; nothing else in the tool list changes;
 *   · ON: web_search carries the general by-need description and the prompt carries ONE general line (no keyword, no example, nothing about the area question);
 *   · ON: a turn that is NOT a lean consult turn (no area) is untouched: same tools, same prompt (M7, non-vacuous: its tool list is not empty);
 *   · ON: the area question, the answer text and the place / web lookups are the ones of the gate alone;
 *   · OFF (unset, "0", "true", " 1", "1 ", "on"), ON without the gate, or a production runtime: byte-for-byte the gate-only behaviour.
 * The messages are written for this test; none comes from a benchmark question file. The turns below are a convenience sample, not a proof about other sentences.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { TOOL_BY_NEED_RULE, WEB_SEARCH_DESCRIPTION_BY_NEED } from '@/lib/ai/consultative/leanConsultPrompt'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{ q: string; ll: unknown }>,
    legacy: null as null | { call: Call; text: string },
    luna: null as null | Record<string, unknown>,
    toolNames: [] as string[],
    webSearchDescription: '' as string,
    system: '' as string,
    toolResult: null as unknown,
    webCalls: [] as string[],
    userId: 'u-tool-by-need',
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
      h.state.webSearchDescription = String(opts.tools?.web_search?.description ?? '')
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
import { AREA_ASK_VI } from '@/lib/ai/consultative/areaAsk'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})
const one = (u: string): Msg[] => [{ role: 'user', content: u }]

interface TurnOpts { gate?: string; need?: string; trace?: boolean; vercelEnv?: string; luna?: Record<string, unknown> | null; tool?: { name?: string; query: string } | null; gps?: unknown; reply?: string }
async function turn(messages: Msg[], o: TurnOpts = {}) {
  delete process.env.TAPPY_AGENT
  const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  set('CONSULT_SEARCH_NOW_INTENT_GATE', o.gate); set('CONSULT_TOOL_BY_NEED', o.need); set('CONSULT_TRACE_DIAGNOSTICS', o.trace ? '1' : undefined); set('VERCEL_ENV', o.vercelEnv)
  delete process.env.CONSULT_DETERMINISTIC_MATH // this file pins W2 alone (W4 is covered by deterministicMath.route.test.ts)
  delete process.env.CONSULT_RESEARCH_LOOP // ... and W1 by researchLoop.route.test.ts
  delete process.env.CONSULT_STRUCTURED_SYNTHESIS // ... and W3 by structuredSynthesis.route.test.ts
  delete process.env.CONSULT_CAPABILITY_LEVEL // ... and the level by capabilityLevel.route.test.ts
  const toolName = o.tool?.name ?? 'search_places'
  const call: Call | null = o.tool ? { toolCallId: 'c1', toolName, args: toolName === 'search_places' ? { query: o.tool.query, type: 'attraction' } : { query: o.tool.query } } : null
  h.state.legacy = { call: call ?? { toolCallId: 'none', toolName: 'none', args: {} }, text: o.reply ?? 'Đây là câu trả lời.' }
  h.state.luna = o.luna ?? null
  h.state.toolNames = []; h.state.webSearchDescription = ''; h.state.system = ''; h.state.toolResult = null; h.state.maps = []; h.state.webCalls = []
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
    raw, text, maps: [...h.state.maps], web: [...h.state.webCalls], toolNames: [...h.state.toolNames], webSearchDescription: h.state.webSearchDescription, system: h.state.system,
    toolResult: h.state.toolResult as Record<string, any> | null,
    asks: text.split(AREA_ASK_VI).length - 1,
    traceEvents: js.filter(j => j.type === 'tappyai_trace') as Array<Record<string, any>>,
  }
}

beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_TOOL_BY_NEED', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'CONSULT_TRACE_DIAGNOSTICS', 'VERCEL_ENV']) delete process.env[k]; vi.unstubAllGlobals() })

const JSON_ESC = (s: string) => JSON.stringify(s).slice(1, -1)
const MORE: Msg[] = [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'còn quán nào nữa' }]
// lean consult turns of several kinds. A "pick" turn is answered after the CODE's own pre-search with NO tool definitions at all (route.ts: `lunaAnswer && presearchAll.length > 0` -> tools undefined, the
// "no model-driven tool loops" pattern): CONSULT_TOOL_BY_NEED cannot offer anything there (a limit of W2, recorded in the report) and must leave it alone.
const LEAN: Array<[string, Msg[], TurnOpts]> = [
  ['chat + food (blocked by the gate)', one('Tiểu sử ngắn gọn của Nikola Tesla.'), { luna: lunaIntent('chat', ['food']) }],
  ['more + food', MORE, { luna: lunaIntent('more', ['food']), gps: GPS_HN }],
  ['chat + entertainment', one('Karaoke có nguồn gốc từ nước nào'), { luna: lunaIntent('chat', ['entertainment']) }],
]
const NO_TOOL_PICK: Array<[string, Msg[], TurnOpts]> = [
  ['pick + food', one('cho mình quán cơm tấm'), { luna: lunaIntent('pick', ['food'], { query: 'cơm tấm' }), gps: GPS_HN }],
  ['pick + shopping', one('mua tai nghe'), { luna: lunaIntent('pick', ['shopping'], { query: 'tai nghe' }) }],
  ['pick + travel', one('khách sạn ở Đà Lạt'), { luna: lunaIntent('pick', ['travel'], { query: 'khách sạn' }), gps: GPS_HN }],
  ['followup + food', [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'quán đó mở mấy giờ' }], { luna: lunaIntent('followup', ['food']), gps: GPS_HN }],
]

describe('W2 — a pick turn the code pre-searched carries no tools: the flag leaves it alone', () => {
  for (const [name, msgs, o] of NO_TOOL_PICK) {
    it(`${name}: tool list, description and prompt equal the gate-only ones`, async () => {
      const on = await turn(msgs, { ...o, gate: '1', need: '1', reply: 'ok' })
      const off = await turn(msgs, { ...o, gate: '1', need: undefined, reply: 'ok' })
      expect(on.toolNames).toEqual(off.toolNames)
      expect(on.webSearchDescription).toBe(off.webSearchDescription)
    }, 60000)
  }
})

describe('W2 — flag ON (with the gate): every lean consult turn is offered web_search, and only that is added', () => {
  for (const [name, msgs, o] of LEAN) {
    it(`${name}: the tool list is the gate-only list plus web_search; the by-need line and description reach the model only now`, async () => {
      const on = await turn(msgs, { ...o, gate: '1', need: '1', reply: 'ok' })
      const off = await turn(msgs, { ...o, gate: '1', need: undefined, reply: 'ok' })
      expect(off.toolNames.length).toBeGreaterThan(0) // non-vacuous: the OFF turn carries tools
      expect(on.toolNames).toContain('web_search')
      expect([...on.toolNames].sort()).toEqual([...new Set([...off.toolNames, 'web_search'])].sort())
      expect(on.webSearchDescription).toBe(WEB_SEARCH_DESCRIPTION_BY_NEED)
      expect(off.webSearchDescription).not.toBe(WEB_SEARCH_DESCRIPTION_BY_NEED)
      expect(on.system).toContain(JSON_ESC(TOOL_BY_NEED_RULE))
      expect(off.system).not.toContain(JSON_ESC(TOOL_BY_NEED_RULE))
    }, 60000)
  }

  it('the line and the description are general: they carry no quoted example, no list of words and nothing about the area question', () => {
    for (const s of [TOOL_BY_NEED_RULE, WEB_SEARCH_DESCRIPTION_BY_NEED]) {
      expect(s).not.toMatch(/[“"'‘’”]/) // no quoted example sentence
      expect(s.toLowerCase()).not.toMatch(/khu vuc|khu vực|vd:|vi du|ví dụ/)
    }
    expect(TOOL_BY_NEED_RULE).toContain('web_search')
  })
})

describe('W2 — M7 (non-vacuous): a turn that is not a lean consult turn is untouched', () => {
  it('Luna names no area: the full (non-lean) tool list and prompt are identical with the flag ON', async () => {
    const msgs = one('Chào bạn, hôm nay bạn thế nào')
    const o: TurnOpts = { luna: lunaIntent('chat', []), reply: 'ok' }
    const on = await turn(msgs, { ...o, gate: '1', need: '1' })
    const off = await turn(msgs, { ...o, gate: '1', need: undefined })
    expect(off.toolNames.length).toBeGreaterThan(3) // the legacy path carries many tools: the comparison is not empty
    expect(on.toolNames).toEqual(off.toolNames)
    expect(on.webSearchDescription).toBe(off.webSearchDescription)
    expect(on.system).toBe(off.system)
  }, 60000)
})

describe('W2 — what the user sees is the gate-only behaviour', () => {
  it('the model looks a place up with no location on a knowledge turn: the area question, the tool result and the answer are the gate-only ones', async () => {
    const o: TurnOpts = { luna: lunaIntent('chat', ['food']), tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' }
    const on = await turn(one('Tiểu sử ngắn gọn của Nikola Tesla.'), { ...o, gate: '1', need: '1' })
    const off = await turn(one('Tiểu sử ngắn gọn của Nikola Tesla.'), { ...o, gate: '1', need: undefined })
    expect(off.asks).toBe(1)
    expect(on.asks).toBe(off.asks)
    expect(on.text).toBe(off.text)
    expect(on.toolResult).toEqual(off.toolResult)
    expect(on.maps).toEqual(off.maps)
  }, 60000)

  it('the model calls web_search itself: it runs once, no place lookup runs', async () => {
    const on = await turn(one('Tiểu sử ngắn gọn của Nikola Tesla.'), { gate: '1', need: '1', luna: lunaIntent('chat', ['food']), tool: { name: 'web_search', query: 'tiểu sử nhà phát minh' }, reply: 'Có nguồn.' })
    expect(on.web.length).toBe(1)
    expect(on.maps).toEqual([])
  }, 60000)

  it('trace (CONSULT_TRACE_DIAGNOSTICS): the gate-outcome line says the by-need tool set was applied and web_search was offered, only with the flag ON', async () => {
    const o: TurnOpts = { luna: lunaIntent('chat', ['food']), trace: true, reply: 'ok' }
    const on = await turn(one('Tiểu sử ngắn gọn của Nikola Tesla.'), { ...o, gate: '1', need: '1' })
    const off = await turn(one('Tiểu sử ngắn gọn của Nikola Tesla.'), { ...o, gate: '1', need: undefined })
    const ev = (r: typeof on) => r.traceEvents.find(e => e.ev === 'search_now_gate_outcome')
    expect(ev(on)?.toolByNeedApplied).toBe(true)
    expect(ev(on)?.webSearchOffered).toBe(true)
    expect(ev(off) && 'toolByNeedApplied' in ev(off)!).toBe(false)
  }, 60000)
})

describe('W2 — OFF is the gate-only behaviour, byte for byte', () => {
  const MSGS = MORE // a lean turn that carries tools (search_places) - the comparison is not empty
  const O: TurnOpts = { luna: lunaIntent('more', ['food']), gps: GPS_HN, reply: 'ok' }
  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    it(`value ${JSON.stringify(v)}: same tools, description and prompt as unset`, async () => {
      const base = await turn(MSGS, { ...O, gate: '1', need: undefined })
      const x = await turn(MSGS, { ...O, gate: '1', need: v })
      expect(x.toolNames).toEqual(base.toolNames)
      expect(x.webSearchDescription).toBe(base.webSearchDescription)
      expect(x.system).toBe(base.system)
      expect(x.toolNames).toEqual(['search_places'])
    }, 60000)
  }
  for (const gate of [undefined, '0']) {
    it(`"1" without the gate (${JSON.stringify(gate)}): inert`, async () => {
      const base = await turn(MSGS, { ...O, gate, need: undefined })
      const x = await turn(MSGS, { ...O, gate, need: '1' })
      expect(x.toolNames).toEqual(base.toolNames)
      expect(x.system).toBe(base.system)
    }, 60000)
  }
  it('a production runtime reads it as OFF even when it is "1"', async () => {
    const base = await turn(MSGS, { ...O, gate: '1', need: undefined, vercelEnv: 'production' })
    const x = await turn(MSGS, { ...O, gate: '1', need: '1', vercelEnv: 'production' })
    expect(x.toolNames).toEqual(base.toolNames)
    expect(x.system).toBe(base.system)
  }, 60000)
})
