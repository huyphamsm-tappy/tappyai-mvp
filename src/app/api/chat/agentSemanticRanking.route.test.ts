/**
 * Phase 8 M5 at route level (TAPPY_AGENT=2): what Luna READS after the route's tools, and what the cards render after Luna answers.
 * Code applies only hard constraints (an over-budget venue is gone, an explicit exclusion is gone, a soft "rẻ tiền" removes nothing);
 * the rows stay in the PROVIDER's order with no score, no engine Pick and no shortlist; Luna's ranking line orders the cards (only the
 * ranked candidates, its first pick recommended with its own reason); "none" → no recommendation and no filler card. Model scripted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    streamCalls: 0,
    extractCalls: 0,
    placeCalls: [] as string[],
    writes: [] as unknown[],
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-agent-test' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/actions/runAction', () => ({ runAiWriteAction: vi.fn(async (o: unknown) => { h.state.writes.push(o); return { ok: true, result: { ok: true, id: 'w1' } } }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => { h.state.extractCalls++; return Promise.reject(new Error('no provider in this test')) },
    stream: () => { h.state.streamCalls++; return { toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) } },
    step: (opts: Record<string, unknown>) => {
      h.state.stepCalls.push(opts)
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    searchPlaces: async (query: string, location?: string) => {
      h.state.placeCalls.push(query)
      const results = [
        // Provider order: the quiet café FIRST. The Consultative formula (rating 1.0 · reviews 0.3 · distance 0.5 …) puts the 4.9⭐ garden café first.
        { name: 'Work Café Yên Tĩnh', rating_value: 4.3, rating_count: 120, google_rating: '4.3⭐ (120 đánh giá)', price_range_text: '1-100.000 ₫', distance_km: 0.3, open_now: true, address: '12 Lê Thánh Tôn, Quận 1', place_types: ['Quán cà phê'] },
        { name: 'Cà Phê Vườn Lớn', rating_value: 4.9, rating_count: 3000, google_rating: '4.9⭐ (3.000 đánh giá)', price_range_text: '1-100.000 ₫', distance_km: 2.5, open_now: true, address: '200 Nguyễn Văn Trỗi, Phú Nhuận', place_types: ['Quán cà phê'] },
        { name: 'Nhà Hàng Cao Cấp Sky', rating_value: 4.8, rating_count: 900, google_rating: '4.8⭐ (900 đánh giá)', price_range_text: 'Trên 1 Tr ₫', distance_km: 1.0, open_now: true, address: '1 Đồng Khởi, Quận 1', place_types: ['Nhà hàng cao cấp'] },
      ]
      // A fine-dining query returns only venues whose bands lie ENTIRELY above a small budget.
      if (query.includes('cao cấp')) {
        const fine = [
          { name: 'Sky Fine Dining', rating_value: 4.7, rating_count: 600, price_range_text: 'Trên 1 Tr ₫', distance_km: 1.1, open_now: true, address: '5 Đồng Khởi, Quận 1', place_types: ['Nhà hàng cao cấp'] },
          { name: 'Le Jardin', rating_value: 4.6, rating_count: 300, price_range_text: '500-700 N ₫', distance_km: 1.4, open_now: true, address: '9 Thái Văn Lung, Quận 1', place_types: ['Nhà hàng Pháp'] },
        ]
        return { source: 'test', count: fine.length, location: location ?? '', results: fine, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
      }
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
  }
})

import { POST } from '@/app/api/chat/route'

const post = async (messages: unknown[], chatSessionId?: string) => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }, ...(chatSessionId ? { chatSessionId } : {}) }),
    signal: undefined,
  }
  const res = await POST(req as never)
  return res.text()
}
const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })

/** The tappyai_agent_run_trace lines this turn logged. */
async function turn(messages: unknown[], chatSessionId?: string): Promise<{ body: string; traces: Array<Record<string, unknown>> }> {
  const log = vi.spyOn(console, 'log')
  const body = await post(messages, chatSessionId)
  const traces = log.mock.calls.map(c => String(c[0])).filter(s => s.startsWith('{"type":"tappyai_agent_run_trace"')).map(s => JSON.parse(s) as Record<string, unknown>)
  log.mockRestore()
  return { body, traces }
}

const QUIET = 'Work Café Yên Tĩnh', GARDEN = 'Cà Phê Vườn Lớn', SKY = 'Nhà Hàng Cao Cấp Sky'
/** The search_places result Luna read (the last tool result in the messages of its last step). */
const lunaResult = (): Record<string, unknown> => {
  const msgs = (h.state.stepCalls.at(-1) as { messages: Array<{ role: string; content: Array<{ type: string; toolName?: string; result?: Record<string, unknown> }> }> }).messages
  const r = msgs.filter(m => m.role === 'tool').flatMap(m => m.content).filter(c => c.type === 'tool-result' && c.toolName === 'search_places').at(-1)?.result
  return r ?? {}
}
const lunaSaw = (): string => JSON.stringify(lunaResult())
/** The venue names in the rows Luna read, in order. */
const rowNames = (): string[] => ((lunaResult().results ?? []) as Array<{ name: string }>).map(r => r.name)
/** The final place-card annotation (not the preliminary fold). */
function finalCards(body: string): { items: Array<{ name: string; recommended?: boolean; reasons?: Array<{ evidence: string }> }>; picked?: string[] } | null {
  const anns = body.split('\n').filter(l => l.startsWith('8:')).flatMap(l => { try { return JSON.parse(l.slice(2)) as Array<Record<string, unknown>> } catch { return [] } })
  const cards = anns.filter(a => a.kind === 'tappy.places.v1' && !a.preliminary)
  return (cards.at(-1) as never) ?? null
}
const rankLine = (picks: Array<{ name: string; why?: string; tradeoff?: string }>, none = false) => `[TAPPY_RANK]${JSON.stringify({ picks, none, confidence: 'medium' })}[/TAPPY_RANK]`

describe('M5 · what Luna reads: hard constraints by code, provider order, no engine decision', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '2' })

  for (const v1 of ['1', '0']) {
    it(`no score, no Pick, no shortlist; provider order kept (CONSULTATIVE_V1=${v1})`, async () => {
      process.env.CONSULTATIVE_V1 = v1
      h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'quán cà phê làm việc', location: 'Quận 1' })] }, { text: `**${QUIET}** hợp ngồi làm việc.`, toolCalls: [] }]
      await turn([{ role: 'user', content: 'Chiều nay mình cần chỗ yên tĩnh ngồi làm việc 3 tiếng gần đây' }])
      const saw = lunaSaw()
      expect(saw).not.toContain('_tappy_ranking')
      expect(saw).not.toContain('_tappy_shortlist')
      expect(saw).not.toContain('_tappy_brief')
      expect(saw).not.toContain('best_overall')
      expect(saw).toContain('KHÔNG phải xếp hạng')
      expect(rowNames().slice(0, 2)).toEqual([QUIET, GARDEN]) // the provider's order, not the formula's
      expect(String(lunaResult().results_note)).toContain('thu tu nha cung cap')
    })
  }

  it('a HARD budget removes the over-budget venue before Luna sees it', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'quán ăn tối', location: 'Quận 1' })] }, { text: 'Có vài chỗ.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tối nay ăn gì ở Quận 1 dưới 200k một người' }])
    expect(rowNames()).not.toContain(SKY)
    expect(rowNames()).toContain(QUIET)
  })

  it('an EXPLICIT exclusion is hard ("không nhà hàng"); a SOFT "rẻ tiền" removes nothing', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'chỗ ăn tối', location: 'Quận 1' })] }, { text: 'Có vài chỗ.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tối nay đi ăn ở Quận 1, không nhà hàng nha' }])
    expect(rowNames()).not.toContain(SKY)
    h.state.stepCalls = []
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'chỗ ăn tối', location: 'Quận 1' })] }, { text: 'Có vài chỗ.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tối nay đi ăn ở Quận 1, ưu tiên rẻ tiền nhưng ngon thì đắt hơn chút cũng được' }])
    expect(rowNames()).toContain(SKY)
  })

  it('a HARD budget is never relaxed by code: nothing fits → Luna reads no over-budget venue (agent v2); TAPPY_AGENT=1 still relaxes', async () => {
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'nhà hàng cao cấp', location: 'Quận 1' })] }, { text: 'Chưa có chỗ nào dưới 300k.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Nhà hàng cao cấp ở Quận 1 dưới 300k một người' }])
    expect(rowNames()).toEqual([])
    expect(lunaSaw()).not.toContain('_tappy_relaxed') // the ceiling was not dropped behind Luna's back
    process.env.TAPPY_AGENT = '1'
    h.state.stepCalls = []
    __resetAiQuestionQuotaLocal()
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'nhà hàng cao cấp', location: 'Quận 1' })] }, { text: 'Có vài chỗ.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Nhà hàng cao cấp ở Quận 1 dưới 300k một người' }])
    expect(rowNames().length).toBeGreaterThan(0)
    expect(lunaSaw()).toContain('_tappy_relaxed')
  })
  it('contrast — TAPPY_AGENT=1 keeps its pre-M5 path (the soft word still excludes there)', async () => {
    process.env.TAPPY_AGENT = '1'
    h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'chỗ ăn tối', location: 'Quận 1' })] }, { text: 'Có vài chỗ.', toolCalls: [] }]
    await turn([{ role: 'user', content: 'Tối nay đi ăn ở Quận 1, ưu tiên rẻ tiền nhưng ngon thì đắt hơn chút cũng được' }])
    expect(rowNames()).not.toContain(SKY)
  })
})

describe('M5 · the cards render Luna\'s ranking', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '2' })

  it('Luna chooses the lower-rated, closer, quiet café for 3 hours of work: card #1 = its pick, with its reason; the line never reaches the user', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán cà phê làm việc', location: 'Quận 1' })] },
      { text: `**${GARDEN}** điểm cao nhất nhưng xa và đông. Mình chọn **${QUIET}**: gần, yên tĩnh, hợp ngồi lâu.\n\n${rankLine([{ name: QUIET, why: 'yên tĩnh, gần, hợp ngồi làm việc lâu', tradeoff: 'điểm đánh giá thấp hơn quán vườn' }, { name: GARDEN, why: 'không gian đẹp nếu không ngại đi xa' }])}`, toolCalls: [] },
    ]
    const { body } = await turn([{ role: 'user', content: 'Chiều nay mình cần chỗ yên tĩnh ngồi làm việc 3 tiếng gần đây' }])
    expect(body).not.toContain('TAPPY_RANK')
    const c = finalCards(body)!
    expect(c.items.map(i => i.name)).toEqual([QUIET, GARDEN]) // Luna's order; the third venue is NOT a filler card
    expect(c.items[0].recommended).toBe(true)
    expect(c.items[0].reasons?.[0]?.evidence).toBe('yên tĩnh, gần, hợp ngồi làm việc lâu')
    expect(c.items[1].recommended).toBeFalsy()
  })

  it('"none": no venue fits → no recommendation and no filler cards', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán cà phê có phòng họp riêng', location: 'Quận 1' })] },
      { text: `Mình chưa thấy chỗ nào có phòng họp riêng trong kết quả này — bạn muốn mình tìm rộng hơn sang Quận 3 không?\n\n${rankLine([], true)}`, toolCalls: [] },
    ]
    const { body } = await turn([{ role: 'user', content: 'Tìm quán cà phê có phòng họp riêng cho 6 người ở Quận 1' }])
    expect(body).not.toContain('TAPPY_RANK')
    const c = finalCards(body)
    expect(c === null || c.items.length === 0).toBe(true)
    expect(body).not.toMatch(/"recommended":true/)
  })

  it('no ranking line → the cards are only the venues the reply names (no filler from the provider order); no engine Pick anywhere', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán cà phê làm việc', location: 'Quận 1' })] },
      { text: `Mình chọn **${QUIET}** cho buổi làm việc.`, toolCalls: [] },
    ]
    const { body } = await turn([{ role: 'user', content: 'Chiều nay mình cần chỗ yên tĩnh ngồi làm việc 3 tiếng gần đây' }])
    const c = finalCards(body)!
    expect(c.items.map(i => i.name)).toEqual([QUIET])
    // Without the line Luna's choice is not known to code: no recommendation badge is inferred from the prose (a bold name may be a rejection).
    expect(c.items[0].recommended).toBeFalsy()
  })

  it('no ranking line and no venue named (an honest "nothing fits") → no cards at all (measured SR-G3: eight unranked cards)', async () => {
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'nhà hàng michelin', location: 'Quận 1' })] },
      { text: 'Mình chưa tìm được nhà hàng Michelin nào ở Quận 1 dưới 50k; nếu bạn linh động ngân sách mình tìm lại nhé.', toolCalls: [] },
    ]
    const { body } = await turn([{ role: 'user', content: 'Tìm nhà hàng Michelin ở Quận 1 dưới 50k một người' }])
    const c = finalCards(body)
    expect(c === null || c.items.length === 0).toBe(true)
  })
})

describe('M5 · follow-ups re-rank with the accumulated context', () => {
  beforeEach(() => { process.env.TAPPY_AGENT = '2' })

  it('turn 1 Luna ranks the garden café first; turn 2 "actually I need quiet and close" → Luna sees its previous pick and re-ranks; the cards follow turn 2', async () => {
    const sid = randomUUID()
    __resetAiQuestionQuotaLocal()
    const q1 = 'Tìm quán cà phê đẹp ở Quận 1 để ngồi chơi cuối tuần'
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán cà phê đẹp', location: 'Quận 1' })] },
      // Prose names the quiet café FIRST; the ranking line puts the garden café first — the cards and the saved order follow the line.
      { text: `**${QUIET}** gần nhưng nhỏ; mình chọn **${GARDEN}** vì không gian rộng, đẹp cho cuối tuần.\n\n${rankLine([{ name: GARDEN, why: 'không gian rộng, đẹp cho cuối tuần' }, { name: QUIET, why: 'gần, nhỏ gọn' }])}`, toolCalls: [] },
    ]
    const t1 = await turn([{ role: 'user', content: q1 }], sid)
    expect(finalCards(t1.body)!.items.map(i => i.name)).toEqual([GARDEN, QUIET])
    const reply1 = t1.body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

    h.state.stepCalls = []
    __resetAiQuestionQuotaLocal() // two turns in one test: the daily free-question quota is not what this test measures
    h.state.steps = [
      { text: '', toolCalls: [call('search_places', { query: 'quán cà phê yên tĩnh gần', location: 'Quận 1' })] },
      { text: `Vậy **${QUIET}** hợp hơn: gần và yên tĩnh.\n\n${rankLine([{ name: QUIET, why: 'gần và yên tĩnh như bạn cần' }])}`, toolCalls: [] },
    ]
    const q2 = 'Thật ra mình cần chỗ gần và yên tĩnh hơn để làm việc'
    const t2 = await turn([{ role: 'user', content: q1 }, { role: 'assistant', content: reply1 }, { role: 'user', content: q2 }], sid)
    // Luna's first step of turn 2 reads the pick the previous turn's RANKING made (not a formula's).
    const firstStep = JSON.stringify((h.state.stepCalls[0] as { messages: unknown[] }).messages)
    expect(firstStep).toContain(`Lựa chọn đang đề xuất: ${GARDEN}`)
    const c2 = finalCards(t2.body)!
    expect(c2.items.map(i => i.name)).toEqual([QUIET])
    expect(c2.items[0].recommended).toBe(true)
  })
})
