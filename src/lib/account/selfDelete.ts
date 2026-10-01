import type { SupabaseClient } from '@supabase/supabase-js'

// ── Self-service account deletion (UAT3 P0, 2026-09-27) ─────────────────────
//
// 🔑 NOT A SECOND DELETION PATH. This is the operator runbook's step 3
// (`docs/ops/ACCOUNT-DELETION.md`: "Delete user" → `auth.admin.deleteUser(<id>)`) with the
// signed-in person as the operator of their own account. Everything deletion does is still done
// by the database and the existing worker:
//   - per-user rows go by foreign key (F-093 D1/D2 + existing CASCADEs);
//   - share pages and actor notifications go by D4's CASCADEs;
//   - the BEFORE DELETE trigger on auth.users (D4) queues `account_deletion_jobs`, which the
//     `/api/cron/account-deletion-jobs` worker drains (files + Google revoke).
// Nothing here deletes a row or a file itself.
//
// 🚨 FLAG-GATED because the promise depends on migrations. Without D1/D2/D4 applied, deleting an
// auth user leaves AI memory, share pages and uploads behind — exactly what /delete-account says
// is removed. `ACCOUNT_SELF_DELETE_ENABLED=true` is set per environment AFTER D1/D2/D4 are live
// there (applied on AUDIT 2026-09-25/26; NOT on production). Off → the request-by-email flow.

export function selfDeleteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ACCOUNT_SELF_DELETE_ENABLED === 'true'
}

/**
 * The word typed to confirm. Accepted in either language whatever the UI locale, and in both
 * Vietnamese tone placements ("XÓA" / "XOÁ") — a person who typed the word correctly is never
 * told they did not.
 */
export const CONFIRM_WORDS = ['XÓA', 'XOÁ', 'DELETE'] as const

export function isConfirmWord(input: unknown): boolean {
  if (typeof input !== 'string') return false
  const v = input.normalize('NFC').trim().toUpperCase()
  return (CONFIRM_WORDS as readonly string[]).some((w) => w.normalize('NFC') === v)
}

export type SelfDeleteResult =
  | { ok: true }
  | { ok: false; reason: 'staff_account' | 'failed' }

/**
 * Deletes the auth user `userId` with the service-role client.
 *
 * Staff accounts are refused up front: the database refuses them anyway (moderation history is
 * NO ACTION / platform owner RESTRICT — `docs/ops/STAFF-LEAVER-RUNBOOK.md`), and a staff member
 * must go through the leaver runbook, not a self-service button. A foreign-key refusal from the
 * delete itself is reported the same way.
 */
export async function deleteOwnAccount(admin: SupabaseClient, userId: string): Promise<SelfDeleteResult> {
  const [roles, owner] = await Promise.all([
    admin.from('admin_roles').select('role', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('platform_owner').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  // A lookup that errors is not proof of "no roles": fail closed.
  if (roles.error || owner.error) return { ok: false, reason: 'failed' }
  if ((roles.count ?? 0) > 0 || (owner.count ?? 0) > 0) return { ok: false, reason: 'staff_account' }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (!error) return { ok: true }
  // Deleted a moment ago (a second tap, a retry): the account is already gone — that is the outcome the person asked for.
  if ((error as { status?: number }).status === 404 || /user_not_found|user not found/i.test(`${error.message ?? ''} ${(error as { code?: string }).code ?? ''}`)) return { ok: true }
  const msg = `${error.message ?? ''} ${(error as { code?: string }).code ?? ''}`
  if (/foreign key|23503|violates|restrict/i.test(msg)) return { ok: false, reason: 'staff_account' }
  return { ok: false, reason: 'failed' }
}
