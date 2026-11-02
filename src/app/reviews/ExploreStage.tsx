'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SHOW_MUSIC } from '@/lib/config/product'
import Link from 'next/link'
import Image from '@/components/media/SafeImage'
import {
  Search, Bell, ChevronLeft, ChevronRight, Heart, MessageCircle, Share2, Bookmark, Sparkles,
  Loader2, AlertCircle, PlayCircle, Play, Pause, MapPin, MoreHorizontal, Maximize2, Trash2, EyeOff,
  UserRound, Plus, SlidersHorizontal, Utensils, Flame, ArrowRight,
} from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/explore/VideoPlayer'
import LinkPoster from '@/components/LinkPoster'
import { createClient } from '@/lib/supabase/client'
import { useNotifications } from '@/components/NotificationProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { isShareOnlyName, type Review } from './feedShared'
import { ClipStage, useClipActions, Avatar, type Me } from './clipStage'

// Kept importable from here: the unit tests and other modules know these by this path.
export { shortCount, slotTransform, slotRole } from './clipStage'
import { track } from '@/lib/tracking/tracker'
import { askTappyPlaceEvent } from '@/lib/explore/clipVenueEvidence'

// ── V3 Web · EXPLORE — the approved three-column composition (≥ 768px) ─────
//
// Inside `V3Shell` — its sidebar, bottom bar and footer untouched — with the
// page's own top bar in the shell's header slot, MAIN is the cinematic stage and,
// from `xl`, a RIGHT COLUMN of real discovery data beside it (below it on
// narrower screens; never hidden). Five clips in one perspective space with the
// active clip largest and nearest, a lit floor beneath it, position + progress
// line bottom left, the "Post" CTA bottom centre (the shell's own Post / Upload
// destination, `/reviews/new` — it replaced the decorative scroll hint) and a
// thumbnail navigator bottom right. The active card carries
// the creator header (avatar · name · time · Follow · overflow), the compact
// icon+count action rail, and — in its bottom zone over a gradient — the caption,
// the location and the playback strip.
//
// 🚨 THE RIGHT COLUMN IS REAL DATA OR NOTHING: `/api/recommendations` (ranked
// places from real reviews), the last day's most-liked places (the phone feed's
// own query), the chat CTA, and creators from the loaded feed the viewer does not
// follow yet. The reference's ratings, photos and discussion counts have no
// source here and are not drawn.
//
// 🚨 ONE SOURCE OF TRUTH. `active` is the only index. The mounted player, the
// overlay, the Ask-Tappy link (and so the `ctx=<reviewId>` the chat keeps), the
// position readout, the progress line and the highlighted thumbnail all derive
// from it. Nothing else remembers "which clip".
//
// 🚨 WHAT IS REUSED, RATHER THAN REBUILT (there must not be a second video system):
//   · `VideoPlayer` — the existing player and its `active` flag; mounted on the
//     active card ONLY. Every other card renders `LinkPoster`, a picture. So
//     "several visible, one playing" is structural: one <video> exists on the page.
//     The playback strip READS that element (time / duration) and pauses through the
//     session's own `onUserPauseToggle`; it does not drive playback itself.
//   · `/api/reviews/feed` — the existing endpoint, its sorts and its search;
//   · `/api/reviews/[id]/like` and `/save`, `/api/users/[id]/follow`, the owner's
//     delete / hide — the existing interaction endpoints, with the feed's own rules
//     (Follow only on someone else's post you do not follow; the overflow menu only
//     on your own post);
//   · `/chat?q=` + `ctx=` — the existing Ask-Tappy handoff, measured by the existing
//     `ask_tappy_place` click event;
//   · `like_count` / `comment_count` — the feed's own columns, printed as they are.
//
// 🔑 NO NEW DEPENDENCY. The space is CSS 3D driven by pointer events; the
// repository has no motion library and this does not add one. Reduced motion
// turns the transitions off in `globals.css`.
//
// 🚨 NOTHING ON THE STAGE IS STATIC COPY. The reference's editorial line and a
// second "Tappy" wordmark used to sit top left of the main region; both were
// redundant beside the shell's own branding and were removed. Everything on
// screen is feed data, controls, or the shell.

/** Distances from the active clip that are drawn. Beyond ±2 a card exists only as
 *  the slot the next one animates in from. */
type FeedSort = 'for-you' | 'following' | 'latest'

/** The filter row is the REAL one: the three sorts the endpoint accepts. */
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

export default function ExploreStage() {
  const { t } = useTranslation()
  const { unreadCount } = useNotifications()

  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<FeedSort>('for-you')
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // 🚨 The one index. See the note at the top.
  const [active, setActive] = useState(0)

  // Who is looking — for Follow (not on your own post) and the overflow menu (only on
  // your own post). Read from the session the way the phone feed reads it.
  const [me, setMe] = useState<Me>(null)
  useEffect(() => {
    let alive = true
    createClient().auth.getUser().then(({ data }) => {
      if (!alive) return
      const u = data.user
      setMe(u ? { id: u.id, avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null } : null)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

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
        // Explore is a VIDEO surface: a row without a playable clip is left out.
        setRows(list.filter(r => r.content_type === 'video' && !!r.media_url))
        setActive(0)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (seq !== reqRef.current || (e instanceof Error && e.name === 'AbortError')) return
        setError(true)
        setLoading(false)
      })
    return () => ac.abort()
  }, [sort, submitted])

  // Escape closes the filter popover (the arrows belong to the shared stage).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltersOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The interactions every clip host shares live with the stage (clipStage.tsx).
  const { toggle, follow, remove, requireLogin } = useClipActions(setRows, setActive, me, '/reviews')
  void requireLogin

  const navLinks = [
    { href: '/reviews', key: 'v3.explore.navExplore', current: true },
    { href: '/chat', key: 'v3.explore.navAsk', current: false },
    { href: '/planner', key: 'v3.explore.navPlan', current: false },
    // Music hidden by default (owner decision 2026-09-24) — SHOW_MUSIC drops this link.
    ...(SHOW_MUSIC ? [{ href: '/music', key: 'v3.explore.navMusic', current: false }] : []),
  ]

  // ── The page's own top bar, rendered in the shell's header slot ──────────
  // Real navigation only: routes that exist, the unread count the provider already keeps,
  // the session's own avatar. The search field is the existing feed search; the glyph
  // beside it opens the real sort filters.
  const topBar = (
    <header className="v3-xp-bar" data-xp-bar>
      {/* The wordmark only where the shell's sidebar — which carries the brand — is
          hidden (below `lg`, the sidebar's own breakpoint). Beside the sidebar a second
          "Tappy" is redundant. */}
      <Link href="/" className="v3-xp-logo lg:hidden" aria-label="TappyAI">Tappy</Link>
      <nav className="v3-xp-nav" aria-label={t('v3.explore.title')}>
        {navLinks.map(l => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined}>{t(l.key)}</Link>
        ))}
      </nav>
      <div className="v3-xp-tools">
        <form className="v3-xp-field" onSubmit={e => { e.preventDefault(); setSubmitted(search) }} role="search" data-xp-search>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/55" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('v3.explore.searchField')}
            aria-label={t('v3.explore.searchField')}
          />
        </form>
        <button type="button" className="v3-xp-tool" onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} aria-label={t('v3.explore.filters')} data-xp-filter-toggle>
          <SlidersHorizontal size={20} aria-hidden="true" />
        </button>
        <Link href="/profile/notifications" className="v3-xp-tool" aria-label={t('v3.explore.navInbox')}>
          <Bell size={20} aria-hidden="true" />
          {unreadCount > 0 && <span className="v3-xp-badge" aria-hidden="true" data-xp-unread />}
        </Link>
        {me
          ? <Link href="/profile" aria-label={t('v3.explore.navProfile')} className="ml-1">
              {me.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element -- the session's own avatar URL, any host
                ? <img src={me.avatarUrl} alt="" className="v3-xp-avatar" />
                : <span className="v3-xp-avatar-empty"><UserRound size={18} aria-hidden="true" /></span>}
            </Link>
          : <Link href={`/login?returnTo=${encodeURIComponent('/reviews')}`} aria-label={t('v3.explore.signIn')} className="ml-1">
              <span className="v3-xp-avatar-empty"><UserRound size={18} aria-hidden="true" /></span>
            </Link>}
      </div>
      {filtersOpen && (
        <div className="v3-xp-filters" data-xp-filters>
          <span className="text-[12px] text-white/50">{t('v3.explore.filters')}</span>
          {SORTS.map(s => {
            const on = sort === s.id && !submitted
            return (
              <button key={s.id} type="button" className="v3-xp-chip" aria-pressed={on} onClick={() => { setSubmitted(''); setSearch(''); setSort(s.id); setFiltersOpen(false) }}>
                {t(s.labelKey)}
              </button>
            )
          })}
        </div>
      )}
    </header>
  )

  return (
    <V3Shell title={t('v3.explore.title')} subtitle={t('v3.explore.subtitle')} activeTab="/reviews" header={topBar} flush>
      {/* Always the dark media treatment — see the note at the top. */}
      <div className="v3-theme dark v3-xp" data-explore-stage-page>
        <div className="v3-xp-grid">
          {/* ── MAIN: the stage (shared with every other clip viewer: clipStage.tsx) ── */}
          <ClipStage
            rows={rows}
            active={active}
            setActive={setActive}
            loading={loading}
            error={error}
            me={me}
            onLike={r => void toggle(r, 'like')}
            onSave={r => void toggle(r, 'save')}
            onFollow={r => void follow(r)}
            onRemoved={remove}
          />

          {/* ── RIGHT COLUMN: real discovery data ───────────────────────── */}
          <RightColumn rows={rows} me={me} onFollow={r => void follow(r)} t={t} />
        </div>
      </div>
    </V3Shell>
  )
}

/* ── The right column ──────────────────────────────────────────────────────
 *
 * Four panels, each drawn only when its REAL source has something to show:
 *   · Suggested for you — `/api/recommendations` (ranked places from real reviews; the
 *     `/recommendations` page's own endpoint). Signed-out visitors get a 401 and no panel.
 *   · Trending today — the last day's most-liked places, the phone feed's own query
 *     (`review_likes` joined to `reviews.place_name`).
 *   · The chat CTA — the app's one entry into Tappy.
 *   · You may like — creators of the clips on stage the viewer does not follow yet, with the
 *     real follow endpoint. There is no "suggested users" API; the feed is the honest source.
 * Nothing here has a rating, a photo or a discussion count, so none is drawn.
 */
type Rec = { placeId: string; placeName: string }
type Hot = { place_name: string; count: number }

function RightColumn({ rows, me, onFollow, t }: {
  rows: Review[]
  me: Me
  onFollow: (r: Review) => void
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const [recs, setRecs] = useState<Rec[]>([])
  const [hot, setHot] = useState<Hot[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/recommendations', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && Array.isArray(d.recommendations)) setRecs(d.recommendations.filter((x: Rec) => x.placeName?.trim()).slice(0, 3)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // `hot_places_24h()` — the place-name + count aggregate over visible reviews. The like
        // rows are owner-read since 20260915b_review_likes_private.sql; this is the public view,
        // and it carries no user id.
        const { data } = await createClient().rpc('hot_places_24h', { p_limit: 10 })
        const hot: Hot[] = []
        for (const row of (data || []) as Array<{ place_name?: string | null; like_count?: number | string | null }>) {
          const name = row.place_name
          if (name && !isShareOnlyName(name)) hot.push({ place_name: name, count: Number(row.like_count) || 0 })
        }
        if (alive) setHot(hot.slice(0, 5))
      } catch {
        // Best-effort: the panel simply does not render.
      }
    })()
    return () => { alive = false }
  }, [])

  // Creators on stage the viewer could follow: unique, not me, not followed, with a real profile.
  const people = useMemo(() => {
    const seen = new Set<string>()
    const out: Review[] = []
    for (const r of rows) {
      if (!r.profiles?.full_name?.trim() || r.is_following || (me && me.id === r.user_id) || seen.has(r.user_id)) continue
      seen.add(r.user_id)
      out.push(r)
      if (out.length === 3) break
    }
    return out
  }, [rows, me])

  return (
    <aside className="v3-xp-right" aria-label={t('v3.explore.recTitle')} data-xp-right>
      {recs.length > 0 && (
        <section className="v3-xp-panel" data-xp-recs>
          <div className="flex items-center justify-between">
            <h2 className="v3-xp-panel-title">{t('v3.explore.recTitle')}</h2>
            <Link href="/recommendations" className="v3-xp-panel-link">{t('v3.explore.seeAll')}</Link>
          </div>
          <div className="mt-1">
            {recs.map(r => (
              <div key={r.placeId} className="v3-xp-rec">
                <span className="v3-xp-rec-glyph" aria-hidden="true"><Utensils size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="v3-xp-rec-name truncate">{r.placeName}</p>
                  <Link href={`/chat?q=${encodeURIComponent(t('recommendations.askPrompt', { place: r.placeName }))}`} className="v3-xp-rec-sub inline-flex items-center gap-1 hover:underline">
                    {t('v3.explore.recAsk')} <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {hot.length > 0 && (
        <section className="v3-xp-panel" data-xp-trends>
          <h2 className="v3-xp-panel-title flex items-center gap-2"><Flame size={16} className="text-orange-400" aria-hidden="true" />{t('v3.explore.trendTitle')}</h2>
          <ol className="mt-1">
            {hot.map((h, i) => (
              <li key={h.place_name} className="v3-xp-trend">
                <span className="v3-xp-trend-n" aria-hidden="true">{i + 1}</span>
                <span className="min-w-0">
                  <span className="v3-xp-rec-name block truncate">{h.place_name}</span>
                  <span className="v3-xp-rec-sub block">{t('reviews.hotCount', { n: String(h.count) })}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="v3-xp-cta" data-xp-cta>
        <p className="text-[15px] font-bold leading-snug">{t('v3.explore.ctaTitle')}</p>
        <Link href="/chat" className="v3-xp-cta-btn mt-4">
          {t('v3.explore.ctaButton')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </section>

      {people.length > 0 && (
        <section className="v3-xp-panel" data-xp-people>
          <div className="flex items-center justify-between">
            <h2 className="v3-xp-panel-title">{t('v3.explore.peopleTitle')}</h2>
            <Link href="/social" className="v3-xp-panel-link">{t('v3.explore.seeAll')}</Link>
          </div>
          <div className="mt-1">
            {people.map(r => (
              <div key={r.user_id} className="v3-xp-person">
                <Link href={`/users/${r.user_id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar src={r.profiles?.avatar_url ?? null} broken={false} onBroken={() => {}} name={r.profiles!.full_name!} size={36} />
                  <span className="v3-xp-person-name truncate">{r.profiles!.full_name}</span>
                </Link>
                <button type="button" className="v3-xp-person-follow" onClick={() => onFollow(r)} data-xp-person-follow>
                  {t('reviews.follow')}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}

