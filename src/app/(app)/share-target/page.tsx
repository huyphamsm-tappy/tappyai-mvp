'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setSessionSource } from '@/lib/analytics/attribution'
import { shareTargetDestination } from '@/lib/growth/shareTarget'

// /share-target — the Web Share Target landing (see manifest.json `share_target`).
// Client-only and instantaneous: read params, attribute, hand off to /chat.
// Nothing is rendered for a crawler and nothing is stored here.
function ShareTargetInner() {
  const params = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    setSessionSource('web_share_target')
    router.replace(shareTargetDestination({ title: params.get('title'), text: params.get('text'), url: params.get('url') }))
  }, [params, router])
  return null
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={null}>
      <div className="flex h-dvh items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /></div>
      <ShareTargetInner />
    </Suspense>
  )
}
