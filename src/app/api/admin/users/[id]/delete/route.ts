// POST /api/admin/users/[id]/delete — delete one consumer account for good (owner 26/11/2026).
//
// THE SAME DELETION the person can ask for themselves (`deleteOwnAccount` -> `auth.admin.deleteUser`), so the same clean-up runs: the BEFORE DELETE
// trigger of migration 20261005 queues the uploaded files and the Google grant and removes the stores that have no cascade path. It is available
// only where that clean-up is installed (`accountDeletionSchemaReady`); without it the route answers 503 and deletes nothing.
//
// WHO: `users.account.delete` — `super_admin` alone (the Platform Owner bypasses). Irreversible, so unlike a ban it is not handed to `admin`.
// NEVER STAFF: an account that holds an admin role or is the Platform Owner is refused (`deleteOwnAccount` / `staffStatus` already do; checked
// first here so the refusal is explicit and audited). Also never oneself.
//
// APPLE: an account with a Sign in with Apple identity cannot have its Apple authorisation revoked from here (that needs the person's own,
// single-use code). It is deleted anyway and the audit entry says `apple_identity: true`, `apple_revoked: false`; the person's own in-app
// deletion remains the path that revokes at Apple.
//
// AUDIT: written BEFORE the deletion (the actor's reason must survive even if the delete half-fails) and updated by a second entry with the result.
// No email, no name: the target id only. The person's content is gone after this, so the record is the id, the actor, the reason and the time.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { accountDeletionSchemaReady } from '@/lib/account/deletionReady'
import { deleteOwnAccount, lookupAppleIdentity, staffStatus } from '@/lib/account/selfDelete'
import { DeleteUserSchema } from '../../schema'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_ACCOUNT_DELETE)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    // The tightest ceiling of the module: deletion is irreversible.
    const rl = await distributedRateLimit(`admin:users:delete:${user.id}`, 5, 60_000)
    if (!rl.ok) return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })

    if (!UUID_RE.test(params.id)) return adminError('VALIDATION_ERROR', 'Invalid user id', 422)
    if (params.id === user.id) return adminError('FORBIDDEN', 'You cannot delete your own account from here', 403)

    const parsed = DeleteUserSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }
    const { reason } = parsed.data

    // Deletion without its clean-up would leave files and grants behind: refuse until the database says the clean-up is installed.
    if (!(await accountDeletionSchemaReady())) {
      return adminError('UNAVAILABLE', 'Account deletion clean-up is not installed on this database', 503)
    }

    const supabase = createAdminClient()

    const { data: target, error: targetError } = await supabase.auth.admin.getUserById(params.id)
    if (targetError || !target?.user) return adminError('NOT_FOUND', 'User not found', 404)

    const staff = await staffStatus(supabase, params.id)
    if (staff === 'staff') return adminError('FORBIDDEN', 'An administrator or the Platform Owner cannot be deleted from here', 403)
    if (staff === 'error') return adminError('INTERNAL', 'Could not verify the account is not staff', 500)

    const identity = await lookupAppleIdentity(supabase, params.id)
    if (!identity.ok) return adminError('INTERNAL', 'Could not inspect the account identities', 500)

    const base = {
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      targetType: 'user' as const,
      targetId: params.id,
      req,
    }
    writeAuditLog({ ...base, action: 'user.delete.requested', metadata: { reason, anonymous: target.user.is_anonymous === true, apple_identity: identity.apple } })

    const result = await deleteOwnAccount(supabase, params.id)
    writeAuditLog({ ...base, action: result.ok ? 'user.delete' : 'user.delete.failed', metadata: { reason, ok: result.ok, apple_identity: identity.apple, apple_revoked: false, ...(result.ok ? {} : { failure: result.reason }) } })

    if (!result.ok) {
      return result.reason === 'staff_account'
        ? adminError('FORBIDDEN', 'This account cannot be deleted (staff or a protected reference)', 403)
        : adminError('INTERNAL', 'Could not delete the account', 500)
    }
    return Response.json({ data: { id: params.id, deleted: true, apple_identity: identity.apple } })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
