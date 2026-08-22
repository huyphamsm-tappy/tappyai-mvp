// /api/admin/users/[id]/notes — internal admin notes for ONE account.
//
// Contract: 10_User_Management.md §3.8 (chronological, pinned at top, add
// inline) and §3.9 ("Add internal note — moderator"). `12_RBAC.md` §3 states
// the authority once, for adding: analyst ❌ · moderator ✅ · admin ✅ ·
// super_admin ✅.
//
// TWO PERMISSIONS, SAME ROLES. §3 does not state a separate READ authority, so
// `users.notes.read` carries exactly the roles §3 gives to adding. Whoever may
// write a note may read them; analyst gets neither. Two ids because the actions
// differ and because widening READ later must not also widen WRITE.
//
// Handler contract: RBAC → same-origin → rate-limit → validate → operation →
// audit → uniform envelope (21_Coding_Standards §2).
//
// READING SOMEBODY'S NOTES IS AUDITED. These rows are an operator's written
// opinion of a person, kept without that person's knowledge; who opened the
// file is part of the record, exactly as C11 audits `session.listed`.

import { adminError, adminErrorResponse, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { auditActorRole } from '@/lib/admin/permissions/decisionAudit'
import { writeAuditLog } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { listNotes, addNote } from '@/lib/admin/users/userNotes'
import { guardMutationTarget } from '@/lib/admin/users/identity'
import { AddNoteSchema, isUuid } from './schema'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_NOTES_READ)
    const { user } = ctx

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!isUuid(params.id)) return adminError('VALIDATION_ERROR', 'Invalid user id', 422)

    const rl = await distributedRateLimit(`admin:users:notes:list:${user.id}`, 100, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const result = await listNotes(createAdminClient(), params.id)
    if (result.status === 'error') return adminError('INTERNAL_ERROR', 'Operation failed', 500)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole: auditActorRole(ctx.actor),
      action: 'user.notes_listed',
      targetType: 'user',
      targetId: params.id,
      // The COUNT, never the text. An audit entry that quoted the notes would
      // duplicate the very content whose access it exists to record.
      metadata: { returned: result.notes.length },
      req,
    })

    return Response.json({ data: result.notes })
  } catch (err) {
    return adminErrorResponse(err)
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requirePermission(req, PERMISSIONS.USERS_NOTES_WRITE)
    const { user } = ctx
    const actorRole = auditActorRole(ctx.actor)

    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)

    const rl = await distributedRateLimit(`admin:users:notes:add:${user.id}`, 30, 60_000)
    if (!rl.ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429, { 'Retry-After': String(rl.retryAfter) })
    }

    const parsed = AddNoteSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return adminError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body', 422)
    }

    const admin = createAdminClient()
    // The same guard every other Module 08 mutation uses: shape → self →
    // Platform Owner (fails closed) → existence. A note is not a sanction, but
    // it is a record kept ABOUT somebody, and the Owner is not a subject of it.
    const denial = await guardMutationTarget(admin, {
      targetId: params.id,
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      intent: 'user.note_add',
      req,
    })
    if (denial) return denial

    // `authorId` is the AUTHENTICATED ACTOR and is never read from the body.
    // Accepting it from input would let any note be attributed to anyone.
    const created = await addNote(admin, {
      userId: params.id,
      authorId: user.id,
      note: parsed.data.note,
      isPinned: parsed.data.isPinned,
    })
    if (!created) return adminError('INTERNAL_ERROR', 'Operation failed', 500)

    writeAuditLog({
      actorId: user.id,
      actorEmail: user.email ?? '—',
      actorRole,
      action: 'user.note_added',
      targetType: 'user',
      targetId: params.id,
      // Length and pin state, not the text. The note already lives in
      // `user_notes`; copying it into the audit log would put the same
      // sensitive prose in a second table with different access rules.
      metadata: { note_id: created.id, note_length: parsed.data.note.length, pinned: created.is_pinned },
      req,
    })

    return Response.json({ data: created })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
