import type { Metadata } from 'next'
import MarketplaceReserved from './MarketplaceReserved'

// The V3 shell navigates here, so the route must resolve. It reserves the place
// only — see MarketplaceReserved for why there is deliberately no commerce here.
export const metadata: Metadata = {
  title: 'Marketplace',
  // Nothing to index while the surface is reserved.
  robots: { index: false, follow: true },
}

export default function MarketplacePage() {
  return <MarketplaceReserved />
}
