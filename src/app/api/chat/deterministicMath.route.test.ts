/**
 * Wave 3 · W4 — CONSULT_DETERMINISTIC_MATH at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network, no key, no cost).
 * Claims (flag = CONSULT_DETERMINISTIC_MATH; only the exact value "1"; never in a production runtime; needs no other flag):
 *   · ON: a lean consult turn that carries tools is also offered `calculate`; nothing else in the tool list changes; one general line reaches the prompt only now;
 *   · ON: a turn that is NOT a lean consult turn, and a pick turn the code pre-searched (no tool definitions by design), are untouched;
 *   · ON: the model's call runs the exact calculator: the result is the independent value, a refusal comes back as a typed result (the turn goes on), no network and no place / web lookup runs;
 *   · ON: a money figure that comes from the calculator reaches the user in the final text (the guards that cut unbacked figures do not remove it);
 *   · OFF (unset, "0", "true", " 1", "1 ", "on", or a production runtime): byte-for-byte the previous behaviour.
 * The messages are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { MATH_TOOL_RULE, CALCULATE_DESCRIPTION } from '@/lib/ai/consultative/leanConsultPrompt'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{ q: string; ll: unknown }>,
    legacy: null as null | { calls: Call[]; text: string },
    results: {} as Record<string, unknown>,
    luna: null as null | Record<string, unknown>,
    toolNames: [] as string[],
    calcDescription: '' as string,
    system: '' as string,
    toolResult: null as unknown,
    webCalls: [] as string[],
    userId: 'u-deterministic-math',
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
  serperShopping: async () => [{ title: 'Tai nghe ABC không dây', link: 'https://shopee.vn/tai-nghe-abc-i.1.2', price: '890.000₫', source: 'Shopee' }],
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
      h.state.calcDescription = String(opts.tools?.calculate?.description ?? '')
      try { h.state.system = JSON.stringify({ system: opts.system }) } catch { h.state.system = '' }
      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            const s = h.state.legacy
            for (const call of s?.calls ?? []) {
              if (!opts.tools?.[call.toolName]) continue
              c.enqueue(enc.encode(`9:${JSON.stringify(call)}\n`))
              const result = await opts.tools[call.toolName].execute(call.args, { toolCallId: call.toolCallId, messages: [] })
              h.state.toolResult = result // the LAST call's result
              h.state.results[call.toolName] = result
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}\n`))
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
import { calculate } from '@/lib/ai/tools/calculate'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})
const one = (u: string): Msg[] => [{ role: 'user', content: u }]

type ScriptedCall = { name: string; args: Record<string, unknown> }
interface TurnOpts { math?: string; vercelEnv?: string; luna?: Record<string, unknown> | null; tool?: ScriptedCall | null; tools?: ScriptedCall[]; gps?: unknown; reply?: string }
async function turn(messages: Msg[], o: TurnOpts = {}) {
  delete process.env.TAPPY_AGENT
  const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  set('CONSULT_DETERMINISTIC_MATH', o.math); set('VERCEL_ENV', o.vercelEnv)
  delete process.env.CONSULT_RESEARCH_LOOP // this file pins W4 alone (W1 is covered by researchLoop.route.test.ts)
  delete process.env.CONSULT_STRUCTURED_SYNTHESIS // (W3 by structuredSynthesis.route.test.ts)
  delete process.env.CONSULT_CAPABILITY_LEVEL // (the level by capabilityLevel.route.test.ts)
  const calls: Call[] = [...(o.tool ? [o.tool] : []), ...(o.tools ?? [])].map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.name, args: t.args }))
  h.state.legacy = { calls, text: o.reply ?? 'Đây là câu trả lời.' }
  h.state.results = {}
  h.state.luna = o.luna ?? null
  h.state.toolNames = []; h.state.calcDescription = ''; h.state.system = ''; h.state.toolResult = null; h.state.maps = []; h.state.webCalls = []
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
  return {
    raw, text, maps: [...h.state.maps], web: [...h.state.webCalls], toolNames: [...h.state.toolNames], calcDescription: h.state.calcDescription, system: h.state.system,
    toolResult: h.state.toolResult as Record<string, any> | null,
    results: { ...h.state.results } as Record<string, any>,
    lines,
  }
}

beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_TOOL_BY_NEED', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'VERCEL_ENV']) delete process.env[k]; vi.unstubAllGlobals() })

const JSON_ESC = (s: string) => JSON.stringify(s).slice(1, -1)
const MORE: Msg[] = [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'còn quán nào nữa' }]
// lean consult turns that carry tools (a pick turn the code pre-searched carries none by design)
const LEAN: Array<[string, Msg[], TurnOpts]> = [
  ['chat + food', one('Mỗi tháng trả góp bao nhiêu nếu vay 300 triệu 10 năm'), { luna: lunaIntent('chat', ['food']) }],
  ['more + food', MORE, { luna: lunaIntent('more', ['food']), gps: GPS_HN }],
  ['chat + entertainment', one('Chia đều hóa đơn 3 người'), { luna: lunaIntent('chat', ['entertainment']) }],
]
const NO_TOOL: Array<[string, Msg[], TurnOpts]> = [
  ['pick + food', one('cho mình quán cơm tấm'), { luna: lunaIntent('pick', ['food'], { query: 'cơm tấm' }), gps: GPS_HN }],
  ['pick + shopping', one('mua tai nghe'), { luna: lunaIntent('pick', ['shopping'], { query: 'tai nghe' }) }],
]

describe('W4 — flag ON: a lean consult turn that carries tools is offered calculate, and only that is added', () => {
  for (const [name, msgs, o] of LEAN) {
    it(`${name}: the tool list is the previous list plus calculate; the rule line and the description reach the model only now`, async () => {
      const on = await turn(msgs, { ...o, math: '1', reply: 'ok' })
      const off = await turn(msgs, { ...o, math: undefined, reply: 'ok' })
      expect(off.toolNames.length).toBeGreaterThan(0) // non-vacuous: the OFF turn carries tools
      expect(off.toolNames).not.toContain('calculate')
      expect([...on.toolNames].sort()).toEqual([...new Set([...off.toolNames, 'calculate'])].sort())
      expect(on.calcDescription).toBe(CALCULATE_DESCRIPTION)
      expect(on.system).toContain(JSON_ESC(MATH_TOOL_RULE))
      expect(off.system).not.toContain(JSON_ESC(MATH_TOOL_RULE))
    }, 60000)
  }
  it('the rule line is general: no quoted example, no keyword list, no example sentence', () => {
    expect(MATH_TOOL_RULE).not.toMatch(/[“"'‘’”]/)
    expect(MATH_TOOL_RULE.toLowerCase()).not.toMatch(/vd:|vi du|ví dụ/)
    expect(MATH_TOOL_RULE).toContain('calculate')
  })
})

describe('W4 — M7 (non-vacuous): turns that are not lean consult turns, or carry no tools, are untouched', () => {
  it('Luna names no area: the full (non-lean) tool list and prompt are identical with the flag ON, and calculate does not exist there', async () => {
    const msgs = one('Chào bạn, hôm nay bạn thế nào')
    const o: TurnOpts = { luna: lunaIntent('chat', []), reply: 'ok' }
    const on = await turn(msgs, { ...o, math: '1' })
    const off = await turn(msgs, { ...o, math: undefined })
    expect(off.toolNames.length).toBeGreaterThan(3)
    expect(on.toolNames).toEqual(off.toolNames)
    expect(on.toolNames).not.toContain('calculate')
    expect(on.system).toBe(off.system)
  }, 60000)
  for (const [name, msgs, o] of NO_TOOL) {
    it(`${name}: answered after the code's pre-search with no tool definitions: tools and prompt equal the previous ones`, async () => {
      const on = await turn(msgs, { ...o, math: '1', reply: 'ok' })
      const off = await turn(msgs, { ...o, math: undefined, reply: 'ok' })
      expect(on.toolNames).toEqual(off.toolNames)
      expect(on.toolNames).not.toContain('calculate')
    }, 60000)
  }
})

describe('W4 — the model calls calculate', () => {
  const LOAN_Q = one('Mỗi tháng trả góp bao nhiêu nếu vay 300 triệu 10 năm, lãi 1%/tháng')
  const LOAN: TurnOpts = { luna: lunaIntent('chat', ['food']), math: '1' }
  const EXPR = 'pmt(0.01, 120, 300000000)'
  const vnd = (s: string) => Number(s).toLocaleString('vi-VN')

  it('the result is the independent value (closed form), the turn goes on, and no network / place / web lookup runs', async () => {
    const closed = (300_000_000 * 0.01) / (1 - Math.pow(1.01, -120))
    const r = await turn(LOAN_Q, { ...LOAN, tool: { name: 'calculate', args: { expression: EXPR } }, reply: 'Xong.' })
    expect(r.toolResult?.ok).toBe(true)
    expect(Math.abs(Number(r.toolResult?.value) - closed) / closed).toBeLessThan(1e-12)
    expect(r.toolResult?.rounded).toBe(String(Math.round(Number(r.toolResult?.value))))
    expect(r.toolResult?._tappy_calc).toBe(true)
    expect(r.toolResult?.inputs).toEqual(['0.01', '120', '300000000'])
    expect(r.web).toEqual([])
    expect(r.maps).toEqual([])
    expect(r.text).toBe('Xong.')
  }, 60000)

  it('a refusal comes back as a typed result and the turn still completes', async () => {
    for (const expression of ['1 / 0', 'process.exit(1)', 'pmt(1, 2)', '']) {
      const r = await turn(LOAN_Q, { ...LOAN, tool: { name: 'calculate', args: { expression } }, reply: 'Mình chưa tính được.' })
      expect(r.toolResult?.ok, expression).toBe(false)
      expect(typeof r.toolResult?.error).toBe('string')
      expect(r.text).toBe('Mình chưa tính được.')
    }
  }, 60000)

  it('a money figure that comes from the calculator reaches the user in the final text', async () => {
    const value = calculate(EXPR)
    if (!value.ok) throw new Error('setup')
    const figure = `${vnd(value.rounded)}đ`
    const reply = `Mỗi tháng bạn trả khoảng **${figure}** (vay 300 triệu, lãi 1%/tháng, 120 tháng).`
    const PLACES: ScriptedCall = { name: 'search_places', args: { query: 'quán', type: 'restaurant' } }
    // control (the guard is live in this harness): a turn that LOOKED something up and states a figure no tool result backs loses the figure
    const control = await turn(LOAN_Q, { ...LOAN, gps: GPS_HN, tools: [PLACES], reply })
    expect(control.text).not.toContain(figure)
    // the same turn where the model also asked the calculator for exactly that figure keeps it
    const r = await turn(LOAN_Q, { ...LOAN, gps: GPS_HN, tools: [PLACES, { name: 'calculate', args: { expression: EXPR } }], reply })
    expect(r.results.calculate?.rounded).toBe(value.rounded)
    expect(r.text).toContain(figure)
    // a figure the calculator did NOT produce is still cut (the calculator makes its own number evidence, not everyone's)
    // (the snippet-price boundary keeps its own rounding tolerance of max(ROUNDING %, 1000 đ): a figure far from every calculator output is what must go)
    const wrong = `${vnd(String(Math.round(Number(value.rounded) * 1.5)))}đ`
    const r2 = await turn(LOAN_Q, { ...LOAN, gps: GPS_HN, tools: [PLACES, { name: 'calculate', args: { expression: EXPR } }], reply: `Mỗi tháng bạn trả khoảng **${wrong}**.` })
    expect(r2.text).not.toContain(wrong)
  }, 60000)
})

describe('W4 — a shopping turn: the sum of listed prices the model asked the calculator for', () => {
  const Q = one('So sánh giá 2 chiếc tai nghe ABC không dây') // (a count written in words - "hai chiếc" - is not a digit the calculator can be grounded on: a documented limit)
  const O: TurnOpts = { luna: lunaIntent('chat', ['shopping']), math: '1' }
  const SEARCH: ScriptedCall = { name: 'search_products', args: { query: 'tai nghe ABC' } }
  const reply = 'Một chiếc giá **890.000đ**, hai chiếc tổng cộng **1.780.000đ**.'
  it('the listed price stays; the total is cut without the calculator (the structured-price guard is live) and kept with it', async () => {
    const control = await turn(Q, { ...O, tools: [SEARCH], reply })
    expect(control.text).toContain('890.000đ')
    expect(control.text).not.toContain('1.780.000đ')
    const withCalc = await turn(Q, { ...O, tools: [SEARCH, { name: 'calculate', args: { expression: '890000 * 2' } }], reply })
    expect(withCalc.results.calculate?.rounded).toBe('1780000')
    expect(withCalc.text).toContain('890.000đ')
    expect(withCalc.text).toContain('1.780.000đ')
  }, 60000)
  it('a total the calculator did not produce is still cut, with the calculator in the tool set', async () => {
    const r = await turn(Q, { ...O, tools: [SEARCH, { name: 'calculate', args: { expression: '890000 * 2' } }], reply: 'Một chiếc giá **890.000đ**, hai chiếc tổng cộng **2.500.000đ**.' })
    expect(r.text).toContain('890.000đ')
    expect(r.text).not.toContain('2.500.000đ')
  }, 60000)
  it('a rounded form of the calculator result ("1,8 triệu") is kept too; a far-off one is not', async () => {
    const near = await turn(Q, { ...O, tools: [SEARCH, { name: 'calculate', args: { expression: '890000 * 2' } }], reply: 'Một chiếc giá **890.000đ**, hai chiếc khoảng **1,78 triệu**.' })
    expect(near.text).toContain('1,78 triệu')
    const far = await turn(Q, { ...O, tools: [SEARCH, { name: 'calculate', args: { expression: '890000 * 2' } }], reply: 'Một chiếc giá **890.000đ**, hai chiếc khoảng **1,5 triệu**.' })
    expect(far.text).not.toContain('1,5 triệu')
  }, 60000)
  it('a refused expression produces no evidence: the total is cut as before', async () => {
    const r = await turn(Q, { ...O, tools: [SEARCH, { name: 'calculate', args: { expression: '890000 * ' } }], reply })
    expect(r.results.calculate?.ok).toBe(false)
    expect(r.text).not.toContain('1.780.000đ')
  }, 60000)
})

describe('W4 — a travel turn: the trip-cost arithmetic the model asked the calculator for', () => {
  const Q = one('Đi Đà Lạt 3 đêm khách sạn 1,2 triệu một đêm cộng vé xe 1,6 triệu, chia cho 4 người, hết bao nhiêu')
  const O: TurnOpts = { luna: lunaIntent('chat', ['travel']), math: '1', gps: GPS_HN }
  const reply = 'Tổng chi phí khoảng **5.200.000đ** cho cả chuyến.'
  it('without the calculator the fail-closed travel guard cuts the total; with the user\'s own numbers in the calculator it stays', async () => {
    const control = await turn(Q, { ...O, reply })
    expect(control.text).not.toContain('5.200.000đ')
    const withCalc = await turn(Q, { ...O, tools: [{ name: 'calculate', args: { expression: '1200000 * 3 + 1600000' } }], reply })
    expect(withCalc.results.calculate?.rounded).toBe('5200000')
    expect(withCalc.text).toContain('5.200.000đ')
  }, 60000)
  it('GROUNDING: a calculation over an amount nobody stated (not the user, not a tool result) is not evidence - the total is cut', async () => {
    const r = await turn(Q, { ...O, tools: [{ name: 'calculate', args: { expression: '1500000 * 3 + 1600000' } }], reply: 'Tổng chi phí khoảng **6.100.000đ** cho cả chuyến.' })
    expect(r.results.calculate?.rounded).toBe('6100000') // the calculator computed it faithfully ...
    expect(r.text).not.toContain('6.100.000đ')           // ... but the input 1.500.000 was invented, so the figure is not backed
  }, 60000)
  it('the count the user wrote ("chia cho 4 người") is a number of the turn: the share is kept', async () => {
    const r = await turn(Q, { ...O, tools: [{ name: 'calculate', args: { expression: '(1200000 * 3 + 1600000) / 4' } }], reply: 'Chia 4 người, mỗi người khoảng **1.300.000đ**.' })
    expect(r.text).toContain('1.300.000đ')
  }, 60000)
  it('a calculation chained on an earlier calculator result of the turn is grounded through it', async () => {
    const r = await turn(Q, { ...O, tools: [{ name: 'calculate', args: { expression: '1200000 * 3' } }, { name: 'calculate', args: { expression: '3600000 + 1600000' } }], reply })
    expect(r.text).toContain('5.200.000đ')
  }, 60000)
})

// Wave 3-FIX R3-01: the attacks of the independent review (small numbers scaled by powers of ten, pow(10, 7), a phone number as a base, a made-up shopping price) are cut; honest calculations are kept
describe('W4 — R3-01 grounding by value, at route level', () => {
  const TRIP = one('Đi Đà Lạt 3 đêm, khách sạn 1,2 triệu một đêm, vé xe 1,6 triệu, hết bao nhiêu')
  const O: TurnOpts = { luna: lunaIntent('chat', ['travel']), math: '1', gps: GPS_HN }
  const calc = (expression: string): ScriptedCall => ({ name: 'calculate', args: { expression } })
  const kept = async (msgs: Msg[], expression: string, reply: string, needle: string, extra: Partial<TurnOpts> = {}) => {
    const r = await turn(msgs, { ...O, ...extra, tools: [...(extra.tools ?? []), calc(expression)], reply })
    expect(r.results.calculate?.ok, expression).toBe(true) // the calculator itself always answers faithfully
    return r.text.includes(needle)
  }

  it('B · 1500 * 1000 * 3 + 1600 * 1000 builds 6.100.000đ from small numbers: the total and the invented hotel price are cut; the honest spelling of the user\'s own numbers is kept', async () => {
    expect(await kept(TRIP, '1500 * 1000 * 3 + 1600 * 1000', 'Tổng chi phí khoảng **6.100.000đ**, khách sạn **1.500.000đ**/đêm.', '6.100.000đ')).toBe(false)
    expect(await kept(TRIP, '1.5 * 1000000 * 3 + 1.6 * 1000000', 'Tổng chi phí khoảng **6.100.000đ**.', '6.100.000đ')).toBe(false) // 1,5 triệu was never said
    expect(await kept(TRIP, '1.2 * 1000000 * 3 + 1.6 * 1000000', 'Tổng chi phí khoảng **5.200.000đ**.', '5.200.000đ')).toBe(true)
    expect(await kept(TRIP, '1200 * 1000 * 3 + 1600 * 1000', 'Tổng chi phí khoảng **5.200.000đ**.', '5.200.000đ')).toBe(true)
  }, 120000)
  it('C · pow(10, 7) and other powers of ten prove nothing', async () => {
    for (const e of ['pow(10, 7)', '10 * 1000000', '10 ^ 7']) expect(await kept(TRIP, e, 'Chi phí khoảng **10.000.000đ**.', '10.000.000đ'), e).toBe(false)
  }, 120000)
  it('E · a phone number the user typed is not a base for a figure', async () => {
    const msgs = one('Đi Đà Lạt 3 đêm khách sạn 1,2 triệu, số mình là 0901234567')
    expect(await kept(msgs, '901234567 * 2', 'Chi phí khoảng **1.802.469.134đ**.', '1.802.469.134đ')).toBe(false)
    expect(await kept(msgs, '1200000 * 3', 'Chi phí khoảng **3.600.000đ**.', '3.600.000đ')).toBe(true)
  }, 120000)
  it('J · a made-up price for a named product (990 * 1000) next to a real listing is cut; the listing\'s own price multiplied by the user\'s count is kept', async () => {
    const msgs = one('So sánh giá 2 chiếc tai nghe ABC không dây')
    const o: Partial<TurnOpts> = { luna: lunaIntent('chat', ['shopping']), gps: undefined, tools: [{ name: 'search_products', args: { query: 'tai nghe ABC' } }] }
    expect(await kept(msgs, '990 * 1000', 'Chiếc ABC giá **990.000đ**.', '990.000đ', o)).toBe(false)
    expect(await kept(msgs, '890000 * 2', 'Hai chiếc tổng cộng **1.780.000đ**.', '1.780.000đ', o)).toBe(true)
  }, 120000)
  // On a shopping turn that LOOKED at a listing the structured-price guard is live: the same sentence without the calculator is cut (the control), so "kept" below is a real result, not a guard that never ran.
  const SHOP = { luna: lunaIntent('chat', ['shopping']), gps: undefined, tools: [{ name: 'search_products', args: { query: 'tai nghe ABC' } }] } as Partial<TurnOpts>
  const honest = async (msg: string, expression: string, reply: string, needle: string) => {
    const control = await turn(one(msg), { ...O, ...SHOP, tools: SHOP.tools, reply })
    expect(control.text, `control (no calculator): ${needle}`).not.toContain(needle)
    return kept(one(msg), expression, reply, needle, SHOP)
  }
  it('honest cases are kept: 200k a person for 5 people, a bill split, an instalment with the rate the user gave, a conversion', async () => {
    expect(await honest('Mua quà 200k một người, nhóm 5 người, hết bao nhiêu', '200 * 1000 * 5', 'Cả nhóm khoảng **1.000.000đ**.', '1.000.000đ')).toBe(true)
    expect(await honest('Hóa đơn 1.250.000 chia cho 4 người, mỗi người bao nhiêu', '1250000 / 4', 'Mỗi người **312.500đ**.', '312.500đ')).toBe(true)
    expect(await honest('Mua máy 300 triệu trả góp 10 năm, lãi 1%/tháng, mỗi tháng bao nhiêu', 'pmt(0.01, 10 * 12, 300 * 1000000)', 'Mỗi tháng khoảng **4.304.128đ**.', '4.304.128đ')).toBe(true)
    expect(await honest('Đổi 100 USD sang đồng, tỷ giá 25000', '100 * 25000', '100 USD khoảng **2.500.000đ**.', '2.500.000đ')).toBe(true)
  }, 180000)
  it('an invented rate is not the user\'s: the same instalment with 7 % a month is cut, the user\'s 1 % kept', async () => {
    const msg = 'Mua máy 300 triệu trả góp 10 năm, lãi 1%/tháng, mỗi tháng bao nhiêu'
    expect(await kept(one(msg), 'pmt(0.07, 120, 300000000)', 'Mỗi tháng khoảng **21.000.000đ**.', '21.000.000đ', SHOP)).toBe(false)
    expect(await kept(one(msg), 'pmt(0.01, 120, 300000000)', 'Mỗi tháng khoảng **4.304.128đ**.', '4.304.128đ', SHOP)).toBe(true)
  }, 120000)
})

describe('W4 — OFF is the previous behaviour, byte for byte', () => {
  const O: TurnOpts = { luna: lunaIntent('more', ['food']), gps: GPS_HN, reply: 'ok' }
  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    it(`value ${JSON.stringify(v)}: same tools, description and prompt as unset; a scripted calculate call does not run`, async () => {
      const base = await turn(MORE, { ...O, math: undefined })
      const x = await turn(MORE, { ...O, math: v, tool: { name: 'calculate', args: { expression: '1 + 1' } } })
      expect(x.toolNames).toEqual(base.toolNames)
      expect(x.toolNames).toEqual(['search_places'])
      expect(x.system).toBe(base.system)
      expect(x.toolResult).toBeNull()
    }, 60000)
  }
  it('a production runtime reads it as OFF even when it is "1"', async () => {
    const base = await turn(MORE, { ...O, math: undefined, vercelEnv: 'production' })
    const x = await turn(MORE, { ...O, math: '1', vercelEnv: 'production' })
    expect(x.toolNames).toEqual(base.toolNames)
    expect(x.system).toBe(base.system)
  }, 60000)
})
