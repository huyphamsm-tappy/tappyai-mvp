import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { permissionEngine } from '@/lib/admin/permissions/engine'
import { CampaignsShell } from '@/components/admin/marketing/CampaignsShell'

// V2.2-2 Marketing — campaigns.
//
// The guard is REAL and is the first statement, exactly as every other
// Controller page does it. Requesting this URL directly without
// `MARKETING_CAMPAIGNS_READ` is refused here, server-side; the navigation card
// that leads here is presentation and never an authorization decision.
//
// SURFACE PERMISSION vs ACTION PERMISSION. The page is gated on the READ
// permission — the lowest of the three — so a role meant to review campaigns is
// not locked out for lacking the ability to write one. Whether the actor may
// CREATE or UPDATE is a separate question, answered below for presentation and
// answered again, independently, by each route on every request (M-22).
//
// 🚨 THERE IS NO ACTIVATION SURFACE, AND THAT IS THE POINT. Activation is the
// step that delivers to real people; it remains blocked while M-30 (consent
// export) is UNSATISFIED and Q6 (who owns delivering it) is OPEN. The shell
// says so in words rather than rendering a disabled button, because a disabled
// button reads as "nearly ready" and this is a decision, not a delay.
export default async function MarketingCampaignsPage() {
  const { actor } = await requirePagePermission(PERMISSIONS.MARKETING_CAMPAIGNS_READ)

  return (
    <CampaignsShell
      canCreate={permissionEngine.can(actor, PERMISSIONS.MARKETING_CAMPAIGNS_CREATE)}
      canUpdate={permissionEngine.can(actor, PERMISSIONS.MARKETING_CAMPAIGNS_UPDATE)}
    />
  )
}
