'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { BookingShareButton } from './BookingShareButton'
import { BookingReviewButton } from './BookingReviewButton'
import { CalendarDays, Clock, Users, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// C15 — this screen was a server component, so every string on it was Vietnamese and an English
// session read "Lịch đặt chỗ / Chưa có lịch đặt chỗ nào / Khám phá ngay". Same split as
// /subscription, /profile/history and /profile/account: session and data stay on the server, the
// presentation moves here where the chosen locale is knowable.

const SERVICE_EMOJI: Record<string, string> = {
  food: '🍜', spa: '💆', hotel: '🏨', travel: '✈️', shopping: '🛍️', entertainment: '🎉',
}

type Booking = {
  id: string
  service_type: string
  service_name: string
  customer_name: string
  customer_phone: string
  status: string
  date: string
  time: string | null
  guests: number
  notes: string | null
  place_id: string | null
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  if (status === 'confirmed') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
      {t('bookings.status.confirmed')}
    </span>
  )
  if (status === 'cancelled') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">
      {t('bookings.status.cancelled')}
    </span>
  )
  // pending — make it clear this is NOT yet confirmed by the venue
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
      {t('bookings.status.pending')}
    </span>
  )
}

/** `dateStr` is YYYY-MM-DD from the DB. Day-first in both languages — see C17. */
function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function BookingsView({
  userInfo, bookings, reviewedPlaceIds, todayVN,
}: {
  userInfo: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  bookings: Booking[]
  reviewedPlaceIds: string[]
  todayVN: string
}) {
  const { t } = useTranslation()
  const reviewed = new Set(reviewedPlaceIds)

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title={t('bookings.title')} />

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {bookings.some(b => b.status === 'pending') && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">{t('bookings.status.pending')}</span>{t('bookings.pendingNotice')}
            </p>
          </div>
        )}

        {bookings.length === 0 && (
          <div className="text-center py-20">
            <span className="text-5xl">📅</span>
            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-200">{t('bookings.empty')}</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 px-6">
              {t('bookings.emptyHint')}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-2xl bg-interactive text-white text-sm font-semibold hover:bg-interactive-hover transition-colors"
            >
              {t('bookings.exploreCta')}
              <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {bookings.map(b => (
          <div key={b.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-4 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl shrink-0">{SERVICE_EMOJI[b.service_type] || '📍'}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">
                    {b.service_name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {b.customer_name} · {b.customer_phone}
                  </p>
                </div>
              </div>
              <StatusBadge status={b.status} t={t} />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-content-secondary">
              <span className="flex items-center gap-1">
                <CalendarDays size={12} />
                {formatDate(b.date)}
              </span>
              {b.time && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {b.time}
                </span>
              )}
              {b.guests > 1 && (
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {t('bookings.guests', { n: String(b.guests) })}
                </span>
              )}
            </div>

            {b.notes && (
              <div className="mx-4 mb-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">&ldquo;{b.notes}&rdquo;</p>
              </div>
            )}

            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <BookingShareButton
                  serviceName={b.service_name}
                  date={formatDate(b.date)}
                  time={b.time}
                  customerName={b.customer_name}
                  phone={b.customer_phone}
                  guests={b.guests}
                  notes={b.notes}
                />
              </div>
              {b.place_id && b.date < todayVN && !reviewed.has(b.place_id) && (
                <BookingReviewButton
                  placeId={b.place_id}
                  placeName={b.service_name}
                />
              )}
            </div>
          </div>
        ))}
      </main>

      <BottomNav />
    </div>
  )
}
