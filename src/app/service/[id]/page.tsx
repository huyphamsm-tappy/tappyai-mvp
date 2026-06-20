import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import BookingForm from './BookingForm'
import { MapPin, Phone, Clock, Star, ChevronRight } from 'lucide-react'

// Category icon + label mapping
const CATEGORY_META: Record<string, { emoji: string; label: string; color: string }> = {
  food:          { emoji: '🍜', label: 'Ăn uống',       color: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' },
  spa:           { emoji: '💆', label: 'Spa & Làm đẹp', color: 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400' },
  hotel:         { emoji: '🏨', label: 'Khách sạn',     color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' },
  travel:        { emoji: '✈️', label: 'Du lịch',       color: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400' },
  shopping:      { emoji: '🛍️', label: 'Mua sắm',       color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' },
  entertainment: { emoji: '🎉', label: 'Giải trí',      color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' },
}

interface PageProps {
  params: { id: string }
  searchParams: {
    name?: string
    address?: string
    type?: string
    phone?: string
    price?: string
    rating?: string
    hours?: string
    maps?: string
    note?: string
  }
}

export default async function ServiceDetailPage({ params, searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(searchParams).filter((e): e is [string, string] => typeof e[1] === 'string')
    ).toString()
    const returnTo = `/service/${params.id}${qs ? `?${qs}` : ''}`
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, email')
    .eq('id', user.id)
    .single()

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  // Thử lấy từ services table trước, nếu không có thì dùng query params
  let service = {
    id: params.id,
    name: searchParams.name || 'Dịch vụ',
    address: searchParams.address || '',
    type: searchParams.type || 'food',
    phone: searchParams.phone || '',
    price: searchParams.price || '',
    rating: searchParams.rating || '',
    hours: searchParams.hours || '',
    maps_link: searchParams.maps || '',
    note: searchParams.note || '',
  }

  // Nếu id là UUID, thử fetch từ DB
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)
  if (isUUID) {
    const { data: dbService } = await supabase
      .from('services')
      .select('*')
      .eq('id', params.id)
      .single()
    if (dbService) service = { ...service, ...dbService }
  }

  const meta = CATEGORY_META[service.type] || CATEGORY_META.food

  // Bookings của user cho dịch vụ này
  const { data: myBookings } = await supabase
    .from('bookings')
    .select('id, date, time, guests, status, created_at')
    .eq('user_id', user.id)
    .eq('service_id', params.id)
    .order('created_at', { ascending: false })
    .limit(3)

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack title={service.name} />

      <main className="max-w-lg mx-auto">
        {/* Hero banner */}
        <div className="relative h-52 bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-4 left-8 w-24 h-24 rounded-full bg-white/30" />
            <div className="absolute bottom-4 right-8 w-32 h-32 rounded-full bg-white/20" />
          </div>
          <span className="text-7xl relative z-10 drop-shadow-lg">{meta.emoji}</span>
        </div>

        <div className="px-4 py-5 space-y-5">
          {/* Service header */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-black text-gray-900 dark:text-white leading-tight flex-1">
                {service.name}
              </h1>
              {service.rating && (
                <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-xl shrink-0">
                  <Star size={13} className="text-amber-500 fill-amber-500" />
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{service.rating}</span>
                </div>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium mt-2 ${meta.color}`}>
              {meta.emoji} {meta.label}
            </span>
          </div>

          {/* Info cards */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {service.address && (
              <a
                href={service.maps_link || `https://maps.google.com/?q=${encodeURIComponent(service.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Địa chỉ</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{service.address}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
              </a>
            )}

            {service.phone && (
              <a
                href={`tel:${service.phone}`}
                className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                  <Phone size={16} className="text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Điện thoại</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{service.phone}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
              </a>
            )}

            {service.hours && (
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-orange-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Giờ mở cửa</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{service.hours}</p>
                </div>
              </div>
            )}

            {service.price && (
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                  <span className="text-base">💰</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Mức giá</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{service.price}</p>
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          {service.note && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">💡 {service.note}</p>
            </div>
          )}

          {/* My bookings */}
          {myBookings && myBookings.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-3">Lịch đặt của bạn</h3>
              <div className="space-y-2">
                {myBookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{b.date} {b.time && `lúc ${b.time}`} {b.guests > 1 && `• ${b.guests} người`}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      b.status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      b.status === 'cancelled' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {b.status === 'confirmed' ? 'Đã xác nhận' : b.status === 'cancelled' ? 'Đã hủy' : 'Chờ xác nhận'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Booking form */}
          <BookingForm
            serviceId={params.id}
            serviceName={service.name}
            serviceType={service.type}
            userPhone={profile?.full_name || ''}
          />
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
