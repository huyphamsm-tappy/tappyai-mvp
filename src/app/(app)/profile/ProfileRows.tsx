'use client'

import Link from 'next/link'
import {
  User, MessageCircle, Bookmark, Settings, Crown, CalendarDays, CalendarRange, Heart, Users,
  TrendingDown, Brain, Plug, ChevronRight, Lock, Sparkles, Star,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { TappyMascot } from '@/components/TappyMascot'
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
  /** Icon-tile tint in the "Tài khoản & Cài đặt" hub (owner reference 2026-09-22). */
  tone?: RowTone
}

export type RowTone = 'accent' | 'violet' | 'rose' | 'pink' | 'slate'

/** Tile tints — same rgba/hex family as `components/v3/Panel` so the hub reads as V3. */
const ROW_TONE: Record<RowTone, { bg: string; fg: string }> = {
  accent: { bg: 'rgba(51,145,255,0.16)', fg: '#3391FF' },
  violet: { bg: 'rgba(139,92,246,0.18)', fg: '#A78BFA' },
  rose: { bg: 'rgba(251,113,133,0.16)', fg: '#FB7185' },
  pink: { bg: 'rgba(236,72,153,0.16)', fg: '#F472B6' },
  slate: { bg: 'var(--v3-panel-elevated)', fg: 'var(--v3-fg-secondary)' },
}

/** The account group, in order, with both product flags applied. */
export function accountRows(): ProfileRow[] {
  return [
    { icon: User, labelKey: 'profile.account', descKey: 'profile.account.desc', href: '/profile/account', tone: 'accent' },
    { icon: MessageCircle, labelKey: 'profile.chatHistory', descKey: 'profile.chatHistory.desc', href: '/profile/history', tone: 'slate' },
    { icon: CalendarDays, labelKey: 'profile.bookings', descKey: 'profile.bookings.desc', href: '/profile/bookings', tone: 'rose' },
    { icon: Heart, labelKey: 'profile.preferences', descKey: 'profile.preferences.desc', href: '/profile/preferences', tone: 'pink' },
    { icon: Bookmark, labelKey: 'profile.saved', descKey: 'profile.saved.desc', href: '/profile/favorites', tone: 'accent' },
    { icon: TrendingDown, labelKey: 'profile.priceWatch', descKey: 'profile.priceWatch.desc', href: '/profile/price-watches', tone: 'accent' },
    // 🚨 THE PLANNER'S ONLY WAY IN ON MOBILE. `/planner` is reached from the V3 sidebar, and
    // the sidebar is `hidden lg:flex` — below that breakpoint navigation belongs to the five-tab
    // `BottomNav`, whose tab set is fixed (DD-003). So the destination existed and no phone could
    // open it. This row is the fix, and it is a ROW rather than a sixth tab for that reason.
    //
    // 🔑 SAME LABEL AND SAME ICON AS THE SIDEBAR ROW, deliberately: `v3.nav.planner` and
    // `CalendarRange` are what the desktop entry point already uses, so the two are legible as one
    // destination reached two ways rather than as two features. The description is the Planner
    // page's own subtitle — no new key was invented for this row.
    { icon: CalendarRange, labelKey: 'v3.nav.planner', descKey: 'v3.planner.subtitle', href: '/planner', tone: 'accent' },
    { icon: Brain, labelKey: 'profile.tappyKnows', descKey: 'profile.tappyKnows.desc', href: '/profile/tappy-knows', tone: 'violet' },
    // App Connections entry point hidden app-wide (owner product decision 2026-07-17).
    // Page + APIs stay intact; flip SHOW_APP_CONNECTIONS + the Android gate together.
    ...(SHOW_APP_CONNECTIONS
      ? [{ icon: Plug, labelKey: 'profile.integrations', descKey: 'profile.integrations.desc', href: '/profile/integrations' }]
      : []),
    // 🚨 "Review của tôi" removed with the V3 sidebar row it duplicated. This one was the
    // clearer case of the two: its href was `/reviews` — Explore itself — so the row was a
    // second name for a destination already in the nav.
    { icon: Users, labelKey: 'profile.groupDining', descKey: 'profile.groupDining.desc', href: '/group/new', tone: 'accent' },
    // Pro upgrade hidden during the free test period (no payment entity yet).
    ...(SHOW_PRO_UPGRADE
      ? [{ icon: Crown, labelKey: 'profile.upgradePro', descKey: 'profile.upgradePro.desc', href: '/subscription' }]
      : []),
  ]
}

/**
 * The COMPACT account group shown on the /profile hub (owner 2026-10-02): one row, like Cài đặt.
 * It opens /profile/account, which lists the other eight rows of `accountRows()` (same order,
 * names, icons) via `accountMoreRows()` — so every function stays reachable, one tap deeper.
 */
export function accountHubRows(): ProfileRow[] {
  const [first] = accountRows()
  return [{ ...first, descKey: 'profile.account.compactDesc' }]
}

/** The rows the compact hub folds into the Account page: everything except "Tài khoản" itself. */
export function accountMoreRows(): ProfileRow[] {
  return accountRows().slice(1)
}

/** The settings group. */
export function settingsRows(): ProfileRow[] {
  return [
    { icon: Settings, labelKey: 'profile.settings', descKey: 'profile.settings.desc', href: '/profile/settings', tone: 'slate' },
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
    <ul className="space-y-2">
      {rows.map(({ icon: Icon, labelKey, descKey, href, tone = 'slate' }) => (
        <li key={labelKey}>
          <Link
            href={locked ? signInHref(href) : href}
            data-hub-row={href}
            className="flex min-h-[64px] items-center gap-3.5 rounded-2xl border px-3 py-2.5 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--v3-border)', background: 'rgba(255,255,255,0.02)' }}
          >
            <span
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: ROW_TONE[tone].bg, color: ROW_TONE[tone].fg }}
              aria-hidden="true"
            >
              <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                {t(labelKey)}
              </span>
              <span className="block truncate text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {locked ? lockedLabel : t(descKey)}
              </span>
            </span>
            {locked
              ? <Lock size={15} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
              : <ChevronRight size={17} style={{ color: 'var(--v3-fg-secondary)' }} aria-hidden="true" />}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * One group card of the hub: TÀI KHOẢN or CÀI ĐẶT. Keeps the `v3-panel` surface (and the
 * `li a[href]` shape) that `profileRowParity.test.tsx` reads.
 */
function HubGroup({
  id, icon: Icon, title, subtitle, rows, locked, decoration,
}: {
  id: 'account' | 'settings'
  icon: typeof User
  title: string
  subtitle: string
  rows: ProfileRow[]
  locked: boolean
  decoration?: ReactNode
}) {
  return (
    <section
      className="v3-panel relative flex flex-col overflow-hidden p-4 sm:p-5"
      data-hub-group={id}
      aria-labelledby={`hub-${id}-title`}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={id === 'account'
            ? { background: 'rgba(51,145,255,0.16)', color: '#3391FF' }
            : { background: 'rgba(139,92,246,0.18)', color: '#A78BFA' }}
          aria-hidden="true"
        >
          <Icon size={19} />
        </span>
        <h3 id={`hub-${id}-title`} className="text-[16px] font-bold uppercase tracking-wide" style={{ color: 'var(--v3-fg)' }}>
          {title}
        </h3>
        <p className="w-full text-[12.5px] sm:ml-auto sm:w-auto" style={{ color: 'var(--v3-accent)' }}>
          {subtitle}
        </p>
      </header>
      <ProfileRowList rows={rows} locked={locked} />
      {decoration}
    </section>
  )
}

/**
 * ── "Tài khoản & Cài đặt" — the hub, drawn to the owner reference of 2026-09-22 ─────────────
 *
 * Header (round user glyph · title · subtitle) with the mascot banner on the right, then two
 * columns: the TÀI KHOẢN card with the shared account inventory and the CÀI ĐẶT card. Columns
 * stack below `wideAt`. The inventory itself is still `accountRows()` / `settingsRows()` — this
 * is presentation only, and guest + signed-in render the same component.
 */
export function AccountSettingsHub({
  locked = false,
  wideAt = 'xl',
}: {
  locked?: boolean
  /** Breakpoint at which the two cards sit side by side. */
  wideAt?: 'lg' | 'xl' | '2xl'
}) {
  const { t } = useTranslation()
  const cols = wideAt === 'lg' ? 'lg:grid-cols-2' : wideAt === '2xl' ? '2xl:grid-cols-2' : 'xl:grid-cols-2'
  return (
    <section data-account-hub aria-labelledby="account-hub-title" className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full sm:h-20 sm:w-20"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(51,145,255,0.55), rgba(29,78,216,0.55))',
              boxShadow: '0 0 0 6px rgba(51,145,255,0.12)',
              color: '#fff',
            }}
            aria-hidden="true"
          >
            <User size={30} />
          </span>
          <div className="min-w-0">
            <h2 id="account-hub-title" className="text-[22px] font-extrabold leading-tight sm:text-[28px]" style={{ color: 'var(--v3-fg)' }}>
              {t('profile.hub.title')}
            </h2>
            <p className="mt-1 text-[13px] sm:text-[14px]" style={{ color: 'var(--v3-fg-secondary)' }}>
              {t('profile.hub.subtitle')}
            </p>
          </div>
        </div>
        <div
          data-hub-banner
          className="relative hidden h-[120px] flex-shrink-0 items-center gap-2 overflow-hidden rounded-2xl border pl-5 sm:flex md:w-[340px]"
          style={{
            borderColor: 'var(--v3-border)',
            background: 'linear-gradient(135deg, rgba(30,58,138,0.55), rgba(51,145,255,0.18) 60%, rgba(139,92,246,0.22))',
          }}
          aria-hidden="true"
        >
          <p className="flex-1 -rotate-6 text-[15px] font-semibold italic leading-snug" style={{ color: '#93C5FD', fontFamily: 'cursive' }}>
            {t('profile.hub.tagline')}
          </p>
          <Sparkles size={16} className="absolute right-3 top-3" style={{ color: '#FBBF24' }} />
          <TappyMascot pose="welcome" size={120} className="h-[120px] w-[120px] self-end" />
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${cols}`}>
        <HubGroup
          id="account"
          icon={User}
          title={t('profile.accountSection')}
          subtitle={t('profile.hub.accountSubtitle')}
          rows={accountHubRows()}
          locked={locked}
        />
        <HubGroup
          id="settings"
          icon={Settings}
          title={t('profile.settingsSection')}
          subtitle={t('profile.hub.settingsSubtitle')}
          rows={settingsRows()}
          locked={locked}
          decoration={
            <div className="pointer-events-none mt-auto hidden select-none items-end justify-end pt-10 lg:flex" aria-hidden="true">
              <Star size={120} strokeWidth={0.8} style={{ color: 'rgba(51,145,255,0.14)' }} />
              <p className="-ml-16 mb-6 -rotate-12 text-[18px] italic" style={{ color: 'rgba(147,197,253,0.55)', fontFamily: 'cursive' }}>
                {t('profile.hub.settingsTagline')}
              </p>
            </div>
          }
        />
      </div>
    </section>
  )
}
