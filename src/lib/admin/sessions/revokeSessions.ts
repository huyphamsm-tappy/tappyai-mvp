import type { SupabaseClient } from '@supabase/supabase-js'

// Controller V2 — Component 11: the ONE way this codebase ends somebody's
// sessions.
//
// Two callers need it now — the direct force-logout route and a ban — and the
// interesting logic is not the RPC call but what its result MEANS. Duplicating
// that interpretation would let the two disagree about whether
// `owner_protected` counts as success, which is the sort of divergence nobody
// notices until it matters.
//
// The mechanism itself stays in SQL. `fn_session_revoke_all` is ONE statement
// whose read and write cannot interleave, and it carries C11's anonymous
// exclusion (§6.1: every read and write filters `is_anonymous = false`). A
// second implementation in TypeScript would have neither property.

/** What `fn_session_revoke_all` reports, plus the transport failure it cannot. */
export interface RevokeOutcome {
  revoked: number
  /**
   * `ok`               — sessions ended (possibly zero, for a user with none)
   * `not_found`        — unknown or anonymous subject (§6.1)
   * `owner_protected`  — §5.1 refuses to log the Platform Owner out
   * `error`            — the call itself failed; nothing is known about state
   */
  reason: 'ok' | 'not_found' | 'owner_protected' | 'error'
}

/** True only when the revocation actually happened. */
export const revocationSucceeded = (o: RevokeOutcome): boolean => o.reason === 'ok'

/**
 * End every session belonging to `userId`.
 *
 * Never throws. A caller that is mid-way through a larger operation — a ban —
 * must be able to record what happened rather than lose the operation to an
 * exception from a subsystem that is not its own.
 */
export async function revokeAllSessions(
  supabase: SupabaseClient,
  userId: string
): Promise<RevokeOutcome> {
  try {
    const { data, error } = await supabase.rpc('fn_session_revoke_all', { p_user_id: userId })
    if (error) {
      // The message can name the auth schema; it never reaches a client.
      console.error('[admin][sessions] revoke_all failed:', error.message)
      return { revoked: 0, reason: 'error' }
    }
    const row = (Array.isArray(data) ? data[0] : data) as RevokeOutcome | undefined
    // An absent row is the same fact the function reports as `not_found`, and
    // is reported identically so this surface cannot be used to tell an unknown
    // user from an anonymous one.
    if (!row) return { revoked: 0, reason: 'not_found' }
    return { revoked: row.revoked ?? 0, reason: row.reason }
  } catch (e) {
    console.error('[admin][sessions] revoke_all threw:', e instanceof Error ? e.message : e)
    return { revoked: 0, reason: 'error' }
  }
}
