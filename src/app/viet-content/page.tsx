import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import VietContentForm from '@/components/VietContentForm'

export const metadata = {
  title: 'Viết content mạng xã hội — TappyAI',
  description: 'Tạo caption hấp dẫn cho Facebook, TikTok, Instagram chỉ trong vài giây.',
}

export default async function VietContentPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userInfo = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    userInfo = profile || {
      full_name: user.user_metadata?.full_name,
      avatar_url: user.user_metadata?.avatar_url,
      email: user.email,
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/" title="Viết content" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-6 pb-7 shadow-lg shadow-rose-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">AI viết content ✍️</p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">
              Caption hấp dẫn<br />trong vài giây
            </h1>
            <p className="text-white/80 text-sm mt-2">
              Facebook, TikTok, Instagram — chọn tone, độ dài và để AI lo phần còn lại.
            </p>
          </div>
        </div>

        <VietContentForm />
      </main>

      <BottomNav />
    </div>
  )
}
