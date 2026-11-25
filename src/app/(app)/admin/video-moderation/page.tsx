import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { GuardedSurface } from '@/components/admin/layout/GuardedSurface'
import { VideoModerationDesk } from '@/components/admin/video-moderation/VideoModerationDesk'

// Explore video review desk (VID-03). requirePagePermission is ENFORCEMENT; the `can` flags are UX only (which buttons work).
// The decide route picks the permission per outcome: approve = report.dismiss, reject = content.hide,
// approving a suspected child-safety case = content.delete (withheld from moderators). The routes answer 404 while the pipeline flag is off.

export default async function AdminVideoModerationPage() {
  const ctx = await requirePagePermission(PERMISSIONS.MODERATION_QUEUE_READ)
  const can = {
    approve: permissionEngine.can(ctx.actor, PERMISSIONS.MODERATION_REPORT_DISMISS),
    approveSevere: permissionEngine.can(ctx.actor, PERMISSIONS.MODERATION_CONTENT_DELETE),
    reject: permissionEngine.can(ctx.actor, PERMISSIONS.MODERATION_CONTENT_HIDE),
  }
  return (
    <GuardedSurface>
      <VideoModerationDesk can={can} />
    </GuardedSurface>
  )
}
