// Owner 01/11/2026: plan tiers - Pip (Free) chats with Luna 6.0; MoMo (Trial) and Coco (Pro) have every mode; reports per month (owner 20/11/2026):
// ONE allowance: Pro (Coco, the Trial) 15, Promax (Tappy) 30, Free none. The ids stored in subscriptions stay as they are.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tierOf, modeForTier, DEEP_RESEARCH_MONTHLY, deepResearchMonthlyLimit } from './tiers'
import { consumeDeepResearch, peekDeepResearch, refundAiQuestion, __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

describe('tierOf', () => {
  it('free, guest and no plan are Free; promax plans Promax; every other paid plan Pro', () => {
    for (const p of ['free', 'guest', null, undefined, '']) expect(tierOf(p)).toBe('free')
    for (const p of ['pip', 'momo', 'coco', 'milo', 'sunny', 'pro']) expect(tierOf(p)).toBe('pro')
    for (const p of ['promax1m', 'promax3m']) expect(tierOf(p)).toBe('promax')
  })
})

describe('modeForTier', () => {
  it('Free runs Chat whatever it asks for; Pro and Promax run what they ask for', () => {
    for (const m of ['chat', 'web', 'think', 'deep'] as const) {
      expect(modeForTier(m, 'free')).toBe('chat')
      expect(modeForTier(m, 'pro')).toBe(m)
      expect(modeForTier(m, 'promax')).toBe(m)
    }
  })
  it('01/11 Auto: Free runs it as Chat; Pro and Promax run Auto', () => {
    expect(modeForTier('auto', 'free')).toBe('chat')
    expect(modeForTier('auto', 'pro')).toBe('auto')
    expect(modeForTier('auto', 'promax')).toBe('auto')
  })
  it('reports per month (owner 20/11/2026): ONE allowance: Pro 15, Promax 30, Free none', () => {
    expect(DEEP_RESEARCH_MONTHLY).toEqual({ free: 0, pro: 15, promax: 30 })
  })
})

describe('deepResearchMonthlyLimit (security audit 04/11, W-01: the meter does not depend on the plan flag)', () => {
  it('plans on sale: the tier\'s own allowance', () => {
    for (const tier of ['free', 'pro', 'promax'] as const) {
      expect(deepResearchMonthlyLimit(tier, { subscriptionsOn: true, signedIn: true })).toBe(DEEP_RESEARCH_MONTHLY[tier])
    }
  })
  it('plans off: a signed-in account is metered at the Coco allowance (never unlimited), Promax keeps its own', () => {
    expect(deepResearchMonthlyLimit('free', { subscriptionsOn: false, signedIn: true })).toBe(15)
    expect(deepResearchMonthlyLimit('pro', { subscriptionsOn: false, signedIn: true })).toBe(15)
    expect(deepResearchMonthlyLimit('promax', { subscriptionsOn: false, signedIn: true })).toBe(30)
  })
  it('plans off: a visitor gets none, so the turn runs as Chat', () => {
    for (const tier of ['free', 'pro', 'promax'] as const) expect(deepResearchMonthlyLimit(tier, { subscriptionsOn: false, signedIn: false })).toBe(0)
  })
  it('the chat route meters every signed-in run on the ONE allowance, turns a turn with none left into Thinking, and downgrades a visitor, with no plan-flag condition left on the meter', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
    expect(route).not.toContain('if (subscriptionsEnabled() && authedUserId) {\n      const limit')
    // 20/11/2026 (owner: one allowance, Coco 15 / Tappy 30, no kinds named to the person): the assertions that mattered are kept (signed-in only, no plan-flag condition, a visitor's turn runs as Chat)
    // and the meter is ONE counter; a turn with none left is peeked first and runs as Thinking
    expect(route).toContain('const limit = deepResearchMonthlyLimit(planTier')
    expect(route).toContain('const spent = await consumeDeepResearch(authedUserId, limit)')
    expect(route).toContain('(await peekDeepResearch(authedUserId, deepLimit)).remaining === 0')
    expect(route).not.toContain("'advanced')")
    expect(route).toContain("signedIn: !!authedUserId }) <= 0) {")
  })
})

describe('consumeDeepResearch (in-process store)', () => {
  beforeEach(() => __resetAiQuestionQuotaLocal())
  it('the month allowance is spent once per run; the next is refused; accounts never share it', async () => {
    for (let i = 0; i < 10; i++) expect((await consumeDeepResearch('u1', 10)).ok).toBe(true)
    const eleventh = await consumeDeepResearch('u1', 10)
    expect(eleventh).toMatchObject({ ok: false, remaining: 0, refund: null })
    expect((await consumeDeepResearch('u2', 10)).ok).toBe(true)
  })
  it('a failed run gives its unit back', async () => {
    for (let i = 0; i < 9; i++) await consumeDeepResearch('u1', 10)
    const tenth = await consumeDeepResearch('u1', 10)
    expect(tenth.ok).toBe(true)
    await refundAiQuestion(tenth.refund)
    expect((await consumeDeepResearch('u1', 10)).ok).toBe(true)
    expect((await consumeDeepResearch('u1', 10)).ok).toBe(false)
  })
  it('peek reads what is left without spending, and says 0 only when the allowance is used up (owner 20/11/2026: that turn runs as Thinking)', async () => {
    expect(await peekDeepResearch('u5', 15)).toMatchObject({ limit: 15, used: 0, remaining: 15 })
    for (let i = 0; i < 15; i++) expect((await consumeDeepResearch('u5', 15)).ok).toBe(true)
    expect(await peekDeepResearch('u5', 15)).toMatchObject({ used: 15, remaining: 0 })
    expect((await consumeDeepResearch('u5', 15)).ok).toBe(false)
    expect(await peekDeepResearch('u5', 15)).toMatchObject({ used: 15, remaining: 0 }) // a refused spend records nothing
    expect(await peekDeepResearch('u6', 15)).toMatchObject({ remaining: 15 }) // accounts never share it
    expect(await peekDeepResearch('u5', 0)).toEqual({ limit: 0, used: 0, remaining: 0 })
  })
  it('a tier without Deep Research is refused without spending', async () => {
    expect(await consumeDeepResearch('u1', 0)).toMatchObject({ ok: false, refund: null })
  })
  it('parallel runs admit exactly the allowance', async () => {
    const r = await Promise.all(Array.from({ length: 15 }, () => consumeDeepResearch('u3', 10)))
    expect(r.filter(x => x.ok)).toHaveLength(10)
  })
})
