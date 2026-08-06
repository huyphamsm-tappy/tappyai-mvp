import { requirePagePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { HomeDashboard } from '@/components/admin/dashboard/HomeDashboard'

// Home Dashboard. The page itself is a server component so it can carry its own
// permission guard; the UI lives in a client component because it uses the i18n
// hook.
//
// Component 3 permission audit fixed a real inconsistency here: the sidebar
// already hid this entry from anyone without `dashboard.home.view`, but the page
// had no guard of its own, so the door was hidden and not locked. Every role
// currently holds this permission, so nobody's access changes today — the point
// is that the nav and the page now read the SAME source of truth.
export default async function AdminHomePage() {
  // deniedRedirect MUST leave the Controller: this IS /admin, so the default
  // '/admin' target would redirect the page to itself forever.
  await requirePagePermission(PERMISSIONS.DASHBOARD_HOME_VIEW, { deniedRedirect: '/reviews' })
  return <HomeDashboard />
}
