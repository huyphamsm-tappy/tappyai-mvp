/**
 * Wave 4 · C-PRE-1 — a tool loop that ends without a word, at ROUTE level (full POST /api/chat, scripted intent call and scripted model, Serper mocked, no network, no key, no cost).
 * The measured case (B2 E10 / E21 / E25): every step is a tool call, the loop ends with finishReason "tool-calls" and no text, and the user got a canned 123-character line.
 * Claims: CONSULT_FINAL_SYNTHESIS ON + no text + tool results + no error frame ⇒ ONE extra call with NO tools, written from the tool results as plain text, streamed before the finish
 * frame (which then says "stop"); a turn that has text, an error frame, no tool result, or the flag OFF ⇒ the stream is exactly what the SDK built and the extra call is never made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { finalWriteInstruction } from '@/lib/ai/finalWrite'
import { consultFinalSynthesisOn, consultFinalWriteOn } from '@/lib/config/consultFlags'
import { turnUsd } from '@/lib/ai/turnCost'

type Call = { toolCallId: string; toolName: string; args: Record<string, unknown> }
const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[], results: [] as Array<{ name: string; result: any }>, luna: null as null | Record<string, unknown>,
    text: '', finish: 'tool-calls', errorFrame: false, advanceMs: 0,
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
          // fix N2: the tool loop "took" this long (the clock is faked in the deadline tests only)
          if (h.state.advanceMs) vi.setSystemTime(Date.now() + h.state.advanceMs)
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

// fix N3: an agent turn (TAPPY_AGENT=1) is scripted at the agent entry point: tool frames, no text, finish "tool-calls". `agentSteps` picks the shape of result.steps:
// 'real' = what agentStreamResult builds (toolResults always [] - dataStream.ts), 'withResults' = steps that DO carry tool results (the shape the final write could write from).
const agentH = vi.hoisted(() => ({ calls: 0, steps: 'real' as 'real' | 'withResults' }))
vi.mock('@/lib/ai/agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/agent')>()),
  startAgentTurn: () => {
    agentH.calls++
    const result = { title: 'Nguon A', link: 'https://a.example/x', snippet: 'Du lieu A' }
    return {
      steps: Promise.resolve([{ toolCalls: [{ toolCallId: 'g1', toolName: 'web_search', args: { query: 'q' } }], toolResults: agentH.steps === 'real' ? [] : [{ toolName: 'web_search', result }], text: '', usage: { promptTokens: 0, completionTokens: 0 } }]),
      text: Promise.resolve(''),
      toDataStreamResponse: () => new Response(
        `9:${JSON.stringify({ toolCallId: 'g1', toolName: 'web_search', args: { query: 'q' } })}\na:${JSON.stringify({ toolCallId: 'g1', result })}\nd:{"finishReason":"tool-calls","usage":{"promptTokens":0,"completionTokens":0}}\n`,
        { status: 200, headers: { 'content-type': 'text/plain' } }),
    }
  },
}))

import { POST } from '@/app/api/chat/route'

const GPS_HN = { lat: 21.0285, lng: 105.8542, address: 'Hoàn Kiếm, Hà Nội' }
type Msg = { role: 'user' | 'assistant'; content: string }
const lunaIntent = (turn: string, domains: string[]) => ({ domains, turn, goal: 'x', known: [], party: null, budget_vnd_max: null, difficulty: 'easy', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null })
const ASK: Msg[] = [{ role: 'user', content: 'Muốn đổi giấy phép lái xe hạng B1 sang hạng B cần những giấy tờ nào và nộp ở đâu?' }]
const SEARCH3: Array<{ toolName: string; args: Record<string, unknown> }> = [0, 1, 2].map(i => ({ toolName: 'web_search', args: { query: `thu tuc doi giay phep lai xe ${i}` } }))
const ENV = ['CONSULT_FINAL_SYNTHESIS', 'CONSULT_KNOWLEDGE_TURN_TOOLS', 'CONSULT_SEARCH_NOW_INTENT_GATE', 'CONSULT_CAPABILITY_LEVEL', 'CONSULT_TOOL_BY_NEED', 'CONSULT_DETERMINISTIC_MATH', 'CONSULT_RESEARCH_LOOP', 'CONSULT_STRUCTURED_SYNTHESIS', 'VERCEL_ENV', 'TAPPY_AGENT', 'CONSULT_LUNA']

interface Cfg { env?: Record<string, string>; flag?: string; calls?: typeof SEARCH3; text?: string; finish?: string; errorFrame?: boolean; generateThrows?: boolean; generateText?: string; luna?: Record<string, unknown> | null; advanceMs?: number }
async function turn(c: Cfg = {}) {
  for (const k of ENV) delete process.env[k]
  if (c.flag !== undefined) process.env.CONSULT_FINAL_SYNTHESIS = c.flag
  for (const [k, v] of Object.entries(c.env ?? {})) process.env[k] = v
  h.state.calls = (c.calls ?? SEARCH3).map((t, i) => ({ toolCallId: `c${i + 1}`, toolName: t.toolName, args: t.args }))
  h.state.results = []; h.state.generateCalls = []
  h.state.advanceMs = c.advanceMs ?? 0
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
  it('fix N1: a production runtime never makes the extra call, even with CONSULT_FINAL_SYNTHESIS=1; the same turn outside production does (live control)', async () => {
    const prod = await turn({ flag: '1', env: { VERCEL_ENV: 'production' } })
    expect(prod.generate).toHaveLength(0)
    expect(prod.text).not.toContain('Câu trả lời cuối')
    expect(prod.finish).toEqual(['tool-calls'])
    expect(prod.lines.some(l => l.includes('tappyai_final_write'))).toBe(false)
    const preview = await turn({ flag: '1', env: { VERCEL_ENV: 'preview' } })
    expect(preview.generate).toHaveLength(1)
    expect(preview.text).toContain('Câu trả lời cuối viết từ kết quả công cụ.')
  })
  it('fix N1: the flag itself keeps its older meaning in production (only the new call is blocked there)', () => {
    expect(consultFinalSynthesisOn({ CONSULT_FINAL_SYNTHESIS: '1', VERCEL_ENV: 'production' })).toBe(true)
    expect(consultFinalSynthesisOn({ CONSULT_FINAL_SYNTHESIS: '1', NODE_ENV: 'production' })).toBe(true)
    expect(consultFinalWriteOn({ CONSULT_FINAL_SYNTHESIS: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(consultFinalWriteOn({ CONSULT_FINAL_SYNTHESIS: '1', NODE_ENV: 'production' })).toBe(false)
    expect(consultFinalWriteOn({ CONSULT_FINAL_SYNTHESIS: '1' })).toBe(true)
    for (const v of [undefined, '0', 'true', ' 1', '1 ']) expect(consultFinalWriteOn({ CONSULT_FINAL_SYNTHESIS: v }), String(v)).toBe(false)
  })
  it('the instruction is in the user\'s language, says no tool call and not to invent', () => {
    expect(finalWriteInstruction('en')).toMatch(/no tool call/i); expect(finalWriteInstruction('en')).toMatch(/do not invent/i)
    expect(finalWriteInstruction('vi')).toMatch(/không gọi thêm công cụ/); expect(finalWriteInstruction('vi')).toMatch(/không bịa/)
  })
})

// fix G3: the final writing call's tokens (the mock answers 100 in / 20 out) are in the turn cost line, Luna on or off. The comparison turn is the same turn with the call answering
// nothing usable ("   ": the call still ran and was paid for) versus the flag OFF (no call at all).
const costLine = (lines: string[]): { tokensIn: number; tokensOut: number; usd: number } => {
  const l = lines.find(x => x.includes('"type":"tappyai_turn_cost"'))
  if (!l) throw new Error('no turn cost line')
  return JSON.parse(l) as { tokensIn: number; tokensOut: number; usd: number }
}
// Luna off = no consult brain at all (CONSULT_V2=0): a real tool turn whose cost line is the plain one (CONSULT_LUNA=0 alone makes this message a question-back turn, no tool loop).
const LUNA_OFF = { CONSULT_V2: '0' }
const ranFinalWrite = (lines: string[], outcome: string) => lines.some(l => l.includes('"type":"tappyai_final_write"') && l.includes(`"outcome":"${outcome}"`))
describe('fix G3 · the final write is counted in the turn cost line', () => {
  for (const [name, env] of [['Luna off', LUNA_OFF], ['Luna on', { CONSULT_LUNA: '1' }]] as const) {
    it(`${name}: tokensIn +100, tokensOut +20 and a higher usd than the same turn with the flag OFF`, async () => {
      const offTurn = await turn({ env })
      const on = await turn({ flag: '1', env })
      expect(ranFinalWrite(on.lines, 'appended')).toBe(true)      // the call really ran on this turn
      const off = costLine(offTurn.lines), c = costLine(on.lines)
      expect(c.tokensIn - off.tokensIn).toBe(100)
      expect(c.tokensOut - off.tokensOut).toBe(20)
      expect(c.usd).toBeGreaterThan(off.usd)
    })
  }
  it('Luna off: the plain cost line (no Luna fields - the line the fix had to reach) grows by exactly the price of 100 in + 20 out', async () => {
    const off = costLine((await turn({ env: LUNA_OFF })).lines)
    const on = costLine((await turn({ flag: '1', env: LUNA_OFF })).lines)
    expect(on).not.toHaveProperty('answerUsd')
    expect(Math.abs((on.usd - off.usd) - turnUsd({ promptTokens: 100, completionTokens: 20 }))).toBeLessThanOrEqual(2e-6)
  })
  it('a paid call that wrote nothing usable is still counted', async () => {
    const off = costLine((await turn({ env: LUNA_OFF })).lines)
    const empty = await turn({ flag: '1', generateText: '   ', env: LUNA_OFF })
    expect(ranFinalWrite(empty.lines, 'empty')).toBe(true)
    expect(costLine(empty.lines).tokensOut - off.tokensOut).toBe(20)
  })
})

// fix N3: the final write never touches an agent turn (the agent has its own loop and its own final answer).
describe('fix N3 · an agent turn is left alone', () => {
  it('TAPPY_AGENT=1, flag ON, tool frames and no text: no extra call, no final_write line - for both shapes of result.steps', async () => {
    for (const shape of ['real', 'withResults'] as const) {
      agentH.calls = 0; agentH.steps = shape
      const r = await turn({ flag: '1', env: { TAPPY_AGENT: '1' } })
      expect(agentH.calls, shape).toBe(1)                     // the turn really went down the agent path
      expect(r.generate, shape).toHaveLength(0)
      expect(r.lines.some(l => l.includes('tappyai_final_write')), shape).toBe(false)
    }
  })
  it('the same turn without the agent takes the final write (live control)', async () => {
    agentH.calls = 0
    const r = await turn({ flag: '1' })
    expect(agentH.calls).toBe(0)
    expect(r.generate).toHaveLength(1)
  })
})

// fix N2: the route hands the TURN deadline (start + 110 s) to the final write. Only Date is faked; the mock moves the clock forward while the tool loop "runs".
// finalWriteStream starts the call only when (deadline - now - 2 s) >= 8 s: 101 s in leaves 7 s (no call), 95 s in leaves 13 s (the call). Without a deadline both would call;
// with a shorter deadline (the agent's 85 s, say) both would refuse.
describe('fix N2 · the turn deadline reaches the final write', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T03:09:00Z')) })
  afterEach(() => { vi.useRealTimers() })
  it('101 s into the turn: too little time is left, no extra call, the "no_time" line, the turn ships as the model left it', async () => {
    const r = await turn({ flag: '1', advanceMs: 101_000 })
    expect(r.generate).toHaveLength(0)
    expect(r.lines.some(l => l.includes('"type":"tappyai_final_write"') && l.includes('"outcome":"no_time"'))).toBe(true)
    expect(r.finish).toEqual(['tool-calls'])
  })
  it('95 s into the turn: enough time is left, the call is made (live control - the deadline is the turn\'s, not a shorter one)', async () => {
    const r = await turn({ flag: '1', advanceMs: 95_000 })
    expect(r.generate).toHaveLength(1)
    expect(r.text).toContain('Câu trả lời cuối viết từ kết quả công cụ.')
  })
})
