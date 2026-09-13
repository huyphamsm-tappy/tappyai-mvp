'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { track } from '@/lib/tracking/tracker'
import { askTappyPlaceEvent } from '@/lib/explore/clipVenueEvidence'

// ── V3 Web · EXPLORE — the spatial stage (≥ 768px) ──────────────────────────
//
// Explore opens INTO VIDEO, and one clip is the centre of gravity. The clips are
// positions in one perspective space: the active clip nearest and largest, its
// neighbours behind it and turned away, the far pair deeper still. Moving through
// the feed rotates the space; it does not swap a card.
//
// 🚨 ONE SOURCE OF TRUTH. `active` is the only index. The mounted player, the
// overlay, the Ask-Tappy link (and so the `ctx=<reviewId>` the chat keeps), the
// position readout and every card's transform derive from it. Nothing else
// remembers "which clip".
//
// 🚨 WHAT IS REUSED, RATHER THAN REBUILT (there must not be a second video system):
//   · `VideoPlayer` — the existing player and its `active` playback flag; mounted on
//     the active card ONLY. Every other card renders `LinkPoster`, a picture. So
//     "several visible, one playing" is structural: one <video> exists on the page.
//   · `/api/reviews/feed` — the existing endpoint, its sorts and its search;
//   · `Review` and `isShareOnlyName` from `feedShared`;
//   · `/chat?q=` + `ctx=` — the existing Ask-Tappy handoff, measured by the existing
//     `ask_tappy_place` click event;
//   · `/api/reviews/[id]/like` and `/save` — the existing interaction endpoints;
//   · `V3Shell` — the approved global shell, unchanged.
//
// 🔑 NO NEW DEPENDENCY. The space is CSS 3D (`perspective`, `preserve-3d`,
// `translate3d` / `rotateY` / `scale`) driven by pointer events; the repository
// has no motion library and this does not add one. Reduced motion turns the
// transitions off in `globals.css`.

/** Distances from the active clip that are drawn. Beyond ±2 a card exists only as
 *  the slot the next one animates in from. */
const DRAWN = 3

/** The stage's height — the viewport's, clamped, so the clips fill the column
 *  without running past the fold. Card width follows from it at 9:16. */
const STAGE_H = 'clamp(420px, calc(100dvh - 250px), 720px)'

type FeedSort = 'for-you' | 'following' | 'latest'

/** The filter row is the REAL one: the three sorts the endpoint accepts. `reviews` has no
 *  category column, so the reference's topic taxonomy is not drawn. */
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

// ── The spatial model ───────────────────────────────────────────────────────
//
// Each entry is indexed by |distance| from the active clip: 0 = active, 1 = the
// neighbours, 2 = the far pair, 3 = the slot a card leaves from / arrives at.
// `x` is a multiple of the card width; `z` and `rot` are px / degrees; `sc` the
// scale; `op` the opacity. A drag interpolates linearly between these rows, so
// the space turns with the finger.
interface Geometry { x: number[]; z: number[]; rot: number[]; sc: number[]; op: number[]; divisor: number }
const GEOMETRY: Record<'desktop' | 'tablet', Geometry> = {
  // Five drawn across a wide stage: the pair behind each shoulder stays discoverable.
  desktop: { x: [0, 0.82, 1.46, 1.8], z: [0, -230, -460, -640], rot: [0, 18, 28, 34], sc: [1, 0.8, 0.64, 0.52], op: [1, 0.78, 0.46, 0], divisor: 3.2 },
  // Three drawn on a narrower stage: neighbours peek, the far pair is a deep cue.
  tablet: { x: [0, 0.66, 1.1, 1.3], z: [0, -240, -460, -600], rot: [0, 20, 30, 34], sc: [1, 0.76, 0.58, 0.48], op: [1, 0.7, 0.34, 0], divisor: 2.3 },
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

export default function ExploreStage() {
  const { t } = useTranslation()

  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<FeedSort>('for-you')
  const [search, setSearch] = useState('')
  const [submitted, setSubmitted] = useState('')

  // 🚨 The one index. See the note at the top.
  const [active, setActive] = useState(0)

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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // Horizontal trackpad / shift-wheel turns the space one clip at a time.
  const wheelRef = useRef(0)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
    if (!dx) return
    const now = Date.now()
    if (now - wheelRef.current < 360) return
    wheelRef.current = now
    step(dx > 0 ? 1 : -1)
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
  // Five drawn needs a wide stage; below that (tablets, and a 1024 desktop beside the
  // sidebar) three drawn with a deep cue reads better than five cramped ones.
  // Before the first measurement (and in environments with no layout) a nominal
  // stage keeps the cards drawn; the observer corrects it on the next frame.
  const stageW = box.w || 1000
  const stageH = box.h || 620
  const mode: 'desktop' | 'tablet' = stageW >= 980 ? 'desktop' : 'tablet'
  const g = GEOMETRY[mode]
  // A vertical clip has a maximum sensible width (9:16 of its height); the stage's
  // width caps it again so the far pair stays inside the column.
  const cardW = Math.floor(Math.min(stageH * 9 / 16, stageW / g.divisor))
  const cardH = Math.floor(cardW * 16 / 9)

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
    // Progress in cards, clamped to one clip per gesture; resistance at the ends.
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

  const activeReview = rows[active] ?? null
  const drawn = useMemo(() => {
    const out: Array<{ r: Review; index: number; d: number }> = []
    rows.forEach((r, index) => {
      const d = index - active
      if (Math.abs(d) <= DRAWN) out.push({ r, index, d })
    })
    return out
  }, [rows, active])

  const dots = count > 1 && count <= 12

  return (
    <V3Shell title={t('v3.explore.title')} subtitle={t('v3.explore.subtitle')} activeTab="/reviews">
      <div className="pb-8 pt-1" onWheel={onWheel} data-explore-stage-page>
        {/* ── Filters + search on one row ───────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SORTS.map(s => {
              const on = sort === s.id && !submitted
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSubmitted(''); setSearch(''); setSort(s.id) }}
                  aria-pressed={on}
                  className="v3-stage-chip"
                >
                  {t(s.labelKey)}
                </button>
              )
            })}
          </div>
          {/* The EXISTING search: `/api/reviews/feed?search=`. */}
          <form className="relative w-full max-w-[300px]" onSubmit={e => { e.preventDefault(); setSubmitted(search) }} role="search">
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--v3-fg-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('v3.explore.searchPlaceholder')}
              aria-label={t('v3.explore.searchPlaceholder')}
              className="v3-stage-search"
            />
          </form>
        </div>

        {/* ── The stage ─────────────────────────────────────────────────── */}
        <div className="relative mt-5">
          {loading && (
            <div className="flex items-center justify-center" style={{ height: STAGE_H }}>
              <Loader2 size={26} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-2" style={{ height: STAGE_H, color: 'var(--v3-fg-muted)' }}>
              <AlertCircle size={34} className="opacity-50" aria-hidden="true" />
              <p className="text-[13px]">{t('reviews.feedLoadError')}</p>
            </div>
          )}

          {!loading && !error && count === 0 && (
            <div className="flex flex-col items-center justify-center gap-2" style={{ height: STAGE_H, color: 'var(--v3-fg-muted)' }}>
              <PlayCircle size={34} className="opacity-40" aria-hidden="true" />
              <p className="text-[13px]">{t('v3.explore.empty')}</p>
            </div>
          )}

          {!loading && !error && count > 0 && (
            <>
              <div
                ref={stageRef}
                className="v3-stage"
                style={{ height: STAGE_H }}
                data-explore-stage
                data-mode={mode}
                data-dragging={dragging ? 'true' : 'false'}
                data-active-index={active}
                data-active-review-id={activeReview?.id ?? ''}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={onClickCapture}
              >
                {/* Ambient light from the active clip's own poster. Decorative. */}
                <div
                  className="v3-stage-ambient"
                  aria-hidden="true"
                  data-empty={activeReview?.thumbnail ? 'false' : 'true'}
                  style={activeReview?.thumbnail ? { backgroundImage: `url("${activeReview.thumbnail}")` } : undefined}
                />
                <div className="v3-stage-floor" aria-hidden="true" />

                <div className="v3-stage-space">
                  {drawn.map(({ r, index, d }) => {
                    const { transform, opacity } = slotTransform(d - drag, g, cardW)
                    const role = slotRole(d)
                    return (
                      <StageCard
                        key={r.id}
                        review={r}
                        role={role}
                        style={{ width: cardW, height: cardH, transform, opacity, zIndex: 10 - Math.abs(d) }}
                        onSelect={() => setActive(index)}
                        subject={askSubject(r)}
                        t={t}
                      />
                    )
                  })}
                </div>

                {count > 1 && (
                  <>
                    <button type="button" className="v3-stage-nav left-1 md:left-2" onClick={() => step(-1)} disabled={active === 0} aria-label={t('v3.explore.prev')} data-stage-prev>
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <button type="button" className="v3-stage-nav right-1 md:right-2" onClick={() => step(1)} disabled={active === count - 1} aria-label={t('v3.explore.next')} data-stage-next>
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              {/* ── Position: where you are in the feed, and how to move ─────── */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-3">
                  {dots && (
                    <div className="v3-stage-dots" aria-hidden="true">
                      {rows.map((r, i) => <span key={r.id} className="v3-stage-dot" data-on={i === active ? 'true' : 'false'} />)}
                    </div>
                  )}
                  <span className="v3-stage-pos text-[12px] font-semibold" data-stage-pos aria-live="polite">
                    {active + 1} / {count}
                  </span>
                </div>
                {count > 1
                  ? <p className="v3-stage-hint text-[11.5px]">{t('v3.explore.navHint')}</p>
                  : <p className="v3-stage-hint text-[11.5px]">{t('v3.explore.growing')}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </V3Shell>
  )
}

/* ── One clip in the space ─────────────────────────────────────────────────
 *
 * 🚨🚨 THE PLAYBACK CONTRACT LIVES HERE, AND IT IS STRUCTURAL. The player is
 * mounted ONLY on the active card; every other card renders `LinkPoster`. So
 * there is exactly one <video> element on the page. Switching clips unmounts the
 * old player — stronger than pausing it: a paused player can be resumed by a
 * stray event, and a player that does not exist cannot.
 *
 * The overlay (rail, author, caption, Ask Tappy) is drawn on the active card
 * only; the others show their poster, a veil and the clip's first hashtag —
 * enough to be discoverable, never enough to compete.
 */
function StageCard({
  review: r, role, style, onSelect, subject, t,
}: {
  review: Review
  role: 'active' | 'near' | 'far' | 'hidden'
  style: React.CSSProperties
  onSelect: () => void
  subject: string | null
  t: (key: string, vars?: Record<string, string>) => string
}) {
  const active = role === 'active'
  const [liked, setLiked] = useState(!!r.liked_by_me)
  const [saved, setSaved] = useState(!!r.saved_by_me)
  const [busy, setBusy] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)

  // The player expresses pause through `PlaybackSession.onUserPauseToggle()`;
  // the session owns that intent, so autoplay cannot undo a deliberate pause.
  const playerRef = useRef<VideoPlayerHandle>(null)
  const [userPaused, setUserPaused] = useState(false)
  useEffect(() => { if (!active) setUserPaused(false) }, [active])

  /** Optimistic, and it ROLLS BACK. The endpoint's own `{ liked }` is the truth. */
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
      className="v3-stage-card"
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
        {active && <div className="v3-stage-scrim" />}
      </div>
      <div className="v3-stage-veil" aria-hidden="true" />

      {/* The frame: on a non-active card it brings that clip to the front; on the
          playing one it toggles pause. A button, so it is keyboard-reachable. */}
      <button
        type="button"
        onClick={() => {
          if (!active) { onSelect(); return }
          playerRef.current?.onUserPauseToggle()
          setUserPaused(v => !v)
        }}
        aria-label={active ? t('v3.explore.togglePlay') : t('v3.explore.playThis')}
        aria-pressed={active}
        tabIndex={role === 'hidden' ? -1 : 0}
        className="absolute inset-0 z-[5] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ background: 'transparent' }}
      />

      {/* Paused affordance — only while the USER paused. */}
      {active && userPaused && (
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-[6] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur" style={{ background: 'rgba(8,9,13,0.55)' }}>
          <Play size={26} className="translate-x-[1px] fill-white text-white" />
        </span>
      )}

      {/* ── Top: the clip's own first hashtag. Real metadata, not a taxonomy. ── */}
      {tags.length > 0 && (
        <span className="v3-stage-tag absolute left-3 top-3 z-10 truncate">
          {tags[0].startsWith('#') ? tags[0] : `#${tags[0]}`}
        </span>
      )}

      {active && (
        <>
          {/* ── Action rail. ICONS, NO NUMBERS — the feed's counts are mostly zero and
              printing them says something about the creator that helps no one. The
              ACTIONS are real: the endpoints the mobile feed calls. ── */}
          <div className="absolute bottom-[124px] right-3 z-10 flex flex-col items-center gap-2.5">
            <button type="button" onClick={e => { e.stopPropagation(); void toggle('like') }} aria-label={t('v3.explore.like')} aria-pressed={liked} data-on={liked} className="v3-stage-rail-btn relative z-10">
              <Heart size={19} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            {/* Comments live on the existing detail route — no second comment system. */}
            <Link href={`/reviews/${r.id}`} onClick={e => e.stopPropagation()} aria-label={t('v3.explore.comment')} className="v3-stage-rail-btn relative z-10">
              <MessageCircle size={19} aria-hidden="true" />
            </Link>
            <Link href={`/reviews/${r.id}`} onClick={e => e.stopPropagation()} aria-label={t('v3.explore.share')} className="v3-stage-rail-btn relative z-10">
              <Share2 size={19} aria-hidden="true" />
            </Link>
            <button type="button" onClick={e => { e.stopPropagation(); void toggle('save') }} aria-label={t('v3.explore.save')} aria-pressed={saved} data-on={saved} className="v3-stage-rail-btn relative z-10">
              <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          </div>

          {/* ── Creator + caption + the differentiator ───────────────────── */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            {author && (
              <Link
                href={`/users/${r.user_id}`}
                onClick={e => e.stopPropagation()}
                aria-label={t('v3.explore.viewAuthor', { name: author })}
                className="relative z-10 mb-2 flex w-fit items-center gap-2 rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {avatar && !avatarBroken
                  ? <Image src={avatar} alt="" width={26} height={26} onError={() => setAvatarBroken(true)} className="h-[26px] w-[26px] flex-shrink-0 rounded-full object-cover" />
                  : <span aria-hidden="true" className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--v3-accent-fill)' }}>{author.slice(0, 1).toUpperCase()}</span>}
                <span className="truncate text-[12.5px] font-semibold text-white">{author}</span>
              </Link>
            )}

            {caption && (
              <p className="text-[13px] leading-snug text-white" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {caption}
              </p>
            )}

            {tags.length > 1 && (
              <p className="mt-1 truncate text-[11px]" style={{ color: '#7DD3FC' }}>
                {tags.slice(1).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
              </p>
            )}

            {hasOriginalSound && (
              <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-white/70">
                <Music2 size={11} aria-hidden="true" />
                {t('v3.explore.originalSound')}
              </p>
            )}

            {/* video → ask Tappy. The existing `/chat?q=` handoff with `ctx=<this clip>`;
                measured by the existing `ask_tappy_place` click event. With no subject
                there is no button. */}
            {subject && (
              <Link
                href={`/chat?q=${encodeURIComponent(t('bridge.promptEntity', { subject }))}&ctx=${encodeURIComponent(r.id)}`}
                onClick={e => {
                  e.stopPropagation()
                  const ev = askTappyPlaceEvent({ phase: 'click', reviewId: r.id, surface: 'explore_desktop', hasAddress: !!r.place_address?.trim() })
                  track(ev.event_type, ev.metadata)
                }}
                className="v3-stage-ask relative z-10 mt-3"
                data-stage-ask
              >
                <Sparkles size={14} aria-hidden="true" />
                {t('v3.explore.askAboutVideo')}
              </Link>
            )}
          </div>
        </>
      )}
    </article>
  )
}
