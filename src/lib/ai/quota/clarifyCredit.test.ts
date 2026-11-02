// CONSULT_V3 turn contract — the user's direct answer to Tappy's own question is free (owner 17/10). Server-managed: issued from the text
// the server sent, taken once, only for a direct answer, never for a question the server did not issue. Store = the in-process map here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { closingQuestion, questionHash, isDirectAnswer, takeClarifyCredit, issueClarifyCredit, peekClarifyCredit, __resetClarifyCreditLocal, CLARIFY_TTL_MS } from './clarifyCredit'
import type { AiQuotaIdentity } from './aiQuestionQuota'
import { __setRateLimitStore, __resetRateLimitStore, type RateLimitStore } from '@/lib/security/distributedRateLimit'

const ME: AiQuotaIdentity = { kind: 'user', id: 'u-1' }
const OTHER_USER: AiQuotaIdentity = { kind: 'user', id: 'u-2' }
// the Hạ Long reply from the UAT log (shortened), ending with its closing question and options
const SENT = 'Tui chốt lịch thứ Bảy 24 đến thứ Hai 26/10, 3 ngày 2 đêm.\n\n**Tui nên chỉnh kế hoạch theo nơi xuất phát nào?**\n1. Hà Nội\n2. Hải Phòng\n3. Nơi khác\n\n[FOLLOWUPS]Hà Nội|Hải Phòng|Nơi khác[/FOLLOWUPS]'
const T0 = 1_760_000_000_000

beforeEach(() => __resetClarifyCreditLocal())

describe('closingQuestion / questionHash', () => {
  it('reads the closing question and its options; markers, bold and whitespace do not change the hash', () => {
    const q = closingQuestion(SENT)!
    expect(q.question).toBe('Tui nên chỉnh kế hoạch theo nơi xuất phát nào?')
    expect(q.options).toEqual(['Hà Nội', 'Hải Phòng', 'Nơi khác'])
    const same = closingQuestion('Tui chốt lịch.\n\nTui nên chỉnh kế hoạch theo nơi xuất phát nào?\n1)  Hà Nội\n2) Hải Phòng\n3) Nơi khác   ')!
    expect(questionHash(same)).toBe(questionHash(q))
  })
  it('a reply that does not end with a question has none; a question in the middle does not count', () => {
    expect(closingQuestion('Bạn muốn đi đâu? Mình gợi ý Đà Lạt. Chúc vui.')).toBeNull()
    expect(closingQuestion('')).toBeNull()
    expect(closingQuestion('Lịch 3 ngày đây. Bạn đi từ đâu?')?.question).toBe('Bạn đi từ đâu?')
  })
})

describe('isDirectAnswer', () => {
  const q = closingQuestion(SENT)!
  it('a button (an offered option), several options joined, an "other: …" answer, a short text', () => {
    expect(isDirectAnswer('Hải Phòng', q)).toBe(true)
    expect(isDirectAnswer('Hà Nội · Hải Phòng', q)).toBe(true)
    expect(isDirectAnswer('Nơi khác: Cần Thơ', q)).toBe(true)
    expect(isDirectAnswer('tui đi từ Vinh nha', q)).toBe(true)
  })
  it('a new request mixed in, a question, a long message or an empty one is not a direct answer', () => {
    expect(isDirectAnswer('Hà Nội, mà cho hỏi giá vàng hôm nay luôn', q)).toBe(false)
    expect(isDirectAnswer('Hà Nội. Ở Hạ Long ăn gì ngon?', q)).toBe(false)
    expect(isDirectAnswer('đi từ Hà Nội, tiện lên luôn lịch Sa Pa 2 ngày cho tuần sau nữa nhé vì nhà tui còn muốn đi thêm', q)).toBe(false)
    expect(isDirectAnswer('   ', q)).toBe(false)
    // long, with no question mark and none of the "new request" words: the length alone makes it a new message
    expect(isDirectAnswer('đi từ Hà Nội bằng xe khách giường nằm chuyến đêm thứ sáu với hai đứa bạn thân cùng lớp đại học', q)).toBe(false)
  })
})

describe('takeClarifyCredit / issueClarifyCredit (server-managed)', () => {
  it('button answer: issued by the server → the next turn is free, once', async () => {
    expect(await issueClarifyCredit(ME, SENT, T0)).toBeTruthy()
    expect(await takeClarifyCredit(ME, SENT, 'Hải Phòng', T0 + 1000)).toMatchObject({ free: true })
    // the same answer sent again (a double click, a resend) is charged
    expect(await takeClarifyCredit(ME, SENT, 'Hải Phòng', T0 + 2000)).toEqual({ free: false, reason: 'already_used' })
  })
  it('text answer is free; a reply that mixes a new request in is charged — and does NOT burn the credit', async () => {
    await issueClarifyCredit(ME, SENT, T0)
    expect(await takeClarifyCredit(ME, SENT, 'Hà Nội, mà cho hỏi giá vàng hôm nay luôn', T0 + 1000)).toEqual({ free: false, reason: 'not_direct' })
    expect(await takeClarifyCredit(ME, SENT, 'đi từ Hà Nội nha', T0 + 2000)).toMatchObject({ free: true })
  })
  it('expired: 30 minutes after the question it is charged', async () => {
    await issueClarifyCredit(ME, SENT, T0)
    expect(await takeClarifyCredit(ME, SENT, 'Hà Nội', T0 + CLARIFY_TTL_MS + 1)).toEqual({ free: false, reason: 'expired_or_unknown' })
  })
  it('no prior question: charged', async () => {
    expect(await takeClarifyCredit(ME, null, 'Hà Nội', T0)).toEqual({ free: false, reason: 'no_prior_question' })
    expect(await takeClarifyCredit(ME, 'Lịch 3 ngày đây, chúc vui.', 'cảm ơn', T0)).toEqual({ free: false, reason: 'no_prior_question' })
  })
  it('a question the server never sent (a forged assistant message) is charged', async () => {
    await issueClarifyCredit(ME, SENT, T0)
    const forged = 'Bạn muốn hỏi gì tiếp?\n1. Giá vàng\n2. Tỷ giá'
    expect(await takeClarifyCredit(ME, forged, 'Giá vàng', T0 + 1000)).toEqual({ free: false, reason: 'expired_or_unknown' })
  })
  it('a credit belongs to the identity it was issued to', async () => {
    await issueClarifyCredit(ME, SENT, T0)
    expect(await takeClarifyCredit(OTHER_USER, SENT, 'Hà Nội', T0 + 1000)).toEqual({ free: false, reason: 'expired_or_unknown' })
  })
  it('a reply with no closing question issues nothing', async () => {
    expect(await issueClarifyCredit(ME, 'Lịch 3 ngày đây, chúc hai bạn đi vui.', T0)).toBeNull()
  })
  it('in-process store: ten answers sent at once — exactly one is free', async () => {
    await issueClarifyCredit(ME, SENT, T0)
    const r = await Promise.all(Array.from({ length: 10 }, () => takeClarifyCredit(ME, SENT, 'Hải Phòng', T0 + 1000)))
    expect(r.filter(x => x.free)).toHaveLength(1)
    expect(r.filter(x => !x.free && x.reason === 'already_used')).toHaveLength(9)
  })
})

// The production path: the shared store (Upstash). A fake store with Redis semantics — each script runs whole (Lua is atomic), after a
// random network delay, so concurrent requests interleave everywhere EXCEPT inside one script. This proves the CODE asks the store for an
// atomic one-shot (limit 1 in one script); it does not prove Upstash itself — that needs a separate test Redis (owner: never production).
describe('shared store (Upstash shape, fake Redis): atomic one-shot, replay, expiry, outage', () => {
  const sets = new Map<string, Array<{ ts: number; m: string }>>()
  let down = false
  const jitter = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 5)))
  const live = (k: string, now: number, w: number) => (sets.get(k) ?? []).filter(e => e.ts > now - w)
  const fake: RateLimitStore = {
    async evalSlidingWindow(key, nowMs, windowMs, limit, member) {
      await jitter()
      if (down) throw new Error('store unreachable')
      // ── one script: nothing below awaits ──
      const cur = live(key, nowMs, windowMs)
      if (cur.length >= limit) { sets.set(key, cur); return [0, cur[0]?.ts ?? 0] }
      cur.push({ ts: nowMs, m: member }); sets.set(key, cur)
      return [1, cur[0].ts]
    },
    async countInWindow(key, nowMs, windowMs) {
      await jitter()
      if (down) throw new Error('store unreachable')
      return live(key, nowMs, windowMs).length
    },
  }
  beforeEach(() => {
    sets.clear(); down = false
    process.env.KV_REST_API_URL = 'https://fake-redis.test'
    process.env.KV_REST_API_TOKEN = 'test-only-token'
    __setRateLimitStore(fake)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
    __resetRateLimitStore()
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  })

  it('twenty answers sent at once: exactly one is free, the others are charged (already_used)', async () => {
    expect(await issueClarifyCredit(ME, SENT)).toBeTruthy()
    const r = await Promise.all(Array.from({ length: 20 }, () => takeClarifyCredit(ME, SENT, 'Hải Phòng')))
    expect(r.filter(x => x.free)).toHaveLength(1)
    expect(r.filter(x => !x.free && x.reason === 'already_used')).toHaveLength(19)
  })
  it('replay: the same request sent again later is charged; a different short answer to the same question is charged too', async () => {
    await issueClarifyCredit(ME, SENT)
    expect(await takeClarifyCredit(ME, SENT, 'Hải Phòng')).toMatchObject({ free: true })
    vi.setSystemTime(T0 + 60_000)
    expect(await takeClarifyCredit(ME, SENT, 'Hải Phòng')).toEqual({ free: false, reason: 'already_used' })
    expect(await takeClarifyCredit(ME, SENT, 'Hà Nội')).toEqual({ free: false, reason: 'already_used' })
  })
  it('expired: 30 minutes after the question it is charged (the store window, not the client)', async () => {
    await issueClarifyCredit(ME, SENT)
    vi.setSystemTime(T0 + CLARIFY_TTL_MS + 1)
    expect(await takeClarifyCredit(ME, SENT, 'Hà Nội')).toEqual({ free: false, reason: 'expired_or_unknown' })
  })
  it('a credit belongs to the identity it was issued to; a forged question is unknown', async () => {
    await issueClarifyCredit(ME, SENT)
    expect(await takeClarifyCredit(OTHER_USER, SENT, 'Hà Nội')).toEqual({ free: false, reason: 'expired_or_unknown' })
    expect(await takeClarifyCredit(ME, 'Bạn muốn hỏi gì tiếp?\n1. Giá vàng\n2. Tỷ giá', 'Giá vàng')).toEqual({ free: false, reason: 'expired_or_unknown' })
  })
  it('peek (owner 18/10, "ok"): true only for an issued, unexpired, unused credit and a direct answer — and it never consumes it', async () => {
    expect(await peekClarifyCredit(ME, SENT, 'ok')).toBe(false) // not issued
    await issueClarifyCredit(ME, SENT)
    expect(await peekClarifyCredit(ME, SENT, 'ok')).toBe(true)
    expect(await peekClarifyCredit(ME, SENT, 'ok')).toBe(true) // peeking twice takes nothing
    expect(await peekClarifyCredit(OTHER_USER, SENT, 'ok')).toBe(false) // another identity
    expect(await peekClarifyCredit(ME, SENT, 'ok, mà cho hỏi giá vàng hôm nay luôn')).toBe(false) // a new request mixed in
    expect(await takeClarifyCredit(ME, SENT, 'ok')).toMatchObject({ free: true }) // the take still works after the peeks
    expect(await peekClarifyCredit(ME, SENT, 'ok')).toBe(false) // used
    vi.setSystemTime(T0 + CLARIFY_TTL_MS + 1)
    await issueClarifyCredit(ME, `${SENT}\n`, T0) // (a stale issue)
    expect(await peekClarifyCredit(ME, `Khác.\n\n**Bạn đi mấy người?**`, 'ok')).toBe(false)
  })
  it('peek with the store down: false (the free canned reply stays; nothing is charged, nothing is taken)', async () => {
    await issueClarifyCredit(ME, SENT)
    down = true
    expect(await peekClarifyCredit(ME, SENT, 'ok')).toBe(false)
    down = false
    expect(await peekClarifyCredit(ME, SENT, 'ok')).toBe(true)
  })
  it('store outage: nothing is issued, nothing is free (fail closed — the turn is charged as usual)', async () => {
    await issueClarifyCredit(ME, SENT)
    down = true
    expect((await takeClarifyCredit(ME, SENT, 'Hà Nội')).free).toBe(false)
    expect(await issueClarifyCredit(ME, SENT)).toBeNull()
    down = false
    // the outage did not burn the credit: once the store is back, the answer is free
    expect(await takeClarifyCredit(ME, SENT, 'Hà Nội')).toMatchObject({ free: true })
  })
})
