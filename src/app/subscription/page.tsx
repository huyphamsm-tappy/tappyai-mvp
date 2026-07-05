import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Check, Crown, ArrowLeft } from 'lucide-react'
import StripeCheckoutButton from '@/components/StripeCheckoutButton'
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton'

const FREE_FEATURES = [
  '10 tin nhắn / ngày',
  'Tìm kiếm địa điểm cơ bản',
  'Lưu lịch sử 7 ngày',
]

const PRO_FEATURES = [
  'Tin nhắn không giới hạn',
  'Tìm kiếm nâng cao + chính xác hơn',
  'Lưu lịch sử không giới hạn',
  'Nhận giọng nói (Voice Input)',
  'AI nhớ sở thích cá nhân',
  'Ưu tiên phản hồi nhanh hơn',
]

export default async function SubscriptionPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  // Kiểm tra subscription status
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .single()

  const isPro = sub?.status === 'active' && sub?.current_period_end
    ? new Date(sub.current_period_end) > new Date()
    : false

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title="Nâng cấp TappyAI" />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* Hero */}
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
            <Crown size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">TappyAI Pro</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Trải nghiệm đầy đủ, không giới hạn
          </p>
        </div>

        {/* Current status */}
        {isPro ? (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-amber-500" />
              <span className="font-semibold text-amber-700 dark:text-amber-400 text-sm">Bạn đang dùng TappyAI Pro</span>
            </div>
            <p className="text-amber-600 dark:text-amber-500 text-xs mt-1">
              Gia hạn: {sub?.current_period_end
                ? new Date(sub.current_period_end).toLocaleDateString('vi-VN')
                : '--/--/----'}
            </p>
            <ManageSubscriptionButton />
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800">
            <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">
              🎁 Bạn đang dùng gói Free — còn <strong>-- / 10</strong> tin nhắn hôm nay
            </p>
          </div>
        )}

        {/* Pricing cards */}
        <div className="space-y-4">

          {/* Free */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Gói Free</h2>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">Dùng thử miễn phí</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-gray-900 dark:text-white">0đ</span>
                <p className="text-gray-400 text-xs">/tháng</p>
              </div>
            </div>
            <ul className="space-y-2 mb-4">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <Check size={14} className="text-gray-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-center text-sm font-medium text-gray-400 dark:text-gray-500">
              Gói hiện tại
            </div>
          </div>

          {/* Pro */}
          <div className="bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl p-5 shadow-lg shadow-primary-500/20 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Crown size={14} className="text-amber-300" />
                    <h2 className="font-bold text-white">Gói Pro</h2>
                  </div>
                  <p className="text-white/70 text-xs">Không giới hạn, đầy đủ tính năng</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-white">99K</span>
                  <p className="text-white/70 text-xs">/tháng</p>
                </div>
              </div>
              <ul className="space-y-2 mb-5">
                {PRO_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white">
                    <Check size={14} className="text-green-300 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {isPro ? (
                <div className="w-full py-3.5 rounded-xl bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-2">
                  <Crown size={16} />
                  Bạn đang dùng Pro ✓
                </div>
              ) : (
                <StripeCheckoutButton />
              )}
            </div>
          </div>

        </div>

        {/* FAQ */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 space-y-4 text-sm">
          <h3 className="font-semibold text-gray-900 dark:text-white">Câu hỏi thường gặp</h3>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">Thanh toán bằng gì?</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Hỗ trợ thẻ Visa/Mastercard và ví điện tử — sắp ra mắt.</p>
          </div>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">Có thể hủy bất lúc nào không?</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Có, hủy bất kỳ lúc nào, dữ liệu vẫn được giữ nguyên.</p>
          </div>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">Giới hạn Free được reset khi nào?</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Reset lúc 00:00 mỗi ngày theo giờ Việt Nam.</p>
          </div>
        </div>

        <Link href="/profile" className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <ArrowLeft size={14} />
          Quay lại hồ sơ
        </Link>
      </main>

      <BottomNav />
    </div>
  )
}
