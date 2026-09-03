'use client'

import { useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import ChatInterface from '@/components/ChatInterface'
import { CATEGORIES } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'

interface Conversation {
  id: string
  title: string
  category: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export default function ChatConversation({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation()
  const catInfo = CATEGORIES.find(c => c.id === conversation.category)

  const handleSave = useCallback(async (
    msgs: Array<{ role: string; content: string }>,
    title: string
  ) => {
    try {
      await fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conversation.id, title, messages: msgs }),
      })
    } catch (e) { console.error('Save failed:', e) }
  }, [conversation.id])

  // V3 §9 — Chat joins the V3 ground. `v3-theme` supplies the palette and `dark` switches the
  // thread's existing, already-designed dark treatment on, so the conversation reads as part of
  // the same product instead of a light page reached from a dark one. No behaviour changes: the
  // marker contract, the action boundary and the honesty rule are untouched.
  return (
    <div className="v3-theme dark flex flex-col h-dvh">
      <Header showBack backHref="/" title={catInfo ? `${catInfo.emoji} ${t(`tag.${catInfo.id}`)}` : conversation.title} />
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          initialCategory={conversation.category}
          conversationId={conversation.id}
          savedMessages={conversation.messages ?? []}
          onSave={handleSave}
        />
      </div>
      <div className="h-16" />
      <BottomNav />
    </div>
  )
}
