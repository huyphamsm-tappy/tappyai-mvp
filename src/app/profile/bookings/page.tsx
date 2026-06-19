import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { CalendarDays, Clock, Users, ChevronRight } from 'lucide-react'

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍜', spa: '💆', hotel: '🏨', travel: '✈️', shopping: '🛍️', entertainment: '🎉'
}

function statusBadge(status: string) {
  if (status === 'confirmed') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (status === 'cancelled') return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
}

function statusLabel(status: string) {
  if (status === 'confirmed') return 'Đã xác nhận'
  if (status === 'cancelled') return 'Đã hủy'
  return 'Chờ xác nhận'
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

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title="Lịch đặt chỗ" />

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {(!bookings || bookings.length === 0) ? (
          <div className="text-center py-20">
            <span className="text-5xl">📅</span>
            <p className="text-gray-500 dark:text-gray-400 mt-4 font-medium">Chưa có lịch đặt nào</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Dùng chat để tìm nhà hàng, spa, khách sạn và đặt chỗ ngay!
            </p>
          </div>
        ) : (
          bookings.map(b => (
            <div key={b.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{CATEGORY_EMOJI[b.service_type] || '📍'}</span>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{b.service_name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{b.customer_name} • {b.customer_phone}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${statusBadge(b.status)}`}>
                  {statusLabel(b.status)}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} /> {new Date(b.date).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}
                </span>
                {b.time && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {b.time}
                  </span>
                )}
                {b.guests > 1 && (
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {b.guests} người
                  </span>
                )}
              </div>

              {b.notes && (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 italic">
                  "{b.notes}"
                </p>
              )}
            </div>
          ))
        )}
      </main>

      <BottomNav />
    </div>
  )
}
