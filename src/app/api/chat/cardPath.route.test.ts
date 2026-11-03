/**
 * Round 27 at route level (TAPPY_AGENT=2): the card-path diagnostics of one simulated turn — which rows the provider returned, which the MODEL reads, which became card
 * candidates, what the recorder received and returned, how each pick was judged, and the final card order — with ONE correlation id. Model, recorder and places are scripted
 * (no network, no real model). The scenario is the shape of the live case in chat 81d50b17 turn 1 (the prose names venue X as best and venue Y second; the recorder returns only
 * Y). It shows the diagnostics tell that case apart; it does not prove the live turn had that cause (that turn had no trace).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    decision: null as null | { picks: Array<{ name: string; why: string | null; tradeoff: string | null }>; none: boolean; confidence: 'high' | 'medium' | 'low' },
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
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: (o: { schemaName?: string }) => {
      if (o.schemaName === 'recommendation_decision' && h.state.decision) return Promise.resolve({ object: h.state.decision, providerMetadata: {} })
      return Promise.reject(new Error('no provider in this test'))
    },
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) }),
    step: (opts: Record<string, unknown>) => {
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
    searchPlaces: async (_query: string, location?: string) => {
      const row = (name: string, id: string, i: number) => ({ name, place_id: id, rating_value: 4.5 - i / 10, rating_count: 1000 - i * 50, google_rating: `${4.5 - i / 10}⭐`, address: `${i + 1} Đường Giả, Quận 1, TP.HCM`, maps_link: `https://maps.google.com/?cid=${100 + i}`, open_now: true, place_types: ['Điểm thu hút khách du lịch'] })
      const results = [row('Vietopia', 'p-vie', 0), row('MIA TOWN', 'p-mia', 1), row('Sân Khấu Thế Giới Trẻ', 'p-sk', 2), row('Nhà Hát Bến Thành', 'p-nhbt', 3), row('Đầm Sen', 'p-ds', 4)]
      return { source: 'test', count: results.length, location: location ?? '', results, google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'has_results' }
    },
  }
})

import { POST } from '@/app/api/chat/route'
// R42 R3 (LOC-DEFAULT-HCM-01 regression run): no network, ever — a fetch the mocks above do not cover fails at once instead of going online.
beforeEach(() => { vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { vi.unstubAllGlobals() })

const post = async (messages: unknown[]) => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } }),
    signal: undefined,
  }
  const res = await POST(req as never)
  return res.text()
}
const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })
const ANSWER = 'Tối nay ở TP.HCM, nếu muốn xõa mà không phải đi bộ nhiều thì **MIA TOWN** hợp nhất: bida, gaming và khu vui chơi trong nhà. Muốn xem kịch thì cân nhắc **Sân Khấu Thế Giới Trẻ** — nên kiểm tra suất diễn tối nay trước khi đi.'

async function turn() {
  const logs: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  // Round 28: "nay có gì dzui ko" is a vague opener the discovery gate now asks about first (no search); the card path needs a request that names what it wants.
  const body = await post([{ role: 'user', content: 'tối nay tìm chỗ chơi bida hoặc xem kịch' }])
  log.mockRestore()
  const cp = logs.filter(l => l.includes('"ev":"card_path"')).map(l => JSON.parse(l) as Record<string, any>)
  const cards = (() => {
    const anns = body.split('\n').filter(l => l.startsWith('8:')).flatMap(l => { try { return JSON.parse(l.slice(2)) as Array<Record<string, unknown>> } catch { return [] } })
    return (anns.filter(a => a.kind === 'tappy.places.v1' && !a.preliminary).at(-1) as { items: Array<{ name: string }> } | undefined) ?? null
  })()
  return { cp, cards, logs }
}
const stage = (cp: Array<Record<string, any>>, s: string) => cp.find(e => e.stage === s)

beforeEach(() => {
  __resetAiQuestionQuotaLocal()
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2'
  h.state.steps = [{ text: '', toolCalls: [call('search_places', { query: 'sự kiện vui chơi giải trí hôm nay', location: 'Hồ Chí Minh', type: 'attraction' })] }, { text: ANSWER, toolCalls: [] }]
  h.state.decision = { picks: [{ name: 'Sân Khấu Thế Giới Trẻ', why: 'Có kịch', tradeoff: null }], none: false, confidence: 'high' }
})
afterEach(() => {
  for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'TAPPY_AUDIT_TRACE', 'NEXT_PUBLIC_SUPABASE_URL']) delete process.env[k]
})

describe('card-path diagnostics of one simulated turn', () => {
  it('flag ON + audit trace ON: every stage is logged under ONE id and shows who dropped what', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'; process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
    const { cp, cards } = await turn()
    const ids = new Set(cp.map(e => e.turn))
    expect(ids.size).toBe(1)
    expect(cp.map(e => e.stage)).toEqual(['turn', 'memory_context', 'rows_and_recs', 'recorder_candidates', 'recorder_input', 'recorder_output', 'recorder_validation', 'ranking_applied', 'final_cards'])
    expect(typeof stage(cp, 'turn')!.agent_trace_id).toBe('string')
    const rr = stage(cp, 'rows_and_recs')!
    expect(rr.provider_rows).toBe(5)
    expect(rr.model_row_list.map((r: { name: string }) => r.name)).toContain('MIA TOWN')
    expect(rr.rec_list.map((r: { name: string }) => r.name)).toContain('MIA TOWN')
    expect(rr.rows_without_rec).toEqual([])
    expect(stage(cp, 'recorder_candidates')!.list.some((c: { id: string; name: string }) => c.name === 'MIA TOWN' && c.id)).toBe(true)
    expect(stage(cp, 'recorder_input')!.sent).toContain('MIA TOWN')
    expect(stage(cp, 'recorder_output')!.picks).toEqual(['Sân Khấu Thế Giới Trẻ'])
    const ra = stage(cp, 'ranking_applied')!
    expect(ra.picks).toEqual([{ name: 'Sân Khấu Thế Giới Trẻ', card_id: expect.any(String) }])
    expect(ra.cards_before.length).toBe(5)
    expect(ra.cards_after).toEqual([ra.picks[0].card_id])
    expect(stage(cp, 'final_cards')!.visible).toEqual(['Sân Khấu Thế Giới Trẻ'])
    expect(cards!.items.map(i => i.name)).toEqual(['Sân Khấu Thế Giới Trẻ']) // the card is what the log says
    // memory: counts / booleans only
    expect(stage(cp, 'memory_context')).toMatchObject({ memory_lines: 0, mentions_walking: false })
  })
  it('the same turn with the flag ON but the trace OFF: no card-path line, same cards', async () => {
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const { cp, cards } = await turn()
    expect(cp).toEqual([])
    expect(cards!.items.map(i => i.name)).toEqual(['Sân Khấu Thế Giới Trẻ'])
  })
  it('flag OFF with the trace ON: no card-path line, same cards (the flag-off path is untouched)', async () => {
    process.env.TAPPY_AUDIT_TRACE = '1'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://zdaprdfgpbpnxyofagmc.supabase.co'
    const { cp, cards } = await turn()
    expect(cp).toEqual([])
    expect(cards!.items.map(i => i.name)).toEqual(['Sân Khấu Thế Giới Trẻ'])
  })
})
