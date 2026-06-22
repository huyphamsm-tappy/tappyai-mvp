'use client'

import { useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import ChatInterface from '@/components/ChatInterface'
import { CATEGORIES } from '@/lib/utils'

interface Conversation {
  id: string
  title: string
  category: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export default function ChatConversation({ conversation }: { conversation: Conversation }) {
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

  return (
    <div className="flex flex-col h-dvh bg-white dark:bg-gray-950">
      <Header showBack backHref="/" title={catInfo ? `${catInfo.emoji} ${catInfo.label}` : conversation.title} />
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
