'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Home, PlayCircle, Search, Upload, Users, Bookmark, Star, History,
  Tag, Store, Wrench, CalendarRange, ShieldCheck, Inbox as InboxIcon,
  Bell, UserCircle, QrCode, Wallet, Settings, Languages, HelpCircle,
  MessageSquare, LogOut, Sparkles, MessageCircle, Grid3x3, Plus, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/useTranslation'
import BottomNav from '@/components/BottomNav'

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
      { href: '/profile', labelKey: 'v3.nav.inbox', icon: InboxIcon },
      { href: '/profile/settings', labelKey: 'v3.nav.notifications', icon: Bell },
      { href: '/profile', labelKey: 'v3.nav.profile', icon: UserCircle },
      { href: '/profile', labelKey: 'v3.nav.qr', icon: QrCode },
      { href: '/subscription', labelKey: 'v3.nav.wallet', icon: Wallet },
    ],
  },
  {
    titleKey: 'v3.nav.settings',
    items: [
      { href: '/profile/settings', labelKey: 'nav.settings', icon: Settings },
      { href: '/profile/settings', labelKey: 'v3.nav.language', icon: Languages },
      { href: '/how-to-use', labelKey: 'v3.nav.help', icon: HelpCircle },
      { href: '/profile', labelKey: 'v3.nav.feedback', icon: MessageSquare },
      { href: '/login', labelKey: 'v3.nav.logout', icon: LogOut },
    ],
  },
]

/** The primary tab bar — the same five destinations as the bottom nav, plus reserved Marketplace. */
const TABS: { href: string; labelKey: string; icon: typeof Home; badge?: boolean }[] = [
  { href: '/', labelKey: 'v3.footer.aiCore', icon: Sparkles },
  { href: '/reviews', labelKey: 'nav.explore', icon: PlayCircle },
  { href: '/deals', labelKey: 'nav.deals', icon: Tag },
  { href: '/marketplace', labelKey: 'v3.nav.marketplace', icon: Store },
  { href: '/profile', labelKey: 'v3.nav.inbox', icon: MessageCircle, badge: true },
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

  return (
    <div className="v3-theme min-h-dvh">
      <div className="flex">
        {/* ── Sidebar (desktop only) ────────────────────────────────────── */}
        <aside
          className="sticky top-0 hidden h-dvh w-[236px] flex-shrink-0 flex-col border-r lg:flex"
          style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel)' }}
        >
          <Link href="/" className="flex items-center gap-2 px-4 py-4">
            <Sparkles size={18} style={{ color: 'var(--v3-amber)' }} aria-hidden="true" />
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-extrabold" style={{ color: 'var(--v3-accent)' }}>TappyAI</span>
              <span className="text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.brand.tagline')}</span>
            </span>
          </Link>

          <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label={t('v3.nav.ariaMain')}>
            {GROUPS.map(group => (
              <div key={group.titleKey} className="mb-4">
                <p
                  className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider"
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
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
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
                style={{ background: 'var(--v3-accent)' }}
              >
                {t('v3.premium.cta')}
              </Link>
            </div>
          </div>
        </aside>

        {/* ── Main column ───────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <header
            className="sticky top-0 z-30 border-b backdrop-blur"
            style={{ borderColor: 'var(--v3-border)', background: 'rgba(10,15,28,0.85)' }}
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
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
                        {tab.badge && (
                          <span
                            className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full"
                            style={{ background: 'var(--v3-rose)' }}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      {t(tab.labelKey)}
                    </Link>
                  )
                })}
              </nav>

              <div className="flex items-center gap-2">
                <Link
                  href="/profile"
                  aria-label={t('v3.top.notifications')}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                >
                  <Bell size={17} aria-hidden="true" />
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
                  style={{ background: 'var(--v3-accent)' }}
                >
                  <Plus size={15} aria-hidden="true" />
                  {t('v3.top.post')}
                </Link>
              </div>
            </div>
          </header>

          <main className="px-4 pb-24 pt-4 lg:px-6 lg:pb-8">{children}</main>
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
