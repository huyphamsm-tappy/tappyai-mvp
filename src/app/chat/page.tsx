'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import ChatInterface from '@/components/ChatInterface'
import { CATEGORIES } from '@/lib/utils'

function ChatPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = searchParams.get('q') || ''
  const category = searchParams.get('category') || 'general'
  const catInfo = CATEGORIES.find(c => c.id === category)

  const handleSave = useCallback(async (
    messages: Array<{ role: string; content: string }>,
    title: string
  ) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, messages }),
      })
      if (res.ok) {
        const conv = await res.json()
        window.history.replaceState(null, '', `/chat/${conv.id}`)
      }
    } catch (e) { console.error('Save failed:', e) }
  }, [category])

  return (
    <div className="flex flex-col h-dvh bg-white dark:bg-gray-950">
      <Header showBack backHref="/" title={catInfo ? `${catInfo.emoji} ${catInfo.label}` : 'TappyAI'} />
      <div className="flex-1 overflow-hidden">
        <ChatInterface initialMessage={query} initialCategory={category} onSave={handleSave} />
      </div>
      <div className="h-16" />
      <BottomNav />
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-dvh"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <ChatPageContent />
    </Suspense>
  )
}
