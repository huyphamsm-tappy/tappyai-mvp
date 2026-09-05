'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Search, ChevronLeft, ChevronRight, Heart, MessageCircle, Share2, Bookmark,
  Sparkles, Loader2, AlertCircle, PlayCircle, Music2, Play,
} from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/explore/VideoPlayer'
import LinkPoster from '@/components/LinkPoster'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { isShareOnlyName, type Review } from './feedShared'
import { cn } from '@/lib/utils'

// ── V3 Web · Page 3 — EXPLORE (desktop) ─────────────────────────────────────
//
// Explore opens INTO VIDEO. Title, search, filters, then the feed — no hero, no
// catalogue grid, no "watch" button between the user and the content.
//
// 🚨 THIS IS THE DESKTOP SURFACE ONLY, AND IT IS MOUNTED EXCLUSIVELY.
// `page.tsx` chooses between this and the existing mobile feed by media query and
// renders exactly one of them. It deliberately does NOT hide the other with CSS:
// a `display:none` feed still mounts its <video> elements, and this page's whole
// playback contract is about which video elements exist.
//
// 🚨 WHAT IS REUSED, RATHER THAN REBUILT (there must not be a second video system):
//   · `VideoPlayer` — the existing player, including its `active` playback flag;
//   · `LinkPoster`  — the existing off-screen poster, no <video> element;
//   · `/api/reviews/feed` — the existing feed endpoint, its sorts and its search;
//   · `Review` and `isShareOnlyName` from `feedShared`;
//   · `/chat?q=` with `bridge.promptEntity` — the existing Ask-Tappy handoff;
//   · `/api/reviews/[id]/like` and `/save` — the existing interaction endpoints;
//   · `V3Shell` — the approved global shell, unchanged.
//
// Nothing here fetches from a new place, defines a new player, or invents a datum.

/** How many cards the desktop composition shows at once — the mature state. */
const WINDOW = 5

/** The row's height, and therefore the scale of everything in it. Taken from the
 *  viewport rather than from a ratio: a strict 9:16 card inside the shell's 1240px
 *  container is only ~418px tall, which left the clips stranded mid-page and read as
 *  a dashboard. Clamped at both ends so a short window cannot crush the cards and a
 *  tall one cannot stretch them past the fold. */
const TRACK_H = 'clamp(360px, calc(100dvh - 300px), 680px)'

type FeedSort = 'for-you' | 'following' | 'latest'

/** 🚨 THE FILTER ROW IS THE REAL ONE, AND IT IS SHORTER THAN THE MOCKUP'S.
 *
 *  🪤 The topic names are written in English below ON PURPOSE. `webHardcodedUiStrings`
 *  detects Vietnamese by CHARACTER RANGE and reads comments as well as code, so naming
 *  the ten chips in Vietnamese here pushed the ratchet over its baseline — a lint
 *  failure caused entirely by an explanation. Same trap as the multiplication sign.
 *
 *  The design reference shows ten topic chips — food, travel, cafe, entertainment,
 *  beauty, health, family, lifestyle, technology. THE DATA FOR THOSE DOES NOT
 *  EXIST. `reviews` has no `category` column: `EXPLORE_SELECT` in
 *  `src/app/api/reviews/feed/route.ts` is the definitive list of what the feed
 *  returns and there is no category in it, and a live response confirms no such
 *  field arrives. (`lib/explore/contentProcessor.ts` does ask the model for a
 *  category at UPLOAD time, but that value is returned to the uploader and never
 *  persisted to a column the feed can filter on.)
 *
 *  Rendering those chips would mean either a row of controls that filter nothing
 *  or a taxonomy invented at the call site. Both are fabrication. So the row shows
 *  what the endpoint really supports — the three feed sorts it already accepts —
 *  and the capability gap is reported rather than painted over. When a category
 *  column exists, this array is where it goes. */
const SORTS: { id: FeedSort; labelKey: string }[] = [
  { id: 'for-you', labelKey: 'v3.explore.forYou' },
  { id: 'following', labelKey: 'v3.explore.following' },
  { id: 'latest', labelKey: 'v3.explore.latest' },
]

function feedUrl(sort: FeedSort, search: string): string {
  const q = search.trim()
  if (q) return `/api/reviews/feed?search=${encodeURIComponent(q)}&limit=20`
  let url = '/api/reviews/feed?page=0&limit=20'
  if (sort === 'latest') url += '&sort=latest'
  else if (sort === 'following') url += '&following=true'
  return url
}

/** What a card can ask Tappy about: the place when there is one, else the caption.
 *
 *  🚨 IT NEVER INVENTS A SUBJECT. `isShareOnlyName` is the feed's own guard for a
 *  clip posted without a place — those carry a sentinel name, and a bridge built
 *  from it would open a thread about nothing. The caption is the honest fallback
 *  because it is the item's own words; when there is neither, there is no bridge. */
function askSubject(r: Review): string | null {
  if (!isShareOnlyName(r.place_name)) return r.place_name
  const caption = (r.body ?? '').trim()
  return caption.length > 0 ? caption : null
}

export default function ExploreV3Desktop() {
  const { t } = useTranslation()

  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<FeedSort>('for-you')
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState('')

  // The card the user is watching. Exactly one, always.
  const [active, setActive] = useState(0)
  // Left-most card of the visible window; the arrows move this, not `active`.
  const [start, setStart] = useState(0)

  const reqRef = useRef(0)

  useEffect(() => {
    const seq = ++reqRef.current
    const ac = new AbortController()
    setLoading(true)
    setError(false)
    fetch(feedUrl(sort, submitted), { signal: ac.signal, credentials: 'include' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(json => {
        if (seq !== reqRef.current) return
        const list: Review[] = Array.isArray(json) ? json : (json?.reviews ?? [])
        // Explore is a VIDEO surface. A row without a playable clip has nothing to
        // show in a 9:16 frame, so it is not padding for the row — it is left out.
        const videos = list.filter(r => r.content_type === 'video' && !!r.media_url)
        setRows(videos)
        // The reference puts the focus on the CENTRE of the row, not its left edge —
        // the eye lands in the middle of a five-card composition. Clamped, so a short
        // feed focuses the last card it actually has rather than an empty slot.
        setActive(Math.min(Math.floor(WINDOW / 2), Math.max(0, videos.length - 1)))
        setStart(0)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (seq !== reqRef.current || (e instanceof Error && e.name === 'AbortError')) return
        setError(true)
        setLoading(false)
      })
    return () => ac.abort()
  }, [sort, submitted])

  const maxStart = Math.max(0, rows.length - WINDOW)
  const canPrev = start > 0
  const canNext = start < maxStart

  /** Moving the window carries the active card with it, so "playing" never scrolls
   *  out of sight — the user pressed next to watch the next thing, not to lose it. */
  const move = useCallback((delta: number) => {
    setStart(s => {
      const next = Math.min(maxStart, Math.max(0, s + delta))
      setActive(a => Math.min(rows.length - 1, Math.max(0, a + (next - s))))
      return next
    })
  }, [maxStart, rows.length])

  // Keyboard: the arrows are the desktop feed's primary transport.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    }
    const step = (d: number) => {
      setActive(a => {
        const next = Math.min(rows.length - 1, Math.max(0, a + d))
        // Keep the active card inside the visible window.
        setStart(s => Math.min(Math.max(s, next - WINDOW + 1), next))
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows.length])

  // Horizontal trackpad / shift-wheel moves the feed, matching the drag affordance.
  const wheelRef = useRef(0)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
    if (!dx) return
    const now = Date.now()
    if (now - wheelRef.current < 320) return
    wheelRef.current = now
    move(dx > 0 ? 1 : -1)
  }, [move])

  const visible = useMemo(() => rows.slice(start, start + WINDOW), [rows, start])
  const pages = Math.max(1, maxStart + 1)

  return (
    /* 🚨 ONE PAGE IDENTITY, CARRIED BY THE SHELL'S OWN PROPS.
     *
     *  🪤 Written without Vietnamese diacritics on purpose: `webHardcodedUiStrings` detects
     *  Vietnamese by character range and reads COMMENTS as well as code, so quoting the page
     *  title here twice pushed the ratchet from 497 to 499. An explanation must not fail a lint.
     *
     *  This used to pass `v3.nav.explore` ("Explore (Video)") to the shell and then print a
     *  second, larger copy of the page title in the content — so the header and the page named
     *  the same destination with two different strings and read as two pages on one screen.
     *
     *  The fix needed no shell architecture: `V3Shell` already takes `title` and `subtitle` and
     *  renders them as the page header, which is exactly this. So the page title lives THERE, in
     *  the mechanism that already existed, and the content no longer repeats it. "Explore
     *  (Video)" stays what it should be — the SIDEBAR NAV LABEL, naming the destination in a
     *  list of destinations — while the page itself carries `v3.explore.title` once. */
    <V3Shell title={t('v3.explore.title')} subtitle={t('v3.explore.subtitle')} activeTab="/reviews">
      <div className="pb-10 pt-1" onWheel={onWheel}>
        {/* ── Filters + search on one row ──────────────────────────────────
            Compact by intent: this is a video surface, and the controls sit on a
            single line so the clips start as high on the page as possible. */}
        {/* Aligned to the row for the same reason the footer is: the page's content column
            IS the video row, so the controls sit over the clips they filter rather than
            spanning a width the content does not occupy. At five clips the row is already
            the full container and this cap does nothing — it only tidies the sparse states. */}
        <div
          className="flex flex-wrap items-center justify-between gap-4"
          style={{
            maxWidth: 'calc(var(--v3-explore-slots) * var(--v3-explore-card-h) * 9 / 16'
              + ' + (var(--v3-explore-slots) - 1) * 16px)',
            marginInline: 'auto',
            ['--v3-explore-card-h' as string]: TRACK_H,
            ['--v3-explore-slots' as string]: String(Math.max(1, Math.min(rows.length, WINDOW))),
          }}
        >
          {/* Filters. Real sorts, not invented topics — see SORTS. */}
          <div className="flex flex-wrap gap-2.5">
            {SORTS.map(s => {
              const on = sort === s.id && !submitted
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSubmitted(''); setSearch(''); setSort(s.id) }}
                  aria-pressed={on}
                  className={cn(
                    'h-9 rounded-full border px-4 text-[12.5px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2',
                  )}
                  style={on
                    ? { background: 'var(--v3-accent-fill)', borderColor: 'transparent', color: 'var(--v3-on-accent)' }
                    : { background: 'var(--v3-panel)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg-secondary)' }}
                >
                  {t(s.labelKey)}
                </button>
              )
            })}
          </div>

          {/* The EXISTING search: `/api/reviews/feed?search=` — the same endpoint the
              mobile feed's search calls. No new index, no new route. */}
          {/* 🪤 300px, not 360. At 1440 the content column narrows to ~690px, and a 360px
              field plus the three filter chips overflowed it — the controls wrapped onto two
              lines and the row stopped reading as one bar. Compact is also the brief for this
              control: search supports the video experience, it does not compete with it. */}
          <form
            className="relative w-full max-w-[300px]"
            onSubmit={e => { e.preventDefault(); setSubmitted(search) }}
            role="search"
          >
            <Search
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--v3-fg-muted)' }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('v3.explore.searchPlaceholder')}
              aria-label={t('v3.explore.searchPlaceholder')}
              className="h-11 w-full rounded-full border pl-11 pr-4 text-[13px] outline-none transition-colors focus-visible:border-transparent focus-visible:ring-2"
              style={{
                background: 'var(--v3-panel)',
                borderColor: 'var(--v3-border)',
                color: 'var(--v3-fg)',
              }}
            />
          </form>
        </div>

        {/* ── The feed ────────────────────────────────────────────────────── */}
        <div className="relative mt-6">
          {loading && (
            <div className="flex h-[420px] items-center justify-center">
              <Loader2 size={26} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
            </div>
          )}

          {!loading && error && (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2" style={{ color: 'var(--v3-fg-muted)' }}>
              <AlertCircle size={34} className="opacity-50" aria-hidden="true" />
              <p className="text-[13px]">{t('reviews.feedLoadError')}</p>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2" style={{ color: 'var(--v3-fg-muted)' }}>
              <PlayCircle size={34} className="opacity-40" aria-hidden="true" />
              <p className="text-[13px]">{t('v3.explore.empty')}</p>
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              {/* 🚨 THE TRACK OWNS THE HEIGHT, AND THAT IS WHAT MAKES THIS FEEL LIKE VIDEO.
                  A strict 9:16 card inside a 1240px container is only ~418px tall, which
                  left the clips stranded in the middle of a 1000px page — the first build
                  read as a sparse dashboard rather than a cinematic feed. The reference's
                  cards are nearer 9:20 and fill the column, so the height is taken from the
                  VIEWPORT and the width still comes from the five-across composition.
                  Clamped at both ends so a short window cannot crush the cards and a tall
                  one cannot stretch them past the fold. */}
              <div
                className="flex gap-4"
                style={{
                  height: 'var(--v3-explore-card-h)',
                  ['--v3-explore-card-h' as string]: TRACK_H,
                  // The number of slots the row divides itself into: what is really there,
                  // never more than the composition shows.
                  ['--v3-explore-slots' as string]: String(Math.max(1, Math.min(rows.length, WINDOW))),
                  /* 🚨 THE CAP LIVES ON THE ROW, NOT ON THE CARD — and that is a bug fix, not a
                     preference. The first version put `min(even share, height x 9/16)` on the
                     card's own width. Measured in the browser, the even-share half NEVER won:
                     a percentage inside `min()` on a flex item did not resolve against the
                     track, so every slot count produced the same 348.75px and the row never
                     got denser. Capping the ROW's width instead uses no percentages at all —
                     the cards simply share whatever width the row ends up with. */
                  maxWidth: 'calc(var(--v3-explore-slots) * var(--v3-explore-card-h) * 9 / 16'
                    + ' + (var(--v3-explore-slots) - 1) * 16px)',
                  marginInline: 'auto',
                }}
                data-explore-track
                data-slots={Math.max(1, Math.min(rows.length, WINDOW))}
              >
                {visible.map((r, i) => {
                  const index = start + i
                  return (
                    <ExploreCard
                      key={r.id}
                      review={r}
                      active={index === active}
                      onSelect={() => setActive(index)}
                      subject={askSubject(r)}
                      t={t}
                    />
                  )
                })}
                {/* 🚨 NO FILLER. When the feed holds fewer than five clips the row is
                    short, and that is the correct rendering: the composition targets
                    five cards, but repeating or inventing a clip to reach five would
                    put content on screen that does not exist. */}
              </div>

              {canPrev && (
                <CarouselArrow side="left" onClick={() => move(-1)} label={t('v3.explore.prev')} />
              )}
              {canNext && (
                <CarouselArrow side="right" onClick={() => move(1)} label={t('v3.explore.next')} />
              )}

              {/* 🚨 THE FOOTER BELONGS TO THE ROW, NOT TO THE PAGE.
                  It used to span the full 1160px container while the cards sat in a
                  centred 714px island, so the pagination and the note floated far wider
                  than the thing they describe — the chrome promised a wide carousel and
                  the content did not fill it, which is most of what made two clips read
                  as "three are missing". Same cap and centring as the track, so the block
                  reads as one deliberate composition at every count. */}
              <div
                className="mt-6 flex items-center justify-between gap-6"
                style={{
                  maxWidth: 'calc(var(--v3-explore-slots) * var(--v3-explore-card-h) * 9 / 16'
                    + ' + (var(--v3-explore-slots) - 1) * 16px)',
                  marginInline: 'auto',
                  ['--v3-explore-card-h' as string]: TRACK_H,
                  ['--v3-explore-slots' as string]: String(Math.max(1, Math.min(rows.length, WINDOW))),
                }}
              >
                {/* Pagination belongs to a feed that HAS more than one window. With
                    everything already on screen, dots would imply pages that do not
                    exist — the same fabrication as a filler card, in miniature. */}
                {pages > 1 ? (
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    {Array.from({ length: pages }, (_, i) => (
                      <span
                        key={i}
                        className="h-1 rounded-full transition-all"
                        style={{
                          width: i === start ? 26 : 14,
                          background: i === start ? 'var(--v3-accent)' : 'var(--v3-border)',
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  /* 🚨 THE LOW-CONTENT STATE SAYS WHAT IS TRUE, IN WORDS.
                     The brief asks for "a clear visual indication that more content can
                     appear as the feed grows". The tempting way to show that is ghost
                     slots where the missing clips would go — and that draws attention to
                     an absence, which is precisely the "layout is broken because three
                     cards are missing" reading. A sentence states the real condition
                     instead: Explore has few clips today, and it fills as people post. */
                  <p className="text-[11.5px] font-light" style={{ color: 'var(--v3-fg-muted)' }}>
                    {t('v3.explore.growing')}
                  </p>
                )}
                {rows.length > 1 && (
                  <p className="text-[11.5px] font-light" style={{ color: 'var(--v3-fg-muted)' }}>
                    {t('v3.explore.navHint')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </V3Shell>
  )
}

function CarouselArrow({ side, onClick, label }: { side: 'left' | 'right'; onClick: () => void; label: string }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-[40%] z-20 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur',
        'transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2',
        side === 'left' ? '-left-5' : '-right-5',
      )}
      style={{
        background: 'color-mix(in srgb, var(--v3-panel-elevated) 88%, transparent)',
        borderColor: 'var(--v3-border)',
        color: 'var(--v3-fg)',
      }}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}

/* ── One clip ──────────────────────────────────────────────────────────────
 *
 * 🚨🚨 THE PLAYBACK CONTRACT LIVES HERE, AND IT IS STRUCTURAL RATHER THAN POLITE.
 *
 * The inactive cards do not render a paused player. They do not render a player
 * at all — `VideoPlayer` is mounted ONLY when `active` is true, and every other
 * card renders `LinkPoster`, which is a poster image. So "five visible, one
 * playing" is not a rule the component remembers to follow; there is exactly one
 * <video> element on the page and four pictures.
 *
 * That is the existing feed's own off-screen policy (`renderVideo` in
 * `feedShared.tsx`), reused rather than reinvented. Switching cards unmounts the
 * old player, which is a stronger guarantee than pausing it: a paused player can
 * be resumed by a stray event, and a player that does not exist cannot.
 */
function ExploreCard({
  review: r, active, onSelect, subject, t,
}: {
  review: Review
  active: boolean
  onSelect: () => void
  subject: string | null
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const [liked, setLiked] = useState(!!r.liked_by_me)
  const [saved, setSaved] = useState(!!r.saved_by_me)
  const [busy, setBusy] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)

  /**
   * 🚨 THE CLIP COULD NOT BE PAUSED ON DESKTOP, AND THIS IS THE WHOLE OF THE FIX.
   *
   * The frame-sized button below sits at `z-[5]`, above the player, and its only
   * job was `onSelect()`. On the card that was ALREADY active that call is a
   * no-op, so every click on a playing clip did nothing — the click never
   * reached the <video>, and nothing else was listening.
   *
   * The player has expressed pause through `PlaybackSession.onUserPauseToggle()`
   * all along, and the mobile feed has called it since WEB-EXPLORE-YOUTUBE-001.
   * Desktop simply never took the handle. It does now.
   *
   * 🔑 STICKY BY CONSTRUCTION, so autoplay cannot undo a deliberate pause: the
   * session owns that intent (`isUserPaused`), not this component. Autoplay on
   * becoming active is untouched — `active` still starts playback, and a clip
   * the user paused stays paused while it remains on screen.
   */
  const playerRef = useRef<VideoPlayerHandle>(null)
  const [userPaused, setUserPaused] = useState(false)

  // Selecting a different clip unmounts this player; the next one starts fresh
  // rather than inheriting a pause the user asked for on another card.
  useEffect(() => { if (!active) setUserPaused(false) }, [active])

  /** Optimistic, and it ROLLS BACK. The endpoint's own `{ liked }` is the truth;
   *  a failure puts the heart back rather than leaving a like that never landed. */
  const toggle = async (kind: 'like' | 'save') => {
    if (busy) return
    setBusy(true)
    const was = kind === 'like' ? liked : saved
    const set = kind === 'like' ? setLiked : setSaved
    set(!was)
    try {
      const res = await fetch(`/api/reviews/${r.id}/${kind}`, { method: 'POST', credentials: 'include' })
      if (res.status === 401) { window.location.href = `/login?returnTo=${encodeURIComponent('/reviews')}`; return }
      if (!res.ok) { set(was); return }
      const data = await res.json().catch(() => null)
      const confirmed = kind === 'like' ? data?.liked : data?.saved
      if (typeof confirmed === 'boolean') set(confirmed)
    } catch {
      set(was)
    } finally {
      setBusy(false)
    }
  }

  const author = r.profiles?.full_name?.trim()
  const avatar = r.profiles?.avatar_url ?? null
  const caption = (r.body ?? '').trim()
  const tags = (r.hashtags ?? []).filter(Boolean).slice(0, 3)
  const hasOriginalSound = r.music?.origin !== 'attached'

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[18px] border transition-all duration-300',
        // The inactive clip stays fully legible — it is a preview, not a disabled control —
        // but it sits back far enough that the eye lands on the active one first. Hover
        // brings it forward, which is the invitation to switch.
        active ? 'z-10' : 'opacity-[0.72] saturate-[0.85] hover:opacity-100 hover:saturate-100',
      )}
      style={{
        /* 🚨🚨 THE DENSITY RULE — ONE FORMULA, NO LOW-CONTENT BRANCH.
         *
         *  Two earlier versions were both wrong, in opposite directions. `flex-1` let two
         *  clips take half the row each and grow past the fold. Hard-coding the five-up
         *  width left two small cards adrift in an empty canvas — the layout read as
         *  broken rather than as sparse.
         *
         *  What is actually true is that a vertical video has a MAXIMUM SENSIBLE WIDTH:
         *  past about 9:16 of its own height it stops being a vertical video. So:
         *
         *      width = min( an even share of the row , the card's own height x 9/16 )
         *
         *  and both states fall out of it without a branch:
         *
         *    2 clips → the even share (612px) loses to the cap (~349px) → two large,
         *              centred cards that own the row without dominating it;
         *    3 clips → cap again (~349px) → the row is comfortably filled;
         *    4 clips → the even share (298px) wins → four cards fill the row exactly;
         *    5+      → the even share (235px) wins → THE REFERENCE COMPOSITION, unchanged.
         *
         *  The transition 2 → 3 → 4 → 5 is therefore continuous, and nothing about the
         *  mature five-card design was compromised to accommodate a small database.
         *
         *  The cap is applied to the TRACK's max-width (see its note); the card just takes an
         *  even share of whatever the row ends up being. `flex: 1 1 0`, not `flex: 1` — a
         *  `0` basis makes the share independent of the card's content, so a long caption
         *  cannot make one card wider than its neighbours. */
        flex: '1 1 0',
        // Height comes from the track (see its note); the card fills it. A hard
        // `aspectRatio` here fought that and won, which is what kept the cards short.
        height: '100%',
        background: '#07080B',
        borderColor: active ? 'var(--v3-accent)' : 'var(--v3-border)',
        /* Focus is carried by THREE quiet signals rather than one loud one: the accent
           edge, a bloom that reads as elevation, and a drop shadow that lifts the card off
           the page. Each is small; together they are unmistakable. Deliberately not a size
           jump — the reference keeps all five cards the same size, and scaling the active
           one would break the row the moment the feed reaches five. */
        boxShadow: active
          ? '0 0 0 1px var(--v3-accent),'
            + ' 0 0 46px -4px color-mix(in srgb, var(--v3-accent) 48%, transparent),'
            + ' 0 18px 42px -12px rgba(0,0,0,0.75)'
          : '0 8px 24px -16px rgba(0,0,0,0.6)',
        transform: active ? 'scale(1.02)' : 'none',
      }}
      data-explore-card
      data-active={active ? 'true' : 'false'}
    >
      {/* ── Media ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0">
        {active ? (
          <VideoPlayer
            ref={playerRef}
            url={r.media_url as string}
            thumbnail={r.thumbnail ?? undefined}
            sourceType={r.source_type ?? 'upload'}
            sourceUrl={r.source_url ?? undefined}
            active
          />
        ) : (
          <LinkPoster review={r} />
        )}
        {/* Legibility scrim. Bottom-weighted, because that is where the words are. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/88 via-black/10 to-black/45" />
      </div>

      {/* The frame does two things, depending on which card it is. On an inactive
          card it selects the clip; on the playing one it toggles pause. A button
          rather than a div: it is the primary control on the card and must be
          reachable by keyboard, which also gives Space/Enter pause for free.

          🔑 It stays ABOVE the player and keeps swallowing the click, which is
          what protects the rail (like / save / share) and the author link from
          being triggered by a stray tap — those sit at a higher z-index and stop
          propagation themselves. Nothing about scrolling or the carousel arrows
          changes. */}
      <button
        type="button"
        onClick={() => {
          if (!active) { onSelect(); return }
          playerRef.current?.onUserPauseToggle()
          setUserPaused(v => !v)
        }}
        aria-label={active ? t('v3.explore.togglePlay') : t('v3.explore.playThis')}
        aria-pressed={active}
        className="absolute inset-0 z-[5] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ background: 'transparent' }}
      />

      {/* Paused affordance. Only while the USER paused — an autoplay that has not
          started yet is not a paused clip and must not claim to be one. */}
      {active && userPaused && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-[6] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur"
          style={{ background: 'rgba(8,9,13,0.55)' }}
        >
          <Play size={26} className="translate-x-[1px] fill-white text-white" />
        </span>
      )}

      {/* ── Top: the clip's own first hashtag. Real metadata, not a taxonomy. ── */}
      {tags.length > 0 && (
        <span
          className="absolute left-3 top-3 z-10 max-w-[78%] truncate rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur"
          style={{ background: 'rgba(8,9,13,0.62)', color: '#FFFFFF' }}
        >
          {tags[0].startsWith('#') ? tags[0] : `#${tags[0]}`}
        </span>
      )}

      {/* ── Action rail ─────────────────────────────────────────────────
          🚨 ICONS, NO NUMBERS. `like_count`/`comment_count` are real columns, but
          the reference's engagement figures are illustrative and this feed's real
          numbers are mostly zero; printing "0" under every clip states something
          about the creator that helps no one. The ACTIONS are real — these call the
          endpoints the mobile feed calls. */}
      <div className="absolute bottom-[112px] right-2.5 z-10 flex flex-col items-center gap-2.5">
        <RailButton onClick={() => toggle('like')} label={t('v3.explore.like')} on={liked}>
          <Heart size={19} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
        </RailButton>
        {/* Comments live on the existing detail route — no second comment system. */}
        <RailLink href={`/reviews/${r.id}`} label={t('v3.explore.comment')}>
          <MessageCircle size={19} aria-hidden="true" />
        </RailLink>
        <RailLink href={`/reviews/${r.id}`} label={t('v3.explore.share')}>
          <Share2 size={19} aria-hidden="true" />
        </RailLink>
        <RailButton onClick={() => toggle('save')} label={t('v3.explore.save')} on={saved}>
          <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
        </RailButton>
      </div>

      {/* ── Creator + caption ───────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
        {/* 🚨 The creator block renders only when a real profile came back. No
            placeholder avatar, no "@unknown", no follower count — the feed sends
            none of those and this page does not manufacture them. */}
        {author && (
          /* 🚨 THE AUTHOR PROFILE EXISTED AND THIS SURFACE HAD NO WAY IN.
             `/users/[id]` ships (`UserProfileView`), and the MOBILE feed has
             linked to it from the avatar for as long as it has existed
             (`feedShared.tsx`). The desktop card rendered the same name and
             picture as plain spans, so the profile was simply unreachable from
             Explore on a wide screen — unreachable, not missing.

             `stopPropagation` is what keeps this from also selecting the card:
             the frame button underneath owns every other click on the tile. */
          <Link
            href={`/users/${r.user_id}`}
            onClick={e => e.stopPropagation()}
            aria-label={t('v3.explore.viewAuthor', { name: author })}
            className="mb-2 flex w-fit items-center gap-2 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ position: 'relative', zIndex: 10 }}
          >
            {/* The initial-letter disc is the feed's own fallback for a profile with no
                picture, reused. It also catches a picture that FAILS to load — a real
                avatar_url whose host is slow or unreachable otherwise leaves a broken
                image icon over the clip, which looks like a bug rather than a missing
                photo. Either way the letter comes from the real name; nothing invented. */}
            {avatar && !avatarBroken
              ? <Image
                  src={avatar} alt="" width={24} height={24}
                  onError={() => setAvatarBroken(true)}
                  className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                />
              : <span
                  aria-hidden="true"
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: 'var(--v3-accent-fill)' }}
                >
                  {author.slice(0, 1).toUpperCase()}
                </span>}
            <span className="truncate text-[12px] font-medium text-white">{author}</span>
          </Link>
        )}

        {caption && (
          <p className="text-[12.5px] font-normal leading-snug text-white" style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {caption}
          </p>
        )}

        {tags.length > 1 && (
          <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--v3-accent)' }}>
            {tags.slice(1).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </p>
        )}

        {hasOriginalSound && (
          <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-white/70">
            <Music2 size={11} aria-hidden="true" />
            {t('v3.explore.originalSound')}
          </p>
        )}

        {/* ── The differentiator: video → ask Tappy. ──────────────────────
            Existing mechanism only: the same `/chat?q=` handoff and the same
            `bridge.promptEntity` phrasing the mobile feed already uses. No new AI
            route, no new backend. It carries WHAT THE CLIP IS and never what the
            user supposedly wants; with no subject there is no button. */}
        {subject && (
          <Link
            href={`/chat?q=${encodeURIComponent(t('bridge.promptEntity', { subject }))}`}
            onClick={e => e.stopPropagation()}
            className="relative z-10 mt-2.5 inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-white transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2"
            style={{ background: 'var(--v3-accent-fill)' }}
          >
            <Sparkles size={13} aria-hidden="true" />
            {t('v3.explore.askAboutVideo')}
          </Link>
        )}
      </div>
    </article>
  )
}

function RailButton({ onClick, label, on, children }: {
  onClick: () => void; label: string; on?: boolean; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      aria-label={label}
      aria-pressed={on}
      className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2"
      style={{ background: 'rgba(8,9,13,0.55)', color: on ? 'var(--v3-accent)' : '#FFFFFF' }}
    >
      {children}
    </button>
  )
}

function RailLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={e => e.stopPropagation()}
      aria-label={label}
      className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2"
      style={{ background: 'rgba(8,9,13,0.55)', color: '#FFFFFF' }}
    >
      {children}
    </Link>
  )
}
