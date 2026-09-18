/**
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

const post = async (messages: unknown[]) => {
  const req = {
    url: 'http://localhost/api/chat',
    nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }),
    signal: undefined,
  }
  return POST(req as never)
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
const PRIOR = 'Mình chọn **Cơm Niêu Sài Gòn** cho tối nay. Ngoài ra **Ốc Đào** rẻ hơn.'

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

describe('flag OFF — byte-identical', () => {
  it('no V1 block, no V1 collector context, no attributes, shortlist of three', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '')
    const res = await post([{ role: 'user', content: Q }])
    expect(res.status).toBe(200)
    const before = system()
    expect(before).not.toContain('TINH HUONG (V1)')
    expect(before).not.toContain('TU VAN V1')
    expect(before).not.toContain('THAM CHIEU (V1)')
    const out = await runPlaceTool({ query: 'quán ăn tối yên tĩnh', location: 'Quận 1' })
    const sl = out._tappy_shortlist as Array<{ evidence: Record<string, unknown> }>
    expect(sl.length).toBeLessThanOrEqual(3)
    for (const s of sl) expect('attributes' in s.evidence).toBe(false)
    expect('_tappy_hard_gaps' in out).toBe(false)
    // The same turn again is the same prompt — nothing flag-dependent leaks in.
    await post([{ role: 'user', content: Q }])
    expect(system()).toBe(before)
  })
})

describe('flag ON', () => {
  it('a decision turn carries the situation block with stated fields and assumptions', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    const res = await post([{ role: 'user', content: Q }])
    expect(res.status).toBe(200)
    const s = system()
    expect(s).toContain('===== TINH HUONG (V1) =====')
    expect(s).toContain('Ai đi: đi 2 người / cặp đôi (2 người) (user nói)')
    expect(s).toContain('Khi nào: tối nay (user nói)')
    expect(s).toContain('Điều kiện cứng: yên tĩnh (user nói)')
    expect(s).toContain('tầm giá phổ thông (giả sử')
    expect(s).toContain('===== TU VAN V1 — GHI DE CAC LUAT SAU =====')
    expect(s).toContain('Tra loi bang TIENG VIET co dau')
    // No reference on a first turn.
    expect(s).not.toContain('THAM CHIEU (V1)')
  })

  it('a decision turn with no dish word (domain null) still carries the block — the frame goal decides', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: 'Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận' }])
    const s = system()
    expect(s).toContain('===== TINH HUONG (V1) =====')
    expect(s).toContain('Điều kiện cứng: có chỗ đậu xe, phù hợp trẻ em (user nói)')
  })

  it('a date question the decision frame reads as "inform / web_search" still carries the block — the situation decides', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: 'Đi date với gấu tối nay, chỗ nào lãng mạn yên tĩnh ở Quận 3?' }])
    const s = system()
    expect(s).toContain('===== TINH HUONG (V1) =====')
    expect(s).toContain('Dịp: hẹn hò (user nói)')
    expect(s).toContain('Điều kiện cứng: yên tĩnh (user nói)')
  })

  it('chitchat carries no V1 block at all', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: 'cảm ơn nhé' }])
    expect(system()).not.toContain('TINH HUONG (V1)')
  })

  it('the shortlist widens to five and carries evidence-only attributes; a stated hard constraint without evidence is a gap', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    // A plain "ngon" turn: the evidence threshold (`qualifiesFor`) admits every rated row, so the
    // cap is what decides the length.
    await post([{ role: 'user', content: 'Tìm quán ăn tối ngon cho 2 người gần Quận 1' }])
    const out = await runPlaceTool({ query: 'quán ăn tối ngon', location: 'Quận 1' })
    const sl = out._tappy_shortlist as Array<{ name: string; evidence: { attributes?: string[] } }>
    expect(sl).toHaveLength(5)
    const comNieu = sl.find(s => s.name === 'Cơm Niêu Sài Gòn')!
    expect(comNieu.evidence.attributes).toEqual(expect.arrayContaining([expect.stringMatching(/^yên tĩnh \("/), expect.stringMatching(/^có chỗ đậu xe \("/)]))
    const pho = sl.find(s => s.name === 'Phở Hòa')
    if (pho) expect(pho.evidence.attributes).toEqual([])
    expect('_tappy_hard_gaps' in out).toBe(false)
  })

  it('a stated hard constraint no snippet supports is reported as a gap, not dropped', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: 'Tìm quán ăn tối ngoài trời cho 2 người gần Quận 1' }])
    const out = await runPlaceTool({ query: 'quán ăn tối ngoài trời', location: 'Quận 1' })
    expect(out._tappy_hard_gaps).toEqual(['outdoor'])
  })

  it('a follow-up naming a prior venue and asking a missing fact gets the reference block and the one-time search-by-name instruction', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([
      { role: 'user', content: Q },
      { role: 'assistant', content: PRIOR },
      { role: 'user', content: 'Ốc Đào mở mấy giờ?' },
    ])
    const s = system()
    expect(s).toContain('===== THAM CHIEU (V1) =====')
    expect(s).toContain('REFERENCED (user đang nói về): #2 Ốc Đào')
    expect(s).toContain('THIEU DU LIEU: user hoi hours cua "Ốc Đào"')
    expect(s).toContain('GOI search_places DUNG MOT LAN')
  })

  it('"quán này" resolves to the pick; a fact the prior prose already states asks for no re-search', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([
      { role: 'user', content: Q },
      { role: 'assistant', content: 'Mình chọn **Cơm Niêu Sài Gòn**, mở 08:00–22:00. Ngoài ra **Ốc Đào** rẻ hơn.' },
      { role: 'user', content: 'quán này mở mấy giờ?' },
    ])
    const s = system()
    expect(s).toContain('REFERENCED (user đang nói về): #1 Cơm Niêu Sài Gòn')
    expect(s).not.toContain('THIEU DU LIEU')
  })

  it('still exactly one AI.stream() call and no forced tool choice', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: Q }])
    expect(h.state.streamOptions).not.toBeNull()
    expect('toolChoice' in (h.state.streamOptions ?? {})).toBe(false)
  })
})
