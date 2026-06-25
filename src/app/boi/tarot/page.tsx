import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import TarotDraw from '@/components/boi/TarotDraw'

export default async function TarotPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userInfo = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/boi" title="Tarot" />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <TarotDraw />

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          Nội dung chỉ mang tính giải trí, tham khảo — không thay thế lời khuyên chuyên môn.
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
