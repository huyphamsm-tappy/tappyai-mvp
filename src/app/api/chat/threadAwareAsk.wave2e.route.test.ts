/**
 * Wave 2E - route-level regression tests for the independent review's findings on CONSULT_THREAD_AWARE_ASK (F-R1, F-R2, F-A1, F-A2, F-A4, R6). Full POST /api/chat, scripted intent call and model, no network.
 * The rule these tests hold the flag to: where the evidence is not clearly the CURRENT consultation's, the flag-ON turn behaves exactly like the flag-OFF turn (it asks / searches as before) - it never
 * stays silent on a stale answer. Product names, sentences and threads are written for this file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { luna: null as null | Record<string, unknown>, text: 'Trả lời của mô hình.', userId: 'u-wave2e-a' }
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
vi.mock('@/lib/account/ageEligibility', async (o) => ({ ...(await o<typeof import('@/lib/account/ageEligibility')>()), getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }) }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: h.state.userId }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/tools/common', async (o) => ({ ...(await o<typeof import('@/lib/ai/tools/common')>()), getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [], serperSearch: async () => [], webSearch: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/tools/serperPlaces', async (o) => ({ ...(await o<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))
vi.mock('@/lib/ai/tools/food', async (o) => ({ ...(await o<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} }) : Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response(`0:${JSON.stringify(h.state.text)}\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`, { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))
import { POST } from '@/app/api/chat/route'

type Msg = { role: 'user' | 'assistant'; content: string }
const luna = (turn: string, domains: string[], extra: Record<string, unknown> = {}) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null, ...extra })

async function run(msgs: Msg[], o: { on: boolean; luna?: Record<string, unknown> | null }) {
  delete process.env.TAPPY_AGENT
  process.env.CONSULT_THREAD_AWARE_ASK = o.on ? '1' : '0'; delete process.env.CONSULT_SEARCH_NOW_INTENT_GATE
  h.state.luna = o.luna ?? null; h.state.userId = `u-wave2e-a-${o.on ? 'on' : 'off'}`
  __resetAiQuestionQuotaLocal()
  const req = { url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'), headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }), json: () => Promise.resolve({ messages: msgs }), signal: undefined }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as Array<Record<string, any>>
  const marker = /\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/.exec(text)
  const asked = marker ? (JSON.parse(marker[1]) as { questions: Array<{ id: string; q: string; options: string[] }> }).questions : []
  return {
    turn: (js.find(j => j.type === 'tappyai_consult') ?? {}).turn as string | undefined,
    canned: js.some(j => j.type === 'tappyai_canned_reply' && j.kind === 'consult_ask'),
    askedQ: asked.map(q => q.q), asked,
    presearch: js.filter(j => j.type === 'tappyai_presearch').map(j => `${j.query}@${j.location}`),
    text,
    events: js.filter(j => j.type === 'tappyai_trace') as Array<Record<string, any>>,
  }
}
beforeEach(() => { process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; vi.stubGlobal('fetch', async (i: unknown) => { throw new Error('network disabled: ' + String(i).slice(0, 50)) }) })
afterEach(() => { delete process.env.CONSULT_THREAD_AWARE_ASK; vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const card = (names: string[], bold = true) => `Mình đã tìm vài mẫu.${bold ? ` **Mình chọn: ${names[0]}**.` : ''}\n[TAPPY_SHOPPING]${JSON.stringify({ v: 1, entities: names.map((name, i) => ({ key: `e${i}`, name, priceLow: 900000 + i * 10000 })) })}[/TAPPY_SHOPPING]`
const STYLE_ASK = 'Để chọn đúng ốp lưng cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"line","q":"Kiểu ốp nào?","options":["Chống sốc","Trong suốt","Ốp da","Chưa biết"]}]}[/TAPPY_ASK]\n\nChọn nhanh bên dưới.'
const UAG_CARD = ['Ốp lưng iPhone 15 UAG Plasma Magsafe Clear', 'Ốp lưng iPhone 15 Spigen Tough Armor', 'Ốp lưng iPhone 15 Casetify Impact']
const same = (a: Awaited<ReturnType<typeof run>>, b: Awaited<ReturnType<typeof run>>) => { expect(a.turn).toBe(b.turn); expect(a.askedQ).toEqual(b.askedQ); expect(a.canned).toBe(b.canned); expect(a.presearch).toEqual(b.presearch) }

describe('F-R1 · a NEW request after a finished consultation does not inherit its line, budget or MagSafe', () => {
  const finished = (closing: string): Msg[] => [{ role: 'user', content: 'tìm ốp UAG Plasma cho iphone 15 dưới 200k có magsafe' }, { role: 'assistant', content: closing }]
  for (const [name, closing] of [['a product card', card(UAG_CARD)], ['plain advice', 'Mình chọn: **Ốp UAG Plasma** cho iPhone 15, có MagSafe, dưới 200k.']] as const) {
    for (const lu of [null, luna('pick', ['shopping'], { query: 'ốp UAG iphone 17 pro max' })]) {
      it(`closing reply = ${name}, intent layer ${lu ? 'pick' : 'failed'}: "giờ mua ốp UAG cho iphone 17 pro max" behaves like OFF (asks as before, no silent pick with the old line / budget)`, async () => {
        const msgs: Msg[] = [...finished(closing), { role: 'user', content: 'giờ mua ốp UAG cho iphone 17 pro max' }]
        const off = await run(msgs, { on: false, luna: lu }), on = await run(msgs, { on: true, luna: lu })
        same(on, off)
      }, 60000)
    }
  }
  it('"tìm ốp lưng iphone 15 dưới 200k" … "mua ốp UAG Monarch cho iphone 17 pro max": the old budget is not carried (same as OFF)', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'tìm ốp lưng iphone 15 dưới 200k' }, { role: 'assistant', content: card(UAG_CARD) }, { role: 'user', content: 'mua ốp UAG Monarch cho iphone 17 pro max' }]
    for (const lu of [null, luna('pick', ['shopping'], { query: 'q' })]) same(await run(msgs, { on: true, luna: lu }), await run(msgs, { on: false, luna: lu }))
  }, 60000)
  it('inside ONE consultation the answers still count: request → card of questions → answer → the evidence of the first message is kept (the flag does its job)', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'tìm ốp UAG Plasma cho iphone 17 dưới 1 triệu có magsafe' }, { role: 'assistant', content: STYLE_ASK }, { role: 'user', content: 'Chống sốc' }]
    same(await run(msgs, { on: true }), await run(msgs, { on: false }))
  }, 60000)
})

describe('F-R2 · a card of another product family shown earlier is not evidence for this request', () => {
  const CHARGERS = ['Củ sạc nhanh Samsung 25W Chính Hãng', 'Củ sạc Anker 20W Nano', 'Củ sạc Baseus 65W GaN']
  for (const lu of [null, luna('pick', ['shopping'], { query: 'điện thoại Samsung' })]) {
    it(`phone request after a charger card, intent layer ${lu ? 'pick' : 'failed'}: the same turn and the same card as OFF`, async () => {
      const msgs: Msg[] = [{ role: 'user', content: 'tìm củ sạc nhanh cho iphone' }, { role: 'assistant', content: card(CHARGERS) }, { role: 'user', content: 'điện thoại Samsung đó dưới 10 triệu' }]
      same(await run(msgs, { on: true, luna: lu }), await run(msgs, { on: false, luna: lu }))
    }, 60000)
  }
})

describe('F-A1 / F-A2 / F-A4 · pointing needs a demonstrative, a refusal or a contradiction is not a pointer', () => {
  const TC = ['Ốp Lưng Chống Sốc Cho iPhone 17 Pro Max Spigen', 'Ốp Lưng Trong Suốt iPhone 17 Pro Max ESR', 'Ốp Lưng Da Thật iPhone 17 Pro Max Apple', 'Ốp Lưng Đen Nhám iPhone 17 Pro Max Nillkin']
  const t = (shown: string[], last: string): Msg[] => [{ role: 'user', content: 'tìm ốp lưng iphone 17 pro max' }, { role: 'assistant', content: card(shown) }, { role: 'user', content: last }]
  for (const msg of ['cho mình loại chống sốc dưới 500k', 'tìm cái trong suốt giá rẻ']) {
    it(`Title Case card + a NEW request "${msg}": never a follow-up on a shown product (same as OFF)`, async () => {
      const on = await run(t(TC, msg), { on: true }), off = await run(t(TC, msg), { on: false })
      expect(on.turn).not.toBe('followup')
      same(on, off)
    }, 60000)
  }
  for (const msg of ['không lấy cái UAG đó đâu', 'đừng mua cái UAG đó nha', 'tui chọn cái UAG đó nhưng không cần magsafe']) {
    it(`"${msg}" does not select the UAG product (same turn as OFF)`, async () => {
      const on = await run(t(UAG_CARD, msg), { on: true }), off = await run(t(UAG_CARD, msg), { on: false })
      expect(on.turn).toBe(off.turn)
    }, 60000)
  }
  it('the pointer that is wanted still works: "tui muốn mua uag đó, mua online nha" continues the one UAG product (no card, a follow-up)', async () => {
    const on = await run(t(UAG_CARD, 'tui muốn mua uag đó, mua online nha'), { on: true, luna: luna('pick', ['shopping'], { query: 'q' }) })
    expect(on.turn).toBe('followup'); expect(on.canned).toBe(false)
  }, 60000)
})

describe('R4 / R5 · a partly answered card keeps its open question, and a resolved card searches with a real query', () => {
  // two user messages in a row (no reply between): one consultation, the budget and MagSafe were said in the first
  const chain: Msg[] = [{ role: 'user', content: 'mình cần ốp UAG dưới 500k có magsafe' }, { role: 'user', content: 'mua ốp cho iphone 17 pro max' }]
  it('R4: rules ask [line, budget, must], intent layer picks, the thread answers budget and MagSafe → the LINE question is still asked (OFF asks it too), never a silent pick', async () => {
    const lu = luna('pick', ['shopping'], { query: 'ốp UAG iphone 17 pro max' })
    const off = await run(chain, { on: false, luna: lu }), on = await run(chain, { on: true, luna: lu })
    expect(off.canned).toBe(true)
    expect(on.canned).toBe(true)
    expect(on.askedQ).toEqual(off.askedQ)
  }, 60000)
})

describe('F-R3 · the flag never asks where OFF would search ("not worth asking": a multi-question card cut below two is a pick)', () => {
  const chains: Msg[][] = [
    [{ role: 'user', content: 'mình cần ốp UAG Monarch dưới 500k' }, { role: 'user', content: 'mua ốp cho iphone 17 pro max' }],
    [{ role: 'user', content: 'mình cần ốp UAG dưới 500k có magsafe' }, { role: 'user', content: 'mua ốp cho iphone 17 pro max' }],
    [{ role: 'user', content: 'ốp UAG Plyo dưới 500k' }, { role: 'user', content: 'cho iphone 17 pro max' }],
    [{ role: 'user', content: 'tai nghe Sony dưới 3 triệu' }, { role: 'user', content: 'mua cho mình đi' }],
    [{ role: 'user', content: 'laptop dell dưới 20 triệu' }, { role: 'user', content: 'ok lấy luôn đi' }],
    [{ role: 'user', content: 'mua ốp lưng dưới 300k' }, { role: 'user', content: 'cho iphone 15' }],
    [{ role: 'user', content: 'mua sạc dự phòng dưới 500k' }, { role: 'user', content: 'loại 20000mah' }],
    [{ role: 'user', content: 'mình cần ốp UAG' }, { role: 'user', content: 'dưới 500k' }],
  ]
  chains.forEach((msgs, i) => {
    for (const lu of [null, luna('pick', ['shopping'], { query: 'ốp UAG iphone 17 pro max' })]) {
      it(`chain ${i + 1}, intent layer ${lu ? 'pick' : 'failed'}: ON asks only when OFF asks`, async () => {
        const off = await run(msgs, { on: false, luna: lu }), on = await run(msgs, { on: true, luna: lu })
        if (!off.canned) expect(on.canned).toBe(false)
      }, 60000)
    }
  })
})

describe('R6 · a new request in another domain does not read the answers of an earlier consultation', () => {
  it('a hotel request for another city after a finished hotel consultation behaves like OFF', async () => {
    const msgs: Msg[] = [{ role: 'user', content: 'khách sạn ở Đà Lạt cuối tuần này cho 2 người dưới 1 triệu' }, { role: 'assistant', content: 'Mình gợi ý **Khách sạn Hoa Anh Đào** — 900.000đ/đêm.' }, { role: 'user', content: 'giờ tìm khách sạn ở Nha Trang' }]
    for (const lu of [null, luna('pick', ['travel'], { query: 'khách sạn Nha Trang' })]) same(await run(msgs, { on: true, luna: lu }), await run(msgs, { on: false, luna: lu }))
  }, 60000)
})
