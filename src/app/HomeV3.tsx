'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import V3Shell from '@/components/v3/V3Shell'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatRelativeTime, cn } from '@/lib/utils'
import {
  MessageCircle, Mic, ArrowUp, ChevronRight,
  ScanText, ArrowLeftRight, Calculator, Music2, Languages, Sparkle, PenLine, Users,
  ShieldCheck, Star,
} from 'lucide-react'

// ── V3 Web · Home ───────────────────────────────────────────────────────────
//
// 🚨 HOME IS ONE PAGE, NOT AN ECOSYSTEM DASHBOARD.
//
// The first V3 build read the implementation roadmap (shell → Home → Explore →
// Deals → Marketplace → Inbox → Tools → Profile → Chat) as a LIST OF PANELS TO
// PUT ON HOME, and produced a fifteen-panel grid that rendered a slice of every
// destination in the product. That was wrong. The roadmap is an ORDER OF PAGES:
// each item is its own route with its own composition.
//
// Home now contains exactly what `V3_WEB_DESIGN_PROPOSAL §2.1` approves:
//
//   1. greeting + Tappy + the Ask-Tappy composer + contextual chips
//   2. Tiếp tục — resume a recent conversation
//   3. Dành cho bạn — discovery/content preview from EXISTING sources (ND-001)
//   4. Công cụ — the tools, grouped into three named groups
//
// and nothing else. Explore, Inbox, Deals, Marketplace, Scam Shield, AI Planner,
// Post/Upload, Saved, History and Profile are DESTINATIONS, reached through the
// shell's navigation. None of them renders here.
//
// 🚨 NO CAPABILITY WAS REMOVED, only put where it belongs. Every tool route still
// has a home on this page; every other destination still has a home in the
// shell. "Off Home" is not "gone".
//
// 🚨 HOME IS STILL NOT CHAT (DD-002 / OD-1). The composer submits by NAVIGATING
// to /chat — nothing here renders a thread, streams a reply, or shows assistant
// output in place. Home is a door, not a room.

interface Suggestion { text: string; textEn: string; category: string; emoji: string; gradient: string }
interface Conv { id: string; title: string; messageCount: number; updated_at: string }

/** Server-provided. Nothing on this page is invented — see ND-001. */
export interface HomeV3Props {
  user: boolean
  userInfo: ComponentProps<typeof Header>['user']
  firstName: string
  suggestions: Suggestion[]
  conversations: Conv[]
}

const QUICK_CHIPS = [
  'v3.chip.cafe',
  'v3.chip.plan',
  'v3.chip.translate',
  'v3.chip.split',
  'v3.chip.scam',
]

interface Tool { href: string; icon: typeof ScanText; labelKey: string; tone: string }

/** The tools, in the three groups the approved Home layout names. Every entry is an EXISTING route. */
const TOOL_GROUPS: { titleKey: string; tools: Tool[] }[] = [
  {
    titleKey: 'v3.tools.daily',
    tools: [
      { href: '/scan', icon: ScanText, labelKey: 'v3.tool.scan', tone: 'var(--v3-accent)' },
      { href: '/split-bill', icon: Calculator, labelKey: 'v3.tool.split', tone: 'var(--v3-amber)' },
      { href: '/translate', icon: Languages, labelKey: 'v3.tool.translate', tone: 'var(--v3-accent)' },
      { href: '/currency', icon: ArrowLeftRight, labelKey: 'v3.tool.currency', tone: 'var(--v3-emerald)' },
      { href: '/scam-shield', icon: ShieldCheck, labelKey: 'v3.tool.safety', tone: 'var(--v3-emerald)' },
    ],
  },
  {
    titleKey: 'v3.tools.discover',
    tools: [
      { href: '/recommendations', icon: Star, labelKey: 'v3.tool.suggest', tone: 'var(--v3-amber)' },
      { href: '/group/new', icon: Users, labelKey: 'v3.tool.together', tone: 'var(--v3-rose)' },
      { href: '/music', icon: Music2, labelKey: 'v3.tool.music', tone: 'var(--v3-violet)' },
    ],
  },
  {
    titleKey: 'v3.tools.fun',
    tools: [
      { href: '/boi', icon: Sparkle, labelKey: 'v3.tool.fortune', tone: 'var(--v3-violet)' },
      { href: '/viet-content', icon: PenLine, labelKey: 'v3.tool.captions', tone: 'var(--v3-rose)' },
    ],
  },
]

export default function HomeV3({ user, userInfo, firstName, suggestions, conversations }: HomeV3Props) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [draft, setDraft] = useState('')

  /** Submitting NAVIGATES. Home never answers in place. */
  function ask(text: string) {
    const q = text.trim()
    if (!q) return
    router.push(`/chat?q=${encodeURIComponent(q)}`)
  }

  const hasContinue = user && conversations.length > 0

  return (
    <V3Shell
      title={t('v3.home.title')}
      subtitle={t('v3.home.subtitle')}
      activeTab="/"
      user={{ name: userInfo?.full_name || firstName, avatarUrl: userInfo?.avatar_url, plan: user ? t('v3.top.plan') : null }}
    >
      {/* One readable column. Home is a focused page — the shell already carries the
          product's breadth, so this page does not have to. */}
      <div className="mx-auto w-full max-w-[720px] space-y-5">

        {/* ── 1. Ask Tappy — the primary action, first and largest ───────── */}
        <section data-home-section="hero" aria-label={t('v3.home.askAria')} className="v3-panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--v3-fg)' }}>
                {user ? t('v3.home.greetUser', { name: firstName || t('v3.profile.you') }) : t('v3.home.greetGuest')}{' '}
                <span aria-hidden="true">👋</span>
              </h2>
              <p className="mt-1 text-[14px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.home.greetSub')}
              </p>
            </div>
            <TappyMascot pose="welcome" className="h-20 w-20 flex-shrink-0" />
          </div>

          {/* A composer, not a search box: it promises consultation, not retrieval. */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(draft) }}
            className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-2.5"
            style={{ background: 'var(--v3-panel-elevated)', border: '1px solid var(--v3-border-strong)' }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('v3.home.askPlaceholder')}
              aria-label={t('v3.home.askAria')}
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
              style={{ color: 'var(--v3-fg)' }}
            />
            <button
              type="button"
              aria-label={t('v3.home.voiceAria')}
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ color: 'var(--v3-fg-secondary)' }}
            >
              <Mic size={17} aria-hidden="true" />
            </button>
            <button
              type="submit"
              aria-label={t('v3.home.sendAria')}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
              style={{ background: 'var(--v3-accent)' }}
            >
              <ArrowUp size={17} aria-hidden="true" />
            </button>
          </form>

          {/* Contextual chips — the fastest path to a formed question. */}
          <div className="v3-scroll-x mt-3 flex gap-2 pb-1">
            {QUICK_CHIPS.map(c => (
              <button key={c} type="button" onClick={() => ask(t(c))} className="v3-chip flex-shrink-0">
                {t(c)}
              </button>
            ))}
          </div>
        </section>

        {/* ── 2. Tiếp tục — resume, or the guest/empty state in its place ── */}
        <section data-home-section="continue" aria-label={t('v3.panel.continue')}>
          <SectionHeading
            title={t('v3.panel.continue')}
            action={hasContinue ? { label: t('v3.action.seeAll'), href: '/profile/history' } : undefined}
          />
          {hasContinue ? (
            <ul className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {/* ≤2 recent threads, as the approved layout specifies. */}
              {conversations.slice(0, 2).map(c => (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className="v3-tile flex items-center gap-3 p-3">
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                      aria-hidden="true"
                    >
                      <MessageCircle size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium" style={{ color: 'var(--v3-fg)' }}>{c.title}</span>
                      <span className="block text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                        {t('home.messages', { n: String(c.messageCount) })} · {formatRelativeTime(c.updated_at, t, locale)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="v3-panel mt-2 px-4 py-6 text-center">
              <p className="text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {user ? t('home.emptyChat') : t('home.loginPrompt')}
              </p>
              <Link
                href={user ? '/chat' : '/login'}
                className="mt-3 inline-flex min-h-[40px] items-center rounded-xl px-5 text-[13px] font-semibold text-white"
                style={{ background: 'var(--v3-accent)' }}
              >
                {user ? t('home.chatNow') : t('home.login')}
              </Link>
            </div>
          )}
        </section>

        {/* ── 3. Dành cho bạn — rendered ONLY when the server sent items ─── */}
        {/* ND-001: a discovery/content preview drawn from an EXISTING source, never a
            personalisation system and never fabricated. No items, no section. */}
        {suggestions.length > 0 && (
          <section data-home-section="for-you" aria-label={t('v3.home.forYouTitle')}>
            <SectionHeading title={t('v3.home.forYouTitle')} />
            <div className="v3-scroll-x mt-2 flex gap-3 pb-1">
              {suggestions.slice(0, 6).map(s => {
                const text = locale === 'en' ? s.textEn || s.text : s.text
                return (
                  <Link
                    key={s.text}
                    href={`/chat?q=${encodeURIComponent(text)}&category=${s.category}`}
                    className="v3-tile flex w-[168px] flex-shrink-0 flex-col overflow-hidden"
                  >
                    <span className={cn('flex h-16 flex-shrink-0 items-center justify-center bg-gradient-to-br text-2xl', s.gradient)}>
                      {s.emoji}
                    </span>
                    {/* Not clamped: `line-clamp-*` resolves its display to `flow-root` on this
                        surface, so the clamp degrades to a hard clip with no ellipsis. Letting
                        the tile grow is the honest failure mode for a one-sentence string. */}
                    <span className="p-2.5 text-[12px] leading-snug" style={{ color: 'var(--v3-fg-secondary)' }}>
                      {text}
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 4. Công cụ — grouped, so equal tiles become a hierarchy ────── */}
        <section data-home-section="tools" aria-label={t('v3.panel.smartTools')}>
          <SectionHeading title={t('v3.panel.smartTools')} />
          <div className="mt-2 space-y-3">
            {TOOL_GROUPS.map(group => (
              <div key={group.titleKey}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--v3-fg-muted)' }}>
                  {t(group.titleKey)}
                </p>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                  {group.tools.map(({ href, icon: Icon, labelKey, tone }) => (
                    <Link
                      key={href}
                      href={href}
                      className="v3-tile flex min-h-[78px] flex-col items-center justify-center gap-1.5 p-3 text-center"
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.06)', color: tone }}
                        aria-hidden="true"
                      >
                        <Icon size={16} />
                      </span>
                      <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--v3-fg)' }}>
                        {t(labelKey)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </V3Shell>
  )
}

/** One heading rhythm for the three sections below the hero. */
function SectionHeading({ title, action }: { title: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-0.5">
      <h2 className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{title}</h2>
      {action && (
        <Link href={action.href} className="flex items-center gap-0.5 text-[12px]" style={{ color: 'var(--v3-accent)' }}>
          {action.label}
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
