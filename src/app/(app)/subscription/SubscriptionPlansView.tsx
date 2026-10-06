'use client'

// SUBSCRIPTIONS - the /subscription page with SUBSCRIPTIONS_ENABLED: the same shell as PaymentsView
// (Header + BottomNav, same theme) around the plan screens. Written by the security session.

import { useCallback, useRef } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import SubscriptionFlow, { type MyPlanResponse } from '@/components/subscription/SubscriptionFlow'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { SubscriptionCatalog } from '@/lib/payments/subscriptionCatalog'

type Props = {
  userInfo: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  catalog: SubscriptionCatalog
  me: MyPlanResponse
  /** Phase 7: false while SUBSCRIPTIONS_ENABLED is off (plans visible, checkout not offered). */
  paymentsOpen?: boolean
}

export default function SubscriptionPlansView({ userInfo, catalog, me, paymentsOpen = true }: Props) {
  const { t } = useTranslation()
  // Checkout is in-page steps (plan -> method -> QR). Header Back first steps back inside the flow (so
  // checkout returns to the plan selection it came from); only from the plan list does it leave the
  // page, via the in-app history (the page we actually came from), with /profile as the fallback.
  const stepBack = useRef<(() => boolean) | null>(null)
  const onBack = useCallback(() => stepBack.current?.() === true, [])
  const register = useCallback((fn: (() => boolean) | null) => { stepBack.current = fn }, [])
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backFallbackHref="/profile" onBack={onBack} title={t('sub.row.upgrade')} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <SubscriptionFlow catalog={catalog} initialMe={me} paymentsOpen={paymentsOpen} onBackHandler={register} />
      </main>
      <BottomNav />
    </div>
  )
}
