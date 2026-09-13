'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, PlayCircle, Search, Upload, Users, Bookmark, History,
  Tag, Store, Wrench, CalendarRange, ShieldCheck, Inbox as InboxIcon,
  Bell, Sun, Moon, UserCircle, QrCode, Wallet, Settings, Languages, HelpCircle,
  MessageSquare, LogOut, Sparkles, MessageCircle, Grid3x3, Plus, ChevronRight,
  Music2, Sparkle, PenLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SHOW_MARKETPLACE, SHOW_WALLET } from '@/lib/config/product'
import { useTranslation } from '@/lib/i18n/useTranslation'
import BottomNav from '@/components/BottomNav'
import { useNotifications } from '@/components/NotificationProvider'
import { useThemeMode } from '@/lib/theme/useThemeMode'
import { useAuthStatus } from '@/hooks/useAuthStatus'
import { performSignOut } from '@/lib/auth/signOut'
import { smartTools, SMART_TOOLS_HREF } from '@/lib/tools/registry'

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
  /**
   * The session row. Renders Logout for a signed-in member and Login for a
   * visitor — see `AuthNavRow`, and the note on the row itself below.
   */
  authRow?: true
}

interface NavGroup {
  titleKey: string
  items: NavItem[]
}

/** The sidebar's groups. Every entry is an EXISTING route — nothing here is new. */
const GROUPS: NavGroup[] = [
  {
    // 🚨 REGROUPED, NOT REROUTED. Every href in this file is byte-identical to what it was;
    // what changed is which block a row sits in and what the block is called. The rail said
    // "Trang chính / Cộng đồng / Thương mại / Công cụ" — four groups named after an internal
    // taxonomy, which told a first-time user nothing about what the product IS. It now opens
    // with the agent, then what Tappy can DO, then the community around it, so the sidebar
    // says the same thing the hero says.
    //
    // Deals and the Inbox moved UP into this group (they are places the agent takes you), and
    // Search moved DOWN into Capabilities (it is a thing Tappy does). Nothing was dropped.
    titleKey: 'v3.nav.groupAgent',
    items: [
      { href: '/', labelKey: 'v3.nav.home', icon: Home },
      { href: '/reviews', labelKey: 'v3.nav.explore', icon: PlayCircle, tagKey: 'v3.tag.new' },
      { href: '/deals', labelKey: 'v3.nav.deals', icon: Tag },
      { href: '/profile/notifications', labelKey: 'v3.nav.inbox', icon: InboxIcon },
    ],
  },
  {
    titleKey: 'v3.nav.groupCapabilities',
    items: [
      // Search is a capability, not a destination — it moved here out of the old "main" group.
      { href: '/recommendations', labelKey: 'v3.nav.search', icon: Search },
      // 🚨 THIS WAS `/#smart-tools`, AN ANCHOR NOTHING CARRIED. No element in the codebase
      // had `id="smart-tools"`, so the row scrolled to the top of Home and read as working.
      // `/tools` is the real page — the "Page 7 (Tools)" the debt note below names.
      { href: SMART_TOOLS_HREF, labelKey: 'v3.nav.smartTools', icon: Wrench },
      // 🚨 THIS POINTED AT `/profile/price-watches`, AND THAT WAS A ROW LYING ABOUT ITS
      // DESTINATION. "AI Planner (My Plans)" opened the price-watch list — a different feature
      // with a different data model, reached under a name that promised plans. It is the same
      // class of bug the Inbox row had (see the note in the Account group): a label pointing
      // somewhere else is worse than a missing label, because nobody files a bug against a link
      // that opens *something*. `/planner` now exists and this is where it is reached.
      { href: '/planner', labelKey: 'v3.nav.planner', icon: CalendarRange },
      // 🚨 GATED, VIA THE REGISTRY. `SHOW_SCAM_SHIELD` was exported to native through
      // GET /api/config and read by NO Web surface: flipping it false hid the tool on
      // Android and left this row, Home's tile and /tools untouched. `smartTools()` is the
      // one place that decides, so the three can no longer disagree. Same convention as
      // SHOW_APP_CONNECTIONS in ProfileRows — a hidden ENTRY POINT, route left intact.
      ...(smartTools().some((t) => t.id === 'safety')
        ? [{ href: '/scam-shield', labelKey: 'v3.nav.scamShield', icon: ShieldCheck }]
        : []),
      // 🚨 KNOWN NAVIGATION DEBT — remove when Page 7 (Tools) exists.
      //
      // Home was curated down to five tools, and MEASUREMENT showed these four had no
      // navigation anywhere else: not one reference in the shell, the bottom nav, or any
      // rendered page. (`HomeView.tsx`, the pre-V3 Home that used to list them, is still in the
      // tree but is referenced by nothing.) Cutting them from Home without this would have
      // orphaned four working routes.
      //
      // The codebase was searched for an existing mechanism that could hold them instead — a
      // tools route, a consumer command palette, an "all tools" surface. There is none; the
      // only command palette is admin-only. Rather than invent an IA for four links, they sit
      // here temporarily and this comment is the record.
      //
      // COST, stated plainly: it makes Tools & Utilities the largest group in the sidebar (7
      // rows) and adds ~120px to a nav that already overflowed at 22 rows. When Page 7 lands,
      // these four belong there and these lines should go. Existing routes, existing dictionary
      // keys; nothing new was invented for them.
      { href: '/group/new', labelKey: 'v3.tool.together', icon: Users },
      { href: '/music', labelKey: 'v3.tool.music', icon: Music2 },
      { href: '/boi', labelKey: 'v3.tool.fortune', icon: Sparkle },
      { href: '/viet-content', labelKey: 'v3.tool.captions', icon: PenLine },
    ],
  },
  {
    titleKey: 'v3.nav.community',
    items: [
      { href: '/reviews/new', labelKey: 'v3.nav.post', icon: Upload },
      // 🚨 THIS ROW POINTED AT `/profile/posts` — a list of the viewer's own posts, not
      // friends. Two nav entries went to that same page and one of them was labelled
      // "Following / Friends", so the label named a destination that did not exist. It now
      // points at the page it is named for. (The other of the two was "My Reviews"; both it
      // and the page they shared have since been removed — see the note below.)
      { href: '/social', labelKey: 'v3.nav.following', icon: Users },
      { href: '/profile/favorites', labelKey: 'v3.nav.saved', icon: Bookmark },
      // 🚨 "MY REVIEWS" IS GONE, AND IT WAS A DUPLICATE RATHER THAN A LOSS.
      // It pointed at `/profile/posts`, whose content is the same user-posted
      // clips Explore already shows — one more surface over the `reviews` table,
      // with its own copy of the tile, the delete and the hide. That page is gone
      // too: the profile grid already renders an author's own and hidden posts and
      // offers the same delete/hide. The post system underneath is untouched.
      { href: '/profile/history', labelKey: 'v3.nav.history', icon: History },
    ],
  },
  {
    titleKey: 'v3.nav.commerce',
    items: [
      // Deals moved into the AI Agent group above — same route, same tag, one entry only.
      // 🚨 MARKETPLACE IS HIDDEN, NOT DELETED. It was listed here with a "Sắp có"
      // tag, which is still an unbuilt feature occupying a navigation slot — and
      // the tab bar below carried it a second time with no tag at all. The route,
      // the component and its test are untouched; `SHOW_MARKETPLACE` brings both
      // entries back together when the phase that builds it arrives.
      ...(SHOW_MARKETPLACE
        ? [{ href: '/marketplace', labelKey: 'v3.nav.marketplace', icon: Store, tagKey: 'v3.tag.comingSoon' }]
        : []),
    ],
  },
  {
    titleKey: 'v3.nav.account',
    items: [
      // 🚨 The Inbox row MOVED UP into the AI Agent group; it did not disappear, and it still
      // points at `/profile/notifications`. (The note that lived here recorded why it is that
      // route and not `/profile` — that fix stands, the row simply sits with the agent now,
      // which is where a message from Tappy belongs. One entry, not two.)
      { href: '/profile', labelKey: 'v3.nav.profile', icon: UserCircle },
      // 🚨 POINTED AT `/profile`, where the QR was an icon in the header rather than a
      // destination — the row named a page that did not exist. `/profile/qr` is it.
      { href: '/profile/qr', labelKey: 'v3.nav.qr', icon: QrCode },
      // 🚨 WALLET IS HIDDEN, NOT DELETED - AND IT NEVER POINTED AT A WALLET. This row read
      // "Wallet / Tappy Points" and its destination was `/subscription`; no wallet route, API or
      // table exists in this repo. Gated rather than removed so the entry comes back with one
      // boolean once the feature is real - see `SHOW_WALLET`.
      ...(SHOW_WALLET
        ? [{ href: '/subscription', labelKey: 'v3.nav.wallet', icon: Wallet }]
        : []),
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
      /**
       * 🚨 THIS ROW SAID "LOGOUT" TO EVERYONE, AND IT WAS A LINK TO `/login`.
       *
       * Not a bug of wording: there was no auth check anywhere in this file, and
       * `V3Shell`'s own `user` prop is passed by no caller in the app, so the row
       * was static. It offered Logout to a visitor who had never signed in, and
       * clicking it signed nobody out — it navigated to `/login`, which then saw
       * the browser's anonymous session, called it "signed in" and replaced the
       * route with `/`. Hence the reported loop: click Logout, land on Home, still
       * see Logout, refresh, still see Logout.
       *
       * It is now the one row whose label is DERIVED from the session, and whose
       * Logout actually tears one down. Same group, same position, same styling.
       */
      { href: '/login', labelKey: 'v3.nav.logout', icon: LogOut, authRow: true },
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
/** The row's own styling, shared so the session row cannot drift from its neighbours. */
const NAV_ROW_CLASS = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-normal transition-colors hover:bg-white/5'

/**
 * The one navigation row that depends on who is here.
 *
 * MEMBER   → Logout, which performs the real teardown (`performSignOut`, the
 *            single `auth.signOut()` call site) and then goes Home.
 * VISITOR  → Login, a plain link to `/login`.
 * LOADING  → nothing at all. Rendering a guess would flash the wrong word on
 *            every page load, and the wrong word here is the whole bug.
 *
 * 🚨 THE LABEL IS NEVER SET BY THE CLICK. It is derived from the session via
 * `useAuthStatus`, which listens to `onAuthStateChange` — so if sign-out fails
 * and the session survives, the row stays Logout instead of telling somebody
 * they are signed out when they are not. `performSignOut` never throws by
 * contract; this does not rely on that.
 *
 * Server-side authorization is untouched: nothing here is sent anywhere, and no
 * route trusts it. It decides one word on screen.
 */
function AuthNavRow({ icon: Icon }: { icon: typeof Home }) {
  const { t } = useTranslation()
  const router = useRouter()
  const status = useAuthStatus()
  const [busy, setBusy] = useState(false)

  if (status === 'loading') return null

  if (status === 'visitor') {
    return (
      <li>
        <Link href="/login" className={NAV_ROW_CLASS} style={{ color: 'var(--v3-fg-secondary)' }} data-testid="nav-login">
          <Icon size={15} aria-hidden="true" className="flex-shrink-0" />
          <span className="truncate">{t('v3.nav.login')}</span>
        </Link>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        disabled={busy}
        data-testid="nav-logout"
        onClick={async () => {
          setBusy(true)
          await performSignOut()
          // Home, not `/login`: a signed-out person belongs on the public surface,
          // and `/login` is where they go to come back. `refresh()` re-runs the
          // server components so nothing rendered for the old session survives.
          router.replace('/')
          router.refresh()
          setBusy(false)
        }}
        className={NAV_ROW_CLASS}
        style={{ color: 'var(--v3-fg-secondary)' }}
      >
        <Icon size={15} aria-hidden="true" className="flex-shrink-0" />
        <span className="truncate">{t('v3.nav.logout')}</span>
      </button>
    </li>
  )
}

const TABS: { href: string; labelKey: string; icon: typeof Home; badge?: boolean }[] = [
  { href: '/', labelKey: 'v3.tab.aiAgent', icon: Sparkles },
  { href: '/reviews', labelKey: 'nav.explore', icon: PlayCircle },
  { href: '/deals', labelKey: 'nav.deals', icon: Tag },
  // Gated with the sidebar row above — see `SHOW_MARKETPLACE`.
  ...(SHOW_MARKETPLACE
    ? [{ href: '/marketplace', labelKey: 'v3.nav.marketplace', icon: Store }]
    : []),
  { href: '/profile/notifications', labelKey: 'v3.nav.inbox', icon: MessageCircle, badge: true },
  { href: SMART_TOOLS_HREF, labelKey: 'v3.nav.smartTools', icon: Grid3x3 },
]

export interface V3ShellProps {
  title: string
  subtitle?: string
  /** Brand tagline under the wordmark. Defaults to the SHARED string; Home overrides it with the
   *  approved reference's wording so that wording cannot leak to the other destinations. */
  brandTagline?: string
  /** Home's wordmark TYPE SCALE - larger, semibold, a lighter tagline beneath. OPT-IN, so
   *  Deals, Marketplace and Profile keep the compact type they already ship.
   *  ⚠️ This does NOT gate the brand mark. It used to, and that is what made the logo
   *  disappear from Home's sidebar; the mark now renders on every destination. */
  wordmarkOnly?: boolean
  /** Let a scenic background show through the surface. OPT-IN, and Home is the only caller —
   *  the page ground goes transparent and the chrome becomes translucent, which is wrong for
   *  every destination that has no background layer mounted behind it. */
  scenic?: boolean
  /** Which tab reads as current. */
  activeTab?: string
  /** Widen the content canvas from 1240px to 1480px. Home only — see the note at `<main>`. */
  wide?: boolean
  user?: { name?: string | null; avatarUrl?: string | null; plan?: string | null } | null
  /** A page-owned top bar rendered IN PLACE of the standard header row. The sidebar, the
   *  mobile bottom bar and the content column are unchanged. Explore is the caller: its
   *  approved composition carries its own top navigation. Opt-in; nothing else uses it. */
  header?: ReactNode
  /** Let the content column run edge to edge (no container width, no gutters, no top padding).
   *  Explore is the caller: its stage is an environment, not a column of cards. Opt-in. */
  flush?: boolean
  children: ReactNode
}

export default function V3Shell({ title, subtitle, brandTagline, wordmarkOnly = false, scenic = false, wide = false, activeTab = '/', user, header, flush = false, children }: V3ShellProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  // Presentation only: delivery, consent and push identity are untouched — this reads a count the
  // store already maintains for the bottom nav.
  const { unreadCount } = useNotifications()
  const router = useRouter()
  const [query, setQuery] = useState('')
  // Home is the one page that already has the composer, so the chrome must not offer a second
  // one. Derived from the route rather than a prop: a prop can drift out of sync with where the
  // user actually is; `usePathname` cannot.
  const onHome = pathname === '/'
  const { isDark, mounted: themeMounted, toggle: toggleTheme } = useThemeMode()

  return (
    // 🚨 This used to be `v3-theme dark` — the surface pinned itself to dark and ignored the
    // user. The header now carries a Light/Dark control, so the class comes off and the palette
    // follows `dark` on <html>, which is the app's existing mechanism (`useThemeMode`). That one
    // class also drives the Tailwind `dark:` variants of the app-level components hosted in here
    // — BottomNav, DealNotifyButton, Header — so they stay in step instead of rendering a white
    // bar on a dark page, which is what the forced class was working around.
    <div className={cn('v3-theme min-h-dvh', scenic && 'v3-scenic')}>
      <div className="flex">
        {/* ── Sidebar (desktop only) ────────────────────────────────────── */}
        <aside
          className={cn('sticky top-0 hidden h-dvh flex-shrink-0 flex-col border-r lg:flex', scenic && 'v3-scenic-chrome')}
          style={{
            width: 'var(--v3-sidebar-w)',
            borderColor: 'var(--v3-border)',
            // The SHELL surface, not the card surface — see the token note in globals.css.
            background: 'var(--v3-shell)',
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
            {/* 🚨 THE MARK RENDERS ON EVERY DESTINATION, HOME INCLUDED. IT IS NOT GATED.
             *
             *  This slot has held three things, and the history is why the rule is written down
             *  rather than just obeyed:
             *
             *    1. a lucide `Sparkles` glyph - a mark invented at the call site, not the
             *       product's logo;
             *    2. `{!wordmarkOnly && <Image .../>}` - the shipped mark gated OFF on Home. That
             *       is the change that emptied the Home sidebar's brand block, leaving
             *       "TappyAI / Personal AI Agent" as type with no mark beside it;
             *    3. this - the shipped asset, ungated, at the size it already ships at.
             *
             *  `/branding/otter-logo.png` is the app's established mark: the favicon, the Header
             *  lockup, the login and onboarding screens all use it, and
             *  `controllerLoginComposition.test.tsx` already names it as approved brand art. It
             *  is used AS SHIPPED - `rounded-[22%] object-cover` is Header's treatment reused
             *  verbatim, and the 32px box is the one every other V3 page renders. Nothing here
             *  is cropped, redrawn, re-sized per page or substituted with type.
             *
             *  If the mark is ever to leave a page again, it leaves by replacing this asset with
             *  a real standalone one - not by hiding it behind a layout prop. */}
            <Image
              src="/branding/otter-logo.png"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="h-8 w-8 flex-shrink-0 rounded-[22%] object-cover"
            />
            <span className="flex min-w-0 flex-col leading-tight">
              {/* "Tappy" white, "AI" in the brand blue. Semibold rather than extrabold: the
                  brief asks for elegant, and a black wordmark in a narrow rail reads as a
                  dashboard header. */}
              <span
                className={cn('tracking-tight', wordmarkOnly ? 'text-[18px] font-semibold' : 'text-[16px] font-extrabold')}
                style={{ color: 'var(--v3-fg)' }}
              >
                Tappy<span style={{ color: 'var(--v3-accent)' }}>AI</span>
              </span>
              <span
                className={cn('truncate', wordmarkOnly ? 'mt-0.5 text-[10.5px] font-light tracking-[0.02em]' : 'text-[10px]')}
                style={{ color: 'var(--v3-fg-muted)' }}
              >
                {brandTagline ?? t('v3.brand.tagline')}
              </span>
            </span>
          </Link>

          <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label={t('v3.nav.ariaMain')}>
            {/* 🚨 A GROUP WITH NO ROWS DOES NOT RENDER ITS HEADING. `SHOW_MARKETPLACE` is false,
                and Deals moved up into the AI Agent group — which left the Commerce group as a label
                floating above nothing. An empty section heading is a promise of navigation that
                is not there, and it was visible on every page of the app. */}
            {GROUPS.filter(group => group.items.length > 0).map(group => (
              // Sidebar rhythm is tight on purpose. Six groups and twenty-two rows is more than a
              // 900px-tall window can show, so every 4px of row padding is a row of navigation
              // pushed under the fold — and what sat under it was the whole Tài khoản group.
              <div key={group.titleKey} className="mb-1">
                <p
                  className="px-2.5 pb-1.5 pt-4 text-[9.5px] font-semibold uppercase tracking-[0.11em]"
                  style={{ color: 'var(--v3-fg-muted)' }}
                >
                  {t(group.titleKey)}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon
                    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.split('#')[0])
                    if (item.authRow) {
                      return <AuthNavRow key={`${group.titleKey}-${item.labelKey}`} icon={Icon} />
                    }
                    return (
                      <li key={`${group.titleKey}-${item.labelKey}`}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-normal transition-colors',
                            active ? 'font-medium' : 'hover:bg-white/5',
                          )}
                          style={active
                            ? { background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }
                            : { color: 'var(--v3-fg-secondary)' }}
                        >
                          <Icon size={15} aria-hidden="true" className="flex-shrink-0" />
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
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                <Sparkles size={12} style={{ color: 'var(--v3-amber)' }} aria-hidden="true" />
                {t('v3.premium.title')}
              </p>
              <p className="mt-0.5 text-[10px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.premium.desc')}
              </p>
              <Link
                href="/subscription"
                className="mt-2.5 flex min-h-[34px] items-center justify-center rounded-lg text-[11.5px] font-semibold text-white"
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
          {header ?? (
          <header
            className={cn('sticky top-0 z-30 border-b backdrop-blur', scenic && 'v3-scenic-chrome')}
            style={{
              borderColor: 'var(--v3-border)',
              background: 'color-mix(in srgb, var(--v3-shell-header) 88%, transparent)',
            }}
          >
            {/* Fixed height from `lg` up so the header bottom, the sidebar's brand-block hairline
                and the top of the content column all land on one line. Below `lg` the tab strip
                wraps to its own row, so the height has to stay natural. */}
            {/* 🚨 NAVIGATION LABELS ARE ATOMIC: THEY FIT OR THEY COLLAPSE, NEVER WRAP.
                At 1280 "AI Agent", "Smart Tools", "Hỏi Tappy" and "Post / Upload" each broke onto
                a second line, which turned a 68px header into a ragged two-line strip — wrapping
                used as a responsive strategy, which it is not. Every label below now carries
                `whitespace-nowrap`; the tab strip already scrolls, so when the row genuinely runs
                out of width the strip gives, not the words. Everything else here is tightening:
                smaller gaps, smaller padding, one step down in type. */}
            <div className="v3-container flex flex-wrap items-center gap-2 py-3 lg:h-[calc(var(--v3-header-h)-1px)] lg:flex-nowrap lg:gap-2.5 lg:py-0">
              {/* 🚨 THE PAGE IDENTITY IS QUIETER NOW. It was a 21px semibold title with a
                  subtitle — the loudest thing in the bar, on every page, saying what the user
                  had just clicked. The bar's job is to hold the global controls; the page says
                  what it is in its own content. */}
              <div className="min-w-0 flex-shrink-0 lg:w-[150px] xl:w-[176px]">
                <h1 className="truncate text-[15px] font-medium tracking-[-0.01em] lg:text-[16px]" style={{ color: 'var(--v3-fg)' }}>{title}</h1>
                {subtitle && (
                  <p className="truncate text-[11.5px] font-light" style={{ color: 'var(--v3-fg-muted)' }}>{subtitle}</p>
                )}
              </div>

              {/* ── Global command entry ───────────────────────────────────
                  🚨 ON HOME THIS IS A BUTTON, NOT A FIELD, AND THAT IS THE FIX.
                  Home already owns the product's primary input — a 46px headline above a lit
                  composer. Putting a second "ask Tappy" field 250px above it made the page
                  argue with itself about where to type, and weakened the one claim the hero
                  exists to make. Everywhere else the field earns its place: it is the only way
                  to reach the assistant without going back to Home.

                  🚨 IT ALSO REMOVES THE 1280 STUB. Title + field + six tabs + four controls
                  could not share one row at 1280: the field collapsed to 87px with a 38px input
                  showing three truncated characters of its placeholder. Home spends nothing on it now,
                  carries a `min-w` so it can never degrade into a stub again — the tab strip,
                  which already scrolls, gives up the space instead. */}
              {onHome ? (
                <Link
                  href="/chat"
                  className="ml-auto hidden items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5 lg:inline-flex"
                  style={{ border: '1px solid var(--v3-border)', color: 'var(--v3-fg-secondary)' }}
                >
                  <Sparkles size={13} aria-hidden="true" style={{ color: 'var(--v3-accent)' }} />
                  {t('v3.top.askAction')}
                </Link>
              ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const q = query.trim()
                  if (!q) return
                  setQuery('')
                  router.push(`/chat?q=${encodeURIComponent(q)}`)
                }}
                role="search"
                className="hidden min-w-[220px] flex-1 items-center gap-2 rounded-xl px-3 py-1.5 transition-colors lg:flex"
                style={{ background: 'var(--v3-panel-elevated)', border: '1px solid var(--v3-border)' }}
              >
                <Search size={15} aria-hidden="true" className="flex-shrink-0" style={{ color: 'var(--v3-fg-muted)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('v3.top.searchPlaceholder')}
                  aria-label={t('v3.top.searchAria')}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-light outline-none placeholder:font-light"
                  style={{ color: 'var(--v3-fg)' }}
                />
              </form>
              )}

              {/*
                🚨 DESKTOP ONLY. This row had no breakpoint gate, so below `lg` it rendered as a
                full-width scroll row AT THE SAME TIME as `BottomNav` — measured at 375x812 on
                /deals: TABS visible h=50 top=104, BottomNav visible h=65 top=747, with `/`,
                `/reviews` and `/deals` reachable from both. That contradicts the ownership rule
                stated at the top of this file: BottomNav owns navigation below `lg` (DD-003).

                Nothing else moves: no route, no destination, no tab set. The two entries this row
                carries that BottomNav does not keep their mobile paths — `/tools` from Home's
                Smart Tools "see all", and the Inbox via the Explore tab, which BottomNav already
                badges for exactly that reason (see BottomNav: "Explore (/reviews) hosts the Inbox").
              */}
              <nav className="v3-scroll-x order-3 hidden w-full min-w-0 gap-1 lg:order-none lg:flex lg:w-auto lg:flex-shrink" aria-label={t('v3.nav.ariaTabs')}>
                {TABS.map(tab => {
                  const Icon = tab.icon
                  const active = tab.href === activeTab
                  return (
                    <Link
                      key={tab.labelKey}
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className="flex flex-col items-center gap-1 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[10.5px] font-normal transition-colors lg:px-3 xl:text-[11px]"
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

              <div className="flex items-center gap-1.5">
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
                    <span className="max-w-[104px] truncate whitespace-nowrap text-[12px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                      {user?.name || t('v3.top.guest')}
                    </span>
                    {user?.plan && (
                      <span className="text-[10px]" style={{ color: 'var(--v3-amber)' }}>{user.plan}</span>
                    )}
                  </span>
                </Link>
                {/* 🚨 COMPACT BELOW `xl`, NOT WRAPPED. "Post / Upload" is two words with a
                    slash and it was the first thing to break onto a second line at 1280. From
                    `xl` it reads in full; below that it collapses to the glyph with the label as
                    its accessible name and its tooltip — the label is never truncated and never
                    wrapped, which is the whole rule. */}
                <Link
                  href="/reviews/new"
                  aria-label={t('v3.top.post')}
                  title={t('v3.top.post')}
                  className="ml-1 hidden min-h-[36px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium text-white sm:flex xl:px-4"
                  style={{ background: 'var(--v3-accent-fill)' }}
                >
                  <Plus size={15} aria-hidden="true" />
                  <span className="hidden xl:inline">{t('v3.top.post')}</span>
                </Link>
              </div>
            </div>
          </header>
          )}

          {/* Same container as the header, so the page's left edge lines up with the title
              above it instead of each choosing its own padding. */}
          {/* 🚨 `wide` IS OPT-IN, AND THAT IS DELIBERATE. `--v3-content-max` is 1240px and every
              approved V3 page — Deals, Inbox, Profile, Explore — is composed against it; raising
              the token would silently re-lay-out all of them. Home asks for the wider canvas
              because its hero is an environment rather than a column of cards, and it is the
              only caller. */}
          <main className={cn(flush ? 'min-w-0' : 'v3-container pb-24 pt-5 lg:pb-10', !flush && wide && 'v3-container-wide')}>{children}</main>
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
