import { describe, it, expect, vi } from 'vitest'
import { moderateImageVn, moderateTextVn, CATEGORY_NAME } from './videoAdapter'
import { MODERATION_CATEGORIES } from './lexicon'
import { decideModeration } from '@/lib/media/video/moderationPolicy'

const ok = (verdict: 'allow' | 'block', category: string, confidence: number) => async () => ({ status: 'ok' as const, verdict, category: category as never, confidence })
const bytes = new Uint8Array([1])

describe('the clip adapter gives the clip policy the answer shape it expects', () => {
  it('every category is mapped, and the child category lands on the one the policy treats as severe', () => {
    expect(Object.keys(CATEGORY_NAME).sort()).toEqual([...MODERATION_CATEGORIES].sort())
    expect(CATEGORY_NAME.child_safety).toBe('sexual/minors')
  })
  it('an "allow" is all zeros; a "block" scores the model confidence in its own category and flags it past the threshold', async () => {
    const clean = await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('allow', 'none', 0.99) })
    expect(clean.status === 'ok' && Object.values(clean.scores!).every((s) => s === 0)).toBe(true)
    const bad = await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('block', 'anti_state', 0.8) })
    expect(bad).toMatchObject({ status: 'ok', scores: { anti_state: 0.8, sexual: 0 }, categories: { anti_state: true, sexual: false } })
    const weak = await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('block', 'anti_state', 0.4) })
    expect(weak).toMatchObject({ scores: { anti_state: 0.4 }, categories: { anti_state: false } })
  })
  it('a model that is down or says "block" without a category is NOT evidence (unavailable)', async () => {
    expect((await moderateImageVn(bytes, 'image/jpeg', { classifyImage: async () => ({ status: 'unavailable', reason: 'x' }) })).status).toBe('unavailable')
    expect((await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('block', 'none', 0.9) })).status).toBe('unavailable')
  })
  it('text: a phrase hit scores 1 without calling the model; no pieces is not an answer', async () => {
    const classifyText = vi.fn()
    const r = await moderateTextVn(['Xem phim sex miễn phí'], { classifyText })
    expect(r).toMatchObject({ status: 'ok', scores: { sexual: 1 }, categories: { sexual: true } })
    expect(classifyText).not.toHaveBeenCalled()
    expect((await moderateTextVn(['  ', ''])).status).toBe('unavailable')
  })
  it('a long transcript is judged in ALL its parts and a category counts at its highest score; too long to judge is not judged', async () => {
    const seen: number[] = []
    const classifyText = vi.fn(async (t: string) => { seen.push(t.length); return seen.length === 2 ? { status: 'ok' as const, verdict: 'block' as const, category: 'drugs' as never, confidence: 0.9 } : { status: 'ok' as const, verdict: 'allow' as const, category: 'none' as never, confidence: 0.9 } })
    const r = await moderateTextVn(['a'.repeat(9000)], { classifyText })
    expect(seen).toEqual([4000, 4000, 1000])
    expect(r).toMatchObject({ status: 'ok', scores: { drugs: 0.9 }, categories: { drugs: true } })
    expect((await moderateTextVn(['a'.repeat(4000 * 12 + 1)], { classifyText })).status).toBe('unavailable')
  })
  it('a part that cannot be judged makes the whole text unavailable', async () => {
    let n = 0
    const classifyText = async () => (++n === 2 ? { status: 'unavailable' as const, reason: 'x' } : { status: 'ok' as const, verdict: 'allow' as const, category: 'none' as never, confidence: 1 })
    expect((await moderateTextVn(['a'.repeat(9000)], { classifyText })).status).toBe('unavailable')
  })
  it('through the clip policy: a clean frame passes, a flagged frame is rejected in automated mode', async () => {
    const ev = async (out: Awaited<ReturnType<typeof moderateImageVn>>) => (out.status === 'ok' ? [{ kind: 'visual' as const, status: 'analysed' as const, scores: out.scores!, flagged: Object.entries(out.categories).filter(([, v]) => v).map(([c]) => c) }] : [])
    const clean = decideModeration({ evidence: await ev(await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('allow', 'none', 1) })), required: ['visual'], autoRejectEnabled: false, automated: true })
    expect(clean.decision).toBe('approve')
    const bad = decideModeration({ evidence: await ev(await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('block', 'child_safety', 0.5) })), required: ['visual'], autoRejectEnabled: false, automated: true })
    expect(bad).toMatchObject({ decision: 'review_required', severe: true })
    const gambling = decideModeration({ evidence: await ev(await moderateImageVn(bytes, 'image/jpeg', { classifyImage: ok('block', 'gambling', 0.8) })), required: ['visual'], autoRejectEnabled: false, automated: true })
    expect(gambling.decision).toBe('reject')
  })
})
