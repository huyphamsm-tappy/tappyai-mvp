'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from '@/components/media/SafeImage'
import type { ComponentProps, ReactNode } from 'react'
import type Header from '@/components/Header'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  History as HistoryIcon, MessageCircle, PlayCircle, Link2, CalendarDays, CalendarCheck,
  ArrowRight, Crown, Sparkles, Trash2, type LucideIcon,
} from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { formatRelativeTime } from '@/lib/utils'
import DeleteConversationButton from './DeleteConversationButton'
import {
  readHistory, clearHistory, type ScamCheckHistoryEntry,
} from '@/lib/scam-shield/history'
import { LEVEL_TONE, LEVEL_KEY } from '@/app/scam-shield/ScamShieldResult'

// ── V3 Web · History ────────────────────────────────────────────────────────
//
// 🚨 FIVE REAL CATEGORIES. The reference drew six and this renders five; there
// is no recent-search section because nothing in this product records a search.
// The count on each card is `list.length` over rows the server actually returned
// (or the device store holds) — nothing here is hardcoded, and a category with
// no data renders no card.
//
// 🚨 THE PLANS CARD IS A LINK, NOT A COPY. Plans are derived from
// `conversations` by `lib/planner/derivePlans`, which needs the full `messages`
// blob — a multi-megabyte read the Planner deliberately bounds. History does not
// repeat that work or that cost: it points at the Planner, which owns it. It
// carries no count for the same reason, because a count would need the read.
//
// The skin (2026-09-12) follows the owner's History reference: one framed
// surface, a compact hero, pill tabs, one "activity module" per category with
// its own glyph tile, and a right rail. Paint lives in `globals.css` under
// `.v3-history-*`; every number and every row is decided here.

type Conv = { id: string; title: string; category: string; updated_at: string; messageCount: number }
type Video = { reviewId: string; title: string; thumbnail: string | null; contentType: string | null; watchedAt: string }
type Booking = { id: string; serviceName: string; status: string; date: string | null; time: string | null; createdAt: string }

type Period = 7 | 30 | 0
type Category = 'all' | 'ai' | 'video' | 'bookings' | 'links'

const PERIODS: { value: Period; labelKey: string }[] = [
  { value: 7, labelKey: 'v3.history.period7' },
  { value: 30, labelKey: 'v3.history.period30' },
  { value: 0, labelKey: 'v3.history.periodAll' },
]

/** The bookings page's own status vocabulary — the same keys, the same three states. */
const BOOKING_STATUS_KEY: Record<string, string> = {
  confirmed: 'bookings.status.confirmed',
  cancelled: 'bookings.status.cancelled',
  pending: 'bookings.status.pending',
}

/** Inclusive of everything when `days` is 0. */
function within(iso: string, days: Period): boolean {
  if (days === 0) return true
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= days * 86_400_000
}

/** How many rows a module previews when it shares the page, and when it has the page to itself. */
const PREVIEW = 3
const EXPANDED = 20

function ModuleCard({
  id, hue, icon: Icon, title, description, count, action, children,
}: {
  /** Category key. The quick-stats rail repeats these labels, so a test (or a
   *  future feature) needs something other than the heading text to aim at. */
  id: string
  hue: 'blue' | 'indigo' | 'violet' | 'amber' | 'emerald'
  icon: LucideIcon
  title: string
  description: string
  count?: number
  /** The see-all affordance: a link when a destination owns the full list, a button
   *  when the full list is this page's own tab. Absent when neither exists. */
  action?: { label: string; href: string } | { label: string; onClick: () => void }
  children?: ReactNode
}) {
  const seeAll = action && (
    'href' in action ? (
      <Link href={action.href} className="v3-history-seeall flex min-h-[40px] flex-shrink-0 items-center gap-1 text-[13px] font-semibold">
        {action.label}
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    ) : (
      <button type="button" onClick={action.onClick} className="v3-history-seeall flex min-h-[40px] flex-shrink-0 items-center gap-1 text-[13px] font-semibold">
        {action.label}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    )
  )

  return (
    <section className="v3-history-card p-4 sm:p-5" data-history-section={id} aria-labelledby={`history-${id}-title`}>
      {/* Two zones from `lg` up: the module's identity on the left, its rows on the
          right — the reference's composition. Below that the rows stack under it. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 items-start gap-4 lg:w-[38%] lg:flex-shrink-0">
          <span className="v3-history-glyph h-14 w-14 sm:h-16 sm:w-16" data-hue={hue} aria-hidden="true">
            <Icon size={28} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`history-${id}-title`} className="text-[17px] font-bold leading-tight sm:text-[19px]" style={{ color: 'var(--v3-fg)' }}>
                {title}
              </h2>
              {/* Rendered only when there IS a count — the Plans card has none by design. */}
              {count !== undefined && (
                <span className="v3-history-count rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums">{count}</span>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>{description}</p>
          </div>
        </div>
        {(children || seeAll) && (
          <div className="min-w-0 flex-1">
            {/* One action, one DOM node: under the rows on small screens, in the
                rows' top-right corner from `lg` — ordered by CSS, not duplicated. */}
            {seeAll && <div className="flex justify-start lg:mb-1 lg:justify-end">{seeAll}</div>}
            {children && <div className="space-y-2">{children}</div>}
          </div>
        )}
      </div>
    </section>
  )
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="v3-history-row flex min-h-[56px] items-center gap-3 p-2.5">
      {children}
    </Link>
  )
}

function Meta({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className="block truncate text-[12px]" style={{ color: tone ?? 'var(--v3-fg-muted)' }}>{children}</span>
  )
}

function Title({ children }: { children: ReactNode }) {
  return <span className="block truncate text-[13.5px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{children}</span>
}

export default function HistoryView({
  userInfo, conversations, videos, bookings = [],
}: {
  userInfo: ComponentProps<typeof Header>['user']
  conversations: Conv[]
  videos: Video[]
  bookings?: Booking[]
}) {
  const { t, locale } = useTranslation()
  const [period, setPeriod] = useState<Period>(0)
  const [category, setCategory] = useState<Category>('all')
  const [links, setLinks] = useState<ScamCheckHistoryEntry[]>([])

  /**
   * 🔑 Read after mount, never during render. Scam Shield's link history lives in
   * `localStorage` on THIS device — the same store the Scam Shield page reads —
   * so the server has no idea it exists and seeding state from it would hydrate
   * an empty server render against a populated client one.
   */
  useEffect(() => { setLinks(readHistory()) }, [])

  const shownConversations = useMemo(
    () => conversations.filter(c => within(c.updated_at, period)),
    [conversations, period],
  )
  const shownVideos = useMemo(
    () => videos.filter(v => within(v.watchedAt, period)),
    [videos, period],
  )
  const shownBookings = useMemo(
    () => bookings.filter(b => within(b.createdAt, period)),
    [bookings, period],
  )
  const shownLinks = useMemo(
    () => links.filter(l => within(new Date(l.checkedAt).toISOString(), period)),
    [links, period],
  )

  const show = (c: Category) => category === 'all' || category === c
  const limit = (c: Category) => (category === c ? EXPANDED : PREVIEW)

  /**
   * 🚨 THE TABS ARE BUILT FROM WHAT EXISTS, NOT FROM THE REFERENCE.
   *
   * A category with no rows in the selected period contributes no tab, so the
   * filter bar can never offer a control that is guaranteed to find nothing.
   * The recent-search category is absent at the source, not filtered out here.
   */
  const tabs = useMemo(() => {
    const out: { id: Category; labelKey: string; icon: LucideIcon | null }[] = [{ id: 'all', labelKey: 'v3.history.all', icon: null }]
    if (shownConversations.length > 0) out.push({ id: 'ai', labelKey: 'v3.history.ai', icon: MessageCircle })
    if (shownVideos.length > 0) out.push({ id: 'video', labelKey: 'v3.history.video', icon: PlayCircle })
    if (shownBookings.length > 0) out.push({ id: 'bookings', labelKey: 'v3.history.bookings', icon: CalendarCheck })
    if (shownLinks.length > 0) out.push({ id: 'links', labelKey: 'v3.history.links', icon: Link2 })
    return out
  }, [shownConversations.length, shownVideos.length, shownBookings.length, shownLinks.length])

  // A tab that disappears when the period narrows must not leave the page filtered
  // to a category no longer on screen.
  useEffect(() => {
    if (!tabs.some(tab => tab.id === category)) setCategory('all')
  }, [tabs, category])

  const nothing = shownConversations.length === 0 && shownVideos.length === 0
    && shownBookings.length === 0 && shownLinks.length === 0

  const stats: { labelKey: string; icon: LucideIcon; value: number }[] = [
    { labelKey: 'v3.history.ai', icon: MessageCircle, value: shownConversations.length },
    { labelKey: 'v3.history.video', icon: PlayCircle, value: shownVideos.length },
    { labelKey: 'v3.history.bookings', icon: CalendarCheck, value: shownBookings.length },
    { labelKey: 'v3.history.links', icon: Link2, value: shownLinks.length },
  ]

  /** The subscription page's own benefit lines — three of the six, not a new list. */
  const premiumPoints: { key: string; icon: LucideIcon }[] = [
    { key: 'sub.pro.history', icon: HistoryIcon },
    { key: 'sub.pro.memory', icon: Sparkles },
    { key: 'sub.pro.messages', icon: MessageCircle },
  ]

  return (
    <V3Shell
      title={t('v3.nav.history')}
      subtitle={t('v3.history.tagline')}
      activeTab="/profile/history"
      user={userInfo ? { name: userInfo.full_name, avatarUrl: userInfo.avatar_url } : null}
    >
      <div className="v3-history-frame p-4 sm:p-6 lg:p-8">
        {/* Two columns from `xl` up; the rail stacks under the modules below that.
            🚨 `xl`, not `lg`: at 1024 the shell's sidebar is already open, and a 300px
            rail beside it left the modules 334px wide — a phone column on a tablet. */}
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
          <div className="min-w-0 flex-1 space-y-5" data-history-main>

            {/* ── Hero ── compact on purpose: the modules must stay above the fold. */}
            <section className="v3-history-hero flex items-center gap-4 p-5 sm:gap-5 sm:p-6" aria-labelledby="history-hero-title">
              <span className="v3-history-brand flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] sm:h-[72px] sm:w-[72px] sm:rounded-[22px]" aria-hidden="true">
                <HistoryIcon size={30} strokeWidth={2.1} />
              </span>
              <div className="min-w-0">
                <h1 id="history-hero-title" className="text-[24px] font-extrabold leading-tight tracking-[-0.01em] sm:text-[30px]" style={{ color: 'var(--v3-fg)' }}>
                  {t('v3.history.title')}
                </h1>
                <p className="mt-1 text-[13.5px] sm:text-[14.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                  {t('v3.history.tagline')}
                </p>
              </div>
            </section>

            {tabs.length > 1 && (
              <div className="v3-scroll-x -mx-1 flex gap-2 px-1 pb-1" role="group" aria-label={t('v3.history.title')}>
                {tabs.map(tab => {
                  const active = category === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategory(tab.id)}
                      className={`v3-chip v3-history-tab flex-shrink-0 ${active ? 'v3-history-tab-active' : ''}`}
                    >
                      {tab.icon && <tab.icon size={16} aria-hidden="true" />}
                      {t(tab.labelKey)}
                    </button>
                  )
                })}
              </div>
            )}

            {nothing ? (
              // Calm and compact. The action goes to Explore, which is a real
              // destination — no example history is rendered to fill the page.
              <section className="v3-history-card flex flex-col items-center gap-2 px-6 py-14 text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: 'var(--v3-panel)', color: 'var(--v3-fg-muted)' }}
                  aria-hidden="true"
                >
                  <HistoryIcon size={26} />
                </span>
                <p className="mt-1 text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.empty')}</p>
                <p className="text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.history.emptyHint')}</p>
                <Link
                  href="/reviews"
                  className="v3-history-brand v3-history-cta mt-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold"
                >
                  {t('v3.history.emptyAction')}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </section>
            ) : (
              <>
                {/* ── Đã hỏi AI ── */}
                {show('ai') && shownConversations.length > 0 && (
                  <ModuleCard
                    id="ai"
                    hue="indigo"
                    icon={MessageCircle}
                    title={t('v3.history.ai')}
                    description={t('v3.history.aiDesc')}
                    count={shownConversations.length}
                    action={category === 'ai' || shownConversations.length <= PREVIEW
                      ? undefined
                      : { label: t('v3.history.seeAll'), onClick: () => setCategory('ai') }}
                  >
                    {shownConversations.slice(0, limit('ai')).map(conv => (
                      <div key={conv.id} className="v3-history-row flex min-h-[56px] items-center gap-3 p-2.5">
                        <Link href={`/chat/${conv.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2">
                          {/* A glyph, not a picture: conversations carry no thumbnail, and none is invented. */}
                          <span className="v3-history-glyph h-11 w-11 rounded-xl" data-hue="indigo" aria-hidden="true">
                            <MessageCircle size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <Title>{conv.title}</Title>
                            <Meta>
                              {t('v3.history.messageCount', { n: String(conv.messageCount) })}
                              {' · '}
                              {formatRelativeTime(conv.updated_at, t, locale)}
                            </Meta>
                          </span>
                        </Link>
                        {/* The delete this page already shipped. Per-conversation,
                            server-side, and the only real deletion History has. */}
                        <DeleteConversationButton id={conv.id} />
                      </div>
                    ))}
                  </ModuleCard>
                )}

                {/* ── Đã xem video ── */}
                {show('video') && shownVideos.length > 0 && (
                  <ModuleCard
                    id="video"
                    hue="violet"
                    icon={PlayCircle}
                    title={t('v3.history.video')}
                    description={t('v3.history.videoDesc')}
                    count={shownVideos.length}
                    action={category === 'video' || shownVideos.length <= PREVIEW
                      ? undefined
                      : { label: t('v3.history.seeAll'), onClick: () => setCategory('video') }}
                  >
                    {shownVideos.slice(0, limit('video')).map(video => (
                      <Row key={video.reviewId} href={`/reviews/${video.reviewId}`}>
                        {/* The review's OWN stored thumbnail, or a neutral tile. No
                            placeholder artwork is generated for a missing one, and
                            no duration is shown — `review_interactions` records
                            watch seconds, not the clip's length. */}
                        {video.thumbnail ? (
                          <Image
                            src={video.thumbnail}
                            alt=""
                            width={88}
                            height={56}
                            className="h-14 w-[88px] flex-shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="v3-history-glyph h-14 w-[88px] rounded-xl" data-hue="violet" aria-hidden="true">
                            <PlayCircle size={20} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <Title>{video.title}</Title>
                          <Meta>{formatRelativeTime(video.watchedAt, t, locale)}</Meta>
                        </span>
                      </Row>
                    ))}
                  </ModuleCard>
                )}

                {/* ── Bookings ──
                    The same `bookings` rows `/profile/bookings` lists, newest first;
                    that page owns the full list and the actions on it. */}
                {show('bookings') && shownBookings.length > 0 && (
                  <ModuleCard
                    id="bookings"
                    hue="amber"
                    icon={CalendarCheck}
                    title={t('v3.history.bookings')}
                    description={t('v3.history.bookingsDesc')}
                    count={shownBookings.length}
                    action={{ label: t('v3.history.seeAll'), href: '/profile/bookings' }}
                  >
                    {shownBookings.slice(0, limit('bookings')).map(booking => (
                      <Row key={booking.id} href="/profile/bookings">
                        <span className="v3-history-glyph h-11 w-11 rounded-xl" data-hue="amber" aria-hidden="true">
                          <CalendarCheck size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Title>{booking.serviceName}</Title>
                          <Meta>
                            {[booking.date, booking.time].filter(Boolean).join(' · ')}
                            {booking.date || booking.time ? ' · ' : ''}
                            {t(BOOKING_STATUS_KEY[booking.status] ?? BOOKING_STATUS_KEY.pending)}
                          </Meta>
                        </span>
                      </Row>
                    ))}
                  </ModuleCard>
                )}

                {/* ── Đã kiểm tra link ── */}
                {show('links') && shownLinks.length > 0 && (
                  <ModuleCard
                    id="links"
                    hue="blue"
                    icon={Link2}
                    title={t('v3.history.links')}
                    description={t('v3.history.linksDesc')}
                    count={shownLinks.length}
                    action={{ label: t('v3.history.seeAll'), href: '/scam-shield' }}
                  >
                    {shownLinks.slice(0, limit('links')).map(entry => {
                      const tone = LEVEL_TONE[entry.level]
                      return (
                        <Row key={`${entry.url}-${entry.checkedAt}`} href="/scam-shield">
                          <span
                            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                            style={{ background: tone.soft, color: tone.fg }}
                            aria-hidden="true"
                          >
                            <tone.icon size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <Title>{entry.url}</Title>
                            <Meta tone={tone.fg}>
                              {/* The verdict the engine actually returned, from the
                                  same map the Scam Shield result uses. */}
                              {t(LEVEL_KEY[entry.level])}
                              <span style={{ color: 'var(--v3-fg-muted)' }}>
                                {' · '}
                                {formatRelativeTime(new Date(entry.checkedAt).toISOString(), t, locale)}
                              </span>
                            </Meta>
                          </span>
                        </Row>
                      )
                    })}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                        {t('v3.scam.historyLocal')}
                      </p>
                      <button
                        type="button"
                        onClick={() => { clearHistory(); setLinks([]) }}
                        className="flex min-h-[40px] flex-shrink-0 items-center gap-1.5 text-[12px] font-semibold hover:underline focus:outline-none focus-visible:ring-2"
                        style={{ color: 'var(--v3-fg-muted)' }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        {t('v3.history.clearLinks')}
                      </button>
                    </div>
                  </ModuleCard>
                )}

                {/* ── Plans ──
                    A link, not a list. The Planner owns this derivation and pays
                    for it; History points at it rather than keeping a second copy. */}
                {category === 'all' && (
                  <ModuleCard
                    id="plans"
                    hue="emerald"
                    icon={CalendarDays}
                    title={t('v3.history.plans')}
                    description={t('v3.history.plansDesc')}
                    action={{ label: t('v3.history.plansOpen'), href: '/planner' }}
                  />
                )}
              </>
            )}
          </div>

          {/* ── Right rail ── */}
          <aside className="w-full flex-shrink-0 space-y-4 xl:w-[320px]" data-history-rail>
            {/* 🚨 A SELECTOR, NOT A CHART. The reference shows a seven-bar activity
                graph. Drawing one would mean bucketing four unrelated sources into
                per-day totals and presenting the result as a measurement; this
                filters the real lists instead, and every number beside it moves
                with it. */}
            <section className="v3-history-rail-card p-4" aria-labelledby="history-period-title">
              <h2 id="history-period-title" className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.periodTitle')}</h2>
              <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label={t('v3.history.periodTitle')}>
                {PERIODS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={period === option.value}
                    onClick={() => setPeriod(option.value)}
                    className="v3-history-segment flex min-h-[40px] items-center justify-center rounded-xl px-2 text-[12.5px] font-semibold"
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className="v3-history-rail-card p-4" data-history-stats aria-labelledby="history-stats-title">
              <h2 id="history-stats-title" className="text-[15px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.statsTitle')}</h2>
              <ul className="mt-2 divide-y" style={{ borderColor: 'var(--v3-border)' }}>
                {stats.map(stat => (
                  <li key={stat.labelKey} className="flex items-center gap-3 py-3" style={{ borderColor: 'var(--v3-border)' }}>
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                      aria-hidden="true"
                    >
                      <stat.icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                      {t(stat.labelKey)}
                    </span>
                    {/* Every number here is `list.length` over rows the server
                        returned, inside the selected period. Nothing is estimated. */}
                    <span className="flex-shrink-0 text-[16px] font-extrabold tabular-nums" style={{ color: 'var(--v3-fg)' }}>
                      {stat.value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Premium: the same destination the sidebar's pinned upsell already
                links to, with three of the subscription page's own benefit lines. */}
            <section className="v3-history-premium p-5" aria-labelledby="history-premium-title">
              <div className="flex items-start gap-4">
                <span className="v3-history-brand flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full" aria-hidden="true">
                  <Crown size={26} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h2 id="history-premium-title" className="text-[16px] font-bold leading-snug" style={{ color: 'var(--v3-fg)' }}>
                    {t('v3.history.premiumTitle')}
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
                    {t('v3.history.premiumBody')}
                  </p>
                </div>
              </div>
              <Link
                href="/subscription"
                className="v3-history-brand v3-history-cta mt-4 flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-[14px] font-semibold"
              >
                {t('v3.premium.cta')}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <ul className="mt-3 space-y-2">
                {premiumPoints.map(point => (
                  <li key={point.key} className="v3-history-premium-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] font-medium" style={{ color: 'var(--v3-fg-secondary)' }}>
                    <point.icon size={15} aria-hidden="true" style={{ color: 'var(--v3-accent)' }} />
                    <span className="min-w-0 truncate">{t(point.key)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>

      <V3Footer />
    </V3Shell>
  )
}
