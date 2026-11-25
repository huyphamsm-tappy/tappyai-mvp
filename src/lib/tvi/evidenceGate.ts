// TVI · the fact-level evidence gate (R13 §8.5-8.6). Pure: no store, no network, no model.
//
// Given what is known about ONE fact version (its type, when it was read, its validity, and its evidence), it answers two questions:
//   evaluateFact()  → how well supported is it? (the seven states of R13 §8.6)
//   promotionFor()  → may a pending CANDIDATE become ACTIVE, and with which verification level?
//
// Two rules from R13 shape everything here:
//   · Authority is judged PER FACT TYPE and per kind of source, never by a universal domain "tier". A business's own site is the authority on its opening hours; a news article is not.
//   · Popularity (views, likes, followers, a KOL, a community thread) is NOT evidence that a fact is true: those sources carry no authority for any type below.
// Independence: evidence from the same independence group (the same publisher, a syndicated or copied page) counts ONCE.
// The authority table and the single-source promotion list are INITIAL POLICY (R13 §21 asks for them to be reviewed); they are data in this one file.

import { freshnessOf, isKnownFactType, type KnownFactType } from './factTypes'

export type SourceType = 'GOVERNMENT' | 'OFFICIAL_BUSINESS' | 'NEWS' | 'PROVIDER_API' | 'KOL' | 'COMMUNITY' | 'UGC' | 'OTHER'
export type Authority = 'HIGH' | 'MEDIUM' | 'LOW'
export type EvidenceRelation = 'SUPPORTS' | 'REFUTES' | 'QUALIFIES' | 'CONTEXT_ONLY'

export type FactEvaluation =
  | 'STRONG_SUPPORT'
  | 'SINGLE_SOURCE_SUPPORT'
  | 'PARTIAL_SUPPORT'
  | 'CONFLICTING'
  | 'STALE_REVALIDATION_REQUIRED'
  | 'EXPIRED_OR_SUPERSEDED'
  | 'INSUFFICIENT'

/** Who may speak for which kind of fact. A missing entry means NO authority (the source cannot support or refute that type). */
export const SOURCE_AUTHORITY: Readonly<Record<KnownFactType, Partial<Record<SourceType, Authority>>>> = {
  opening_hours: { OFFICIAL_BUSINESS: 'HIGH', PROVIDER_API: 'MEDIUM', NEWS: 'LOW' },
  ticket_price: { OFFICIAL_BUSINESS: 'HIGH', GOVERNMENT: 'HIGH', PROVIDER_API: 'LOW', NEWS: 'LOW' },
  menu_price: { OFFICIAL_BUSINESS: 'HIGH', PROVIDER_API: 'LOW' },  address: { GOVERNMENT: 'HIGH', OFFICIAL_BUSINESS: 'HIGH', PROVIDER_API: 'MEDIUM', NEWS: 'LOW' },
  phone: { OFFICIAL_BUSINESS: 'HIGH', PROVIDER_API: 'MEDIUM' },
  permanently_closed: { OFFICIAL_BUSINESS: 'HIGH', GOVERNMENT: 'HIGH', NEWS: 'MEDIUM', PROVIDER_API: 'MEDIUM' },
  website: { OFFICIAL_BUSINESS: 'HIGH', PROVIDER_API: 'MEDIUM' },
}

/**
 * Fact types for which ONE source of at least MEDIUM authority may promote a candidate to ACTIVE (PARTIALLY_VERIFIED). These are stable, descriptive facts that a places provider publishes.
 * Prices and "permanently closed" are NOT here: they change fast or carry a heavy cost when wrong, so they need two independent sources or a HIGH-authority one.
 */
export const SINGLE_SOURCE_PROMOTABLE: ReadonlySet<KnownFactType> = new Set<KnownFactType>(['address', 'phone', 'website', 'opening_hours'])

export interface EvidenceInput {
  relation: EvidenceRelation
  sourceType: SourceType
  /** Evidence of one independence group (the same publisher, syndication, a copy) counts once. Defaults to the source domain when absent. */
  independenceGroup?: string | null
  sourceDomain?: string | null
  /** RETRACTED evidence is ignored. */
  active?: boolean
}

export interface FactInput {
  factType: string
  retrievedAt: string | Date
  /** The validity window, when the source states one. */
  validUntil?: string | Date | null
  /** The lifecycle status of the version being judged, when known. */
  status?: 'CANDIDATE' | 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | 'REJECTED'
  evidence: readonly EvidenceInput[]
}

const RANK: Record<Authority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 }

function authorityOf(type: KnownFactType, e: EvidenceInput): Authority | null {
  return SOURCE_AUTHORITY[type][e.sourceType] ?? null
}
const groupOf = (e: EvidenceInput) => (e.independenceGroup ?? e.sourceDomain ?? `type:${e.sourceType}`).toLowerCase()

export interface Evaluation {
  state: FactEvaluation
  /** Distinct independence groups that support the fact with at least MEDIUM authority. */
  independentSupport: number
  /** The strongest authority among the supporting groups, if any. */
  bestAuthority: Authority | null
}

/** How well supported is this fact version? Order of precedence: expired · conflicting · nothing/partial · stale · strong/single. Pure. */
export function evaluateFact(f: FactInput, now: Date = new Date()): Evaluation {
  const none: Evaluation = { state: 'INSUFFICIENT', independentSupport: 0, bestAuthority: null }
  if (!isKnownFactType(f.factType)) return none
  const type = f.factType
  const until = f.validUntil == null ? null : f.validUntil instanceof Date ? f.validUntil.getTime() : Date.parse(f.validUntil)
  if (f.status === 'EXPIRED' || f.status === 'SUPERSEDED' || f.status === 'REJECTED' || (until !== null && !Number.isNaN(until) && until < now.getTime())) {
    return { state: 'EXPIRED_OR_SUPERSEDED', independentSupport: 0, bestAuthority: null }
  }

  const live = f.evidence.filter(e => e.active !== false)
  // A refutation counts only from a source that has authority over this type: a forum post cannot dispute an opening time.
  const refuted = live.some(e => e.relation === 'REFUTES' && authorityOf(type, e) !== null)
  const groups = new Map<string, Authority>()
  let lowOrQualifying = false
  for (const e of live) {
    const a = authorityOf(type, e)
    if (a === null) continue
    if (e.relation === 'SUPPORTS' && RANK[a] >= RANK.MEDIUM) {
      const g = groupOf(e)
      const prev = groups.get(g)
      if (!prev || RANK[a] > RANK[prev]) groups.set(g, a)
    } else if (e.relation === 'QUALIFIES' || (e.relation === 'SUPPORTS' && a === 'LOW')) {
      lowOrQualifying = true
    }
  }
  const best = [...groups.values()].sort((a, b) => RANK[b] - RANK[a])[0] ?? null
  const base = { independentSupport: groups.size, bestAuthority: best }

  if (refuted && (groups.size > 0 || lowOrQualifying)) return { state: 'CONFLICTING', ...base }
  if (groups.size === 0) return { state: lowOrQualifying ? 'PARTIAL_SUPPORT' : 'INSUFFICIENT', ...base }
  if (freshnessOf(type, f.retrievedAt, now) === 'STALE') return { state: 'STALE_REVALIDATION_REQUIRED', ...base }
  return { state: groups.size >= 2 ? 'STRONG_SUPPORT' : 'SINGLE_SOURCE_SUPPORT', ...base }
}

export type Promotion =
  | { action: 'promote'; verification: 'VERIFIED' | 'PARTIALLY_VERIFIED'; reason: string }
  | { action: 'dispute'; reason: string }
  | { action: 'hold'; reason: string }

/**
 * May a pending CANDIDATE become ACTIVE? Two independent supporting groups: yes, VERIFIED. One group: yes (PARTIALLY_VERIFIED) only for the single-source types and only when the source's
 * authority for that type is at least MEDIUM; otherwise it waits. Conflicting evidence marks the fact DISPUTED. Everything else holds. Pure.
 */
export function promotionFor(f: FactInput, now: Date = new Date()): Promotion {
  const ev = evaluateFact(f, now)
  switch (ev.state) {
    case 'STRONG_SUPPORT':
      return { action: 'promote', verification: 'VERIFIED', reason: 'two_independent_sources' }
    case 'SINGLE_SOURCE_SUPPORT':
      if (isKnownFactType(f.factType) && SINGLE_SOURCE_PROMOTABLE.has(f.factType) && ev.bestAuthority !== null && RANK[ev.bestAuthority] >= RANK.MEDIUM) {
        return { action: 'promote', verification: 'PARTIALLY_VERIFIED', reason: 'single_source_allowed_for_type' }
      }
      return { action: 'hold', reason: 'single_source_not_enough_for_type' }
    case 'CONFLICTING':
      return { action: 'dispute', reason: 'authoritative_evidence_conflicts' }
    case 'STALE_REVALIDATION_REQUIRED':
      return { action: 'hold', reason: 'stale_needs_revalidation' }
    case 'EXPIRED_OR_SUPERSEDED':
      return { action: 'hold', reason: 'expired_or_superseded' }
    case 'PARTIAL_SUPPORT':
      return { action: 'hold', reason: 'only_partial_support' }
    default:
      return { action: 'hold', reason: 'insufficient_evidence' }
  }
}
