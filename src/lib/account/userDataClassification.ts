// ─────────────────────────────────────────────────────────────────────────────
// Data classification for canonical user data, and the per-consumer allowlists
// derived from it.
//
// This file exists so that "DOB must never reach AI / analytics / logs / public
// APIs" is a checkable statement rather than a convention. Every boundary in the
// V3 User Data Foundation reads its allowlist from here, and the tests assert
// against the same tables — so adding a field without deciding where it may go
// fails the build instead of quietly inheriting the most permissive answer.
//
// ── THE RULE THAT MAKES THIS WORK ────────────────────────────────────────────
// A field with no classification is treated as HIGHLY_SENSITIVE, not as
// unclassified. Silence is the strictest answer, never the loosest. This is the
// same principle ADR-019 applies to grants ("a function that says nothing about
// grants is OPEN, not closed") — inverted, because here we control the default.
// ─────────────────────────────────────────────────────────────────────────────

/** §19 classification tiers, strictest first. */
export type DataClass =
  /** DOB, email, phone, auth identifiers, billing identifiers. */
  | 'HIGHLY_SENSITIVE'
  /** Age, gender, city, country, occupation, education, preferences. */
  | 'PERSONAL_PROFILE'
  /** Searches, views, clicks, follows, purchases. */
  | 'BEHAVIORAL'
  /** Affinities, intents, audience membership. Protected, never public. */
  | 'DERIVED_SIGNAL'
  /** Explicitly intended to be visible to other users. */
  | 'PUBLIC_PROFILE'

/**
 * Every canonical user field this foundation knows about, by its wire name.
 *
 * Names are the ones that actually appear on a boundary — the database column,
 * or the JSON key where those differ — because a classification keyed on a name
 * nothing uses would check nothing.
 */
export const USER_FIELD_CLASS: Readonly<Record<string, DataClass>> = Object.freeze({
  // ── HIGHLY SENSITIVE ──────────────────────────────────────────────────────
  // No PostgREST role holds a privilege on the first three (see the migration).
  date_of_birth: 'HIGHLY_SENSITIVE',
  dateOfBirth: 'HIGHLY_SENSITIVE',
  dob: 'HIGHLY_SENSITIVE',
  age_declared_at: 'HIGHLY_SENSITIVE',
  dob_corrections: 'HIGHLY_SENSITIVE',
  email: 'HIGHLY_SENSITIVE',
  phone: 'HIGHLY_SENSITIVE',
  password: 'HIGHLY_SENSITIVE',
  access_token: 'HIGHLY_SENSITIVE',
  refresh_token: 'HIGHLY_SENSITIVE',
  stripe_customer_id: 'HIGHLY_SENSITIVE',
  // Precise coordinates. Profile city/country are a different, coarser thing.
  latitude: 'HIGHLY_SENSITIVE',
  longitude: 'HIGHLY_SENSITIVE',

  // ── PERSONAL PROFILE ──────────────────────────────────────────────────────
  age: 'PERSONAL_PROFILE',
  age_band: 'PERSONAL_PROFILE',
  ageBand: 'PERSONAL_PROFILE',
  gender: 'PERSONAL_PROFILE',
  gender_self_describe: 'PERSONAL_PROFILE',
  genderSelfDescribe: 'PERSONAL_PROFILE',
  city: 'PERSONAL_PROFILE',
  country: 'PERSONAL_PROFILE',
  occupation: 'PERSONAL_PROFILE',
  industry: 'PERSONAL_PROFILE',
  education_level: 'PERSONAL_PROFILE',
  educationLevel: 'PERSONAL_PROFILE',
  language: 'PERSONAL_PROFILE',
  bio: 'PERSONAL_PROFILE',
  onboarded: 'PERSONAL_PROFILE',

  // Stated or conversationally extracted personal context. Not demographic,
  // but personal all the same — "usually goes with friends" describes a life,
  // not a preference for a colour.
  budget: 'PERSONAL_PROFILE',
  travelStyle: 'PERSONAL_PROFILE',
  companions: 'PERSONAL_PROFILE',
  timing: 'PERSONAL_PROFILE',
  personality: 'PERSONAL_PROFILE',

  // ── BEHAVIORAL ────────────────────────────────────────────────────────────
  event_type: 'BEHAVIORAL',
  session_id: 'BEHAVIORAL',
  recent_searches: 'BEHAVIORAL',
  recentInterests: 'BEHAVIORAL',

  // ── DERIVED SIGNALS ───────────────────────────────────────────────────────
  preference_profile: 'DERIVED_SIGNAL',
  favoriteFoods: 'DERIVED_SIGNAL',
  favoriteCategories: 'DERIVED_SIGNAL',
  confidenceScore: 'DERIVED_SIGNAL',
  hiddenTopics: 'DERIVED_SIGNAL',

  // ── PUBLIC PROFILE ────────────────────────────────────────────────────────
  // The complete set. Anything not listed here is not public, by default.
  id: 'PUBLIC_PROFILE',
  // The AI context's name for `profiles.full_name`, which is already public.
  preferredName: 'PUBLIC_PROFILE',
  full_name: 'PUBLIC_PROFILE',
  avatar_url: 'PUBLIC_PROFILE',
  follower_count: 'PUBLIC_PROFILE',
  following_count: 'PUBLIC_PROFILE',
  review_count: 'PUBLIC_PROFILE',
})

/** Unclassified means HIGHLY_SENSITIVE. Silence is the strictest answer. */
export function classifyField(name: string): DataClass {
  return USER_FIELD_CLASS[name] ?? 'HIGHLY_SENSITIVE'
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-CONSUMER ALLOWLISTS (§29 — every consumer receives only what it needs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §22 — the public profile boundary. Exactly the columns
 * `GET /api/users/[id]` and `GET /api/users/search` already return; this
 * foundation adds NOTHING to them. Demographic and professional data is private
 * by default and no product decision has been taken to publish any of it.
 */
export const PUBLIC_PROFILE_FIELDS: readonly string[] = Object.freeze([
  'id', 'full_name', 'avatar_url', 'follower_count', 'following_count', 'review_count',
])

/**
 * What the authenticated OWNER receives about themselves from `/api/profile`.
 * Shared verbatim by Web and Android.
 *
 * `date_of_birth` is deliberately absent. The owner does not need the raw date
 * back to manage their profile: the derived `age` / `ageBand` answer every
 * question the profile UI asks, and the correction flow collects a fresh date
 * rather than pre-filling one. Withholding it is what allows the column to be
 * granted to no PostgREST role at all, which is what makes the 18+ gate
 * un-clearable by its subject. §27 permits raw DOB to the owner only where they
 * "genuinely need it for profile management" — they do not.
 */
export const OWNER_PROFILE_FIELDS: readonly string[] = Object.freeze([
  'full_name', 'avatar_url', 'email', 'bio', 'language', 'onboarded',
  'age', 'ageBand', 'ageStatus', 'canCorrectAge',
  'gender', 'genderSelfDescribe', 'city', 'country',
  'occupation', 'industry', 'educationLevel',
])

/**
 * §21 — the AI context boundary. The model receives these keys and no others.
 *
 * ── MINIMUM NECESSARY AGE REPRESENTATION ────────────────────────────────────
 *
 * Both `ageBand` and `age` appear here, and that is not the same as saying both
 * may be sent. Membership of this list makes a key *permissible*; which of the
 * two is actually included is decided per request by `AgePrecision`
 * (`contextBuilder.ts`), which defaults to `'band'`.
 *
 *   band   — the default, and what every current AI use case receives. It is
 *            what personalization and the future audience dimension key on.
 *   exact  — the derived integer age, included ONLY when the call site declares
 *            a reason. `buildAIContext` refuses an `'exact'` request that
 *            carries no reason, so "explicitly required" is a recorded fact at
 *            the call site rather than a habit.
 *
 * A raw date of birth is in neither case reachable: no PostgREST role holds a
 * privilege on the column, so the context builder cannot read one to send.
 *
 * `preferredName` is new: the model previously received no name at all, so it
 * could not address the user. It is the profile's `full_name`, which is already
 * PUBLIC_PROFILE data.
 */
export const AI_CONTEXT_FIELDS: readonly string[] = Object.freeze([
  'preferredName',
  'ageBand', 'age', 'gender', 'city', 'country',
  'budget', 'favoriteFoods', 'favoriteCategories', 'recentInterests',
  'travelStyle', 'hiddenTopics', 'companions', 'timing', 'personality',
])

/**
 * The keys carrying an age, in increasing precision. Used by the context
 * builder's own assertion that a `'band'` request did not somehow produce an
 * exact age.
 */
export const AI_EXACT_AGE_FIELD = 'age' as const

/**
 * Keys that must NEVER appear anywhere in an analytics event, at any depth.
 *
 * The ingestion route already rejects an event whose `metadata` matches an
 * email or phone pattern (`/api/track`). That is a VALUE check and it cannot
 * see a date of birth, which looks like any other date. This is the KEY check
 * that closes the same door from the other side.
 */
export const ANALYTICS_FORBIDDEN_KEYS: readonly string[] = Object.freeze([
  'date_of_birth', 'dateOfBirth', 'dob', 'age_declared_at', 'dob_corrections',
  'email', 'phone', 'password', 'access_token', 'refresh_token',
  'stripe_customer_id', 'latitude', 'longitude',
])

/**
 * Keys that must never be written to an ordinary application log.
 * Same set as analytics, plus the derived age — a log line carrying an exact
 * age alongside a user id is a demographic record in a place with no retention
 * policy and no access control.
 */
export const LOG_FORBIDDEN_KEYS: readonly string[] = Object.freeze([
  ...ANALYTICS_FORBIDDEN_KEYS, 'age',
])

// ─────────────────────────────────────────────────────────────────────────────
// ENFORCEMENT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the keys of `obj` that are not in `allowed`, searching nested plain
 * objects and arrays.
 *
 * Recursion matters: the leak this guards against is not a top-level `email`
 * key — nobody writes that by accident — it is a whole row spread into a nested
 * `profile` or `user` property, which a shallow check reads as one allowed key.
 */
export function disallowedKeys(
  value: unknown,
  allowed: readonly string[],
  depth = 0
): string[] {
  if (depth > 8 || value === null || typeof value !== 'object') return []
  const allowSet = new Set(allowed)
  const found: string[] = []

  const walk = (node: unknown, d: number) => {
    if (d > 8 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, d + 1)
      return
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (!allowSet.has(key)) found.push(key)
      walk(child, d + 1)
    }
  }

  walk(value, depth)
  return [...new Set(found)]
}

/**
 * Returns any forbidden key present in `value`, at any depth.
 * Used by the analytics and logging boundaries, where the question is "is
 * anything banned in here", not "is everything in here permitted".
 */
export function forbiddenKeysPresent(
  value: unknown,
  forbidden: readonly string[]
): string[] {
  const banned = new Set(forbidden)
  const found: string[] = []

  const walk = (node: unknown, d: number) => {
    if (d > 8 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, d + 1)
      return
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (banned.has(key)) found.push(key)
      walk(child, d + 1)
    }
  }

  walk(value, 0)
  return [...new Set(found)]
}

/**
 * Removes forbidden keys from an analytics payload, at any depth.
 *
 * Strips rather than throws, and returns what it removed. Analytics is
 * best-effort by design (`tracker.ts` fails silently), so a throw here would
 * turn a privacy guard into an availability bug; but a silent strip with no
 * record would hide a caller that is trying to send a date of birth. The
 * caller logs the returned names — never the values.
 */
export function stripForbiddenKeys<T>(
  payload: T,
  forbidden: readonly string[] = ANALYTICS_FORBIDDEN_KEYS
): { value: T; removed: string[] } {
  const banned = new Set(forbidden)
  const removed: string[] = []

  const clean = (node: unknown, d: number): unknown => {
    if (d > 8 || node === null || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map((item) => clean(item, d + 1))
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (banned.has(key)) { removed.push(key); continue }
      out[key] = clean(child, d + 1)
    }
    return out
  }

  return { value: clean(payload, 0) as T, removed: [...new Set(removed)] }
}
