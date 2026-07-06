// All configurable values for the Recommendation Engine.
// Change here to affect scoring, filtering, and penalty behavior across the entire engine.

// Scoring weights per signal. Must conceptually sum to 1.0.
// If a signal is unavailable (null city, missing budget), it contributes 0.
// Weights are NOT redistributed — scoring stays simple and explainable.
export const RECOMMENDATION_WEIGHTS = {
  affinity: 0.35,        // tag overlap with favoriteFoods + favoriteCategories (affinity-enriched)
  location: 0.20,        // city match between place and user base location
  budget: 0.15,          // price level match with user budget preference
  recentInterests: 0.15, // tag overlap with recent search queries / conversation history
  popularity: 0.10,      // normalized reviewCount + averageRating
  freshness: 0.05,       // recency of the latest review on this place
} as const

// Maps user budget level → acceptable place price levels (Google Places scale: 1=cheapest, 4=most expensive)
export const BUDGET_LEVEL_MAP: Record<string, number[]> = {
  cheap: [1, 2],
  mid: [2, 3],
  high: [3, 4],
}

// Subtracted from finalScore when a candidate's tags overlap with user hiddenTopics.
// Applied once regardless of overlap count. finalScore = max(0, weightedScore - penalty).
export const HIDDEN_TOPIC_PENALTY = 0.30

// Normalization ceiling for reviewCount. Places with more reviews than this still get score 1.0.
export const MAX_REVIEW_COUNT = 500

// Places whose latestReviewAt is older than this many days receive freshness score = 0.
export const MAX_FRESHNESS_DAYS = 90

// Number of tag matches needed to reach full affinity score (1.0). Fewer = proportionally less.
export const MAX_AFFINITY_TAG_MATCHES = 3

// Number of tag matches needed to reach full recent-interests score (1.0).
export const MAX_RECENT_INTEREST_MATCHES = 2

// Candidates scoring below this final threshold are excluded from recommendations.
export const MIN_SCORE_THRESHOLD = 0.05

// Maximum number of ranked recommendations returned.
export const MAX_RECOMMENDATIONS = 10
