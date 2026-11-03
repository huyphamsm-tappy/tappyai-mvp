/**
 * Wave 4 · C4 — the grid: capability level (unset, 0-4) x turn kind (R1, R2, R3, R4 ask, planning, image, agent, no-tool) x the two Wave 4 path flags, at ROUTE level (full POST /api/chat,
 * scripted intent call and scripted model, Serper and pages mocked, no network, no key, no cost). The prompt carries the minute, so Date is frozen.
 * Claims:
 *   · with both path flags "0", every cell is the turn of the same level without Wave 4 (the reference); the flags change NOTHING else;
 *   · unset flags follow the level from L2: ONLY the R3 cell (knowledge path) and the R2 cell (pre-searched pick) differ from the reference, and only at L2+;
 *   · CONSULT_KNOWLEDGE_PATH=1 alone changes only R3; CONSULT_PICK_TURN_TOOLS=1 alone changes only R2 - at every level.
 * The messages are written for this test; none comes from a benchmark question file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __resetSharedRobots } from '@/lib/ai/consultative/researchLoop'
import { __resetPageCache } from '@/lib/ai/agent/runtime/readPage'

const h = vi.hoisted(() => {
  const state = { luna: null as null | Record<string, unknown>, toolNames: [] as string[], maxSteps: 0, maxTokens: 0, system: '' as string, maps: 0, userId: 'u-wave4-grid' }
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
vi.mock('@/lib/security/safePageFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/safePageFetch')>()),
  fetchPublicPage: async (url: string) => ({ ok: false, url, reason: 'http_error', status: 404, redirects: 0, ms: 1 }),
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async () => [], webSearch: async () => ({ results: [] }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()),
  serperPlaces: async (_q: string, ll?: { lat: number; lng: number } | null) => {
    h.state.maps++
    return ll ? [{ title: 'Cà phê Mây', address: 'Cà phê Mây', rating: 4.5, ratingCount: 300, placeId: 'p1', latitude: ll.lat + 0.001, longitude: ll.lng + 0.001 }] : []
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, any>) => {
      h.state.toolNames = Object.keys(opts.tools ?? {})
      h.state.maxSteps = Number(opts.maxSteps ?? 0)
      h.state.maxTokens = Number(opts.maxTokens ?? 0)
      try { h.state.system = JSON.stringify({ system: opts.system, d: opts.tools?.web_search?.description ?? null }) } catch { h.state.system = '' }
      return {
        toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
          async start(c) {
            const enc = new TextEncoder()
            c.enqueue(enc.encode(`0:${JSON.stringify('ok')}\n`))
            try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop', text: 'ok', steps: [] }) } catch { /* the mock must not fail a turn */ }
            c.enqueue(enc.encode('d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n'))
            c.close()
          },
        }), { status: 200, headers: { 'content-type': 'text/plain' } }),
      }
    },
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: unknown }
const lunaIntent = (turn: string, domains: string[]) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'hard', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
interface Kind { msgs: Msg[]; luna: [string, string[]]; gps?: boolean; env?: Record<string, string> }
const KINDS: Record<string, Kind> = {
  R1: { msgs: [{ role: 'user', content: 'Giải thích giúp mình cách chọn hạt cà phê ngon' }], luna: ['chat', ['food']] },
  R2: { msgs: [{ role: 'user', content: 'quán cà phê gần đây' }], luna: ['pick', ['food']], gps: true },
  R3: { msgs: [{ role: 'user', content: 'Giải thích giúp mình lãi kép hoạt động thế nào và phí duy trì tài khoản thường tính ra sao' }], luna: ['chat', []] },
  R4: { msgs: [{ role: 'user', content: 'tìm giúp mình một quán ăn' }], luna: ['ask', ['food']] },
  planning: { msgs: [{ role: 'user', content: 'Lập kế hoạch đi Đà Nẵng 3 ngày 2 đêm cho 2 người' }], luna: ['plan', ['travel']] },
  image: { msgs: [{ role: 'user', content: [{ type: 'text', text: 'Giải thích giúp mình biểu đồ lãi kép này' }, { type: 'image', image: 'data:image/png;base64,iVBORw0KGgo=' }] }], luna: ['chat', []] },
  agent: { msgs: [{ role: 'user', content: 'Giải thích giúp mình lãi kép hoạt động thế nào' }], luna: ['chat', []], env: { TAPPY_AGENT: '1' } },
  noTool: { msgs: [{ role: 'user', content: 'Cảm ơn bạn nhé' }], luna: ['chat', []] },
}
const W4 = ['CONSULT_KNOWLEDGE_PATH', 'CONSULT_PICK_TURN_TOOLS']
const ENV_NAMES = [...W4, 'CONSULT_CAPABILITY_LEVEL', 'TAPPY_AGENT', 'VERCEL_ENV']
const LEVELS = [undefined, '0', '1', '2', '3', '4'] as const

async function turn(kind: Kind, level: string | undefined, flags: Record<string, string>) {
  for (const k of ENV_NAMES) delete process.env[k]
  if (level !== undefined) process.env.CONSULT_CAPABILITY_LEVEL = level
  for (const [k, v] of Object.entries({ ...(kind.env ?? {}), ...flags })) process.env[k] = v
  h.state.luna = lunaIntent(kind.luna[0], kind.luna[1])
  h.state.toolNames = []; h.state.maxSteps = 0; h.state.maxTokens = 0; h.state.system = ''; h.state.maps = 0
  __resetAiQuestionQuotaLocal(); __resetPageCache(); __resetSharedRobots()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: kind.msgs, ...(kind.gps ? { userLocation: GPS_HN } : {}) }), signal: undefined,
  }
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  // The streamed body carries random tool-call ids (the code's pre-search), so only its TEXT frames are compared.
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).join('\n')
  return { tools: [...h.state.toolNames].sort(), maxSteps: h.state.maxSteps, maxTokens: h.state.maxTokens, system: h.state.system, maps: h.state.maps, text }
}
const OFF = { CONSULT_KNOWLEDGE_PATH: '0', CONSULT_PICK_TURN_TOOLS: '0' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:09:00Z'))
  process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
})
afterEach(() => { vi.useRealTimers(); for (const k of ENV_NAMES) delete process.env[k]; vi.unstubAllGlobals() })

describe('C4 — the grid: level x turn kind x Wave 4 flags', () => {
  it('the kinds really are what they say (live controls, at L0 without Wave 4)', async () => {
    const r1 = await turn(KINDS.R1!, '0', OFF), r2 = await turn(KINDS.R2!, '0', OFF), r3 = await turn(KINDS.R3!, '0', OFF), no = await turn(KINDS.noTool!, '0', OFF)
    expect(r1.maxSteps).toBe(3); expect(r1.maps).toBe(0)       // lean, the model has the tools, nothing pre-searched
    expect(r2.maxSteps).toBe(2); expect(r2.tools).toEqual([]); expect(r2.maps).toBeGreaterThan(0) // pre-searched by the code, no model tool
    expect(r3.maxSteps).toBe(5)                                    // the non-lean chat path
    expect(no.maxSteps).toBeLessThanOrEqual(1)                     // no tool turn
  }, 120000)

  for (const [name, kind] of Object.entries(KINDS)) {
    it(`${name}: unset flags differ from the reference ONLY where Wave 4 applies (R3 / R2 at L2+); each flag alone changes only its own kind`, async () => {
      for (const level of LEVELS) {
        const ref = await turn(kind, level, OFF)
        const byLevel = await turn(kind, level, {})
        const lv = level === undefined ? 0 : Number(level)
        const applies = (name === 'R3' || name === 'R2') && lv >= 2
        if (applies) expect(byLevel, `${name} L${level}`).not.toEqual(ref)
        else expect(byLevel, `${name} L${level}`).toEqual(ref)
        const kOnly = await turn(kind, level, { CONSULT_KNOWLEDGE_PATH: '1', CONSULT_PICK_TURN_TOOLS: '0' })
        if (name === 'R3') expect(kOnly, `${name} L${level} knowledge=1`).not.toEqual(ref); else expect(kOnly, `${name} L${level} knowledge=1`).toEqual(ref)
        const pOnly = await turn(kind, level, { CONSULT_KNOWLEDGE_PATH: '0', CONSULT_PICK_TURN_TOOLS: '1' })
        if (name === 'R2') expect(pOnly, `${name} L${level} pick=1`).not.toEqual(ref); else expect(pOnly, `${name} L${level} pick=1`).toEqual(ref)
      }
    }, 240000)
  }

  it('a production runtime: the flags and the level do nothing in any cell (the reference is the same production turn with the flags off)', async () => {
    for (const [name, kind] of Object.entries(KINDS)) {
      const ref = await turn(kind, '0', { ...OFF, VERCEL_ENV: 'production' })
      const prod = await turn(kind, '4', { CONSULT_KNOWLEDGE_PATH: '1', CONSULT_PICK_TURN_TOOLS: '1', VERCEL_ENV: 'production' })
      expect(prod, name).toEqual(ref)
    }
  }, 240000)
})
