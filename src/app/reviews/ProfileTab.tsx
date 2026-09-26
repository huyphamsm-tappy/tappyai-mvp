'use client'

// The TikTok-style Profile tab + its swipeable clip viewer, extracted verbatim from
// page.tsx: the profile-grid delete-reflow regression test imports ProfileTab, and
// Next.js forbids extra named exports from a page file.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from '@/components/media/SafeImage'
import {
  ChevronLeft, ChevronUp, ChevronDown,
  Trash2, EyeOff, Eye, Loader2, Plus, Grid3X3, AlertCircle,
} from 'lucide-react'
import { trailingFillerCount } from '@/lib/ui/gridFill'
import { getUserPreferences } from '@/lib/userMemory'
import type { UserPreferences } from '@/lib/userMemory'
import LikeListSheet from './LikeListSheet'
import LinkPoster from '@/components/LinkPoster'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Post, CommentDrawer, ShareModal, isShareOnlyName, type Review } from './feedShared'
import { loginPathFor, currentDestination } from '@/lib/auth/returnTo'

/* ─── Swipeable clip viewer — opens from the profile grid with the SAME UX as
   the main feed: swipe/arrow between clips, single-tap pause, double-tap like,
   like/comment/save/share, own-post delete/hide. Reuses Post/CommentDrawer/ShareModal.

   Ownership contract (Canonical Explore Navigation Spec §4, migration M4 —
   normative, a violation is a review failure not a preference):
   - Owns ONLY its viewer index (`activeIndex` below) and its local list copy.
   - NEVER writes ExploreState: no ExploreSession calls, no sessionStorage /
     localStorage, in any code path (F8: a secondary surface reusing Post must
     not freeze or restore — one session, owned by the Explore feed page).
   - NO history for open/close: opening is plain component state
     (`viewerStart`), closing is `onClose` — no pushState, no hash, no route.
   - Links inside the viewer that leave /reviews are the PAGE's departure
     (caught by the page-root click capture), not the viewer's concern. */
// Exported so the Inbox can reuse it: a notification about a CLIP has to land in the clip
// experience, not on the article-style detail page. It needs nothing from the profile grid —
// `posts` may be a single review fetched by id — so there is no second viewer to build.
export function ClipViewer({ posts, startIndex, me, onClose, onDelete }: { posts: Review[]; startIndex: number; me: string | null; onClose: () => void; onDelete?: (id: string) => void }) {
  const [items, setItems] = useState<Review[]>(posts)
  const [activeIndex, setActiveIndex] = useState(startIndex)
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [likesOf, setLikesOf] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Jump straight to the tapped clip on open.
  useEffect(() => {
    const c = containerRef.current
    if (c) c.scrollTo({ top: startIndex * c.clientHeight, behavior: 'auto' })
  }, [startIndex])

  // 🔑 The destination is the page we are ON, never a literal. This viewer is mounted by the
  // profile grid AND by `/reviews/[id]` — every share link and push notification lands there — so
  // a hardcoded `/reviews` meant: receive a link, tap the heart, sign in, and the clip is gone.
  // `loginPathFor` is the producer half of the contract `lib/auth/returnTo` already defines.
  const requireLogin = () => { if (me) return false; window.location.href = loginPathFor(currentDestination()); return true }

  const like = async (id: string) => {
    if (requireLogin()) return
    let liked: boolean
    try {
      const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data.liked !== 'boolean') return
      liked = data.liked
    } catch { return }
    setItems(p => p.map(r => r.id === id ? { ...r, liked_by_me: liked, like_count: Math.max(0, r.like_count + (liked ? 1 : -1)) } : r))
  }
  const likeOnly = async (id: string) => {
    if (requireLogin()) return
    const cur = items.find(r => r.id === id)
    if (!cur || cur.liked_by_me) return
    setItems(p => p.map(r => r.id === id ? { ...r, liked_by_me: true, like_count: r.like_count + 1 } : r))
    try {
      const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('like failed')
      const data = await res.json()
      if (data.liked === false) setItems(p => p.map(r => r.id === id ? { ...r, liked_by_me: false, like_count: Math.max(0, r.like_count - 1) } : r))
    } catch {
      setItems(p => p.map(r => r.id === id ? { ...r, liked_by_me: false, like_count: Math.max(0, r.like_count - 1) } : r))
    }
  }
  const save = async (id: string) => {
    if (requireLogin()) return
    let saved: boolean
    try {
      const res = await fetch(`/api/reviews/${id}/save`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data.saved !== 'boolean') return
      saved = data.saved
    } catch { return }
    setItems(p => p.map(r => r.id === id ? { ...r, saved_by_me: saved } : r))
  }
  // Remove from the viewer's own list AND lift the removal to the parent grid so the profile
  // reflows immediately on close (Post already performed the DELETE/hide API call before calling
  // this). Without the lift, a clip deleted in the viewer lingered in the grid as a dead tile
  // until a refetch.
  // Remove from the viewer's own list AND lift the removal to the parent grid so the profile
  // reflows immediately on close (Post already performed the DELETE/hide API call before calling
  // this). Without the lift, a clip deleted in the viewer lingered in the grid as a dead tile
  // until a refetch.
  const del = (id: string) => { setItems(p => p.filter(r => r.id !== id)); onDelete?.(id) }
  const addComment = (id: string, count: number) => setItems(p => p.map(r => r.id === id ? { ...r, comment_count: count } : r))

  const scrollFeed = (dir: 1 | -1) => {
    const c = containerRef.current
    if (!c) return
    const cur = Math.round(c.scrollTop / c.clientHeight)
    const next = Math.max(0, Math.min(items.length - 1, cur + dir))
    c.scrollTo({ top: next * c.clientHeight, behavior: 'auto' })
    setActiveIndex(next)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex justify-center">
      <button onClick={onClose} aria-label="Đóng" className="absolute top-4 left-4 z-[60] w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform">
        <ChevronLeft size={24} />
      </button>
      <div className="w-full max-w-container-compact relative h-dvh">
        <div ref={containerRef}
          onScroll={e => { const c = e.currentTarget; const idx = Math.round(c.scrollTop / c.clientHeight); setActiveIndex(prev => (prev === idx ? prev : idx)) }}
          className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
          {items.map((r, i) => (
            <Post key={r.id} r={r} me={me} feedType="latest" showFeedTabs={false}
              renderVideo={Math.abs(i - activeIndex) <= 1} active={i === activeIndex}
              onFeedTypeChange={() => {}} onLike={like} onLikeDouble={likeOnly} onSave={save}
              onComment={setCommentOf} onShare={setShareOf} onDelete={del}
              onOpenLikes={rev => setLikesOf(rev.id)} />
          ))}
        </div>
        {/* Desktop prev/next — no swipe on desktop */}
        <div className="hidden md:flex flex-col gap-3 absolute left-full ml-4 top-1/2 -translate-y-1/2 z-40">
          <button onClick={() => scrollFeed(-1)} disabled={activeIndex <= 0} aria-label="Clip trước"
            className="w-11 h-11 rounded-full bg-gray-800/90 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"><ChevronUp size={22} /></button>
          <button onClick={() => scrollFeed(1)} disabled={activeIndex >= items.length - 1} aria-label="Clip sau"
            className="w-11 h-11 rounded-full bg-gray-800/90 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"><ChevronDown size={22} /></button>
        </div>
      </div>
      {commentOf && <CommentDrawer review={commentOf} me={me} onClose={() => setCommentOf(null)} onAdded={addComment} />}
      {shareOf && <ShareModal review={shareOf} onClose={() => setShareOf(null)} />}
      {likesOf && <LikeListSheet reviewId={likesOf} onClose={() => setLikesOf(null)} />}
    </div>
  )
}

/* ─── Creator profile (TikTok style) ───
   The PUBLIC profile of one user — the posts grid `/api/reviews/feed?userId=` serves to
   everyone — with the same swipeable viewer as the feed.

   🚨 NOT the signed-in user's own profile any more (2026-09-17). That has exactly one
   implementation, the V3 `/profile` hub with the five personal collections (Posts / Liked /
   Saved / Hidden / Shared) read through the gated routes. This component used
   to carry a second one — Saved and Liked tabs over direct `review_likes` / `review_saves`
   reads and a hidden-posts query — which is how web and Android drifted. Those reads are
   gone, not merely unreachable: a creator profile never requests a private collection, its
   own or anyone else's. `/reviews?tab=profile` and `/users/<me>` both hand over to `/profile`.
*/
// Exported for the profile-grid delete-reflow regression test (profileGridDelete.test.tsx).
//
// Two independent axes, never mixed:
//   variant       — LAYOUT. Decided by the ROUTE, identical for every viewer.
//                   'page' = the standalone /users/[id] profile (horizontal hero,
//                   responsive columns, 3:4 tiles — the Product Owner's reference);
//                   'tab' = the classic centred layout.
//   isOwnProfile  — PERMISSIONS ONLY. Which ACTIONS exist on the public grid:
//                   edit-profile vs follow, the + upload badge, preferences, delete/hide.
//                   It never adds data: the private collections live on /profile.
export function ProfileTab({ userId, viewerId, showBackButton, onBack, variant = 'tab' }: { userId: string; viewerId: string | null; showBackButton?: boolean; onBack?: () => void; variant?: 'tab' | 'page' }) {
  const { t, locale } = useTranslation()
  const isOwnProfile = viewerId === userId
  const isPage = variant === 'page'
  const [profile, setProfile] = useState<{
    full_name: string | null; avatar_url: string | null
    follower_count: number; following_count: number; review_count: number
  } | null>(null)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [posts, setPosts] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sel, setSel] = useState<Review | null>(null)
  const [viewerStart, setViewerStart] = useState<number | null>(null) // index into posts when the swipe viewer is open
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        // 🚨 Two reads, both PUBLIC, for every viewer: the profile header and the public posts
        // feed. Nothing private is requested here whoever is looking — the owner's collections
        // (liked / saved / hidden / shared) are `/profile`'s, through the gated routes.
        const [profileRes, reviewsRes, prefsRes] = await Promise.all([
          fetch(`/api/users/${userId}`).then(r => { if (!r.ok) throw new Error('profile_failed'); return r.json() }),
          // `?lang=` because on your OWN profile the response carries the moderation notice
          // for any post the safety gate held, and the server words it from the request
          // language. Falling through to Accept-Language would word it in the BROWSER's
          // language rather than the one picked in-app.
          fetch(`/api/reviews/feed?userId=${userId}&limit=50&lang=${encodeURIComponent(locale)}`).then(r => { if (!r.ok) throw new Error('feed_failed'); return r.json() }),
          isOwnProfile ? getUserPreferences(userId) : Promise.resolve(null),
        ])
        setProfile(profileRes)
        setFollowing(!!profileRes.is_following)
        setPrefs(prefsRes)
        setPosts((reviewsRes.reviews || []) as Review[])
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
    // `locale` re-fetches on a language switch, so the held-post notice changes language
    // with the rest of the page instead of keeping whatever it loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isOwnProfile, locale])

  // Follow/unfollow the profile being VIEWED — only meaningful when it isn't your
  // own. Same optimistic + revert-on-failure pattern already used for review likes.
  // Anonymous visitors may browse a public profile; following is an interaction,
  // so it sends them to login like every other interact action.
  const handleFollow = async () => {
    if (isOwnProfile || followBusy) return
    if (!viewerId) { window.location.href = '/login?returnTo=' + encodeURIComponent(`/users/${userId}`); return }
    setFollowBusy(true)
    const next = !following
    setFollowing(next)
    setProfile(p => p ? { ...p, follower_count: Math.max(0, p.follower_count + (next ? 1 : -1)) } : p)
    try {
      const res = await fetch(`/api/users/${userId}/follow`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error('follow_failed')
      if (typeof data?.following === 'boolean') setFollowing(data.following)
      if (typeof data?.follower_count === 'number') setProfile(p => p ? { ...p, follower_count: data.follower_count } : p)
    } catch {
      setFollowing(!next)
      setProfile(p => p ? { ...p, follower_count: Math.max(0, p.follower_count + (next ? -1 : 1)) } : p)
    } finally {
      setFollowBusy(false)
    }
  }

  const doDelete = async (id: string) => {
    if (!confirm(t('reviews.deleteConfirm'))) return
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' })
    if (res.ok) { setPosts(p => p.filter(r => r.id !== id)); setSel(null) }
  }
  // Hiding takes the post off the PUBLIC grid (this one). It reappears under /profile's
  // "Đã ẩn", which is also where "Hiện lại" lives — a hidden post is not a public row.
  const doHide = async (id: string) => {
    const res = await fetch(`/api/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: true }) })
    if (!res.ok) return
    setPosts(prev => prev.filter(r => r.id !== id))
    setSel(null)
  }

  const firstName = profile?.full_name?.split(' ').pop() || t('reviews.me')
  const handle = '@' + (profile?.full_name?.replace(/\s+/g, '').toLowerCase() || 'user')

  // Tapping any grid tile opens the swipeable clip viewer at that clip — same
  // feed UX (swipe, tap-pause, double-tap like, comment/save/share) instead of
  // a dead-end single detail page.
  const handleGridClick = (r: Review) => {
    const idx = posts.findIndex(p => p.id === r.id)
    if (idx >= 0) setViewerStart(idx)
  }

  return (
    <div className="h-dvh overflow-y-auto bg-black pb-16" style={{ scrollbarWidth: 'none' }}>
      {/* ONE content container for the whole page variant: hero, tab bar and grid
          all share it, so nothing on /users/[id] is full-bleed while its
          neighbour is centred (that mismatch is what put a 729px block of the
          grid's hairline background beside 3 clips at 1456w). On phones the
          container is wider than the screen, so mobile renders exactly as
          before. The tab variant gets `contents` — invisible to layout, its
          448px wrapper in /reviews stays in charge. Fixed overlays (action
          sheet, ClipViewer) position against the viewport, not this box. */}
      <div className={isPage ? 'max-w-container-content mx-auto w-full' : 'contents'}>
      {/* Gradient header. Layout comes from the ROUTE (variant), never from who
          is looking: /users/[id] is one page with one shape for everyone. The
          compact horizontal hero hands the viewport to the grid, because on a
          profile page the clips are the content. */}
      <div style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, #0d0618 60%, #000 100%)' }}
        className={`relative px-4 flex ${isPage ? 'flex-row items-center gap-4 pt-5 pb-3' : 'flex-col items-center pt-14 pb-4'}`}>
        {/* Back button — only when this profile is its own stacked route
            (/users/[id]), not when it's the bottom-nav "Hồ sơ" tab. Same visual
            treatment as ClipViewer's back button, for consistency. */}
        {/* In the horizontal page hero the back button is the first item of the
            row (it must not overlap the avatar on the left); in the centred tab
            hero it floats over the gradient as it always has. */}
        {showBackButton && (
          <button onClick={onBack} aria-label={t('common.back')}
            className={`w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform ${isPage ? 'shrink-0 -ml-1' : 'absolute top-4 left-4 z-10'}`}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div className={`relative shrink-0 ${isPage ? '' : 'mb-3'}`}>
          {profile?.avatar_url
            ? <Image src={profile.avatar_url} alt={firstName} width={96} height={96} className={`rounded-full object-cover ring-2 ring-purple-500/40 ${isPage ? 'w-[72px] h-[72px]' : 'w-24 h-24'}`} />
            : <div className={`rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold ring-2 ring-purple-500/40 ${isPage ? 'w-[72px] h-[72px] text-2xl' : 'w-24 h-24 text-3xl'}`}>{firstName[0]?.toUpperCase()}</div>}
          {isOwnProfile && (
            <Link href="/reviews/new" className="absolute bottom-0 right-0 w-6 h-6 bg-[#fe2c55] rounded-full flex items-center justify-center border-2 border-black">
              <Plus size={13} className="text-white" strokeWidth={3} />
            </Link>
          )}
        </div>
        {/* On the page layout this is the right-hand column of the horizontal
            hero; on the tab layout `contents` makes the wrapper invisible so the
            classic centred column renders exactly as it always has. */}
        <div className={isPage ? 'flex-1 min-w-0 flex flex-col items-start gap-1' : 'contents'}>
        <h2 className="text-white font-bold text-[17px] mb-0.5">{profile?.full_name || t('reviews.anonymous')}</h2>
        <p className={`text-gray-400 text-sm max-w-full truncate ${isPage ? '' : 'mb-4'}`}>{handle}</p>
        <div className={`flex ${isPage ? 'gap-5' : 'gap-10 mb-4'}`}>
          <div className="text-center">
            <div className="text-white font-bold text-base">{profile?.following_count ?? 0}</div>
            <div className="text-gray-400 text-xs">{t('reviews.statFollowing')}</div>
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-base">{profile?.follower_count ?? 0}</div>
            <div className="text-gray-400 text-xs">{t('reviews.statFollowers')}</div>
          </div>
          <div className="text-center">
            <div className="text-white font-bold text-base">{posts.length}</div>
            <div className="text-gray-400 text-xs">{t('reviews.statPosts')}</div>
          </div>
        </div>
        {/* WHICH button exists is a permission (owner edits, visitor follows);
            HOW it is shaped is the layout (compact pill on the page, full-width
            on the tab). The two axes never mix. */}
        {isOwnProfile ? (
          <Link href="/profile" className={`${isPage ? 'mt-1 px-6 py-1.5' : 'w-full py-2'} bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold rounded-md text-center transition-colors`}>
            {t('reviews.editProfile')}
          </Link>
        ) : (
          <button onClick={handleFollow} disabled={followBusy}
            className={`${isPage ? 'mt-1 px-6 py-1.5' : 'w-full py-2'} rounded-md text-sm font-semibold transition-colors disabled:opacity-60 ${
              following ? 'bg-white/10 hover:bg-white/15 border border-white/20 text-white' : 'bg-[#fe2c55] hover:bg-[#ef2950] text-white'
            }`}>
            {followBusy ? <Loader2 size={15} className="animate-spin mx-auto" /> : following ? t('reviews.following') : t('reviews.follow')}
          </button>
        )}
        </div>
      </div>

      {/* Tappy memory chip — only on your own profile; it is a private preference
          summary, not something to surface on someone else's profile. */}
      {isOwnProfile && prefs && prefs.preferred_style && prefs.preferred_style.length > 0 && (
        <div className="mx-4 mt-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.18)' }}>
          <p className="text-[11px] font-semibold mb-2.5" style={{ color: '#ff6b35' }}>{t('reviews.yourPreferences')}</p>
          <div className="flex flex-wrap gap-1.5">
            {prefs.preferred_style.map((s: string) => (
              <span key={s} className="text-[11px] px-2.5 py-1 rounded-full font-semibold"
                style={{ background: 'rgba(255,107,53,0.18)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)' }}>
                {s}
              </span>
            ))}
          </div>
          {(prefs.budget_min !== null || prefs.budget_max !== null) && (
            <p className="text-xs mt-2" style={{ color: '#9ca3af' }}>
              💰 {[prefs.budget_min, prefs.budget_max].filter(v => v !== null).map(n => `${n?.toLocaleString()}k`).join(' – ')} VND
            </p>
          )}
        </div>
      )}

      {/* No tab bar: a creator profile has one public dataset, the posts grid, and a bar
          carrying a single static label communicates nothing and costs the grid a row of
          viewport. The private collections are /profile's. The grid below is the content. */}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center pt-16"><Loader2 size={20} className="text-white animate-spin" /></div>
      ) : loadError ? (
        <div className="flex flex-col items-center py-16 text-gray-500 gap-2">
          <AlertCircle size={36} className="opacity-30" />
          <p className="text-sm">{t('reviews.profileLoadError')}</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-500">
          <Grid3X3 size={36} className="mb-3 opacity-30" />
          <p className="text-sm">{t('reviews.emptyPosts')}</p>
          {isOwnProfile && <Link href="/reviews/new" className="mt-4 bg-[#fe2c55] text-white px-5 py-2 rounded-full text-sm font-semibold">{t('reviews.emptyPostsCta')}</Link>}
        </div>
      ) : (
        /* The page grid scales its column count with the viewport — locked at 3
           columns it produced 485x862 tiles on a 1456px screen, under one row
           visible. The tab keeps the fixed 3-up it has always had. Same shape
           for owner and visitor alike; only the route decides. */
        /* Column count is sized to the shared container (max 768px), not the
           viewport: base 3 = phones (unchanged), sm:4 = 160-192px tiles once the
           container is at its cap. The md/lg steps died with full-bleed — inside
           768px, 5-6 columns would mean <154px tiles.
           Background: the gray hairline bg may only ever show through the 1px
           gaps; in any partial row (posts % columns != 0) it also floods the
           EMPTY cells. From sm up the container bg is black so empty cells read
           as page background; phones keep the gray hairlines untouched. */
        <div className={`grid gap-px ${isPage ? 'bg-gray-800 sm:bg-black grid-cols-3 sm:grid-cols-4' : 'bg-gray-800 grid-cols-3'}`}>
          {posts.map(r => {
            // Video posts have no photos[] — their poster frame lives in `thumbnail`.
            // Without this the tile fell through to the body-text placeholder, so a
            // profile of clips showed only captions instead of the video thumbnails.
            return (
              <button key={r.id} onClick={() => handleGridClick(r as Review)}
                className={`relative bg-gray-900 ${isPage ? 'aspect-[3/4]' : 'aspect-[9/16]'} ${sel?.id === r.id ? 'ring-2 ring-inset ring-[#fe2c55]' : ''}`}>
                {/* Shared poster: photo → thumbnail → platform placeholder. Never blank. */}
                <LinkPoster review={r} />
                {/* Overlay: place name + stars */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-1.5 pt-4 pb-1.5">
                  {!isShareOnlyName(r.place_name) && <p className="text-white text-[9px] font-semibold leading-tight line-clamp-1">{r.place_name}</p>}
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {'★'.repeat(r.rating).split('').map((_, i) => (
                      <span key={i} className="text-amber-400 text-[8px] leading-none">★</span>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
          {/* Option B: complete the last row so its empty slots don't expose the
              lighter container bg (gray-800) as a gray box, while KEEPING the 1px
              hairline separators. The filler must match the PAGE background — the
              profile scrolls on `bg-black` — NOT the tile colour (gray-900, which is
              lighter than black and so still read as a box). bg-black → fully blends. */}
          {Array.from({ length: trailingFillerCount(posts.length, 3) }).map((_, i) => (
            <div key={`filler-${i}`} aria-hidden
              className={`bg-black ${isPage ? 'aspect-[3/4]' : 'aspect-[9/16]'}`} />
          ))}
        </div>
      )}

      {/* Action sheet for my posts */}
      {sel && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setSel(null)} />
          <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-40 bg-[#1a1a1a] rounded-t-3xl px-5 pt-3 pb-8">
            <div className="flex justify-center mb-3"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
            <p className="text-white text-sm font-semibold text-center mb-3 line-clamp-1">{isShareOnlyName(sel.place_name) ? 'Bài chia sẻ' : sel.place_name}</p>
            <div className="space-y-2">
              {/* Returning to the profile tab after viewing the post is carried by
                  the ?tab=profile URL echo (transport) and the session's frozen
                  tab — the legacy sessionStorage side-channel (L11) is gone. The
                  page-root click capture freezes the session on this departure. */}
              <Link href={`/reviews/${sel.id}`} onClick={() => setSel(null)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                <Eye size={18} className="text-blue-400" /> {t('reviews.sheetViewPost')}
              </Link>
              <button onClick={() => doHide(sel.id)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                <EyeOff size={18} className="text-orange-400" /> {t('reviews.sheetHidePost')}
              </button>
              <button onClick={() => doDelete(sel.id)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-red-950/40 text-red-400 text-sm font-medium active:bg-red-950/60">
                <Trash2 size={18} /> {t('reviews.sheetDeletePost')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Swipeable clip viewer — opens on grid tap.
          me={viewerId}, NOT userId: userId is whose profile this is, viewerId is
          who is actually logged in. Passing userId would make every review's
          isMe check (me === r.user_id) trivially true for ANY visitor, since every
          review on this grid already belongs to userId — surfacing the delete/hide
          menu to people who do not own the post. */}
      {viewerStart !== null && (
        <ClipViewer posts={posts} startIndex={viewerStart} me={viewerId} onClose={() => setViewerStart(null)}
          onDelete={(id) => setPosts(p => p.filter(r => r.id !== id))} />
      )}
      </div>
    </div>
  )
}
