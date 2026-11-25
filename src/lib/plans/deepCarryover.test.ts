// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { __resetAiQuestionQuotaLocal, consumeDeepResearch, peekDeepResearch, grantDeepResearchCarryover, nextVnMonth } from '@/lib/ai/quota/aiQuestionQuota'
import { reportsLeftBeforePurchase, carryOverAfterPurchase } from './deepCarryover'

// Owner 21/11/2026: buying a new plan must not cost the person what they had left. Days stack in the database; the reports left THIS month are added once to NEXT month's allowance.

const U = 'user-carry-1'
const NOW = new Date('2026-11-21T03:00:00Z')            // 21 Nov, Vietnam
const NEXT_MONTH = new Date('2026-12-02T03:00:00Z')

const dbWith = (row: Record<string, unknown> | null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) as never
const active = (plan: string) => dbWith({ plan, status: 'active', current_period_end: '2027-01-01T00:00:00Z', source: 'web_sepay' })

beforeEach(() => { __resetAiQuestionQuotaLocal(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

describe('the month after', () => {
  it('nextVnMonth rolls the year', () => {
    expect(nextVnMonth('2026-11-21')).toBe('2026-12')
    expect(nextVnMonth('2026-12-31')).toBe('2027-01')
  })
})

describe('reportsLeftBeforePurchase', () => {
  it('a Coco account that used 10 of 15 has 5 left', async () => {
    for (let i = 0; i < 10; i++) await consumeDeepResearch(U, 15)
    expect(await reportsLeftBeforePurchase(active('momo'), U)).toBe(5)
  })
  it('no active paid plan (Free, expired, unreadable) carries nothing', async () => {
    expect(await reportsLeftBeforePurchase(dbWith(null), U)).toBe(0)
    expect(await reportsLeftBeforePurchase(dbWith({ plan: 'momo', status: 'expired', current_period_end: '2026-01-01T00:00:00Z' }), U)).toBe(0)
    expect(await reportsLeftBeforePurchase({ from: () => { throw new Error('x') } } as never, U)).toBe(0)
  })
})

describe('the carry-over', () => {
  it('5 left under the old plan: they do NOT change this month, and they are added to the new plan next month, once', async () => {
    for (let i = 0; i < 10; i++) await consumeDeepResearch(U, 15)
    const carried = await carryOverAfterPurchase(U, 5, 'paid')
    expect(carried).toBe(5)
    expect(await peekDeepResearch(U, 30)).toMatchObject({ limit: 30, used: 10, remaining: 20 })        // this month: the new plan's own 30, minus what was used
    vi.setSystemTime(NEXT_MONTH)
    expect(await peekDeepResearch(U, 30)).toMatchObject({ limit: 35, used: 0, remaining: 35 })         // next month: 30 + the 5 carried
    for (let i = 0; i < 35; i++) expect((await consumeDeepResearch(U, 30)).ok).toBe(true)
    expect((await consumeDeepResearch(U, 30)).ok).toBe(false)
    vi.setSystemTime(new Date('2027-01-05T03:00:00Z'))
    expect(await peekDeepResearch(U, 30)).toMatchObject({ limit: 30 })                                  // the month after that: no more bonus
  })
  it('a replayed webhook (duplicate) or a partial payment carries nothing; nothing left carries nothing', async () => {
    expect(await carryOverAfterPurchase(U, 5, 'duplicate')).toBe(0)
    expect(await carryOverAfterPurchase(U, 5, 'mismatch')).toBe(0)
    expect(await carryOverAfterPurchase(U, 0, 'paid')).toBe(0)
    vi.setSystemTime(NEXT_MONTH)
    expect(await peekDeepResearch(U, 30)).toMatchObject({ limit: 30 })
  })
  it('a Free plan has no reports, so a carried bonus gives nothing there', async () => {
    await grantDeepResearchCarryover(U, 5)
    vi.setSystemTime(NEXT_MONTH)
    expect(await peekDeepResearch(U, 0)).toEqual({ limit: 0, used: 0, remaining: 0 })
  })
  it('the carry is capped (a bad number cannot mint a large allowance)', async () => {
    expect(await grantDeepResearchCarryover(U, 100000)).toBeLessThanOrEqual(60)
  })
})
