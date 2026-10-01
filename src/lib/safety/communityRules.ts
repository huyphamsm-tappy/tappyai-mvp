// ── Community rules and the penalty ladder (owner 01/10) ────────────────────────────────────────────────────────────
//
// ONE source for: the public page /community-guidelines, the moderator's desk (rule picker), the strike ledger CHECKs
// (supabase/migrations/20261001d_moderation_standards.sql — keep RULE_GROUP_IDS in step with its CHECK) and the notice a
// sanctioned person receives.
//
// WHAT THIS IS NOT: automation. A report never removes, hides, sanctions or bans anyone — it only enters the queue.
// `suggestPenalty` returns a SUGGESTION for the human reviewer; nothing here writes anything.
//
// ⚠ EVERY NUMBER BELOW IS A PROPOSAL — «đề xuất, Huy duyệt». The thresholds, the expiry periods and the restriction length
// are configuration, not law: change them here, in one place, after the owner decides. Wording of the rules themselves lives in
// src/lib/i18n/communityGuidelines.ts and also needs the owner's approval (and review by someone who knows Vietnamese law,
// including removal of content on the request of a competent authority).

export const RULE_GROUP_IDS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence_selfharm',
  'scam_misinfo',
  'impersonation',
  'ip_privacy',
  'illegal_goods',
  'child_safety',
] as const
export type RuleGroupId = (typeof RULE_GROUP_IDS)[number]

export type Severity = 1 | 2 | 3
/** The strongest penalty the group allows (a reviewer may always choose less). */
export type MaxPenalty = 'warning' | 'strike' | 'restrict' | 'ban'

export interface RuleGroup {
  id: RuleGroupId
  /** The severity a reviewer starts from. */
  defaultSeverity: Severity
  /** The highest severity the group can reach (credible threats, exploitation, doxxing…). */
  maxSeverity: Severity
  maxPenalty: MaxPenalty
  /** Target time to a decision, in hours. Severe groups are worked first and an overdue one raises an alert. */
  targetHours: number
  /** Severe groups jump the queue (priority 3). */
  priority: 1 | 2 | 3
}

export const RULE_GROUPS: Readonly<Record<RuleGroupId, RuleGroup>> = {
  spam:              { id: 'spam',              defaultSeverity: 1, maxSeverity: 2, maxPenalty: 'restrict', targetHours: 72, priority: 1 },
  harassment:        { id: 'harassment',        defaultSeverity: 2, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 48, priority: 2 },
  hate:              { id: 'hate',              defaultSeverity: 2, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 48, priority: 2 },
  sexual:            { id: 'sexual',            defaultSeverity: 2, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 24, priority: 3 },
  violence_selfharm: { id: 'violence_selfharm', defaultSeverity: 2, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 24, priority: 3 },
  scam_misinfo:      { id: 'scam_misinfo',      defaultSeverity: 2, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 48, priority: 2 },
  impersonation:     { id: 'impersonation',     defaultSeverity: 2, maxSeverity: 2, maxPenalty: 'restrict', targetHours: 48, priority: 2 },
  ip_privacy:        { id: 'ip_privacy',        defaultSeverity: 1, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 48, priority: 2 },
  illegal_goods:     { id: 'illegal_goods',     defaultSeverity: 2, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 48, priority: 2 },
  child_safety:      { id: 'child_safety',      defaultSeverity: 3, maxSeverity: 3, maxPenalty: 'ban',      targetHours: 24, priority: 3 },
}

export const isRuleGroup = (v: unknown): v is RuleGroupId => typeof v === 'string' && (RULE_GROUP_IDS as readonly string[]).includes(v)

/** Where a violation happened. Strikes are counted per group AND per feature. */
export const FEATURES = ['post', 'comment', 'message', 'profile'] as const
export type Feature = (typeof FEATURES)[number]
export const isFeature = (v: unknown): v is Feature => typeof v === 'string' && (FEATURES as readonly string[]).includes(v)

/** What a reviewer can decide. `hold` (hide a post while it waits) writes no ledger row and counts as no strike. */
export const OUTCOMES = ['no_violation', 'hold', 'warning', 'remove', 'restrict', 'ban'] as const
export type Outcome = (typeof OUTCOMES)[number]

/** What the ledger stores (`remove` = content removed + 1 strike). */
export type LedgerOutcome = 'no_violation' | 'warning' | 'content_removed' | 'restricted' | 'banned'
export const LEDGER_OUTCOME: Readonly<Record<Exclude<Outcome, 'hold'>, LedgerOutcome>> = {
  no_violation: 'no_violation', warning: 'warning', remove: 'content_removed', restrict: 'restricted', ban: 'banned',
}
/** A warning and a no-violation never count as a strike; the three real penalties each do. */
export const countsAsStrike = (o: LedgerOutcome): boolean => o === 'content_removed' || o === 'restricted' || o === 'banned'

// ── The ladder (PROPOSED — owner approves the numbers) ──────────────────────────────────────────────────────────────
export const LADDER = {
  /** A strike stops counting after this many days; severity 3 never expires. */
  strikeExpiryDays: { 1: 90, 2: 180, 3: null } as Readonly<Record<Severity, number | null>>,
  /** Active strikes (severity 1–2) in the same group + feature that tip the suggestion from «remove» to «restrict». */
  restrictAtStrikes: 3,
  /** Active strikes in total (any group) that tip the suggestion to «ban». */
  banAtStrikes: 5,
  /** The restriction (cannot post or comment; can still read) — the length a reviewer starts from, and the longest allowed. */
  restrictDaysDefault: 7,
  restrictDaysMax: 30,
  /** How long after a decision a person may appeal, and how many appeals one decision gets. */
  appealWindowDays: 30,
  appealsPerDecision: 1,
  /** A reporter whose reports are mostly rejected is queued last (never ignored, never punished automatically). */
  lowTrustMinReports: 5,
  lowTrustDismissedShare: 0.8,
} as const

/** The expiry of the strike a decision creates, or null (no strike, or a severity-3 strike that never expires). */
export function strikeExpiry(severity: Severity, from: Date = new Date()): Date | null {
  const days = LADDER.strikeExpiryDays[severity]
  return days === null ? null : new Date(from.getTime() + days * 86_400_000)
}

export interface SuggestInput {
  group: RuleGroupId
  severity: Severity
  /** Active (unexpired, not reversed) strikes of this person in the same group AND feature. */
  strikesSameGroupFeature: number
  /** Active strikes of this person in total. */
  strikesTotal: number
}
export interface Suggestion { outcome: Exclude<Outcome, 'hold' | 'no_violation'>; restrictDays?: number; why: 'severity3' | 'ban_threshold' | 'restrict_threshold' | 'first_minor' | 'strike' }

/** A suggestion, never an order: the reviewer decides, with a written reason. A severity-3 violation MAY go straight to a ban. */
export function suggestPenalty(i: SuggestInput): Suggestion {
  if (i.severity === 3) return { outcome: 'ban', why: 'severity3' }
  if (i.strikesTotal + 1 >= LADDER.banAtStrikes) return { outcome: 'ban', why: 'ban_threshold' }
  if (i.strikesSameGroupFeature + 1 >= LADDER.restrictAtStrikes) return { outcome: 'restrict', restrictDays: LADDER.restrictDaysDefault, why: 'restrict_threshold' }
  if (i.severity === 1 && i.strikesTotal === 0) return { outcome: 'warning', why: 'first_minor' }
  return { outcome: 'remove', why: 'strike' }
}

/** The highest penalty a group allows, as a rank (so the desk can warn when a reviewer chooses beyond the table). */
const PENALTY_RANK: Readonly<Record<MaxPenalty, number>> = { warning: 0, strike: 1, restrict: 2, ban: 3 }
export const OUTCOME_RANK: Readonly<Record<Exclude<Outcome, 'hold' | 'no_violation'>, number>> = { warning: 0, remove: 1, restrict: 2, ban: 3 }
export function withinGroupMax(group: RuleGroupId, outcome: Exclude<Outcome, 'hold' | 'no_violation'>): boolean {
  return OUTCOME_RANK[outcome] <= PENALTY_RANK[RULE_GROUPS[group].maxPenalty]
}

/** The queue priority a report reason starts with (the migration trigger mirrors this table). */
export const REPORT_REASON_PRIORITY: Readonly<Record<string, 0 | 1 | 2 | 3>> = {
  child_safety: 3, self_harm: 3, violence: 3, sexual: 3,
  hate: 2, harassment: 2, scam: 2, impersonation: 2, misinformation: 2,
  spam: 1, inappropriate: 1, copyright: 1, sensitive: 1, other: 1,
}
