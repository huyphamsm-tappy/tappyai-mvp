import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { ModerationQueue } from '@/components/admin/moderation/ModerationQueue'

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

  return <ModerationQueue can={can} />
}
