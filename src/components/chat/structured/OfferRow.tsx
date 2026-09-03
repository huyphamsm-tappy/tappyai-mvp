'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatVndShort, type PriceLocale } from '@/lib/format/vndPrice'
import type { SynthesisOfferView } from '@/lib/ai/consultative/synthesisView'

// ── P4-03/P4-16 · OfferRow (DD-008: Extract → Generalise → Improve) ────────
//
// Extracted verbatim from `ShoppingDecision.tsx`. A MOVE, not a redesign.
//
// The honesty rule lives in two places here, and both are load-bearing:
//   • a missing seller renders as "Người bán chưa rõ", not as a blank;
//   • a missing price renders as "chưa rõ giá", not as 0đ and not as an empty cell.
// `formatVndShort` returns null for an absent price, and the `??` below is what turns that into an
// honest string rather than nothing at all.

export default function OfferRow({ o }: { o: SynthesisOfferView }) {
  const { t, locale } = useTranslation()
  const seller = o.seller ?? t('shoppingDecision.unknownSeller')
  const cond = o.condition ? ` · ${o.condition}` : ''
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
        {seller}<span className="text-gray-400 dark:text-gray-500">{cond}</span>
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">
          {formatVndShort(o.price, locale as PriceLocale) ?? t('shoppingDecision.noPrice')}
        </span>
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
          >
            {t('shoppingDecision.view')}<ExternalLink className="w-3 h-3" />
          </a>
        )}
      </span>
    </div>
  )
}
