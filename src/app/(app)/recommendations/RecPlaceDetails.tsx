'use client'

// The place details a "Gợi ý cho bạn" card shows (design D:\redesign Sep 22 01_41_30): photo, address,
// rating, recent activity, review count — every value from the place's own community reviews
// (/api/recommendations additive fields, 2026-09-28). A chip is drawn only for data that exists.

import { useState } from 'react'
import { MapPin, Star, Users } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

export interface RecPlaceFacts {
  address?: string | null
  photoUrl?: string | null
  averageRating?: number | null
  reviewCount?: number
  latestReviewAt?: string | null
}

/** A community review in the last 14 days — a real date, never a guess. */
const RECENT_MS = 14 * 24 * 3600 * 1000
export function isRecentlyActive(iso?: string | null, now = Date.now()): boolean {
  return !!iso && now - Date.parse(iso) < RECENT_MS
}

/** The card's photo tile: the latest community photo, else a themed pin tile. Rank badge on top. */
export function RecPhoto({ photoUrl, rank }: { photoUrl?: string | null; rank: number }) {
  // A stored URL can 403/404 (expired, suspended host): fall back to the pin tile rather than a blank box.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = !!photoUrl && failedUrl !== photoUrl
  return (
    <div className="relative flex h-20 w-20 sm:h-24 sm:w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-500/15 to-accent-500/15 ring-1 ring-gray-100 dark:ring-white/10" aria-hidden>
      {showPhoto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photoUrl!} alt="" data-rec-photo className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(photoUrl!)} />
        : <MapPin size={28} className="text-primary-500" />}
      <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-accent-500 text-xs font-bold text-white">{rank}</span>
    </div>
  )
}

/** Address line + fact chips (rating, recently active, review count). */
export function RecFacts({ facts }: { facts: RecPlaceFacts }) {
  const { t } = useTranslation()
  const rating = typeof facts.averageRating === 'number' && facts.averageRating > 0 ? facts.averageRating : null
  const reviews = typeof facts.reviewCount === 'number' && facts.reviewCount > 0 ? facts.reviewCount : null
  const recent = isRecentlyActive(facts.latestReviewAt)
  return (
    <>
      {facts.address && (
        <p data-rec-address className="mt-1 flex items-center gap-1 text-xs text-content-secondary">
          <MapPin size={12} className="flex-shrink-0 text-primary-500" aria-hidden />
          <span className="truncate">{facts.address}</span>
        </p>
      )}
      {(rating !== null || recent || reviews !== null) && (
        <ul className="mt-2 flex flex-wrap gap-1.5" data-rec-facts>
          {rating !== null && (
            <li data-rec-rating className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-semibold text-accent-500 ring-1 ring-accent-500/30">
              {rating.toFixed(1)} <Star size={11} fill="currentColor" aria-hidden />
            </li>
          )}
          {recent && (
            <li data-rec-recent className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-500 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> {t('recommendations.recentlyActive')}
            </li>
          )}
          {reviews !== null && (
            <li data-rec-reviews className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10">
              <Users size={11} aria-hidden /> {t('recommendations.reviewCount', { n: String(reviews) })}
            </li>
          )}
        </ul>
      )}
    </>
  )
}
