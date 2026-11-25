import { describe, it, expect } from 'vitest'
import { decideModeration, isSevereCategory, DEFAULT_MODERATION_POLICY, type EvidenceItem, type ModerationPolicy } from './moderationPolicy'

const clean = (kind: EvidenceItem['kind'], extra: Record<string, number> = {}): EvidenceItem => ({ kind, status: 'analysed', scores: { sexual: 0.001, violence: 0.002, hate: 0.0005, ...extra }, flagged: [] })
const base = (evidence: EvidenceItem[], over: Partial<{ required: EvidenceItem['kind'][]; autoRejectEnabled: boolean; policy: ModerationPolicy }> = {}) =>
  decideModeration({ evidence, required: over.required ?? ['visual', 'speech', 'overlay'], autoRejectEnabled: over.autoRejectEnabled ?? false, policy: over.policy })

describe('approval: only when EVERY required evidence is present and EVERY score is under the low threshold', () => {
  it('approves a clean clip', () => {
    const d = base([clean('visual'), clean('speech'), clean('overlay')])
    expect(d).toMatchObject({ decision: 'approve', reasonCode: 'all_clear', severe: false, priority: 'normal' })
    expect(d.confidence).toBeGreaterThan(0.9)
  })
  it('an empty speech / overlay (nothing said, nothing written) counts as analysed', () => {
    const empty = (kind: EvidenceItem['kind']): EvidenceItem => ({ kind, status: 'empty', scores: {}, flagged: [] })
    expect(base([clean('visual'), empty('speech'), empty('overlay')]).decision).toBe('approve')
  })
  it('a score exactly at the low threshold is NOT under it', () => {
    expect(base([clean('visual', { violence: DEFAULT_MODERATION_POLICY.lowScore }), clean('speech'), clean('overlay')]).decision).toBe('review_required')
  })
  it('a score just under the low threshold still approves', () => {
    expect(base([clean('visual', { violence: DEFAULT_MODERATION_POLICY.lowScore - 0.001 }), clean('speech'), clean('overlay')]).decision).toBe('approve')
  })
  it('a provider flag with a low score still blocks approval (the flag is read as at least the high score)', () => {
    const v: EvidenceItem = { kind: 'visual', status: 'analysed', scores: { violence: 0.01 }, flagged: ['violence'] }
    const d = base([v, clean('speech'), clean('overlay')])
    expect(d.decision).toBe('review_required')
    expect(d.priority).toBe('high')
  })
})

describe('anything else goes to a person, never to an automatic reject', () => {
  it('missing evidence (speech not analysed) -> review_required, reason names it', () => {
    const d = base([clean('visual'), { kind: 'speech', status: 'not_analysed', scores: {}, flagged: [] }, clean('overlay')])
    expect(d).toMatchObject({ decision: 'review_required', reasonCode: 'evidence_missing:speech', priority: 'normal' })
  })
  it('an evidence that is simply absent from the list counts as missing', () => {
    expect(base([clean('visual'), clean('overlay')]).reasonCode).toBe('evidence_missing:speech')
  })
  it('a kind that is not required may be absent', () => {
    expect(base([clean('visual'), clean('overlay')], { required: ['visual', 'overlay'] }).decision).toBe('approve')
  })
  it('the visual evidence is never optional in practice: a policy cannot approve without it when required', () => {
    expect(base([clean('speech'), clean('overlay')]).decision).toBe('review_required')
  })
  it('a borderline score (between low and high) -> review_required, normal priority', () => {
    const d = base([clean('visual', { violence: 0.3 }), clean('speech'), clean('overlay')])
    expect(d).toMatchObject({ decision: 'review_required', reasonCode: 'category_borderline', category: 'violence', priority: 'normal' })
  })
  it('a score over the high threshold -> review_required, high priority, with the category and confidence', () => {
    const d = base([clean('visual', { violence: 0.93 }), clean('speech'), clean('overlay')])
    expect(d).toMatchObject({ decision: 'review_required', reasonCode: 'category_high', category: 'violence', priority: 'high' })
    expect(d.confidence).toBeCloseTo(0.93, 5)
  })
  it('the highest score across all evidence decides the category', () => {
    const d = base([clean('visual', { violence: 0.4 }), clean('speech', { hate: 0.7 }), clean('overlay')])
    expect(d).toMatchObject({ category: 'hate', reasonCode: 'category_high' })
  })
  it('even the worst non-severe clip is NOT rejected while auto-reject is off', () => {
    const d = base([clean('visual', { sexual: 0.999 }), clean('speech'), clean('overlay')], { autoRejectEnabled: false })
    expect(d.decision).toBe('review_required')
  })
})

describe('automatic reject: only behind the switch, only a clear non-severe category', () => {
  it('rejects a clear violation in an auto-reject category when switched on', () => {
    const d = base([clean('visual', { sexual: 0.99 }), clean('speech'), clean('overlay')], { autoRejectEnabled: true })
    expect(d).toMatchObject({ decision: 'reject', category: 'sexual', reasonCode: 'auto_reject_clear_violation', severe: false })
  })
  it('does not reject a category outside the list, or a score under the clear threshold', () => {
    expect(base([clean('visual', { violence: 0.99 }), clean('speech'), clean('overlay')], { autoRejectEnabled: true }).decision).toBe('review_required')
    expect(base([clean('visual', { sexual: 0.7 }), clean('speech'), clean('overlay')], { autoRejectEnabled: true }).decision).toBe('review_required')
  })
  it('can reject even when another evidence is missing (a clear violation is clear)', () => {
    const miss: EvidenceItem = { kind: 'speech', status: 'not_analysed', scores: {}, flagged: [] }
    expect(base([clean('visual', { sexual: 0.99 }), miss, clean('overlay')], { autoRejectEnabled: true }).decision).toBe('reject')
  })
})

describe('severe categories are NEVER decided by the AI', () => {
  it.each(['sexual/minors', 'minors', 'child_safety', 'csam', 'sexual/child'])('%s is severe', (c) => {
    expect(isSevereCategory(c)).toBe(true)
  })
  it.each(['sexual', 'violence', 'hate', 'violence/graphic', 'self-harm'])('%s is not severe', (c) => {
    expect(isSevereCategory(c)).toBe(false)
  })
  it('a severe signal -> review_required, urgent, severe, never approve or reject, even with auto-reject on', () => {
    const d = base([clean('visual', { 'sexual/minors': 0.5, sexual: 0.99 }), clean('speech'), clean('overlay')], { autoRejectEnabled: true })
    expect(d).toMatchObject({ decision: 'review_required', priority: 'urgent', severe: true, category: 'sexual/minors', reasonCode: 'severe_category' })
  })
  it('a severe signal in the SPEECH or overlay text counts the same', () => {
    expect(base([clean('visual'), clean('speech', { 'sexual/minors': 0.5 }), clean('overlay')]).severe).toBe(true)
    expect(base([clean('visual'), clean('speech'), clean('overlay', { 'sexual/minors': 0.5 })]).severe).toBe(true)
  })
  it('a provider FLAG on a severe category is enough even with a tiny score', () => {
    const v: EvidenceItem = { kind: 'visual', status: 'analysed', scores: { 'sexual/minors': 0.001 }, flagged: ['sexual/minors'] }
    expect(base([v, clean('speech'), clean('overlay')]).severe).toBe(true)
  })
  it('a severe score below the severe threshold but over low is an ordinary review', () => {
    const d = base([clean('visual', { 'sexual/minors': DEFAULT_MODERATION_POLICY.lowScore + 0.01 }), clean('speech'), clean('overlay')])
    expect(d).toMatchObject({ decision: 'review_required', severe: false })
  })
  it('severe wins over missing evidence', () => {
    const miss: EvidenceItem = { kind: 'speech', status: 'not_analysed', scores: {}, flagged: [] }
    expect(base([clean('visual', { 'sexual/minors': 0.9 }), miss, clean('overlay')]).priority).toBe('urgent')
  })
})

describe('thresholds are configuration', () => {
  it('a custom policy changes the outcome', () => {
    const strict: ModerationPolicy = { ...DEFAULT_MODERATION_POLICY, lowScore: 0.0001 }
    expect(base([clean('visual'), clean('speech'), clean('overlay')], { policy: strict }).decision).toBe('review_required')
  })
  it('the default thresholds are ordered low < high <= clear', () => {
    const p = DEFAULT_MODERATION_POLICY
    expect(p.lowScore).toBeLessThan(p.highScore)
    expect(p.highScore).toBeLessThanOrEqual(p.autoRejectScore)
    expect(p.severeScore).toBeLessThan(p.highScore)
  })
})
