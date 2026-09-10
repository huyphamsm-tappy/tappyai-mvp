'use client'

import Link from 'next/link'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel from '@/components/v3/Panel'
import { TappyMascot } from '@/components/TappyMascot'
import { Settings, UserCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ProfileRowList, accountRows, settingsRows, signInHref } from './ProfileRows'

// Signed-out Profile screen. The "Me" tab is one of five primary tabs, so
// ejecting anonymous visitors to a full-page /login made the whole product look
// gated even though Home, Chat, Explore and Deals are open (ANON_DAILY_LIMIT
// questions/day). This mirrors the signed-in layout instead: the same rows in
// the same order, locked, each linking to /login?returnTo=<that row>.
//
// The row inventory is now shared with ProfileView (see ProfileRows) rather than
// hand-written twice, so the two screens cannot drift apart — which matters more
// here than anywhere, since "same rows, same order" IS this screen's whole point.
//
// This is presentation only. Every destination still runs its own server-side
// auth check — nothing here grants access to anything.

export default function GuestProfileView() {
  const { t } = useTranslation()

  return (
    <V3Shell title={t('v3.panel.profile')} subtitle={t('profile.guest.title')} activeTab="/profile">
      <div className="space-y-4">
        {/* Guest identity card — occupies the same slot as the profile card so
            the screen reads as "your account, not set up yet" rather than a wall. */}
        <section className="v3-panel">
          <div className="p-5">
            <div className="flex items-center gap-4">
              <span
                className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.30), rgba(51,145,255,0.26))' }}
              >
                <TappyMascot pose="wave" size={40} className="h-10 w-10" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold" style={{ color: 'var(--v3-fg)' }}>{t('profile.guest.title')}</h2>
                <p className="mt-0.5 text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                  {t('profile.guest.subtitle')}
                </p>
              </div>
            </div>

            <Link
              href={signInHref('/profile')}
              className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-xl px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--v3-accent-fill)' }}
            >
              {t('profile.guest.signIn')}
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title={t('profile.accountSection')} tone="accent" icon={<UserCircle size={13} />} bodyClassName="p-2">
            <ProfileRowList rows={accountRows()} locked />
          </Panel>

          <Panel title={t('profile.settingsSection')} tone="violet" icon={<Settings size={13} />} bodyClassName="p-2">
            <ProfileRowList rows={settingsRows()} locked />
          </Panel>
        </div>

        <V3Footer />
      </div>
    </V3Shell>
  )
}
