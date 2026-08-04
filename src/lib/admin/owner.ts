// Controller V2 — Phase 1, Component 1: PLATFORM OWNER (application side).
// Design: docs/controller-v2/03_PHASE1_FOUNDATION_DESIGN.md §3
//
// The Owner is NOT a role and is never read from `admin_roles`. It lives in its
// own `platform_owner` table with a partial unique index guaranteeing at most
// one active row. This module is the single place the application asks
// "is this user the Platform Owner?".
//
// THE REAL ENFORCEMENT IS IN THE DATABASE. fn_grant_admin_role /
// fn_revoke_admin_role are SECURITY DEFINER and the service-role client has had
// direct write access to admin_roles revoked. Everything here is defense in
// depth and UX (so the API can answer 403 with a useful message instead of
// surfacing a raw Postgres error).

import { createAdminClient } from '@/lib/supabase/admin'

const CACHE_TTL_MS = 60_000

let ownerCache: { userId: string | null; expires: number } | null = null
let missingTableWarned = false

/**
 * The currently active Platform Owner's user id, or null if none is assigned
 * (or the table does not exist yet — see the degradation note below).
 *
 * Degrades gracefully when `platform_owner` is absent so that deploying this
 * code BEFORE applying the migration cannot take the back office down. The
 * migration/deploy order is documented in the migration header; this is the
 * safety net for getting that order wrong.
 */
export async function resolvePlatformOwnerId(): Promise<string | null> {
  if (ownerCache && ownerCache.expires > Date.now()) return ownerCache.userId

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('platform_owner')
    .select('user_id')
    .eq('active', true)
    .maybeSingle()

  if (error) {
    // 42P01 = undefined_table (migration not applied yet). Warn once, treat as
    // "no owner assigned" rather than failing the request.
    if (!missingTableWarned) {
      console.warn('[controller][owner] platform_owner unreadable:', error.message)
      missingTableWarned = true
    }
    ownerCache = { userId: null, expires: Date.now() + CACHE_TTL_MS }
    return null
  }

  const userId = data?.user_id ?? null
  ownerCache = { userId, expires: Date.now() + CACHE_TTL_MS }
  return userId
}

/** True when `userId` is the active Platform Owner. */
export async function isPlatformOwner(userId: string): Promise<boolean> {
  const ownerId = await resolvePlatformOwnerId()
  return ownerId !== null && ownerId === userId
}

/** Drop the cached owner (call after a bootstrap or break-glass reassignment). */
export function invalidateOwnerCache(): void {
  ownerCache = null
}

export type OwnerGate =
  | { ok: true; enforced: boolean }
  | { ok: false; reason: 'ENV_MISMATCH' | 'ENV_SET_BUT_NO_OWNER' }

/**
 * Boot-time assertion: `PLATFORM_OWNER_USER_ID` must match the active
 * `platform_owner` row. Transferring ownership therefore requires BOTH database
 * write access AND the Vercel environment — neither alone is sufficient.
 *
 * ROLLOUT SEMANTICS (deliberate):
 *   - env UNSET  → gate inert (`enforced: false`). The system behaves exactly as
 *     it does today. This is what makes deploy-then-configure safe; bricking the
 *     back office during rollout would be a worse outcome than a brief window in
 *     which only the database-level controls apply.
 *   - env SET    → gate enforced. Any mismatch, or an env value with no active
 *     owner row, denies access to the whole Controller.
 *
 * Note the asymmetry is safe because this gate is NOT the primary control:
 * privilege escalation is blocked in the database regardless of this value.
 */
export async function checkOwnerGate(): Promise<OwnerGate> {
  const expected = process.env.PLATFORM_OWNER_USER_ID?.trim()
  if (!expected) return { ok: true, enforced: false }

  const actual = await resolvePlatformOwnerId()
  if (actual === null) return { ok: false, reason: 'ENV_SET_BUT_NO_OWNER' }
  if (actual !== expected) return { ok: false, reason: 'ENV_MISMATCH' }

  return { ok: true, enforced: true }
}
