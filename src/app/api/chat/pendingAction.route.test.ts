/**
 * Q-03 (owner 18/10, PREIMPL-Q01-Q03): the pending side-effecting action and the user's short answers. A pending action may run ONLY on an
 * explicit confirmation given in the turn RIGHT AFTER the request — "ok" / "có" / "được" are never a standing consent. Changing the subject,
 * a canned small-talk turn, a refusal or expiry ends the wait. Login, argument hash, expiry and run-once checks stay as they are.
 * Route level, the UAT configuration (TAPPY_AGENT=2, CONSULTATIVE_IN_AGENT, CONSULT_V3), scripted model, no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { __resetAiQuestionQuotaLocal, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { __resetClarifyCreditLocal } from '@/lib/ai/quota/clarifyCredit'
import { __resetChatSessionStore, loadChatSessionState } from '@/lib/ai/consultative/chatSessionState'

const h = vi.hoisted(() => {
  const state = {
    steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }>,
    stepCalls: [] as Array<Record<string, unknown>>,
    writes: [] as unknown[],
    signedIn: true,
    /** Calls to the non-agent model entry points (stream / generate / vision): the image / clip route. Agent turns use `step` (stepCalls). */
    legacyModelCalls: 0,
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.signedIn ? { id: 'u-pending' } : null, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/actions/runAction', () => ({ runAiWriteAction: vi.fn(async (o: unknown) => { h.state.writes.push(o); return { ok: true, result: { ok: true, id: 'w1' } } }) }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => (h.state.legacyModelCalls++, { toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) }),
    step: (opts: Record<string, unknown>) => {
      h.state.stepCalls.push(opts)
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => { h.state.legacyModelCalls++; return Promise.resolve({ text: '' }) },
    vision: () => { h.state.legacyModelCalls++; return Promise.resolve({ text: '' }) },
  },
}))

import { POST } from '@/app/api/chat/route'
import { isThanksOnly } from '@/lib/ai/cannedReply'
import { confirmationOf } from '@/lib/ai/agent'

const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `c-${Math.random().toString(36).slice(2)}`, toolName, args })
const U = (content: string) => ({ role: 'user', content })
const A = (content: string) => ({ role: 'assistant', content })
async function turn(messages: unknown[], sid: string, extraBody: Record<string, unknown> = {}) {
  const logs: string[] = []
  const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(String(a[0])) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', 'x-tappy-age-declared': '18plus' }),
    json: () => Promise.resolve({ messages, chatSessionId: sid, userLocation: { lat: 10.7769, lng: 106.7009, address: 'Quận 1, TP.HCM' }, ...extraBody }),
    signal: undefined,
  }
  const res = await POST(req as never)
  const body = await res.text()
  log.mockRestore(); warn.mockRestore()
  const json = logs.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as Array<Record<string, any>>
  return { body, json, canned: json.find(j => j.type === 'tappyai_canned_reply')?.kind ?? null, actions: json.filter(j => j.type === 'tappyai_agent_action') }
}

const ASK = 'theo dõi giá airpods pro 2, báo mình khi dưới 4 triệu'
const ASKED = 'Mình sẽ theo dõi giá AirPods Pro 2 và báo khi dưới 4 triệu — bạn xác nhận nhé?'
/** Turn 1: the model requests the action; it is parked (nothing written). */
async function park(sid: string) {
  h.state.steps = [
    { text: '', toolCalls: [call('request_action', { action: 'save_price_watch', args: { product_name: 'AirPods Pro 2', target_price: 4_000_000, search_query: 'airpods pro 2 giá' } })] },
    { text: ASKED, toolCalls: [] },
  ]
  const t = await turn([U(ASK)], sid)
  expect(h.state.writes).toHaveLength(0)
  return t
}

beforeEach(() => {
  h.state.steps = []; h.state.stepCalls = []; h.state.writes = []; h.state.signedIn = true; h.state.legacyModelCalls = 0
  __resetAiQuestionQuotaLocal(); __resetClarifyCreditLocal(); __resetChatSessionStore()
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
  for (const [k, v] of Object.entries({ TAPPY_AGENT: '2', CONSULTATIVE_IN_AGENT: '1', CONSULT_V2: '1', CONSULTATIVE_V1: '1', CONSULT_V3: '1' })) process.env[k] = v
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'CONSULT_V2', 'CONSULTATIVE_V1', 'CONSULT_V3']) delete process.env[k]
})

describe('Q-03 · explicit confirmation in the very next turn', () => {
  it('C1 "ok" right after the request confirms it: the action runs once, no canned small-talk reply', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Xong, mình đã bật theo dõi giá.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('ok')], sid)
    expect(t2.canned).toBeNull()
    expect(h.state.writes).toHaveLength(1)
    expect(t2.actions).toEqual([expect.objectContaining({ tool: 'save_price_watch', confirmed: true, ok: true })])
  })
  it('C1b "xác nhận" (the existing path) still confirms', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Xong.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('xác nhận')], sid)
    expect(h.state.writes).toHaveLength(1)
  })
  it('C4 a refusal cancels; a later "có" does not bring it back', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Ok, mình huỷ.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('thôi huỷ đi')], sid)
    expect(t2.actions).toEqual([expect.objectContaining({ confirmed: false })])
    h.state.steps = [{ text: 'Bạn muốn xem gì tiếp?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('thôi huỷ đi'), A('Ok, mình huỷ.'), U('có')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
})

describe('Q-03 · "ok / có / được" is never a standing consent', () => {
  it('C7 a different question in between ends the wait: a later "có" (to another question) runs nothing', async () => {
    const sid = randomUUID()
    await park(sid)
    const OTHER = 'AirPods Pro 2 có 2 bản: cổng Lightning và USB-C. Bạn muốn xem bản USB-C không?'
    h.state.steps = [{ text: OTHER, toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('à mà airpods pro 2 có mấy bản')], sid)
    h.state.steps = [{ text: 'Đây là bản USB-C.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('à mà airpods pro 2 có mấy bản'), A(OTHER), U('có')], sid)
    expect(h.state.writes).toHaveLength(0)
    // the wait ended in turn 2, and the trace says why
    expect(t2.actions).toEqual([expect.objectContaining({ superseded: true })])
  })
  it('C7b a small-talk turn in between ("cảm ơn") also ends the wait', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Không có gì!', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('cảm ơn')], sid)
    h.state.steps = [{ text: 'Mình giúp gì tiếp?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('cảm ơn'), A('Không có gì!'), U('được')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C10 an image turn in between (the legacy path, the agent does not run) also ends the wait', async () => {
    const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const sid = randomUUID()
    await park(sid)
    const img = { role: 'user', content: [{ type: 'text', text: 'cái tai nghe này là loại gì' }, { type: 'image', image: PNG_1PX }] }
    await turn([U(ASK), A(ASKED), img], sid)
    h.state.steps = [{ text: 'Ok.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), img, A('old path'), U('có')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C8 "ok nhưng đổi giá 15 triệu" is not a confirmation: nothing runs', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Bạn muốn báo khi dưới 15 triệu?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('ok nhưng đổi giá 15 triệu')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C3 "ok" with nothing pending and no question before: the canned small-talk reply, as before', async () => {
    const sid = randomUUID()
    const t = await turn([U('ok')], sid)
    expect(t.canned).toBe('chitchat')
    expect(h.state.stepCalls).toHaveLength(0)
  })
})

describe('Q-03 · a clear thanks right after the request (owner 18/10, R2 scope: ONLY thanks is free + ends the wait)', () => {
  const used = async () => (await peekAiQuestionQuota({ kind: 'user', id: 'u-pending' })).used
  for (const thanks of ['cảm ơn', 'cảm ơn bạn nhé', 'cảm ơn nhiều lắm', 'thanks']) {
    it(`C11 "${thanks}": canned reply, no model call, no quota, and the stored pending action is cleared`, async () => {
      const sid = randomUUID()
      await park(sid)
      const quotaAfterPark = await used()
      const calls = h.state.stepCalls.length
      const t2 = await turn([U(ASK), A(ASKED), U(thanks)], sid)
      expect(t2.canned).toBe('chitchat')
      expect(h.state.stepCalls.length).toBe(calls)
      expect(await used()).toBe(quotaAfterPark)
      expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
      expect(t2.actions).toEqual([expect.objectContaining({ confirmed: false, superseded: true })])
      // and a later confirmation word confirms nothing
      h.state.steps = [{ text: 'Mình giúp gì tiếp?', toolCalls: [] }]
      await turn([U(ASK), A(ASKED), U(thanks), A('Không có gì!'), U('ok')], sid)
      expect(h.state.writes).toHaveLength(0)
    })
  }
  it('C11b the stored state keeps everything else (only the pending action is cleared)', async () => {
    const sid = randomUUID()
    await park(sid)
    const before = await loadChatSessionState('u-pending', sid)
    await turn([U(ASK), A(ASKED), U('cảm ơn')], sid)
    const after = await loadChatSessionState('u-pending', sid)
    expect(after?.pendingAction ?? null).toBeNull()
    expect({ ...after, pendingAction: undefined, updatedAt: undefined }).toEqual({ ...before, pendingAction: undefined, updatedAt: undefined })
  })
  it('C1c "ok" (a confirmation word) is NOT treated as thanks: it still goes to the confirmer and runs the action', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Xong.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('ok')], sid)
    expect(t2.canned).toBeNull()
    expect(h.state.writes).toHaveLength(1)
  })
})

describe('Q-03 R2 scope · only a clear thanks is free; other small talk is a normal turn (quota applies) that ends the wait', () => {
  // in this test the in-process quota store answers, so `used` is a number (the non-null assertion keeps `+ 1` type-safe)
  const used = async () => (await peekAiQuestionQuota({ kind: 'user', id: 'u-pending' })).used!
  // 'cảm ơn bye' / 'thanks there' are chitchat to the intent classifier but are NOT a clear thanks (isThanksOnly is the narrower rule)
  for (const talk of ['haha', 'chào', 'xin chào', 'hello', 'tạm biệt', 'cảm ơn nhưng mình đổi ý', 'cảm ơn bye', 'thanks there']) {
    it(`C12 "${talk}": NOT the free canned reply — the agent runs, one turn is charged, the wait ends, a later "ok" runs nothing`, async () => {
      const sid = randomUUID()
      await park(sid)
      const quotaAfterPark = await used()
      const calls = h.state.stepCalls.length
      h.state.steps = [{ text: 'Mình đây 😊', toolCalls: [] }]
      const t2 = await turn([U(ASK), A(ASKED), U(talk)], sid)
      expect(t2.canned).toBeNull()
      expect(h.state.stepCalls.length).toBeGreaterThan(calls)
      expect(await used()).toBe(quotaAfterPark + 1)
      expect(h.state.writes).toHaveLength(0)
      expect(t2.actions).toEqual([expect.objectContaining({ confirmed: false, superseded: true })])
      expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
      h.state.steps = [{ text: 'Mình giúp gì tiếp?', toolCalls: [] }]
      await turn([U(ASK), A(ASKED), U(talk), A('Mình đây 😊'), U('ok')], sid)
      expect(h.state.writes).toHaveLength(0)
    })
  }
  it('C12b thanks is only free when it is the WHOLE message: "cảm ơn, giá thấp hơn nữa?" is a normal charged turn', async () => {
    const sid = randomUUID()
    await park(sid)
    const quotaAfterPark = await used()
    h.state.steps = [{ text: 'Mình hiểu rồi.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('cảm ơn, giá thấp hơn nữa?')], sid)
    expect(t2.canned).toBeNull()
    expect(await used()).toBe(quotaAfterPark + 1)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C13 a refusal ("không cần nữa") cancels the pending action and a later "có" does not bring it back', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Ok, mình huỷ.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('không cần nữa')], sid)
    expect(t2.actions).toEqual([expect.objectContaining({ confirmed: false })])
    expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
    h.state.steps = [{ text: 'Bạn cần gì?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('không cần nữa'), A('Ok, mình huỷ.'), U('có')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
})

describe('Q-03 R2 scope · image / clip turns and concurrency never leave a stale action alive', () => {
  const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const usedNow = async () => (await peekAiQuestionQuota({ kind: 'user', id: 'u-pending' })).used!
  const REVIEW_ID = '3f1f2f7e-6c1e-4a52-9a52-2f3b1f6d0a11'
  const CLIP = { context: { kind: 'explore_clip', reviewId: REVIEW_ID } }
  // owner 18/10 (delta): WITH a waiting action, "cảm ơn" + image / clip is NOT the free canned reply — the media turn runs the normal route,
  // is charged one turn like any media turn, and ends the wait. Three independent facts are asserted: no canned reply, the model entry
  // point was called (the media reached the normal route), and the quota rose by exactly one.
  it('C14 WITH a waiting action, "cảm ơn" + an image is a normal media turn: no canned reply, the model is called, exactly one turn is charged, the wait ends, a later "ok" runs nothing', async () => {
    const sid = randomUUID()
    await park(sid)
    const q0 = await usedNow()
    const img = { role: 'user', content: [{ type: 'text', text: 'cảm ơn' }, { type: 'image', image: PNG_1PX }] }
    const t2 = await turn([U(ASK), A(ASKED), img], sid)
    expect(t2.canned).toBeNull()
    expect(t2.body).toContain('old path') // the legacy media route answered (the scripted model), not the canned thanks
    expect(t2.body).not.toContain('Không có gì')
    expect(h.state.legacyModelCalls).toBeGreaterThan(0)
    expect(await usedNow()).toBe(q0 + 1)
    expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
    h.state.steps = [{ text: 'Mình giúp gì tiếp?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), img, A('old path'), U('ok')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C14c (unchanged policy) WITHOUT a waiting action, "cảm ơn" + an image keeps today\'s behaviour: the free canned reply, no model, no quota', async () => {
    const sid = randomUUID()
    const q0 = await usedNow()
    const img = { role: 'user', content: [{ type: 'text', text: 'cảm ơn' }, { type: 'image', image: PNG_1PX }] }
    const t = await turn([img], sid)
    expect(t.canned).toBe('chitchat')
    expect(h.state.legacyModelCalls).toBe(0)
    expect(await usedNow()).toBe(q0)
  })
  it('C15 a clip ("Hỏi Tappy về chỗ này") turn in between also ends the wait: a later "ok" runs nothing', async () => {
    const sid = randomUUID()
    await park(sid)
    const REVIEW = '3f1f2f7e-6c1e-4a52-9a52-2f3b1f6d0a11'
    h.state.steps = [{ text: 'Quán này nằm ở Quận 1.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('quán trong clip này ở đâu')], sid, { context: { kind: 'explore_clip', reviewId: REVIEW } })
    expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
    h.state.steps = [{ text: 'Mình giúp gì tiếp?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('quán trong clip này ở đâu'), A('Quán này nằm ở Quận 1.'), U('ok')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C15b WITH a waiting action, "cảm ơn" from a clip ("Hỏi Tappy về chỗ này") screen is a normal clip turn: no canned reply, the model is called, exactly one turn is charged, the wait ends, a later "ok" runs nothing', async () => {
    const sid = randomUUID()
    await park(sid)
    const q0 = await usedNow()
    const t2 = await turn([U(ASK), A(ASKED), U('cảm ơn')], sid, CLIP)
    expect(t2.canned).toBeNull()
    expect(t2.body).toContain('old path')
    expect(t2.body).not.toContain('Không có gì')
    expect(h.state.legacyModelCalls).toBeGreaterThan(0)
    expect(await usedNow()).toBe(q0 + 1)
    expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
    h.state.steps = [{ text: 'Mình giúp gì tiếp?', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('cảm ơn'), A('old path'), U('ok')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
  it('C15c (unchanged policy) WITHOUT a waiting action, "cảm ơn" from a clip screen keeps today\'s behaviour: the free canned reply, no model, no quota', async () => {
    const sid = randomUUID()
    const q0 = await usedNow()
    const t = await turn([U('cảm ơn')], sid, CLIP)
    expect(t.canned).toBe('chitchat')
    expect(h.state.legacyModelCalls).toBe(0)
    expect(await usedNow()).toBe(q0)
  })
  it('C16 "cảm ơn" and "ok" sent at once: the action runs AT MOST once and never again afterwards', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Xong.', toolCalls: [] }, { text: 'Xong.', toolCalls: [] }]
    await Promise.all([turn([U(ASK), A(ASKED), U('cảm ơn')], sid), turn([U(ASK), A(ASKED), U('ok')], sid)])
    const afterRace = h.state.writes.length
    expect(afterRace).toBeLessThanOrEqual(1)
    h.state.steps = [{ text: 'Rồi nhé.', toolCalls: [] }, { text: 'Rồi nhé.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('ok')], sid)
    await turn([U(ASK), A(ASKED), U('xác nhận')], sid)
    expect(h.state.writes.length).toBe(afterRace)
  })
  it('C17 two thanks sent at once end the wait once, run nothing, and cost nothing', async () => {
    const sid = randomUUID()
    await park(sid)
    const q0 = (await peekAiQuestionQuota({ kind: 'user', id: 'u-pending' })).used
    await Promise.all([turn([U(ASK), A(ASKED), U('cảm ơn')], sid), turn([U(ASK), A(ASKED), U('cảm ơn')], sid)])
    expect(h.state.writes).toHaveLength(0)
    expect((await peekAiQuestionQuota({ kind: 'user', id: 'u-pending' })).used).toBe(q0)
    expect((await loadChatSessionState('u-pending', sid))?.pendingAction ?? null).toBeNull()
  })
})

describe('Q-03 R2 scope · isThanksOnly is a clear thanks and never a confirmation word (also documents why the route\'s confirmationOf guard is redundant)', () => {
  it('T1 accepts a plain thanks', () => {
    for (const s of ['cảm ơn', 'Cảm ơn bạn nhé', 'CẢM ƠN!', 'cam on tappy', 'thanks', 'Thank you', 'thank you so much', 'cảm ơn nhiều lắm ạ']) expect(isThanksOnly(s), s).toBe(true)
  })
  it('T2 rejects everything that is not only a thanks', () => {
    for (const s of ['haha', 'chào', 'tạm biệt', 'ok', 'xác nhận', 'cảm ơn bye', 'thanks there', 'cảm ơn, giá thấp hơn nữa?', 'cảm ơn nhưng mình đổi ý', 'ok cảm ơn', 'không, cảm ơn', '', '   ']) expect(isThanksOnly(s), s).toBe(false)
  })
  it('T3 no sentence the thanks grammar accepts is also read as a confirmation or a refusal (exhaustive over the grammar, 3 fillers deep)', () => {
    const heads = ['cảm ơn', 'Cảm Ơn', 'cam on', 'thank you', 'thanks', 'thank']
    const fillers = ['bạn', 'tappy', 'tappyai', 'nhé', 'nha', 'nhiều', 'lắm', 'ạ', 'a', 'ơi', 'oi', 'you', 'so much']
    const tails = ['', '!', '.', '?', '~', '…', '!!', ' !']
    let accepted = 0
    const seqs: string[][] = [[]]
    for (let d = 0; d < 3; d++) for (const q of seqs.filter(x => x.length === d)) for (const f of fillers) seqs.push([...q, f])
    for (const h of heads) for (const q of seqs) for (const t of tails) {
      const s = [h, ...q].join(' ') + t
      if (!isThanksOnly(s)) continue
      accepted++
      expect(confirmationOf(s), s).toBeNull()
    }
    expect(accepted).toBeGreaterThan(5000)
  })
})

describe('Q-03 · run once, expiry, login (unchanged guarantees)', () => {
  it('C5 a repeated confirmation runs the action once (the second "ok" has nothing pending)', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Xong.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('ok')], sid)
    h.state.steps = [{ text: 'Đã bật rồi nhé.', toolCalls: [] }]
    await turn([U(ASK), A(ASKED), U('ok')], sid)
    expect(h.state.writes).toHaveLength(1)
  })
  it('C5b two confirmations sent at once run the action once', async () => {
    const sid = randomUUID()
    await park(sid)
    h.state.steps = [{ text: 'Xong.', toolCalls: [] }, { text: 'Xong.', toolCalls: [] }]
    await Promise.all([turn([U(ASK), A(ASKED), U('xác nhận')], sid), turn([U(ASK), A(ASKED), U('xác nhận')], sid)])
    expect(h.state.writes).toHaveLength(1)
  })
  it('C6 an expired request (over 10 minutes) does not run; the user is told it did not', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-18T03:00:00Z'))
    const sid = randomUUID()
    await park(sid)
    vi.setSystemTime(new Date('2026-10-18T03:11:00Z'))
    h.state.steps = [{ text: 'Yêu cầu đã hết hạn.', toolCalls: [] }]
    const t2 = await turn([U(ASK), A(ASKED), U('xác nhận')], sid)
    expect(h.state.writes).toHaveLength(0)
    expect(t2.actions).toEqual([expect.objectContaining({ confirmed: true, ok: false, refused: 'expired' })])
  })
  it('C9 a guest cannot park an action, so "ok" confirms nothing', async () => {
    h.state.signedIn = false
    const sid = randomUUID()
    h.state.steps = [
      { text: '', toolCalls: [call('request_action', { action: 'save_price_watch', args: { product_name: 'AirPods Pro 2', target_price: 4_000_000, search_query: 'airpods' } })] },
      { text: 'Bạn cần đăng nhập để bật theo dõi giá.', toolCalls: [] },
    ]
    await turn([U(ASK)], sid)
    h.state.steps = [{ text: 'Ok.', toolCalls: [] }]
    await turn([U(ASK), A('Bạn cần đăng nhập để bật theo dõi giá.'), U('ok')], sid)
    expect(h.state.writes).toHaveLength(0)
  })
})
