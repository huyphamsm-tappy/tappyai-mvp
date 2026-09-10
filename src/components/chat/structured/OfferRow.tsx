'use client'

import { ExternalLink, Star } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatVndShort, type PriceLocale } from '@/lib/format/vndPrice'
import type { SynthesisOfferView } from '@/lib/ai/consultative/synthesisView'

// ── P4-03/P4-16 · OfferRow (DD-008: Extract → Generalise → Improve) ────────
//
// Extracted verbatim from `ShoppingDecision.tsx`. A MOVE, not a redesign.
//
// The honesty rule lives in three places here, and all three are load-bearing:
//   • a missing seller renders as "Người bán chưa rõ", not as a blank;
//   • a missing price renders as "chưa rõ giá", not as 0đ and not as an empty
//     cell. `formatVndShort` returns null for an absent price, and the `??`
//     below is what turns that into an honest string rather than nothing at all;
//   • the button names the site it opens AND whether that site will show the
//     product — see `offerDestination`.
//
// The rating shown here is THIS listing's, never the entity's.

/**
 * Where an offer's link ACTUALLY goes, and whether it is the product itself.
 *
 * 🚨 A SELLER NAME BESIDE A GOOGLE LINK READS AS A PROMISE. Serper's /shopping
 * rows name a merchant ("Shopee", "CellphoneS") but their `link` is a
 * `google.com/search?...prds=` redirect - measured 40 out of 40 rows on a live
 * phone-case query. A card naming Shopee and a price, above a button that opens
 * Google, is two true facts arranged into a false impression.
 *
 * So the button says both things: which site it opens, and whether that site
 * shows the product or a list of results. Nothing here REWRITES a URL — when
 * only a search link exists the honest answer is to say "search", never to
 * synthesise a product link the provider never gave.
 */
export interface OfferDestination {
  /** The site the link opens — "Shopee", "Google". Null when unparseable. */
  platform: string | null
  /** True when the URL addresses one product; false for a search or listing. */
  direct: boolean
  /** True when that site is the seller this row names. */
  isSeller: boolean
}

/** Path segments that mean "a list of results", not one product. */
const SEARCH_PATH = /\/search|\/tim-kiem|\/catalog|\/s\b/

export function offerDestination(url: string | null, seller: string | null): OfferDestination | null {
  if (!url) return null
  let host = ''
  let path = ''
  let query = ''
  try {
    const u = new URL(url)
    host = u.hostname.replace(/^www\./, '')
    path = u.pathname
    query = u.search
  } catch {
    return null
  }

  const brand = host.split('.')[0] || ''
  const platform = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : null
  const normalisedSeller = (seller ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const isSeller = !!(normalisedSeller && brand
    && (normalisedSeller.includes(brand) || brand.includes(normalisedSeller)))

  // A product page names the product in its PATH. A search names it in a QUERY —
  // which is exactly the shape of the Google Shopping redirect.
  const isSearch = SEARCH_PATH.test(path) || query.length > 1
  const direct = !isSearch && path.replace(/\/+$/, '').length > 1

  return { platform, direct, isSeller }
}

/** The label an offer's button has earned, given where it really goes. */
export function offerActionLabel(
  dest: OfferDestination,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  if (!dest.platform) return t('shoppingDecision.view')
  // The seller's own product page: nothing to qualify.
  if (dest.direct && dest.isSeller) return t('shoppingDecision.view')
  if (dest.direct) return t('shoppingDecision.viewOn', { platform: dest.platform })
  return t('shoppingDecision.viewOnSearch', { platform: dest.platform })
}

export default function OfferRow({ o }: { o: SynthesisOfferView }) {
  const { t, locale } = useTranslation()
  const seller = o.seller ?? t('shoppingDecision.unknownSeller')
  const cond = o.condition ? ` · ${o.condition}` : ''
  const dest = offerDestination(o.url, o.seller)
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm" data-testid="offer-row">
      <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
        {seller}<span className="text-gray-400 dark:text-gray-500">{cond}</span>
        {typeof o.rating === 'number' && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
            <Star size={11} className="fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums">{o.rating}</span>
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">
          {formatVndShort(o.price, locale as PriceLocale) ?? t('shoppingDecision.noPrice')}
        </span>
        {o.url && dest && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
          >
            {offerActionLabel(dest, t)}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </span>
    </div>
  )
}
