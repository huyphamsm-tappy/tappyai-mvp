/**
 * Round 30, part 1 at route level (TAPPY_AGENT=2): the conversation turns that ended as "À, Nikola Tesla chứ gì." / "Biết chứ." — scripted model, real runtime, real composition and settle.
 * The text the user would read is asserted (flag ON: content; flag OFF: unchanged). No tool is needed for these shapes, so no Serper and no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>, calls: 0 }
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
      h.state.calls++
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'
// R42 R3 (LOC-DEFAULT-HCM-01 regression run): no network, ever — a fetch the mocks above do not cover fails at once instead of going online.
beforeEach(() => { vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) }) })
afterEach(() => { vi.unstubAllGlobals() })

const U = (content: string) => ({ role: 'user', content })
const A = (content: string) => ({ role: 'assistant', content })
const Q1 = 'Biết chứ. Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?'
const TESLA = 'Nikola Tesla (1856–1943) là nhà phát minh và kỹ sư điện người Mỹ gốc Serbia. Ông nổi tiếng với hệ thống điện xoay chiều, động cơ cảm ứng và cuộn dây Tesla. Nhiều phát minh của ông là nền tảng của lưới điện hiện đại.'
const IPHONE = 'Biết chứ. iPhone là dòng điện thoại thông minh của Apple, ra mắt năm 2007. Nó nổi tiếng với màn hình cảm ứng đa điểm và hệ điều hành iOS. Mỗi năm Apple ra một thế hệ mới.'

async function turn(messages: unknown[], steps: string[]) {
  h.state.steps = steps.map(text => ({ text, toolCalls: [] })); h.state.calls = 0
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages }), signal: undefined,
  }
  const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const body = await (await POST(req as never)).text()
  logs.mockRestore()
  const text = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  return { text, calls: h.state.calls }
}
const log = (name: string, input: string, out: string, verdict: string) => console.log('CASE ' + JSON.stringify({ name, model_input: input, final: out, verdict }))

beforeEach(() => { __resetAiQuestionQuotaLocal(); process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2' })
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k] })

describe('flag ON', () => {
  beforeEach(() => { process.env.CONSULTATIVE_IN_AGENT = '1' })
  it('turn 1 "biết tesla ko": the clarifying question is the reply (right: kept)', async () => {
    const x = await turn([U('biết tesla ko')], [Q1])
    expect(x.text).toContain('Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?')
    expect(x.calls).toBe(1)
    log('route_turn1', Q1, x.text, 'KEPT (clarifying question)')
  }, 40000)
  it('turn 2 "nhà phát minh á": the acknowledgement "À, Nikola Tesla chứ gì." is retried once and the user reads the content', async () => {
    const x = await turn([U('biết tesla ko'), A(Q1), U('nhà phát minh á')], ['À, Nikola Tesla chứ gì.', TESLA])
    expect(x.calls).toBe(2)
    expect(x.text).toContain('Nikola Tesla (1856–1943) là nhà phát minh')
    expect(x.text).toContain('điện xoay chiều')
    expect(x.text).not.toContain('chứ gì')
    log('route_turn2', 'À, Nikola Tesla chứ gì.', x.text, 'CONTENT (retried once)')
  }, 40000)
  it('turn 3 "đúng rồi, cha, có biết ko": "Biết chứ." alone is retried once and the user reads the content', async () => {
    const x = await turn([U('biết tesla ko'), A(Q1), U('nhà phát minh á'), A(TESLA), U('đúng rồi, cha, có biết ko')], ['Biết chứ.', 'Biết chứ. ' + TESLA])
    expect(x.calls).toBe(2)
    expect(x.text).toContain('Biết chứ.')
    expect(x.text).toContain('điện xoay chiều')
    log('route_turn3', 'Biết chứ.', x.text, 'CONTENT (retried once)')
  }, 40000)
  it('"biết iphone ko": a good first answer is left as it is (one model call)', async () => {
    const x = await turn([U('biết iphone ko')], [IPHONE])
    expect(x.calls).toBe(1)
    expect(x.text).toContain('iPhone là dòng điện thoại thông minh của Apple')
    log('route_iphone_good', IPHONE, x.text, 'KEPT')
  }, 40000)
  it('"biết iphone ko" answered "Biết chứ.": content after the retry', async () => {
    const x = await turn([U('biết iphone ko')], ['Biết chứ.', IPHONE])
    expect(x.calls).toBe(2)
    expect(x.text).toContain('Apple')
    log('route_iphone_thin', 'Biết chứ.', x.text, 'CONTENT (retried once)')
  }, 40000)
  it('not enough to go on ("biết ko"): the retry asks ONE question instead of guessing', async () => {
    const x = await turn([U('biết ko')], ['Biết chứ.', 'Bạn đang hỏi mình về điều gì vậy?'])
    expect(x.text).toContain('Bạn đang hỏi mình về điều gì vậy?')
    log('route_insufficient', 'Biết chứ. → question', x.text, 'ASKS (no guess)')
  }, 40000)
  it('an advice turn is not touched even when the answer is short', async () => {
    const x = await turn([U('tôi nên học gì để dễ xin việc')], ['Học lập trình.'])
    expect(x.calls).toBe(1)
    expect(x.text).toContain('Học lập trình.')
    log('route_advice', 'Học lập trình.', x.text, 'KEPT')
  }, 40000)
})

describe('flag OFF (control)', () => {
  it('the thin answers reach the user as written, one model call', async () => {
    const a = await turn([U('biết tesla ko'), A(Q1), U('nhà phát minh á')], ['À, Nikola Tesla chứ gì.', TESLA])
    expect(a.calls).toBe(1)
    expect(a.text).toContain('À, Nikola Tesla chứ gì.')
    expect(a.text).not.toContain('điện xoay chiều')
    const b = await turn([U('biết iphone ko')], ['Biết chứ.', IPHONE])
    expect(b.calls).toBe(1)
    expect(b.text).toContain('Biết chứ.')
    expect(b.text).not.toContain('Apple')
    log('route_flag_off', 'À, Nikola Tesla chứ gì. / Biết chứ.', a.text + ' | ' + b.text, 'UNCHANGED (flag off)')
  }, 60000)
})
