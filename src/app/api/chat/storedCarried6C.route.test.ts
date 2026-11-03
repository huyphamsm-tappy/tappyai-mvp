/**
 * P0-2 — stored-first carried facts at route level. Offline; the store is in-process.
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
import { __resetChatSessionStore, saveChatSessionState } from '@/lib/ai/consultative/chatSessionState'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    writes: [] as unknown[],
    signedIn: true,
    legacyModelCalls: 0,
    stepThrows: false,
    userId: 'u-carried',
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.signedIn ? { id: h.state.userId } : null, supabase: h.client }) }))
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
  const body = await res.text()
  log.mockRestore(); warn.mockRestore()
  const json = logs.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as Array<Record<string, any>>
  return {
    json,
    takes: json.filter(j => j.type === 'tappyai_clarify_credit' && j.step === 'take'),
    issues: json.filter(j => j.type === 'tappyai_clarify_credit' && j.step === 'issue'),
    canned: json.find(j => j.type === 'tappyai_canned_reply')?.kind ?? null,
    body,
  }
}

const used = async () => (await peekAiQuestionQuota({ kind: 'user', id: h.state.userId })).used ?? 0
/** A reply that ends with a question to the user and calls no tool: a closing decision question. */
const ASKED = 'Bạn đang ở khu vực nào để mình tìm chỗ gần bạn?'
const ASK = 'Gợi ý giúp mình một quán cà phê yên tĩnh để làm việc'

beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.writes = []; h.state.signedIn = true; h.state.legacyModelCalls = 0; h.state.stepThrows = false; h.state.userId = 'u-carried'
  __resetAiQuestionQuotaLocal(); __resetClarifyCreditLocal(); __resetChatSessionStore()
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
  for (const [k, v] of Object.entries({ TAPPY_AGENT: '2', CONSULTATIVE_IN_AGENT: '1', CONSULT_V2: '1', CONSULTATIVE_V1: '1' })) process.env[k] = v
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'CONSULT_V2', 'CONSULTATIVE_V1', 'CONSULT_V3']) delete process.env[k]
})


const CAFE = 'Cơm Niêu Sài Gòn'
const SAID = `Mình chọn **${CAFE}**, số **028 1111 2222**.`
const PHONE_Q = 'số điện thoại của quán này là gì?'
const storedRows = (rows: Array<Record<string, unknown>>) => ({ candidates: { rows, at: new Date().toISOString(), args: { query: 'cơm' } } })

describe('P0-2 · stored-first carried facts (route level, offline)', () => {
  // A canned carried-fact answer is served on the legacy path (Q-01: under the agent it is never served, so never free).
  beforeEach(() => { delete process.env.TAPPY_AGENT })
  it('stored rows of the consultation win over the client copy: the server value is answered, free', async () => {
    const sid = randomUUID()
    await saveChatSessionState('u-carried', sid, storedRows([{ name: CAFE, phone: '028 9999 0000' }]) as never)
    const before = await used()
    const t = await turn([U(ASK), A(SAID), U(PHONE_Q)], sid)
    console.error('DBG_BODY', JSON.stringify(t.body).slice(0, 400), t.canned)
    expect(t.canned).toBe('carried_fact')
    expect(t.body).toContain('028 9999 0000')
    expect(t.body).not.toContain('028 1111 2222')
    expect(await used()).toBe(before)
  })

  it('stored rows that lack the asked fact: nothing is restated from the client copy; the turn is modelled and charged', async () => {
    const sid = randomUUID()
    await saveChatSessionState('u-carried', sid, storedRows([{ name: CAFE, address: 'Quận 1' }]) as never)
    h.state.steps = [{ text: 'Mình sẽ kiểm tra lại số điện thoại.', toolCalls: [] }]
    const before = await used()
    const t = await turn([U(ASK), A(SAID), U(PHONE_Q)], sid)
    expect(t.canned).toBeNull()
    expect(await used()).toBe(before + 1)
  })

  it('no stored rows: the canonical client-history rule stays (a follow-up the previous reply answered is free)', async () => {
    const sid = randomUUID()
    const before = await used()
    const t = await turn([U(ASK), A(SAID), U(PHONE_Q)], sid)
    expect(t.canned).toBe('carried_fact')
    expect(t.body).toContain('028 1111 2222')
    expect(await used()).toBe(before)
  })

  it("session isolation: another owner's stored rows for the same session id are never read", async () => {
    const sid = randomUUID()
    await saveChatSessionState('u-other', sid, storedRows([{ name: CAFE, phone: '028 7777 0000' }]) as never)
    const t = await turn([U(ASK), A(SAID), U(PHONE_Q)], sid)
    expect(t.body).not.toContain('028 7777 0000')
    expect(t.body).toContain('028 1111 2222')
  })
})
