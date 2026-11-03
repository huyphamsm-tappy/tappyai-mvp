'use client'

// SUBSCRIPTIONS — the plan card on the Account page (mockups 1 and 8). Written by the security session.
//   no active plan → highlighted "Nâng cấp Tappy — Mở khóa nhiều trải nghiệm hơn" (crown, blue)
//   active plan    → mascot, "Tappy {Tên}", green "Đang hoạt động", "Hạn: {ngày}", → Quản lý gói
// Draws nothing unless SUBSCRIPTIONS_ENABLED. State from GET /api/payments/me (server = truth).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Crown } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useSubscriptionsFlag } from '@/lib/subscription/useSubscriptionsFlag'
import type { MySubscription } from '@/lib/payments/subscriptionState'
import { formatDay } from './SubscriptionFlow'

export function AccountPlanCardView({ subscription }: { subscription: MySubscription }) {
  const { t, locale } = useTranslation()
  if (subscription.state === 'ACTIVE' && subscription.plan) {
    return (
      <Link href="/subscription" data-account-plan="active" className="flex items-center gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied art in /public/subscription */}
        <img src={`/subscription/${subscription.plan.id}.webp`} alt="" width={64} height={64} className="h-16 w-16 rounded-2xl object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-gray-900 dark:text-white">{t('sub.plan.fullName', { plan: subscription.plan.name })}</span>
          <span className="inline-block rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">{t('sub.manage.state.ACTIVE')}</span>
          {subscription.periodEnd && <span className="block text-xs text-content-secondary">{t('sub.manage.until', { date: formatDay(subscription.periodEnd, locale) })}</span>}
        </span>
        <ChevronRight size={18} className="text-content-secondary" aria-hidden="true" />
      </Link>
    )
  }
  return (
    <Link href="/subscription" data-account-plan="upgrade" className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-[#007AFF] to-blue-500 p-4 text-white shadow-md">
      <Crown size={30} className="shrink-0 text-amber-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{t('sub.row.upgrade')}</span>
        <span className="block text-sm text-white/85">{t('sub.row.upgrade.desc')}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </Link>
  )
}

export default function AccountPlanCard({ className = '' }: { className?: string }) {
  const { subscriptions } = useSubscriptionsFlag()
  const [sub, setSub] = useState<MySubscription | null>(null)
  useEffect(() => {
    if (!subscriptions) return
    let live = true
    fetch('/api/payments/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live && b?.subscription) setSub(b.subscription as MySubscription) })
      .catch(() => {})
    return () => { live = false }
  }, [subscriptions])
  if (!subscriptions || !sub) return null
  return <div className={className}><AccountPlanCardView subscription={sub} /></div>
}
