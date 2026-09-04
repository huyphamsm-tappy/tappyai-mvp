'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Home, PlayCircle, Search, Upload, Users, Bookmark, Star, History,
  Tag, Store, Wrench, CalendarRange, ShieldCheck, Inbox as InboxIcon,
  Bell, Sun, Moon, UserCircle, QrCode, Wallet, Settings, Languages, HelpCircle,
  MessageSquare, LogOut, Sparkles, MessageCircle, Grid3x3, Plus, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
import BottomNav from '@/components/BottomNav'
import { useNotifications } from '@/components/NotificationProvider'
import { useThemeMode } from '@/lib/theme/useThemeMode'

// ── V3 Web · Shell ──────────────────────────────────────────────────────────
//
// The persistent desktop chrome: a grouped left sidebar, a top bar carrying the
// page identity and the primary tab bar, and a wide content area.
//
// 🔑 OD-6 RESOLVED. `V3_WEB_DESIGN_PROPOSAL.md` recorded "responsive only, no
// persistent sidebar" as 🟡 PROVISIONAL — "subject to final Web design approval".
// The approved V3 reference has a persistent sidebar, and that reference IS the
// final Web design approval, so OD-6 now resolves in its favour. See
// `V3_WEB_REDESIGN_AUDIT.md` §0.1.
//
// Mobile is unchanged in kind: the sidebar is a desktop affordance and the
// existing five-tab `BottomNav` still owns navigation below `lg`. The tab set
// itself is untouched (DD-003) — the sidebar groups the same destinations plus
// the tools that already had routes but no navigation home.
//
// Every label is a dictionary KEY, never a literal: `webHardcodedUiStrings`
// ratchets hardcoded Vietnamese on this surface and only lets it fall, and an
// English session must not read a Vietnamese dashboard.

interface NavItem {
  href: string
  labelKey: string
  icon: typeof Home
  tagKey?: string
}

interface NavGroup {
  titleKey: string
  items: NavItem[]
}

/** The sidebar's groups. Every entry is an EXISTING route — nothing here is new. */
const GROUPS: NavGroup[] = [
  {
    titleKey: 'v3.nav.main',
    items: [
      { href: '/', labelKey: 'v3.nav.home', icon: Home },
      { href: '/reviews', labelKey: 'v3.nav.explore', icon: PlayCircle, tagKey: 'v3.tag.new' },
      { href: '/recommendations', labelKey: 'v3.nav.search', icon: Search },
    ],
  },
  {
    titleKey: 'v3.nav.community',
    items: [
      { href: '/reviews/new', labelKey: 'v3.nav.post', icon: Upload },
      { href: '/profile/posts', labelKey: 'v3.nav.following', icon: Users },
      { href: '/profile/favorites', labelKey: 'v3.nav.saved', icon: Bookmark },
      { href: '/profile/posts', labelKey: 'v3.nav.myReviews', icon: Star },
      { href: '/profile/history', labelKey: 'v3.nav.history', icon: History },
    ],
  },
  {
    titleKey: 'v3.nav.commerce',
    items: [
      { href: '/deals', labelKey: 'v3.nav.deals', icon: Tag },
      // Reserved only — the destination states plainly that it is not built yet.
      { href: '/marketplace', labelKey: 'v3.nav.marketplace', icon: Store, tagKey: 'v3.tag.comingSoon' },
    ],
  },
  {
    titleKey: 'v3.nav.tools',
    items: [
      { href: '/#smart-tools', labelKey: 'v3.nav.smartTools', icon: Wrench },
      { href: '/profile/price-watches', labelKey: 'v3.nav.planner', icon: CalendarRange },
      { href: '/scam-shield', labelKey: 'v3.nav.scamShield', icon: ShieldCheck },
    ],
  },
  {
    titleKey: 'v3.nav.account',
    items: [
      // 🚨 The inbox is `/profile/notifications`, not `/profile`. Pointing it at the account menu
      // meant the Inbox row opened a settings list, and standing on Profile lit the "Inbox" tab.
      // The route is auth-gated, which is right for a personal inbox. A separate "Notifications"
      // row used to sit here pointing at `/profile/settings`; it was a second label for the same
      // idea leading somewhere else again, so it is gone rather than duplicated.
      { href: '/profile/notifications', labelKey: 'v3.nav.inbox', icon: InboxIcon },
      { href: '/profile', labelKey: 'v3.nav.profile', icon: UserCircle },
      { href: '/profile', labelKey: 'v3.nav.qr', icon: QrCode },
      { href: '/subscription', labelKey: 'v3.nav.wallet', icon: Wallet },
    ],
  },
  {
    titleKey: 'v3.nav.settings',
    items: [
      // 🚨 This read `nav.settings` — a key with no `v3.` prefix and no entry in any dictionary,
      // so the row rendered the literal string "nav.settings" on screen. It sat below the
      // sidebar's scroll fold, which is why every review of a screenshot missed it.
      { href: '/profile/settings', labelKey: 'v3.action.settings', icon: Settings },
      { href: '/profile/settings', labelKey: 'v3.nav.language', icon: Languages },
      { href: '/how-to-use', labelKey: 'v3.nav.help', icon: HelpCircle },
      { href: '/profile', labelKey: 'v3.nav.feedback', icon: MessageSquare },
      { href: '/login', labelKey: 'v3.nav.logout', icon: LogOut },
    ],
  },
]

/** The primary tab bar — the same five destinations as the bottom nav, plus reserved Marketplace.
 *
 *  🚨 `badge` marks the tab that shows the UNREAD COUNT, not a tab that always shows a dot. The
 *  first draft of this shell painted a permanent rose dot here, which told every user they had
 *  something waiting whether or not they did — a claim about their account with nothing behind it.
 *  The count comes from the app-level notification store (ADR-014), the same source the bottom nav
 *  and Explore already read, so a zero renders nothing. */
const TABS: { href: string; labelKey: string; icon: typeof Home; badge?: boolean }[] = [
  { href: '/', labelKey: 'v3.tab.aiAgent', icon: Sparkles },
  { href: '/reviews', labelKey: 'nav.explore', icon: PlayCircle },
  { href: '/deals', labelKey: 'nav.deals', icon: Tag },
  { href: '/marketplace', labelKey: 'v3.nav.marketplace', icon: Store },
  { href: '/profile/notifications', labelKey: 'v3.nav.inbox', icon: MessageCircle, badge: true },
  { href: '/#smart-tools', labelKey: 'v3.nav.smartTools', icon: Grid3x3 },
]

export interface V3ShellProps {
  title: string
  subtitle?: string
  /** Which tab reads as current. */
  activeTab?: string
  user?: { name?: string | null; avatarUrl?: string | null; plan?: string | null } | null
  children: ReactNode
}

export default function V3Shell({ title, subtitle, activeTab = '/', user, children }: V3ShellProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  // Presentation only: delivery, consent and push identity are untouched — this reads a count the
  // store already maintains for the bottom nav.
  const { unreadCount } = useNotifications()
  const { isDark, mounted: themeMounted, toggle: toggleTheme } = useThemeMode()

  return (
    // 🚨 This used to be `v3-theme dark` — the surface pinned itself to dark and ignored the
    // user. The header now carries a Light/Dark control, so the class comes off and the palette
    // follows `dark` on <html>, which is the app's existing mechanism (`useThemeMode`). That one
    // class also drives the Tailwind `dark:` variants of the app-level components hosted in here
    // — BottomNav, DealNotifyButton, Header — so they stay in step instead of rendering a white
    // bar on a dark page, which is what the forced class was working around.
    <div className="v3-theme min-h-dvh">
      <div className="flex">
        {/* ── Sidebar (desktop only) ────────────────────────────────────── */}
        <aside
          className="sticky top-0 hidden h-dvh flex-shrink-0 flex-col border-r lg:flex"
          style={{
            width: 'var(--v3-sidebar-w)',
            borderColor: 'var(--v3-border)',
            background: 'var(--v3-panel)',
          }}
        >
          {/* 🚨 The mark is the SHIPPED brand asset, not a lucide glyph. This was a `Sparkles`
              icon beside hand-styled text — a wordmark invented at the call site, which is not
              the product's logo. `/branding/otter-logo.png` is the app's established mark: the
              favicon, the Header lockup, the login and onboarding screens all use it, and
              `controllerLoginComposition.test.tsx` already names it as approved brand art.
              `rounded-[22%] object-cover` is Header's treatment, reused verbatim — the source
              is a 1254² app icon with a white margin, and object-cover crops to the blue tile.

              The brand block is exactly header-height so the sidebar's first hairline lands on
              the same line as the top bar's. */}
          <Link
            href="/"
            className="flex flex-shrink-0 items-center gap-2.5 border-b px-4"
            style={{ height: 'var(--v3-header-h)', borderColor: 'var(--v3-border)' }}
          >
            <Image
              src="/branding/otter-logo.png"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="h-8 w-8 flex-shrink-0 rounded-[22%] object-cover"
            />
            <span className="flex min-w-0 flex-col leading-tight">
              {/* Two-tone, as the approved wordmark reference shows: "Tappy" in the foreground
                  colour, "AI" in the accent (measured #2172E1 off the reference). The otter mark
                  to the left is unchanged — the reference crop is cut at the "T" and cannot show
                  whether a mark precedes it, so the shipped asset stays and only the type changes.
                  Nothing here is drawn: the mark is still /branding/otter-logo.png. */}
              <span className="text-[17px] font-extrabold tracking-tight" style={{ color: 'var(--v3-fg)' }}>
                Tappy<span style={{ color: 'var(--v3-accent)' }}>AI</span>
              </span>
              <span className="truncate text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.brand.tagline')}</span>
            </span>
          </Link>

          <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label={t('v3.nav.ariaMain')}>
            {GROUPS.map(group => (
              // Sidebar rhythm is tight on purpose. Six groups and twenty-two rows is more than a
              // 900px-tall window can show, so every 4px of row padding is a row of navigation
              // pushed under the fold — and what sat under it was the whole Tài khoản group.
              <div key={group.titleKey} className="mb-2">
                <p
                  className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--v3-fg-muted)' }}
                >
                  {t(group.titleKey)}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon
                    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.split('#')[0])
                    return (
                      <li key={`${group.titleKey}-${item.labelKey}`}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                            active ? 'font-semibold' : 'hover:bg-white/5',
                          )}
                          style={active
                            ? { background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }
                            : { color: 'var(--v3-fg-secondary)' }}
                        >
                          <Icon size={16} aria-hidden="true" className="flex-shrink-0" />
                          <span className="truncate">{t(item.labelKey)}</span>
                          {item.tagKey && (
                            <span
                              className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                              style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                            >
                              {t(item.tagKey)}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Premium upsell, pinned. Links to the existing subscription route. */}
          <div className="p-3">
            <div
              className="rounded-xl p-3"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(51,145,255,0.18))',
                border: '1px solid var(--v3-border-strong)',
              }}
            >
              <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                <Sparkles size={13} style={{ color: 'var(--v3-amber)' }} aria-hidden="true" />
                {t('v3.premium.title')}
              </p>
              <p className="mt-0.5 text-[10px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.premium.desc')}
              </p>
              <Link
                href="/subscription"
                className="mt-2.5 flex min-h-[36px] items-center justify-center rounded-lg text-[12px] font-semibold text-white"
                style={{ background: 'var(--v3-accent-fill)' }}
              >
                {t('v3.premium.cta')}
              </Link>
            </div>
          </div>
        </aside>

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* The background was a hardcoded `rgba(10,15,28,0.85)` — the dark page colour written
              as a literal, so it stayed dark when the palette went light. It reads the token now. */}
          <header
            className="sticky top-0 z-30 border-b backdrop-blur"
            style={{
              borderColor: 'var(--v3-border)',
              background: 'color-mix(in srgb, var(--v3-page) 88%, transparent)',
            }}
          >
            {/* Fixed height from `lg` up so the header bottom, the sidebar's brand-block hairline
                and the top of the content column all land on one line. Below `lg` the tab strip
                wraps to its own row, so the height has to stay natural. */}
            <div className="v3-container flex flex-wrap items-center gap-3 py-3 lg:h-[calc(var(--v3-header-h)-1px)] lg:flex-nowrap lg:py-0">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold lg:text-xl" style={{ color: 'var(--v3-fg)' }}>{title}</h1>
                {subtitle && (
                  <p className="truncate text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>{subtitle}</p>
                )}
              </div>

              <nav className="v3-scroll-x order-3 flex w-full gap-1 lg:order-none lg:w-auto" aria-label={t('v3.nav.ariaTabs')}>
                {TABS.map(tab => {
                  const Icon = tab.icon
                  const active = tab.href === activeTab
                  return (
                    <Link
                      key={tab.labelKey}
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className="flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition-colors"
                      style={active
                        ? { background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }
                        : { color: 'var(--v3-fg-secondary)' }}
                    >
                      <span className="relative">
                        <Icon size={18} aria-hidden="true" />
                        {tab.badge && unreadCount > 0 && (
                          <span
                            className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                            style={{ background: 'var(--v3-rose)' }}
                          >
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </span>
                      {t(tab.labelKey)}
                    </Link>
                  )
                })}
              </nav>

              <div className="flex items-center gap-2">
                {/* Light/Dark. Same size and treatment as the notification control beside it.
                    🚨 The icon is `Moon` until `mounted`, deliberately: the stored choice cannot
                    be read during SSR, so rendering the real state on the first client pass is a
                    hydration mismatch and a visible flicker. Rendering the same icon on both
                    passes and correcting it after the effect avoids both — and rendering the
                    button either way keeps the header from shifting 36px on hydration. */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={t(themeMounted && isDark ? 'v3.theme.toLight' : 'v3.theme.toDark')}
                  aria-pressed={themeMounted ? isDark : false}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                  style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                >
                  {themeMounted && isDark
                    ? <Sun size={17} aria-hidden="true" />
                    : <Moon size={17} aria-hidden="true" />}
                </button>
                <Link
                  href="/profile/notifications"
                  aria-label={t('v3.top.notifications')}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                >
                  <Bell size={17} aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
                      style={{ background: 'var(--v3-rose)' }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  style={{ background: 'var(--v3-panel-elevated)' }}
                >
                  {user?.avatarUrl
                    ? <Image src={user.avatarUrl} alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-full object-cover" />
                    : <UserCircle size={24} style={{ color: 'var(--v3-fg-secondary)' }} aria-hidden="true" />}
                  <span className="hidden flex-col leading-tight sm:flex">
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                      {user?.name || t('v3.top.guest')}
                    </span>
                    {user?.plan && (
                      <span className="text-[10px]" style={{ color: 'var(--v3-amber)' }}>{user.plan}</span>
                    )}
                  </span>
                </Link>
                <Link
                  href="/reviews/new"
                  className="hidden min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white sm:flex"
                  style={{ background: 'var(--v3-accent-fill)' }}
                >
                  <Plus size={15} aria-hidden="true" />
                  {t('v3.top.post')}
                </Link>
              </div>
            </div>
          </header>

          {/* Same container as the header, so the page's left edge lines up with the title
              above it instead of each choosing its own padding. */}
          <main className="v3-container pb-24 pt-5 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* Mobile keeps the existing five-tab bar — the tab model is unchanged (DD-003). */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}

/** The capability strip along the bottom of the V3 surface. */
export function V3Footer() {
  const { t } = useTranslation()
  const items = [
    { icon: Sparkles, labelKey: 'v3.footer.aiCore', descKey: 'v3.footer.aiCoreDesc', tone: 'var(--v3-accent)' },
    { icon: Users, labelKey: 'v3.footer.community', descKey: 'v3.footer.communityDesc', tone: 'var(--v3-violet)' },
    { icon: Tag, labelKey: 'v3.footer.commerce', descKey: 'v3.footer.commerceDesc', tone: 'var(--v3-amber)' },
    { icon: Wrench, labelKey: 'v3.footer.utilities', descKey: 'v3.footer.utilitiesDesc', tone: 'var(--v3-emerald)' },
    { icon: ShieldCheck, labelKey: 'v3.footer.security', descKey: 'v3.footer.securityDesc', tone: 'var(--v3-rose)' },
  ]
  return (
    <footer
      className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl px-4 py-4"
      style={{ background: 'var(--v3-panel)', border: '1px solid var(--v3-border)' }}
    >
      <div className="min-w-[160px]">
        <p className="text-[13px] font-bold" style={{ color: 'var(--v3-fg)' }}>TappyAI V3</p>
        <p className="text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.page.subtitle')}</p>
      </div>
      {items.map(({ icon: Icon, labelKey, descKey, tone }) => (
        <div key={labelKey} className="flex items-center gap-2">
          <span className="v3-panel-icon" style={{ background: 'rgba(255,255,255,0.05)', color: tone }} aria-hidden="true">
            <Icon size={13} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t(labelKey)}</span>
            <span className="text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>{t(descKey)}</span>
          </span>
        </div>
      ))}
      <Link href="/reviews" className="ml-auto flex items-center gap-1 text-[11px]" style={{ color: 'var(--v3-accent)' }}>
        {t('v3.footer.platforms')} <ChevronRight size={12} aria-hidden="true" />
      </Link>
    </footer>
  )
}
