/**
 * Wave 4 · C-PRE-2 — CONSULT_CHAT_DOMAIN_AGREEMENT at ROUTE level (full POST /api/chat, scripted intent call and scripted model, no network, no key, no cost).
 * Measured (B2, 27/10): the rules read "unsure, no domain" and the intent layer read "chat [food]" (or the two named different domains), the merge kept the intent layer's domain, and a knowledge
 * question took the lean venue path (3 steps, venue tools). Claims: flag OFF = that path, byte for byte; flag ON = such a turn leaves the lean path (more steps, the general tool set);
 * a chat turn BOTH readers gave the same domain keeps the lean path; production ignores the flag; a set-but-not-"1" value is OFF.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { luna: null as null | Record<string, unknown>, toolNames: [] as string[], maxSteps: 0, system: '' as string, userId: 'u-chat-domain-agreement' }
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
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/tools/common')>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async () => [], webSearch: async () => ({ results: [] }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))
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
      try { h.state.system = JSON.stringify({ system: opts.system }) } catch { h.state.system = '' }
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
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[]) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const ENV_NAMES = ['CONSULT_CHAT_DOMAIN_AGREEMENT', 'CONSULT_CAPABILITY_LEVEL', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'VERCEL_ENV', 'NODE_ENV_TEST_UNUSED', 'TAPPY_AGENT']
// A message the rules do not read as a venue request (no area, no place wording): rules "unsure, no domain". The intent layer is scripted to read it as chat + a domain.
const KNOWLEDGE: Msg[] = [{ role: 'user', content: 'Giải thích giúp mình lãi kép hoạt động thế nào' }]
// A message BOTH readers read as the food area.
const VENUE: Msg[] = [{ role: 'user', content: 'quán cà phê gần đây' }]

interface Cfg { lunaTurn?: string; lunaDomains?: string[]; msgs?: Msg[]; flag?: string; level?: string; vercelEnv?: string }
async function turn(c: Cfg = {}) {
  for (const k of ENV_NAMES) delete process.env[k]
  // this file measures C-PRE-2 alone: the two Wave 4 path flags are pinned off (a value set in the shell would move the controls to another path; restored after each test)
  for (const k of ['CONSULT_KNOWLEDGE_PATH', 'CONSULT_PICK_TURN_TOOLS']) vi.stubEnv(k, '0')
  if (c.flag !== undefined) process.env.CONSULT_CHAT_DOMAIN_AGREEMENT = c.flag
  if (c.level !== undefined) process.env.CONSULT_CAPABILITY_LEVEL = c.level
  if (c.vercelEnv) process.env.VERCEL_ENV = c.vercelEnv
  h.state.luna = lunaIntent(c.lunaTurn ?? 'chat', c.lunaDomains ?? ['food'])
  h.state.toolNames = []; h.state.maxSteps = 0; h.state.system = ''
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: c.msgs ?? KNOWLEDGE, userLocation: GPS_HN }), signal: undefined,
  }
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try { await (await POST(req as never)).text() } finally { spy.mockRestore() }
  return { tools: [...h.state.toolNames].sort(), maxSteps: h.state.maxSteps, system: h.state.system }
}

// The system prompt carries the clock ("lúc 10:09 …"): two turns a minute apart would differ in that line alone. Only Date is faked (timers and promises run for real).
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:09:00Z')); process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1' })
afterEach(() => { vi.useRealTimers(); for (const k of ENV_NAMES) delete process.env[k]; vi.unstubAllEnvs() })

describe('C-PRE-2 — the one-sided chat domain', () => {
  it('flag OFF (unset): the intent layer\'s chat [food] sends a knowledge question down the lean venue path (3 steps) - the measured behaviour', async () => {
    const off = await turn()
    expect(off.maxSteps).toBe(3)
    expect(off.tools).toContain('search_places')
  }, 60000)
  it('flag ON ("1"): the same turn leaves the lean path - the general chat steps and tool set', async () => {
    const off = await turn()
    const on = await turn({ flag: '1' })
    expect(on.maxSteps).toBe(5)
    expect(on.maxSteps).not.toBe(off.maxSteps)
    expect(on.tools).not.toEqual(off.tools)
    expect(on.tools.length).toBeGreaterThan(off.tools.length)
  }, 60000)
  it('flag ON, BOTH readers name the same domain (live control): the lean venue path stays, exactly as OFF', async () => {
    const off = await turn({ msgs: VENUE })
    const on = await turn({ msgs: VENUE, flag: '1' })
    expect(off.maxSteps).toBe(2)                    // the control really is lean (a venue request the code pre-searches: two steps), not the 5-step chat path
    expect(on).toEqual(off)
  }, 60000)
  it('flag ON, a turn the intent layer reads as a real venue request (pick): untouched', async () => {
    const off = await turn({ msgs: VENUE, lunaTurn: 'pick' })
    const on = await turn({ msgs: VENUE, lunaTurn: 'pick', flag: '1' })
    expect(on).toEqual(off)
  }, 60000)
  it('every value other than the exact "1" is OFF, and so is a production runtime', async () => {
    const off = await turn()
    for (const v of ['0', 'true', 'TRUE', ' 1', '1 ', '01', '']) expect(await turn({ flag: v }), JSON.stringify(v)).toEqual(off)
    expect(await turn({ flag: '1', vercelEnv: 'production' })).toEqual(off)
  }, 120000)
  it('the capability level never turns it on (L0..L4 with the flag unset = the flag-OFF turn at that level)', async () => {
    for (const level of ['0', '1', '2', '3', '4']) {
      const a = await turn({ level }); const b = await turn({ level, flag: '0' })
      expect(a, level).toEqual(b)
    }
  }, 120000)
})
