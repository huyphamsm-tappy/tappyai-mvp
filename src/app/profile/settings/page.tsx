import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import SignOutButton from '../SignOutButton'
import { Bell, Sliders, MessageSquareText, Brain, Star, FileText, Shield } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title="Cài đặt" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            Tùy chọn
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Bell} label="Thông báo" description="Nhắc nhở và cập nhật" href="/profile/notifications" />
            <MenuItem icon={Sliders} label="Hành vi ứng dụng" description="Tùy chỉnh trải nghiệm" comingSoon />
            <MenuItem icon={MessageSquareText} label="Phong cách trả lời" description="Giọng văn của trợ lý AI" comingSoon />
            <MenuItem icon={Brain} label="Trí nhớ" description="Quản lý thông tin AI ghi nhớ" comingSoon />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            Khác
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Star} label="Đánh giá ứng dụng" description="Gửi phản hồi cho TappyAI" comingSoon />
            <MenuItem icon={FileText} label="Điều khoản dịch vụ" href="/profile/terms" />
            <MenuItem icon={Shield} label="Chính sách bảo mật" href="/profile/privacy" />
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">Phiên bản hiện tại: 0.1.0</p>
        </section>

        <div className="card p-2">
          <SignOutButton />
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
