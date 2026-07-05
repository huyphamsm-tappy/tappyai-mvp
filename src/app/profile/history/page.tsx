import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { formatRelativeTime, CATEGORIES } from '@/lib/utils'
import { MessageCircle } from 'lucide-react'
import DeleteConversationButton from './DeleteConversationButton'

export default async function ProfileHistoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, category, updated_at, messages')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title="Lịch sử trò chuyện" />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {!conversations || conversations.length === 0 ? (
          <div className="card p-4 text-center">
            <MessageCircle size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa có cuộc trò chuyện nào</p>
            <Link href="/chat" className="inline-block mt-3 btn-primary text-sm py-2 px-5">
              Bắt đầu chat
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const cat = CATEGORIES.find(c => c.id === conv.category)
              const msgCount = Array.isArray(conv.messages) ? conv.messages.length : 0
              return (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 card p-4 hover:border-primary-200 dark:hover:border-primary-800 transition-all"
                >
                  <Link href={`/chat/${conv.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-xl">
                      {cat?.emoji || '💬'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{conv.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {msgCount} tin nhắn · {formatRelativeTime(conv.updated_at)}
                      </p>
                    </div>
                  </Link>
                  <DeleteConversationButton id={conv.id} />
                </div>
              )
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
