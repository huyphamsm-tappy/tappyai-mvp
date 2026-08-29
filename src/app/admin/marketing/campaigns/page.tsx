import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { ModuleComingSoon } from '@/components/admin/marketing/ModuleComingSoon'

// Marketing V1 FOUNDATION — campaigns.
//
// The guard is REAL and is the first statement, exactly as every other
// Controller page does it. Requesting this URL directly without
// `MARKETING_CAMPAIGNS_READ` is refused here, server-side; the navigation card
// that leads here is presentation and never an authorization decision.
//
// There is no table, API, server action or CRUD behind this route yet. It
// renders the placeholder rather than mock data, per the frozen contract.
export default async function MarketingCampaignsPage() {
  await requirePagePermission(PERMISSIONS.MARKETING_CAMPAIGNS_READ)
  return <ModuleComingSoon titleKey="admin.nav.campaigns" />
}
