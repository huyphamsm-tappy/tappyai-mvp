// Explore video, part VID-03: the HYBRID decision engine. A PURE function (no I/O, no clock): evidence in, one decision out.
//
// Owner rules (ADR rev.1/rev.2, 05/11/2026) it implements:
//  - The AI may only APPROVE when every required evidence is present AND every category score is under the LOW threshold.
//  - Everything else goes to a person (`review_required`). A clear violation is rejected by the AI only when the owner switched that on
//    (VIDEO_MODERATION_AUTO_REJECT_ENABLED, default OFF) and only for the non-severe categories listed here.
//  - SEVERE categories (sexual content with minors, anything child-safety related) are never decided by the AI: urgent human review plus a legal hold (done by the caller).
//  - Only SPEECH counts for audio (gunshots, screams, thunder are not violations): the speech evidence is the TRANSCRIPT text, never a classification of the sound.
//
// Scores come from the moderation provider (0..1 per category). A provider FLAG on a category is read as at least the HIGH score, so a flagged category can never pass as "low".

export const MODERATION_POLICY_VERSION = 'vmod-1'

export type EvidenceKind = 'visual' | 'speech' | 'overlay'
export type EvidenceStatus = 'analysed' | 'empty' | 'not_analysed'

export interface EvidenceItem {
  kind: EvidenceKind
  /** analysed = the provider answered; empty = there was nothing to analyse (no speech, no overlay text); not_analysed = it could not or may not be analysed. */
  status: EvidenceStatus
  scores: Record<string, number>
  /** Categories the provider itself flagged. */
  flagged: string[]
}

export interface ModerationPolicy {
  version: string
  /** Approve only when EVERY score is strictly under this. */
  lowScore: number
  /** A score at or over this is a strong signal (priority high; the provider's own flag counts as this). */
  highScore: number
  /** A severe category at or over this is a suspected child-safety case. */
  severeScore: number
  /** With auto-reject switched on, a category in `autoRejectCategories` at or over this is a clear violation. */
  autoRejectScore: number
  autoRejectCategories: readonly string[]
}

export const DEFAULT_MODERATION_POLICY: ModerationPolicy = {
  version: MODERATION_POLICY_VERSION,
  lowScore: 0.1,
  highScore: 0.6,
  severeScore: 0.2,
  autoRejectScore: 0.9,
  autoRejectCategories: ['sexual', 'violence/graphic', 'hate/threatening'],
}

export type DecisionKind = 'approve' | 'review_required' | 'reject'
export type ReviewPriority = 'normal' | 'high' | 'urgent'

export interface ModerationDecision {
  decision: DecisionKind
  priority: ReviewPriority
  /** The deciding category (the highest score, or the severe one); null when none applies (approval, missing evidence only). */
  category: string | null
  /** The score of that category; for an approval, 1 minus the highest score seen. */
  confidence: number
  reasonCode: string
  severe: boolean
}

export interface DecideInput {
  evidence: EvidenceItem[]
  /** The kinds without which the clip cannot be approved. */
  required: EvidenceKind[]
  autoRejectEnabled: boolean
  /** No human reviewer: every non-severe case that would wait for a person is rejected instead (see decideModeration). */
  automated?: boolean
  policy?: ModerationPolicy
}

/** Anything about minors / children: never classified by the AI alone. */
export function isSevereCategory(category: string): boolean {
  return /minor|child|csam/i.test(category)
}

/**
 * With NO human reviewer (owner 25/11/2026: "máy duyệt hết, chặt"), `review_required` would be a dead end: nobody opens it, so the clip would sit unpublished for ever. In AUTOMATED mode the
 * machine closes every case itself: anything that is not a clean approval is REJECTED (the author can edit and upload again), whether the cause is a high score, a borderline score or evidence
 * that could not be gathered. The one exception is the SEVERE case (anything about minors): it keeps its urgent hold and legal hold and is never approved or rejected by the machine (the database
 * refuses it too), so the clip simply never publishes.
 */
export function decideModeration(input: DecideInput): ModerationDecision {
  const d = decideManual(input)
  if (!input.automated || d.decision !== 'review_required' || d.severe) return d
  return { ...d, decision: 'reject', priority: 'normal', reasonCode: `auto:${d.reasonCode}` }
}

function decideManual(input: DecideInput): ModerationDecision {
  const policy = input.policy ?? DEFAULT_MODERATION_POLICY

  // Highest score per category across all evidence; a provider flag counts as at least the HIGH score.
  const top = new Map<string, number>()
  const bump = (cat: string, score: number) => { if (score > (top.get(cat) ?? -1)) top.set(cat, score) }
  for (const e of input.evidence) {
    if (e.status === 'not_analysed') continue
    for (const [cat, score] of Object.entries(e.scores)) if (Number.isFinite(score)) bump(cat, score)
    for (const cat of e.flagged) bump(cat, Math.max(e.scores[cat] ?? 0, policy.highScore))
  }
  const ranked = [...top.entries()].sort((a, b) => b[1] - a[1])
  const highest = ranked[0] ?? null

  const missing = input.required.filter((kind) => {
    const e = input.evidence.find((x) => x.kind === kind)
    return !e || e.status === 'not_analysed'
  })

  // 1. Severe: urgent human review, whatever else is true. Never approved, never rejected by the AI.
  const severe = ranked.find(([cat, score]) => isSevereCategory(cat) && score >= policy.severeScore)
  if (severe) return { decision: 'review_required', priority: 'urgent', category: severe[0], confidence: severe[1], reasonCode: 'severe_category', severe: true }

  // 2. Automatic reject: only when switched on, only a clear, listed, non-severe category.
  if (input.autoRejectEnabled) {
    const clear = ranked.find(([cat, score]) => !isSevereCategory(cat) && policy.autoRejectCategories.includes(cat) && score >= policy.autoRejectScore)
    if (clear) return { decision: 'reject', priority: 'normal', category: clear[0], confidence: clear[1], reasonCode: 'auto_reject_clear_violation', severe: false }
  }

  // 3. Everything that cannot be approved goes to a person.
  if (highest && highest[1] >= policy.highScore) {
    return { decision: 'review_required', priority: 'high', category: highest[0], confidence: highest[1], reasonCode: missing.length ? `category_high+evidence_missing:${missing.join(',')}` : 'category_high', severe: false }
  }
  if (missing.length) {
    return { decision: 'review_required', priority: 'normal', category: highest && highest[1] >= policy.lowScore ? highest[0] : null, confidence: highest?.[1] ?? 0, reasonCode: `evidence_missing:${missing.join(',')}`, severe: false }
  }
  if (highest && highest[1] >= policy.lowScore) {
    return { decision: 'review_required', priority: 'normal', category: highest[0], confidence: highest[1], reasonCode: 'category_borderline', severe: false }
  }

  return { decision: 'approve', priority: 'normal', category: null, confidence: Math.max(0, 1 - (highest?.[1] ?? 0)), reasonCode: 'all_clear', severe: false }
}
