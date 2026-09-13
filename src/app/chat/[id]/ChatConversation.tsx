'use client'

import { useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import ChatInterface from '@/components/ChatInterface'
import { CATEGORIES } from '@/lib/utils'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { readSavedContext, type SavedMessage } from '@/lib/chat/savedContext'

interface Conversation {
  id: string
  title: string
  category: string
  messages: Array<{ role: 'user' | 'assistant'; content: string; context?: SavedMessage['context'] }>
}

export default function ChatConversation({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation()
  const catInfo = CATEGORIES.find(c => c.id === conversation.category)
  // The Explore clip this thread started from, if any — read back from the saved row so every
  // follow-up after the `/chat` → `/chat/<id>` move still names it. Shape-validated; see
  // `lib/chat/savedContext.ts`.
  const initialContext = readSavedContext(conversation.messages)

  const handleSave = useCallback(async (
    msgs: SavedMessage[],
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
      {/* The saved-conversation header carries the same approved pose as the live
        * one — the two are the same surface and must not disagree. See the note
        * in src/app/chat/page.tsx. */}
      <Header
        showBack
        backHref="/"
        title={catInfo ? (
          <span className="inline-flex items-center justify-center gap-2">
            <TappyMascot pose={catInfo.id} size={24} alt="" />
            {t(`tag.${catInfo.id}`)}
          </span>
        ) : conversation.title}
      />
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          initialCategory={conversation.category}
          initialContext={initialContext}
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
