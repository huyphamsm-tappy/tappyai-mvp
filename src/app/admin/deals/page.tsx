import { requirePagePermission } from '@/lib/admin/permissions'
import { PERMISSIONS } from '@/lib/admin/permissions'
import { DealsManager } from '@/components/admin/deals/DealsManager'

// Partner Deals CRUD — admin+ (content management). The /admin layout gates any
// admin; this enforces the 'admin' minimum. The API handlers enforce independently.
export default async function AdminDealsPage() {
  await requirePagePermission(PERMISSIONS.COMMERCE_DEALS_READ)
  return <DealsManager />
}
