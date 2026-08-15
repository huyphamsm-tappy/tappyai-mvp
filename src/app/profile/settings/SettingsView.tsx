'use client'

import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import SignOutButton from '../SignOutButton'
import { Bell, BookOpen, Brain, FileText, Shield, Trash2 } from 'lucide-react'
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
            {/* Canonical legal routes. These used to point at /profile/terms and
                /profile/privacy, which rendered their own separate copies of the
                documents — so signed-in users kept reading stale text after the
                canonical pages were updated. Those routes now 308 here, but
                first-party navigation links straight to the real page rather
                than leaning on the redirect. */}
            {/* Usage guidance sits with the other reference documents rather than
                in onboarding: onboarding runs once, collects interests and a city,
                and replace()s itself out of history, so it can never answer "how
                does this work?" later. This is the surface a user can come back to. */}
            <MenuItem icon={BookOpen} label={t('settings.howToUse')} href="/how-to-use" />
            <MenuItem icon={FileText} label={t('settings.terms')} href="/terms" />
            <MenuItem icon={Shield} label={t('settings.privacy')} href="/privacy" />
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">{t('settings.version', { v: '0.1.0' })}</p>
        </section>

        {/* Account actions. Grouped in one card the way the Android Settings screen
            groups them (SettingsScreen.kt: Sign out, divider, Request account
            deletion — both danger-styled), so the two platforms read the same.
            The deletion entry links to the public /delete-account page rather
            than acting directly: deletion is a request handled by support, and
            that page is the route Google Play requires to be documented. */}
        <div className="card p-2 space-y-1">
          <SignOutButton />
          {/* rounded-xl + overflow-hidden so MenuItem's square hover fill is clipped
              to the same pill shape as SignOutButton's; without it the two rows in
              this card highlight differently. Local wrapper rather than restyling
              the shared MenuItem, which every other settings row also uses. */}
          <div className="rounded-xl overflow-hidden">
            <MenuItem
              icon={Trash2}
              label={t('settings.deleteAccount')}
              href="/delete-account"
              danger
            />
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
