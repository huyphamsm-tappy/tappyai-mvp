import type { CommerceLink, CommerceRequest } from '../domain/types'
import { isExpired } from '../domain/freshness'
import { RANKING_WEIGHTS, type FeatureVector, type RankingFeature } from './weights'

// ── Provider score (Plan §10) ────────────────────────────────────────────────
// Each feature is normalised to 0–1 and documented next to its formula so a
// ranking outcome can be explained field by field in the audit trail.
// Hard filters (rights, validation, guest-path policy) run BEFORE scoring in
// the resolver; scoring never resurrects a filtered link.

export interface ScoredLink {
  link: CommerceLink
  score: number
  features: FeatureVector
}

const AUTH_FRICTION: Record<CommerceLink['authRequiredAt'], number> = {
  none: 1,
  at_order: 0.8,
  before_checkout: 0.5,
  before_selection: 0.3,
  before_configuration: 0.3,
  app_only: 0.2,
}

const FRESHNESS_TYPE_SCORE = { realtime: 1, near_realtime: 0.6, unknown: 0.3, static: 0.2 } as const

/** How many of the request's configuration fields the link carries. */
function intentExactness(request: CommerceRequest, link: CommerceLink): number {
  const cfg = request.configuration
  if (!cfg) return link.paramsPreserved.length > 0 ? 0.7 : 0.4
  const fields = Object.keys(cfg).filter(k => k !== 'kind' && (cfg as unknown as Record<string, unknown>)[k] !== undefined)
  if (fields.length === 0) return 0.5
  const carried = fields.filter(f => link.paramsPreserved.includes(f)).length
  const pageOnly = fields.filter(f => link.paramsPageOnly.includes(f)).length
  // Page-only fields are half credit: the user re-enters them, but the merchant supports them.
  return (carried + 0.5 * pageOnly) / fields.length
}

function freshnessScore(link: CommerceLink, now: Date): number {
  if (isExpired(link.freshness, now)) return 0
  return FRESHNESS_TYPE_SCORE[link.freshness.freshnessType] * link.freshness.confidence
}

export function featuresFor(request: CommerceRequest, link: CommerceLink, now: Date = new Date()): FeatureVector {
  const profile = link.depthProfile
  const guest = profile.guestDepth / 5
  const authBonus = profile.authenticatedDepth !== null ? (0.1 * (profile.authenticatedDepth - profile.guestDepth)) / 5 : 0
  const requested = link.paramsPreserved.length + link.paramsPageOnly.length + link.paramsDropped.length
  return {
    intentExactness: intentExactness(request, link),
    realtime: FRESHNESS_TYPE_SCORE[link.freshness.freshnessType],
    freshness: freshnessScore(link, now),
    depth: Math.min(1, guest + authBonus),
    deepLinkPrecision: requested === 0 ? 0.5 : link.paramsPreserved.length / requested + (link.validation.status === 'param_echo_ok' ? 0.1 : 0),
    reliability: link.validation.status === 'failed' || link.validation.status === 'unsafe_url' ? 0 : link.confidence,
    authFriction: AUTH_FRICTION[link.authRequiredAt],
    monetisation: link.tracking.mode === 'affiliate' ? 1 : 0,
  }
}

export function scoreLink(request: CommerceRequest, link: CommerceLink, now: Date = new Date(), weights = RANKING_WEIGHTS): ScoredLink {
  const features = featuresFor(request, link, now)
  let score = 0
  for (const k of Object.keys(weights) as RankingFeature[]) score += weights[k] * Math.min(1, Math.max(0, features[k]))
  return { link, score: Number(score.toFixed(6)), features }
}

/** Stable sort: higher score first; ties keep resolver order (which is the fallback ladder order). */
export function rankLinks(request: CommerceRequest, links: CommerceLink[], now: Date = new Date()): ScoredLink[] {
  return links
    .map((l, i) => ({ ...scoreLink(request, l, now), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ link, score, features }) => ({ link, score, features }))
}
