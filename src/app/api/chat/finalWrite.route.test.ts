/**
 * Wave 4 · C-PRE-1 — a tool loop that ends without a word, at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network, no key, no cost).
 * The measured case (B2 E10 / E21 / E25): every step is a tool call, the loop ends with finishReason "tool-calls" and no text, and the user got a canned 123-character line.
 * Claims: CONSULT_FINAL_SYNTHESIS ON + no text + tool results + no error frame ⇒ ONE extra call with NO tools, written from the tool results as plain text, streamed before the finish
 * frame (which then says "stop"); a turn that has text, an error frame, no tool result, or the flag OFF ⇒ the stream is exactly what the SDK built and the extra call is never made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { finalWriteInstruction } from '@/lib/ai/finalWrite'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[], results: [] as Array<{ name: string; result: any }>, luna: null as null | Record<string, unknown>,
    text: '', finish: 'tool-calls', errorFrame: false,
    generateCalls: [] as Array<Record<string, any>>, generateText: 'Câu trả lời cuối viết từ kết quả công cụ.', generateThrows: false, userId: 'u-final-write',
  }
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
  serperSearch: async () => [], webSearch: async () => ({ results: [{ title: 'Nguon A', link: 'https://a.example/x', snippet: 'Du lieu A' }] }),
}))
vi.mock('@/lib/ai/tools/serperPlaces', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/serperPlaces')>()), serperPlaces: async () => [] }))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ai/tools/food')>()), searchPlacesOSM: async () => ({ results: [] }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true, providerId: () => 'mock', serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => h.state.luna
      ? Promise.resolve({ object: h.state.luna, usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: {} })
      : Promise.reject(new Error('no provider in this test')),
    stream: (opts: Record<string, any>) => ({
      get steps() { return Promise.resolve([{ toolResults: h.state.results.map(r => ({ toolName: r.name, result: r.result })) }]) },
      toDataStreamResponse: () => new Response(new ReadableStream<Uint8Array>({
        async start(c) {
          const enc = new TextEncoder()
          for (const call of h.state.calls) {
            if (!opts.tools?.[call.toolName]) continue
            c.enqueue(enc.encode(`9:${JSON.stringify(call)}\n`))
            const result = await opts.tools[call.toolName].execute(call.args, { toolCallId: call.toolCallId, messages: [] })
            h.state.results.push({ name: call.toolName, result })
            c.enqueue(enc.encode(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}\n`))
          }
          if (h.state.text) c.enqueue(enc.encode(`0:${JSON.stringify(h.state.text)}\n`))
          if (h.state.errorFrame) c.enqueue(enc.encode(`3:${JSON.stringify('provider failed')}\n`))
          try { await opts.onFinish?.({ usage: { promptTokens: 0, completionTokens: 0 }, finishReason: h.state.finish, text: h.state.text, steps: [] }) } catch { /* the mock must not fail a turn */ }
          c.enqueue(enc.encode(`d:{"finishReason":"${h.state.finish}","usage":{"promptTokens":0,"completionTokens":0}}\n`))
          c.close()
        },
      }), { status: 200, headers: { 'content-type': 'text/plain' } }),
    }),
    step: () => Promise.resolve({ text: '', toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }),
    generate: (opts: Record<string, any>) => { h.state.generateCalls.push(opts); return h.state.generateThrows ? Promise.reject(new Error('provider down')) : Promise.resolve({ text: h.state.generateText, usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} }) },
    vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[]) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const ASK: Msg[] = [{ role: 'user', content: 'Muốn đổi giấy phép lái xe hạng B1 sang hạng B cần những giấy tờ nào và nộp ở đâu?' }]
const SEARCH3: Array<{ toolName: string; args: Record<string, unknown> }> = [0, 1, 2].map(i => ({ toolName: 'web_search', args: { query: `thu tuc doi giay phep lai xe ${i}` } }))
const ENV = ['CONSULT_FINAL_SYNTHESIS', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_CAPABILITY_LEVEL', 'CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_STRUCTURED_SYNTHESIS', 'VERCEL_ENV', 'TAPPY_AGENT']

interface Cfg { env?: Record<string, string>; flag?: string; calls?: typeof SEARCH3; text?: string; finish?: string; errorFrame?: boolean; generateThrows?: boolean; generateText?: string; luna?: Record<string, unknown> | null }
async function turn(c: Cfg = {}) {
  for (const k of ENV) delete process.env[k]
  if (c.flag !== undefined) process.env.CONSULT_FINAL_SYNTHESIS = c.flag
  for (const [k, v] of Object.entries(c.env ?? {})) process.env[k] = v
  h.state.calls = (c.calls ?? SEARCH3).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.toolName, args: t.args }))
  h.state.results = []; h.state.generateCalls = []
  h.state.text = c.text ?? ''; h.state.finish = c.finish ?? 'tool-calls'; h.state.errorFrame = c.errorFrame ?? false
  h.state.generateThrows = c.generateThrows ?? false; h.state.generateText = c.generateText ?? 'Câu trả lời cuối viết từ kết quả công cụ.'
  h.state.luna = c.luna === undefined ? lunaIntent('chat', []) : c.luna
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: ASK, userLocation: GPS_HN }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let raw = ''
  try { raw = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const text = raw.split('\n').filter(l => l.startsWith('0:')).map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } }).join('')
  const finish = raw.split('\n').filter(l => l.startsWith('d:')).map(l => { try { return (JSON.parse(l.slice(2)) as { finishReason?: string }).finishReason } catch { return undefined } })
  return { raw, text, finish, generate: [...h.state.generateCalls], lines }
}

beforeEach(() => { process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { for (const k of ENV) delete process.env[k]; vi.unstubAllGlobals() })

describe('C-PRE-1 · the measured case: every step is a tool call, no text', () => {
  it('flag ON: ONE extra call with NO tools, from the tool results as plain text; its answer is streamed; the finish frame says stop', async () => {
    const r = await turn({ flag: '1' })
    expect(r.generate).toHaveLength(1)
    const g = r.generate[0]!
    expect(g.tools).toBeUndefined()
    const msgs = g.messages as Array<{ role: string; content: string }>
    expect(msgs[msgs.length - 1]!.role).toBe('user')
    expect(msgs[msgs.length - 1]!.content).toContain('### web_search')       // the tool results, as text
    expect(msgs[msgs.length - 1]!.content).toContain(finalWriteInstruction('vi'))
    expect(typeof g.system).toBe('string'); expect(g.system.length).toBeGreaterThan(100)
    expect(r.text).toContain('Câu trả lời cuối viết từ kết quả công cụ.')
    expect(r.finish).toEqual(['stop'])
    expect(r.lines.some(l => l.includes('"type":"tappyai_final_write"') && l.includes('"outcome":"appended"'))).toBe(true)
  })
  it('flag OFF (unset, "0", "true", " 1", "1 "): the extra call is never made and the stream is the SDK\'s (finish reason tool-calls, no appended answer)', async () => {
    for (const v of [undefined, '0', 'true', ' 1', '1 ']) {
      const r = await turn({ flag: v })
      expect(r.generate, String(v)).toHaveLength(0)
      expect(r.text, String(v)).not.toContain('Câu trả lời cuối')
      expect(r.finish, String(v)).toEqual(['tool-calls'])
      expect(r.lines.some(l => l.includes('tappyai_final_write'))).toBe(false)
    }
  })
  it('flag ON, the model DID write: no extra call, and the bytes are those of flag OFF', async () => {
    const on = await turn({ flag: '1', text: 'Mình đã viết xong câu trả lời.', finish: 'stop' })
    const off = await turn({ flag: undefined, text: 'Mình đã viết xong câu trả lời.', finish: 'stop' })
    expect(on.generate).toHaveLength(0)
    expect(on.text).toBe(off.text); expect(on.finish).toEqual(off.finish)
    expect(on.raw).toBe(off.raw)
  })
  it('flag ON, error frame from the provider: no extra call (the same provider would fail again)', async () => {
    const r = await turn({ flag: '1', errorFrame: true })
    expect(r.generate).toHaveLength(0)
  })
  it('flag ON, no tool result at all: no extra call', async () => {
    const r = await turn({ flag: '1', calls: [] })
    expect(r.generate).toHaveLength(0)
  })
  it('flag ON, the extra call fails or answers nothing: the turn ships as the model left it, nothing thrown', async () => {
    const t = await turn({ flag: '1', generateThrows: true })
    expect(t.generate).toHaveLength(1); expect(t.text).not.toContain('Câu trả lời cuối'); expect(t.finish).toEqual(['tool-calls'])
    expect(t.lines.some(l => l.includes('"type":"tappyai_final_write"') && l.includes('"outcome":"error"'))).toBe(true)
    const e = await turn({ flag: '1', generateText: '   ' })
    expect(e.generate).toHaveLength(1); expect(e.text).not.toContain('Câu trả lời cuối'); expect(e.finish).toEqual(['tool-calls'])
  })
  it('the same on a lean consult turn (an area the gate does not search: the model gets the web_search offer) - one extra call, no tools', async () => {
    const r = await turn({ flag: '1', luna: lunaIntent('chat', ['food']), env: { CONSULT_SEARCH_NOW_INTENT_GATE: '1', CONSULT_KNOWLEDGE_TURN_TOOLS: '1' } })
    expect(r.generate).toHaveLength(1); expect(r.generate[0]!.tools).toBeUndefined()
    expect(r.text).toContain('Câu trả lời cuối viết từ kết quả công cụ.')
  })
  it('the instruction is in the user\'s language, says no tool call and not to invent', () => {
    expect(finalWriteInstruction('en')).toMatch(/no tool call/i); expect(finalWriteInstruction('en')).toMatch(/do not invent/i)
    expect(finalWriteInstruction('vi')).toMatch(/không gọi thêm công cụ/); expect(finalWriteInstruction('vi')).toMatch(/không bịa/)
  })
})
