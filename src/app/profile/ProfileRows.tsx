'use client'

import Link from 'next/link'
import {
  User, MessageCircle, Bookmark, Settings, Crown, CalendarDays, CalendarRange, Heart, Users,
  TrendingDown, Brain, Plug, ChevronRight, Lock,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
// Same product gates on both views — a guest must never be shown an entry point
// that is hidden for real users.
import { SHOW_PRO_UPGRADE, SHOW_APP_CONNECTIONS } from '@/lib/config/product'

// ── V3 Web redesign · §8 — the Profile row inventory, defined ONCE ──────────
//
// The signed-in and guest screens used to hand-write the same eleven rows in the
// same order, twice, each with its own copy of both product-flag gates. They have
// to stay identical — the guest screen exists precisely so a signed-out visitor
// sees "your account, not set up yet" rather than a wall — and two hand-written
// lists drift. Restyling both to V3 was the moment to collapse them.
//
// This is presentation only. Every destination still runs its own server-side
// auth check; nothing here grants access to anything.

export interface ProfileRow {
  icon: typeof User
  labelKey: string
  descKey: string
  /** Route for a signed-in user. The guest view wraps this in `/login?returnTo=`. */
  href: string
}

/** The account group, in order, with both product flags applied. */
export function accountRows(): ProfileRow[] {
  return [
    { icon: User, labelKey: 'profile.account', descKey: 'profile.account.desc', href: '/profile/account' },
    { icon: MessageCircle, labelKey: 'profile.chatHistory', descKey: 'profile.chatHistory.desc', href: '/profile/history' },
    { icon: CalendarDays, labelKey: 'profile.bookings', descKey: 'profile.bookings.desc', href: '/profile/bookings' },
    { icon: Heart, labelKey: 'profile.preferences', descKey: 'profile.preferences.desc', href: '/profile/preferences' },
    { icon: Bookmark, labelKey: 'profile.saved', descKey: 'profile.saved.desc', href: '/profile/favorites' },
    { icon: TrendingDown, labelKey: 'profile.priceWatch', descKey: 'profile.priceWatch.desc', href: '/profile/price-watches' },
    // 🚨 THE PLANNER'S ONLY WAY IN ON MOBILE. `/planner` is reached from the V3 sidebar, and
    // the sidebar is `hidden lg:flex` — below that breakpoint navigation belongs to the five-tab
    // `BottomNav`, whose tab set is fixed (DD-003). So the destination existed and no phone could
    // open it. This row is the fix, and it is a ROW rather than a sixth tab for that reason.
    //
    // 🔑 SAME LABEL AND SAME ICON AS THE SIDEBAR ROW, deliberately: `v3.nav.planner` and
    // `CalendarRange` are what the desktop entry point already uses, so the two are legible as one
    // destination reached two ways rather than as two features. The description is the Planner
    // page's own subtitle — no new key was invented for this row.
    { icon: CalendarRange, labelKey: 'v3.nav.planner', descKey: 'v3.planner.subtitle', href: '/planner' },
    { icon: Brain, labelKey: 'profile.tappyKnows', descKey: 'profile.tappyKnows.desc', href: '/profile/tappy-knows' },
    // App Connections entry point hidden app-wide (owner product decision 2026-07-17).
    // Page + APIs stay intact; flip SHOW_APP_CONNECTIONS + the Android gate together.
    ...(SHOW_APP_CONNECTIONS
      ? [{ icon: Plug, labelKey: 'profile.integrations', descKey: 'profile.integrations.desc', href: '/profile/integrations' }]
      : []),
    // 🚨 "Review của tôi" removed with the V3 sidebar row it duplicated. This one was the
    // clearer case of the two: its href was `/reviews` — Explore itself — so the row was a
    // second name for a destination already in the nav.
    { icon: Users, labelKey: 'profile.groupDining', descKey: 'profile.groupDining.desc', href: '/group/new' },
    // Pro upgrade hidden during the free test period (no payment entity yet).
    ...(SHOW_PRO_UPGRADE
      ? [{ icon: Crown, labelKey: 'profile.upgradePro', descKey: 'profile.upgradePro.desc', href: '/subscription' }]
      : []),
  ]
}

/** The settings group. */
export function settingsRows(): ProfileRow[] {
  return [
    { icon: Settings, labelKey: 'profile.settings', descKey: 'profile.settings.desc', href: '/profile/settings' },
  ]
}

/** /login honours `returnTo` (relative paths only — validated in login/page.tsx),
 * so a guest who signs in from a locked row lands on the row they wanted. */
export const signInHref = (to: string) => `/login?returnTo=${encodeURIComponent(to)}`

export function ProfileRowList({
  rows,
  locked = false,
}: {
  rows: ProfileRow[]
  /** Guest view: rows still navigate, but to sign-in, and say so. */
  locked?: boolean
}) {
  const { t } = useTranslation()
  const lockedLabel = t('profile.guest.locked')
  return (
    <ul>
      {rows.map(({ icon: Icon, labelKey, descKey, href }) => (
        <li key={labelKey}>
          <Link
            href={locked ? signInHref(href) : href}
            className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
          >
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
              aria-hidden="true"
            >
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg)' }}>
                {t(labelKey)}
              </span>
              <span className="block truncate text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {locked ? lockedLabel : t(descKey)}
              </span>
            </span>
            {locked
              ? <Lock size={14} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
              : <ChevronRight size={15} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />}
          </Link>
        </li>
      ))}
    </ul>
  )
}
