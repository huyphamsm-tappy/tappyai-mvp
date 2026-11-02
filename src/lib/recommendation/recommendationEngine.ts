// Pure, deterministic, stateless ranking engine.
// No database access. No side effects. No LLM calls.
// Input: AIContextResult + CandidatePlace[] → Output: RecommendationResult

import { AIContext, AIContextResult } from '@/types/aiContext'
import {
  CandidatePlace,
  RankedRecommendation,
  RecommendationResult,
  ScoreBreakdown,
} from '@/types/recommendation'
import {
  RECOMMENDATION_WEIGHTS,
  BUDGET_LEVEL_MAP,
  HIDDEN_TOPIC_PENALTY,
  MAX_REVIEW_COUNT,
  MAX_FRESHNESS_DAYS,
  MAX_AFFINITY_TAG_MATCHES,
  MAX_RECENT_INTEREST_MATCHES,
  MIN_SCORE_THRESHOLD,
  MAX_RECOMMENDATIONS,
} from './config'

// ── Signal result ────────────────────────────────────────────────────────────

interface SignalResult {
  score: number       // 0–1 raw sub-score (before weight)
  matched: string[]   // human-readable labels for matchedSignals
}

// ── Individual signal scorers (pure functions) ───────────────────────────────

function scoreAffinity(candidate: CandidatePlace, profile: AIContext): SignalResult {
  const favorites = new Set(
    [...profile.favoriteFoods, ...profile.favoriteCategories].map(f => f.toLowerCase())
  )
  const matched = candidate.tags.filter(t => favorites.has(t.toLowerCase()))

  // An explicit save is the user stating a preference outright — stronger
  // evidence than any tag overlap we infer, so it scores full affinity.
  // Without this the favourites fallback in /api/recommendations was dead:
  // it seeds candidates with reviewCount 0 / averageRating 0 for a user whose
  // profile is empty (that's *why* it fires), leaving freshness as the only
  // non-zero signal. Freshness is 1 - days/90, always < 1, weighted at 0.05 —
  // so the total was always < MIN_SCORE_THRESHOLD (0.05) and every favourite
  // was filtered out. Even one saved seconds earlier scored 0.049 and vanished.
  if (candidate.savedByUser) {
    return { score: 1.0, matched: ['Saved', ...matched] }
  }

  return {
    score: matched.length > 0 ? Math.min(matched.length / MAX_AFFINITY_TAG_MATCHES, 1.0) : 0,
    matched,
  }
}

function scoreLocation(city: string, profile: AIContext): SignalResult {
  if (!city || !profile.city) return { score: 0, matched: [] }
  const placeCity = city.toLowerCase()
  const userCity = profile.city.toLowerCase()
  const isMatch = placeCity.includes(userCity) || userCity.includes(placeCity)
  return {
    score: isMatch ? 1.0 : 0,
    matched: isMatch ? [`Near ${profile.city}`] : [],
  }
}

function scoreBudget(priceLevel: number | null, profile: AIContext): SignalResult {
  if (priceLevel === null || !profile.budget) return { score: 0, matched: [] }
  const acceptable = BUDGET_LEVEL_MAP[profile.budget] ?? []
  const isMatch = acceptable.includes(priceLevel)
  const label =
    profile.budget === 'cheap' ? 'Budget Friendly'
    : profile.budget === 'high' ? 'Premium'
    : 'Mid Range'
  return {
    score: isMatch ? 1.0 : 0,
    matched: isMatch ? [label] : [],
  }
}

function scoreRecentInterests(tags: string[], profile: AIContext): SignalResult {
  if (!profile.recentInterests.length) return { score: 0, matched: [] }
  const interestSet = new Set(profile.recentInterests.map(i => i.toLowerCase()))
  const matched = tags.filter(t => interestSet.has(t.toLowerCase()))
  return {
    score: matched.length > 0 ? Math.min(matched.length / MAX_RECENT_INTEREST_MATCHES, 1.0) : 0,
    matched: matched.map(t => `Search: ${t}`),
  }
}

function scorePopularity(reviewCount: number, averageRating: number): SignalResult {
  const countScore = Math.min(reviewCount / MAX_REVIEW_COUNT, 1.0)
  const ratingScore = Math.min(averageRating / 5.0, 1.0)
  const score = 0.5 * countScore + 0.5 * ratingScore
  const matched: string[] = []
  if (averageRating >= 4.0) matched.push(`${averageRating.toFixed(1)}★`)
  if (reviewCount >= 50) matched.push(`${reviewCount} reviews`)
  return { score, matched }
}

function scoreFreshness(latestReviewAt: string | null): SignalResult {
  if (!latestReviewAt) return { score: 0, matched: [] }
  const daysSince = (Date.now() - new Date(latestReviewAt).getTime()) / 86400000
  const score = Math.max(0, 1 - daysSince / MAX_FRESHNESS_DAYS)
  return {
    score,
    matched: score >= 0.5 ? ['Recently Active'] : [],
  }
}

// Returns tags from candidate that match user hiddenTopics (case-insensitive).
function findHiddenOverlap(tags: string[], profile: AIContext): string[] {
  if (!profile.hiddenTopics.length) return []
  const hiddenSet = new Set(profile.hiddenTopics.map(h => h.toLowerCase()))
  return tags.filter(t => hiddenSet.has(t.toLowerCase()))
}

// ── Explanation builder ───────────────────────────────────────────────────────

function buildExplanation(ranked: RankedRecommendation[], profile: AIContext): string[] {
  const out: string[] = []

  const affinityCount = ranked.filter(r => r.scoreBreakdown.affinity > 0).length
  const locationCount = ranked.filter(r => r.scoreBreakdown.location > 0).length
  const budgetCount = ranked.filter(r => r.scoreBreakdown.budget > 0).length
  const rejectedCount = ranked.filter(r => r.rejectedSignals.length > 0).length

  if (affinityCount > 0) {
    const topItems = [...profile.favoriteFoods, ...profile.favoriteCategories].slice(0, 2).join(', ')
    out.push(
      topItems
        ? `${affinityCount} địa điểm phù hợp sở thích (${topItems})`
        : `${affinityCount} địa điểm phù hợp sở thích của bạn`
    )
  }

  if (locationCount > 0 && profile.city) {
    out.push(`${locationCount} địa điểm gần ${profile.city}`)
  }

  if (budgetCount > 0 && profile.budget) {
    const budgetLabel =
      profile.budget === 'cheap' ? 'giá rẻ'
      : profile.budget === 'high' ? 'cao cấp'
      : 'tầm trung'
    out.push(`${budgetCount} địa điểm trong tầm ${budgetLabel}`)
  }

  if (rejectedCount > 0) {
    out.push(`${rejectedCount} địa điểm bị giảm điểm do có nội dung bạn không thích`)
  }

  return out
}

// ── Main ranking function ─────────────────────────────────────────────────────

export function rankCandidates(
  context: AIContextResult,
  candidates: CandidatePlace[]
): RecommendationResult {
  const profile = context.profile
  const scored: RankedRecommendation[] = []

  for (const candidate of candidates) {
    const affinity       = scoreAffinity(candidate, profile)
    const location       = scoreLocation(candidate.city, profile)
    const budget         = scoreBudget(candidate.priceLevel, profile)
    const recentInterest = scoreRecentInterests(candidate.tags, profile)
    const popularity     = scorePopularity(candidate.reviewCount, candidate.averageRating)
    const freshness      = scoreFreshness(candidate.latestReviewAt)

    const weightedScore =
      affinity.score       * RECOMMENDATION_WEIGHTS.affinity +
      location.score       * RECOMMENDATION_WEIGHTS.location +
      budget.score         * RECOMMENDATION_WEIGHTS.budget +
      recentInterest.score * RECOMMENDATION_WEIGHTS.recentInterests +
      popularity.score     * RECOMMENDATION_WEIGHTS.popularity +
      freshness.score      * RECOMMENDATION_WEIGHTS.freshness

    const matchedSignals = [
      ...affinity.matched,
      ...location.matched,
      ...budget.matched,
      ...recentInterest.matched,
      ...popularity.matched,
      ...freshness.matched,
    ]

    const hiddenOverlap = findHiddenOverlap(candidate.tags, profile)
    const finalScore = hiddenOverlap.length > 0
      ? Math.max(0, weightedScore - HIDDEN_TOPIC_PENALTY)
      : weightedScore

    const breakdown: ScoreBreakdown = {
      affinity: affinity.score,
      location: location.score,
      budget: budget.score,
      recentInterests: recentInterest.score,
      popularity: popularity.score,
      freshness: freshness.score,
    }

    scored.push({
      placeId: candidate.placeId,
      placeName: candidate.placeName,
      finalScore,
      matchedSignals,
      rejectedSignals: hiddenOverlap,
      scoreBreakdown: breakdown,
    })
  }

  const recommendations = scored
    .filter(r => r.finalScore >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, MAX_RECOMMENDATIONS)

  return {
    recommendations,
    explanation: buildExplanation(recommendations, profile),
    debug: {
      inputCount: candidates.length,
      outputCount: recommendations.length,
      aiContextConfidence: context.confidence,
      appliedWeights: { ...RECOMMENDATION_WEIGHTS },
    },
  }
}
