import DealsView from './DealsView'

// Deals are admin-managed content: DealsView loads them client-side from the
// shared REST API (GET /api/deals), the same endpoint Android/iOS consume.
export default function DealsPage() {
  return <DealsView />
}
