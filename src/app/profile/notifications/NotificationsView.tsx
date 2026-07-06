'use client'

import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import NotificationSettings from '@/components/notifications/NotificationSettings'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Client view for the Notifications screen so the header title is reactive to
// the language toggle. The server page still does auth + profile fetch and
// passes the user down.
export default function NotificationsView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/profile/settings" title={t('notifications.title')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <NotificationSettings />
      </main>

      <BottomNav />
    </div>
  )
}
