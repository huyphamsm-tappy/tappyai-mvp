import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetAiQuestionQuotaLocal, accountQuotaFor, aiQuotaIdentity, consumeAiQuestion, peekAiQuestionQuota, quotaFor,
} from './aiQuestionQuota'
import { entitlementFromRow } from '@/lib/plans/entitlement'
import { PAID_PLAN_IDS } from '@/lib/plans/planConfig'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT, PAID_DAILY_CEILING } from '@/lib/config/product'

// P7 — ONE quota, plan-aware: guest 10 for life · free 300/day · every paid plan 1000/day (hidden anti-abuse
// ceilings; accounts show no limit) · daily reset at the Vietnam midnight · legacy Pro exempt only while
// SUBSCRIPTIONS_ENABLED is off (or inside the grandfather window).
// No store is configured here, so this exercises the in-process path with the same semantics as the store.

const IP = '203.0.113.7'
const USER = { id: 'u-1', is_anonymous: false }
const future = () => new Date(Date.now() + 10 * 86_400_000).toISOString()
const past = () => new Date(Date.now() - 86_400_000).toISOString()
const row = (plan: string, status = 'active', end = future()) => entitlementFromRow({ plan, status, current_period_end: end, source: plan === 'pro' ? 'web' : 'web_sepay' })

async function spendAll(identity: ReturnType<typeof aiQuotaIdentity>, n: number) {
  const out = []
  for (let i = 0; i < n; i++) out.push(await consumeAiQuestion(identity))
  return out
}

beforeEach(() => { __resetAiQuestionQuotaLocal(); vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('limits by identity', () => {
  it(`a guest has ${ANON_LIFETIME_LIMIT} questions for life: the ${ANON_LIFETIME_LIMIT + 1}th is refused, and a later day does not bring them back`, async () => {
    const id = aiQuotaIdentity(null, IP)
    // owner 01/11/2026: 5 -> 10 (accounts have no visible limit; hidden anti-abuse ceiling)
    expect(ANON_LIFETIME_LIMIT).toBe(10)
    expect(quotaFor(id)).toEqual({ limit: ANON_LIFETIME_LIMIT, period: 'lifetime' })
    const r = await spendAll(id, ANON_LIFETIME_LIMIT + 1)
    expect(r.map((x) => x.ok)).toEqual([...Array(ANON_LIFETIME_LIMIT).fill(true), false])
    vi.useFakeTimers({ now: Date.now() + 3 * 86_400_000 })
    expect((await consumeAiQuestion(id)).ok).toBe(false)
  })

  it(`a free account has a hidden ceiling of ${FREE_DAILY_LIMIT} a day`, async () => {
    const id = aiQuotaIdentity(USER, IP)
    expect(FREE_DAILY_LIMIT).toBe(300)
    expect(quotaFor(id)).toEqual({ limit: FREE_DAILY_LIMIT, period: 'day' })
    const r = await spendAll(id, FREE_DAILY_LIMIT + 6)
    expect(r.filter((x) => x.ok)).toHaveLength(FREE_DAILY_LIMIT)
    expect(r[FREE_DAILY_LIMIT].ok).toBe(false)
  })

  it.each([...PAID_PLAN_IDS])(`plan %s: hidden ceiling of ${PAID_DAILY_CEILING} questions a day, the ${PAID_DAILY_CEILING + 1}th is refused`, async (plan) => {
    const id = aiQuotaIdentity(USER, IP, plan)
    expect(PAID_DAILY_CEILING).toBe(1000)
    expect(quotaFor(id)).toEqual({ limit: PAID_DAILY_CEILING, period: 'day' })
    const r = await spendAll(id, PAID_DAILY_CEILING + 1)
    expect(r.filter((x) => x.ok)).toHaveLength(PAID_DAILY_CEILING)
    expect(r[PAID_DAILY_CEILING].ok).toBe(false)
  })

  it(`an anonymous session is lifetime ${ANON_LIFETIME_LIMIT}, whatever plan is passed`, () => {
    expect(quotaFor(aiQuotaIdentity({ id: 'a', is_anonymous: true }, IP, 'sunny'))).toEqual({ limit: ANON_LIFETIME_LIMIT, period: 'lifetime' })
  })
})

describe('daily reset (Vietnam midnight)', () => {
  it(`a spent paid day starts again at ${PAID_DAILY_CEILING} after 00:00 +07, not before`, async () => {
    const id = aiQuotaIdentity(USER, IP, 'momo')
    vi.useFakeTimers({ now: new Date('2026-10-05T16:30:00Z') }) // 23:30 in Hanoi
    await spendAll(id, PAID_DAILY_CEILING)
    expect((await consumeAiQuestion(id)).ok).toBe(false)
    vi.setSystemTime(new Date('2026-10-05T16:59:00Z')) // 23:59 — same day
    expect((await consumeAiQuestion(id)).ok).toBe(false)
    vi.setSystemTime(new Date('2026-10-05T17:01:00Z')) // 00:01 next day
    const next = await consumeAiQuestion(id)
    expect(next.ok).toBe(true)
    expect(next.remaining).toBe(PAID_DAILY_CEILING - 1)
  })
})

describe('consumption is visible and refundable', () => {
  it('peek reports used/remaining without spending', async () => {
    const id = aiQuotaIdentity(USER, IP, 'coco')
    await spendAll(id, 4)
    expect(await peekAiQuestionQuota(id)).toMatchObject({ limit: PAID_DAILY_CEILING, used: 4, remaining: PAID_DAILY_CEILING - 4, period: 'day' })
    expect(await peekAiQuestionQuota(id)).toMatchObject({ used: 4 })
  })

  it('a refund handed back after a failed model call frees exactly one unit', async () => {
    const id = aiQuotaIdentity(USER, IP)
    const [first] = await spendAll(id, 1)
    const { refundAiQuestion } = await import('./aiQuestionQuota')
    await refundAiQuestion(first.refund)
    await refundAiQuestion(first.refund)
    expect(await peekAiQuestionQuota(id)).toMatchObject({ used: 0 })
  })

  it('two plans never share a bucket by accident: the same account moving from free to paid keeps its spent count', async () => {
    await spendAll(aiQuotaIdentity(USER, IP), FREE_DAILY_LIMIT)
    expect((await consumeAiQuestion(aiQuotaIdentity(USER, IP))).ok).toBe(false)
    // paying mid-day lifts the limit to the paid ceiling on the SAME day bucket: FREE used, the rest left
    const paid = await consumeAiQuestion(aiQuotaIdentity(USER, IP, 'pip'))
    expect(paid.ok).toBe(true)
    expect(paid.used).toBe(FREE_DAILY_LIMIT + 1)
    expect(paid.remaining).toBe(PAID_DAILY_CEILING - FREE_DAILY_LIMIT - 1)
  })
})

describe('entitlement → quota mapping (the one rule)', () => {
  it.each([...PAID_PLAN_IDS])(`an active %s plan is a paid, non-exempt ${PAID_DAILY_CEILING}/day account`, (plan) => {
    expect(accountQuotaFor(row(plan))).toEqual({ exempt: false, plan })
  })
  it('an expired, cancelled or missing plan is the free allowance', () => {
    expect(accountQuotaFor(row('momo', 'active', past()))).toEqual({ exempt: false, plan: 'free' })
    expect(accountQuotaFor(row('momo', 'canceled'))).toEqual({ exempt: false, plan: 'free' })
    expect(accountQuotaFor(entitlementFromRow(null))).toEqual({ exempt: false, plan: 'free' })
  })
  it('a paying legacy Pro stays unmetered until its paid period ends (flag OFF, or ON inside the grandfather window)', () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    expect(accountQuotaFor(row('pro')).exempt).toBe(true)
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
    vi.stubEnv('PRO_GRANDFATHER_CUTOFF', '')
    expect(accountQuotaFor(row('pro')).exempt).toBe(true)
  })
  it(`after PRO_GRANDFATHER_CUTOFF a legacy Pro is an ordinary ${PAID_DAILY_CEILING}/day account`, () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
    vi.stubEnv('PRO_GRANDFATHER_CUTOFF', '2020-01-01')
    expect(accountQuotaFor(row('pro'))).toEqual({ exempt: false, plan: 'pro' })
    expect(quotaFor(aiQuotaIdentity(USER, IP, 'pro')).limit).toBe(PAID_DAILY_CEILING)
  })
  it('an expired legacy Pro is never exempt', () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    expect(accountQuotaFor(row('pro', 'active', past())).exempt).toBe(false)
  })
})
