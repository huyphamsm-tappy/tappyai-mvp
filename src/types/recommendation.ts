// Types for the Recommendation Engine (Phase 5).
// CandidatePlace is the input contract — callers must hydrate places to this shape
// before passing to rankCandidates(). The engine itself does not query the database.

export interface CandidatePlace {
  placeId: string
  placeName: string
  city: string                  // compared against AIContext.profile.city for Location signal
  tags: string[]                // review hashtags — used for Affinity + Recent Interests signals
  priceLevel: number | null     // 1–4 (Google Places scale) — used for Budget signal
  reviewCount: number           // used for Popularity signal
  averageRating: number         // 0–5 — used for Popularity signal
  latestReviewAt: string | null // ISO timestamp — used for Freshness signal
  savedByUser?: boolean         // user explicitly saved this place — used for Affinity signal
}

// Raw sub-scores before weights are applied. Each value is 0–1.
export interface ScoreBreakdown {
  affinity: number
  location: number
  budget: number
  recentInterests: number
  popularity: number
  freshness: number
}

export interface RankedRecommendation {
  placeId: string
  placeName: string
  finalScore: number        // 0–1, weighted sum minus any hidden-topic penalty
  matchedSignals: string[]  // e.g. ["Korean BBQ", "Near Quận 3", "Budget Friendly", "4.5★"]
  rejectedSignals: string[] // e.g. ["fast food"] — tags overlapping user hiddenTopics
  scoreBreakdown: ScoreBreakdown
}

export interface RecommendationDebug {
  inputCount: number           // total candidates passed in
  outputCount: number          // candidates that survived MIN_SCORE_THRESHOLD
  aiContextConfidence: number  // from AIContextResult.confidence
  appliedWeights: Record<string, number>
}

export interface RecommendationResult {
  recommendations: RankedRecommendation[]
  explanation: string[]   // root-level summary e.g. ["3 phù hợp sở thích ẩm thực", "2 gần Quận 3"]
  debug: RecommendationDebug
}
