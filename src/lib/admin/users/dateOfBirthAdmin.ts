import type { SupabaseClient } from '@supabase/supabase-js'

// Module 08 — the admin side of the date-of-birth correction path.
//
// WHAT THIS IS. A thin wrapper over `public.admin_set_user_date_of_birth()`
// (V3 User Data Foundation migration §6). It exists so the route reads as a
// list of guards followed by one named operation, matching every other Module
// 08 mutation, and so the SQL status vocabulary is mapped in exactly one place.
//
// WHAT THIS IS NOT. It is not a demographics accessor. There is no read here
// and there must never be one: no PostgREST role holds a privilege on
// `user_demographics.date_of_birth`, `user_age_status()` answers only for the
// CALLER's own `auth.uid()`, and correcting a value does not require seeing it.
// Adding a read would recreate the broad raw-DOB exposure ADR-027 removed.
//
// ── THE AUDIT IS NOT WRITTEN HERE ────────────────────────────────────────────
//
// Unlike `suspendUser`/`banUser`, whose callers follow them with
// `writeAuditLog`, this operation records itself. The SQL function INSERTs the
// `audit_log` row in the SAME TRANSACTION as the change, so the two commit
// together or not at all, and a refusal writes nothing at all. A second
// `writeAuditLog()` call in the route would produce two entries for one event
// and would survive a transaction that rolled back — the audit would then claim
// a correction that did not happen. `route.test.ts` pins this.
//
// The audit row carries the age BAND and the operator's reason. It never
// carries a date, before or after.

/**
 * The status vocabulary of `admin_set_user_date_of_birth()`, verbatim.
 *
 * Modelled as a closed union rather than `string` so an unrecognised value is a
 * type error here and a 500 at runtime — a future status this build does not
 * understand must never be read as success.
 */
export type DobCorrectionStatus =
  | 'corrected'
  | 'reason_too_short'
  | 'invalid_actor'
  | 'invalid_date'
  | 'user_not_found'

const KNOWN: ReadonlySet<string> = new Set<DobCorrectionStatus>([
  'corrected',
  'reason_too_short',
  'invalid_actor',
  'invalid_date',
  'user_not_found',
])

export interface DobCorrectionParams {
  /** The subject. Validated as a UUID and screened by `guardMutationTarget` before this runs. */
  targetId: string
  /** Normalised `YYYY-MM-DD`, already through `parseDateOfBirthInput`. */
  dateOfBirth: string
  actorId: string
  actorEmail: string
  actorRole: string
  /** The operator's stated justification. The function refuses fewer than 20 characters. */
  reason: string
}

/**
 * Applies an administrative date-of-birth correction.
 *
 * Takes the service-role client as a parameter rather than creating one, for
 * the same reason every other Module 08 helper does: the route decides when a
 * privileged client is warranted, and it does so only AFTER `requirePermission`
 * has answered. A helper that minted its own client would move that decision
 * somewhere the authorization check cannot be seen.
 *
 * Returns a status only. Never the date — not on success, not on refusal.
 */
export async function correctDateOfBirth(
  admin: SupabaseClient,
  params: DobCorrectionParams
): Promise<DobCorrectionStatus> {
  const { data, error } = await admin.rpc('admin_set_user_date_of_birth', {
    p_user_id: params.targetId,
    p_dob: params.dateOfBirth,
    p_actor_id: params.actorId,
    p_actor_email: params.actorEmail,
    p_actor_role: params.actorRole,
    p_reason: params.reason,
  })

  if (error) {
    // The message is logged, never the arguments — one of them is a date of
    // birth, and an error log is exactly the kind of place it must not land.
    console.error('[admin][users] date_of_birth correction failed:', error.message)
    throw new Error('dob_correction_failed')
  }

  if (typeof data !== 'string' || !KNOWN.has(data)) {
    console.error('[admin][users] date_of_birth correction returned an unrecognised status')
    throw new Error('dob_correction_failed')
  }

  return data as DobCorrectionStatus
}
