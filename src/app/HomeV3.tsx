'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import V3Shell from '@/components/v3/V3Shell'
import HomeBackground from '@/components/HomeBackground'
import TappyPresence from '@/components/v3/TappyPresence'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatRelativeTime, cn } from '@/lib/utils'
import {
  MessageCircle, Mic, ArrowUp, ChevronRight, Sparkles,
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
      /* Home-only wording, passed explicitly. Editing the shared dictionary string instead
         changed Deals, Marketplace, Profile and Explore along with it. */
      brandTagline={t('v3.brand.taglineHome')}
      scenic
      activeTab="/"
      user={{ name: userInfo?.full_name || firstName, avatarUrl: userInfo?.avatar_url, plan: user ? t('v3.top.plan') : null }}
    >
      {/* 🔑 REUSED, not created. `HomeBackground` + `backgroundManager` +
          `backgrounds.config.ts` are the Home background system this project already had:
          the asset (/backgrounds/home-desktop-v5.webp), its object-position, and its
          per-theme overlays. It was built for Home and the V3 redesign simply stopped
          rendering it, which is why Home became a flat dark panel. It hides itself below
          `md` on its own, so the phone layout is untouched. */}
      <HomeBackground />

      {/* No width of its own. The shell's `.v3-container` caps and centres every V3 page on the
          same grid; Home adding a second, narrower cap inside it was what left the content
          stranded in empty space on a wide screen. Sections below choose their COLUMN COUNT,
          never their width. */}
      <div className="space-y-6">

        {/* ── 1. Ask Tappy — the primary action, first and most prominent ──
            Compact by design. It was 284px tall at 1440 because three things each added height
            independently: 28px of card padding, a 104px mascot that set the greeting row's height
            on its own, and a 16/12px gap stacked between every block. The greeting, the mascot,
            the composer and the chips are ONE composition, so they sit close together and the
            mascot is sized to the text beside it rather than the other way round. */}
        <section data-home-section="hero" aria-label={t('v3.home.askAria')} className="v3-panel p-5 sm:p-6 lg:p-7">
          {/* 🔑 The label, the greeting and the mascot are ONE row in the reference, not a label
              stacked above a greeting-and-mascot row. The mascot's head sits level with the label
              at the card's top-right and its body runs down past the greeting — so the text column
              and the mascot are siblings here, and the mascot spans the whole column's height
              rather than being centred against the greeting alone. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* The card names itself. In the approved reference this is a filled violet badge
                  carrying the glyph, followed by "AI AGENT – HOME" in the ACCENT blue (measured
                  #2D5BE7 off the screenshot) — not the muted grey a section heading uses. The
                  label is the card's identity, so it reads as brand, not as a caption. */}
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--v3-accent)' }}>
                <span
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-md"
                  style={{ background: 'var(--v3-violet-fill)', color: 'var(--v3-on-violet)' }}
                  aria-hidden="true"
                >
                  <Sparkles size={11} />
                </span>
                {t('v3.home.cardLabel')}
              </p>
              <h2 className="mt-3 text-[26px] font-light leading-[1.15] tracking-[-0.02em] sm:text-[32px]" style={{ color: 'var(--v3-fg)' }}>
                {user ? t('v3.home.greetUser', { name: firstName || t('v3.profile.you') }) : t('v3.home.greetGuest')}{' '}
                <span aria-hidden="true">👋</span>
              </h2>
              <p className="mt-1.5 text-[14px] font-light leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.home.greetSub')}
              </p>
            </div>
            {/* The approved mascot asset — `/tappy/welcome.png` from the owner's 18-pose library.
                No new art, no altered pose, no substitute.

                SCALE COMES FROM THE REFERENCE, not from taste. Measured on the approved
                screenshot: the mascot stands 2.7× the height of the composer beside it and runs
                from the card's top padding down to where the composer begins, its lower body
                passing behind that field. At 72px it was an ornament sitting politely in a
                corner; the reference makes it the second-loudest thing on the page after the
                greeting. `-mb-4` reproduces the overlap — the mascot ends underneath the
                composer's top edge rather than stacking above it. */}
            {/* Composed, not placed — see TappyPresence. Same asset, same pose. */}
            <TappyPresence pose="welcome" size={128} className="-mt-1 -mb-4 hidden lg:block" />
            <TappyPresence pose="welcome" size={104} className="-mt-1 -mb-3 hidden sm:block lg:hidden" />
            <TappyPresence pose="welcome" size={80} className="-mt-1 sm:hidden" />
          </div>

          {/* A composer, not a search box: it promises consultation, not retrieval. */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(draft) }}
            className="mt-3 flex items-center gap-2 rounded-2xl px-3.5 py-2"
            style={{ background: 'var(--v3-panel-elevated)', border: '1px solid var(--v3-border-strong)' }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('v3.home.askPlaceholder')}
              aria-label={t('v3.home.askAria')}
              className="min-w-0 flex-1 bg-transparent text-[14px] font-light outline-none placeholder:font-light"
              style={{ color: 'var(--v3-fg)' }}
            />
            <button
              type="button"
              aria-label={t('v3.home.voiceAria')}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ color: 'var(--v3-fg-secondary)' }}
            >
              <Mic size={16} aria-hidden="true" />
            </button>
            <button
              type="submit"
              aria-label={t('v3.home.sendAria')}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'var(--v3-violet-fill)', color: 'var(--v3-on-violet)' }}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          </form>

          {/* The reference labels the chip row "Gợi ý nhanh". `v3.home.quickTitle` was already in
              both dictionaries — the string had been written for this and never wired to anything,
              so the row arrived unlabelled. */}
          <p className="mt-4 text-[11px] font-normal tracking-[0.04em]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.home.quickTitle')}
          </p>

          {/* Contextual chips — the fastest path to a formed question. Tucked directly under their
              label: they belong to it, so the gap between them is smaller than the gap to
              anything else. */}
          <div className="v3-scroll-x mt-1.5 flex gap-2 pb-0.5">
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
            <ul className="mt-2.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                className="mt-3 inline-flex min-h-[40px] items-center rounded-xl px-5 text-[13px] font-semibold"
                style={{ background: 'var(--v3-accent-fill)' }}
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
                // 168px fixed is right where the strip must scroll (375: 319 of 708 visible) and
                // exact where it just fits (768: 708 of 708). At desktop the same fixed width left
                // 396px of the 1104px row empty — a third of the row, and the most visible
                // imbalance on the page. `lg:flex-1` gives the tiles basis 0 so the four of them
                // share the row instead of hugging its left edge.
                return (
                  <Link
                    key={s.text}
                    href={`/chat?q=${encodeURIComponent(text)}&category=${s.category}`}
                    className="v3-tile flex w-[168px] flex-shrink-0 flex-col overflow-hidden lg:flex-1"
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
                <p data-scenic-heading className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--v3-fg-muted)' }}>
                  {t(group.titleKey)}
                </p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
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
        // No optical inset: `px-0.5` put every heading 2px right of the grid line its own
    // cards sit on, which is exactly the kind of near-miss that reads as sloppy.
    <div className="flex items-baseline justify-between gap-3">
      {/* `data-scenic-heading`: this one sits on the photograph with no panel behind it. */}
      <h2 data-scenic-heading className="text-[15px] font-medium tracking-[-0.01em]" style={{ color: 'var(--v3-fg)' }}>{title}</h2>
      {action && (
        <Link href={action.href} className="flex items-center gap-0.5 text-[12px]" style={{ color: 'var(--v3-accent)' }}>
          {action.label}
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
