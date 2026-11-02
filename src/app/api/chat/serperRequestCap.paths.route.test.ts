/**
 * Pre-baseline hardening · which Serper paths of the REAL chat route are held by CONSULT_REQUEST_CAP — one scenario per turn shape that reaches them.
 * MOCK ONLY: the route's own POST, a fake model (`AI` stub; it only returns a fixed answer), a fake Supabase, and a stub network that answers ONLY
 * google.serper.dev (everything else throws). Counts are the requests that reach that stub.
 *
 * What a scenario proves: (1) with the flag OFF the turn really sends its requests and the kind of request that identifies the path is among them
 * (the path was REACHED — a path that is not reached proves nothing); (2) with the flag ON a cap of 1 and a cap one below what the turn wants hold the count,
 * and every refusal is for the cap — never for a missing turn object (so the request had the turn); (3) with the flag ON and no/invalid value NOTHING is sent
 * (fail-closed) and the turn still answers. What it does NOT prove: Luna, the real model wrapper, Next.js, Vercel, the real network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap, requestCapTotals } from '@/lib/ai/tools/serperRequestCap'

const h = vi.hoisted(() => {
  const state = { calls: [] as Array<{ endpoint: string; q: string }>, answer: 'ok', logs: [] as string[] }
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-cap-paths' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response(`0:${JSON.stringify(h.state.answer)}\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`, { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: () => Promise.resolve({ text: 'ok', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))
import { POST } from '@/app/api/chat/route'

const PLACE_ROW = { title: 'Phở Thử Nghiệm Một', address: '12 Lê Lợi, Quận 1, Hồ Chí Minh', latitude: 10.77, longitude: 106.70, rating: 4.5, ratingCount: 321, priceLevel: '₫₫', type: 'Quán phở', types: ['Quán phở'], phoneNumber: '+84 900 000 001', openingHours: { 'Thứ Bảy': '06:00–22:00' }, thumbnailUrl: 'https://lh3.googleusercontent.com/x', cid: '111' }
const prevKey = process.env.SERPER_API_KEY
beforeEach(() => {
  process.env.SERPER_API_KEY = 'test-key-not-real'; delete process.env.TAPPY_AGENT
  h.state.calls = []; h.state.logs = []; h.state.answer = 'ok'
  __clearToolCache(); __resetAiQuestionQuotaLocal(); __resetRequestCap()
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { h.state.logs.push(String(a[0])) })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    const u = String(input)
    if (u.includes('google.serper.dev')) {
      const endpoint = new URL(u).pathname
      let q = ''
      try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
      h.state.calls.push({ endpoint, q })
      return new Response(JSON.stringify({ organic: [{ title: 'Serper hit', link: 'https://example.com/s', snippet: 'serper snippet' }], shopping: [{ title: 'Item', link: 'https://example.com/i', price: '1.000.000đ', source: 'Shop' }], places: endpoint === '/maps' ? [PLACE_ROW] : [], images: [], credits: 1 }), { status: 200 })
    }
    if (u.includes('duckduckgo.com')) return new Response('<html></html>', { status: 200 })
    throw new Error('network disabled in this test (a real request must never be made): ' + u.slice(0, 80))
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); if (prevKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevKey })

type Msg = { role: 'user' | 'assistant'; content: string }
interface Scenario { name: string; messages: Msg[]; answer?: string; legacy?: boolean; proof: Array<[string, (c: { endpoint: string; q: string }) => boolean]>; logProof?: RegExp }
const user = (content: string): Msg => ({ role: 'user', content })
const SCENARIOS: Scenario[] = [
  {
    name: 'shopping: search_products fan-out, vendor-link discovery and the after-loop photo',
    messages: [user('mua tai nghe bluetooth chụp tai dưới 1 triệu để nghe nhạc ở nhà')],
    proof: [
      ['a /shopping request', c => c.endpoint === '/shopping'],
      ['a merchant-sites search of search_products', c => c.endpoint === '/search' && /site:cellphones/.test(c.q)],
      ['the vendor-link discovery on a marketplace (/search … site:shopee.vn)', c => c.endpoint === '/search' && /site:shopee\.vn/.test(c.q)],
      ['an /images request (after the loop)', c => c.endpoint === '/images'],
    ],
  },
  {
    name: 'place turn: pre-search /maps, then the TikTok review lookup after the loop',
    messages: [user('quán phở ngon ở quận 1')],
    answer: '**Phở Thử Nghiệm Một** là lựa chọn tốt nhất cho bạn.',
    proof: [['a /maps request', c => c.endpoint === '/maps'], ['a TikTok lookup (/search … site:tiktok.com)', c => c.endpoint === '/search' && /site:tiktok\.com/.test(c.q)]],
    logProof: /tappyai_tiktok_enrichment/,
  },
  {
    name: 'trip plan: the pre-fetch (hotel + two place searches in parallel) and the discovery and photo that follow',
    messages: [
      user('đi Đà Lạt 3 ngày 2 đêm cho 2 người, ngân sách 5 triệu, thích núi'),
      { role: 'assistant', content: 'Mình gợi ý **Khách sạn Hoa Mai** và **Khách sạn Sương Mù** ở Đà Lạt.' },
      user('lên kế hoạch'),
    ],
    proof: [
      ['the hotel search (/maps for khách sạn)', c => c.endpoint === '/maps' && /khách sạn/.test(c.q)],
      ['the food search of the pre-fetch (/maps for quán … Đà Lạt)', c => c.endpoint === '/maps' && /quán/.test(c.q)],
      ['the attraction search of the pre-fetch (/maps for điểm tham quan)', c => c.endpoint === '/maps' && /điểm tham quan/.test(c.q)],
      ['the CCP hotel-page discovery (/search … site:vn.trip.com)', c => c.endpoint === '/search' && /site:vn\.trip\.com/.test(c.q)],
      ['an /images request', c => c.endpoint === '/images'],
    ],
    logProof: /tappyai_trip_prefetch/,
  },
  {
    name: 'evening frame (legacy path, consultative flags OFF): parallel stage searches and the discovery after them',
    messages: [user('tối nay đi chơi ở quận 1, ăn tối rồi đi cafe, lập kế hoạch giúp mình cho 2 người')],
    legacy: true,
    proof: [
      ['the dinner stage search (/maps nhà hàng ăn tối)', c => c.endpoint === '/maps' && /nhà hàng ăn tối/.test(c.q)],
      ['the night-walk stage search (/maps phố đi bộ chợ đêm)', c => c.endpoint === '/maps' && /phố đi bộ/.test(c.q)],
      ['the rooftop-bar stage search (/maps rooftop bar)', c => c.endpoint === '/maps' && /rooftop/.test(c.q)],
      ['the CCP experience discovery (/search … site:klook.com)', c => c.endpoint === '/search' && /site:klook\.com/.test(c.q)],
    ],
    logProof: /tappyai_evening_frame/,
  },
]
const setCap = (value: string | null | 'off') => {
  if (value === 'off') { vi.stubEnv('CONSULT_REQUEST_CAP', undefined); return }
  vi.stubEnv('CONSULT_REQUEST_CAP', '1')
  if (value !== null) vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', value)
}
async function turnOf(s: Scenario, cap: string | null | 'off') {
  __clearToolCache(); __resetRequestCap()
  h.state.calls = []; h.state.logs = []; h.state.answer = s.answer ?? 'ok'
  vi.stubEnv('CONSULTATIVE_V1', s.legacy ? '0' : '1'); vi.stubEnv('CONSULT_V2', s.legacy ? '0' : '1')
  setCap(cap)
  const req = { url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'), headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }), json: () => Promise.resolve({ messages: s.messages }), signal: undefined }
  const text = await (await POST(req as never)).text()
  return { calls: [...h.state.calls], logs: [...h.state.logs], bodyLength: text.length, totals: requestCapTotals() }
}

describe('the real chat route · each path that reaches Serper is held by the request cap', () => {
  for (const s of SCENARIOS) {
    describe(s.name, () => {
      it('flag OFF: the path is REACHED (its identifying request is sent, and more than a cap of 1 would allow); no cap code acts', async () => {
        const off = await turnOf(s, 'off')
        process.stdout.write('PATHS_OFF ' + JSON.stringify({ scenario: s.name.slice(0, 30), n: off.calls.length, calls: off.calls.map(c => `${c.endpoint}:${c.q.slice(0, 48)}`) }) + '\n')
        expect(off.calls.length).toBeGreaterThan(1)
        for (const [label, test] of s.proof) expect(off.calls.some(test), label).toBe(true)
        if (s.logProof) expect(off.logs.some(l => s.logProof!.test(l)), String(s.logProof)).toBe(true)
        expect(off.totals).toEqual({ reserved: 0, refused: {} })
        expect(off.bodyLength).toBeGreaterThan(0)
      })

      it('flag ON, cap 1: exactly one request is sent; every other is refused for the CAP (each had the turn object); the turn still answers', async () => {
        const off = await turnOf(s, 'off')
        const on = await turnOf(s, '1')
        expect(on.calls).toHaveLength(1)
        expect(off.calls.length).toBeGreaterThan(1)
        expect(Object.keys(on.totals.refused)).toEqual(['turn_cap'])
        expect(on.totals.refused.turn_cap).toBeGreaterThan(0)
        expect(on.bodyLength).toBeGreaterThan(0)
      })

      it('flag ON, cap = what the turn wanted minus one: never more than the cap, and any refusal is for the cap', async () => {
        const off = await turnOf(s, 'off')
        const cap = off.calls.length - 1
        const on = await turnOf(s, String(cap))
        expect(on.calls.length).toBeLessThanOrEqual(cap)
        expect(on.calls.length).toBeGreaterThan(0)
        expect(Object.keys(on.totals.refused).every(k => k === 'turn_cap')).toBe(true)
        expect(on.totals.refused.turn_cap).toBeGreaterThan(0)
      })

      it('flag ON, a cap larger than the turn needs: nothing is refused and the count equals the flag-OFF count', async () => {
        const off = await turnOf(s, 'off')
        const on = await turnOf(s, '100')
        expect(on.calls.length).toBe(off.calls.length)
        expect(on.totals.refused).toEqual({})
      })

      it.each([[null, 'value missing'], ['abc', 'not a number'], ['0', 'zero'], ['-3', 'negative'], ['2.5', 'fractional'], ['101', 'above the validation bound']])('flag ON, per-turn value %j (%s): NOTHING is sent (fail-closed), the refusal is config_invalid, the turn still answers', async (value, _why) => {
        const on = await turnOf(s, value as string | null)
        expect(on.calls).toHaveLength(0)
        expect(Object.keys(on.totals.refused)).toEqual(['config_invalid'])
        expect(on.bodyLength).toBeGreaterThan(0)
      })
    })
  }
})
