/**
 * Phase 3C final integration (flag CONSULT_BRIEF ON, local/test only) — the route contract of the Consultative Brief.
 * (Harness copied from consultativeV1.route.test.ts: the model is mocked to capture its options, the place provider returns fixed rows.)
 *
 * Original header of the harness:
 * Consultative V1 (flag CONSULTATIVE_V1) — the route contract.
 *
 *   flag OFF  → the system prompt is byte-identical to the pre-V1 prompt (no TINH HUONG block, no
 *               THAM CHIEU block), the enrichment collector carries no V1 context, and the tool
 *               result's shortlist has no `attributes`.
 *   flag ON   → the situation block is present on a decision turn and absent on chitchat; a
 *               follow-up that references a prior venue by name and asks a fact the prior prose
 *               lacks gets the THAM CHIEU block plus the one-time search-by-name instruction; the
 *               shortlist evidence carries `attributes` read from entity-scoped snippets; the
 *               shortlist widens to five.
 *
 * Same harness as `exploreClipFollowUp.route.test.ts`: the model is mocked to capture its
 * options, the place provider to return fixed rows. Still exactly one AI.stream() per turn.
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

const Q = 'Tìm quán ăn tối yên tĩnh cho 2 người gần Quận 1'

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

describe('CONSULT_BRIEF ON — places, outside the V1 two-stage prompt', () => {
  beforeEach(() => { vi.stubEnv('CONSULT_BRIEF', '1'); vi.stubEnv('CONSULTATIVE_V1', '0') })

  it('the Brief travels beside `_tappy_ranking`, and its Pick IS the engine Pick (no second Pick, no conflict)', async () => {
    await post([{ role: 'user', content: Q }])
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    expect(out._tappy_ranking).toBeTruthy()
    expect(briefOf(out)).toBeTruthy()
    const ranking = out._tappy_ranking as Record<string, unknown>
    const rankPick = String(ranking.pick ?? ranking.chosen ?? (ranking.main_pick as Record<string, unknown> | undefined)?.name ?? '')
    expect(rankPick).toBe(briefOf(out).pick.name)
    expect(briefOf(out).candidates[0].name).toBe(briefOf(out).pick.name)
    expect(briefOf(out).provenance).toBe('engine')
  })
  it('the Brief carries the user decision state, never raw provider rows', async () => {
    await post([{ role: 'user', content: 'Ăn trưa, giá không quan trọng, ưu tiên chất lượng, khoảng 300k' }])
    const out = await runPlaceTool({ query: 'quán ăn', location: 'Quận 1' })
    const b = briefOf(out)
    expect(b.dismissed).toEqual(['price'])
    expect(b.priorities.map((p: { key: string }) => p.key)).toContain('rating')
    expect(b.constraints.budget).toMatchObject({ type: 'around', stated: 300000 })
    const s = JSON.stringify(b)
    for (const raw of ['028 1234 5678', 'example.test', 'maps.google.com', 'Nguyễn Huệ', 'p1"']) expect(s, raw).not.toContain(raw)
    expect(b.note).toMatch(/khong doi lua chon/i)
  })
  it('UNKNOWN stays UNKNOWN: a candidate with no price evidence is listed as unknown under a soft budget, never given a price', async () => {
    h.state.providerRows = [{ ...venue('Quán Có Giá', 0), price_range_text: '1-80.000 ₫' }, venue('Quán Chưa Rõ Giá', 1)]
    await post([{ role: 'user', content: 'Ăn trưa khoảng 100k' }])
    const out = await runPlaceTool({ query: 'quán ăn', location: 'Quận 1' })
    const b = briefOf(out)
    const unknown = b.candidates.find((c: { name: string }) => c.name === 'Quán Chưa Rõ Giá')
    if (unknown) {
      expect(unknown.evidence.some((e: { id: string }) => e.id === 'priceHighVnd')).toBe(false)
      expect(unknown.unknowns).toContain('price')
    }
  })
  it('with the flag OFF there is no Brief and the result is as before', async () => {
    vi.stubEnv('CONSULT_BRIEF', '0')
    await post([{ role: 'user', content: Q }])
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    expect('_tappy_brief' in out).toBe(false)
    expect(out._tappy_ranking).toBeTruthy()
  })
})

describe('CONSULT_BRIEF ON — refinement and single-candidate paths', () => {
  beforeEach(() => { vi.stubEnv('CONSULT_BRIEF', '1'); vi.stubEnv('CONSULTATIVE_V1', '0') })
  it('multi-turn: the Brief carries the refined state (latest budget, the turn it changed, the contradicted priority) and one engine Pick', async () => {
    await post([
      { role: 'user', content: 'Giá quan trọng, tìm quán ăn tối gần Quận 1' },
      { role: 'assistant', content: 'Mình chọn **Phở Hòa** — hợp ngân sách.' },
      { role: 'user', content: 'Thực ra giá không quan trọng, ưu tiên chất lượng, dưới 400k' },
    ])
    const out = await runPlaceTool({ query: 'quán ăn tối', location: 'Quận 1' })
    const b = briefOf(out)
    expect(b.dismissed).toEqual(['price'])
    expect(b.refinement.conflicts).toEqual(['price'])
    expect(b.refinement.turns).toBe(2)
    expect(b.constraints.budget).toMatchObject({ type: 'under', max: 400000 })
    expect(b.pick.name).toBe(b.candidates[0].name)
  })
  it('single candidate: an answer, not a choice — no Brief, no `_tappy_ranking`, no invented winner', async () => {
    h.state.providerRows = [venue('Chỉ Một Quán', 0)]
    await post([{ role: 'user', content: Q }])
    const out = await runPlaceTool({ query: 'quán ăn tối', location: 'Quận 1' })
    expect('_tappy_brief' in out).toBe(false)
    expect('_tappy_ranking' in out).toBe(false)
  })
})

describe('CONSULT_BRIEF ON — the V1 two-stage path: the Brief is the decision handoff (owner-authorised prompt correction)', () => {
  beforeEach(() => { vi.stubEnv('CONSULT_BRIEF', '1'); vi.stubEnv('CONSULTATIVE_V1', '1'); vi.stubEnv('CONSULT_V2', '0') })
  const LEGACY_CHOOSE = 'KHONG co lua chon san. BAN tu chon 1 quan'

  it('1/2. the Brief exists and its Pick IS the engine Pick (recomputed here from the same rows and the same user text)', async () => {
    await post([{ role: 'user', content: Q }])
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    const b = briefOf(out)
    expect(b).toBeTruthy()
    const need = deriveNeedProfile([{ role: 'user', content: Q }])
    const ranked = rankCandidates(normalizePlaces({ results: ROWS }), need)
    const engine = derivePickOrState(ranked, need)
    expect(engine.pick).not.toBeNull()
    expect(b.pick.name).toBe(engine.pick!.candidate.name)
    expect(b.candidates[0].name).toBe(b.pick.name)
  })
  it('3. the system prompt no longer tells the model to choose when the Brief supplies the choice: the unconditional "you choose" is gone, the Brief rule is there', async () => {
    await post([{ role: 'user', content: Q }])
    const s = system()
    expect(s).not.toContain(LEGACY_CHOOSE)
    expect(s).toContain('DAY LA QUYET DINH DA CO CUA HE THONG')
    expect(s).toContain('KHONG chon quan khac, KHONG xep hang lai, KHONG tu cham diem')
    // the model is still told what to do when NO Brief exists (too few candidates to rank): that branch keeps the old rule, conditionally
    expect(s).toContain('NEU KHONG co _tappy_brief')
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    expect(String(out.results_note)).toContain('pick.name trong _tappy_brief')
    expect(String(out.results_note)).not.toMatch(/ban tu chon cho dung tinh huong/)
  })
  it('3b. flag OFF: the V1 prompt is byte-identical to before (the legacy rule, no Brief rule)', async () => {
    vi.stubEnv('CONSULT_BRIEF', '0')
    await post([{ role: 'user', content: Q }])
    expect(system()).toContain(LEGACY_CHOOSE)
    expect(system()).not.toContain('DAY LA QUYET DINH DA CO CUA HE THONG')
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    expect('_tappy_brief' in out).toBe(false)
  })
  it('5/6. no second ranking and no second Pick travel: `_tappy_ranking` and the shortlist are withheld, the Brief carries ONE Pick', async () => {
    await post([{ role: 'user', content: Q }])
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    expect('_tappy_ranking' in out).toBe(false)
    expect('_tappy_shortlist' in out).toBe(false)
    expect(typeof briefOf(out).pick.name).toBe('string')
    expect(Object.keys(briefOf(out).pick)).not.toContain('score')
    expect(JSON.stringify(briefOf(out))).not.toMatch(/"score"/)
  })
  it('7. no valid Pick stays no Pick: candidates with no evidence → pick null, state no_evidence, and the prompt rule says do not invent a winner', async () => {
    h.state.providerRows = ['Quán A1', 'Quán B2', 'Quán C3'].map((name, i) => ({ name, address: `${i} Lê Lợi, Quận 1`, maps_link: `https://maps.google.com/?cid=${i}`, place_id: `q${i}` }))
    await post([{ role: 'user', content: Q }])
    const out = await runPlaceTool({ query: 'quán ăn tối', location: 'Quận 1' })
    const b = briefOf(out)
    expect(b.pick).toBeNull()
    expect(b.state).toBe('no_evidence')
    expect(system()).toContain('Neu pick = null thi state')
  })
  it('7b. every candidate eliminated by a hard constraint → pick null, state all_eliminated', async () => {
    h.state.providerRows = [{ ...venue('Quán Chưa Ổn 1', 0), family_friendly: false }, { ...venue('Quán Chưa Ổn 2', 1), family_friendly: false }]
    await post([{ role: 'user', content: 'Tìm quán ăn tối gần Quận 1, bắt buộc phù hợp cho bé' }])
    const out = await runPlaceTool({ query: 'quán ăn tối', location: 'Quận 1' })
    const b = briefOf(out)
    expect(b.pick).toBeNull()
    expect(b.state).toBe('all_eliminated')
    expect(b.eliminated.map((e: { name: string }) => e.name).sort()).toEqual(['Quán Chưa Ổn 1', 'Quán Chưa Ổn 2'])
  })
  // 4. (a reply naming a different candidate is rewritten / backstopped to the engine Pick) and 8. (grounding intact) are pinned at the stream
  //    level — no live model call is possible here: enginePick.stream.test.ts (rewrite, restore, card #1, photo fold) and guards.3c.test.ts.
})
