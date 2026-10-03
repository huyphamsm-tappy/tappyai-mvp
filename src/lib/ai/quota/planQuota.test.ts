import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetAiQuestionQuotaLocal, accountQuotaFor, aiQuotaIdentity, consumeAiQuestion, peekAiQuestionQuota, quotaFor,
} from './aiQuestionQuota'
import { entitlementFromRow } from '@/lib/plans/entitlement'
import { PAID_PLAN_IDS } from '@/lib/plans/planConfig'

// P7 — ONE quota, plan-aware: guest 5 for life · free 15/day · every paid plan 30/day · daily reset at the
// Vietnam midnight · legacy Pro exempt only while SUBSCRIPTIONS_ENABLED is off (or inside the grandfather window).
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
  it('a guest has 5 questions for life: the 6th is refused, and a later day does not bring them back', async () => {
    const id = aiQuotaIdentity(null, IP)
    expect(quotaFor(id)).toEqual({ limit: 5, period: 'lifetime' })
    const r = await spendAll(id, 6)
    expect(r.map((x) => x.ok)).toEqual([true, true, true, true, true, false])
    vi.useFakeTimers({ now: Date.now() + 3 * 86_400_000 })
    expect((await consumeAiQuestion(id)).ok).toBe(false)
  })

  it('a free account has 15 a day', async () => {
    const id = aiQuotaIdentity(USER, IP)
    expect(quotaFor(id)).toEqual({ limit: 15, period: 'day' })
    const r = await spendAll(id, 16)
    expect(r.filter((x) => x.ok)).toHaveLength(15)
    expect(r[15].ok).toBe(false)
  })

  it.each([...PAID_PLAN_IDS])('plan %s: 30 questions a day, the 31st is refused', async (plan) => {
    const id = aiQuotaIdentity(USER, IP, plan)
    expect(quotaFor(id)).toEqual({ limit: 30, period: 'day' })
    const r = await spendAll(id, 31)
    expect(r.filter((x) => x.ok)).toHaveLength(30)
    expect(r[30].ok).toBe(false)
  })

  it('an anonymous session is lifetime 5, whatever plan is passed', () => {
    expect(quotaFor(aiQuotaIdentity({ id: 'a', is_anonymous: true }, IP, 'sunny'))).toEqual({ limit: 5, period: 'lifetime' })
  })
})

describe('daily reset (Vietnam midnight)', () => {
  it('a spent paid day starts again at 30 after 00:00 +07, not before', async () => {
    const id = aiQuotaIdentity(USER, IP, 'momo')
    vi.useFakeTimers({ now: new Date('2026-10-05T16:30:00Z') }) // 23:30 in Hanoi
    await spendAll(id, 30)
    expect((await consumeAiQuestion(id)).ok).toBe(false)
    vi.setSystemTime(new Date('2026-10-05T16:59:00Z')) // 23:59 — same day
    expect((await consumeAiQuestion(id)).ok).toBe(false)
    vi.setSystemTime(new Date('2026-10-05T17:01:00Z')) // 00:01 next day
    const next = await consumeAiQuestion(id)
    expect(next.ok).toBe(true)
    expect(next.remaining).toBe(29)
  })
})

describe('consumption is visible and refundable', () => {
  it('peek reports used/remaining without spending', async () => {
    const id = aiQuotaIdentity(USER, IP, 'coco')
    await spendAll(id, 4)
    expect(await peekAiQuestionQuota(id)).toMatchObject({ limit: 30, used: 4, remaining: 26, period: 'day' })
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
    await spendAll(aiQuotaIdentity(USER, IP), 15)
    expect((await consumeAiQuestion(aiQuotaIdentity(USER, IP))).ok).toBe(false)
    // paying mid-day lifts the limit to 30 on the SAME day bucket: 15 used, 15 left
    const paid = await consumeAiQuestion(aiQuotaIdentity(USER, IP, 'pip'))
    expect(paid.ok).toBe(true)
    expect(paid.used).toBe(16)
    expect(paid.remaining).toBe(14)
  })
})

describe('entitlement → quota mapping (the one rule)', () => {
  it.each([...PAID_PLAN_IDS])('an active %s plan is a paid, non-exempt 30/day account', (plan) => {
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
  it('after PRO_GRANDFATHER_CUTOFF a legacy Pro is an ordinary 30/day account', () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '1')
    vi.stubEnv('PRO_GRANDFATHER_CUTOFF', '2020-01-01')
    expect(accountQuotaFor(row('pro'))).toEqual({ exempt: false, plan: 'pro' })
    expect(quotaFor(aiQuotaIdentity(USER, IP, 'pro')).limit).toBe(30)
  })
  it('an expired legacy Pro is never exempt', () => {
    vi.stubEnv('SUBSCRIPTIONS_ENABLED', '')
    expect(accountQuotaFor(row('pro', 'active', past())).exempt).toBe(false)
  })
})
