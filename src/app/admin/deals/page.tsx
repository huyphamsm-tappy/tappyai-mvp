import { requirePageRole } from '@/lib/admin/page-guard'
import { DealsManager } from '@/components/admin/deals/DealsManager'

// Partner Deals CRUD — admin+ (content management). The /admin layout gates any
// admin; this enforces the 'admin' minimum. The API handlers enforce independently.
export default async function AdminDealsPage() {
  await requirePageRole('admin')
  return <DealsManager />
}
