'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { BookingShareButton } from './BookingShareButton'
import { BookingReviewButton } from './BookingReviewButton'
import { CalendarDays, Clock, Users, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

const SERVICE_EMOJI: Record<string, string> = {
  food: '🍜', spa: '💆', hotel: '🏨', travel: '✈️', shopping: '🛍️', entertainment: '🎉',
}

type Booking = {
  id: string
  service_name: string
  service_type: string
  customer_name: string
  customer_phone: string
  status: string
  date: string
  time: string | null
  guests: number
  notes: string | null
  place_id: string | null
}

type BookingsUser = { full_name?: string | null; avatar_url?: string | null; email?: string | null }

type Translate = (key: string, vars?: Record<string, string>) => string

function StatusBadge({ status, t }: { status: string; t: Translate }) {
  if (status === 'confirmed') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
      {t('bookings_status_confirmed')}
    </span>
  )
  if (status === 'cancelled') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">
      {t('bookings_status_cancelled')}
    </span>
  )
  // pending — make it clear this is NOT yet confirmed by the venue
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
      {t('bookings_status_pending')}
    </span>
  )
}

function formatDate(dateStr: string) {
  // dateStr is YYYY-MM-DD from the DB
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// Client view for Bookings so every string is reactive to the language toggle.
// The server page still does auth + the bookings/reviews queries.
export default function BookingsView({
  user,
  bookings,
  reviewedPlaceIds,
  todayVN,
}: {
  user: BookingsUser
  bookings: Booking[] | null
  reviewedPlaceIds: string[]
  todayVN: string
}) {
  const { t } = useTranslation()
  const reviewed = new Set(reviewedPlaceIds)

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/profile" title={t('bookings_title')} />

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* Pending status explanation banner */}
        {bookings && bookings.some(b => b.status === 'pending') && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">{t('bookings_pending_banner')}</p>
          </div>
        )}

        {/* Empty state */}
        {(!bookings || bookings.length === 0) && (
          <div className="text-center py-20">
            <span className="text-5xl">📅</span>
            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-200">{t('bookings_empty_title')}</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 px-6">
              {t('bookings_empty_message')}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-2xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
            >
              {t('bookings_explore_now')}
              <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {/* Booking list */}
        {bookings && bookings.map(b => (
          <div key={b.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            {/* Header row */}
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

            {/* Details row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">
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
                  {t('bookings_guests_count_other', { 1: String(b.guests) })}
                </span>
              )}
            </div>

            {/* Notes */}
            {b.notes && (
              <div className="mx-4 mb-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">&ldquo;{b.notes}&rdquo;</p>
              </div>
            )}

            {/* Actions */}
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
