'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import Header from '@/components/Header'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import Panel, { ChipRow } from '@/components/v3/Panel'
import { TappyMascot } from '@/components/TappyMascot'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useNotifications } from '@/components/NotificationProvider'
import { formatRelativeTime, cn } from '@/lib/utils'
import {
  Sparkles, PlayCircle, Inbox as InboxIcon, Tag, Store, ShieldCheck,
  CalendarRange, Upload, Bookmark, History as HistoryIcon, Grid3x3, UserCircle,
  Mic, ArrowUp, MessageCircle, Star, Image as ImageIcon, Video, Film, Radio,
  ScanText, ArrowLeftRight, Calculator, Music2, Languages, Sparkle, PenLine, Users,
  Heart, MessageSquare, UserPlus, Bell,
} from 'lucide-react'

// ── V3 Web · Home ───────────────────────────────────────────────────────────
//
// A ground-up rebuild against the approved V3 reference, not the old Home
// reordered. The old page was one 768px column of nine near-equal tool sections;
// this is a wide panel grid where the assistant is the largest, first and only
// full-height panel and everything else is a supporting surface.
//
// 🚨 HOME IS STILL NOT CHAT (DD-002 / OD-1). The composer here submits by
// NAVIGATING to /chat — nothing on this page renders a thread, streams a reply,
// or shows assistant output in place. Home is a door, not a room.
//
// 🚨 NO CAPABILITY WAS DROPPED. Every tool, list and destination the old Home
// linked to still has a home in this composition; several that previously had a
// route but no navigation entry now have one.

interface Suggestion { text: string; textEn: string; category: string; emoji: string; gradient: string }
interface Conv { id: string; title: string; messageCount: number; updated_at: string }

/** A recommendation shown under the composer. Static demo content is never invented here —
 *  these come from the same server-provided suggestion set the old Home used. */
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

const SMART_TOOLS = [
  { href: '/boi', icon: Sparkle, labelKey: 'v3.tool.fortune', descKey: 'v3.tool.fortuneDesc', tone: 'var(--v3-violet)' },
  { href: '/scan', icon: ScanText, labelKey: 'v3.tool.scan', descKey: 'v3.tool.scanDesc', tone: 'var(--v3-accent)' },
  { href: '/group/new', icon: Users, labelKey: 'v3.tool.together', descKey: 'v3.tool.togetherDesc', tone: 'var(--v3-rose)' },
  { href: '/currency', icon: ArrowLeftRight, labelKey: 'v3.tool.currency', descKey: 'v3.tool.currencyDesc', tone: 'var(--v3-emerald)' },
  { href: '/split-bill', icon: Calculator, labelKey: 'v3.tool.split', descKey: 'v3.tool.splitDesc', tone: 'var(--v3-amber)' },
  { href: '/translate', icon: Languages, labelKey: 'v3.tool.translate', descKey: 'v3.tool.translateDesc', tone: 'var(--v3-accent)' },
  { href: '/scam-shield', icon: ShieldCheck, labelKey: 'v3.tool.safety', descKey: 'v3.tool.safetyDesc', tone: 'var(--v3-emerald)' },
  { href: '/music', icon: Music2, labelKey: 'v3.tool.music', descKey: 'v3.tool.musicDesc', tone: 'var(--v3-violet)' },
  { href: '/viet-content', icon: PenLine, labelKey: 'v3.tool.captions', descKey: 'v3.tool.captionsDesc', tone: 'var(--v3-rose)' },
]

/** Notification categories, tinted from the V3 palette. The title always says what it is —
 *  colour identifies at a glance but is never the only signal. */
const INBOX_TONE: Record<string, string> = {
  social: 'var(--v3-rose)',
  deal: 'var(--v3-amber)',
  explore: 'var(--v3-violet)',
  system: 'var(--v3-fg-secondary)',
}

const AI_CAPABILITIES = [
  { icon: Sparkles, labelKey: 'v3.cap.consultant', descKey: 'v3.cap.consultantDesc' },
  { icon: ScanText, labelKey: 'v3.cap.search', descKey: 'v3.cap.searchDesc' },
  { icon: Star, labelKey: 'v3.cap.recommend', descKey: 'v3.cap.recommendDesc' },
  { icon: CalendarRange, labelKey: 'v3.cap.planner', descKey: 'v3.cap.plannerDesc' },
  { icon: PenLine, labelKey: 'v3.cap.summary', descKey: 'v3.cap.summaryDesc' },
  { icon: Languages, labelKey: 'v3.cap.translate', descKey: 'v3.cap.translateDesc' },
]

export default function HomeV3({ user, userInfo, firstName, suggestions, conversations }: HomeV3Props) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [inboxFilter, setInboxFilter] = useState(0)

  // Presentation only (V3 §6): the app-level store already fetches these for the bottom-nav badge
  // (ADR-014). Nothing about delivery, consent or push identity changes here.
  const { notifications } = useNotifications()
  const inboxRows = notifications.filter(n => {
    if (inboxFilter === 1) return n.category === 'social' && (n.type === 'comment' || n.type === 'follow')
    if (inboxFilter === 2) return n.category === 'system' || n.type === 'broadcast'
    if (inboxFilter === 3) return n.category === 'social'
    return true
  })

  /** Submitting NAVIGATES. Home never answers in place. */
  function ask(text: string) {
    const q = text.trim()
    if (!q) return
    router.push(`/chat?q=${encodeURIComponent(q)}`)
  }

  return (
    <V3Shell
      title={t('v3.page.title')}
      subtitle={t('v3.page.subtitle')}
      activeTab="/"
      user={{ name: userInfo?.full_name || firstName, avatarUrl: userInfo?.avatar_url, plan: user ? t('v3.top.plan') : null }}
    >
      {/* ── Row 1 — the assistant leads, at the largest size on the page ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* AI AGENT */}
        <Panel
          title={t('v3.panel.aiAgent')}
          tone="accent"
          icon={<Sparkles size={13} />}
          className="xl:col-span-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xl font-bold" style={{ color: 'var(--v3-fg)' }}>
                {user ? t('v3.home.greetUser', { name: firstName || t('v3.profile.you') }) : t('v3.home.greetGuest')} <span aria-hidden="true">👋</span>
              </p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                {t('v3.home.greetSub')}
              </p>
            </div>
            <TappyMascot pose="welcome" className="h-16 w-16 flex-shrink-0" />
          </div>

          {/* Ask Tappy — navigates to /chat, never answers here. */}
          <form
            onSubmit={(e) => { e.preventDefault(); ask(draft) }}
            className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'var(--v3-panel-elevated)', border: '1px solid var(--v3-border-strong)' }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('v3.home.askPlaceholder')}
              aria-label={t('v3.home.askAria')}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: 'var(--v3-fg)' }}
            />
            <button type="button" aria-label={t('v3.home.voiceAria')} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: 'var(--v3-fg-secondary)' }}>
              <Mic size={16} aria-hidden="true" />
            </button>
            <button
              type="submit"
              aria-label={t('v3.home.sendAria')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ background: 'var(--v3-accent)' }}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          </form>

          <p className="mt-3 text-[11px] font-medium" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.home.quickTitle')}</p>
          <div className="v3-scroll-x mt-1.5 flex gap-2 pb-1">
            {QUICK_CHIPS.map(c => (
              <button key={c} type="button" onClick={() => ask(t(c))} className="v3-chip flex-shrink-0">{t(c)}</button>
            ))}
          </div>

          <p className="mt-4 text-[11px] font-medium" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.home.forYouTitle')}</p>
          <div className="v3-scroll-x mt-1.5 flex gap-2.5 pb-1">
            {suggestions.slice(0, 5).map(s => {
              const text = locale === 'en' ? s.textEn || s.text : s.text
              return (
                <Link
                  key={s.text}
                  href={`/chat?q=${encodeURIComponent(text)}&category=${s.category}`}
                  className="v3-tile w-[136px] flex-shrink-0 overflow-hidden"
                >
                  <div className={cn('flex h-16 items-center justify-center bg-gradient-to-br text-2xl', s.gradient)}>
                    {s.emoji}
                  </div>
                  <p className="line-clamp-2 p-2 text-[11px] leading-snug" style={{ color: 'var(--v3-fg-secondary)' }}>
                    {text}
                  </p>
                </Link>
              )
            })}
          </div>
        </Panel>

        {/* EXPLORE */}
        <Panel
          title={t('v3.panel.explore')}
          tone="violet"
          icon={<PlayCircle size={13} />}
          action={{ label: t('v3.action.seeAll'), href: '/reviews' }}
          className="xl:col-span-4"
        >
          <ChipRow items={[t('v3.explore.forYou'), t('v3.explore.following'), t('v3.explore.food'), t('v3.explore.travel'), t('v3.explore.lifestyle'), t('v3.explore.shopping')]} />
          {/* No fabricated feed. The reference's video tiles are illustrative; inventing
              creators, titles and view counts would put content on screen that does not
              exist — the same rule that keeps For You hidden (ND-001). Wired to the real
              feed this panel fills; until then it says so. */}
          <p className="mt-4 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.explore.empty')}</p>
        </Panel>

        {/* INBOX */}
        <Panel
          title={t('v3.panel.inbox')}
          tone="rose"
          icon={<InboxIcon size={13} />}
          action={{ label: t('v3.action.seeAll'), href: '/profile' }}
          className="xl:col-span-3"
        >
          <ChipRow
            items={[t('v3.inbox.all'), t('v3.inbox.messages'), t('v3.inbox.announcements'), t('v3.inbox.activity')]}
            activeIndex={inboxFilter}
            onSelect={setInboxFilter}
          />
          {/* Real notifications only. A fake "someone liked your post" is a claim about
              another person's behaviour, which is the worst possible thing to invent — so this
              reads the app-level store (ADR-014) and shows nothing when it has nothing. */}
          {inboxRows.length === 0 ? (
            <p className="mt-4 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.inbox.empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {inboxRows.slice(0, 4).map(n => (
                <li key={n.id}>
                  <Link href={n.entity_url || '/profile'} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)', color: INBOX_TONE[n.category] ?? 'var(--v3-fg-secondary)' }}
                      aria-hidden="true"
                    >
                      <Bell size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{n.title}</span>
                        {!n.read_at && (
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: 'var(--v3-rose)' }} aria-hidden="true" />
                        )}
                      </span>
                      <span className="line-clamp-1 text-[11px]" style={{ color: 'var(--v3-fg-secondary)' }}>{n.body}</span>
                      <span className="text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>{formatRelativeTime(n.created_at, t, locale)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/profile"
            className="mt-3 flex min-h-[36px] items-center justify-center rounded-lg text-[12px] font-medium"
            style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
          >
            {t('v3.action.seeAll')}
          </Link>
        </Panel>
      </div>

      {/* ── Row 2 — commerce, safety, planning, posting ─────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {/* Continue — the real conversations, not a placeholder. */}
        <Panel title={t('v3.panel.continue')} tone="accent" icon={<MessageCircle size={13} />} action={{ label: t('v3.action.seeAll'), href: '/profile' }}>
          {user && conversations.length > 0 ? (
            <ul className="space-y-2">
              {conversations.slice(0, 3).map(c => (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className="v3-tile flex items-center gap-2.5 p-2">
                    <span className="v3-panel-icon" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
                      <MessageCircle size={12} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium" style={{ color: 'var(--v3-fg)' }}>{c.title}</span>
                      <span className="block text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>
                        {t('home.messages', { n: String(c.messageCount) })} · {formatRelativeTime(c.updated_at, t, locale)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-4 text-center">
              <p className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {user ? t('home.emptyChat') : t('home.loginPrompt')}
              </p>
              <Link
                href={user ? '/chat' : '/login'}
                className="mt-2.5 inline-flex min-h-[36px] items-center rounded-lg px-4 text-[12px] font-semibold text-white"
                style={{ background: 'var(--v3-accent)' }}
              >
                {user ? t('home.chatNow') : t('home.login')}
              </Link>
            </div>
          )}
        </Panel>

        <Panel title={t('v3.panel.deals')} tone="amber" icon={<Tag size={13} />} action={{ label: t('v3.action.seeAll'), href: '/deals' }}>
          <ChipRow items={[t('v3.deals.all'), t('v3.deals.food'), t('v3.deals.travel'), t('v3.deals.beauty')]} />
          {/* Never invent an offer. A fabricated discount is a price claim, and the honesty
              rule that forbids a made-up price in a recommendation forbids one here too. */}
          <p className="mt-4 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.deals.empty')}</p>
        </Panel>

        {/* MARKETPLACE — reserved. No catalogue, no cart, no prices. */}
        <Panel title={t('v3.panel.marketplace')} tone="emerald" icon={<Store size={13} />}>
          <div className="flex h-full flex-col items-center justify-center py-6 text-center">
            <span className="v3-panel-icon mb-2" style={{ background: 'rgba(52,211,153,0.14)', color: 'var(--v3-emerald)', width: 40, height: 40, borderRadius: 12 }} aria-hidden="true">
              <Store size={20} />
            </span>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t('v3.marketplace.title')}</p>
            <p className="mt-1 max-w-[210px] text-[11px] leading-relaxed" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.marketplace.body')}
            </p>
          </div>
        </Panel>

        <Panel title={t('v3.panel.scamShield')} tone="emerald" icon={<ShieldCheck size={13} />} action={{ label: t('v3.action.open'), href: '/scam-shield' }}>
          <p className="text-[12px] font-medium" style={{ color: 'var(--v3-fg)' }}>{t('v3.scam.title')}</p>
          <Link
            href="/scam-shield"
            className="mt-2 flex min-h-[38px] items-center justify-center rounded-lg text-[12px] font-semibold text-white"
            style={{ background: 'var(--v3-accent)' }}
          >
            {t('v3.scam.cta')}
          </Link>
          <p className="mt-3 text-[11px] font-medium" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.scam.historyTitle')}</p>
          <p className="mt-1.5 text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.scam.empty')}
          </p>
        </Panel>

        <Panel title={t('v3.panel.planner')} tone="violet" icon={<CalendarRange size={13} />} action={{ label: t('v3.action.seeAll'), href: '/profile/price-watches' }}>
          <ChipRow items={[t('v3.planner.all'), t('v3.planner.travel'), t('v3.planner.work')]} />
          <p className="mt-3 text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.planner.empty')}
          </p>
          <button
            type="button"
            onClick={() => ask(t('v3.planner.prompt'))}
            className="mt-3 flex min-h-[36px] w-full items-center justify-center rounded-lg text-[12px] font-medium"
            style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
          >
            {t('v3.planner.cta')}
          </button>
        </Panel>

      </div>

      {/* ── Row 3 — tools, one strip, de-emphasised but complete ────────── */}
      <div id="smart-tools" className="mt-4">
        {/* No "open all" action: every one of the nine tools is already on the strip, so the
            link would scroll to the panel the user is looking at. An affordance that does
            nothing is worse than no affordance. */}
        <Panel title={t('v3.panel.smartTools')} tone="accent" icon={<Grid3x3 size={13} />}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {SMART_TOOLS.map(({ href, icon: Icon, labelKey, descKey, tone }) => (
              <Link key={labelKey} href={href} className="v3-tile flex flex-col gap-1.5 p-2.5">
                <span className="v3-panel-icon" style={{ background: 'rgba(255,255,255,0.05)', color: tone }} aria-hidden="true">
                  <Icon size={13} />
                </span>
                <span className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--v3-fg)' }}>{t(labelKey)}</span>
                <span className="line-clamp-2 text-[9px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>{t(descKey)}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Row 4 — library, continue, capabilities, profile ────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Panel title={t('v3.panel.saved')} tone="amber" icon={<Bookmark size={13} />} action={{ label: t('v3.action.view'), href: '/profile/favorites' }}>
          <ul className="space-y-2">
            {[t('v3.saved.places'), t('v3.saved.videos'), t('v3.saved.deals'), t('v3.saved.products'), t('v3.saved.posts')].map(l => (
              <li key={l}>
                <Link href="/profile/favorites" className="flex items-center justify-between text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                  <span>{l}</span>
                  <span style={{ color: 'var(--v3-fg-muted)' }}>—</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t('v3.panel.history')} tone="violet" icon={<HistoryIcon size={13} />} action={{ label: t('v3.action.view'), href: '/profile/history' }}>
          <ul className="space-y-2">
            {[t('v3.history.search'), t('v3.history.asked'), t('v3.history.watched'), t('v3.history.booked'), t('v3.history.checked')].map(l => (
              <li key={l}>
                <Link href="/profile/history" className="block text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>{l}</Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t('v3.panel.post')} tone="rose" icon={<Upload size={13} />}>
          <Link
            href="/reviews/new"
            className="flex flex-col items-center justify-center rounded-xl border border-dashed py-6"
            style={{ borderColor: 'var(--v3-border-strong)' }}
          >
            <Upload size={20} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
            <p className="mt-2 text-[11px]" style={{ color: 'var(--v3-fg-secondary)' }}>{t('v3.post.drop')}</p>
          </Link>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[{ i: ImageIcon, l: t('v3.post.photo') }, { i: Video, l: t('v3.post.video') }, { i: Film, l: t('v3.post.clip') }, { i: Radio, l: t('v3.post.live') }].map(({ i: Icon, l }) => (
              <Link key={l} href="/reviews/new" className="v3-tile flex flex-col items-center gap-1 py-2">
                <Icon size={15} style={{ color: 'var(--v3-fg-secondary)' }} aria-hidden="true" />
                <span className="text-[9px]" style={{ color: 'var(--v3-fg-muted)' }}>{l}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title={t('v3.panel.capabilities')} tone="emerald" icon={<Sparkles size={13} />} className="md:col-span-2">
          <div className="grid grid-cols-3 gap-2.5">
            {AI_CAPABILITIES.map(({ icon: Icon, labelKey, descKey }) => (
              <button
                key={labelKey}
                type="button"
                onClick={() => ask(t(labelKey))}
                className="v3-tile flex flex-col items-center gap-1.5 p-2.5 text-center"
              >
                <span className="v3-panel-icon" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }} aria-hidden="true">
                  <Icon size={13} />
                </span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t(labelKey)}</span>
                <span className="line-clamp-2 text-[9px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>{t(descKey)}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* PROFILE */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title={t('v3.panel.profile')} tone="violet" icon={<UserCircle size={13} />} action={{ label: t('v3.action.viewProfile'), href: '/profile' }} className="xl:col-span-2">
          <div className="flex items-center gap-3">
            <UserCircle size={40} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                {userInfo?.full_name || firstName || (user ? t('v3.profile.you') : t('v3.top.guest'))}
              </p>
              {user && <p className="text-[10px]" style={{ color: 'var(--v3-amber)' }}>Premium</p>}
            </div>
          </div>
        </Panel>

        <Panel title={t('v3.panel.notifications')} tone="rose" icon={<Bell size={13} />} action={{ label: t('v3.action.settings'), href: '/profile/settings' }} className="xl:col-span-3">
          <p className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>
            {t('v3.notifications.body')}
          </p>
        </Panel>
      </div>

      <V3Footer />
    </V3Shell>
  )
}
