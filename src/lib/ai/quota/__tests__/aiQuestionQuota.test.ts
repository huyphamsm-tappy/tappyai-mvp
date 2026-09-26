import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { __setRateLimitStore, __resetRateLimitStore, type RateLimitStore } from '@/lib/security/distributedRateLimit'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT } from '@/lib/config/product'
import {
  aiQuotaIdentity, consumeAiQuestion, peekAiQuestionQuota, quotaFor, refundAiQuestion, __resetAiQuestionQuotaLocal,
  type AiQuotaIdentity,
} from '../aiQuestionQuota'

// ── The ONE AI question quota — the contract, pinned ─────────────────────────
//
// Anonymous: 5 for the LIFETIME of the identity. Registered: 15 per VN day. One pool for every
// AI feature. Enforced by the server against a verified identity; nothing the client sends can
// change it. Both limiter backends are exercised: the in-process fallback (no store configured)
// and a faithful fake of the shared store's atomic sorted-set script.

/** A fake that reproduces the Lua script: per-key sorted set, expire-then-count, admit-and-add atomically. */
function fakeStore(): RateLimitStore & { fail(mode: 'throw' | null): void; keys(): string[] } {
  const sets = new Map<string, Map<string, number>>()
  let failure: 'throw' | null = null
  const prune = (key: string, now: number, window: number) => {
    const set = sets.get(key) ?? new Map<string, number>()
    for (const [m, t] of set) if (t <= now - window) set.delete(m)
    sets.set(key, set)
    return set
  }
  return {
    fail(mode) { failure = mode },
    keys() { return [...sets.keys()] },
    async evalSlidingWindow(key, now, window, limit, member) {
      if (failure === 'throw') throw new Error('store unreachable')
      const set = prune(key, now, window)
      if (set.size >= limit) return [0, Math.min(...set.values())]
      set.set(member, now)
      return [1, 0]
    },
    async countInWindow(key, now, window) {
      if (failure === 'throw') throw new Error('store unreachable')
      return prune(key, now, window).size
    },
    async releaseSlidingWindow(key, member) {
      if (failure === 'throw') throw new Error('store unreachable')
      sets.get(key)?.delete(member)
    },
  }
}

const anon = (id = 'anon-1'): AiQuotaIdentity => ({ kind: 'anon', id })
const user = (id = 'user-1'): AiQuotaIdentity => ({ kind: 'user', id })
const guest = (ip = '203.0.113.9'): AiQuotaIdentity => ({ kind: 'guest', id: ip })

async function spendN(identity: AiQuotaIdentity, n: number) {
  const results = []
  for (let i = 0; i < n; i++) results.push(await consumeAiQuestion(identity))
  return results
}

/** Runs every case against both backends. */
function contractSuite(label: string, setup: () => { store: ReturnType<typeof fakeStore> | null }) {
  describe(`[${label}]`, () => {
    let store: ReturnType<typeof fakeStore> | null
    beforeEach(() => {
      __resetRateLimitStore()
      __resetAiQuestionQuotaLocal()
      vi.unstubAllEnvs()
      vi.useRealTimers()
      store = setup().store
    })
    afterEach(() => { __resetRateLimitStore(); vi.unstubAllEnvs(); vi.useRealTimers() })

    describe('anonymous — five, for the lifetime of the identity', () => {
      it('1. starts with 5', async () => {
        const q = await peekAiQuestionQuota(anon())
        expect(q).toMatchObject({ limit: ANON_LIFETIME_LIMIT, period: 'lifetime', used: 0, remaining: 5 })
        expect(quotaFor(anon())).toEqual({ limit: 5, period: 'lifetime' })
      })
      it('2. one question → 4 remaining', async () => {
        const r = await consumeAiQuestion(anon())
        expect(r).toMatchObject({ ok: true, used: 1, remaining: 4, period: 'lifetime' })
        expect((await peekAiQuestionQuota(anon())).remaining).toBe(4)
      })
      it('3. questions from different Tappy areas draw down ONE counter (the identity, not the feature)', async () => {
        // Travel, Food, Entertainment, Spa, Scam Alerts — the module has no notion of a feature;
        // five spends from five call sites are five spends.
        for (const _area of ['travel', 'food', 'entertainment', 'spa', 'scam-alerts']) await consumeAiQuestion(anon())
        expect((await peekAiQuestionQuota(anon())).remaining).toBe(0)
      })
      it('4. all five → 0; 7. the sixth is refused and spends nothing', async () => {
        const five = await spendN(anon(), 5)
        expect(five.every(r => r.ok)).toBe(true)
        expect(five[4].remaining).toBe(0)
        const sixth = await consumeAiQuestion(anon())
        expect(sixth.ok).toBe(false)
        expect(sixth.remaining).toBe(0)
        expect((await peekAiQuestionQuota(anon())).used).toBe(5)
      })
      it('5. returning tomorrow (and next month) → still 0', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-15T10:00:00+07:00'))
        await spendN(anon(), 5)
        vi.setSystemTime(new Date('2026-09-16T10:00:00+07:00'))
        expect((await consumeAiQuestion(anon())).ok).toBe(false)
        vi.setSystemTime(new Date('2026-10-20T10:00:00+07:00'))
        expect((await consumeAiQuestion(anon())).ok).toBe(false)
        expect((await peekAiQuestionQuota(anon())).remaining).toBe(0)
      })
      it('6. a reload / browser restart cannot restore it — the counter is server-side, keyed by identity', async () => {
        await spendN(anon(), 5)
        // "Restart": nothing the client holds is consulted; the same verified identity meets the same counter.
        expect((await consumeAiQuestion(anon('anon-1'))).ok).toBe(false)
        // A DIFFERENT identity is a different trial — that is what makes the identity, not the browser, the unit.
        expect((await consumeAiQuestion(anon('anon-2'))).ok).toBe(true)
      })
      it('an identity-less guest is metered the same way, keyed by IP', async () => {
        expect(quotaFor(guest())).toEqual({ limit: 5, period: 'lifetime' })
        await spendN(guest(), 5)
        expect((await consumeAiQuestion(guest())).ok).toBe(false)
        expect((await consumeAiQuestion(guest('203.0.113.10'))).ok).toBe(true)
      })
    })

    describe('registered — fifteen per VN day, one pool', () => {
      it('8. starts with 15/day', async () => {
        expect(await peekAiQuestionQuota(user())).toMatchObject({ limit: FREE_DAILY_LIMIT, period: 'day', used: 0, remaining: 15 })
      })
      it('9./10. usage in any area — chat or a Scam Alerts analysis — reduces the same pool', async () => {
        await spendN(user(), 3)          // general
        await spendN(user(), 2)          // travel
        await spendN(user(), 2)          // food
        await spendN(user(), 1)          // entertainment
        await spendN(user(), 1)          // spa
        await spendN(user(), 2)          // scam alerts message analysis
        expect(await peekAiQuestionQuota(user())).toMatchObject({ used: 11, remaining: 4 })
      })
      it('11. the 16th question that day is refused', async () => {
        const all = await spendN(user(), 15)
        expect(all.every(r => r.ok)).toBe(true)
        expect((await consumeAiQuestion(user())).ok).toBe(false)
      })
      it('12. the next VN day resets to 15 — at 00:00 Asia/Ho_Chi_Minh, not at UTC midnight', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-15T23:30:00+07:00'))
        await spendN(user(), 15)
        expect((await consumeAiQuestion(user())).ok).toBe(false)
        vi.setSystemTime(new Date('2026-09-16T00:05:00+07:00'))   // 17:05 UTC on the 15th
        expect(await peekAiQuestionQuota(user())).toMatchObject({ used: 0, remaining: 15 })
        expect((await consumeAiQuestion(user())).ok).toBe(true)
      })
      it('two accounts never share a pool', async () => {
        await spendN(user('a'), 15)
        expect((await consumeAiQuestion(user('b'))).ok).toBe(true)
      })
    })

    describe('security', () => {
      it('19. the identity comes from the verified session, never from the client', () => {
        expect(aiQuotaIdentity(null, '1.2.3.4')).toEqual({ kind: 'guest', id: '1.2.3.4' })
        expect(aiQuotaIdentity({ id: 'u', is_anonymous: false }, '1.2.3.4')).toEqual({ kind: 'user', id: 'u' })
        expect(aiQuotaIdentity({ id: 'a', is_anonymous: true }, '1.2.3.4')).toEqual({ kind: 'anon', id: 'a' })
        // There is no API that takes a count, a limit, a period or a "reset" from anyone.
        expect(typeof (consumeAiQuestion as unknown as { reset?: unknown }).reset).toBe('undefined')
      })
      it('20. concurrent requests cannot over-spend: 20 parallel spends admit exactly 15', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, () => consumeAiQuestion(user())))
        expect(results.filter(r => r.ok)).toHaveLength(15)
        expect(results.filter(r => !r.ok)).toHaveLength(5)
        expect((await peekAiQuestionQuota(user())).used).toBe(15)
      })
      it('20b. 8 parallel anonymous spends admit exactly 5', async () => {
        const results = await Promise.all(Array.from({ length: 8 }, () => consumeAiQuestion(anon())))
        expect(results.filter(r => r.ok)).toHaveLength(5)
      })
      it('peeking never spends', async () => {
        for (let i = 0; i < 10; i++) await peekAiQuestionQuota(anon())
        expect((await peekAiQuestionQuota(anon())).used).toBe(0)
      })
      describe('refund — a failed answer is not charged (F-015)', () => {
        it('refunding a spent question restores the count on both tiers', async () => {
          const before = (await peekAiQuestionQuota(user())).remaining
          const spend = await consumeAiQuestion(user())
          expect(spend.ok).toBe(true)
          expect(spend.refund).not.toBeNull()
          expect((await peekAiQuestionQuota(user())).remaining).toBe(before! - 1)
          await refundAiQuestion(spend.refund)
          expect((await peekAiQuestionQuota(user())).remaining).toBe(before)
        })
        it('a user at the daily limit who fails their last question can ask again after the refund', async () => {
          await spendN(user(), FREE_DAILY_LIMIT - 1)
          const last = await consumeAiQuestion(user())
          expect(last.ok).toBe(true)
          expect((await consumeAiQuestion(user())).ok).toBe(false) // genuinely at the limit
          await refundAiQuestion(last.refund) // the last answer failed
          expect((await peekAiQuestionQuota(user())).remaining).toBe(1)
          expect((await consumeAiQuestion(user())).ok).toBe(true)  // the refunded unit is spendable
        })
        it('an anonymous identity gets its lifetime unit back on failure', async () => {
          const spend = await consumeAiQuestion(anon())
          expect((await peekAiQuestionQuota(anon())).remaining).toBe(ANON_LIFETIME_LIMIT - 1)
          await refundAiQuestion(spend.refund)
          expect((await peekAiQuestionQuota(anon())).remaining).toBe(ANON_LIFETIME_LIMIT)
        })
        it('refund removes only the failed unit, not a concurrent one for the same identity', async () => {
          const a = await consumeAiQuestion(user())
          await consumeAiQuestion(user()) // a second, successful question
          expect((await peekAiQuestionQuota(user())).used).toBe(2)
          await refundAiQuestion(a.refund)
          expect((await peekAiQuestionQuota(user())).used).toBe(1) // the other spend is untouched
        })
        it('a refused question carries no refund handle, and refunding null is a no-op', async () => {
          await spendN(anon(), ANON_LIFETIME_LIMIT)
          const refused = await consumeAiQuestion(anon())
          expect(refused.ok).toBe(false)
          expect(refused.refund).toBeNull()
          await refundAiQuestion(refused.refund) // must not create a free unit
          expect((await peekAiQuestionQuota(anon())).remaining).toBe(0)
        })
        it('double refund does not give back two units', async () => {
          const spend = await consumeAiQuestion(user())
          await refundAiQuestion(spend.refund)
          await refundAiQuestion(spend.refund) // idempotent
          expect((await peekAiQuestionQuota(user())).used).toBe(0)
        })
      })

      if (label === 'shared store') {
        it('a configured store that does not answer FAILS CLOSED — an outage is not a free question', async () => {
          store!.fail('throw')
          const r = await consumeAiQuestion(user())
          expect(r.ok).toBe(false)
          expect(r.used).toBeNull()
          expect((await peekAiQuestionQuota(user())).used).toBeNull()
        })
        it('keys are per identity and, for the daily tier, per VN date', async () => {
          vi.useFakeTimers()
          vi.setSystemTime(new Date('2026-09-15T10:00:00+07:00'))
          await consumeAiQuestion(user('u1'))
          await consumeAiQuestion(anon('a1'))
          await consumeAiQuestion(guest('9.9.9.9'))
          // `local:` = the environment namespace the store boundary adds (1b-2; VERCEL_ENV unset here).
          expect(store!.keys().sort()).toEqual(['local:ai:q:a:a1', 'local:ai:q:g:9.9.9.9', 'local:ai:q:u:u1:2026-09-15'])
        })
      }
    })
  })
}

contractSuite('in-process fallback', () => ({ store: null }))
contractSuite('shared store', () => {
  vi.stubEnv('KV_REST_API_URL', 'https://kv.example')
  vi.stubEnv('KV_REST_API_TOKEN', 't')
  const store = fakeStore()
  __setRateLimitStore(store)
  return { store }
})
