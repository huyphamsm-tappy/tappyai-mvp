/**
 * Batch 6C — the free-clarify turn contract at route level (clarifyCredit.ts). Offline: the model is scripted, the store is in-process, nothing
 * is sent over the network. The quota is read through peekAiQuestionQuota, and the take / issue decisions through the route's own log lines.
 *
 * Contract under test:
 *   · CONSULT_V3 off: nothing is taken, issued or kept; a direct answer is charged like any turn (the default is unchanged).
 *   · CONSULT_V3 on: a charged turn that ends with a question issues ONE credit for that question; the user's direct answer is then free once
 *     (the quota does not move) and the credit is one-shot — the same answer again is charged (retry / replay cannot double-free).
 *   · "ok" answering the closing question is read in context only when the turn is certainly free; a later "ok" that answers nothing is the
 *     canonical small-talk canned reply and takes no credit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { __resetAiQuestionQuotaLocal, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { __resetClarifyCreditLocal } from '@/lib/ai/quota/clarifyCredit'
import { __resetChatSessionStore } from '@/lib/ai/consultative/chatSessionState'
import { ANON_LIFETIME_LIMIT } from '@/lib/config/product'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    writes: [] as unknown[],
    signedIn: true,
    /** Signed in through an anonymous session (a guest), not a real account. */
    guest: false,
    legacyModelCalls: 0,
    stepThrows: false,
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: !h.state.signedIn ? null : h.state.guest ? { id: 'g-clarify', is_anonymous: true } : { id: 'u-clarify' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => (h.state.legacyModelCalls++, { toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'Content-Type': 'text/plain' } }) }),
    step: (opts: Record<string, unknown>) => {
      h.state.stepCalls.push(opts)
      if (h.state.stepThrows) return Promise.reject(new Error('scripted model failure'))
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => { h.state.legacyModelCalls++; return Promise.resolve({ text: '' }) },
    vision: () => { h.state.legacyModelCalls++; return Promise.resolve({ text: '' }) },
  },
}))

import { POST } from '@/app/api/chat/route'

const U = (content: string) => ({ role: 'user', content })
const A = (content: string) => ({ role: 'assistant', content })
async function turn(messages: unknown[], sid: string) {
  const logs: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', 'x-tappy-age-declared': '18plus' }),
    json: () => Promise.resolve({ messages, chatSessionId: sid, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' } }),
    signal: undefined,
  }
  const res = await POST(req as never)
  await res.text()
  log.mockRestore(); warn.mockRestore()
  const json = logs.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as Array<Record<string, any>>
  return {
    status: res.status,
    json,
    takes: json.filter(j => j.type === 'tappyai_clarify_credit' && j.step === 'take'),
    issues: json.filter(j => j.type === 'tappyai_clarify_credit' && j.step === 'issue'),
    canned: json.find(j => j.type === 'tappyai_canned_reply')?.kind ?? null,
  }
}

const used = async () => (await peekAiQuestionQuota({ kind: 'user', id: 'u-clarify' })).used ?? 0
/** A reply that ends with a question to the user and calls no tool: a closing decision question. */
const ASKED = 'Bạn đang ở khu vực nào để mình tìm chỗ gần bạn?'
const ASK = 'Gợi ý giúp mình một quán cà phê yên tĩnh để làm việc'

beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.writes = []; h.state.signedIn = true; h.state.guest = false; h.state.legacyModelCalls = 0; h.state.stepThrows = false
  __resetAiQuestionQuotaLocal(); __resetClarifyCreditLocal(); __resetChatSessionStore()
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
  for (const [k, v] of Object.entries({ TAPPY_AGENT: '2', CONSULTATIVE_IN_AGENT: '1', CONSULT_V2: '1', CONSULTATIVE_V1: '1' })) process.env[k] = v
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'CONSULT_V2', 'CONSULTATIVE_V1', 'CONSULT_V3']) delete process.env[k]
})

describe('Batch 6C · free-clarify turn contract (route level, offline)', () => {
  it('CONSULT_V3 OFF (default): a direct answer to the closing question is charged, and no credit is taken or issued', async () => {
    delete process.env.CONSULT_V3
    const sid = randomUUID()
    h.state.steps = [{ text: ASKED, toolCalls: [] }]
    const t1 = await turn([U(ASK)], sid)
    expect(t1.issues).toHaveLength(0)
    const before = await used()
    h.state.steps = [{ text: 'Cảm ơn bạn, mình gợi ý nhé.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('Quận 3')], sid)
    expect(t2.takes).toHaveLength(0)
    expect(t2.canned).toBeNull()
    expect(await used()).toBe(before + 1)
  })

  it('CONSULT_V3 ON: a charged question issues one credit; the direct answer is free once; the same answer again is charged', async () => {
    process.env.CONSULT_V3 = '1'
    const sid = randomUUID()
    h.state.steps = [{ text: ASKED, toolCalls: [] }]
    const t1 = await turn([U(ASK)], sid)
    expect(t1.issues.length).toBeGreaterThan(0)
    expect(t1.issues[0].issued).toBe(true)
    const afterCharged = await used()

    h.state.steps = [{ text: 'Mình gợi ý vài quán ở Quận 3.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('Quận 3')], sid)
    expect(t2.takes.some(t => t.free === true)).toBe(true)
    expect(await used()).toBe(afterCharged)

    // Replay of the same direct answer (a retry): the credit was taken once, so this turn is charged.
    h.state.steps = [{ text: 'Mình gợi ý vài quán ở Quận 3.', toolCalls: [] }]
    const t3 = await turn([U(ASK), A(ASKED), U('Quận 3')], sid)
    expect(t3.takes.every(t => t.free !== true)).toBe(true)
    expect(await used()).toBe(afterCharged + 1)
  })

  it('CONSULT_V3 ON: "ok" answering the closing question is free once in context; a second "ok" is charged', async () => {
    process.env.CONSULT_V3 = '1'
    const sid = randomUUID()
    h.state.steps = [{ text: ASKED, toolCalls: [] }]
    await turn([U(ASK)], sid)
    const afterCharged = await used()

    h.state.steps = [{ text: 'Vậy mình tìm ở Quận 1 nhé.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('ok')], sid)
    expect(t2.canned).toBeNull()
    expect(await used()).toBe(afterCharged)

    // The second "ok" answers no question: no credit is involved. It is the canonical small-talk canned reply (free by the existing rule),
    // and it takes nothing.
    h.state.steps = [{ text: 'Bạn cần mình giúp gì tiếp?', toolCalls: [] }]
    const t3 = await turn([U(ASK), A(ASKED), U('ok'), A('Vậy mình tìm ở Quận 1 nhé.'), U('ok')], sid)
    expect(t3.takes.every(t => t.free !== true)).toBe(true)
    expect(t3.canned).toBe('chitchat')
    expect(await used()).toBe(afterCharged)
  })

  it('CONSULT_V3 ON: a free answer whose response FAILS is not charged, and its credit stays consumed (the store has no un-take)', async () => {
    process.env.CONSULT_V3 = '1'
    const sid = randomUUID()
    h.state.steps = [{ text: ASKED, toolCalls: [] }]
    await turn([U(ASK)], sid)
    const afterCharged = await used()
    h.state.stepThrows = true
    const t2 = await turn([U(ASK), A(ASKED), U('Quận 3')], sid)
    expect(t2.takes.some(t => t.free === true)).toBe(true)
    expect(await used()).toBe(afterCharged)
    // The credit is one-shot and was consumed by the failed turn: the same answer is charged on the next attempt.
    h.state.stepThrows = false
    h.state.steps = [{ text: 'Mình gợi ý vài quán ở Quận 3.', toolCalls: [] }]
    const t3 = await turn([U(ASK), A(ASKED), U('Quận 3')], sid)
    expect(t3.takes.every(t => t.free !== true)).toBe(true)
    expect(await used()).toBe(afterCharged + 1)
  })
})

// Owner 29/10 (D2): a guest has ANON_LIFETIME_LIMIT questions for life, once; past them the guest signs in. No free clarify answer,
// even under CONSULT_V3.
describe(`a guest gets no free clarify answer past the ${ANON_LIFETIME_LIMIT} (owner D2)`, () => {
  // owner 01/11/2026: 5 -> 10 (accounts have no visible limit; hidden anti-abuse ceiling) - the first turn plus ANON_LIFETIME_LIMIT - 1 more.
  const QUESTIONS = [
    'Gợi ý giúp mình một quán phở ngon', 'Thời tiết Đà Lạt tháng 12 thế nào', 'Nên mua tai nghe nào dưới 2 triệu', 'Đi Huế 2 ngày nên xem gì',
    'Cách làm bánh flan đơn giản tại nhà', 'Nên học tiếng Anh giao tiếp ở đâu', 'So sánh xe máy điện và xe xăng cho sinh viên',
    'Gợi ý quà sinh nhật cho mẹ khoảng 500 nghìn', 'Lịch trình 3 ngày ở Phú Quốc', 'Nên đọc sách gì để quản lý thời gian tốt hơn',
  ].slice(0, ANON_LIFETIME_LIMIT - 1)
  async function spendTheAllowance(sid: string) {
    expect(QUESTIONS).toHaveLength(ANON_LIFETIME_LIMIT - 1)
    h.state.steps = [{ text: ASKED, toolCalls: [] }]
    const first = await turn([U(ASK)], sid)
    for (const q of QUESTIONS) { h.state.steps = [{ text: 'Mình gợi ý nhé.', toolCalls: [] }]; await turn([U(q)], sid) }
    return first
  }
  for (const [label, setup] of [
    ['an anonymous session', () => { h.state.guest = true }],
    ['a caller with no verified identity', () => { h.state.signedIn = false }],
  ] as const) {
    it(`CONSULT_V3 ON, ${label}: Tappy's question issues no credit, and the answer after the ${ANON_LIFETIME_LIMIT} is refused with anon_limit_reached`, async () => {
      process.env.CONSULT_V3 = '1'
      setup()
      const sid = randomUUID()
      const first = await spendTheAllowance(sid)
      expect(first.status).toBe(200)
      expect(first.issues).toHaveLength(0)
      h.state.steps = [{ text: 'Mình gợi ý vài quán ở Quận 3.', toolCalls: [] }]
      const answer = await turn([U(ASK), A(ASKED), U('Quận 3')], sid)
      expect(answer.takes).toHaveLength(0)
      expect(answer.status).toBe(401)
    })
  }
})
