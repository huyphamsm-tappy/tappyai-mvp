'use client'

import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import SignOutButton from '../SignOutButton'
import { Bell, Brain, FileText, Shield } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Client view for Settings so all text is reactive to the language toggle.
// The server page still does auth + profile fetch and passes the user down.
export default function SettingsView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header user={user} showBack backHref="/profile" title={t('settings.title')} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('settings.options')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Bell} label={t('settings.notifications')} description={t('settings.notifications.desc')} href="/profile/notifications" />
            <MenuItem icon={Brain} label={t('settings.memory')} description={t('settings.memory.desc')} href="/profile/tappy-knows" />
            <LanguageSwitcher />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('settings.other')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={FileText} label={t('settings.terms')} href="/profile/terms" />
            <MenuItem icon={Shield} label={t('settings.privacy')} href="/profile/privacy" />
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">{t('settings.version', { v: '0.1.0' })}</p>
        </section>

        <div className="card p-2">
          <SignOutButton />
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
