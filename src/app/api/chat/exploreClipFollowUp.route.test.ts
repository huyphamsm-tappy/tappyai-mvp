/**
 * "Hỏi Tappy về chỗ này" — the FOLLOW-UP turns, proven through the real route.
 *
 * After the first reply the page saves the thread and moves to `/chat/<id>`. From then on the
 * request body is rebuilt from the saved row — and the saved row now carries the clip reference
 * on its first message (`lib/chat/savedContext.ts`), so every follow-up still sends
 * `context: { kind:'explore_clip', reviewId }`. This file pins what the route does with that
 * context on turns TWO and later, with the whole history in `messages`:
 *
 *   - an ordinary follow-up ("ở đâu?", "giờ mở cửa?") narrows to the clip's venue
 *   - an AREA the user typed after being asked for one does NOT become a discovery search
 *   - "gần đây" / "ngon hơn" on their own do not escape the target
 *   - an explicit "gợi ý thêm 3 quán" yields exactly three alternatives, framed as such,
 *     and the very next turn is about the venue again
 *   - ambiguous stays ambiguous (no pick); unresolved stays empty (no strangers)
 *   - the same follow-up WITHOUT the context is plain discovery — the bug this closes
 *
 * Same harness as `exploreClipContext.route.test.ts`: the model is mocked to capture its
 * options, the place provider to return fixed rows. Nothing about providers or ranking changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const REVIEW = '9d4cdf3b-a93f-427c-880a-9950472e3705'
const OTHER = 'af7dfbea-b41f-41e3-853c-9a5403ca1f3d'

const h = vi.hoisted(() => {
  const state = {
    /** What `from('reviews')…maybeSingle()` resolves to. */
    reviewRow: null as Record<string, unknown> | null,
    reviewQueries: [] as Array<{ filters: Array<[string, unknown]> }>,
    streamOptions: null as Record<string, unknown> | null,
    placeCalls: [] as Array<{ query: string; location: string | undefined }>,
    /** What the mocked provider returns. Each row object is preserved by reference. */
    providerRows: [] as Array<Record<string, unknown>>,
    /** Every `upsert` the route issued, by table — the `ask_tappy_place` metric row lands here. */
    upserts: [] as Array<{ table: string; rows: unknown; opts: unknown }>,
  }
  const builder = (table: string): any => {
    const q = { filters: [] as Array<[string, unknown]> }
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      gte: () => b, lt: () => b, not: () => b, is: () => b,
      eq: (k: string, v: unknown) => { q.filters.push([k, v]); return b },
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => {
        if (table === 'reviews') { state.reviewQueries.push(q); return Promise.resolve({ data: state.reviewRow, error: null }) }
        return Promise.resolve({ data: null, error: null })
      },
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: (rows: unknown, opts: unknown) => { state.upserts.push({ table, rows, opts }); return Promise.resolve({ data: null, error: null }) },
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
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
// Only the place tool is captured; every other export of the module is the real one.
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    searchPlaces: async (query: string, location?: string) => {
      h.state.placeCalls.push({ query, location })
      const rows = h.state.providerRows
      return {
        source: 'test', count: rows.length, location: location ?? '', results: rows,
        google_maps_search: 'https://maps.google.com/maps?q=test',
        place_search_status: rows.length ? 'has_results' : 'empty',
      }
    },
  }
})

import { POST } from '@/app/api/chat/route'

const ROW = {
  id: REVIEW,
  place_name: 'Bún bò Huế Cô Ba',
  place_address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
  body: 'Ngon bá cháy',
  hashtags: ['bunbo'],
}

const post = async (body: unknown) => {
  const req = {
    url: 'http://localhost/api/chat',
    nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve(body),
    signal: undefined,
  }
  return POST(req as never)
}

const QUESTION = 'Cho mình biết thêm về Bún bò Huế Cô Ba'
const system = () => String(h.state.streamOptions?.system ?? '') + String(h.state.streamOptions?.systemShared ?? '')
const tools = () => (h.state.streamOptions?.tools ?? {}) as Record<string, { execute: (a: unknown, o?: unknown) => Promise<unknown> }>
const runPlaceTool = (args: { query: string; location?: string }) => tools().search_places.execute(args, {})

beforeEach(() => {
  // Every test here is a fresh turn for the same account. The shared AI question quota (15/day,
  // in-process here) would otherwise run out partway through the file and refuse the later turns.
  __resetAiQuestionQuotaLocal()
  h.state.reviewRow = null
  h.state.reviewQueries = []
  h.state.streamOptions = null
  h.state.placeCalls = []
  h.state.providerRows = []
  h.state.upserts = []
})

// ── Venue fixtures for the narrowing tests ─────────────────────────────────
const venue = (name: string, address: string, extra: Record<string, unknown> = {}) => ({
  name, address, rating: 4.4, user_ratings_total: 200, phone: '028 1234 5678',
  opening_hours: 'Mo-Su 08:00-22:00', website_uri: 'https://example.test', maps_link: 'https://maps.google.com/?q=x', ...extra,
})
const GOC_HUE_ROW = venue('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Phường Nguyễn Thái Bình, Quận 1, Thành phố Hồ Chí Minh')
const NEIGHBOURS = [
  venue('Bún Bò Huế Đông Ba', '110A Nguyễn Du, Quận 1, TP.HCM'),
  venue('Cơm Tấm Cali', '32 Nguyễn Thái Bình, Quận 1, TP.HCM'),
  venue('Quán Huế Ngon', '5 Lê Thị Hồng Gấm, Quận 1, TP.HCM'),
  venue('Phở Hòa Pasteur', '260C Pasteur, Quận 3, TP.HCM'),
  venue('Nhà hàng Ngon 138', '138 Nam Kỳ Khởi Nghĩa, Quận 1, TP.HCM'),
  venue('Bún Chả Hà Nội', '10 Calmette, Quận 1, TP.HCM'),
  venue('Huế Xưa Quán', '44 Ký Con, Quận 1, TP.HCM'),
]
const GOC_HUE_REVIEW = {
  id: REVIEW,
  place_name: 'GÓC HUẾ - Nguyễn Thái Bình',
  place_address: '155 Nguyễn Thái Bình, Quận 1, TP.HCM',
  body: 'Bún bò chuẩn vị Huế',
  hashtags: ['hue'],
}
const toolResult = async (args: { query: string; location?: string }) =>
  (await runPlaceTool(args)) as Record<string, unknown>


const CTX = { kind: 'explore_clip', reviewId: REVIEW }
const FIRST_Q = 'Cho mình biết thêm về GÓC HUẾ - Nguyễn Thái Bình'
const FIRST_A = 'GÓC HUẾ - Nguyễn Thái Bình là quán bún bò Huế ở Quận 1…'
/** A thread as `/chat/<id>` replays it: the first exchange, then the later turns, user first. */
const thread = (...later: string[]) => [
  { role: 'user', content: FIRST_Q },
  { role: 'assistant', content: FIRST_A },
  ...later.map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content })),
]
/** The exchange that produced the bug: the assistant asked for an area, the user typed one. */
const askedForArea = () => [
  { role: 'user', content: FIRST_Q },
  { role: 'assistant', content: 'Bạn muốn tìm ở khu vực nào?' },
  { role: 'user', content: 'Quận 1' },
]

describe('A/B · the venue survives the /chat → /chat/<id> move and every ordinary follow-up', () => {
  it.each(['ở đâu?', 'giờ mở cửa?', 'Quán có chỗ đậu xe không?', 'Giá ở đây khoảng bao nhiêu?'])(
    'turn two "%s" narrows to the ONE venue', async (q) => {
      h.state.reviewRow = GOC_HUE_REVIEW
      h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
      const res = await post({ messages: thread(q), context: CTX })
      expect(res.status).toBe(200)
      expect(system()).toContain('source=explore_clip')
      const out = await toolResult({ query: 'GÓC HUẾ' })
      expect(out._tappy_clip_target).toBe('resolved')
      const rows = out.results as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject(GOC_HUE_ROW)
      expect('alternatives_instruction' in out).toBe(false)
    },
  )

  it('turn four is still the venue — a long thread does not drift', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
    await post({ messages: thread('ở đâu?', 'Ở 155 Nguyễn Thái Bình, Quận 1.', 'giờ mở cửa?'), context: CTX })
    const out = await toolResult({ query: 'GÓC HUẾ' })
    expect(out._tappy_clip_target).toBe('resolved')
    expect((out.results as unknown[]).length).toBe(1)
  })
})

describe('F · the observed bug: Tappy asked for an area, the user typed one', () => {
  it('WITH the context the area only feeds the search — the venue is still the target when it is found', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
    await post({ messages: askedForArea(), context: CTX })
    const out = await toolResult({ query: 'GÓC HUẾ', location: 'Quận 1' })
    expect(h.state.placeCalls[0].location).toBe('Quận 1')
    expect(out._tappy_clip_target).toBe('resolved')
    expect((out.results as Array<Record<string, unknown>>).map(r => r.name)).toEqual([GOC_HUE_ROW.name])
  })

  it('WITH the context and NO matching row, the area does not buy unrelated recommendations: empty, unresolved, no strangers', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [...NEIGHBOURS]
    await post({ messages: askedForArea(), context: CTX })
    const out = await toolResult({ query: 'GÓC HUẾ', location: 'Quận 1' })
    expect(out._tappy_clip_target).toBe('unresolved')
    expect(out.results).toEqual([])
    expect(out.place_search_status).toBe('empty')
    expect(String(out.no_results_instruction)).toMatch(/KHONG XAC MINH DUOC/)
    expect(String(out.no_results_instruction)).toMatch(/KHONG gioi thieu quan khac/)
    expect('_tappy_ranking' in out).toBe(false)
  })

  it('WITHOUT the context (what turn two used to send) the same request is plain discovery — every stranger comes back', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [...NEIGHBOURS]
    await post({ messages: askedForArea() })
    expect(system()).not.toContain('source=explore_clip')
    const out = await toolResult({ query: 'bún bò Huế', location: 'Quận 1' })
    expect((out.results as unknown[]).length).toBe(NEIGHBOURS.length)
    expect('_tappy_clip_target' in out).toBe(false)
  })
})

describe('D/E · "gần đây" and "ngon hơn" on their own stay on the venue', () => {
  it.each(['gần đây', 'Có gần đây không?', 'ngon hơn', 'Quán này ngon hơn không?', 'gần đây có gì chơi?'])(
    '"%s" is a question about THIS place', async (q) => {
      h.state.reviewRow = GOC_HUE_REVIEW
      h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
      await post({ messages: thread(q), context: CTX })
      const out = await toolResult({ query: 'GÓC HUẾ' })
      expect(out._tappy_clip_target).toBe('resolved')
      expect((out.results as unknown[]).length).toBe(1)
      expect('alternatives_instruction' in out).toBe(false)
    },
  )
})

describe('C · explicit alternatives: exactly what was asked for, framed as alternatives, target kept', () => {
  it('"gợi ý thêm 3 quán" → three rows, none of them the target, with the alternatives framing', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [NEIGHBOURS[0], GOC_HUE_ROW, ...NEIGHBOURS.slice(1)]
    await post({ messages: thread('gợi ý thêm 3 quán'), context: CTX })
    const out = await toolResult({ query: 'bún bò Huế' })
    const rows = out.results as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.name)).toEqual(NEIGHBOURS.slice(0, 3).map(r => r.name))
    expect(rows.map(r => r.name)).not.toContain(GOC_HUE_ROW.name)
    expect(out.count).toBe(3)
    expect('_tappy_clip_target' in out).toBe(false)
    expect(out._tappy_clip_alternatives).toEqual({ of: GOC_HUE_REVIEW.place_name, requested: 3 })
    expect(String(out.alternatives_instruction)).toMatch(/LUA CHON THAY THE/)
    expect(String(out.alternatives_instruction)).toContain(GOC_HUE_REVIEW.place_name)
  })

  it('"cho mình 5 chỗ khác" → five', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
    await post({ messages: thread('cho mình 5 chỗ khác'), context: CTX })
    const out = await toolResult({ query: 'bún bò Huế' })
    expect((out.results as unknown[]).length).toBe(5)
    expect(out._tappy_clip_alternatives).toEqual({ of: GOC_HUE_REVIEW.place_name, requested: 5 })
  })

  it('the turn AFTER the alternatives is about the venue again — alternatives never replaced the target', async () => {
    h.state.reviewRow = GOC_HUE_REVIEW
    h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
    await post({
      messages: thread('gợi ý thêm 3 quán', 'Ngoài Góc Huế còn có Bún Bò Huế Đông Ba, Cơm Tấm Cali, Quán Huế Ngon.', 'ở đâu?'),
      context: CTX,
    })
    const out = await toolResult({ query: 'GÓC HUẾ' })
    expect(out._tappy_clip_target).toBe('resolved')
    expect((out.results as Array<Record<string, unknown>>).map(r => r.name)).toEqual([GOC_HUE_ROW.name])
    expect('alternatives_instruction' in out).toBe(false)
  })
})

describe('G · ambiguous on a follow-up stays ambiguous — the model is not handed the choice', () => {
  it('two branches, no clip address: both kept, nothing else, no ranking pick, ask-which-branch instruction', async () => {
    const a = venue('GÓC HUẾ - Nguyễn Thái Bình', '155 Nguyễn Thái Bình, Quận 1, TP.HCM')
    const b = venue('GÓC HUẾ - Ân Dương', '12 Ân Dương, Quận 7, TP.HCM')
    h.state.reviewRow = { ...GOC_HUE_REVIEW, place_name: 'GÓC HUẾ', place_address: '' }
    h.state.providerRows = [NEIGHBOURS[0], a, NEIGHBOURS[1], b, NEIGHBOURS[2]]
    await post({ messages: thread('giờ mở cửa?'), context: CTX })
    const out = await toolResult({ query: 'GÓC HUẾ' })
    expect(out._tappy_clip_target).toBe('ambiguous')
    expect((out.results as Array<Record<string, unknown>>).map(r => r.name)).toEqual([a.name, b.name])
    expect('_tappy_ranking' in out).toBe(false)
    expect('_tappy_shortlist' in out).toBe(false)
    expect(String(out.no_results_instruction)).toMatch(/NHIEU DIA DIEM CUNG TEN/)
  })
})

describe('H · ordinary chat is untouched', () => {
  it('a thread with no context: no clip block, no review read, no narrowing, no alternatives framing, all rows', async () => {
    h.state.providerRows = [...NEIGHBOURS, GOC_HUE_ROW]
    await post({ messages: [
      { role: 'user', content: 'Quán bún bò nào ngon ở Quận 1?' },
      { role: 'assistant', content: 'Có vài quán…' },
      { role: 'user', content: 'gợi ý thêm 3 quán' },
    ] })
    expect(system()).not.toContain('source=explore_clip')
    expect(h.state.reviewQueries).toHaveLength(0)
    const out = await toolResult({ query: 'bún bò', location: 'Quận 1' })
    expect((out.results as unknown[]).length).toBe(NEIGHBOURS.length + 1)
    expect('_tappy_clip_target' in out).toBe(false)
    expect('_tappy_clip_alternatives' in out).toBe(false)
    expect('alternatives_instruction' in out).toBe(false)
  })
})
