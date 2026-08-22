'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { formatRelativeTime, CATEGORIES } from '@/lib/utils'
import { MessageCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import DeleteConversationButton from './DeleteConversationButton'

// Presentation split out of the server page for the same reason as /subscription: the chosen
// locale is client state, so a server component can only ever render one language (B07).

type Conv = { id: string; title: string; category: string; updated_at: string; messageCount: number }

export default function HistoryView({
  userInfo, conversations,
}: {
  userInfo: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  conversations: Conv[]
}) {
  const { t, locale } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title={t('history.title')} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {conversations.length === 0 ? (
          <div className="card p-4 text-center">
            <MessageCircle size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-content-secondary text-sm">{t('history.empty')}</p>
            <Link href="/chat" className="inline-block mt-3 btn-primary text-sm py-2 px-5">
              {t('memory.startChat')}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => {
              const cat = CATEGORIES.find(c => c.id === conv.category)
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
                        {t('home.messages', { n: String(conv.messageCount) })} · {formatRelativeTime(conv.updated_at, t, locale)}
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
