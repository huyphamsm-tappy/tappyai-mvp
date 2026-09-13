'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Search, Bell, ChevronLeft, ChevronRight, Heart, MessageCircle, Share2, Bookmark, Sparkles,
  Loader2, AlertCircle, PlayCircle, Play, Pause, MapPin, MoreHorizontal, Maximize2, Trash2, EyeOff,
  UserRound, Mouse, SlidersHorizontal, Utensils, Flame, ArrowRight,
} from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/explore/VideoPlayer'
import LinkPoster from '@/components/LinkPoster'
import { createClient } from '@/lib/supabase/client'
import { useNotifications } from '@/components/NotificationProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { isShareOnlyName, ago, type Review } from './feedShared'
import { track } from '@/lib/tracking/tracker'
import { askTappyPlaceEvent } from '@/lib/explore/clipVenueEvidence'

// ── V3 Web · EXPLORE — the approved three-column composition (≥ 768px) ─────
//
// Inside `V3Shell` — its sidebar, bottom bar and footer untouched — with the
// page's own top bar in the shell's header slot, MAIN is the cinematic stage and,
// from `xl`, a RIGHT COLUMN of real discovery data beside it (below it on
// narrower screens; never hidden). Five clips in one perspective space with the
// active clip largest and nearest, a lit floor beneath it, position + progress
// line bottom left, the SCROLL • SWIPE • EXPLORE hint bottom centre and a
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
const DRAWN = 3

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

/** What a card can ask Tappy about: the place when there is one, else the caption.
 *  It never invents a subject; with neither, there is no bridge. */
function askSubject(r: Review): string | null {
  if (!isShareOnlyName(r.place_name)) return r.place_name
  const caption = (r.body ?? '').trim()
  return caption.length > 0 ? caption : null
}

/** 1234 → "1.2k". The feed's own number, shortened the way the reference shows it. */
export function shortCount(n: number | null | undefined): string {
  const v = Math.max(0, Math.floor(n ?? 0))
  if (v < 1000) return String(v)
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (v < 1000000) return `${Math.round(v / 1000)}k`
  return `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}M`
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

// ── The spatial model ───────────────────────────────────────────────────────
//
// Measured off the approved reference (1536 × 1024): the active card is 1.555 times
// as tall as it is wide (see `widthShare` for its width); the neighbours' centres
// sit ±0.82 card-widths from the middle, the far pair ±1.3, and each step back is
// smaller and turned further away. Each row is indexed by |distance|: 0 = active,
// 1 = neighbour, 2 = far, 3 = the slot a card leaves from / arrives at. A drag
// interpolates between the rows, so the space turns with the finger.
interface Geometry { x: number[]; z: number[]; rot: number[]; sc: number[]; op: number[]; widthShare: number; heightShare: number }
const GEOMETRY: Record<'desktop' | 'tablet', Geometry> = {
  // Measured off the approved reference's MAIN region (the stage between the sidebar and the
  // right column, ~1040px wide at 1536): the active card is ~0.4 of it; the neighbours' centres
  // sit ±0.77 card-widths out, turned ~32°, the far pair ±1.14, turned ~45°.
  desktop: { x: [0, 0.77, 1.14, 1.45], z: [0, -120, -260, -420], rot: [0, 32, 45, 50], sc: [1, 0.76, 0.6, 0.5], op: [1, 0.96, 0.86, 0], widthShare: 0.4, heightShare: 0.78 },
  tablet: { x: [0, 0.7, 1.12, 1.4], z: [0, -180, -360, -500], rot: [0, 24, 36, 42], sc: [1, 0.8, 0.62, 0.5], op: [1, 0.9, 0.7, 0], widthShare: 0.5, heightShare: 0.7 },
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * The transform for a card at continuous offset `o` (integer distance minus the
 * live drag progress). Symmetric: the sign only flips x and the turn.
 */
export function slotTransform(o: number, g: Geometry, cardW: number): { transform: string; opacity: number } {
  const sign = o < 0 ? -1 : 1
  const a = Math.min(Math.abs(o), DRAWN)
  const i = Math.min(Math.floor(a), DRAWN - 1)
  const t = a - i
  const x = lerp(g.x[i], g.x[i + 1], t) * cardW * sign
  const z = lerp(g.z[i], g.z[i + 1], t)
  const rot = lerp(g.rot[i], g.rot[i + 1], t) * -sign
  const sc = lerp(g.sc[i], g.sc[i + 1], t)
  const op = a >= DRAWN ? 0 : lerp(g.op[i], g.op[i + 1], t)
  return {
    transform: `translate3d(calc(-50% + ${x.toFixed(1)}px), -50%, ${z.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`,
    opacity: op,
  }
}

/** Which role a card plays, from its INTEGER distance — the drag never changes roles. */
export function slotRole(d: number): 'active' | 'near' | 'far' | 'hidden' {
  const a = Math.abs(d)
  return a === 0 ? 'active' : a === 1 ? 'near' : a === 2 ? 'far' : 'hidden'
}

type Me = { id: string; avatarUrl: string | null } | null

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

  const count = rows.length
  const step = useCallback((delta: number) => {
    setActive(a => Math.min(Math.max(0, count - 1), Math.max(0, a + delta)))
  }, [count])

  // Keyboard: the arrows are the primary transport on a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
      if (e.key === 'Escape') setFiltersOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // Wheel: the reference says SCROLL — a vertical wheel turns the space one clip at a
  // time, and so does a horizontal trackpad gesture. Throttled to one clip per burst.
  const wheelRef = useRef(0)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(d) < 8) return
    const now = Date.now()
    if (now - wheelRef.current < 420) return
    wheelRef.current = now
    step(d > 0 ? 1 : -1)
  }, [step])

  // ── Geometry from the real stage size ───────────────────────────────────
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, error, count])
  // Before the first measurement (and in environments with no layout) a nominal stage
  // keeps the cards drawn; the observer corrects it on the next frame.
  const stageW = box.w || 1040
  const stageH = box.h || 900
  // The stage is the MAIN column (932px at 1440 beside the sidebar and the right column);
  // five drawn fits from ~700px up, below that three drawn with a deep cue.
  const mode: 'desktop' | 'tablet' = stageW >= 700 ? 'desktop' : 'tablet'
  const g = GEOMETRY[mode]
  // The reference's proportions: width share of the viewport, capped by the height
  // share so a short window cannot push the card past the fold.
  const cardW = Math.floor(Math.min(stageW * g.widthShare, (stageH * g.heightShare) / 1.555))
  const cardH = Math.floor(cardW * 1.555)
  // Cards are centred at 44% of the stage (the reference's 45% of the viewport once the
  // top bar is counted); the floor sits just under the active card's bottom edge.
  const floorTop = Math.round(stageH * 0.44 + cardH / 2 - 26)

  // ── Drag: the space turns with the pointer, then settles on the nearest clip ──
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const pointer = useRef<{ id: number; x: number; t: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || count < 2) return
    pointer.current = { id: e.pointerId, x: e.clientX, t: Date.now(), moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x
    if (!p.moved && Math.abs(dx) < 6) return
    if (!p.moved) {
      p.moved = true
      setDragging(true)
      // Capture keeps the gesture when the pointer leaves the stage; a synthetic event has
      // no pointer to capture and must not throw.
      try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) } catch { /* no active pointer */ }
    }
    let prog = Math.max(-1, Math.min(1, dx / Math.max(1, cardW)))
    if ((prog > 0 && active === 0) || (prog < 0 && active === count - 1)) prog *= 0.25
    setDrag(prog)
  }
  const endDrag = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p || p.id !== e.pointerId) return
    pointer.current = null
    if (!p.moved) return
    const dx = e.clientX - p.x
    const dt = Math.max(1, Date.now() - p.t)
    const fast = Math.abs(dx) / dt > 0.45
    const far = Math.abs(dx) > cardW * 0.22
    setDragging(false)
    setDrag(0)
    if (far || fast) step(dx < 0 ? 1 : -1)
    // The click that ends a drag must not select or pause a card.
    suppressClick.current = true
    setTimeout(() => { suppressClick.current = false }, 0)
  }
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) { e.stopPropagation(); e.preventDefault() }
  }

  // ── Interactions the feed already has, applied to `rows` so every card agrees ──
  const patch = (id: string, fn: (r: Review) => Review) => setRows(prev => prev.map(r => (r.id === id ? fn(r) : r)))
  const requireLogin = () => {
    if (me) return false
    window.location.href = `/login?returnTo=${encodeURIComponent('/reviews')}`
    return true
  }
  /** Optimistic, and it ROLLS BACK. The endpoint's own `{ liked }` / `{ saved }` is the truth. */
  const toggle = async (r: Review, kind: 'like' | 'save') => {
    const was = kind === 'like' ? r.liked_by_me : r.saved_by_me
    const apply = (v: boolean) => patch(r.id, x => kind === 'like'
      ? { ...x, liked_by_me: v, like_count: Math.max(0, (x.like_count ?? 0) + (v === x.liked_by_me ? 0 : v ? 1 : -1)) }
      : { ...x, saved_by_me: v })
    apply(!was)
    try {
      const res = await fetch(`/api/reviews/${r.id}/${kind}`, { method: 'POST', credentials: 'include' })
      if (res.status === 401) { window.location.href = `/login?returnTo=${encodeURIComponent('/reviews')}`; return }
      if (!res.ok) { apply(was); return }
      const data = await res.json().catch(() => null)
      const confirmed = kind === 'like' ? data?.liked : data?.saved
      if (typeof confirmed === 'boolean') apply(confirmed)
    } catch {
      apply(was)
    }
  }
  /** The phone feed's `followFromFeed`, for the same endpoint, with the same rollback. */
  const follow = async (r: Review) => {
    if (requireLogin()) return
    const setFollowing = (v: boolean) => setRows(prev => prev.map(x => (x.user_id === r.user_id ? { ...x, is_following: v } : x)))
    setFollowing(true)
    try {
      const res = await fetch(`/api/users/${r.user_id}/follow`, { method: 'POST' })
      if (!res.ok) throw new Error('follow_failed')
      const d = await res.json()
      setFollowing(!!d.following)
    } catch {
      setFollowing(false)
    }
  }
  /** Owner-only: delete or hide, the feed's own endpoints; the card leaves the stage. */
  const remove = (id: string) => {
    setRows(prev => {
      const next = prev.filter(r => r.id !== id)
      setActive(a => Math.min(a, Math.max(0, next.length - 1)))
      return next
    })
  }

  const activeReview = rows[active] ?? null
  const drawn = useMemo(() => {
    const out: Array<{ r: Review; index: number; d: number }> = []
    rows.forEach((r, index) => {
      const d = index - active
      if (Math.abs(d) <= DRAWN) out.push({ r, index, d })
    })
    return out
  }, [rows, active])

  const navLinks = [
    { href: '/reviews', key: 'v3.explore.navExplore', current: true },
    { href: '/chat', key: 'v3.explore.navAsk', current: false },
    { href: '/planner', key: 'v3.explore.navPlan', current: false },
    { href: '/music', key: 'v3.explore.navMusic', current: false },
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
          {/* ── MAIN: the stage ─────────────────────────────────────────── */}
          <div
            ref={stageRef}
            className="v3-xp-stage"
            data-explore-stage
            data-mode={mode}
            data-dragging={dragging ? 'true' : 'false'}
            data-active-index={active}
            data-active-review-id={activeReview?.id ?? ''}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={onClickCapture}
          >
            {/* Ambient light from the active clip's own poster. Decorative. */}
            <div
              className="v3-xp-ambient"
              aria-hidden="true"
              data-empty={activeReview?.thumbnail ? 'false' : 'true'}
              style={activeReview?.thumbnail ? { backgroundImage: `url("${activeReview.thumbnail}")` } : undefined}
            />

            {loading && (
              <div className="v3-xp-state"><Loader2 size={26} className="animate-spin" /></div>
            )}
            {!loading && error && (
              <div className="v3-xp-state"><AlertCircle size={34} className="opacity-60" aria-hidden="true" /><p className="text-[13px]">{t('reviews.feedLoadError')}</p></div>
            )}
            {!loading && !error && count === 0 && (
              <div className="v3-xp-state"><PlayCircle size={34} className="opacity-50" aria-hidden="true" /><p className="text-[13px]">{t('v3.explore.empty')}</p></div>
            )}

            {!loading && !error && count > 0 && (
              <>
                {/* The lit floor: pool of light, the platform ellipse, its bright rim. */}
                <div className="v3-xp-floor" data-layer="pool" aria-hidden="true" style={{ top: floorTop - 90, width: cardW * 3.6, height: 260 }} />
                <div className="v3-xp-floor" data-layer="platform" aria-hidden="true" style={{ top: floorTop - 6, width: cardW * 2.4, height: 96 }} />
                <div className="v3-xp-floor" data-layer="rim" aria-hidden="true" style={{ top: floorTop + 52, width: cardW * 3.0, height: 60 }} />

                <div className="v3-xp-space">
                  {drawn.map(({ r, index, d }) => {
                    const { transform, opacity } = slotTransform(d - drag, g, cardW)
                    const role = slotRole(d)
                    return (
                      <StageCard
                        key={r.id}
                        review={r}
                        role={role}
                        me={me}
                        style={{ width: cardW, height: cardH, transform, opacity, zIndex: 10 - Math.abs(d), top: '44%' }}
                        onSelect={() => setActive(index)}
                        onLike={() => void toggle(r, 'like')}
                        onSave={() => void toggle(r, 'save')}
                        onFollow={() => void follow(r)}
                        onRemoved={() => remove(r.id)}
                        subject={askSubject(r)}
                        t={t}
                      />
                    )
                  })}
                </div>

                {count > 1 && (
                  <>
                    <button type="button" className="v3-xp-nav-btn left-4" onClick={() => step(-1)} disabled={active === 0} aria-label={t('v3.explore.prev')} data-stage-prev>
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <button type="button" className="v3-xp-nav-btn right-4" onClick={() => step(1)} disabled={active === count - 1} aria-label={t('v3.explore.next')} data-stage-next>
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                  </>
                )}

                {/* Position + progress line, bottom left. */}
                <div className="v3-xp-pos" data-xp-pos>
                  <span className="v3-xp-pos-num" data-stage-pos aria-live="polite">{active + 1} / {count}</span>
                  <div className="v3-xp-line" aria-hidden="true"><span style={{ width: `${((active + 1) / count) * 100}%` }} data-xp-line /></div>
                </div>

                {/* The scroll cue and the hint, bottom centre. */}
                <div className="v3-xp-hint" aria-hidden="true" data-xp-hint>
                  <Mouse size={22} strokeWidth={1.5} />
                  <span>{t('v3.explore.scrollHint')}</span>
                </div>

                {/* Thumbnail navigator, bottom right: the clips' own posters. */}
                {count > 1 && (
                  <div className="v3-xp-thumbs" role="tablist" aria-label={t('v3.explore.thumbs')} data-xp-thumbs>
                    {rows.slice(0, 8).map((r, i) => (
                      <button
                        key={r.id}
                        type="button"
                        role="tab"
                        className="v3-xp-thumb"
                        aria-current={i === active ? 'true' : undefined}
                        aria-selected={i === active}
                        aria-label={t('v3.explore.goTo', { n: String(i + 1) })}
                        onClick={() => setActive(i)}
                      >
                        {r.thumbnail
                          // eslint-disable-next-line @next/next/no-img-element -- feed poster, any host
                          ? <img src={r.thumbnail} alt="" loading="lazy" />
                          : <span className="v3-xp-thumb-empty" aria-hidden="true">{i + 1}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    ;(async () => {
      try {
        const { data } = await createClient()
          .from('review_likes')
          .select('reviews!inner(place_name)')
          .gte('created_at', since)
          .limit(200)
        const counts = new Map<string, number>()
        for (const row of (data || []) as Array<{ reviews?: { place_name?: string | null } | null }>) {
          const name = row.reviews?.place_name
          if (name && !isShareOnlyName(name)) counts.set(name, (counts.get(name) || 0) + 1)
        }
        if (alive) setHot(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([place_name, count]) => ({ place_name, count })))
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

/* ── One clip in the space ─────────────────────────────────────────────────
 *
 * 🚨🚨 THE PLAYBACK CONTRACT LIVES HERE, AND IT IS STRUCTURAL. The player is
 * mounted ONLY on the active card; every other card renders `LinkPoster`. So
 * there is exactly one <video> element on the page. Switching clips unmounts the
 * old player — stronger than pausing it: a paused player can be resumed by a
 * stray event, and a player that does not exist cannot.
 */
function StageCard({
  review: r, role, me, style, onSelect, onLike, onSave, onFollow, onRemoved, subject, t,
}: {
  review: Review
  role: 'active' | 'near' | 'far' | 'hidden'
  me: Me
  style: React.CSSProperties
  onSelect: () => void
  onLike: () => void
  onSave: () => void
  onFollow: () => void
  onRemoved: () => void
  subject: string | null
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const active = role === 'active'
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [menu, setMenu] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // The player expresses pause through `PlaybackSession.onUserPauseToggle()`;
  // the session owns that intent, so autoplay cannot undo a deliberate pause.
  const playerRef = useRef<VideoPlayerHandle>(null)
  const cardRef = useRef<HTMLElement>(null)
  const [userPaused, setUserPaused] = useState(false)
  useEffect(() => { if (!active) { setUserPaused(false); setMenu(false); setExpanded(false) } }, [active])

  // ── The playback strip reads the player's own <video>: time and duration ──
  // Presentation only. It subscribes to the element `VideoPlayer` mounted and never
  // drives playback itself; a link/YouTube clip has no <video> here, so it draws nothing.
  const [clock, setClock] = useState<{ t: number; d: number } | null>(null)
  useEffect(() => {
    if (!active) { setClock(null); return }
    const host = cardRef.current
    if (!host || typeof MutationObserver === 'undefined') return
    let video: HTMLVideoElement | null = null
    const tick = () => { if (video && Number.isFinite(video.duration) && video.duration > 0) setClock({ t: video.currentTime, d: video.duration }) }
    const attach = () => {
      const v = host.querySelector('video')
      if (!v || v === video) return
      video?.removeEventListener('timeupdate', tick)
      video = v
      v.addEventListener('timeupdate', tick)
      v.addEventListener('loadedmetadata', tick)
      tick()
    }
    attach()
    const mo = new MutationObserver(attach)
    mo.observe(host, { childList: true, subtree: true })
    return () => { mo.disconnect(); video?.removeEventListener('timeupdate', tick); video?.removeEventListener('loadedmetadata', tick) }
  }, [active])

  const togglePause = () => {
    playerRef.current?.onUserPauseToggle()
    setUserPaused(v => !v)
  }
  const fullscreen = () => {
    const el = cardRef.current
    if (el && typeof el.requestFullscreen === 'function') void el.requestFullscreen().catch(() => {})
  }

  const isMe = !!me && me.id === r.user_id
  const author = r.profiles?.full_name?.trim()
  const avatar = r.profiles?.avatar_url ?? null
  const caption = (r.body ?? '').trim()
  const place = isShareOnlyName(r.place_name) ? null : r.place_name
  const address = (r.place_address ?? '').trim() || null
  const when = ago(r.created_at, t)
  const longCaption = caption.length > 120

  return (
    <article
      ref={cardRef}
      className="v3-xp-card"
      style={style}
      data-explore-card
      data-role={role}
      data-active={active ? 'true' : 'false'}
      aria-hidden={role === 'hidden' ? true : undefined}
    >
      {/* ── Media ─────────────────────────────────────────────────────── */}
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
        <div className={active ? 'v3-xp-scrim' : 'v3-xp-side-scrim'} />
      </div>

      {/* The frame: on a non-active card it brings that clip to the front; on the
          playing one it toggles pause. A button, so it is keyboard-reachable. */}
      <button
        type="button"
        onClick={() => { if (!active) { onSelect(); return } togglePause() }}
        aria-label={active ? t('v3.explore.togglePlay') : t('v3.explore.playThis')}
        aria-pressed={active}
        tabIndex={role === 'hidden' ? -1 : 0}
        className="absolute inset-0 z-[5] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ background: 'transparent' }}
      />

      {active && userPaused && (
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-[6] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur" style={{ background: 'rgba(8,9,13,0.55)' }}>
          <Play size={28} className="translate-x-[1px] fill-white text-white" />
        </span>
      )}

      {active ? (
        <>
          {/* ── Creator header: avatar · name · time · Follow · overflow ─────── */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 p-3.5">
            {author ? (
              <Link href={`/users/${r.user_id}`} onClick={e => e.stopPropagation()} aria-label={t('v3.explore.viewAuthor', { name: author })} className="relative z-10 flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                <Avatar src={avatar} broken={avatarBroken} onBroken={() => setAvatarBroken(true)} name={author} size={38} />
                <span className="min-w-0">
                  <span className="v3-xp-creator block truncate text-[14.5px] font-semibold leading-tight">{author}</span>
                  <span className="v3-xp-creator-time block text-[12px] leading-tight">{when}</span>
                </span>
              </Link>
            ) : (
              <span className="v3-xp-creator-time text-[12px]">{when}</span>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              {!isMe && !r.is_following && (
                <button type="button" className="v3-xp-follow relative z-10" onClick={e => { e.stopPropagation(); onFollow() }} data-xp-follow>
                  {t('reviews.follow')}
                </button>
              )}
              {!isMe && r.is_following && (
                <span className="v3-xp-follow" data-on="true" data-xp-following>{t('reviews.following')}</span>
              )}
              {isMe && (
                <span className="relative">
                  <button type="button" className="v3-xp-more relative z-10" onClick={e => { e.stopPropagation(); setMenu(v => !v) }} aria-haspopup="menu" aria-expanded={menu} aria-label={t('v3.explore.more')} data-xp-more>
                    <MoreHorizontal size={20} aria-hidden="true" />
                  </button>
                  {menu && (
                    <span className="v3-xp-menu" role="menu">
                      <button type="button" role="menuitem" data-danger onClick={async e => {
                        e.stopPropagation()
                        if (!confirm(t('reviews.deleteConfirmShort'))) return
                        const res = await fetch(`/api/reviews/${r.id}`, { method: 'DELETE' })
                        if (res.ok) onRemoved()
                        setMenu(false)
                      }}>
                        <Trash2 size={15} aria-hidden="true" /> {t('reviews.deletePost')}
                      </button>
                      <button type="button" role="menuitem" onClick={async e => {
                        e.stopPropagation()
                        const res = await fetch(`/api/reviews/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: true }) })
                        if (res.ok) onRemoved()
                        setMenu(false)
                      }}>
                        <EyeOff size={15} aria-hidden="true" /> {t('reviews.hidePost')}
                      </button>
                    </span>
                  )}
                </span>
              )}
            </span>
          </div>

          {/* ── Compact action rail: icon + real count, at the card's right edge ── */}
          <div className="v3-xp-rail">
            <button type="button" className="v3-xp-rail-btn" data-kind="like" data-on={!!r.liked_by_me} onClick={e => { e.stopPropagation(); onLike() }} aria-label={t('v3.explore.like')} aria-pressed={!!r.liked_by_me} data-xp-like>
              <Heart size={24} fill={r.liked_by_me ? 'currentColor' : 'none'} aria-hidden="true" />
              <span data-xp-like-count>{shortCount(r.like_count)}</span>
            </button>
            <Link href={`/reviews/${r.id}`} onClick={e => e.stopPropagation()} className="v3-xp-rail-btn" aria-label={t('v3.explore.comment')} data-xp-comment>
              <MessageCircle size={24} aria-hidden="true" />
              <span data-xp-comment-count>{shortCount(r.comment_count)}</span>
            </Link>
            <Link href={`/reviews/${r.id}`} onClick={e => e.stopPropagation()} className="v3-xp-rail-btn" aria-label={t('v3.explore.share')} data-xp-share>
              <Share2 size={24} aria-hidden="true" />
            </Link>
            <button type="button" className="v3-xp-rail-btn" data-kind="save" data-on={!!r.saved_by_me} onClick={e => { e.stopPropagation(); onSave() }} aria-label={t('v3.explore.save')} aria-pressed={!!r.saved_by_me} data-xp-save>
              <Bookmark size={24} fill={r.saved_by_me ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          </div>

          {/* ── Bottom zone: caption, location, Ask Tappy, then the playback strip ── */}
          <div className="v3-xp-bottom">
            <div className="pr-12" data-xp-caption-block>
              {caption && (
                <p className="v3-xp-caption text-[15.5px] font-semibold leading-snug" style={expanded ? undefined : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} data-xp-caption>
                  {caption}
                </p>
              )}
              {caption && longCaption && !expanded && (
                <button type="button" className="v3-xp-caption-more relative z-10 mt-0.5 text-[12.5px]" onClick={e => { e.stopPropagation(); setExpanded(true) }} data-xp-caption-more>
                  {t('v3.explore.readMore')}
                </button>
              )}
              {place && (
                <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug" data-xp-location>
                  <MapPin size={15} className="mt-0.5 flex-shrink-0 text-white" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="v3-xp-place font-semibold">{place}</span>
                    {address && <span className="v3-xp-place-addr"> · {address}</span>}
                  </span>
                </p>
              )}
              {subject && (
                <Link
                  href={`/chat?q=${encodeURIComponent(t('bridge.promptEntity', { subject }))}&ctx=${encodeURIComponent(r.id)}`}
                  onClick={e => {
                    e.stopPropagation()
                    const ev = askTappyPlaceEvent({ phase: 'click', reviewId: r.id, surface: 'explore_desktop', hasAddress: !!r.place_address?.trim() })
                    track(ev.event_type, ev.metadata)
                  }}
                  className="v3-xp-ask relative z-10 mt-2.5"
                  data-stage-ask
                >
                  <Sparkles size={13} aria-hidden="true" />
                  {t('v3.explore.askAboutVideo')}
                </Link>
              )}
            </div>
            {clock && (
              <div className="mt-3" data-xp-playback>
                <div className="v3-xp-track"><span style={{ width: `${Math.min(100, (clock.t / clock.d) * 100)}%` }} /></div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <button type="button" className="v3-xp-play-btn relative z-10" onClick={e => { e.stopPropagation(); togglePause() }} aria-label={t('v3.explore.togglePlay')} data-xp-pause>
                    {userPaused ? <Play size={17} className="fill-white" aria-hidden="true" /> : <Pause size={17} className="fill-white" aria-hidden="true" />}
                  </button>
                  <span className="v3-xp-time" data-xp-time>{mmss(clock.t)} / {mmss(clock.d)}</span>
                  <button type="button" className="v3-xp-play-btn relative z-10 ml-auto" onClick={e => { e.stopPropagation(); fullscreen() }} aria-label={t('v3.explore.fullscreen')} data-xp-fullscreen>
                    <Maximize2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Side card: the creator line, the caption, the place and the like count — read at a glance. */
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4">
            {author && (
              <div className="flex items-center gap-2">
                <Avatar src={avatar} broken={avatarBroken} onBroken={() => setAvatarBroken(true)} name={author} size={28} />
                <span className="min-w-0">
                  <span className="v3-xp-side-name block truncate text-[12.5px] font-semibold leading-tight">{author}</span>
                  <span className="v3-xp-side-time block text-[10.5px] leading-tight">{when}</span>
                </span>
              </div>
            )}
            {caption && (
              <p className="v3-xp-side-title mt-5 text-[20px] font-bold leading-[1.15] tracking-[-0.01em]" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {caption}
              </p>
            )}
            {place && (
              <p className="v3-xp-side-place mt-3 flex items-start gap-1.5 text-[12px] leading-snug">
                <MapPin size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0"><span className="block truncate font-semibold">{place}</span>{address && <span className="block truncate opacity-80">{address}</span>}</span>
              </p>
            )}
          </div>
          <p className="v3-xp-side-likes pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Heart size={15} aria-hidden="true" />{shortCount(r.like_count)}
          </p>
        </>
      )}
    </article>
  )
}

/** The creator's picture, or the feed's own initial-letter fallback — also when a real URL fails to load. */
function Avatar({ src, broken, onBroken, name, size }: { src: string | null; broken: boolean; onBroken: () => void; name: string; size: number }) {
  if (src && !broken) {
    return <Image src={src} alt="" width={size} height={size} onError={onBroken} className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: '2px solid rgba(255,255,255,0.5)' }} />
  }
  return (
    <span aria-hidden="true" className="flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: 'var(--v3-accent-fill)' }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
