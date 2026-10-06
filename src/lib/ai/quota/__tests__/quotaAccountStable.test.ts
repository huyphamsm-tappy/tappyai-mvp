import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { __setRateLimitStore, __resetRateLimitStore, type RateLimitStore } from '@/lib/security/distributedRateLimit'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT } from '@/lib/config/product'
import { PLAN_CONFIG } from '@/lib/plans/planConfig'
import {
  accountQuotaFor, aiQuotaIdentity, consumeAiQuestion, peekAiQuestionQuota, __resetAiQuestionQuotaLocal,
} from '../aiQuestionQuota'

// BUG 3 — the authenticated quota is keyed on the stable account user id, never on the browser session,
// the anonymous session minted at logout, the device or the login count.

/** Faithful fake of the shared store's atomic sorted-set script (single-threaded like Redis). */
function fakeStore(): RateLimitStore {
  const sets = new Map<string, Map<string, number>>()
  const prune = (k: string, now: number, w: number) => {
    const s = sets.get(k) ?? new Map<string, number>()
    for (const [m, t] of s) if (t <= now - w) s.delete(m)
    sets.set(k, s)
    return s
  }
  return {
    async evalSlidingWindow(k, now, w, limit, member) {
      await Promise.resolve()
      const s = prune(k, now, w)
      if (s.size >= limit) return [0, Math.min(...s.values())]
      s.set(member, now)
      return [1, 0]
    },
    async countInWindow(k, now, w) { return prune(k, now, w).size },
    async releaseSlidingWindow(k, m) { sets.get(k)?.delete(m) },
  }
}

const ACCOUNT = { id: 'acct-111', is_anonymous: false }
const OTHER = { id: 'acct-222', is_anonymous: false }
const spend = (u: { id: string; is_anonymous?: boolean } | null, ip = '203.0.113.9') => consumeAiQuestion(aiQuotaIdentity(u as never, ip))
const peek = (u: { id: string; is_anonymous?: boolean } | null, ip = '203.0.113.9') => peekAiQuestionQuota(aiQuotaIdentity(u as never, ip))

for (const backend of ['in-process fallback', 'shared store'] as const) {
  describe(`[${backend}] authenticated quota is account-keyed`, () => {
    beforeEach(() => {
      __resetRateLimitStore(); __resetAiQuestionQuotaLocal()
      if (backend === 'shared store') __setRateLimitStore(fakeStore())
    })
    afterEach(() => { __resetRateLimitStore(); vi.unstubAllEnvs() })

    it('A. 10/10 -> logout (new anonymous session) -> login again -> still 0 left', async () => {
      for (let i = 0; i < FREE_DAILY_LIMIT; i++) expect((await spend(ACCOUNT)).ok).toBe(true)
      // logout: the browser now holds a brand-new anonymous Supabase session with its own id
      const anonAfterLogout = { id: 'anon-after-logout', is_anonymous: true }
      expect((await peek(anonAfterLogout)).limit).toBe(ANON_LIFETIME_LIMIT) // guest tier, NOT the account's pool
      // login again with the same email -> same stable user id
      const relogin = { id: ACCOUNT.id, is_anonymous: false }
      expect(await peek(relogin)).toMatchObject({ used: FREE_DAILY_LIMIT, remaining: 0, period: 'day' })
      expect((await spend(relogin)).ok).toBe(false)
    })

    it('B. same account from another browser / session / IP -> same quota', async () => {
      await spend(ACCOUNT, '198.51.100.1'); await spend(ACCOUNT, '198.51.100.1')
      await spend(ACCOUNT, '192.0.2.77')
      expect((await peek(ACCOUNT, '203.0.113.200')).used).toBe(3)
    })

    it('C. a different account is independent', async () => {
      for (let i = 0; i < FREE_DAILY_LIMIT; i++) await spend(ACCOUNT)
      expect((await spend(ACCOUNT)).ok).toBe(false)
      expect((await spend(OTHER)).ok).toBe(true)
      expect((await peek(OTHER)).used).toBe(1)
    })

    it('D. guest flow unchanged: lifetime, per identity, never merged into the account pool', async () => {
      const anonSess = { id: 'anon-1', is_anonymous: true }
      for (let i = 0; i < ANON_LIFETIME_LIMIT; i++) expect((await spend(anonSess)).ok).toBe(true)
      expect((await spend(anonSess)).ok).toBe(false)
      // the guest's spends did not touch the account, and the account's do not touch the guest
      expect((await peek(ACCOUNT)).used).toBe(0)
      await spend(ACCOUNT)
      expect((await peek(anonSess)).used).toBe(ANON_LIFETIME_LIMIT)
      // identity-less guest is keyed by IP
      expect((await spend(null, '192.0.2.5')).ok).toBe(true)
      expect(aiQuotaIdentity(null, '192.0.2.5')).toEqual({ kind: 'guest', id: '192.0.2.5' })
    })

    it('E. a paid plan is metered at its own package limit, still on the account id', async () => {
      const plan = 'pip' as const
      const limit = PLAN_CONFIG[plan].aiQuota.limit
      const id = aiQuotaIdentity(ACCOUNT as never, '1.1.1.1', plan)
      expect(id).toEqual({ kind: 'user', id: ACCOUNT.id, plan })
      for (let i = 0; i < limit; i++) expect((await consumeAiQuestion(id)).ok).toBe(true)
      expect((await consumeAiQuestion(id)).ok).toBe(false)
      // logout/login does not refill the paid pool either
      expect((await consumeAiQuestion(aiQuotaIdentity(ACCOUNT as never, '9.9.9.9', plan))).ok).toBe(false)
    })

    it('concurrency: 25 parallel requests for one free account admit exactly 10', async () => {
      const results = await Promise.all(Array.from({ length: 25 }, () => spend(ACCOUNT)))
      expect(results.filter(r => r.ok)).toHaveLength(FREE_DAILY_LIMIT)
      expect((await peek(ACCOUNT)).used).toBe(FREE_DAILY_LIMIT)
    })
  })
}

describe('entitlement decision is untouched', () => {
  it('free stays metered; a paid plan keeps its own limit', () => {
    expect(accountQuotaFor({ paid: false } as never)).toEqual({ exempt: false, plan: 'free' })
  })
})

describe('in-process counter survives a duplicated module copy', () => {
  it('a second evaluation of the module sees the first one\'s spends', async () => {
    __resetRateLimitStore(); __resetAiQuestionQuotaLocal()
    await spend(ACCOUNT); await spend(ACCOUNT)
    vi.resetModules()
    const copy = await import('../aiQuestionQuota')
    expect((await copy.peekAiQuestionQuota(copy.aiQuotaIdentity(ACCOUNT as never, '1.1.1.1'))).used).toBe(2)
  })
})
