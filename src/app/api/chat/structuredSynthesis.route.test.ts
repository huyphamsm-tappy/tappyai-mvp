/**
 * Wave 3 · W3 — CONSULT_STRUCTURED_SYNTHESIS at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network, no key, no cost).
 * Claims (flag = CONSULT_STRUCTURED_SYNTHESIS; only the exact value "1"; never in a production runtime; needs no other flag):
 *   · ON: the shape block reaches the model on a lean consult turn, last; the output ceiling of a turn that had 600 / 2048 becomes 3.500 (under the hard 4.000); nothing else about the tools or steps changes;
 *   · ON: a turn that is not a lean consult turn is untouched (no block, same ceiling);
 *   · ON: a long, sectioned answer with a table and dated sources survives the post-processing that used to cut a consult answer to a short pick (sentence cap), while the evidence guards still cut an unbacked figure;
 *   · ON: a one-decision pick keeps its "Mình chọn" line;
 *   · OFF (unset, "0", "true", " 1", "1 ", "on", or a production runtime): byte-for-byte the previous behaviour.
 * The messages are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { STRUCTURED_SYNTHESIS_RULE, STRUCTURED_MAX_TOKENS } from '@/lib/ai/consultative/leanConsultPrompt'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    maps: [] as Array<{ q: string; ll: unknown }>,
    calls: [] as Call[],
    luna: null as null | Record<string, unknown>,
    toolNames: [] as string[],
    maxTokens: 0,
    maxSteps: 0,
    system: '' as string,
    text: 'ok',
    userId: 'u-structured-synthesis',
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
  serperPlaces: async (q: string, ll?: { lat: number; lng: number } | null) => {
    h.state.maps.push({ q, ll: ll ?? null })
    return ll ? [{ title: 'Cà phê Mây', address: 'Cà phê Mây', rating: 4.5, ratingCount: 300, placeId: 'p1', latitude: ll.lat + 0.001, longitude: ll.lng + 0.001 }, { title: 'Trà Núi', address: 'Trà Núi', rating: 4.3, ratingCount: 120, placeId: 'p2', latitude: ll.lat + 0.002, longitude: ll.lng + 0.002 }] : []
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
      h.state.maxTokens = Number(opts.maxTokens ?? 0)
      h.state.maxSteps = Number(opts.maxSteps ?? 0)
      try { h.state.system = JSON.stringify({ system: opts.system }) } catch { h.state.system = '' }
      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            for (const call of h.state.calls) {
              if (!opts.tools?.[call.toolName]) continue
              c.enqueue(enc.encode(`9:${JSON.stringify(call)}\n`))
              const result = await opts.tools[call.toolName].execute(call.args, { toolCallId: call.toolCallId, messages: [] })
              c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}\n`))
            }
            if (h.state.text) c.enqueue(enc.encode(`0:${JSON.stringify(h.state.text)}\n`))
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: h.state.text, steps: [] }) } catch { /* the mock must not fail a turn */ }
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
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'hard', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})
const one = (u: string): Msg[] => [{ role: 'user', content: u }]
interface TurnOpts { synth?: string; vercelEnv?: string; luna?: Record<string, unknown> | null; tools?: Array<{ name: string; args: Record<string, unknown> }>; gps?: unknown; reply?: string }

async function turn(messages: Msg[], o: TurnOpts = {}) {
  delete process.env.TAPPY_AGENT
  const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  set('CONSULT_STRUCTURED_SYNTHESIS', o.synth); set('VERCEL_ENV', o.vercelEnv)
  for (const k of ['CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_CAPABILITY_LEVEL']) delete process.env[k] // this file pins W3 alone
  h.state.calls = (o.tools ?? []).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.name, args: t.args }))
  h.state.text = o.reply ?? 'Đây là câu trả lời.'
  h.state.luna = o.luna ?? null
  h.state.toolNames = []; h.state.maxTokens = 0; h.state.maxSteps = 0; h.state.system = ''; h.state.maps = []
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
  return { raw, text, toolNames: [...h.state.toolNames], maxTokens: h.state.maxTokens, maxSteps: h.state.maxSteps, system: h.state.system, lines }
}

beforeEach(() => {
  // The system prompt carries the clock ("lúc 10:09 …"): two turns a minute apart differ in that line alone, and these tests compare prompts byte for byte. Only Date is faked.
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:09:00Z'))
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { vi.useRealTimers(); for (const k of ['TAPPY_AGENT', 'CONSULT_STRUCTURED_SYNTHESIS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'VERCEL_ENV']) delete process.env[k]; vi.unstubAllGlobals() })

const JSON_ESC = (s: string) => JSON.stringify(s).slice(1, -1)
const MORE: Msg[] = [{ role: 'user', content: 'quán cà phê' }, { role: 'assistant', content: 'Mình chọn: Cà phê Mây.' }, { role: 'user', content: 'còn quán nào nữa' }]
const MULTI = one('So sánh hai quán cà phê gần đây về giá, giờ mở cửa và chỗ ngồi yên tĩnh để làm việc, rồi nói nên chọn quán nào')
const PLACES = { name: 'search_places', args: { query: 'cà phê', type: 'cafe' } }

// a long answer in the requested shape: conclusion, one section per part, a table, dated sources, what is unverified, next step (all numbers are the user's or absent)
const STRUCTURED = [
  'Tóm lại: **Cà phê Mây** hợp nhất để làm việc, **Trà Núi** hợp nếu bạn ưu tiên yên tĩnh.',
  '',
  '## Giá',
  'Cả hai quán chưa có bảng giá mình đọc được, nên giá chưa xác minh.',
  '',
  '## Giờ mở cửa',
  'Cả hai chưa có giờ mở cửa xác minh; bạn gọi trước khi đi.',
  '',
  '## Chỗ ngồi yên tĩnh',
  'Cà phê Mây có nhiều đánh giá hơn nên chỗ ngồi dễ đoán hơn. Trà Núi ít đánh giá hơn nên mình chưa chắc.',
  '',
  '| Quán | Giá | Giờ mở cửa | Yên tĩnh |',
  '|---|---|---|---|',
  '| Cà phê Mây | chưa xác minh | chưa xác minh | khá (nhiều đánh giá) |',
  '| Trà Núi | chưa xác minh | chưa xác minh | chưa xác minh |',
  '',
  '## Chưa xác minh',
  'Giá, giờ mở cửa và độ ồn thực tế chưa có nguồn. Nguồn dùng: Google Maps (đánh giá), lấy ngày hôm nay.',
  '',
  '## Bước tiếp theo',
  'Gọi cả hai quán hỏi giờ và giá, rồi chọn.',
].join('\n')
const SENTENCES = (t: string) => t.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 12).length

describe('W3 — flag ON: the shape block, the output ceiling', () => {
  for (const [name, msgs, o] of [
    ['chat + food (no tool turn or tool turn)', MULTI, { luna: lunaIntent('chat', ['food']), gps: GPS_HN }],
    ['more + food (several parts: Luna says hard)', MORE, { luna: lunaIntent('more', ['food'], { difficulty: 'hard' }), gps: GPS_HN }],
  ] as Array<[string, Msg[], TurnOpts]>) {
    it(`${name}: the block is in the prompt only now, the ceiling is ${STRUCTURED_MAX_TOKENS} (under the hard 4.000), tools and steps are unchanged`, async () => {
      const on = await turn(msgs, { ...o, synth: '1', reply: 'ok' })
      const off = await turn(msgs, { ...o, synth: undefined, reply: 'ok' })
      expect(STRUCTURED_MAX_TOKENS).toBeLessThanOrEqual(4000)
      expect(off.maxTokens).toBeLessThan(STRUCTURED_MAX_TOKENS)
      expect(on.maxTokens).toBe(STRUCTURED_MAX_TOKENS)
      expect(on.system).toContain(JSON_ESC(STRUCTURED_SYNTHESIS_RULE))
      expect(off.system).not.toContain(JSON_ESC(STRUCTURED_SYNTHESIS_RULE))
      expect(on.toolNames).toEqual(off.toolNames)
      expect(on.maxSteps).toBe(off.maxSteps)
    }, 60000)
  }
  it('the block is the LAST thing before the reminder: nothing of the frame comes after it', async () => {
    const on = await turn(MULTI, { luna: lunaIntent('chat', ['food']), gps: GPS_HN, synth: '1', reply: 'ok' })
    const at = on.system.indexOf(JSON_ESC(STRUCTURED_SYNTHESIS_RULE))
    expect(at).toBeGreaterThan(0)
    const after = on.system.slice(at + JSON_ESC(STRUCTURED_SYNTHESIS_RULE).length)
    expect(after.length).toBeLessThan(200) // only the language reminder follows
    expect(after).toContain('REMINDER')
  }, 60000)
  it('the rule counts parts by itself: it carries no keyword, no list of words and keeps the one-decision form', () => {
    expect(STRUCTURED_SYNTHESIS_RULE).toContain('Mình chọn')
    expect(STRUCTURED_SYNTHESIS_RULE).toContain('BANG')
    expect(STRUCTURED_SYNTHESIS_RULE).toContain('chua xac minh')
    expect(STRUCTURED_SYNTHESIS_RULE.toLowerCase()).not.toMatch(/vd:|vi du|ví dụ/)
  })
})

describe('W3 — M7 (non-vacuous): a turn that is not a lean consult turn is untouched', () => {
  it('Luna names no area: the prompt and the ceiling are the previous ones', async () => {
    const o: TurnOpts = { luna: lunaIntent('chat', []), reply: 'ok' }
    const on = await turn(one('Chào bạn, hôm nay bạn thế nào'), { ...o, synth: '1' })
    const off = await turn(one('Chào bạn, hôm nay bạn thế nào'), { ...o, synth: undefined })
    expect(off.maxTokens).toBeGreaterThan(0)
    expect(on.maxTokens).toBe(off.maxTokens)
    expect(on.system).toBe(off.system)
    expect(on.system).not.toContain(JSON_ESC(STRUCTURED_SYNTHESIS_RULE))
  }, 60000)
})

describe('W3 — OFF is the previous behaviour, byte for byte', () => {
  const O: TurnOpts = { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply: STRUCTURED }
  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    it(`value ${JSON.stringify(v)}: same prompt, ceiling, steps and final text as unset`, async () => {
      const base = await turn(MULTI, { ...O, synth: undefined })
      const x = await turn(MULTI, { ...O, synth: v })
      expect(x.system).toBe(base.system)
      expect(x.maxTokens).toBe(base.maxTokens)
      expect(x.maxSteps).toBe(base.maxSteps)
      expect(x.text).toBe(base.text)
      expect(x.system).not.toContain(JSON_ESC(STRUCTURED_SYNTHESIS_RULE))
    }, 60000)
  }
  it('a production runtime reads it as OFF even when it is "1"', async () => {
    const base = await turn(MULTI, { ...O, synth: undefined, vercelEnv: 'production' })
    const x = await turn(MULTI, { ...O, synth: '1', vercelEnv: 'production' })
    expect(x.system).toBe(base.system)
    expect(x.maxTokens).toBe(base.maxTokens)
    expect(x.text).toBe(base.text)
  }, 60000)
})

describe('W3 — a long sectioned answer reaches the user', () => {
  it('OFF: the old post-processing cuts the answer down (this is the measured defect); ON: the sections, the table and the sources stay', async () => {
    const o: TurnOpts = { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply: STRUCTURED }
    const off = await turn(MULTI, { ...o, synth: undefined })
    const on = await turn(MULTI, { ...o, synth: '1' })
    // OFF = the measured defect: the sentence cap, the hedge merge and the line tidy leave headings with nothing under them and a table without its header
    expect(off.text).not.toContain('| Quán | Giá | Giờ mở cửa | Yên tĩnh |')
    expect(off.text).not.toContain('|---|---|---|---|')
    expect(SENTENCES(off.text)).toBeLessThan(SENTENCES(STRUCTURED) - 4)
    // ON: every section, the whole table (header and rule included), the sources and the next step stay
    for (const part of ['Tóm lại:', '## Giá', '## Giờ mở cửa', '## Chỗ ngồi yên tĩnh', '| Quán | Giá | Giờ mở cửa | Yên tĩnh |', '|---|---|---|---|', '| Cà phê Mây | chưa xác minh |', '| Trà Núi | chưa xác minh |', 'Cả hai quán chưa có bảng giá mình đọc được, nên giá chưa xác minh.', 'Cả hai chưa có giờ mở cửa xác minh; bạn gọi trước khi đi.', '## Chưa xác minh', 'Nguồn dùng: Google Maps (đánh giá), lấy ngày hôm nay', '## Bước tiếp theo', 'Gọi cả hai quán hỏi giờ và giá']) expect(on.text, part).toContain(part)
    expect(SENTENCES(on.text)).toBeGreaterThanOrEqual(SENTENCES(STRUCTURED) - 2)
  }, 60000)

  it('the evidence guards still cut an unbacked figure inside a structured answer', async () => {
    const withMoney = STRUCTURED.replace('chưa có bảng giá mình đọc được, nên giá chưa xác minh.', 'có giá cà phê sữa **45.000đ** mỗi ly.')
    const on = await turn(MULTI, { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply: withMoney, synth: '1' })
    expect(on.text).not.toContain('45.000đ')
    expect(on.text).toContain('## Giá')
    expect(on.text).toContain('| Cà phê Mây | chưa xác minh |') // the rest of the structure is intact
  }, 60000)

  it('the atmosphere guard stays honest: a LABEL (heading, table header) naming a part of the request is kept, a claim about a named venue with no evidence is still removed', async () => {
    const reply = STRUCTURED.replace('Cà phê Mây có nhiều đánh giá hơn nên chỗ ngồi dễ đoán hơn.', 'Cà phê Mây có sân vườn yên tĩnh.')
    const on = await turn(MULTI, { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply, synth: '1' })
    const off = await turn(MULTI, { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply, synth: undefined })
    expect(on.text).toContain('## Chỗ ngồi yên tĩnh')                      // a label: kept with the flag
    expect(on.text).toContain('| Quán | Giá | Giờ mở cửa | Yên tĩnh |')
    expect(off.text).not.toContain('## Chỗ ngồi yên tĩnh')                 // the older lexical guard took the label for a claim (the measured side effect)
    expect(on.text).not.toContain('sân vườn yên tĩnh')                    // the claim about the venue: removed, flag or not
    expect(off.text).not.toContain('sân vườn yên tĩnh')
  }, 60000)

  // Wave 3-FIX R3-03: the post-processing steps aside for an answer that IS sectioned (checked on the text), not for every turn that ran with the flag on.
  // the sectioned reply flattened to prose: no heading, no table row - the sentence cap of the ordinary path does cut it
  const LONG_PLAIN = STRUCTURED.split('\n').filter(l => !/^\s*(#|\|)/.test(l)).join('\n')
  it('a simple pick (Luna: easy) with a long plain answer is post-processed exactly as with the flag off', async () => {
    const o: TurnOpts = { luna: lunaIntent('chat', ['food'], { difficulty: 'easy' }), gps: GPS_HN, tools: [PLACES], reply: LONG_PLAIN }
    const off = await turn(one('Gợi ý cho mình một quán cà phê'), { ...o, synth: undefined })
    const on = await turn(one('Gợi ý cho mình một quán cà phê'), { ...o, synth: '1' })
    expect(on.text).toBe(off.text)
    expect(on.maxTokens).toBe(off.maxTokens)
    expect(SENTENCES(off.text)).toBeLessThan(SENTENCES(LONG_PLAIN)) // non-vacuous: the cap does cut this answer
  }, 60000)
  it('a multi-part turn whose answer came back as plain prose (no table, no headings) is also post-processed as with the flag off', async () => {
    const o: TurnOpts = { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply: LONG_PLAIN }
    const off = await turn(MULTI, { ...o, synth: undefined })
    const on = await turn(MULTI, { ...o, synth: '1' })
    expect(on.text).toBe(off.text)
  }, 60000)
  it('a heading that is a CLAIM about a venue (not a label of the request) is removed in a sectioned answer', async () => {
    const reply = STRUCTURED.replace('## Chỗ ngồi yên tĩnh', '## Mọi quán đều yên tĩnh, wifi miễn phí')
    const on = await turn(MULTI, { luna: lunaIntent('chat', ['food']), gps: GPS_HN, tools: [PLACES], reply, synth: '1' })
    expect(on.text).toContain('## Giá') // sectioned answer is kept
    expect(on.text).not.toContain('Mọi quán đều yên tĩnh')
  }, 60000)

  it('a one-decision pick keeps its "Mình chọn" line and is not turned into sections', async () => {
    const reply = 'Mình chọn: **Cà phê Mây** — gần bạn và nhiều đánh giá.'
    const on = await turn(one('Gợi ý cho mình một quán cà phê'), { luna: lunaIntent('pick', ['food'], { query: 'cà phê', difficulty: 'easy' }), gps: GPS_HN, tools: [], reply, synth: '1' })
    const off = await turn(one('Gợi ý cho mình một quán cà phê'), { luna: lunaIntent('pick', ['food'], { query: 'cà phê', difficulty: 'easy' }), gps: GPS_HN, tools: [], reply, synth: undefined })
    expect(on.text).toContain('Mình chọn')
    expect(on.text).toBe(off.text)
  }, 60000)
})
