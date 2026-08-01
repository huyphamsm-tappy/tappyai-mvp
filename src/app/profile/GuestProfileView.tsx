'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import MenuItem from '@/components/MenuItem'
import { TappyMascot } from '@/components/TappyMascot'
import { User, MessageCircle, Bookmark, Settings, Crown, CalendarDays, Heart, Users, TrendingDown, Brain, Star, Plug } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
// Same product gates as the signed-in view — a guest must never be shown an
// entry point that is hidden for real users.
import { SHOW_PRO_UPGRADE, SHOW_APP_CONNECTIONS } from '@/lib/config/product'

/** /login honours `returnTo` (relative paths only — validated in login/page.tsx),
 * so a guest who signs in from a locked row lands on the row they wanted. */
const signInHref = (to: string) => `/login?returnTo=${encodeURIComponent(to)}`

// Signed-out Profile screen. The "Me" tab is one of five primary tabs, so
// ejecting anonymous visitors to a full-page /login made the whole product look
// gated even though Home, Chat, Explore and Deals are open (ANON_DAILY_LIMIT
// questions/day). This mirrors the signed-in layout instead: the same rows in
// the same order, locked, each linking to /login?returnTo=<that row>.
//
// This is presentation only. Every destination still runs its own server-side
// auth check — nothing here grants access to anything.
export default function GuestProfileView() {
  const { t } = useTranslation()
  const locked = t('profile.guest.locked')

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Guest identity card — occupies the same slot as the profile card so
            the screen reads as "your account, not set up yet" rather than a wall. */}
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center flex-shrink-0">
              <TappyMascot pose="wave" size={40} className="w-10 h-10" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">
                {t('profile.guest.title')}
              </h2>
              <p className="text-content-secondary text-sm mt-0.5">
                {t('profile.guest.subtitle')}
              </p>
            </div>
          </div>

          <Link
            href={signInHref('/profile')}
            className="mt-5 flex w-full items-center justify-center rounded-xl bg-interactive px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-interactive-hover"
          >
            {t('profile.guest.signIn')}
          </Link>
        </div>

        {/* Account group — same rows as ProfileView, locked. */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('profile.accountSection')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={User} label={t('profile.account')} description={t('profile.account.desc')} href={signInHref('/profile/account')} locked lockedLabel={locked} />
            <MenuItem icon={MessageCircle} label={t('profile.chatHistory')} description={t('profile.chatHistory.desc')} href={signInHref('/profile/history')} locked lockedLabel={locked} />
            <MenuItem icon={CalendarDays} label={t('profile.bookings')} description={t('profile.bookings.desc')} href={signInHref('/profile/bookings')} locked lockedLabel={locked} />
            <MenuItem icon={Heart} label={t('profile.preferences')} description={t('profile.preferences.desc')} href={signInHref('/profile/preferences')} locked lockedLabel={locked} />
            <MenuItem icon={Bookmark} label={t('profile.saved')} description={t('profile.saved.desc')} href={signInHref('/profile/favorites')} locked lockedLabel={locked} />
            <MenuItem icon={TrendingDown} label={t('profile.priceWatch')} description={t('profile.priceWatch.desc')} href={signInHref('/profile/price-watches')} locked lockedLabel={locked} />
            <MenuItem icon={Brain} label={t('profile.tappyKnows')} description={t('profile.tappyKnows.desc')} href={signInHref('/profile/tappy-knows')} locked lockedLabel={locked} />
            {SHOW_APP_CONNECTIONS && (
              <MenuItem icon={Plug} label={t('profile.integrations')} description={t('profile.integrations.desc')} href={signInHref('/profile/integrations')} locked lockedLabel={locked} />
            )}
            <MenuItem icon={Star} label={t('profile.myReviews')} description={t('profile.myReviews.desc')} href={signInHref('/reviews')} locked lockedLabel={locked} />
            <MenuItem icon={Users} label={t('profile.groupDining')} description={t('profile.groupDining.desc')} href={signInHref('/group/new')} locked lockedLabel={locked} />
            {SHOW_PRO_UPGRADE && (
              <MenuItem icon={Crown} label={t('profile.upgradePro')} description={t('profile.upgradePro.desc')} href={signInHref('/subscription')} locked lockedLabel={locked} />
            )}
          </div>
        </section>

        {/* Settings group */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('profile.settingsSection')}
          </h3>
          <div className="card divide-y divide-gray-100 dark:divide-gray-800">
            <MenuItem icon={Settings} label={t('profile.settings')} description={t('profile.settings.desc')} href={signInHref('/profile/settings')} locked lockedLabel={locked} />
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
