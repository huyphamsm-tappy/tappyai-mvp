/**
 * HOTLINE_CLAIM_GUARD (12/11/2026) in the chat route: OFF (default) the answer reaches the client as the model wrote it; ON the final answer loses a cost/hours claim about 113, 114 or 115
 * (not verified by the owner's list), 111 and 112 stay. The mocks are the ones of r13Wiring.route.test.ts; the stubbed model answers with a fixed data stream.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => {
  const state = { answer: '' }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  const client = { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) }
  return { state, client, admin: client }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u1' }, supabase: h.client }) }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return { ...real, consumeAiQuestion: async () => ({ ok: true, remaining: 10, limit: 15 }) }
})
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    extract: () => Promise.resolve({}),
    stream: () => ({ toDataStreamResponse: () => new Response(`0:${JSON.stringify(h.state.answer)}\ne:{"finishReason":"stop"}\nd:{"finishReason":"stop"}\n`, { status: 200, headers: { 'content-type': 'text/plain' } }) }),
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return { ...real, searchPlaces: async () => ({ source: 'test', count: 0, location: '', results: [], place_search_status: 'empty' }) }
})

import { POST } from '@/app/api/chat/route'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const post = async (text: string) => {
  const body = { messages: [{ role: 'user', content: text }] }
  return POST({
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)), signal: undefined,
  } as never)
}
const textOf = (wire: string) => wire.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

const UAT = 'Gọi 115 khi cần xe cứu thương. Cuộc gọi đến tổng đài 115 miễn phí; tuy nhiên, chi phí xe cứu thương có thể được tính riêng. Hãy nói rõ địa chỉ.'
const ASK = 'Số 115 là gì và có tốn tiền không?'

beforeEach(() => { h.state.answer = UAT; __resetAiQuestionQuotaLocal() })
afterEach(() => { vi.unstubAllEnvs() })

describe('HOTLINE_CLAIM_GUARD in the chat route', () => {
  it('OFF (default): the answer is exactly what the model wrote', async () => {
    const body = await (await post(ASK)).text()
    expect(textOf(body)).toBe(UAT)
  })
  it('ON: the unverified "free" claim about 115 is gone, the rest of the answer is not', async () => {
    vi.stubEnv('HOTLINE_CLAIM_GUARD', '1')
    const body = await (await post(ASK)).text()
    expect(textOf(body)).toBe('Gọi 115 khi cần xe cứu thương. Hãy nói rõ địa chỉ.')
    expect(body).toContain('d:{"finishReason":"stop"}')
  })
  it('ON: 111 and 112 (verified) keep their claims', async () => {
    vi.stubEnv('HOTLINE_CLAIM_GUARD', '1')
    h.state.answer = 'Tổng đài 111 miễn phí, hoạt động 24/7. Số 112 cũng miễn phí.'
    expect(textOf(await (await post(ASK)).text())).toBe(h.state.answer)
  })
  it('ON in a production runtime without the owner\'s allow-list: locked (answer untouched)', async () => {
    vi.stubEnv('HOTLINE_CLAIM_GUARD', '1'); vi.stubEnv('VERCEL_ENV', 'production')
    expect(textOf(await (await post(ASK)).text())).toBe(UAT)
  })
  it('another flag does not switch it on', async () => {
    vi.stubEnv('SAFETY_EMERGENCY', '1'); vi.stubEnv('MARKET_GATE', '1')
    expect(textOf(await (await post(ASK)).text())).toBe(UAT)
  })
  it('guard test: the route builds the stream only behind hotlineClaimGuardOn()', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(src).toContain("import { hotlineClaimGuardStream } from '@/lib/safety/hotlineClaimStream'")
    expect(src).toMatch(/hotlineClaimGuardOn\(\) && pictured \? pictured\.pipeThrough\(hotlineClaimGuardStream\(/)
    expect(src).toContain('return new Response(guardedBody, { status: finalResponse.status, headers: finalResponse.headers })')
  })
})
