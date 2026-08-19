'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { formatRelativeTime, CATEGORIES } from '@/lib/utils'
import { MessageCircle } from 'lucide-react'
import DeleteConversationButton from './DeleteConversationButton'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Conversation = {
  id: string
  title: string
  category: string | null
  updated_at: string
  messages: unknown
}

type HistoryUser = { full_name?: string | null; avatar_url?: string | null; email?: string | null }

// Client view for Chat history so every string is reactive to the language
// toggle. The server page still does auth + the conversation query.
export default function HistoryView({
  user,
  conversations,
}: {
  user: HistoryUser
  conversations: Conversation[] | null
}) {
  const { t, locale } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/profile" title={t('history_title')} />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {!conversations || conversations.length === 0 ? (
          <div className="card p-4 text-center">
            <MessageCircle size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('history_empty_title')}</p>
            <Link href="/chat" className="inline-block mt-3 btn-primary text-sm py-2 px-5">
              {t('history_start_chat')}
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
                        {t('history_messages_count_time', {
                          1: String(msgCount),
                          2: formatRelativeTime(conv.updated_at, t, locale),
                        })}
                      </p>
                    </div>
                  </Link>
                  <DeleteConversationButton id={conv.id} title={conv.title} />
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
