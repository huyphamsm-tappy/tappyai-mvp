/**
 * Wave 2D · A — CONSULT_THREAD_AWARE_ASK at ROUTE level (full POST /api/chat, scripted intent call and scripted model, no network). The thread is the shopping conversation the flag is about:
 * a card of products was shown, the user then points at one of them in a sentence of their own. Also the 4-cell matrix with the Wave 2D · C flag: each flag changes only its own scenario.
 * Everything here is written for this test (product names, sentences, thread); nothing comes from a benchmark file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { AREA_ASK_VI } from '@/lib/ai/consultative/areaAsk'

const h = vi.hoisted(() => {
  const state = { luna: null as null | Record<string, unknown>, legacyText: 'Trả lời của mô hình.', userId: 'u-thread-aware-ask' }
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
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: () => ({
      toDataStreamResponse: () => new Response(`0:${JSON.stringify(h.state.legacyText)}\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`, { status: 200, headers: { 'content-type': 'text/plain' } }),
    }),
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({
  domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra,
})

async function turn(messages: Msg[], o: { thread?: string; place?: string; luna?: Record<string, unknown> | null } = {}) {
  delete process.env.TAPPY_AGENT
  for (const [k, v] of [['CONSULT_THREAD_AWARE_ASK', o.thread], ['CONSULT_SEARCH_NOW_INTENT_GATE', o.place]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  h.state.luna = o.luna ?? null
  h.state.legacyText = 'Trả lời của mô hình.'
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const askMarker = /\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/.exec(text)
  const asked = askMarker ? (JSON.parse(askMarker[1]) as { questions: Array<{ id: string; q: string; options: string[] }> }).questions : []
  return {
    text, asked,
    consult: js.find(j => j.type === 'tappyai_consult') as { turn?: string } | undefined,
    cannedAsk: js.some(j => j.type === 'tappyai_canned_reply' && j.kind === 'consult_ask'),
    presearched: js.some(j => j.type === 'tappyai_presearch' && !j.tool),
    areaAsks: text.split(AREA_ASK_VI).length - 1,
    events: js.filter(j => j.type === 'tappyai_trace') as Array<Record<string, unknown>>,
  }
}

beforeEach(() => {
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULT_THREAD_AWARE_ASK', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_TRACE_DIAGNOSTICS']) delete process.env[k]; vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const SIX = [
  'Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe',
  'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor',
  'Ốp lưng iPhone 17 Pro Max UAG Plasma Magsafe Clear',
  'Ốp lưng iPhone 17 Pro Casetify Impact',
  'Ốp lưng iPhone 17 Pro Max ESR Halolock Magsafe',
  'Ốp lưng iPhone 17 Pro Max Apple Clear With Magsafe',
]
const SIX_3_UAG = [
  'Ốp lưng iPhone 17 Pro Max UAG Monarch Pro Magsafe',
  'Ốp lưng iPhone 17 Pro Max UAG Pathfinder Magsafe Clear',
  'Ốp lưng iPhone 17 Pro Max UAG Plyo Trong Suốt',
  'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor',
  'Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe',
  'Ốp lưng iPhone 17 Pro Casetify Impact',
]
const STYLE_CARD = 'Để chọn đúng ốp lưng cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"line","q":"Kiểu ốp nào?","options":["Chống sốc","Trong suốt","Ốp da","Chưa biết"]}]}[/TAPPY_ASK]\n\nChọn nhanh bên dưới, hoặc gõ thẳng ý bạn — trả lời một phần cũng được.'
const cardReply = (names: string[]) => `Mình chọn nhanh vài mẫu hợp ngân sách. **Mình chọn: ${names[0]}**.\n[TAPPY_SHOPPING]${JSON.stringify({ v: 1, entities: names.map((name, i) => ({ key: `e${i}`, name, priceLow: 900000 + i * 50000, offers: [{ seller: 'Shop A', price: 900000 + i * 50000 }] })) })}[/TAPPY_SHOPPING]`
const thread = (shown: string[], last: string): Msg[] => [
  { role: 'user', content: 'tìm ốp lưng iphone 17 pro max' }, { role: 'assistant', content: STYLE_CARD },
  { role: 'user', content: 'dưới 1 triệu' }, { role: 'assistant', content: cardReply(shown) },
  { role: 'user', content: last },
]
const POINT = 'tui chọn cái UAG nha, mua online cho tiện'
// what the intent layer wrote in the paid run for such a message: a pick whose slots it read from the thread (a brand under "dòng", the budget, the way to buy)
const LUNA_PICK = lunaIntent('pick', ['shopping'], { query: 'ốp UAG iphone 17 pro max', known: [{ key: 'san_pham', value: 'ốp lưng' }, { key: 'dong', value: 'UAG' }, { key: 'ngan_sach', value: 'dưới 1 triệu' }, { key: 'hinh_thuc', value: 'mua online' }] })

describe('A — the user points at ONE product the card showed', () => {
  it('OFF: the brand\'s ask card comes back ("Dòng nào?" with the catalogue lines) although the card holds one UAG product', async () => {
    const r = await turn(thread(SIX, POINT), { luna: LUNA_PICK })
    expect(r.cannedAsk).toBe(true)
    expect(r.asked.map(q => q.id)).toEqual(['line'])
    expect(r.asked[0].q).toBe('Dòng nào?')
  }, 60000)
  it('ON: no ask card - the turn continues that product (a follow-up on the shown UAG item), answered by the model', async () => {
    const r = await turn(thread(SIX, POINT), { thread: '1', luna: LUNA_PICK })
    expect(r.consult?.turn).toBe('followup')
    expect(r.cannedAsk).toBe(false)
    expect(r.asked).toEqual([])
    expect(r.text).toContain('Trả lời của mô hình.')
  }, 60000)
  it('ON, intent layer failed (rules only): the same reading', async () => {
    const r = await turn(thread(SIX, POINT), { thread: '1', luna: null })
    expect(r.consult?.turn).toBe('followup'); expect(r.cannedAsk).toBe(false)
  }, 60000)
  it('ON, the user names a line the card does not show: not a reference to the shown item - the old reading stands (ask / pick, never a follow-up on the other line)', async () => {
    const r = await turn(thread(SIX, 'tui chọn cái UAG Monarch nha'), { thread: '1', luna: null })
    expect(r.consult?.turn).not.toBe('followup')
  }, 60000)
})

describe('A — the card holds SEVERAL products of the brand', () => {
  it('ON: only what tells them apart is asked, with options taken from the card; the budget and the MagSafe question are not asked again', async () => {
    const r = await turn(thread(SIX_3_UAG, POINT), { thread: '1', luna: LUNA_PICK })
    expect(r.cannedAsk).toBe(true)
    expect(r.asked.map(q => q.id)).toEqual(['line'])
    const options = r.asked[0].options.join(' | ')
    for (const w of ['Monarch', 'Pathfinder', 'Plyo']) expect(options).toContain(w)
    expect(options).not.toMatch(/Spigen|Apple|Casetify/)
    expect(r.asked[0].q).not.toMatch(/giá|Magsafe|MagSafe/i)
  }, 60000)
  it('OFF: the catalogue card (fixed options) - the old behaviour', async () => {
    const r = await turn(thread(SIX_3_UAG, POINT), { luna: LUNA_PICK })
    expect(r.asked.map(q => q.id)).toEqual(['line'])
    expect(r.asked[0].q).toBe('Dòng nào?')
  }, 60000)
})

describe('A — the final card never asks what the thread already answered (no card to point at)', () => {
  const earlier: Msg[] = [
    { role: 'user', content: 'mình cần ốp UAG Monarch cho iphone 17 pro max' },
    { role: 'assistant', content: 'Bạn tham khảo thêm nhé, mình sẽ gợi ý khi bạn sẵn sàng.' },
    { role: 'user', content: 'ok mua ốp UAG đi' },
  ]
  it('OFF: the line the user named earlier is asked again ("Dòng nào?"); ON: the card moves on to what is still open (the price)', async () => {
    const off = await turn(earlier, { luna: null })
    expect(off.asked.map(q => q.q)).toEqual(['Dòng nào?'])
    const on = await turn(earlier, { thread: '1', luna: null })
    expect(on.asked.map(q => q.q)).toEqual(['Tầm giá bao nhiêu?'])
  }, 60000)
  it('ON: an earlier text about ANOTHER product never answers the card (a laptop line does not answer the case card)', async () => {
    const mixed: Msg[] = [
      { role: 'user', content: 'tìm laptop dell xps dưới 30 triệu' }, { role: 'assistant', content: 'Bạn tham khảo thêm nhé.' },
      { role: 'user', content: 'ok mua ốp UAG đi' },
    ]
    const on = await turn(mixed, { thread: '1', luna: null })
    expect(on.asked.map(q => q.q)).toEqual(['Dòng nào?'])
  }, 60000)
})

describe('A — nothing shown to point at: the flag changes nothing', () => {
  it('a message with no shown product named reads the same ON and OFF (a first request, and a follow-up that names nothing)', async () => {
    const first: Msg[] = [{ role: 'user', content: 'mua ốp UAG cho iphone 17' }]
    const a = await turn(first, { thread: '1', luna: null }), b = await turn(first, { luna: null })
    expect(a.text).toBe(b.text); expect(a.consult?.turn).toBe(b.consult?.turn)
    const named = thread(SIX, 'cái rẻ nhất là cái nào vậy?')
    const c = await turn(named, { thread: '1', luna: null }), d = await turn(named, { luna: null })
    expect(c.consult?.turn).toBe(d.consult?.turn)
  }, 60000)
})

describe('A — KNOWN LIMIT (characterisation, not a wish): an activity the entertainment catalogue does not name', () => {
  it('a court-sport booking whose activity the card catalogue has no word for is still asked "Muốn chơi gì?" - with the flag ON as OFF. Answering it needs the catalogue to know the activity, which a per-request patch must not do', async () => {
    const q = 'Mình muốn thuê sân cầu lông ở Quận 7 vào sáng Chủ nhật, 2 giờ, đặt trước qua điện thoại. So sánh giá và cách đặt.'
    const luna = lunaIntent('ask', ['entertainment'], { ask: { lead: 'x', questions: [{ id: 'gio', q: 'Mấy giờ?', options: ['a', 'b'] }, { id: 'ngan_sach', q: 'Ngân sách?', options: ['a', 'b'] }] }, known: [{ key: 'khu_vuc', value: 'Quận 7' }] })
    const off = await turn([{ role: 'user', content: q }], { luna }), on = await turn([{ role: 'user', content: q }], { thread: '1', luna })
    expect(off.asked.map(a => a.q)).toEqual(['Muốn chơi gì?'])
    expect(on.asked.map(a => a.q)).toEqual(['Muốn chơi gì?'])
  }, 60000)
})

describe('A — trace (CONSULT_TRACE_DIAGNOSTICS=1 only): what was resolved, never the user text or the product names', () => {
  it('shown_reference and ask_reconcile lines carry counts, ids and the merge rule', async () => {
    vi.stubEnv('CONSULT_TRACE_DIAGNOSTICS', '1')
    const r = await turn(thread(SIX, POINT), { thread: '1', luna: LUNA_PICK })
    const ref = r.events.find(e => e.ev === 'shown_reference')
    expect(ref).toMatchObject({ shownProducts: 6, result: 'one', candidates: 1 })
    const intent = r.events.find(e => e.ev === 'intent') as { merge?: { rule?: string | null } } | undefined
    expect(intent?.merge?.rule).toBe('shown_card')
    const rec = r.events.find(e => e.ev === 'ask_reconcile')
    expect(rec).toMatchObject({ mergeRule: 'shown_card', shownProducts: 6, finalTurn: 'followup', finalAskIds: [] })
    expect(JSON.stringify(r.events)).not.toMatch(/Plasma|Spigen|Casetify|UAG nha|mua online/)
  }, 60000)
  it('without the trace flag no such line is written', async () => {
    const r = await turn(thread(SIX, POINT), { thread: '1', luna: LUNA_PICK })
    expect(r.events).toEqual([])
  }, 60000)
})

describe('Wave 2D matrix: both flags OFF = the old behaviour; each flag changes only its own scenario; both ON keeps both effects', () => {
  const KNOW = 'Cho mình biết Marie Curie đã nhận giải Nobel nào và vì công trình gì?' // C-sensitive: a named run on a knowledge turn
  const CHAT = lunaIntent('chat', ['food'])
  const cells: Array<[string, string | undefined, string | undefined]> = [['OFF/OFF', undefined, undefined], ['C ON / A OFF', '1', undefined], ['C OFF / A ON', undefined, '1'], ['C ON / A ON', '1', '1']]
  for (const [name, place, aware] of cells) {
    it(`${name}: knowledge turn - pre-search + area question only while C is OFF; shopping thread - the brand's card only while A is OFF`, async () => {
      const k = await turn([{ role: 'user', content: KNOW }], { place, thread: aware, luna: CHAT })
      expect(k.presearched, `${name} presearch`).toBe(place !== '1')
      expect(k.areaAsks, `${name} area ask`).toBe(place !== '1' ? 1 : 0)
      const t = await turn(thread(SIX, POINT), { place, thread: aware, luna: LUNA_PICK })
      expect(t.consult?.turn, `${name} shopping turn`).toBe(aware === '1' ? 'followup' : 'ask')
      expect(t.cannedAsk, `${name} brand card`).toBe(aware !== '1')
    }, 60000)
  }
})
