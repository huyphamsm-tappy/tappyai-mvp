import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import CategoryPills from '@/components/CategoryPills'
import SearchBar from '@/components/SearchBar'
import { formatRelativeTime, cn } from '@/lib/utils'
import { MessageCircle, Sparkles, ChevronRight } from 'lucide-react'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { getMemory } from '@/lib/memory/memoryService'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let conversations: { id: string; title: string; category: string; updated_at: string; messages: unknown }[] | null = null
  let memory = null

  if (user) {
    const [{ data: profileData }, { data: convData }, mem] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('conversations')
        .select('id, title, category, updated_at, messages')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(5),
      getMemory(user.id),
    ])
    profile = profileData
    conversations = convData
    memory = mem
  }

  // Dynamic prompts — VN time UTC+7, shuffled fresh on each server render
  const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const SUGGESTIONS = getDynamicPrompts(vnTime.getUTCHours(), vnTime.getUTCDay(), memory)

  const userInfo = user
    ? (profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email })
    : null

  const firstName = userInfo?.full_name?.split(' ').pop() || userInfo?.email?.split('@')[0] || 'bạn'

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-20">
      <Header user={userInfo} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-7">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 p-6 pb-7 shadow-lg shadow-primary-500/20">
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-accent-300/20 blur-2xl pointer-events-none" />

          <div className="relative">
            <p className="text-white/80 text-sm font-medium mb-1">
              {user ? `Xin chào, ${firstName} 👋` : 'Chào mừng đến với TappyAI 👋'}
            </p>
            <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight mb-5">
              Hôm nay bạn cần<br />tìm gì?
            </h1>
            <SearchBar variant="hero" />
          </div>
        </div>

        {/* Categories */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-accent-500" />
            Khám phá theo lĩnh vực
          </h3>
          <CategoryPills />
        </section>

        {/* AI Suggestions */}
        <section>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Gợi ý hôm nay</h3>
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTIONS.map((item) => (
              <Link
                key={item.text}
                href={`/chat?q=${encodeURIComponent(item.text)}&category=${item.category}`}
                className="group rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className={cn('h-16 flex items-center justify-center text-3xl bg-gradient-to-br', item.gradient)}>
                  {item.emoji}
                </div>
                <div className="p-3">
                  <p className="text-[13px] leading-snug font-medium text-gray-700 dark:text-gray-200 line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {item.text}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent conversations */}
        {user && conversations && conversations.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Trò chuyện gần đây</h3>
              <Link href="/profile" className="text-sm text-primary-500 font-medium">Xem tất cả</Link>
            </div>
            <div className="space-y-2">
              {conversations.map((conv) => {
                const msgCount = Array.isArray(conv.messages) ? conv.messages.length : 0
                return (
                  <Link
                    key={conv.id}
                    href={`/chat/${conv.id}`}
                    className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 hover:border-primary-200 dark:hover:border-primary-800 transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <MessageCircle size={18} className="text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{conv.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {msgCount} tin nhắn · {formatRelativeTime(conv.updated_at)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {user && conversations?.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-3">
              <MessageCircle size={28} className="text-primary-400" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Bắt đầu trò chuyện đầu tiên với TappyAI!</p>
            <Link href="/chat" className="inline-block mt-3 btn-primary text-sm py-2 px-5">
              Chat ngay
            </Link>
          </div>
        )}

        {!user && (
          <div className="text-center py-4">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Đăng nhập để lưu lịch sử trò chuyện của bạn</p>
            <Link href="/login" className="inline-block btn-primary text-sm py-2.5 px-6">
              Đăng nhập
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
