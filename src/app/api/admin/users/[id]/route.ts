// GET /api/admin/users/[id] — one consumer account.
//
// Contract: docs/backoffice/05_API_Architecture.md §6, 10_User_Management.md §3.
//
// This is Module 08's slice of the "User 360" view, not the whole of §3. The
// activity timeline, AI usage, content, social, subscription and moderation
// sections each read a module that has not shipped; assembling a §3 response
// with those sections stubbed would misreport an empty history as a clean one.
// What is here is what `profiles`, `account_status` and `auth.users` can
// actually answer today.

import { adminError, adminErrorResponse } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { readAccountStatus, standingOf } from '@/lib/admin/users/accountStatusAdmin'
import { getEmailById } from '@/lib/admin/users/authDirectory'
import { canReadFullEmail, emailFor } from '@/lib/admin/users/emailVisibility'
import { isUuid } from '@/lib/admin/users/identity'
import type { AdminUserDetail } from '../schema'

export const dynamic = 'force-dynamic'

const PROFILE_DETAIL_COLUMNS =
  'id, full_name, avatar_url, created_at, language, onboarded, follower_count, following_count'

interface ProfileDetailRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string | null
  language: string | null
  onboarded: boolean | null
  follower_count: number | null
  following_count: number | null
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_DETAIL_READ)
    const { user } = ctx

    const rl = await distributedRateLimit(`admin:users:detail:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    // Checked before any query: a non-UUID reaches Postgres as a 22P02 cast
    // error, which surfaces as a 500 for what is really a malformed request.
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'id must be a UUID', 422)

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_DETAIL_COLUMNS)
      .eq('id', params.id)
      .maybeSingle()

    if (error) {
      console.error('[admin][users] detail read failed:', error.message)
      return adminError('INTERNAL_ERROR', 'Operation failed', 500)
    }
    if (!data) return adminError('NOT_FOUND', 'User not found', 404)

    const profile = data as ProfileDetailRow

    // Two independent reads; neither depends on the other's result.
    const [status, rawEmail] = await Promise.all([
      readAccountStatus(supabase, params.id),
      getEmailById(supabase, params.id),
    ])

    const standing = standingOf(status)
    const unmasked = canReadFullEmail(ctx.actor)

    const detail: AdminUserDetail = {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      created_at: profile.created_at,
      standing,
      suspended_until: standing === 'suspended' ? (status?.suspended_until ?? null) : null,
      email: emailFor(ctx.actor, rawEmail),
      // Only true when there was something to mask — a user with no address on
      // file must not be reported as having a hidden one.
      email_masked: rawEmail !== null && !unmasked,
      language: profile.language,
      onboarded: profile.onboarded ?? false,
      follower_count: profile.follower_count,
      following_count: profile.following_count,
      // The RAW flags alongside the derived standing. They differ exactly when a
      // suspension has expired but no cron has cleared it yet, and an admin
      // deciding whether to unsuspend needs to see that the row still says
      // `is_suspended` even though the standing reads `active`.
      is_suspended: status?.is_suspended === true,
      is_banned: status?.is_banned === true,
      // Service-role-only column (04 §7B section 3). No PostgREST role holds a
      // grant on it — not `anon`, not `authenticated`, not the subject of the
      // note. It reaches the Controller only because this handler is the
      // service-role path.
      ban_reason: status?.ban_reason ?? null,
      status_updated_at: status?.updated_at ?? null,
    }

    return Response.json({ data: detail })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
