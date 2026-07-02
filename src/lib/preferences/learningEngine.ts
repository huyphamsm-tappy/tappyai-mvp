import { RawSignals } from './signalCollector'
import { WEIGHTS, DECAY, MAX_EXPECTED_POINTS, FOOD_KEYWORDS } from './config'

export interface WeightedSignals {
  categoryScores: Map<string, number> // non-food hashtags → weighted score
  foodScores: Map<string, number>     // food hashtags → weighted score
  cityScores: Map<string, number>     // city → weighted score
  activeInterests: string[]           // deduplicated recent search queries
  totalWeightedPoints: number
  confidenceScore: number             // 0.0–1.0
}

// Pure function — returns the decay multiplier for a given timestamp.
function decayFactor(timestamp: string, nowMs: number): number {
  const ageDays = (nowMs - new Date(timestamp).getTime()) / 86400000
  for (const bucket of DECAY) {
    if (ageDays <= bucket.maxDays) return bucket.factor
  }
  return DECAY[DECAY.length - 1].factor
}

function isFoodTag(tag: string): boolean {
  const lower = tag.toLowerCase()
  return FOOD_KEYWORDS.some(kw => lower.includes(kw))
}

// Pure function — applies weights × decay to every event, then aggregates scores.
export function computeWeightedSignals(raw: RawSignals): WeightedSignals {
  const categoryScores = new Map<string, number>()
  const foodScores = new Map<string, number>()
  const cityScores = new Map<string, number>()
  let totalWeightedPoints = 0
  const nowMs = Date.now()

  for (const event of raw.events) {
    const baseWeight = WEIGHTS[event.type]
    const decay = decayFactor(event.timestamp, nowMs)
    const points = baseWeight * decay

    totalWeightedPoints += points

    // City: accumulate weighted points per city
    if (event.city) {
      cityScores.set(event.city, (cityScores.get(event.city) || 0) + points)
    }

    // Tags: split into food vs. general category
    for (const tag of event.tags) {
      if (isFoodTag(tag)) {
        foodScores.set(tag, (foodScores.get(tag) || 0) + points)
      } else {
        categoryScores.set(tag, (categoryScores.get(tag) || 0) + points)
      }
    }
  }

  // Repeated interaction with the same category naturally increases both its score
  // and totalWeightedPoints, raising confidence — no separate mechanism needed.
  const confidenceScore = Math.min(totalWeightedPoints / MAX_EXPECTED_POINTS, 1.0)

  return {
    categoryScores,
    foodScores,
    cityScores,
    activeInterests: raw.recentSearches,
    totalWeightedPoints,
    confidenceScore,
  }
}
