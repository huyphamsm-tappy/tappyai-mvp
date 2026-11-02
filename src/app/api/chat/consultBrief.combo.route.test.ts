/**
 * Final fix — CONSULT_BRIEF validation under the EXACT flag combination CONSULT_BRIEF=1 · CONSULT_V2=1 · CONSULTATIVE_V1=1 · CONSULT_LUNA=1.
 *
 * The full Benchmark V1 ran with CONSULT_BRIEF OFF and therefore says nothing about Phase 3C; these focused route tests are the only Brief-ON evidence of
 * this workstream. Harness copied from consultBrief.route.test.ts (the model is mocked to capture its options; the place provider returns fixed rows; no
 * live model or provider call is made). Stream-level behaviour (pick mismatch rewrite, card #1, photo fold, pick sentence, guards) is pinned in
 * enginePick.stream.test.ts / guards.3c.test.ts and re-run under the same flags in the closure report.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    streamOptions: null as Record<string, unknown> | null,
    placeCalls: [] as Array<{ query: string; location: string | undefined }>,
    providerRows: [] as Array<Record<string, unknown>>,
    priceSnippets: [] as Array<Record<string, unknown>>,
  }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
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
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: { id: 'u1' }, supabase: h.client }),
}))
vi.mock('@/lib/security/rateLimit', () => ({
  rateLimit: () => ({ ok: true, retryAfter: 0 }),
  dailyRateLimit: () => ({ ok: true }),
  clientIp: () => '127.0.0.1',
}))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    // A1(b): a deferred turn is driven past the model call by `settled`, which reaches the usage tail.
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    // CONSULT_LUNA=1 makes the intent call run; with no provider here it fails closed and the rules decide (a documented fallback path).
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, unknown>) => {
      h.state.streamOptions = opts
      return { toDataStreamResponse: () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }) }
    },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    searchPlaces: async (query: string, location?: string) => {
      h.state.placeCalls.push({ query, location })
      const rows = h.state.providerRows
      return {
        source: 'test', count: rows.length, location: location ?? '', results: rows,
        price_search_results: h.state.priceSnippets,
        google_maps_search: 'https://maps.google.com/maps?q=test',
        place_search_status: rows.length ? 'has_results' : 'empty',
      }
    },
  }
})

import { POST } from '@/app/api/chat/route'
import { deriveNeedProfile } from '@/lib/ai/consultative/needProfile'
import { rankCandidates } from '@/lib/ai/consultative/rank'
import { derivePickOrState } from '@/lib/ai/consultative/pick'
import { normalizePlaces } from '@/lib/ai/consultative/candidate'

/**
 * A1(b) (2026-09-20): on a pre-search turn the route returns its response BEFORE the search and the
 * model call run — they produce the body as it is read. The tests below inspect what the model
 * received, so the turn is driven past the model call here (on a tee'd copy) and an unconsumed
 * body is handed back for the assertions that read it.
 */
const settled = async (res: Response): Promise<Response> => {
  if (!res.body) return res
  const [drain, keep] = res.body.tee()
  const reader = drain.getReader()
  // The searching frame, then the first chunk of the turn itself — by then the model was called.
  await reader.read()
  await reader.read()
  reader.cancel().catch(() => {})
  return new Response(keep, { status: res.status, headers: res.headers })
}

const post = async (messages: unknown[]) => {
  const req = {
    url: 'http://localhost/api/chat',
    nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }),
    signal: undefined,
  }
  return settled(await POST(req as never))
}
const system = () => String(h.state.streamOptions?.system ?? '') + String(h.state.streamOptions?.systemShared ?? '')
const tools = () => (h.state.streamOptions?.tools ?? {}) as Record<string, { execute: (a: unknown, o?: unknown) => Promise<unknown> }>
const runPlaceTool = async (args: { query: string; location?: string }) =>
  (await tools().search_places.execute(args, {})) as Record<string, unknown>

const venue = (name: string, i: number) => ({
  // `normalizePlaces` reads the formatted `google_rating` string; the numeric twins feed the guards.
  name, address: `${i} Nguyễn Huệ, Quận 1, TP.HCM`,
  google_rating: `${(4.6 - i * 0.05).toFixed(2)}⭐ (${900 - i * 40} đánh giá)`,
  rating_value: 4.6 - i * 0.05, rating_count: 900 - i * 40,
  phone: '028 1234 5678', opening_hours: 'Mo-Su 08:00-22:00', distance_km: 0.5 + i * 0.3,
  website_uri: 'https://example.test', maps_link: `https://maps.google.com/?cid=${1000 + i}`, place_id: `p${i}`,
})
const ROWS = ['Cơm Niêu Sài Gòn', 'Bún Bò Huế Bến Ngự', 'Ốc Đào', 'Phở Hòa', 'Quán Huế Ngon', 'Nhà hàng Ngon 138', 'Bún Chả Hà Nội']
  .map((n, i) => venue(n, i))

beforeEach(() => {
  __resetAiQuestionQuotaLocal()
  h.state.streamOptions = null
  h.state.placeCalls = []
  h.state.providerRows = ROWS
  h.state.priceSnippets = [
    { title: 'Cơm Niêu Sài Gòn - không gian yên tĩnh', snippet: 'hợp gia đình, có chỗ đậu xe', evidence_scope: 'entity', evidence_about: 'Cơm Niêu Sài Gòn' },
    { title: 'Ốc Đào', snippet: 'quán rất đông, xếp hàng', evidence_scope: 'entity', evidence_about: 'Ốc Đào' },
    { title: 'bún bò ngon quận 1', snippet: 'tổng hợp', evidence_scope: 'batch' },
  ]
})
afterEach(() => { vi.unstubAllEnvs() })


const briefOf = (out: Record<string, unknown>) => out._tappy_brief as Record<string, any>

const COMBO = () => { vi.stubEnv('CONSULT_BRIEF', '1'); vi.stubEnv('CONSULT_V2', '1'); vi.stubEnv('CONSULTATIVE_V1', '1'); vi.stubEnv('CONSULT_LUNA', '1') }

/** Under CONSULT_V2 a decision turn is searched server-side BEFORE the model call: the tool result (with the Brief) is already in the model's messages. */
const toolResult = async (): Promise<Record<string, unknown>> => {
  const msgs = (h.state.streamOptions?.messages ?? []) as Array<{ role: string; content: unknown }>
  for (const m of msgs) {
    if (m.role === 'tool' && Array.isArray(m.content)) {
      for (const part of m.content as Array<{ result?: Record<string, unknown> }>) if (part?.result && 'results' in part.result) return part.result
    }
  }
  return runPlaceTool({ query: 'quán ăn', location: 'Quận 1' })
}
const FULL_Q = 'Tìm quán ăn tối món Việt cho 2 người dưới 300k ở Quận 1' // dish + party + budget + area: sufficient, so the turn is a pick, not an ask

describe('flag combination', () => {
  it('CONSULT_BRIEF=1 · CONSULT_V2=1 · CONSULTATIVE_V1=1 · CONSULT_LUNA=1 resolve ON through the production predicates', async () => {
    COMBO()
    const { consultBriefEnabled } = await import('@/lib/ai/consultative/consultativeBrief')
    const { consultV2Enabled } = await import('@/lib/ai/consultative/consultBrain')
    const { consultativeV1Enabled } = await import('@/lib/config/product')
    const { consultLunaEnabled } = await import('@/lib/ai/consultative/luna')
    expect(consultBriefEnabled()).toBe(true)
    expect(consultV2Enabled()).toBe(true)
    expect(consultativeV1Enabled()).toBe(true)
    expect(consultLunaEnabled()).toBe(true)
  })
})

describe('CONSULT_BRIEF ON under the full combination — places', () => {
  beforeEach(() => COMBO())
  it('normal places: the Brief exists, its Pick IS the engine Pick recomputed from the same rows and text, and any ranking that travels names the same Pick', async () => {
    await post([{ role: 'user', content: FULL_Q }])
    const out = await toolResult()
    const b = briefOf(out)
    expect(b).toBeTruthy()
    const need = deriveNeedProfile([{ role: 'user', content: FULL_Q }])
    const engine = derivePickOrState(rankCandidates(normalizePlaces({ results: ROWS }), need), need)
    expect(b.pick.name).toBe(engine.pick!.candidate.name)
    expect(b.candidates[0].name).toBe(b.pick.name)
    // the engine ranking that travels beside the Brief (CONSULT_V2 consult trim) names the SAME Pick: one decision, not two
    const ranking = out._tappy_ranking as Record<string, unknown> | undefined
    if (ranking) expect(String(ranking.pick ?? (ranking.main_pick as Record<string, unknown> | undefined)?.name ?? b.pick.name)).toBe(b.pick.name)
    expect(system()).toContain('DAY LA QUYET DINH DA CO CUA HE THONG')
  })
  it('refinement (final fix A): "Có thể lên 300k nếu đáng." updates the Brief budget and the Pick is taken inside the new ceiling', async () => {
    h.state.providerRows = [
      { ...venue('Quán Rẻ', 0), price_range_text: '1-150.000 ₫' },
      { ...venue('Quán Vừa', 1), price_range_text: '1-190.000 ₫', rating_value: 4.5, google_rating: '4.50⭐ (500 đánh giá)', rating_count: 500 },
      { ...venue('Quán Hơn', 2), price_range_text: '1-280.000 ₫', rating_value: 4.9, google_rating: '4.90⭐ (500 đánh giá)', rating_count: 500 },
    ]
    await post([
      { role: 'user', content: 'Tìm quán ăn tối món Việt cho 2 người dưới 200k ở Quận 1' },
      { role: 'assistant', content: 'Mình chọn **Quán Vừa** — hợp ngân sách.' },
      { role: 'user', content: 'Có thể lên 300k nếu đáng.' },
    ])
    const b = briefOf(await toolResult())
    expect(b.constraints.budget).toMatchObject({ type: 'under', max: 300000 })
    expect(b.refinement.turns).toBe(2)
    expect(b.pick.name).toBe('Quán Hơn') // 4.9★ at 280k: inside the raised ceiling, eliminated by the old one
  })
  it('superlative (final fix B): "quán ăn gần nhất" → the nearest candidate is the Brief Pick, whatever the rating — and "nhất" is not a Japanese-cuisine priority', async () => {
    h.state.providerRows = [{ ...venue('Quán Xa Ngon', 0), distance_km: 3, rating_value: 4.9, google_rating: '4.90⭐ (900 đánh giá)' }, { ...venue('Quán Gần', 1), distance_km: 0.3, rating_value: 4.0, google_rating: '4.00⭐ (100 đánh giá)', rating_count: 100 }]
    await post([{ role: 'user', content: 'Tìm quán ăn gần nhất ở Quận 1' }])
    const b = briefOf(await toolResult())
    expect(b.pick.name).toBe('Quán Gần')
    expect(b.priorities.map((p: { key: string }) => p.key)).toEqual(['distance'])
  })
  it('household (final fix C): "đi với trẻ nhỏ" with supplied family evidence yields a Pick', async () => {
    h.state.providerRows = [{ ...venue('Quán Không Hợp Bé', 0), family_friendly: false }, { ...venue('Quán Hợp Bé', 1), family_friendly: true }]
    await post([{ role: 'user', content: 'Tìm quán ăn tối món Việt cho 4 người ở Quận 1, đi với trẻ nhỏ' }])
    const b = briefOf(await toolResult())
    expect(b.pick?.name).toBe('Quán Hợp Bé')
    expect(b.state ?? null).toBeNull()
  })
  it('no_evidence: candidates with nothing to rank on → pick null, state no_evidence', async () => {
    h.state.providerRows = ['Quán A1', 'Quán B2', 'Quán C3'].map((name, i) => ({ name, address: `${i} Lê Lợi, Quận 1`, maps_link: `https://maps.google.com/?cid=${i}`, place_id: `q${i}` }))
    await post([{ role: 'user', content: FULL_Q }])
    const b = briefOf(await toolResult())
    expect(b.pick).toBeNull()
    expect(b.state).toBe('no_evidence')
  })
  it('all_eliminated: every candidate removed by a hard constraint → pick null, state all_eliminated', async () => {
    h.state.providerRows = [{ ...venue('Quán Chưa Ổn 1', 0), family_friendly: false }, { ...venue('Quán Chưa Ổn 2', 1), family_friendly: false }]
    await post([{ role: 'user', content: 'Tìm quán ăn tối món Việt cho 4 người ở Quận 1, bắt buộc phù hợp cho bé' }])
    const b = briefOf(await toolResult())
    expect(b.pick).toBeNull()
    expect(b.state).toBe('all_eliminated')
  })
  it('flag OFF under the same other flags: no Brief, the prompt keeps the legacy rule (byte-identical path)', async () => {
    COMBO(); vi.stubEnv('CONSULT_BRIEF', '0')
    await post([{ role: 'user', content: FULL_Q }])
    expect(system()).not.toContain('DAY LA QUYET DINH DA CO CUA HE THONG')
    expect('_tappy_brief' in (await toolResult())).toBe(false)
  })
})
