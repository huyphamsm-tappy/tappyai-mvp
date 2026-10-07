import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { ModerationQueue } from '@/components/admin/moderation/ModerationQueue'
import { GuardedSurface } from '@/components/admin/layout/GuardedSurface'
import { ModerationDesk } from '@/components/admin/moderation/ModerationDesk'
import { moderationAdminEnabled } from '@/lib/safety/userBlocks'

// Module 09 Content Moderation — the Controller surface.
//
// `requirePagePermission` is ENFORCEMENT: it redirects an actor who may not
// open this page. The `can` flags below are UX only — they decide which
// buttons exist, so an operator never sees a door they cannot open. Every
// action is enforced again server-side by the resolve route, which picks the
// permission for the action actually requested.
//
// The three flags are three DIFFERENT permissions because `12_RBAC` §3 makes
// them different: it grants moderator Dismiss and Hide, and withholds Delete.
// A single "canModerate" boolean would have flattened that distinction into a
// role check by another name.

export default async function AdminModerationPage() {
  const ctx = await requirePagePermission(PERMISSIONS.MODERATION_QUEUE_READ)

  const can = {
    dismiss: permissionEngine.can(ctx.actor, PERMISSIONS.MODERATION_REPORT_DISMISS),
    hide: permissionEngine.can(ctx.actor, PERMISSIONS.MODERATION_CONTENT_HIDE),
    // §3: moderator ❌. The one content action withheld from the role that does
    // the reviewing.
    delete: permissionEngine.can(ctx.actor, PERMISSIONS.MODERATION_CONTENT_DELETE),
  }

  // MODERATION_ADMIN_ENABLED (default OFF): the desk — decisions against the community rules, strikes, appeals, numbers. While it is
  // off this page is the plain queue it has always been. The desk's own API routes answer 404 while the flag is off.
  if (moderationAdminEnabled()) {
    return (
      <GuardedSurface>
        <ModerationDesk can={{ ...can, suspend: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_SUSPEND), ban: permissionEngine.can(ctx.actor, PERMISSIONS.USERS_BAN) }} />
      </GuardedSurface>
    )
  }

  return (
    // Guarded read: this data comes from an /api/admin route that carries the
    // same-origin guard, so on a non-canonical origin it is refused. Say so
    // rather than rendering an empty panel.
    <GuardedSurface><ModerationQueue can={can} /></GuardedSurface>
  )
}
