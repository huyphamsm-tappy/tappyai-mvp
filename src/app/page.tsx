import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import CategoryGrid from '@/components/CategoryGrid'
import SearchBar from '@/components/SearchBar'
import { formatRelativeTime } from '@/lib/utils'
import { MessageCircle, Sparkles, ChevronRight } from 'lucide-react'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: conversations } = await supabase.from('conversations').select('id, title, category, updated_at, messages').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5)
  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  return (
    <div className="min-h-dvh bg-gray-50 pb-20">
      <Header user={userInfo} />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-3xl p-6 text-white shadow-lg">
          <p className="text-primary-100 text-sm mb-1">TappyAI - Ho tro dich vu tai Viet Nam</p>
          <h2 className="text-xl font-bold mb-4">Hoi ve an uong, du lich, spa...</h2>
          <SearchBar />
        </div>
        <section>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-accent-500" />
            Kham pha theo linh vuc
          </h3>
          <CategoryGrid />
        </section>
        <section>
          <h3 className="font-semibold text-gray-900 mb-3">Goi y hom nay</h3>
          <div className="grid gap-3">
            {[{emoji: '🍜', text: 'Quan pho ngon nhat Ha Noi?', category: 'food'},
              {emoji: '✈️', text: 'Top 5 diem du lich dip le?', category: 'travel'},
              {emoji: '💆', text: 'Spa massage gia binh dan TP.HCM?', category: 'spa'}
            ].map((item) => (
              <Link key={item.text} href={`/chat?q=${encodeURIComponent(item.text)}&category=${item.category}`}
                className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-gray-100 hover:border-primary-300 transition-all group">
                <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                <p className="text-sm text-gray-700 flex-1 group-hover:text-primary-600 transition-colors">{item.text}</p>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>
        {conversations && conversations.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Tro chuyen gan day</h3>
              <Link href="/profile" className="text-sm text-primary-500 font-medium">Xem tat ca</Link>
            </div>
            <div className="space-y-2">
              {conversations.map((conv) => {
                const msgCount = Array.isArray(conv.messages) ? conv.messages.length : 0
                return (
                  <Link key={conv.id} href={`/chat/${conv.id}`}
                    className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-gray-100 hover:border-primary-200 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <MessageCircle size={18} className="text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{msgCount} tin - {formatRelativeTime(conv.updated_at)}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
