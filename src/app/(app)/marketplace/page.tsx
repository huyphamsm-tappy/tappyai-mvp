import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SHOW_MARKETPLACE } from '@/lib/config/product'
import MarketplaceReserved from './MarketplaceReserved'

// The V3 shell navigates here, so the route must resolve. It reserves the place
// only — see MarketplaceReserved for why there is deliberately no commerce here.
export const metadata: Metadata = {
  title: 'Marketplace',
  // Nothing to index while the surface is reserved.
  robots: { index: false, follow: true },
}

export default function MarketplacePage() {
  /**
   * 🚨 HIDING THE NAV IS NOT HIDING THE FEATURE. With both entry points gated,
   * a direct visit to `/marketplace` would still have rendered a product page
   * announcing a feature that does not exist — reachable from a bookmark, a
   * shared link, or a search engine.
   *
   * `notFound()` is the app's own answer for a route that is not there, so this
   * needs no new "unavailable" screen and invents no Marketplace experience. The
   * component below is still imported and still rendered the moment
   * `SHOW_MARKETPLACE` flips back.
   */
  if (!SHOW_MARKETPLACE) notFound()
  return <MarketplaceReserved />
}
