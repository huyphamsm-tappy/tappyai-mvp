// Compact AI context injected into LLM prompts.
// Built by contextBuilder.ts from preference_profile + user_memory.
// Max 5 items per array to keep token budget tight.

export interface AIContext {
  /**
   * What to call the user — `profiles.full_name`, already PUBLIC_PROFILE data.
   *
   * New in V3. The model previously received no name at all and so could not
   * address the user by one. This is a PREFERRED name, not a legal identity;
   * nothing in this codebase collects or stores a legal name.
   */
  preferredName: string | null
  /**
   * Derived age band ('18_24', '25_34', …). The DEFAULT age representation, and
   * what every current AI use case receives.
   */
  ageBand: string | null
  /**
   * Derived whole years — the MINIMUM-NECESSARY escape hatch, present only when
   * the call site asked for `precision: 'exact'` AND stated a reason
   * (`resolveAgeFields`). Absent, not null, when it was not asked for: a key
   * that is not there cannot be read as "we know but withheld".
   *
   * Never the date it came from — no database role can read that column.
   */
  age?: number
  /** Self-declared, one of the four `GENDER_VALUES`. Null when never asked. */
  gender: string | null
  /** Profile country (ISO-3166-1 alpha-2), distinct from device/GPS location. */
  country: string | null
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
