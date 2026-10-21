/**
 * Round 33 at route level (TAPPY_AGENT=2): the user's date goes into the coach search QUERY. Model scripted, Serper faked — the fake records the exact query strings it is asked for,
 * so the test pins what would be sent to Serper, not just what the tool was called with. Flag off: the queries are the former ones (no day).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>, queries: [] as string[] }
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
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    step: (opts: Record<string, any>) => {
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/common', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCache: () => null, setCache: () => undefined, fetchPlacePhotosByName: async () => [],
  serperSearch: async (q: string) => { h.state.queries.push(q); return q.startsWith('ve xe khach') ? [{ title: 'Vé xe Phương Trang', link: 'https://vexere.com/vi-VN/ve-xe-khach-phuong-trang-tu-sai-gon-di-quy-nhon-binh-dinh-129t2681-11071.html', snippet: 'Với giá vé chỉ từ 410000 đ.' }] : [] },
  webSearch: async (q: string) => { h.state.queries.push('web:' + q); return { results: [] } },
}))

import { POST } from '@/app/api/chat/route'

const MSG = 'Đi xe khách từ TP.HCM đến Quy Nhơn ngày 24/10/2026 thì giá bao nhiêu?'
const post = async () => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: MSG }] }), signal: undefined,
  }
  return (await POST(req as never)).text()
}
const script = (date?: string) => [{ text: '', toolCalls: [{ toolCallId: 'c-1', toolName: 'get_transport_options', args: { origin: 'TP.HCM', destination: 'Quy Nhơn', mode: 'intercity', ...(date ? { date } : {}) } }] }, { text: 'Giá từ 410.000 đồng.', toolCalls: [] }]
async function turn(date?: string) {
  h.state.steps = script(date); h.state.queries = []
  const logs: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  await post()
  spy.mockRestore()
  return { queries: h.state.queries.slice(), logged: logs.filter(l => l.includes('"type":"tappyai_coach_query"')).map(l => JSON.parse(l) as { queries: string[] }) }
}

beforeEach(() => { __resetAiQuestionQuotaLocal(); process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2' })
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k] })

describe('flag ON: the day is in the coach query that is actually sent', () => {
  beforeEach(() => { process.env.CONSULTATIVE_IN_AGENT = '1' })
  it('the first query carries "ngay 24/10/2026"; the tool sends exactly two queries (bus, train); the same two are logged', async () => {
    const x = await turn('2026-10-24')
    expect(x.queries[0]).toBe('ve xe khach tu TP.HCM di Quy Nhơn ngay 24/10/2026 gia bao nhieu vexere futa phuong trang')
    expect(x.queries[1]).toBe('ve tau TP.HCM Quy Nhơn duong sat viet nam gia')
    expect(x.logged).toEqual([{ type: 'tappyai_coach_query', queries: [x.queries[0], x.queries[1]] }])
  })
  it('no date given: the former query, nothing logged', async () => {
    const x = await turn()
    expect(x.queries[0]).toBe('ve xe khach tu TP.HCM di Quy Nhơn gia bao nhieu vexere futa phuong trang')
    expect(x.logged).toEqual([])
  })
})

describe('flag OFF (control): the query is the former one even when the model passes a date', () => {
  it('no day in the query, nothing logged, the same number of requests as with the flag on', async () => {
    const off = await turn('2026-10-24')
    expect(off.queries[0]).toBe('ve xe khach tu TP.HCM di Quy Nhơn gia bao nhieu vexere futa phuong trang')
    expect(off.logged).toEqual([])
    process.env.CONSULTATIVE_IN_AGENT = '1'
    const on = await turn('2026-10-24')
    expect(on.queries.length).toBe(off.queries.length)
  }, 30000)
})
