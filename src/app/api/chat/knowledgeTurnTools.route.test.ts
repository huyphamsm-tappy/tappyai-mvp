/**
 * Wave 2I · B / Wave 2J (J1) — CONSULT_KNOWLEDGE_TURN_TOOLS at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network).
 * Measured (paid run 4, E10/E11): after the search-now gate (C) the code no longer pre-searches a place on a knowledge turn, but on the lean path (Luna domain "food") the model was
 * not given web_search at all. Wave 2J: the flag ONLY adds web_search (and one general tool line) to a turn the gate (C) blocked, and the model chooses. It does NOT touch the area
 * question: with the flag ON the area question behaves EXACTLY as with the gate alone (the earlier "drop the area question when the rules do not read a venue request" was removed:
 * review F4/F5).
 * Claims (flag = CONSULT_KNOWLEDGE_TURN_TOOLS, needs CONSULT_SEARCH_NOW_INTENT_GATE):
 *   · ON, turn blocked by the gate: web_search is offered next to search_places;
 *   · ON, turn NOT blocked (pick / ask / a stated place): the tool set is the gate-only tool set (no web_search is added);
 *   · ON: the area question, the tool result, the answer text and the place / web lookups are IDENTICAL to the gate alone, in every cell of a grid of short venue requests,
 *     food-knowledge questions and named-entity knowledge questions (the only differences allowed are the offered tool list, one prompt line and the trace labels);
 *   · OFF (unset, "0", "true", " 1"), or ON without the gate: the old behaviour.
 * The messages are written for this test; none comes from a benchmark question file. SAMPLE: the grid below is a convenience sample of {70 short venue requests, 15 food-knowledge
 * questions, 5 named-entity questions} x 5 intent-layer outcomes x 3 model scripts x GPS yes/no - it shows no difference in THAT sample and proves nothing about other sentences.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { AREA_ASK_VI } from '@/lib/ai/consultative/areaAsk'
import { KNOWLEDGE_TURN_TOOL_RULE } from '@/lib/ai/consultative/leanConsultPrompt'

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
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'CONSULT_TRACE_DIAGNOSTICS', 'VERCEL_ENV']) delete process.env[k]; vi.unstubAllGlobals() })

const KNOW_1 = 'Tiểu sử ngắn gọn của Nikola Tesla và các sáng chế chính.'
const outcome = (r: { traceEvents: Array<Record<string, any>> }) => r.traceEvents.find(e => e.ev === 'search_now_gate_outcome')

// ── the sample (data only): short venue requests, food-knowledge questions, named-entity knowledge questions ─────────────────────────────────
const VENUE_SHORT = [
  'quán gần chỗ này', 'đâu có bia hơi', 'tìm chỗ nhậu', 'quán phở ngon', 'cafe yên tĩnh để làm việc', 'chỗ nào ăn sáng', 'gợi ý quán nướng cho 4 người', 'spa thư giãn gần đây',
  'gần đây có gì ăn', 'có quán nào mở khuya không', 'đói quá ăn gì giờ', 'chỗ nào hát karaoke', 'tối nay đi đâu chơi', 'chỗ massage chân', 'lẩu ngon', 'bún chả', 'quán bia',
  'nhà hàng sang trọng', 'ăn gì bây giờ', 'chỗ ngồi học bài', 'cafe sách', 'quán nhậu bình dân', 'tìm quán ăn', 'có quán chay nào không', 'quán nào ngon gần đây', 'đi nhậu ở đâu',
  'rạp chiếu phim nào gần', 'bar nào vui', 'nơi nào chụp ảnh đẹp', 'tìm quán cà phê', 'ăn tối ở đâu', 'quán ốc', 'muốn ăn hải sản', 'chỗ gội đầu', 'nail ở đâu đẹp', 'trà sữa', 'buffet',
  'pizza', 'sushi ngon', 'quán ăn gia đình',
  'cho mình chỗ gội đầu dưỡng sinh', 'spa nào làm facial tốt', 'tiệm nail gần nhà', 'phòng gym nào rẻ', 'quán lẩu bò', 'bar rooftop', 'chỗ chơi bida', 'rạp nào chiếu phim tối nay',
  'karaoke gia đình', 'tiệm bánh ngon', 'quán cà phê có view', 'nhà hàng chay', 'chỗ ăn vặt', 'quán bún bò', 'cửa hàng điện thoại gần đây', 'tiệm sửa xe', 'massage đá nóng',
  'quán nướng ngoài trời', 'chỗ tổ chức sinh nhật', 'tìm nhà sách', 'tiệm tóc nam', 'quán cơm tấm', 'chỗ chơi bowling', 'quán chè', 'tìm tiệm vàng', 'quán nước mía', 'chỗ câu cá giải trí',
  'quán lẩu dê', 'phòng xông hơi', 'chỗ ăn đêm',
]
const KNOW_FOOD = [
  'Cách nấu nước dùng phở bò ngon', 'Phở có nguồn gốc từ đâu', 'lẩu thái nấu thế nào', 'nên ăn gì khi bị cảm', 'tại sao người Việt thích ăn phở', 'karaoke có nguồn gốc từ nước nào',
  'massage có tốt cho lưng không', 'pizza Ý khác pizza Mỹ thế nào', 'sushi làm từ gì', 'bia hơi là gì', 'cà phê có hại không', 'trà sữa có bao nhiêu calo', 'bún chả có từ khi nào',
  'cơm tấm làm từ loại gạo nào', 'ăn chay có đủ đạm không',
]
const KNOW_NAMED = ['Nikola Tesla là ai', 'Marie Curie đã nhận giải Nobel nào', 'Hồ Chí Minh sinh năm nào', 'Albert Einstein đóng góp gì', 'Nguyễn Nhật Ánh viết những tác phẩm nào']
const LUNAS: Array<[string, Record<string, unknown> | null]> = [
  ['chatFood', CHAT_FOOD], ['chatNone', lunaIntent('chat', [])], ['chatEnt', lunaIntent('chat', ['entertainment'])], ['pickFood', lunaIntent('pick', ['food'], { query: 'quán' })], ['lunaError', null],
]
const SCRIPTS: Array<[string, TurnOpts['tool']]> = [['noTool', null], ['placesNoLocation', { query: 'quán' }], ['webSearch', { name: 'web_search', query: 'thông tin' }]]

/** The fields that must not move when the flag is switched ON on top of the gate. The offered tool list and one prompt line may differ (see below). */
const sameAsGateOnly = (on: Awaited<ReturnType<typeof turn>>, c: Awaited<ReturnType<typeof turn>>, script: string) => {
  const diffs: string[] = []
  if (on.asks !== c.asks) diffs.push(`asks ${c.asks}->${on.asks}`)
  if (on.text !== c.text) diffs.push('text')
  if (on.refused !== c.refused) diffs.push('refused')
  if (JSON.stringify(on.maps) !== JSON.stringify(c.maps)) diffs.push('maps')
  if (JSON.stringify(on.toolResult) !== JSON.stringify(c.toolResult) && script !== 'webSearch') diffs.push('toolResult')
  if (script !== 'webSearch' && JSON.stringify(on.web) !== JSON.stringify(c.web)) diffs.push('web')
  const extra = on.toolNames.filter(t => !c.toolNames.includes(t))
  if (extra.some(t => t !== 'web_search') || c.toolNames.some(t => !on.toolNames.includes(t))) diffs.push(`tools ${c.toolNames.join(',')}->${on.toolNames.join(',')}`)
  return diffs
}

describe('B (Wave 2J) — flag ON: a turn the gate blocked is offered web_search', () => {
  it('E10/E11-shaped (Luna chat + food, no GPS, the model looks a place up and has no location): web_search is offered next to search_places', async () => {
    const on = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    expect(on.consultTurn).toBe('chat')
    expect(on.toolNames).toContain('web_search')
    expect(on.toolNames).toContain('search_places')
  }, 60000)

  it('the same turn with the gate alone: no web_search on the lean path (the run-4 state)', async () => {
    const c = await turn(one(KNOW_1), { gate: '1', know: undefined, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    expect(c.toolNames).not.toContain('web_search')
  }, 60000)

  it('the model calls web_search itself: it runs once and no place lookup runs', async () => {
    const on = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { name: 'web_search', query: 'tiểu sử nhà phát minh' }, reply: 'Có nguồn.' })
    expect(on.web.length).toBe(1)
    expect(on.maps).toEqual([])
  }, 60000)

  it('the one general tool line reaches the model only with the flag ON; it names no keyword, no example and does not talk about the area question', async () => {
    const on = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, reply: 'x' })
    const off = await turn(one(KNOW_1), { gate: '1', know: undefined, luna: CHAT_FOOD, reply: 'x' })
    expect(on.system.length).toBeGreaterThan(off.system.length)
    expect(on.system).toContain(JSON.stringify(KNOWLEDGE_TURN_TOOL_RULE).slice(1, -1))
    expect(off.system).not.toContain(JSON.stringify(KNOWLEDGE_TURN_TOOL_RULE).slice(1, -1))
    expect(KNOWLEDGE_TURN_TOOL_RULE).toContain('web_search')
    expect(KNOWLEDGE_TURN_TOOL_RULE.toLowerCase()).not.toMatch(/khu vuc|khu vực|he thong|hệ thống/) // the Wave 2I sentence about the system and the area question is gone
    expect(KNOWLEDGE_TURN_TOOL_RULE).not.toMatch(/[“"'‘’”(]/) // no quoted example, no keyword list: a general rule only
  }, 60000)
})

describe('B (Wave 2J) — M7: a turn the gate did NOT block gets no web_search from the flag', () => {
  const NOT_BLOCKED: Array<[string, Msg[], TurnOpts]> = [
    ['pick + food (lean path)', one('cho mình quán cơm tấm'), { luna: lunaIntent('pick', ['food'], { query: 'cơm tấm' }), gps: GPS_HN }],
    ['pick + food, no GPS', one('cho mình quán cơm tấm'), { luna: lunaIntent('pick', ['food'], { query: 'cơm tấm' }) }],
    ['a place stated by the user', one('quán cà phê yên tĩnh ở quận 3'), { luna: CHAT_FOOD }],
    ['Luna failed, the rules read a venue request', one('tìm quán phở bò ngon cho 2 người dưới 100k'), { luna: null, gps: GPS_HN }],
    ['followup', [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'quán đó mở mấy giờ' }], { luna: lunaIntent('followup', ['food']), gps: GPS_HN }],
    ['more', [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'còn quán nào nữa' }], { luna: lunaIntent('more', ['food']), gps: GPS_HN }],
    ['compare', [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'so sánh hai quán' }], { luna: lunaIntent('compare', ['food']), gps: GPS_HN }],
    ['plan', one('lên kế hoạch buổi tối đi ăn và hát'), { luna: lunaIntent('plan', ['food', 'entertainment']), gps: GPS_HN }],
    ['chat with a stated district', one('Quận 3 có gì thú vị về lịch sử'), { luna: CHAT_FOOD, gps: GPS_HN }],
    ['entertainment pick', one('chỗ hát karaoke'), { luna: lunaIntent('pick', ['entertainment'], { query: 'karaoke' }), gps: GPS_HN }],
    ['travel pick', one('khách sạn ở Đà Lạt'), { luna: lunaIntent('pick', ['travel'], { query: 'khách sạn' }), gps: GPS_HN }],
  ]
  for (const [name, msgs, o] of NOT_BLOCKED) {
    it(`${name}: the offered tools with the flag ON are exactly the gate-only tools (no web_search is added)`, async () => {
      const on = await turn(msgs, { ...o, gate: '1', know: '1', tool: { query: 'quán' }, reply: 'ok' })
      const c = await turn(msgs, { ...o, gate: '1', know: undefined, tool: { query: 'quán' }, reply: 'ok' })
      expect(on.toolNames).toEqual(c.toolNames)
      if (!c.toolNames.includes('web_search')) expect(on.toolNames).not.toContain('web_search')
      expect(on.system).toBe(c.system)
    }, 60000)
  }
})

describe('B (Wave 2J) — M7 (non-vacuous): turns that are NOT blocked and DO carry a tool list', () => {
  const WITH_TOOLS: Array<[string, Msg[], TurnOpts]> = [
    ['a "more" turn', [{ role: 'user', content: 'quán cơm tấm' }, { role: 'assistant', content: 'Mình chọn: Cơm tấm A.' }, { role: 'user', content: 'còn quán nào nữa' }], { luna: lunaIntent('more', ['food']), gps: GPS_HN }],
    ['a chat turn that states a district', one('Quận 3 có gì thú vị về lịch sử'), { luna: CHAT_FOOD, gps: GPS_HN }],
  ]
  for (const [name, msgs, o] of WITH_TOOLS) {
    it(`${name}: the tool list is the gate-only list (search_places) and the flag adds no web_search`, async () => {
      const on = await turn(msgs, { ...o, gate: '1', know: '1', reply: 'ok' })
      const c = await turn(msgs, { ...o, gate: '1', know: undefined, reply: 'ok' })
      expect(c.toolNames).toEqual(['search_places'])
      expect(on.toolNames).toEqual(['search_places'])
    }, 60000)
  }
})

describe('B (Wave 2J) — the area question is EXACTLY as with the gate alone', () => {
  it('E10/E11-shaped: the model\'s own place lookup has no location: the area question is appended, the tool result and the answer are the gate-only ones', async () => {
    const on = await turn(one(KNOW_1), { gate: '1', know: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    const c = await turn(one(KNOW_1), { gate: '1', know: undefined, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    expect(c.asks).toBe(1)
    expect(on.asks).toBe(1)
    expect(on.text).toBe(c.text)
    expect(on.toolResult).toEqual(c.toolResult)
    expect(JSON.stringify(on.toolResult)).toContain('KHÔNG tự đặt câu hỏi khu vực') // the original note, not a changed one
    expect(on.refused).toBe(true)
  }, 60000)

  it('GRID (sample of 70 short venue requests): in every cell the area question, answer, tool result and lookups with the flag ON equal the gate alone', async () => {
    const bad: string[] = []
    let cells = 0, asksSeen = 0, blockedSeen = 0
    for (const msg of VENUE_SHORT) for (const [ln, luna] of LUNAS) for (const [sn, tool] of SCRIPTS) for (const gps of [false, true]) {
      const on = await turn(one(msg), { gate: '1', know: '1', luna, tool, gps: gps ? GPS_HN : undefined, reply: 'ok' })
      const c = await turn(one(msg), { gate: '1', know: undefined, luna, tool, gps: gps ? GPS_HN : undefined, reply: 'ok' })
      cells++; asksSeen += c.asks; if (!c.toolNames.includes('web_search') && on.toolNames.includes('web_search')) blockedSeen++
      const d = sameAsGateOnly(on, c, sn)
      if (d.length) bad.push(`${msg} | ${ln} | ${sn} | gps=${gps}: ${d.join(', ')}`)
    }
    expect(bad).toEqual([])
    expect(cells).toBe(VENUE_SHORT.length * LUNAS.length * SCRIPTS.length * 2)
    expect(asksSeen).toBeGreaterThan(50) // the grid really contains area questions (it is not comparing zeros)
    expect(blockedSeen).toBeGreaterThan(50) // and blocked turns where the flag adds web_search
  }, 900000)

  it('GRID (15 food-knowledge + 5 named-entity questions): the area question and everything else with the flag ON equal the gate alone (recorded, NOT claimed as fixed)', async () => {
    const bad: string[] = []
    let cells = 0
    for (const msg of [...KNOW_FOOD, ...KNOW_NAMED]) for (const [ln, luna] of LUNAS) for (const [sn, tool] of SCRIPTS) for (const gps of [false, true]) {
      const on = await turn(one(msg), { gate: '1', know: '1', luna, tool, gps: gps ? GPS_HN : undefined, reply: 'ok' })
      const c = await turn(one(msg), { gate: '1', know: undefined, luna, tool, gps: gps ? GPS_HN : undefined, reply: 'ok' })
      cells++
      const d = sameAsGateOnly(on, c, sn)
      if (d.length) bad.push(`${msg} | ${ln} | ${sn} | gps=${gps}: ${d.join(', ')}`)
    }
    expect(bad).toEqual([])
    expect(cells).toBe(20 * LUNAS.length * SCRIPTS.length * 2)
  }, 900000)
})

describe('B (Wave 2J) — nothing else changes', () => {
  for (const v of [undefined, '0', 'true', ' 1', '1 ', 'on']) {
    it(`flag value ${JSON.stringify(v)}: the old behaviour (no web_search on the lean path)`, async () => {
      const r = await turn(one(KNOW_1), { gate: '1', know: v, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
      expect(r.toolNames).not.toContain('web_search')
      expect(r.asks).toBe(1)
    }, 60000)
  }

  it('flag ON without the gate: no effect at all (same as both OFF)', async () => {
    const a = await turn(one(KNOW_1), { gate: undefined, know: '1', luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    const b = await turn(one(KNOW_1), { gate: undefined, know: undefined, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.' })
    expect(a.toolNames).toEqual(b.toolNames)
    expect(a.system).toBe(b.system)
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

describe('B (Wave 2J) — trace (CONSULT_TRACE_DIAGNOSTICS=1 only): labels, never the user text', () => {
  it('the outcome line carries knowledgeToolsApplied / webSearchOffered; the area-question labels of Wave 2I are gone; no user word or canary in the new lines', async () => {
    const CANARY = 'zq7canary9xv'
    const r = await turn(one(`${KNOW_1} ${CANARY}`), { gate: '1', know: '1', trace: true, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'Trả lời kiến thức.', gps: { ...GPS_HN, address: `${CANARY} street` } })
    const o = outcome(r)
    expect(o).toBeTruthy()
    expect(o).toMatchObject({ knowledgeToolsApplied: true, webSearchOffered: true })
    expect(o).not.toHaveProperty('areaAskSuppressed')
    expect(o).not.toHaveProperty('areaAskKeptReason')
    const gateLines = JSON.stringify(r.traceEvents.filter(e => /^search_now_gate/.test(String(e.ev)) || e.ev === 'loop'))
    expect(gateLines).not.toContain(CANARY)
    expect(gateLines).not.toContain('Nikola')
    expect(gateLines).not.toContain('Tiểu sử')
    // every trace event of the turn except the old Wave 2C `tool` events (they log the model's own query: F-9, out of scope here) must be free of the canary too
    const seen = [...new Set(r.traceEvents.map(e => String(e.ev)))]
    const leaks = r.traceEvents.filter(e => e.ev !== 'tool' && JSON.stringify(e).includes(CANARY)).map(e => String(e.ev))
    expect(seen.length).toBeGreaterThan(5)
    expect(leaks).toEqual([])
  }, 60000)

  it('flag OFF: the outcome line has none of the new fields (the trace is byte-compatible with run 4)', async () => {
    const r = await turn(one(KNOW_1), { gate: '1', know: undefined, trace: true, luna: CHAT_FOOD, tool: { query: 'Nikola Tesla' }, reply: 'x' })
    const o = outcome(r)
    expect(o).toBeTruthy()
    for (const k of ['knowledgeToolsApplied', 'webSearchOffered', 'areaAskSuppressed', 'areaAskKeptReason']) expect(o).not.toHaveProperty(k)
  }, 60000)
})
