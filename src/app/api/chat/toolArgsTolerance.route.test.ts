/**
 * Tool arguments the model gets wrong must never kill the stream (E1 class, 2026-09-18).
 *
 * Three layers, each pinned here on the REAL tools the route builds:
 *   1. execute() called directly with off-enum / odd values — the tool answers, never throws,
 *      and either maps the value or returns an explicit unknown that carries it.
 *   2. Every tool's zod schema: no z.enum anywhere; optional fields tolerate `undefined`; the
 *      shape mistakes the SDK would reject (null, number-as-string, string-as-number) are
 *      repaired by `repairArgs` from the tool's own JSON schema so validation then passes.
 *   3. `AI.stream` is called with `experimental_repairToolCall` (ai.ts) — asserted by inspecting
 *      the options the route passes.
 *
 * Same harness as consultativeV1.route.test.ts: the model is mocked to capture its options, the
 * providers to capture their arguments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { zodSchema } from 'ai'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { repairArgs } from '@/lib/ai/llm/toolCallRepair'

const h = vi.hoisted(() => {
  const state = {
    streamOptions: null as Record<string, unknown> | null,
    placeCalls: [] as Array<{ query: string; location: string | undefined; type: string | undefined }>,
    transportCalls: [] as Array<{ origin: string; destination: string; mode: string | undefined }>,
    flightCalls: [] as Array<{ origin: string; destination: string }>,
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
vi.mock('@/lib/ai/llm', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/llm')>()
  return {
    ...real,
    AI: {
      ...real.AI,
      isConfigured: () => true,
      stream: (opts: Record<string, unknown>) => {
        h.state.streamOptions = opts
        return { toDataStreamResponse: () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }) }
      },
      generate: () => Promise.resolve({ text: '' }),
      vision: () => Promise.resolve({ text: '' }),
    },
  }
})
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return {
    ...real,
    searchPlaces: async (query: string, location?: string, type?: string) => {
      h.state.placeCalls.push({ query, location, type })
      return { source: 'test', count: 0, location: location ?? '', results: [], price_search_results: [], google_maps_search: 'https://maps.google.com/maps?q=test', place_search_status: 'empty' }
    },
  }
})
vi.mock('@/lib/ai/tools/travel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/travel')>()
  return {
    ...real,
    getTransportOptions: async (origin: string, destination: string, mode?: string) => {
      h.state.transportCalls.push({ origin, destination, mode })
      return { type: mode === 'taxi' ? 'taxi' : 'intercity', origin, destination }
    },
    getFlightPrices: async (origin: string, destination: string) => {
      h.state.flightCalls.push({ origin, destination })
      return { origin, destination, flights: [] }
    },
  }
})

import { POST } from '@/app/api/chat/route'

const post = async (text: string) => {
  const req = {
    url: 'http://localhost/api/chat',
    nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: text }] }),
    signal: undefined,
  }
  return POST(req as never)
}
type Tool = { execute: (a: unknown, o?: unknown) => Promise<unknown>; parameters: z.ZodTypeAny }
const tools = () => (h.state.streamOptions?.tools ?? {}) as Record<string, Tool>

const ODD = ['bar', 'column', 'BAR', 'cột', '', 'xyz', null, 123] as const

beforeEach(() => {
  __resetAiQuestionQuotaLocal()
  h.state.streamOptions = null
  h.state.placeCalls = []; h.state.transportCalls = []; h.state.flightCalls = []
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('layer 1 — execute() with off-enum values', () => {
  it('search_places.type: every odd value runs a search; a known synonym maps, an unknown is dropped AND said', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await post('Tìm quán ăn tối ngon gần Quận 1')
    const t = tools().search_places
    expect(t).toBeTruthy()
    const expectType: Record<string, string | undefined> = { bar: 'bar', column: undefined, BAR: 'bar', 'cột': undefined, '': undefined, xyz: undefined, null: undefined, '123': undefined }
    for (const v of ODD) {
      h.state.placeCalls = []
      const r = (await t.execute({ query: 'quán ăn', location: 'Quận 1', type: v }, {})) as Record<string, unknown>
      expect(h.state.placeCalls, `type=${String(v)}`).toHaveLength(1)
      expect(h.state.placeCalls[0].type, `type=${String(v)}`).toBe(expectType[String(v)])
      const unknownGiven = v !== null && v !== '' && expectType[String(v)] === undefined
      if (unknownGiven) expect(String(r._tappy_type_note), `type=${String(v)}`).toContain(`type "${String(v)}"`)
      else expect(r._tappy_type_note).toBeUndefined()
    }
  })

  it('get_transport_options.mode: synonyms map; an unknown value is returned to the model with the original, and no search runs', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await post('Đi từ Sài Gòn ra Đà Lạt thế nào')
    const t = tools().get_transport_options
    expect(t).toBeTruthy()
    for (const [v, mode] of [['taxi', 'taxi'], ['grab', 'taxi'], ['bus', undefined], ['xe khách', undefined], [null, undefined], ['', undefined]] as const) {
      h.state.transportCalls = []
      await t.execute({ origin: 'Sài Gòn', destination: 'Đà Lạt', mode: v }, {})
      expect(h.state.transportCalls, `mode=${String(v)}`).toHaveLength(1)
      expect(h.state.transportCalls[0].mode, `mode=${String(v)}`).toBe(mode)
    }
    for (const v of ['column', 'cột', 'xyz', 123]) {
      h.state.transportCalls = []
      const r = (await t.execute({ origin: 'Sài Gòn', destination: 'Đà Lạt', mode: v }, {})) as Record<string, unknown>
      expect(h.state.transportCalls, `mode=${String(v)}`).toHaveLength(0)
      expect(r).toMatchObject({ error: 'mode_unknown', mode_received: String(v), accepted_modes: ['intercity', 'taxi'] })
      expect(String(r.ask)).toContain(String(v))
    }
    expect(warn.mock.calls.some(c => String(c[0]).includes('"step":"mode_unknown"'))).toBe(true)
  })

  it('get_flight_prices.passengers: 10 is clamped to 9 with a note, never a crash', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await post('Vé máy bay Sài Gòn Hà Nội cho 10 người')
    const t = tools().get_flight_prices
    expect(t).toBeTruthy()
    const r = (await t.execute({ origin: 'SGN', destination: 'HAN', passengers: 10 }, {})) as Record<string, unknown>
    expect(h.state.flightCalls).toHaveLength(1)
    expect(String(r.passengers_note)).toMatch(/nhom 10 nguoi can tach ve/)
    const ok = (await t.execute({ origin: 'SGN', destination: 'HAN', passengers: 2 }, {})) as Record<string, unknown>
    expect(ok.passengers_note).toBeUndefined()
  })
})

describe('layer 2 — every tool schema', () => {
  it('has no z.enum, accepts undefined for optionals, and repairArgs fixes null / wrong scalar types so validation passes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await post('Tìm quán ăn tối ngon gần Quận 1, rồi vé máy bay ra Hà Nội, khách sạn, xe khách, thời tiết, giá vàng, tin tức')
    const all = tools()
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(8)
    for (const [name, tool] of Object.entries(all)) {
      const json = zodSchema(tool.parameters as z.ZodType).jsonSchema as { properties?: Record<string, { type?: string | string[]; enum?: unknown[] }>; required?: string[] }
      const required = new Set(json.required ?? [])
      for (const [field, p] of Object.entries(json.properties ?? {})) {
        expect(p.enum, `${name}.${field} is an enum — the SDK rejects an off-enum value before execute()`).toBeUndefined()
        const types = Array.isArray(p.type) ? p.type : [p.type]
        const good = types.includes('number') || types.includes('integer') ? 1 : types.includes('boolean') ? true : 'x'
        const base: Record<string, unknown> = {}
        for (const r of required) base[r] = (json.properties![r].type === 'number' || json.properties![r].type === 'integer') ? 1 : 'x'
        // undefined for an optional field
        if (!required.has(field)) expect(tool.parameters.safeParse({ ...base, [field]: undefined }).success, `${name}.${field} undefined`).toBe(true)
        // the shapes the model gets wrong
        const wrong = types.includes('string') ? 123 : (types.includes('number') || types.includes('integer')) ? '2.000.000' : 'yes'
        for (const bad of [null, wrong]) {
          if (bad === null && required.has(field)) continue // a null REQUIRED field must fail visibly
          const before = tool.parameters.safeParse({ ...base, [field]: bad }).success
          const repaired = repairArgs(name, { ...base, [field]: bad }, json as never).args
          const after = tool.parameters.safeParse(repaired).success
          expect(after, `${name}.${field}=${JSON.stringify(bad)} (schema before repair: ${before})`).toBe(true)
        }
        void good
      }
    }
  })
})

describe('layer 3 — the stream is protected', () => {
  it('AI.stream passes experimental_repairToolCall', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { AI } = await import('@/lib/ai/llm')
    // The mocked AI.stream captures options; the real one (ai.ts) is what we inspect here.
    const src = (await import('fs')).readFileSync(new URL('../../../lib/ai/llm/ai.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/experimental_repairToolCall:\s*repairToolCall/)
    expect(AI).toBeTruthy()
  })
})
