'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useCallback } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import ChatInterface from '@/components/ChatInterface'
import { CATEGORIES } from '@/lib/utils'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'

function ChatPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTranslation()
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
        router.replace(`/chat/${conv.id}`)
      }
    } catch (e) { console.error('Save failed:', e) }
  }, [category])

  // V3 §9 — Chat joins the V3 ground. `v3-theme` supplies the palette and `dark` switches the
  // thread's existing, already-designed dark treatment on, so the conversation reads as part of
  // the same product instead of a light page reached from a dark one. No behaviour changes: the
  // marker contract, the action boundary and the honesty rule are untouched.
  return (
    <div className="v3-theme dark flex flex-col h-dvh">
      {/*
        * 🚨 THE APPROVED OTTER, NOT A GENERIC EMOJI.
        *
        * This read `${catInfo.emoji} ${label}` — 🛍️ / 🎭 / 💆 — so every domain
        * chat opened under a stock Unicode glyph while the owner's own pose art
        * sat unused in `public/tappy/`. The five category ids ARE the canonical
        * pose names (food · shopping · travel · entertainment · spa), so this
        * needs no new mapping and no new asset: `TappyMascot` already resolves
        * the PNG and already falls back to an emoji if one is ever missing.
        */}
      <Header
        showBack
        backHref="/"
        title={catInfo ? (
          <span className="inline-flex items-center justify-center gap-2">
            <TappyMascot pose={catInfo.id} size={24} alt="" />
            {t(`tag.${catInfo.id}`)}
          </span>
        ) : 'TappyAI'}
      />
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
