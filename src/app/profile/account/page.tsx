import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import { Mail, User as UserIcon, Calendar, Edit3, Grid3X3 } from 'lucide-react'

export default async function AccountPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userInfo = {
    full_name: profile?.full_name || user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    email: profile?.email || user.email,
    created_at: profile?.created_at || user.created_at,
  }
  const firstName = userInfo.full_name?.split(' ').pop() || userInfo.email?.split('@')[0] || 'bạn'
  const joinDate = userInfo.created_at ? new Date(userInfo.created_at).toLocaleDateString('vi-VN') : null

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title="Tài khoản" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="card p-6 flex flex-col items-center text-center">
          {userInfo.avatar_url ? (
            <Image
              src={userInfo.avatar_url}
              alt={userInfo.full_name || 'Avatar'}
              width={80}
              height={80}
              className="rounded-2xl ring-2 ring-primary-100 dark:ring-primary-900"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center">
              <span className="text-white text-3xl font-bold">{firstName[0]?.toUpperCase()}</span>
            </div>
          )}
          <h2 className="font-bold text-gray-900 dark:text-white text-lg mt-3">{userInfo.full_name || firstName}</h2>
          <p className="w-full truncate text-gray-500 dark:text-gray-400 text-sm">{userInfo.email}</p>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            Thông tin
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={UserIcon} label="Họ và tên" description={userInfo.full_name || 'Chưa cập nhật'} />
            <MenuItem icon={Mail} label="Email" description={userInfo.email} />
            {joinDate && <MenuItem icon={Calendar} label="Ngày tham gia" description={joinDate} />}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            Chỉnh sửa
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Edit3} label="Chỉnh sửa hồ sơ" description="Đổi tên hiển thị, ảnh đại diện" href="/profile/edit" />
            <MenuItem icon={Grid3X3} label="Bài viết của tôi" description="Xem và quản lý bài đăng" href="/profile/posts" />
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
