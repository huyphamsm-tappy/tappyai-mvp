import { SupabaseClient } from '@supabase/supabase-js'
import { AIContext, AIContextResult } from '@/types/aiContext'
import { UserPreferenceProfile } from '@/lib/preferences/profileBuilder'
import { getMemory, UserMemory } from '@/lib/memory/memoryService'
import { UserPrefs } from '@/lib/ai/promptBuilder'
import { DEMOGRAPHICS_COLUMNS, toDemographicsProfile, type DemographicsRow } from '@/lib/account/demographics'
import { AI_CONTEXT_FIELDS, AI_EXACT_AGE_FIELD, disallowedKeys } from '@/lib/account/userDataClassification'

// ─────────────────────────────────────────────────────────────────────────────
// MINIMUM NECESSARY AGE REPRESENTATION (§21)
//
// The band is the default because it is what personalization and the future
// audience dimension key on, and an exact age is more identifying while adding
// nothing a band does not already carry. But "band only, always" would be a
// rule about the DATA rather than about the NEED, and some future AI task may
// genuinely require the integer — an age-appropriate recommendation at the
// boundary, say, where '18_24' cannot distinguish 18 from 24.
//
// So exactness is a per-request decision that must be justified in code: an
// `'exact'` request without a `reason` is refused. That turns "explicitly
// required by the current AI use case" into a recorded fact at the call site
// instead of a habit nobody re-examines.
//
// A raw date of birth is outside this choice entirely and cannot be reached
// from here: no PostgREST role holds a privilege on the column, so neither
// builder in this file can read one to send.
// ─────────────────────────────────────────────────────────────────────────────

/** How precisely the model may be told the user's age. */
export type AgePrecision = 'band' | 'exact'

export interface AgeContextRequest {
  /** Derived band from `user_age_status()`, via the caller's 18+ gate. */
  band: string | null
  /** Derived whole years. Only ever sent when `precision` is `'exact'`. */
  exact?: number | null
  /** Defaults to `'band'`. */
  precision?: AgePrecision
  /**
   * Why this AI task needs the exact age. REQUIRED when `precision` is
   * `'exact'`; a blank reason is refused rather than defaulted.
   */
  reason?: string
}

/**
 * Resolves the age fields for one context, enforcing the minimum-necessary rule.
 *
 * Exported so the rule is testable on its own, and so a second builder cannot
 * quietly implement a looser version of it.
 */
export function resolveAgeFields(
  request: AgeContextRequest | string | null
): { ageBand: string | null; age?: number } {
  // A bare string (or null) is the common case: band only. Keeps every existing
  // caller unchanged and makes the default literally the shortest thing to write.
  if (request === null || typeof request === 'string') {
    return { ageBand: request }
  }

  const precision = request.precision ?? 'band'
  if (precision === 'band') return { ageBand: request.band }

  if (!request.reason || request.reason.trim() === '') {
    throw new Error(
      '[contextBuilder] exact age requires a stated reason — see MINIMUM NECESSARY AGE REPRESENTATION'
    )
  }

  // `exact` was asked for but the user has no age on file: send the band (also
  // null) rather than inventing a number. Asking for precision cannot conjure
  // data that does not exist.
  if (typeof request.exact !== 'number' || !Number.isFinite(request.exact)) {
    return { ageBand: request.band }
  }

  return { ageBand: request.band, age: request.exact }
}

const VERSION = 1 as const
const MIN_CONFIDENCE = 0.1
const MAX_ITEMS = 5

// Merge two string arrays: primary fills first, secondary supplements up to maxLen.
// Simple string-equality dedup — no case normalization needed for tag data.
function mergeUnique(primary: string[], secondary: string[], maxLen: number): string[] {
  const seen = new Set(primary)
  const out = primary.slice(0, maxLen)
  for (const item of secondary) {
    if (out.length >= maxLen) break
    if (!seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

export async function buildAIContext(
  userId: string,
  supabase: SupabaseClient,
  /**
   * The age the model may be told about, from the caller that already ran the
   * 18+ gate. Passed rather than re-read so there is exactly one RPC per request
   * and exactly one place that derives a band — two derivations are how Web and
   * Android would come to disagree about the same user.
   *
   * A bare string is the band, which is the default and what every current
   * caller passes. An `AgeContextRequest` with `precision: 'exact'` and a stated
   * `reason` is how a use case that genuinely needs the integer asks for it.
   */
  age: AgeContextRequest | string | null = null
): Promise<AIContextResult | null> {
  // Resolved FIRST, before any database work: an unjustified request for exact
  // age is a programming error, and it should fail on the line that made it
  // rather than after three round trips.
  const ageFields = resolveAgeFields(age)
  // Read preference_profile, user_memory, the canonical name and the private
  // demographic row in parallel — only what we need, named column by column.
  //
  // `user_demographics` is selected by an explicit column list because `*`
  // expands to `date_of_birth`, on which no PostgREST role holds a privilege;
  // `select('*')` would be denied with 42501. That denial is the schema saying
  // out loud that a date of birth cannot reach this function, and therefore
  // cannot reach a prompt.
  const [prefRes, memRes, profileRes, demoRes] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('preference_profile')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('user_memory')
      .select('location_base, preferences, companions, timing, personality, history')
      .eq('user_id', userId)
      .maybeSingle(),

    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle(),

    supabase
      .from('user_demographics')
      .select(DEMOGRAPHICS_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const rawProfile = prefRes.data?.preference_profile as unknown as UserPreferenceProfile | null | undefined
  if (!rawProfile || rawProfile.confidenceScore < MIN_CONFIDENCE) return null

  const memory = (memRes.data ?? null) as UserMemory | null

  // city: what the user TOLD us first, then behavioural inference, then memory.
  // The order changed in V3: an explicitly stated profile city is a fact, while
  // `rawProfile.city` is inferred from where their reviewed places happen to be,
  // and an inference should not overwrite a statement.
  const statedCity = (demoRes.data as unknown as DemographicsRow | null)?.city ?? null
  const city = statedCity || rawProfile.city || memory?.location_base || null

  // budget: profile-level string ('cheap' | 'mid' | 'high') — simpler and more reliable
  // than per-category budget ranges from memory
  const budget = rawProfile.budget ?? null

  // favoriteFoods: affinity-enriched behavioral data first; supplement from memory
  const memoryFoods = memory?.preferences?.food ?? []
  const favoriteFoods = mergeUnique(
    rawProfile.favoriteFoods,
    memoryFoods,
    MAX_ITEMS
  )

  // favoriteCategories: purely behavioral — no equivalent in user_memory
  const favoriteCategories = rawProfile.favoriteCategories.slice(0, MAX_ITEMS)

  // recentInterests: search queries (profile) + conversation topics (memory.history)
  const memoryHistory = memory?.history ?? []
  const recentInterests = mergeUnique(
    rawProfile.recentInterests,
    memoryHistory.slice().reverse(), // most recent conversation topics first
    MAX_ITEMS
  )

  // hiddenTopics: profile.hiddenTopics is always [] until Phase 5+
  // memory.preferences.avoid is the live source for now
  const avoidList = memory?.preferences?.avoid ?? []
  const hiddenTopics = mergeUnique(
    rawProfile.hiddenTopics,
    avoidList,
    MAX_ITEMS
  )

  const demographics = toDemographicsProfile(demoRes.data as unknown as DemographicsRow | null)

  const profile: AIContext = {
    preferredName: (profileRes.data?.full_name as string | null) || null,
    ...ageFields,
    // `prefer_not_to_say` is an answer, not a value to pass on: the user
    // declined the question, so the model is told nothing rather than told they
    // declined.
    gender: demographics.gender && demographics.gender !== 'prefer_not_to_say'
      ? demographics.gender
      : null,
    country: demographics.country,
    city,
    budget,
    favoriteFoods,
    favoriteCategories,
    recentInterests,
    travelStyle: rawProfile.preferredTravelStyle ?? [],
    hiddenTopics,
    companions: memory?.companions ?? null,
    timing: memory?.timing ?? null,
    personality: memory?.personality ?? null,
  }

  // §21 — the AI context boundary, asserted rather than assumed.
  //
  // `AIContext` is a TypeScript interface, and a TypeScript interface is gone at
  // runtime: a spread of a database row into this object would type-check as
  // excess-property-free and ship a date of birth to a model. This check is the
  // one that actually runs. It throws rather than strips, because an unexpected
  // key here means a caller built the object wrongly, and silently sending a
  // smaller prompt would hide that until someone read a log.
  const leaked = disallowedKeys(profile, AI_CONTEXT_FIELDS)
  if (leaked.length > 0) {
    // Names only — never values. This message can reach an ordinary log.
    throw new Error(`[contextBuilder] fields not permitted in AI context: ${leaked.join(', ')}`)
  }

  // The allowlist says `age` is PERMISSIBLE; this says it was actually ASKED
  // for. Without this second check a band-only request that somehow produced an
  // exact age would pass, because `age` is a legal key — which is exactly the
  // gap that makes "minimum necessary" different from "allowed at all".
  if (ageFields.age === undefined && AI_EXACT_AGE_FIELD in profile) {
    throw new Error('[contextBuilder] exact age present in a band-only context')
  }

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    confidence: rawProfile.confidenceScore,
    profile,
  }
}

/**
 * The minimal identity the Chat prompt is allowed to know about the user.
 *
 * Four fields, each with a stated reason to exist. This is the whole of it —
 * there is no "and whatever else is on the row", which is what §21 forbids.
 */
export interface AIIdentityContext {
  /** So the assistant can address the user. `profiles.full_name`. */
  preferredName: string | null
  /** Derived band — the default representation. Never a date. */
  ageBand: string | null
  /** Exact years, only when the caller asked for `'exact'` with a reason. */
  age?: number
  /** Self-declared; `prefer_not_to_say` is passed on as null. */
  gender: string | null
  /** Stated profile city — a durable preference, not the device's GPS fix. */
  city: string | null
}

export interface ChatPromptContext {
  memory: UserMemory | null
  prefs: UserPrefs | null
  identity: AIIdentityContext
}

/** The identity of a user who has told us nothing. Exported so a caller that
 *  cannot build one (a failed read) uses the same object rather than its own. */
export const EMPTY_IDENTITY: AIIdentityContext = Object.freeze({
  preferredName: null, ageBand: null, gender: null, city: null,
})

/**
 * Renders the identity block appended to the Chat system prompt.
 *
 * Returns '' when there is nothing to say, so a user who has told us nothing
 * costs no prompt tokens and the model is not handed a list of blanks to
 * speculate about.
 *
 * Unfenced, unlike `user_preferences`: every value here is either chosen from a
 * closed set (band, gender) or already rendered into the product's own UI
 * (name, city). The freeform fields that DO need `fenceUntrusted` still get it
 * at their own call site in the route.
 */
export function buildIdentityBlock(identity: AIIdentityContext): string {
  const parts: string[] = []
  if (identity.preferredName) parts.push(`- Ten goi: ${identity.preferredName}`)
  if (identity.city) parts.push(`- Thanh pho: ${identity.city}`)
  // Exact age when the caller justified it; otherwise the band. Never both —
  // printing both would hand the model the same fact twice and make the
  // minimum-necessary decision invisible in the prompt.
  if (typeof identity.age === 'number') parts.push(`- Tuoi: ${identity.age}`)
  else if (identity.ageBand) parts.push(`- Nhom tuoi: ${AGE_BAND_LABEL[identity.ageBand] ?? identity.ageBand}`)
  if (identity.gender) parts.push(`- Gioi tinh: ${GENDER_LABEL[identity.gender] ?? identity.gender}`)
  if (parts.length === 0) return ''
  return '\n\n===== THONG TIN NGUOI DUNG =====\n' + parts.join('\n')
}

/** Bands rendered as ranges the model can reason about, not as internal keys. */
const AGE_BAND_LABEL: Record<string, string> = {
  '18_24': '18-24', '25_34': '25-34', '35_44': '35-44',
  '45_54': '45-54', '55_64': '55-64', '65_plus': '65+',
  // `under_18` is deliberately absent: an under-18 user cannot reach Chat, so a
  // label for them would describe a state this code path cannot be in.
}

const GENDER_LABEL: Record<string, string> = {
  female: 'nu', male: 'nam', other: 'khac',
}

// Raw inputs for the Chat Route's system prompt (formatted downstream by
// promptBuilder's buildMemoryBlock/buildPrefBlock) — single fetch owned here
// instead of duplicated inline in the route.
export async function buildChatPromptContext(
  userId: string,
  supabase: SupabaseClient,
  /**
   * From the 18+ gate the route has already run — see `buildAIContext`.
   * A bare string is the band. Chat passes the band: conversational
   * recommendation has no evidenced need for the exact integer, and under the
   * minimum-necessary rule "no stated need" means the band.
   */
  age: AgeContextRequest | string | null = null
): Promise<ChatPromptContext> {
  const ageFields = resolveAgeFields(age)
  const [memory, prefResult, profileResult, demoResult] = await Promise.all([
    // Pass the request-scoped client so memory reads work under Bearer-token
    // (native) auth, where a fresh cookie client would have no session.
    getMemory(userId, supabase),
    supabase
      .from('user_preferences')
      .select('budget_level, cuisine_likes, dietary_restrictions, inferred_preferences')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle(),
    // Explicit column list: `*` expands to `date_of_birth` and would be denied.
    supabase
      .from('user_demographics')
      .select(DEMOGRAPHICS_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const demographics = toDemographicsProfile(demoResult.data as unknown as DemographicsRow | null)

  const identity: AIIdentityContext = {
    preferredName: (profileResult.data?.full_name as string | null) || null,
    ...ageFields,
    gender: demographics.gender && demographics.gender !== 'prefer_not_to_say'
      ? demographics.gender
      : null,
    city: demographics.city,
  }

  // Same runtime assertion as `buildAIContext`, for the same reason: the
  // interface above is erased at runtime and cannot stop a spread.
  const leaked = disallowedKeys(identity, AI_CONTEXT_FIELDS)
  if (leaked.length > 0) {
    throw new Error(`[contextBuilder] fields not permitted in AI identity: ${leaked.join(', ')}`)
  }
  if (ageFields.age === undefined && AI_EXACT_AGE_FIELD in identity) {
    throw new Error('[contextBuilder] exact age present in a band-only identity')
  }

  return {
    memory,
    prefs: (prefResult.data as UserPrefs | null) ?? null,
    identity,
  }
}
