'use client'

// SUBSCRIPTIONS - the /subscription page with SUBSCRIPTIONS_ENABLED: the same shell as PaymentsView
// (Header + BottomNav, same theme) around the plan screens. Written by the security session.

import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import SubscriptionFlow, { type MyPlanResponse } from '@/components/subscription/SubscriptionFlow'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { SubscriptionCatalog } from '@/lib/payments/subscriptionCatalog'

type Props = {
  userInfo: { full_name?: string | null; avatar_url?: string | null; email?: string | null }
  catalog: SubscriptionCatalog
  me: MyPlanResponse
}

export default function SubscriptionPlansView({ userInfo, catalog, me }: Props) {
  const { t } = useTranslation()
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={userInfo} showBack backHref="/profile" title={t('sub.row.upgrade')} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <SubscriptionFlow catalog={catalog} initialMe={me} />
      </main>
      <BottomNav />
    </div>
  )
}
