// Compact AI context injected into LLM prompts.
// Built by contextBuilder.ts from preference_profile + user_memory.
// Max 5 items per array to keep token budget tight.

export interface AIContext {
  city: string | null
  budget: string | null          // 'cheap' | 'mid' | 'high' | null
  favoriteFoods: string[]        // max 5 — behavioral (affinity-enriched) + memory supplement
  favoriteCategories: string[]   // max 5 — behavioral, affinity-enriched
  recentInterests: string[]      // max 5 — search queries + conversation history
  travelStyle: string[]          // from user_preferences.preferred_style
  hiddenTopics: string[]         // max 5 — from user_memory.preferences.avoid
  companions: string | null      // "thường đi với bạn bè" — conversational extraction
  timing: string | null          // "hay đi cuối tuần" — conversational extraction
  personality: string | null     // "thích local quán nhỏ" — conversational extraction
}

export interface AIContextResult {
  version: 1                     // literal — increment when schema changes
  generatedAt: string            // ISO timestamp — for cache invalidation
  confidence: number             // 0.0–1.0 from preference profile
  profile: AIContext
}
