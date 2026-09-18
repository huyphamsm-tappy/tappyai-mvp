/**
 * MEMORY DRIFT — the route contract (Consultative V1).
 *
 * Measured 2026-09-18: after ~30 ordinary turns the accumulated `user_memory` row made the model
 * ask ("bạn muốn ăn gì?") instead of recommend — F7 and T4 recovered only after the row was
 * cleared. Three things are pinned here, on a user whose row already carries that residue:
 *
 *   1. READ — with the flag ON the prompt carries the capped consultative block whose instruction
 *      is "use it to choose, never to ask"; with the flag OFF the legacy block, byte-identical.
 *   2. WRITE — with the flag ON a plain request pays NO extraction call and leaves its topic in
 *      `history` deterministically; a statement about the user still pays the call, and that call
 *      reads the LATEST user turn only.
 *   3. Flag OFF keeps the legacy default-YES gate.
 *
 * Same harness as consultativeV1.route.test.ts: the model is mocked to capture its options and
 * `onFinish` is invoked by hand to exercise the write path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = {
    streamOptions: null as Record<string, unknown> | null,
    generateCalls: [] as string[],
    upserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
    memoryRow: null as Record<string, unknown> | null,
  }
  const builder = (table: string): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: table === 'user_memory' ? state.memoryRow : null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: (row: Record<string, unknown>) => { state.upserts.push({ table, row }); return Promise.resolve({ data: null, error: null }) },
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: (table: string) => builder(table), rpc: () => Promise.resolve({ data: null, error: null }) } }
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
    generate: (opts: { prompt?: string }) => {
      h.state.generateCalls.push(String(opts.prompt ?? ''))
      return Promise.resolve({ text: '{"preferences":{"avoid":["hải sản"]},"history":["dị ứng hải sản"]}', usage: { promptTokens: 900, completionTokens: 40 } })
    },
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    searchPlaces: async (_query: string, location?: string) => ({
      source: 'test', count: 0, location: location ?? '', results: [], price_search_results: [],
      google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'empty',
    }),
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
const system = () => String(h.state.streamOptions?.system ?? '')
const finish = async () => {
  const onFinish = h.state.streamOptions?.onFinish as (a: unknown) => Promise<void>
  await onFinish({ usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop', text: 'Mình chọn **Quán A**.', steps: [] })
}
const memoryUpserts = () => h.state.upserts.filter(u => u.table === 'user_memory').map(u => u.row)

/** The residue a real user accumulates under the legacy write path (see memoryBlock.test.ts). */
const LEGACY_LARGE = {
  location_base: 'Sài Gòn', discovery_city: 'Đà Nẵng', companions: 'gia đình 4 người', timing: '3 ngày 2 đêm', personality: null,
  preferences: {
    food: ['bún bò', 'phở', 'lẩu', 'hải sản', 'cơm tấm', 'bánh mì', 'sushi', 'bò né'],
    entertainment: ['chỗ đậu xe ô tô', 'phòng riêng', 'khách sạn gần biển'],
    shopping: ['tai nghe bluetooth', 'laptop văn phòng', 'nồi chiên không dầu'],
  },
  budget: { food: { min: 0, max: 80000 } },
  history: ['quán ăn Quận 1', 'bún bò Quận 1', 'mua laptop văn phòng', 'trip Đà Nẵng 3 ngày 2 đêm', 'khách sạn Đà Nẵng gần biển'],
  updated_at: '2026-09-18T00:00:00Z',
}

const PLAIN = 'ăn gì ngon giờ ở Quận 1'
const DURABLE = 'Mình bị dị ứng hải sản'

beforeEach(() => {
  __resetAiQuestionQuotaLocal()
  h.state.streamOptions = null
  h.state.generateCalls = []
  h.state.upserts = []
  h.state.memoryRow = LEGACY_LARGE
})
afterEach(() => { vi.unstubAllEnvs() })

describe('flag ON — a large legacy memory informs the pick, never the question', () => {
  it('the prompt carries the capped consultative block, not the legacy "ask first" one', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    const res = await post([{ role: 'user', content: PLAIN }])
    expect(res.status).toBe(200)
    const sys = system()
    expect(sys).toContain('KHONG BAO GIO hoi lai vi thong tin tren')
    expect(sys).not.toContain('hoi lai mot cau ngan de xac nhan TRUOC KHI tim kiem')
    expect(sys).not.toContain('Diem den dang quan tam')
    // capped: the 4 newest food values, never the whole list
    expect(sys).toContain('cơm tấm, bánh mì, sushi, bò né')
    expect(sys).not.toContain('bún bò, phở, lẩu')
    expect(sys).toContain('diem den tung hoi: Đà Nẵng')
  })

  it('a plain request pays no extraction call and leaves its topic in history', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: PLAIN }])
    await finish()
    expect(h.state.generateCalls).toHaveLength(0)
    const rows = memoryUpserts()
    expect(rows).toHaveLength(1)
    expect(rows[0].history).toEqual([...LEGACY_LARGE.history, PLAIN])
    // history only — no other column is rewritten by the topic write
    expect(Object.keys(rows[0]).sort()).toEqual(['history', 'updated_at', 'user_id'])
  })

  it('a follow-up inside a thread writes nothing at all', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: PLAIN }, { role: 'assistant', content: 'Mình chọn **Quán A**.' }, { role: 'user', content: 'quán này mở mấy giờ?' }])
    await finish()
    expect(h.state.generateCalls).toHaveLength(0)
    expect(memoryUpserts()).toHaveLength(0)
  })

  it('a statement about the user still pays the call — on the LATEST user turn only', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '1')
    await post([{ role: 'user', content: PLAIN }, { role: 'assistant', content: 'Mình chọn **Quán A**.' }, { role: 'user', content: DURABLE }])
    await finish()
    expect(h.state.generateCalls).toHaveLength(1)
    expect(h.state.generateCalls[0]).toContain(DURABLE)
    expect(h.state.generateCalls[0]).not.toContain(PLAIN)
    const rows = memoryUpserts()
    expect(rows).toHaveLength(1)
    expect((rows[0].preferences as Record<string, string[]>).avoid).toEqual(['hải sản'])
    // the legacy lists are merged, not wiped, by a write that adds one constraint
    expect((rows[0].preferences as Record<string, string[]>).food).toEqual(LEGACY_LARGE.preferences.food)
  })
})

describe('flag OFF — legacy behaviour, byte-identical', () => {
  it('the legacy block and the default-YES gate', async () => {
    vi.stubEnv('CONSULTATIVE_V1', '')
    await post([{ role: 'user', content: PLAIN }])
    const sys = system()
    expect(sys).toContain('hoi lai mot cau ngan de xac nhan TRUOC KHI tim kiem')
    expect(sys).toContain('an uong: bún bò, phở, lẩu, hải sản, cơm tấm, bánh mì, sushi, bò né')
    expect(sys).not.toContain('KHONG BAO GIO hoi lai')
    await finish()
    expect(h.state.generateCalls).toHaveLength(1)
  })
})
