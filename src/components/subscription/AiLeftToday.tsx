'use client'

// SUBSCRIPTIONS — Home: "AI còn lại hôm nay 28 / 30" + progress bar + mascot (mockup 10).
// Written by the security session. Draws NOTHING unless SUBSCRIPTIONS_ENABLED (via /api/config) —
// with the flag OFF Home's DOM is unchanged. Numbers come from GET /api/payments/me, which reads the
// same quota store /api/chat spends from. Tapping it opens the plan page.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useSubscriptionsFlag } from '@/lib/subscription/useSubscriptionsFlag'
import { TappyMascot } from '@/components/TappyMascot'

interface Quota { limit: number; remaining: number; period: 'day' | 'lifetime' }

export function AiLeftTodayChip({ quota }: { quota: Quota }) {
  const { t } = useTranslation()
  const pct = quota.limit > 0 ? Math.max(0, Math.min(100, Math.round((quota.remaining / quota.limit) * 100))) : 0
  return (
    <Link
      href="/subscription"
      data-ai-left-today
      className="flex max-w-sm items-center gap-3 rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {quota.period === 'lifetime' ? t('sub.home.leftGuest') : t('sub.home.left')}
        </span>
        <span className="block text-gray-900 dark:text-white">
          <span className="text-3xl font-black">{quota.remaining}</span>
          <span className="text-lg font-semibold text-content-secondary"> / {quota.limit}</span>
        </span>
        <span className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800" role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.remaining}>
          <span className="block h-full rounded-full bg-[#007AFF]" style={{ width: `${pct}%` }} />
        </span>
      </span>
      <TappyMascot pose="wave" size={72} />
    </Link>
  )
}

export default function AiLeftToday({ className = '' }: { className?: string }) {
  const { subscriptions } = useSubscriptionsFlag()
  const [quota, setQuota] = useState<Quota | null>(null)
  useEffect(() => {
    if (!subscriptions) return
    let live = true
    fetch('/api/payments/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live && b?.quota) setQuota(b.quota as Quota) })
      .catch(() => {})
    return () => { live = false }
  }, [subscriptions])
  if (!subscriptions || !quota) return null
  return <div className={className}><AiLeftTodayChip quota={quota} /></div>
}
