import { getShopeeDeals } from '@/lib/shopee-deals'
import DealsView from './DealsView'

// Server page: fetches the daily deals; all UI text lives in DealsView so it
// reacts to the app-wide language toggle.
export default async function DealsPage() {
  const deals = await getShopeeDeals()
  return <DealsView deals={deals} />
}
