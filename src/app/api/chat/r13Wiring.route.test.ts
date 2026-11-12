/**
 * R13 wiring in the chat route, each part behind its OWN flag (OFF by default):
 *   ATTACHMENT_ONLY_POLICY (3.2.3), MARKET_GATE (5.5/6), SAFETY_EMERGENCY (10.5).
 * The mocks are the ones of aiConsent.route.test.ts; AI.stream records its options so "which tools, which system line" is measured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = { calls: { spend: 0, model: 0, intent: 0 }, opts: null as null | Record<string, any> }
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
  return { ...real, consumeAiQuestion: async () => { h.state.calls.spend++; return { ok: true, remaining: 10, limit: 15 } } }
})
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    extract: () => { h.state.calls.intent++; return Promise.resolve({}) },
    stream: (o: Record<string, any>) => { h.state.calls.model++; h.state.opts = o; return { toDataStreamResponse: () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }) } },
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

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const HANOI = { lat: 21.03, lng: 105.85 }
const post = async (messages: unknown[], extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
  const body = { messages, ...extra }
  return POST({
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', ...headers }),
    json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)), signal: undefined,
  } as never)
}
const FIRE = [{ role: 'user', content: 'Nhà tôi đang cháy, giúp với!' }]
const imageOnly = () => [{ role: 'user', content: [{ type: 'image', image: IMG }] }]
const toolNames = () => Object.keys((h.state.opts?.tools ?? {}) as object)

beforeEach(() => { h.state.calls = { spend: 0, model: 0, intent: 0 }; h.state.opts = null; __resetAiQuestionQuotaLocal() })
afterEach(() => { vi.unstubAllEnvs() })

describe('SAFETY_EMERGENCY', () => {
  it('OFF (default): an emergency sentence goes to the model exactly as before', async () => {
    const res = await post(FIRE, { userLocation: HANOI })
    expect(res.status).toBe(200)
    expect(h.state.calls.model).toBe(1)
  })
  it('ON: a clear emergency at a Vietnamese position gets the 114 card text, no model, no tool, no spend, plus the card annotation', async () => {
    vi.stubEnv('SAFETY_EMERGENCY', '1')
    const res = await post(FIRE, { userLocation: HANOI })
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(h.state.calls).toEqual({ spend: 0, model: 0, intent: 0 })
    expect(body).toContain('114')
    expect(body).toContain('tappy.safety.v1')
    expect(body).not.toMatch(/miễn phí|24\/7/i)
  })
  it('ON, no position: guidance and the location question, NO number', async () => {
    vi.stubEnv('SAFETY_EMERGENCY', '1')
    const body = await (await post(FIRE)).text()
    expect(h.state.calls.model).toBe(0)
    expect(body).not.toMatch(/\b11[1-5]\b/)
    expect(body).toContain('nước nào')
  })
  it('ON, the question was already asked in the thread: not asked again', async () => {
    vi.stubEnv('SAFETY_EMERGENCY', '1')
    const asked = 'Bạn cho mình biết đang ở nước nào, tỉnh hoặc thành phố nào để mình hỗ trợ tiếp nhé.'
    const body = await (await post([{ role: 'user', content: 'Nhà tôi đang cháy' }, { role: 'assistant', content: asked }, { role: 'user', content: 'Nhà tôi đang cháy, giúp với!' }])).text()
    expect(body).not.toContain('nước nào')
  })
  it('ON: a topic question about the subject still reaches the model normally', async () => {
    vi.stubEnv('SAFETY_EMERGENCY', '1')
    await post([{ role: 'user', content: 'Đường dây 115 hoạt động như thế nào?' }])
    expect(h.state.calls.model).toBe(1)
  })
  it('ON in a production runtime without the owner\'s allow-list: locked (model answers)', async () => {
    vi.stubEnv('SAFETY_EMERGENCY', '1'); vi.stubEnv('VERCEL_ENV', 'production')
    await post(FIRE, { userLocation: HANOI })
    expect(h.state.calls.model).toBe(1)
  })
  it('another flag does not switch it on', async () => {
    vi.stubEnv('MARKET_GATE', '1'); vi.stubEnv('ATTACHMENT_ONLY_POLICY', '1')
    await post(FIRE, { userLocation: HANOI })
    expect(h.state.calls.model).toBe(1)
  })
})

describe('ATTACHMENT_ONLY_POLICY', () => {
  it('OFF (default): an image-only message carries no server task line', async () => {
    await post(imageOnly())
    expect(h.state.calls.model).toBe(1)
    expect(String(h.state.opts?.system ?? '')).not.toContain('NHIỆM VỤ CỦA MÁY CHỦ')
  })
  it('ON: an image-only message reaches the model WITH the server task and WITHOUT any tool', async () => {
    vi.stubEnv('ATTACHMENT_ONLY_POLICY', '1')
    await post(imageOnly())
    expect(h.state.calls.model).toBe(1)
    expect(String(h.state.opts?.system)).toContain('NHIỆM VỤ CỦA MÁY CHỦ')
    expect(h.state.opts?.tools).toBeUndefined()
  })
  it('ON: an image WITH text is the person\'s own request: no task line, tools as usual', async () => {
    vi.stubEnv('ATTACHMENT_ONLY_POLICY', '1')
    await post([{ role: 'user', content: [{ type: 'text', text: 'Quán này ở đâu, tìm quán gần đây' }, { type: 'image', image: IMG }] }])
    expect(String(h.state.opts?.system ?? '')).not.toContain('NHIỆM VỤ CỦA MÁY CHỦ')
  })
  it('ON: plain text is untouched', async () => {
    vi.stubEnv('ATTACHMENT_ONLY_POLICY', '1')
    await post([{ role: 'user', content: 'Tìm quán bún bò ngon ở Quận 1' }])
    expect(String(h.state.opts?.system ?? '')).not.toContain('NHIỆM VỤ CỦA MÁY CHỦ')
    expect(toolNames().length).toBeGreaterThan(0)
  })
})

describe('MARKET_GATE', () => {
  const SEARCH = [{ role: 'user', content: 'Tìm quán bún bò ngon ở Quận 1' }]
  const run = async (headers: Record<string, string> = {}) => { await post(SEARCH, {}, headers); return (h.state.opts?.tools as Record<string, { execute: (a: unknown, o: unknown) => Promise<any> }> | undefined)?.search_places?.execute({ query: 'bún bò', location: 'Quận 1' }, { toolCallId: 't', messages: [] }) }
  it('OFF: an explicit foreign market changes nothing (the tool runs)', async () => {
    const r = await run({ 'x-tappy-market': 'th' })
    expect(JSON.stringify(r ?? {})).not.toContain('market_unavailable')
  })
  it('ON, default (no header = Viet Nam): the tool runs as before', async () => {
    vi.stubEnv('MARKET_GATE', '1')
    const r = await run()
    expect(r).toBeDefined()
    expect(JSON.stringify(r)).not.toContain('market_unavailable')
  })
  it('ON, an unlisted market: refused before the provider is called, as a result the model can read', async () => {
    vi.stubEnv('MARKET_GATE', '1')
    const r = await run({ 'x-tappy-market': 'th' })
    expect(r).toMatchObject({ error: 'market_unavailable', reason: 'UNKNOWN_MARKET' })
  })
  it('ON, an empty market header: refused (fail closed)', async () => {
    vi.stubEnv('MARKET_GATE', '1')
    const r = await run({ 'x-tappy-market': '' })
    expect(r).toMatchObject({ error: 'market_unavailable', reason: 'NO_MARKET' })
  })
})
