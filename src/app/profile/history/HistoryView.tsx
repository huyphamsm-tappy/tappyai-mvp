'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ComponentProps, ReactNode } from 'react'
import type Header from '@/components/Header'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  History as HistoryIcon, MessageCircle, PlayCircle, Link2, CalendarDays,
  ChevronRight, Compass, Trash2,
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
// 🚨 FOUR REAL CATEGORIES. The reference drew five and this renders four; there
// is no recent-search section because nothing in this product records a search.
// The count on each card is `list.length` over rows the server actually returned
// — nothing here is hardcoded, and a category with no data renders no card.
//
// 🚨 THE PLANS CARD IS A LINK, NOT A COPY. Plans are derived from
// `conversations` by `lib/planner/derivePlans`, which needs the full `messages`
// blob — a multi-megabyte read the Planner deliberately bounds. History does not
// repeat that work or that cost: it points at the Planner, which owns it. It
// carries no count for the same reason, because a count would need the read.

type Conv = { id: string; title: string; category: string; updated_at: string; messageCount: number }
type Video = { reviewId: string; title: string; thumbnail: string | null; contentType: string | null; watchedAt: string }

type Period = 7 | 30 | 0
type Category = 'all' | 'ai' | 'video' | 'links'

const PERIODS: { value: Period; labelKey: string }[] = [
  { value: 7, labelKey: 'v3.history.period7' },
  { value: 30, labelKey: 'v3.history.period30' },
  { value: 0, labelKey: 'v3.history.periodAll' },
]

/** Inclusive of everything when `days` is 0. */
function within(iso: string, days: Period): boolean {
  if (days === 0) return true
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= days * 86_400_000
}

function SectionCard({
  id, icon, tone, title, description, count, action, children,
}: {
  /** Category key. The quick-stats rail repeats these labels, so a test (or a
   *  future feature) needs something other than the heading text to aim at. */
  id: string
  icon: ReactNode
  tone: string
  title: string
  description: string
  count?: number
  action?: { href: string; label: string }
  children?: ReactNode
}) {
  return (
    <section className="v3-panel p-4" data-history-section={id}>
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[14.5px] font-bold" style={{ color: 'var(--v3-fg)' }}>{title}</h2>
            {/* Rendered only when there IS a count — the Plans card has none by design. */}
            {count !== undefined && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
              >
                {count}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{description}</p>
        </div>
        {action && (
          <Link
            href={action.href}
            className="flex flex-shrink-0 items-center gap-1 text-[12px] font-semibold hover:underline"
            style={{ color: 'var(--v3-accent)' }}
          >
            {action.label}
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {children && <div className="mt-3 space-y-1.5">{children}</div>}
    </section>
  )
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl p-2.5 transition-colors"
      style={{ background: 'var(--v3-panel-elevated)' }}
    >
      {children}
    </Link>
  )
}

export default function HistoryView({
  userInfo, conversations, videos,
}: {
  userInfo: ComponentProps<typeof Header>['user']
  conversations: Conv[]
  videos: Video[]
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
  const shownLinks = useMemo(
    () => links.filter(l => within(new Date(l.checkedAt).toISOString(), period)),
    [links, period],
  )

  const show = (c: Category) => category === 'all' || category === c

  /**
   * 🚨 THE TABS ARE BUILT FROM WHAT EXISTS, NOT FROM THE REFERENCE.
   *
   * A category with no rows in the selected period contributes no tab, so the
   * filter bar can never offer a control that is guaranteed to find nothing.
   * The recent-search category is absent at the source, not filtered out here.
   */
  const tabs = useMemo(() => {
    const out: { id: Category; labelKey: string }[] = [{ id: 'all', labelKey: 'v3.history.all' }]
    if (shownConversations.length > 0) out.push({ id: 'ai', labelKey: 'v3.history.ai' })
    if (shownVideos.length > 0) out.push({ id: 'video', labelKey: 'v3.history.video' })
    if (shownLinks.length > 0) out.push({ id: 'links', labelKey: 'v3.history.links' })
    return out
  }, [shownConversations.length, shownVideos.length, shownLinks.length])

  // A tab that disappears when the period narrows must not leave the page filtered
  // to a category no longer on screen.
  useEffect(() => {
    if (!tabs.some(tab => tab.id === category)) setCategory('all')
  }, [tabs, category])

  const nothing = shownConversations.length === 0 && shownVideos.length === 0 && shownLinks.length === 0

  const stats = [
    { labelKey: 'v3.history.ai', icon: MessageCircle, value: shownConversations.length },
    { labelKey: 'v3.history.video', icon: PlayCircle, value: shownVideos.length },
    { labelKey: 'v3.history.links', icon: Link2, value: shownLinks.length },
  ]

  return (
    <V3Shell
      title={t('v3.nav.history')}
      subtitle={t('v3.history.tagline')}
      activeTab="/profile/history"
      user={userInfo ? { name: userInfo.full_name, avatarUrl: userInfo.avatar_url } : null}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4" data-history-main>

          {/* ── Header ── */}
          <section className="v3-panel flex items-center gap-3.5 p-5">
            <span
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl"
              style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
              aria-hidden="true"
            >
              <HistoryIcon size={24} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h1
                className="text-[19px] font-extrabold uppercase leading-tight tracking-[0.06em]"
                style={{ color: 'var(--v3-fg)' }}
              >
                {t('v3.history.title')}
              </h1>
              <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.history.tagline')}
              </p>
            </div>
          </section>

          {tabs.length > 1 && (
            <div className="v3-scroll-x flex gap-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={category === tab.id}
                  onClick={() => setCategory(tab.id)}
                  className="v3-chip flex-shrink-0"
                  style={category === tab.id
                    ? { background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)', borderColor: 'transparent' }
                    : undefined}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
          )}

          {nothing ? (
            // Calm and compact. The action goes to Explore, which is a real
            // destination — no example history is rendered to fill the page.
            <section className="v3-panel flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-muted)' }}
                aria-hidden="true"
              >
                <HistoryIcon size={26} />
              </span>
              <p className="mt-1 text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.empty')}</p>
              <p className="text-[12.5px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('v3.history.emptyHint')}</p>
              <Link
                href="/reviews"
                className="mt-3 flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-semibold"
                style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
              >
                {t('v3.history.emptyAction')}
              </Link>
            </section>
          ) : (
            <>
              {/* ── Đã hỏi AI ── */}
              {show('ai') && shownConversations.length > 0 && (
                <SectionCard
                  id="ai"
                  icon={<MessageCircle size={22} />}
                  tone="var(--v3-accent)"
                  title={t('v3.history.ai')}
                  description={t('v3.history.aiDesc')}
                  count={shownConversations.length}
                >
                  {shownConversations.slice(0, category === 'ai' ? 20 : 3).map(conv => (
                    <div
                      key={conv.id}
                      className="flex items-center gap-3 rounded-xl p-2.5"
                      style={{ background: 'var(--v3-panel-elevated)' }}
                    >
                      <Link href={`/chat/${conv.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
                          aria-hidden="true"
                        >
                          <MessageCircle size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                            {conv.title}
                          </span>
                          <span className="block text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                            {t('v3.history.messageCount', { n: String(conv.messageCount) })}
                            {' · '}
                            {formatRelativeTime(conv.updated_at, t, locale)}
                          </span>
                        </span>
                      </Link>
                      {/* The delete this page already shipped. Per-conversation,
                          server-side, and the only real deletion History has. */}
                      <DeleteConversationButton id={conv.id} />
                    </div>
                  ))}
                </SectionCard>
              )}

              {/* ── Đã xem video ── */}
              {show('video') && shownVideos.length > 0 && (
                <SectionCard
                  id="video"
                  icon={<PlayCircle size={22} />}
                  tone="var(--v3-violet)"
                  title={t('v3.history.video')}
                  description={t('v3.history.videoDesc')}
                  count={shownVideos.length}
                >
                  {shownVideos.slice(0, category === 'video' ? 20 : 3).map(video => (
                    <Row key={video.reviewId} href={`/reviews/${video.reviewId}`}>
                      {/* The review's OWN stored thumbnail, or a neutral tile. No
                          placeholder artwork is generated for a missing one, and
                          no duration is shown — `review_interactions` records
                          watch seconds, not the clip's length. */}
                      {video.thumbnail ? (
                        <Image
                          src={video.thumbnail}
                          alt=""
                          width={64}
                          height={40}
                          className="h-10 w-16 flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: 'var(--v3-panel)', color: 'var(--v3-fg-muted)' }}
                          aria-hidden="true"
                        >
                          <PlayCircle size={16} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                          {video.title}
                        </span>
                        <span className="block text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                          {formatRelativeTime(video.watchedAt, t, locale)}
                        </span>
                      </span>
                    </Row>
                  ))}
                </SectionCard>
              )}

              {/* ── Đã kiểm tra link ── */}
              {show('links') && shownLinks.length > 0 && (
                <SectionCard
                  id="links"
                  icon={<Link2 size={22} />}
                  tone="var(--v3-emerald)"
                  title={t('v3.history.links')}
                  description={t('v3.history.linksDesc')}
                  count={shownLinks.length}
                  action={{ href: '/scam-shield', label: t('v3.history.seeAll') }}
                >
                  {shownLinks.slice(0, category === 'links' ? 15 : 3).map(entry => {
                    const tone = LEVEL_TONE[entry.level]
                    return (
                      <Row key={`${entry.url}-${entry.checkedAt}`} href="/scam-shield">
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ background: tone.soft, color: tone.fg }}
                          aria-hidden="true"
                        >
                          <tone.icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold" style={{ color: 'var(--v3-fg)' }}>
                            {entry.url}
                          </span>
                          <span className="block text-[11.5px]" style={{ color: tone.fg }}>
                            {/* The verdict the engine actually returned, from the
                                same map the Scam Shield result uses. */}
                            {t(LEVEL_KEY[entry.level])}
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
                          {formatRelativeTime(new Date(entry.checkedAt).toISOString(), t, locale)}
                        </span>
                      </Row>
                    )
                  })}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                      {t('v3.scam.historyLocal')}
                    </p>
                    <button
                      type="button"
                      onClick={() => { clearHistory(); setLinks([]) }}
                      className="flex flex-shrink-0 items-center gap-1.5 text-[11.5px] font-semibold hover:underline"
                      style={{ color: 'var(--v3-fg-muted)' }}
                    >
                      <Trash2 size={12} />
                      {t('v3.history.clearLinks')}
                    </button>
                  </div>
                </SectionCard>
              )}

              {/* ── Plans ──
                  A link, not a list. The Planner owns this derivation and pays
                  for it; History points at it rather than keeping a second copy. */}
              {category === 'all' && (
                <SectionCard
                  id="plans"
                  icon={<CalendarDays size={22} />}
                  tone="var(--v3-amber)"
                  title={t('v3.history.plans')}
                  description={t('v3.history.plansDesc')}
                  action={{ href: '/planner', label: t('v3.history.plansOpen') }}
                />
              )}
            </>
          )}
        </div>

        {/* ── Right rail ── */}
        <aside className="w-full flex-shrink-0 space-y-4 lg:w-[300px]">
          {/* 🚨 A SELECTOR, NOT A CHART. The reference shows a seven-bar activity
              graph. Drawing one would mean bucketing three unrelated sources into
              per-day totals and presenting the result as a measurement; this
              filters the real lists instead, and every number beside it moves
              with it. */}
          <section className="v3-panel p-4">
            <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.periodTitle')}</h2>
            <div className="mt-3 space-y-1">
              {PERIODS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={period === option.value}
                  onClick={() => setPeriod(option.value)}
                  className="flex w-full items-center rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors"
                  style={period === option.value
                    ? { background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }
                    : { background: 'transparent', color: 'var(--v3-fg-secondary)' }}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </section>

          <section className="v3-panel p-4" data-history-stats>
            <h2 className="text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.statsTitle')}</h2>
            <div className="mt-3 space-y-1">
              {stats.map(stat => (
                <div key={stat.labelKey} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
                    aria-hidden="true"
                  >
                    <stat.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                    {t(stat.labelKey)}
                  </span>
                  {/* Every number here is `list.length` over rows the server
                      returned, inside the selected period. Nothing is estimated. */}
                  <span className="flex-shrink-0 text-[14px] font-extrabold tabular-nums" style={{ color: 'var(--v3-fg)' }}>
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="v3-panel p-4">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}
              aria-hidden="true"
            >
              <Compass size={22} />
            </span>
            <h2 className="mt-3 text-[14px] font-bold" style={{ color: 'var(--v3-fg)' }}>{t('v3.history.discoverTitle')}</h2>
            <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('v3.history.discoverBody')}
            </p>
            <Link
              href="/reviews"
              className="mt-3 flex min-h-[40px] items-center justify-center gap-2 rounded-xl text-[13px] font-semibold"
              style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
            >
              {t('v3.history.discoverCta')}
            </Link>
          </section>
        </aside>
      </div>

      <V3Footer />
    </V3Shell>
  )
}
