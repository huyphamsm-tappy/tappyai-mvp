import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { BookingShareButton } from './BookingShareButton'
import { CalendarDays, Clock, Users, ChevronRight } from 'lucide-react'

const SERVICE_EMOJI: Record<string, string> = {
  food: '🍜', spa: '💆', hotel: '🏨', travel: '✈️', shopping: '🛍️', entertainment: '🎉',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
      ✅ Đã xác nhận
    </span>
  )
  if (status === 'cancelled') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">
      ❌ Đã hủy
    </span>
  )
  // pending — make it clear this is NOT yet confirmed by the venue
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
      ⏳ Đang xử lý
    </span>
  )
}

function formatDate(dateStr: string) {
  // dateStr is YYYY-MM-DD from the DB
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default async function BookingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, email')
    .eq('id', user.id)
    .single()

  const userInfo = profile || {
    full_name: user.user_metadata?.full_name,
    avatar_url: user.user_metadata?.avatar_url,
    email: user.email,
  }

  // RLS enforces user_id = auth.uid() automatically; explicit eq is belt-and-suspenders
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title="Lịch đặt chỗ" />

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {/* Pending status explanation banner */}
        {bookings && bookings.some(b => b.status === 'pending') && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">⏳ Đang xử lý</span> — TappyAI đã ghi nhận đặt chỗ của bạn.
              Cơ sở sẽ liên hệ xác nhận qua SĐT bạn đã cung cấp.
            </p>
          </div>
        )}

        {/* Empty state */}
        {(!bookings || bookings.length === 0) && (
          <div className="text-center py-20">
            <span className="text-5xl">📅</span>
            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-200">Chưa có lịch đặt chỗ nào</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 px-6">
              Dùng chat để tìm nhà hàng, spa, khách sạn và đặt chỗ ngay!
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-2xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
            >
              Khám phá ngay
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
              <StatusBadge status={b.status} />
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
                  {b.guests} người
                </span>
              )}
            </div>

            {/* Notes */}
            {b.notes && (
              <div className="mx-4 mb-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">"{b.notes}"</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
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
          </div>
        ))}
      </main>

      <BottomNav />
    </div>
  )
}
