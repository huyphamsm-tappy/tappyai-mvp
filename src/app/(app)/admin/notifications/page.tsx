import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { NotificationsShell } from '@/components/admin/notifications/NotificationsShell'

// Controller Notifications — PHASE A FOUNDATION.
//
// 🔑 THE GUARD IS THE FEATURE HERE. Phase A ships no send capability at all:
// this page reads nothing, writes nothing, and calls no notification primitive.
// It exists so the authorization model is settled, exercised and testable
// BEFORE any code in this repo is able to message a real person.
//
// SURFACE PERMISSION vs ACTION PERMISSION. The page is gated on
// `notifications.history.read` — the lowest of the three, which the Owner
// granted to analyst and up. Gating it on `send.user` instead would hide the
// history from exactly the roles meant to read it. Whether the actor may
// actually SEND is a separate question, answered separately below and, in
// Phase B, answered again server-side by the send route on every request.
//
// ⚠️ `canSendUser` / `canBroadcast` DECIDE WHAT IS DRAWN, NOTHING MORE. They are
// presentation. Hiding a compose form has never been authorization here, and
// Phase B's `POST` must call `requirePermission` itself rather than trusting
// that this page chose not to render a button. That is the same rule the Deals
// module follows: the page guards, and the API guards independently.
//
// The Platform Owner reaches this through `Actor.isOwner`, the existing
// constitutional bypass inside `permissionEngine`. No email is read here.
export default async function AdminNotificationsPage() {
  const { actor } = await requirePagePermission(PERMISSIONS.NOTIFICATIONS_HISTORY_READ)

  return (
    <NotificationsShell
      canSendUser={permissionEngine.can(actor, PERMISSIONS.NOTIFICATIONS_SEND_USER)}
      canBroadcast={permissionEngine.can(actor, PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)}
    />
  )
}
