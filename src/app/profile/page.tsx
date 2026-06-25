import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import { User, MessageCircle, Bookmark, Settings, Crown, CalendarDays, Heart, Users, TrendingDown, Brain, Star, Plug } from 'lucide-react'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { count: conversationCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const userInfo = {
    full_name: profile?.full_name || user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    email: profile?.email || user.email,
  }
  const firstName = userInfo.full_name?.split(' ').pop() || userInfo.email?.split('@')[0] || 'bạn'

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile card */}
        <div className="card p-6">
          <div className="flex items-center gap-4">
            {userInfo.avatar_url ? (
              <Image
                src={userInfo.avatar_url}
                alt={userInfo.full_name || 'Avatar'}
                width={64}
                height={64}
                className="rounded-2xl ring-2 ring-primary-100 dark:ring-primary-900"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">{userInfo.full_name || firstName}</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{userInfo.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full font-medium">
                  {conversationCount || 0} cuộc trò chuyện
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Account group */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            Tài khoản
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={User} label="Tài khoản" description="Thông tin cá nhân" href="/profile/account" />
            <MenuItem icon={MessageCircle} label="Lịch sử chat" description="Xem các cuộc trò chuyện trước đây" href="/profile/history" />
            <MenuItem icon={CalendarDays} label="Lịch đặt chỗ" description="Nhà hàng, spa, khách sạn đã đặt" href="/profile/bookings" />
            <MenuItem icon={Heart} label="Sở thích của tôi" description="Ngân sách, ẩm thực yêu thích, kiêng cữ" href="/profile/preferences" />
            <MenuItem icon={Bookmark} label="Đã lưu" description="Địa điểm yêu thích đã lưu từ chat" href="/profile/favorites" />
            <MenuItem icon={TrendingDown} label="Theo dõi giá" description="Tappy báo khi giá xuống mức mong muốn" href="/profile/price-watches" />
            <MenuItem icon={Brain} label="Tappy biết gì về bạn" description="Xem và quản lý bộ nhớ cá nhân của Tappy" href="/profile/tappy-knows" />
            <MenuItem icon={Plug} label="Kết nối ứng dụng" description="Google Calendar, Zalo và nhiều hơn nữa" href="/profile/integrations" />
            <MenuItem icon={Star} label="Review của tôi" description="Xem và quản lý các đánh giá đã đăng" href="/reviews" />
            <MenuItem icon={Users} label="Đi nhóm" description="Cả team đi ăn gì? Để Tappy gợi ý" href="/group/new" />
            <MenuItem icon={Crown} label="Nâng cấp Pro" description="Không giới hạn tin nhắn & tính năng" href="/subscription" />
          </div>
        </section>

        {/* Settings group */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            Cài đặt
          </h3>
        