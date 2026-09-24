'use client'

import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import MenuItem from '@/components/MenuItem'
import SignOutButton from '../SignOutButton'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel from '@/components/v3/Panel'
import { Bell, BookOpen, Brain, FileText, Shield, Trash2, SlidersHorizontal, LifeBuoy } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Client view for Settings so all text is reactive to the language toggle.
// The server page still does auth + profile fetch and passes the user down.
//
// ── Phase 7 RC (§9): the V3 shell, and Settings stays its own page ──────────
//
// Same change as `/profile/account`: the chrome was `Header` + `BottomNav`, so opening "Cài đặt"
// from the V3 sidebar dropped the sidebar. Rows, destinations and the sign-out / deletion pair are
// untouched.
//
// 🚨 GIAO DIỆN (theme) IS NOT A ROW HERE, AND THAT IS NOT AN OVERSIGHT. The reference describes
// this page as "Ngôn ngữ, thông báo, giao diện". Language and notifications are rows below. The
// light/dark control is real but it lives in the V3 header (`useThemeMode`, the Sun/Moon button in
// `V3Shell`), which is now on this page too — there is one control, reachable from every V3
// screen, and a second switch here would be a second source of truth for the same preference.
export default function SettingsView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    <V3Shell
      title={t('settings.title')}
      activeTab="/profile"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      <div className="mx-auto w-full max-w-[560px] space-y-4">
        <Panel title={t('settings.options')} tone="accent" icon={<SlidersHorizontal size={16} />} bodyClassName="p-0">
          <div className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>
            <MenuItem icon={Bell} label={t('settings.notifications')} description={t('settings.notifications.desc')} href="/profile/notifications" />
            <MenuItem icon={Brain} label={t('settings.memory')} description={t('settings.memory.desc')} href="/profile/tappy-knows" />
            <LanguageSwitcher />
          </div>
        </Panel>

        <Panel title={t('settings.other')} tone="violet" icon={<LifeBuoy size={16} />} bodyClassName="p-0">
          <div className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>
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
        </Panel>

        <p className="text-center text-xs" style={{ color: 'var(--v3-fg-muted)' }}>{t('settings.version', { v: '0.1.0' })}</p>

        {/* Account actions. Grouped in one card the way the Android Settings screen
            groups them (SettingsScreen.kt: Sign out, divider, Request account
            deletion — both danger-styled), so the two platforms read the same.
            The deletion entry links to the public /delete-account page rather
            than acting directly: deletion is a request handled by support, and
            that page is the route Google Play requires to be documented. */}
        <div className="v3-panel space-y-1 p-2">
          <SignOutButton />
          {/* rounded-xl + overflow-hidden so MenuItem's square hover fill is clipped
              to the same pill shape as SignOutButton's; without it the two rows in
              this card highlight differently. Local wrapper rather than restyling
              the shared MenuItem, which every other settings row also uses. */}
          <div className="overflow-hidden rounded-xl">
            <MenuItem
              icon={Trash2}
              label={t('settings.deleteAccount')}
              href="/delete-account"
              danger
            />
          </div>
        </div>
      </div>

      <V3Footer />
    </V3Shell>
  )
}
