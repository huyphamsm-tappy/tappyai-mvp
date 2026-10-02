'use client'

import { useMemo, useState } from 'react'
import Image from '@/components/media/SafeImage'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { Bell, Settings, Check, AlertCircle, Loader2 } from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { ChipRow } from '@/components/v3/Panel'
import NotificationSettings from '@/components/notifications/NotificationSettings'
import { useNotifications } from '@/components/NotificationProvider'
import { MessagesProvider, useMessages } from '@/components/messaging/MessagesProvider'
import MessagesTab from '@/components/messaging/MessagesTab'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { CATEGORY_STYLE,
  mapDtoToInbox, groupNotifs, notifSection, isSocialGroup, notificationBrandMark,
  NOTIF_COLOR, type GroupedNotif,
} from '@/lib/notifications/inbox'

// ── V3 Web · Page 6 — the Inbox / notification centre ───────────────────────
//
// 🚨 THIS ROUTE USED TO BE A SETTINGS PAGE, AND THAT WAS THE BUG.
//
// `/profile/notifications` is what the V3 shell's "Inbox" tab has always pointed at — sidebar row
// and top tab, the latter carrying the unread badge. It rendered `NotificationSettings` and nothing
// else: a user who clicked a badge reading "3" arrived at a push-permission toggle and never saw
// the three things. The notification LIST existed only inside `InboxTab` in `/reviews`, reachable
// through that page's bottom bar.
//
// 🚨 AND THAT MADE THE LIST DESKTOP-UNREACHABLE. `/reviews` now renders `ExploreStage` above
// 1024px, which has no bottom bar, and the desktop sidebar inside `/reviews` never had an inbox
// row. So on desktop there was no path to any notification at all. Turning THIS route into the
// real inbox fixes that with no navigation change whatsoever — the links already point here.
//
// 🚨 THERE ARE TWO TABS NOW, AND THEIR DATA MUST NEVER MERGE.
//
// This comment used to say "there is no messages tab", and it was right at the time: the product
// had no user-to-user messaging, and dressing `/api/conversations` up as messages would have
// invented a social feature out of the user's AI assistant history. That history is STILL not
// messages, and nothing below reads it.
//
// What changed is that real messaging now exists — `chat_threads` / `chat_participants` /
// `chat_messages` / `chat_reads`, with their own RLS, their own API under `/api/messaging`, and
// their own Realtime channel. So the Inbox has the two tabs it always looked like it should have,
// backed by two independent stores:
//
//   Messages       MessagesProvider      chat_* tables   a person said something to you
//   Notifications  NotificationProvider  notifications   the system told you about your content
//
// 🚨 THE UNREAD COUNTS ARE INDEPENDENT AND MUST STAY THAT WAY. A messages badge of 3 beside a
// notifications badge of 5 is two facts, not one split in half. This file never adds them
// together, and `MessagesProvider` does not read `useNotifications` — `NotificationProvider` is
// not modified by this feature at all.
//
// 🚨 NO PER-TAB COUNTS. The backend returns ONE authoritative `unread_count`. Counting unread rows
// per category out of the loaded page would produce a number that looks like a total and is only
// a property of the current window — it would disagree with the badge in the nav. So the global
// count is shown once, in the header, where it is unambiguous.
//
// Everything else is reused: `NotificationProvider` for data, unread count and mark-all-read;
// `mapDtoToInbox` / `groupNotifs` / `notifSection` / `isSocialGroup` / `notificationBrandMark` /
// `NOTIF_COLOR` for the domain; `V3Shell` and `ChipRow` for the shell and the filters.

/** The real category taxonomy — the four values the API actually emits. */
const CATEGORIES = [
  { key: 'social', labelKey: 'v3.inbox.catSocial' },
  { key: 'deal', labelKey: 'v3.inbox.catDeal' },
  { key: 'explore', labelKey: 'v3.inbox.catExplore' },
  { key: 'system', labelKey: 'v3.inbox.catSystem' },
] as const

/** Category → the tint and glyph a non-social row wears. Same map the mobile inbox uses. */

/** Clock time for a row, in the reader's locale. The date lives in the section heading. */
function timeOf(iso: string, locale: 'vi' | 'en') {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}

/**
 * The Inbox tab bar.
 *
 * 🔑 Each tab shows ITS OWN count, read from ITS OWN store. Neither number is
 * derived from the other, and neither is a total of both.
 */
function InboxTabs({ tab, onChange }: { tab: InboxTab; onChange: (t: InboxTab) => void }) {
  const { t } = useTranslation()
  const { unreadCount: notificationUnread } = useNotifications()
  const { unreadTotal: messageUnread } = useMessages()

  const TABS: { id: InboxTab; labelKey: string; count: number }[] = [
    { id: 'messages', labelKey: 'v3.inbox.messages', count: messageUnread },
    { id: 'notifications', labelKey: 'v3.inbox.announcements', count: notificationUnread },
  ]

  return (
    <div className="flex gap-1 border-b" style={{ borderColor: 'var(--v3-border)' }} role="tablist">
      {TABS.map((entry) => {
        const active = tab === entry.id
        return (
          <button
            key={entry.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(entry.id)}
            className="-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors"
            style={active
              ? { borderColor: 'var(--v3-accent)', color: 'var(--v3-accent)' }
              : { borderColor: 'transparent', color: 'var(--v3-fg-muted)' }}
          >
            {t(entry.labelKey)}
            {/* Real counts only. Zero renders nothing rather than a "0" badge. */}
            {entry.count > 0 && (
              <span
                className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums"
                style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
              >
                {entry.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

type InboxTab = 'messages' | 'notifications'

/**
 * `MessagesProvider` is mounted HERE rather than in the root layout.
 *
 * 🔑 Phase 1 shows message unread only inside this page — the V3 shell's Inbox
 * badge stays notification-only — so a Realtime subscription open on every route
 * would be a socket nothing is reading. Moving it up is a deliberate later step,
 * not an oversight.
 */
export default function NotificationsView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  return (
    <MessagesProvider>
      <InboxView user={user} />
    </MessagesProvider>
  )
}

function InboxView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t, locale } = useTranslation()
  const { notifications, unreadCount, loading, markAllRead } = useNotifications()
  const [tab, setTab] = useState<InboxTab>('messages')
  const [filter, setFilter] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  // DTO → domain → grouped, through the shared helpers. No second mapping layer.
  const groups = useMemo(() => groupNotifs(notifications.map(mapDtoToInbox)), [notifications])

  const activeCategory = filter === 0 ? null : CATEGORIES[filter - 1].key
  const visible = activeCategory ? groups.filter((g) => g.category === activeCategory) : groups

  /**
   * Time sections, in order.
   *
   * 🔑 THE SECTION KEYS ARE ASKED FOR, NOT SPELLED OUT. `notifSection` returns Vietnamese string
   * constants; the mobile inbox hardcodes those three literals to build its labels, which makes a
   * second copy of the helper's vocabulary that is free to drift the day the helper changes one.
   * Probing it with a timestamp inside each of its own windows derives the same three keys from
   * the single source of truth — and keeps a screen with no Vietnamese UI text free of it.
   */
  const sections = useMemo(() => {
    const now = Date.now()
    const order = [
      { key: notifSection(new Date(now).toISOString(), now), label: t('reviews.sectionJustNow') },
      { key: notifSection(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now), label: t('reviews.sectionToday') },
      { key: notifSection(new Date(now - 48 * 60 * 60 * 1000).toISOString(), now), label: t('reviews.sectionThisWeek') },
    ]
    const by = new Map<string, GroupedNotif[]>()
    for (const g of visible) {
      const s = notifSection(g.created_at, now)
      if (!by.has(s)) by.set(s, [])
      by.get(s)!.push(g)
    }
    return order
      .filter((o) => by.has(o.key))
      .map((o) => ({ key: o.key, label: o.label, items: by.get(o.key)! }))
  }, [visible, t])

  return (
    <V3Shell
      title={t('v3.inbox.title')}
      subtitle={t('v3.inbox.subtitle')}
      activeTab="/profile/notifications"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
    {/* 🚨 THE PAGE IS A COLUMN THAT FILLS THE VIEWPORT, AND THAT IS A LAYOUT FIX, NOT A STYLE ONE.
     *
     *  The shell's `<main>` is a plain block. With an empty inbox the content was ~200px tall, so
     *  the footer landed in the middle of the screen with a large unexplained void beneath it and
     *  the page read as unfinished. Making THIS page a flex column with a viewport-derived
     *  min-height lets the list region grow and pushes the footer to the bottom where it belongs.
     *
     *  🔑 SCOPED TO THIS PAGE ON PURPOSE. The obvious fix is to make `<main>` a flex column in
     *  `V3Shell` — and that would move the footer on Home, Explore and Deals too, three surfaces
     *  that are already approved. The shell is not touched.
     *
     *  The subtraction is the chrome around `<main>`: the shell header plus its own `pt-5`/`pb-10`. */}
    <div
      className="flex flex-col"
      style={{ minHeight: 'calc(100dvh - var(--v3-header-h) - 5.5rem)' }}
    >
      <InboxTabs tab={tab} onChange={setTab} />

      {tab === 'messages' && (
        <div className="pt-4">
          <MessagesTab signedIn={!!user} />
        </div>
      )}

      {tab === 'notifications' && (
      <>
      <div className="space-y-4 pt-4">
        {/* ── Filters + actions, on ONE row ────────────────────────────────
            🚨 THE BELL IS GONE. A bell tile used to open this block, and it was the page saying
            its own name a third time: the shell header already carries the page title, and the nav tab
            it was reached from carries the same icon. What belongs here is state and actions —
            the one real unread count, mark-all-read, and the settings this route used to be —
            beside the filters rather than on a row of their own. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          {/* ── Category filter. The four REAL categories, not a taxonomy invented here. ── */}
          <ChipRow
            className="min-w-0 flex-1"
            items={[t('v3.inbox.all'), ...CATEGORIES.map((c) => t(c.labelKey))]}
            activeIndex={filter}
            onSelect={setFilter}
          />

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* The global count, and only when there is one. `unreadCount` is the same
                number the nav badge reads, so the two can never disagree. */}
            {unreadCount > 0 && (
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
              >
                {t('v3.inbox.unread', { count: String(unreadCount) })}
              </span>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => { void markAllRead() }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
                style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg-secondary)' }}
              >
                <Check size={14} aria-hidden="true" />
                {t('v3.inbox.markAllRead')}
              </button>
            )}
            {/* 🔑 The settings were not deleted — they moved behind this control, and the
                SAME `NotificationSettings` component renders below when it is open. There is
                no second copy of the preferences UI and no new route. */}
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
              aria-label={showSettings ? t('v3.inbox.settingsClose') : t('v3.inbox.settings')}
              title={showSettings ? t('v3.inbox.settingsClose') : t('v3.inbox.settings')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{
                background: showSettings ? 'color-mix(in srgb, var(--v3-accent) 16%, var(--v3-panel))' : 'var(--v3-panel)',
                borderColor: showSettings ? 'var(--v3-accent)' : 'var(--v3-border)',
                color: showSettings ? 'var(--v3-accent)' : 'var(--v3-fg-secondary)',
              }}
            >
              <Settings size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div
            className="rounded-2xl border p-1"
            style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)' }}
          >
            <NotificationSettings />
          </div>
        )}
      </div>

      {/* ── The list region. Grows to take the slack, which is what stops the empty
          state floating near the top of a tall dark page and the footer riding up
          with it. When there ARE notifications this simply holds them. ── */}
      <div className="flex flex-1 flex-col gap-4 pt-4">
        {loading && groups.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
          </div>
        )}

        {!loading && groups.length === 0 && (
          <EmptyState icon={<Bell size={30} />} text={t('v3.inbox.emptyAll')} />
        )}

        {!loading && groups.length > 0 && visible.length === 0 && (
          <EmptyState icon={<AlertCircle size={30} />} text={t('v3.inbox.emptyFiltered')} />
        )}

        {sections.map((section) => (
          <section key={section.key} className="space-y-1.5">
            <p
              className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'var(--v3-fg-muted)' }}
            >
              {section.label}
            </p>
            <div
              className="overflow-hidden rounded-2xl border"
              style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)' }}
            >
              {section.items.map((g, i) => (
                <NotifRow key={g.id} g={g} locale={locale} first={i === 0} />
              ))}
            </div>
          </section>
        ))}
      </div>
      </>
      )}

      {/* Inside the column, after the growing region — so it sits at the bottom of the
          viewport on a short page and directly under the list on a long one. */}
      <V3Footer />
    </div>
    </V3Shell>
  )
}

/**
 * The empty inbox, composed rather than left over.
 *
 * 🚨 THE PANEL IS COMPACT AND CENTRED — IT DOES NOT STRETCH.
 *
 * This has now been wrong in both directions, which is worth recording. First it was a short block
 * pinned to the TOP of a tall page, with the footer stranded halfway down and a void beneath.
 * Fixing that by giving the panel `flex-1` overcorrected: the dashed box then grew to the full
 * height of the list region, so an inbox with nothing in it drew the largest element on the
 * screen. A big empty box is not more finished than a small one.
 *
 * What is right is the third thing: the REGION takes the slack (so the footer still sits at the
 * bottom) and the panel keeps its own modest size, centred in that slack. The emptiness is then a
 * quiet statement rather than a feature.
 *
 * No filler rows in any version — there is genuinely nothing to show.
 */
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-9 text-center"
        style={{ borderColor: 'var(--v3-border)', color: 'var(--v3-fg-muted)' }}
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: 'var(--v3-panel)', color: 'var(--v3-fg-muted)' }}
        >
          {icon}
        </span>
        <p className="max-w-[34ch] text-[13px] leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

/**
 * One inbox row.
 *
 * Two shapes, decided by the shared `isSocialGroup` rather than re-derived here: a social row
 * (like / follow / comment WITH actors) shows the avatar stack; everything else — deal, explore,
 * system, milestone — shows the category glyph, or the official Tappy mark when the platform
 * itself is speaking (`notificationBrandMark`).
 *
 * 🚨 UNREAD IS QUIET. A dot in the accent and a brighter title, nothing more. The old inbox styled
 * the whole row; a wall of highlighted rows is the same as no highlight at all, and this list is
 * mostly unread the first time anyone opens it.
 */
function NotifRow({ g, locale, first }: { g: GroupedNotif; locale: 'vi' | 'en'; first: boolean }) {
  const router = useRouter()
  const { t } = useTranslation()
  const cat = CATEGORY_STYLE[g.category] ?? CATEGORY_STYLE.system
  const brandMark = notificationBrandMark(g.category)
  const social = isSocialGroup(g)
  const actors = g.actors.slice(0, 3)

  const go = () => { if (g.url) router.push(g.url) }
  const interactive = !!g.url

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={go}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } } : undefined}
      className={
        'flex items-start gap-3 px-3.5 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset'
        + (interactive ? ' cursor-pointer hover:bg-white/[0.03]' : '')
        + (first ? '' : ' border-t')
      }
      style={{ borderColor: 'var(--v3-border)' }}
    >
      {/* Unread marker — a dot in the gutter, aligned with the title. */}
      <span
        aria-hidden="true"
        className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: g.unread ? 'var(--v3-accent)' : 'transparent' }}
      />

      {social ? (
        <span className="relative mt-0.5 flex-shrink-0" style={{ width: actors.length > 1 ? 44 : 36, height: 36 }}>
          {actors.map((a, i) => {
            const initial = (a.name.split(' ').pop() || '?')[0]?.toUpperCase() ?? '?'
            return (
              <span
                key={a.id || i}
                className="absolute overflow-hidden rounded-full"
                style={{ left: i * 8, zIndex: 3 - i, width: 36, height: 36, boxShadow: '0 0 0 2px var(--v3-panel)' }}
              >
                {a.avatar
                  ? <Image src={a.avatar} alt="" width={36} height={36} className="h-full w-full object-cover" />
                  : <span
                      className="flex h-full w-full items-center justify-center text-[12px] font-bold text-white"
                      style={{ background: NOTIF_COLOR[g.type] ?? 'var(--v3-accent-fill)' }}
                    >
                      {initial}
                    </span>}
              </span>
            )
          })}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ background: `${cat.color}22` }}
        >
          {brandMark
            // eslint-disable-next-line @next/next/no-img-element -- fixed-size static mark from /public
            ? <img src={brandMark} alt="" aria-hidden="true" width={28} height={28} className="h-7 w-7 object-contain" />
            : <span className="text-[17px]">{cat.icon}</span>}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className="block text-[13.5px] leading-snug"
          style={{
            color: g.unread ? 'var(--v3-fg)' : 'var(--v3-fg-secondary)',
            fontWeight: g.unread ? 600 : 500,
          }}
        >
          {g.title}
        </span>
        {g.text && (
          <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
            {g.text}
          </span>
        )}
      </span>

      <span className="flex flex-shrink-0 flex-col items-end gap-1.5 pl-1">
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--v3-fg-muted)' }}>
          {timeOf(g.created_at, locale)}
        </span>
        {/* 🚨 A REAL COUNT, AND IT IS NOT AN UNREAD COUNT. `count` is how many notifications
            collapsed into this row — twelve likes on one review is one row saying 12. The mockup
            put an unread badge here; per-row unread totals do not exist, and this number would be
            read as one if it were styled like one, so it stays a plain neutral chip. */}
        {g.count > 1 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
            style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-secondary)' }}
          >
            {t('v3.inbox.countMore', { n: String(g.count) })}
          </span>
        )}
      </span>
    </div>
  )
}
