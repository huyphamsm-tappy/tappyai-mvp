// Carrying out ONE takedown request, shared by "record and execute" (POST /api/admin/takedowns) and "execute" (POST /api/admin/takedowns/[id]).
// Guard order is the caller's job (identity, origin, rate limit, MODERATION_CONTENT_HIDE); what is added here is the permission an ACCOUNT ban needs and the existing guard on touching an account.
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminError } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { writeAuditLog, type AuditActorRole } from '@/lib/admin/audit'
import { banUser } from '@/lib/admin/users/accountStatusAdmin'
import { revokeAllSessions, revocationSucceeded } from '@/lib/admin/sessions/revokeSessions'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { clockState } from '@/lib/safety/takedown/clock'
import { executeTakedown, ROW_COLUMNS, type TakedownRow } from '@/lib/safety/takedown/service'

export interface Who { id: string; email?: string | null }

export async function runExecute(req: Request, admin: SupabaseClient, id: string, user: Who, actorRole: AuditActorRole, notes: string | undefined): Promise<Response> {
  const cur = await admin.from('authority_takedowns').select(ROW_COLUMNS).eq('id', id).maybeSingle()
  if (cur.error) return adminError('INTERNAL_ERROR', 'Operation failed', 500)
  const row = cur.data as unknown as TakedownRow | null
  if (!row) return adminError('NOT_FOUND', 'Takedown request not found', 404)
  if (row.status === 'actioned' || row.status === 'rejected') return adminError('CONFLICT', 'This request is already closed', 409)

  if (row.target_type === 'user') {
    await requirePermission(req, PERMISSIONS.USERS_BAN)
    const denial = await guardMutationTarget(admin, { targetId: row.target_id, actorId: user.id, actorEmail: user.email ?? '—', actorRole, intent: 'user.ban', req })
    if (denial) return denial
  }

  const r = await executeTakedown(admin, id, user.id, notes, {
    banUser: (a, uid, reason) => banUser(a, uid, reason),
    revokeSessions: async (a, uid) => revocationSucceeded(await revokeAllSessions(a, uid)),
  })
  if (!r.ok) {
    if (r.error === 'already_closed') return adminError('CONFLICT', 'This request is already closed', 409)
    if (r.error === 'not_found') return adminError('NOT_FOUND', 'Takedown request not found', 404)
    return adminError('INTERNAL_ERROR', 'Operation failed', 500)
  }
  // The audit entry names the request, the target and the effect. Never the content.
  writeAuditLog({
    actorId: user.id, actorEmail: user.email ?? '—', actorRole, action: 'moderation.authority_takedown', targetType: row.target_type, targetId: row.target_id,
    metadata: { takedown_id: row.id, source: row.source, urgency: row.urgency, action_taken: r.action, on_time: new Date(r.row.actioned_at ?? Date.now()).getTime() <= new Date(row.due_at).getTime() }, req,
  })
  return Response.json({ data: view(r.row) })
}

/** What the API shows of a request (never the content snapshot). */
export function view(row: TakedownRow, now: Date = new Date()) {
  const c = clockState(row, now)
  return { ...row, clock: c.state, minutes_left: c.minutesLeft }
}
