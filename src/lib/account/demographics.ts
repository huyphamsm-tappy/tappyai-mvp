import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Canonical demographic + professional profile — the owner's own read/write.
//
// Table: `public.user_demographics`, a 1:1 companion to `public.profiles` keyed
// on the same id. ONE canonical identity, ONE canonical profile; this holds the
// attributes that cannot live on `profiles` because that table is public-read
// and self-write (see the migration header for the production measurement).
//
// `date_of_birth` is NOT handled here. It has no PostgREST grant at all and is
// reachable only through the two SECURITY DEFINER functions wrapped by
// `ageEligibility.ts`. Keeping the two modules apart is deliberate: everything
// in this file is ordinary user-editable profile data, and nothing in it can
// influence the 18+ decision.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The columns `authenticated` is granted SELECT on.
 *
 * Named explicitly and never `*`: `*` expands to `date_of_birth`, on which no
 * client role holds a privilege, so `select('*')` is denied with 42501. Same
 * constraint, and the same reason, as `ACCOUNT_STATUS_COLUMNS`.
 */
export const DEMOGRAPHICS_COLUMNS =
  'gender, gender_self_describe, city, country, occupation, industry, education_level'

/**
 * Gender options.
 *
 * Deliberately not binary. The value this replaces
 * (`auth.users.raw_user_meta_data ->> 'gender'`, written client-side from the
 * preferences page) offered only `male` and `female`, so a user who was neither
 * had no correct answer and no way to decline the question.
 *
 * `prefer_not_to_say` is a stored answer, distinct from `null`. Null means never
 * asked; `prefer_not_to_say` means asked and declined, and re-prompting someone
 * who has already declined is the behaviour that distinction exists to prevent.
 */
export const GENDER_VALUES = ['female', 'male', 'other', 'prefer_not_to_say'] as const
export type Gender = (typeof GENDER_VALUES)[number]

export interface DemographicsRow {
  gender: string | null
  gender_self_describe: string | null
  city: string | null
  country: string | null
  occupation: string | null
  industry: string | null
  education_level: string | null
}

/** Camel-cased owner projection, shared verbatim by Web and Android. */
export interface DemographicsProfile {
  gender: Gender | null
  genderSelfDescribe: string | null
  city: string | null
  country: string | null
  occupation: string | null
  industry: string | null
  educationLevel: string | null
}

export const EMPTY_DEMOGRAPHICS: DemographicsProfile = Object.freeze({
  gender: null, genderSelfDescribe: null, city: null, country: null,
  occupation: null, industry: null, educationLevel: null,
})

export function toDemographicsProfile(row: DemographicsRow | null | undefined): DemographicsProfile {
  if (!row) return EMPTY_DEMOGRAPHICS
  return {
    gender: (GENDER_VALUES as readonly string[]).includes(row.gender ?? '')
      ? (row.gender as Gender)
      : null,
    // A self-description without `other` selected is not a state the CHECK
    // constraint permits, so it can only be stale data. Dropped rather than
    // shown, so the UI never renders a description next to a contradicting label.
    genderSelfDescribe: row.gender === 'other' ? (row.gender_self_describe ?? null) : null,
    city: row.city ?? null,
    country: row.country ?? null,
    occupation: row.occupation ?? null,
    industry: row.industry ?? null,
    educationLevel: row.education_level ?? null,
  }
}

/**
 * Reads the caller's own demographic row.
 *
 * Never throws and never blocks the profile surface: a failure returns the empty
 * profile and logs, so a signed-in user still sees their name, avatar and
 * settings when this one table is unreachable. Unlike the age gate this carries
 * no access decision, so there is nothing to fail closed about.
 */
export async function getDemographics(
  supabase: SupabaseClient,
  userId: string
): Promise<DemographicsProfile> {
  try {
    const { data, error } = await supabase
      .from('user_demographics')
      .select(DEMOGRAPHICS_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[demographics] read failed:', error.code ?? error.message)
      return EMPTY_DEMOGRAPHICS
    }
    return toDemographicsProfile(data as unknown as DemographicsRow | null)
  } catch (e) {
    console.error('[demographics] read threw:', e instanceof Error ? e.message : e)
    return EMPTY_DEMOGRAPHICS
  }
}

/**
 * Narrows the canonical gender to the two values the suggested-prompt engine
 * understands (`getDynamicPrompts`).
 *
 * `other` and `prefer_not_to_say` both map to null, which is the engine's
 * "no gendered variant" path — the same result those users got before, when the
 * only stored values were `male` and `female`. Widening the prompt engine to
 * recognise them is a PRODUCT DECISION about copy, not a data problem, and is
 * deliberately not taken here.
 */
export function toPromptGender(gender: Gender | null): 'male' | 'female' | null {
  return gender === 'male' || gender === 'female' ? gender : null
}

/** Bounds mirror the CHECK constraints; the database is the backstop, not the gate. */
const MAX_LEN = {
  gender_self_describe: 60,
  city: 80,
  occupation: 80,
  industry: 80,
  education_level: 80,
} as const

function text(value: unknown, max: number): string | null | undefined {
  if (value === null) return null          // explicit clear (§30 — delete a field)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

/**
 * Validates a PATCH body into a column update.
 *
 * `undefined` means "not present in the request, leave alone"; `null` means
 * "the user cleared this field". Collapsing the two would make every partial
 * update wipe the fields it did not mention — which is what a client sending
 * only `{ city }` would otherwise do to a user's occupation.
 *
 * Returns `null` when the body contains no demographic field at all, so callers
 * can skip the write entirely rather than issuing an empty UPDATE.
 */
export function buildDemographicsUpdate(
  body: Record<string, unknown>
): Record<string, string | null> | null {
  const updates: Record<string, string | null> = {}

  if ('gender' in body) {
    const g = body.gender
    if (g === null) {
      updates.gender = null
      // The CHECK forbids a self-description without `other`; clearing the
      // gender must clear it too or the write is rejected by the database.
      updates.gender_self_describe = null
    } else if (typeof g === 'string' && (GENDER_VALUES as readonly string[]).includes(g)) {
      updates.gender = g
      if (g !== 'other') updates.gender_self_describe = null
    }
    // An unrecognised value is ignored rather than stored. It cannot be written
    // anyway — the CHECK would reject it — and a 500 from a constraint teaches
    // the caller less than the field simply not changing.
  }

  if ('genderSelfDescribe' in body) {
    const v = text(body.genderSelfDescribe, MAX_LEN.gender_self_describe)
    // The CHECK constraint only permits a self-description when gender is
    // `other`. Rather than guessing at stored state with an extra read — and
    // risking a constraint violation the user would see as a 500 — a
    // description is accepted only when THIS request also sets gender to
    // `other`, or when it clears the description. Editing the description on
    // its own means re-sending `gender: 'other'` alongside it, which is what
    // the profile form does anyway.
    if (v === null) updates.gender_self_describe = null
    else if (v !== undefined && updates.gender === 'other') updates.gender_self_describe = v
  }

  const simple: Array<[string, keyof typeof MAX_LEN | 'country']> = [
    ['city', 'city'],
    ['occupation', 'occupation'],
    ['industry', 'industry'],
  ]
  for (const [key, col] of simple) {
    if (!(key in body)) continue
    const v = text(body[key], MAX_LEN[col as keyof typeof MAX_LEN])
    if (v !== undefined) updates[key] = v
  }

  if ('educationLevel' in body) {
    const v = text(body.educationLevel, MAX_LEN.education_level)
    if (v !== undefined) updates.education_level = v
  }

  if ('country' in body) {
    const c = body.country
    if (c === null) updates.country = null
    else if (typeof c === 'string') {
      const upper = c.trim().toUpperCase()
      // ISO-3166-1 alpha-2 only, matching the CHECK. Anything else is ignored
      // rather than stored half-normalised.
      if (/^[A-Z]{2}$/.test(upper)) updates.country = upper
      else if (upper === '') updates.country = null
    }
  }

  return Object.keys(updates).length > 0 ? updates : null
}

/**
 * Writes the caller's own demographic fields.
 *
 * Upsert, because the row may not exist yet — a user who has never opened the
 * profile editor has no `user_demographics` row, and `handle_new_user` does not
 * create one (nothing should be recorded about someone before they tell us
 * anything). The INSERT and UPDATE policies both check `auth.uid() = user_id`,
 * so the upsert cannot land on another user's row whichever branch it takes.
 */
export async function updateDemographics(
  supabase: SupabaseClient,
  userId: string,
  updates: Record<string, string | null>
): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase
      .from('user_demographics')
      .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })

    if (error) {
      // W2/C44 — never hand a Postgres error to the client: it carries table and
      // column names. Log the code, return a boolean.
      console.error('[demographics] update failed:', error.code ?? error.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('[demographics] update threw:', e instanceof Error ? e.message : e)
    return { ok: false }
  }
}
