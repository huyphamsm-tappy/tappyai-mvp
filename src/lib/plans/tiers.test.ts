// Owner 01/11/2026: plan tiers - Pip (Free) chats with Luna 6.0; MoMo (Trial) and Coco (Pro) have every mode and 10 Deep Research a month;
// Tappy (Promax) every mode and 69. The ids stored in subscriptions stay as they are.
import { describe, it, expect, beforeEach } from 'vitest'
import { tierOf, modeForTier, DEEP_RESEARCH_MONTHLY } from './tiers'
import { consumeDeepResearch, refundAiQuestion, __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

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
  it('Deep Research per month: Free 0, Pro 10, Promax 69', () => {
    expect(DEEP_RESEARCH_MONTHLY).toEqual({ free: 0, pro: 10, promax: 69 })
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
  it('a tier without Deep Research is refused without spending', async () => {
    expect(await consumeDeepResearch('u1', 0)).toMatchObject({ ok: false, refund: null })
  })
  it('parallel runs admit exactly the allowance', async () => {
    const r = await Promise.all(Array.from({ length: 15 }, () => consumeDeepResearch('u3', 10)))
    expect(r.filter(x => x.ok)).toHaveLength(10)
  })
})
