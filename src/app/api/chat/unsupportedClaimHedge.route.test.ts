/**
 * Round 41, phase 1 — REPRODUCTION of Round 40 case 8 (no code change): the unsupported-claim guard (R4, src/lib/ai/unsupportedClaimGuard.ts:166-209) rewrote a sentence the
 * model had already hedged with "chưa xác minh được", producing "…xác minh được quán mình chưa xác nhận được có chỗ đậu xe".
 * Full route (POST /api/chat, TAPPY_AGENT=2), scripted model (the text is returned as the final answer, no tools), real compose + settle, CONSULTATIVE_IN_AGENT = 0 and 1.
 *
 * VERBATIM from the Round 40 trace (server-r40.log bytes 79301–103336, ca 8):
 *   model wrote  : "Chỗ đầu tiên được nhắc là **Nhà Hàng Au Tresor**, nhưng mình chưa xác minh được quán có chỗ đậu xe máy không. Tốt nhất bạn gọi hỏi quán trước khi chạy qua; …"
 *   user read    : "Chỗ đầu tiên được nhắc là **Nhà Hàng Au Tresor**, nhưng mình chưa xác minh được quán mình chưa xác nhận được có chỗ đậu xe. Tốt nhất bạn gọi …"
 * RECONSTRUCTED (not verbatim): the conversation context (a food thread so that the place guards run, as in the live chat) and the absence of the live tool results.
 * Round 41 phase 2 made the exact phrase "chưa xác minh" a hedge for R4 with CONSULTATIVE_IN_AGENT=1 only; Round 42 commit 1 makes it a hedge on BOTH paths (flag off too), so the
 * env-0 reproduction now asserts the fixed text. Each case prints one `CASE {…}` line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { text: '' as string, calls: 0 }
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
    step: () => {
      h.state.calls++
      return Promise.resolve({ text: h.state.text, toolCalls: [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }), vision: () => Promise.resolve({ text: '' }),
  },
}))

import { POST } from '@/app/api/chat/route'

const U = (content: string) => ({ role: 'user', content })
const A = (content: string) => ({ role: 'assistant', content })
// a food thread: the place guards run on the follow-up (placeIntent), as they did in the live chat
const THREAD = [
  U('tìm quán phở ngon ở quận 1'),
  A('Mình chọn **Phở Lệ** (4.5⭐, 300 đánh giá), cách bạn 1,2 km, mở đến 22:00. **Phở Hà** ở gần đó, 0,8 km.'),
  U('chỗ đầu tiên có chỗ đậu xe máy không?'),
]
const TAIL = ' Tốt nhất bạn gọi hỏi quán trước khi chạy qua; thông tin mình tìm được chỉ là về các bãi xe trong Quận 3, không xác nhận bãi nào thuộc quán.'
const HEAD = 'Chỗ đầu tiên được nhắc là **Nhà Hàng Au Tresor**, nhưng '

async function run(text: string, flag: '0' | '1') {
  if (flag === '1') process.env.CONSULTATIVE_IN_AGENT = '1'; else delete process.env.CONSULTATIVE_IN_AGENT
  h.state.text = text; h.state.calls = 0
  __resetAiQuestionQuotaLocal()
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: THREAD }), signal: undefined,
  }
  const lines: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(String(a[0])) })
  let body = ''
  try { body = await (await POST(req as never)).text() } finally { spy.mockRestore() }
  const final = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
  const js = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const guard = js.find(j => j.guard === 'unsupported_claim') ?? null
  const place = js.find(j => j.guard === 'place_claim') ?? null
  return { final, guard, placeRan: !!place, path: js.find(j => j.type === 'tappyai_turn_path')?.consultative_in_agent ?? null }
}
const record = (name: string, flag: string, before: string, r: Awaited<ReturnType<typeof run>>, verdict: string) =>
  console.log('CASE ' + JSON.stringify({ name, env_CONSULTATIVE_IN_AGENT: flag, consultative_in_agent_seen: r.path, place_claim_ran: r.placeRan, before_guard: before, after_guard: r.final, unsupported_claim_log: r.guard ? { rewritten: r.guard.rewritten } : null, verdict }))

beforeEach(() => { process.env.CONSULT_V2 = '1'; process.env.CONSULTATIVE_V1 = '1'; process.env.TAPPY_AGENT = '2' })
afterEach(() => { for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT']) delete process.env[k] })

const MODEL_ORIGINAL = HEAD + 'mình chưa xác minh được quán có chỗ đậu xe máy không.' + TAIL
const USER_READ_LIVE = HEAD + 'mình chưa xác minh được quán mình chưa xác nhận được có chỗ đậu xe.' + TAIL

describe('Round 40 case 8, through the full route', () => {
  it('env 0 (flag OFF, Round 42 commit 1): the already-hedged sentence reaches the user untouched, no rewrite logged (until d9c8925 it became the live garble USER_READ_LIVE)', async () => {
    const r = await run(MODEL_ORIGINAL, '0')
    record('case8_model_original', '0', MODEL_ORIGINAL, r, 'flag off: fixed (unchanged)')
    expect(r.path).toBe(false)
    expect(r.placeRan).toBe(true)
    expect(r.guard).toBeNull()
    expect(r.final).toBe(MODEL_ORIGINAL)
    expect(r.final).not.toBe(USER_READ_LIVE)
  }, 60000)
  it('env 1 (CONSULTATIVE_IN_AGENT): the already-hedged sentence reaches the user untouched, no rewrite logged (was RED in phase 1)', async () => {
    const r = await run(MODEL_ORIGINAL, '1')
    record('case8_model_original', '1', MODEL_ORIGINAL, r, 'flag on: fixed (unchanged)')
    expect(r.path).toBe(true)
    expect(r.placeRan).toBe(true)
    expect(r.guard).toBeNull()
    expect(r.final).toBe(MODEL_ORIGINAL)
  }, 60000)
})

// hedge wordings in the same frame. Today's behaviour is recorded for each; the comments say what the narrow fix must (not) change.
const frame = (clause: string) => HEAD + clause + TAIL
const CONTROLS: Array<[string, string, 'unchanged' | 'rewritten']> = [
  ['chưa rõ', frame('mình chưa rõ quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['mình không chắc', frame('mình không chắc quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['chưa xác nhận được (hedge already known)', frame('mình chưa xác nhận được quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['đã xác minh (a positive claim — must stay handled as unsupported)', frame('mình đã xác minh quán có chỗ đậu xe máy.'), 'rewritten'],
  // "xem" is already in CONDITIONAL_RE (unsupportedClaimGuard.ts:65), so "đang xác minh XEM quán có …" is already left alone today; the phrase "đang xác minh" itself is not a hedge
  ['đang xác minh xem (hedged today by the word "xem", not by "xác minh")', frame('mình đang xác minh xem quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['đang xác minh, no "xem" (progress, not a hedge — must stay handled as before)', frame('mình đang xác minh quán có chỗ đậu xe máy.'), 'rewritten'],
  ['unhedged real claim', frame('quán có chỗ đậu xe máy rộng rãi.'), 'rewritten'],
  // Phase 2: the exact phrase is a hedge (flag on); everything near it is not
  ['chưa xác minh (no "được") — the exact phrase, hedge (phase 2)', frame('mình chưa xác minh quán có chỗ đậu xe máy.'), 'unchanged'],
  ['chưa xác minh in an EARLIER sentence does not hedge a LATER unhedged claim', HEAD + 'mình chưa xác minh giờ mở cửa. Quán có chỗ đậu xe máy rộng rãi.' + TAIL, 'rewritten'],
  ['không xác minh được (no "chưa") — not the phrase, still a claim', frame('mình không xác minh được quán có chỗ đậu xe máy.'), 'rewritten'],
  // Round 41 had this as out of scope ("rewritten"); Round 42 commit 2 (approved by Huy) makes the exact phrase a hedge
  ['chưa kiểm chứng được (Round 42 commit 2: now a hedge)', frame('mình chưa kiểm chứng được quán có chỗ đậu xe máy.'), 'unchanged'],
]
describe('controls: other wordings in the same frame (route, env 1; the "xác minh" rows are the phase-2 boundary)', () => {
  for (const [name, text, expected] of CONTROLS) {
    it(`${name}`, async () => {
      const r = await run(text, '1')
      const changed = r.final !== text
      record('control_' + name, '1', text, r, changed ? 'REWRITTEN' : 'UNCHANGED')
      expect(r.path).toBe(true)
      expect(changed ? 'rewritten' : 'unchanged').toBe(expected)
    }, 60000)
  }
  it('an unhedged real claim is handled identically with the flag off and on (same rewrite, byte for byte)', async () => {
    const text = frame('quán có chỗ đậu xe máy rộng rãi.')
    const off = await run(text, '0'), on = await run(text, '1')
    record('control_unhedged_flag_off', '0', text, off, 'same as flag on')
    expect(on.final).toBe(off.final)
    expect(on.final).not.toBe(text)
    expect(on.guard?.rewritten).toEqual(['service'])
  }, 60000)
})

// ── Round 42, step 1 (tests only; the product code is NOT touched in this step). `it.fails` = the DESIRED behaviour, RED today. The sentence frame is the case-8 frame.
// "chưa kiểm chứng được" is the same kind of hedge as "chưa xác minh được": today R4 rewrites it into the same double-hedge garble, flag off AND on.
const KIEM_CHUNG_FRAMES: Array<[string, string]> = [
  ['chưa kiểm chứng được …có … không', frame('mình chưa kiểm chứng được quán có chỗ đậu xe máy không.')],
  ['chưa kiểm chứng …có …', frame('mình chưa kiểm chứng quán có chỗ đậu xe máy.')],
]
// Round 42 commit 2: red in step 1 (rewritten into "…quán mình chưa xác nhận được có chỗ đậu xe" on both paths), green now.
describe('Round 42 commit 2 — "chưa kiểm chứng (được)" (route, env 0 and env 1)', () => {
  for (const flag of ['0', '1'] as const) {
    for (const [name, text] of KIEM_CHUNG_FRAMES) {
      it(`env ${flag}: ${name} reaches the user untouched, no rewrite logged`, async () => {
        const r = await run(text, flag)
        record('r42_' + name, flag, text, r, 'fixed: unchanged')
        expect(r.path).toBe(flag === '1')
        expect(r.placeRan).toBe(true)
        expect(r.guard).toBeNull()
        expect(r.final).toBe(text)
        expect(r.final).not.toContain('mình chưa xác nhận được có chỗ đậu xe')
      }, 60000)
    }
  }
})
describe('Round 42 commit 1 — "chưa xác minh (được)" with the flag OFF (red in step 1, green now)', () => {
  it('env 0: "chưa xác minh được quán có chỗ đậu xe máy không" reaches the user untouched', async () => {
    const r = await run(MODEL_ORIGINAL, '0')
    expect(r.guard).toBeNull()
    expect(r.final).toBe(MODEL_ORIGINAL)
  }, 60000)
  it('env 0: "chưa xác minh quán có chỗ đậu xe máy" (no "được") reaches the user untouched', async () => {
    const t = frame('mình chưa xác minh quán có chỗ đậu xe máy.')
    const r = await run(t, '0')
    record('r42_chua_xac_minh_no_duoc', '0', t, r, 'flag off: unchanged')
    expect(r.guard).toBeNull()
    expect(r.final).toBe(t)
  }, 60000)
})
// controls with the flag OFF: what must NOT change (same expectations as the env-1 controls, except the two "xác minh/kiểm chứng" hedges which are the subject)
const CONTROLS_OFF: Array<[string, string, 'unchanged' | 'rewritten']> = [
  ['chưa rõ', frame('mình chưa rõ quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['mình không chắc', frame('mình không chắc quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['chưa xác nhận được', frame('mình chưa xác nhận được quán có chỗ đậu xe máy không.'), 'unchanged'],
  ['đã xác minh + khẳng định', frame('mình đã xác minh quán có chỗ đậu xe máy.'), 'rewritten'],
  ['đang xác minh + khẳng định (không "xem")', frame('mình đang xác minh quán có chỗ đậu xe máy.'), 'rewritten'],
  ['đã kiểm chứng + khẳng định', frame('mình đã kiểm chứng quán có chỗ đậu xe máy.'), 'rewritten'],
  ['đang kiểm chứng + khẳng định (không "xem")', frame('mình đang kiểm chứng quán có chỗ đậu xe máy.'), 'rewritten'],
  ['không xác minh được (không "chưa")', frame('mình không xác minh được quán có chỗ đậu xe máy.'), 'rewritten'],
  ['khẳng định không rào', frame('quán có chỗ đậu xe máy rộng rãi.'), 'rewritten'],
  ['chưa xác minh ở câu TRƯỚC không che khẳng định ở câu SAU', HEAD + 'mình chưa xác minh giờ mở cửa. Quán có chỗ đậu xe máy rộng rãi.' + TAIL, 'rewritten'],
]
describe('Round 42 step 1 — controls with the flag OFF (route, env 0)', () => {
  for (const [name, text, expected] of CONTROLS_OFF) {
    it(`${name}`, async () => {
      const r = await run(text, '0')
      const changed = r.final !== text
      record('r42_control_off_' + name, '0', text, r, changed ? 'REWRITTEN' : 'UNCHANGED')
      expect(r.path).toBe(false)
      expect(changed ? 'rewritten' : 'unchanged').toBe(expected)
    }, 60000)
  }
})

// supplement (direct calls, NOT the evidence of the fix — the route cases above are): the price-ceiling rule R2 reads CONDITIONAL_RE unchanged, so "chưa xác minh" does not change it with the flag on
describe('R2 (price ceiling) is untouched by the R4 hedge phrases', () => {
  // The exact outputs of 6eec9e9 / 4929174 / d9c8925 (harness r42pre-*: tools.r42_direct_r2_*); R2 reads CONDITIONAL_RE, never the R4-only phrases.
  it('"chưa xác minh được giá dưới 80k" is still rewritten by R2 exactly as before', async () => {
    const { guardUnsupportedClaims } = await import('@/lib/ai/unsupportedClaimGuard')
    const ev = { venues: [{ name: 'Quán Lệ Xanh', band: { lo: 1000, hi: 100000 } as never, texts: [] }], sharedTexts: [], userTexts: ['quán dưới 80k'] }
    const t = 'Quán Lệ Xanh chưa xác minh được giá dưới 80k.'
    const r = guardUnsupportedClaims(t, ev)
    console.log('CASE ' + JSON.stringify({ name: 'r2_chua_xac_minh', before_guard: t, after_guard: r.text, rewritten: r.rewritten }))
    expect(r.text).toBe('Quán Lệ Xanh chưa xác minh được giá tham khảo tới 100k (chưa chắc dưới 80k).')
    expect(r.rewritten).toEqual(['price_ceiling'])
  })
  it('"chưa kiểm chứng được giá dưới 80k" is still left alone by R2 exactly as before (the word "kiem" is in R2\'s own skip list)', async () => {
    const { guardUnsupportedClaims } = await import('@/lib/ai/unsupportedClaimGuard')
    const ev = { venues: [{ name: 'Quán Lệ Xanh', band: { lo: 1000, hi: 100000 } as never, texts: [] }], sharedTexts: [], userTexts: ['quán dưới 80k'] }
    const t = 'Quán Lệ Xanh chưa kiểm chứng được giá dưới 80k.'
    const r = guardUnsupportedClaims(t, ev)
    expect(r.text).toBe(t)
    expect(r.rewritten).toEqual([])
  })
})
