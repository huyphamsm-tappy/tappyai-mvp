import { WeightedSignals } from './learningEngine'

export interface UserPreferenceProfile {
  city: string
  budget: string | null              // 'cheap' | 'mid' | 'high' | null
  favoriteFoods: string[]            // top food-tagged hashtags by weighted score
  favoriteCategories: string[]       // top non-food hashtags/categories by weighted score
  favoritePriceRange: { min: number | null; max: number | null }
  recentInterests: string[]          // recent deduplicated search queries
  hiddenTopics: string[]             // empty — Phase 1/2
  preferredTravelStyle: string[]     // from user_preferences.preferred_style
  confidenceScore: number            // 0.0–1.0 from Learning Engine
}

function topEntries(map: Map<string, number>, n: number): string[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}

export function buildProfile(
  weighted: WeightedSignals,
  existingPrefs?: {
    budget_level?: string | null
    budget_min?: number | null
    budget_max?: number | null
    preferred_style?: string[] | null
  }
): UserPreferenceProfile {
  return {
    city: topEntries(weighted.cityScores, 1)[0] || '',
    budget: existingPrefs?.budget_level ?? null,
    favoriteFoods: topEntries(weighted.foodScores, 5),
    favoriteCategories: topEntries(weighted.categoryScores, 5),
    favoritePriceRange: {
      min: existingPrefs?.budget_min ?? null,
      max: existingPrefs?.budget_max ?? null,
    },
    recentInterests: weighted.activeInterests,
    hiddenTopics: [],
    preferredTravelStyle: existingPrefs?.preferred_style ?? [],
    confidenceScore: weighted.confidenceScore,
  }
}
