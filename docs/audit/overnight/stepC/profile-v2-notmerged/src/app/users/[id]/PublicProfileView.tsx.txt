'use client'

// The Explore PROFILE — one page, two modes, one identity.
//
// Reached from Explore: a creator's avatar or name on a clip, a person in the
// right column, a search hit. It renders inside the same `V3Shell` as the Explore
// stage (sidebar, bottom bar, footer untouched) with its own compact top bar in
// the shell's header slot, in Explore's forced-dark language.
//
// ONE USER. `profiles` is the single record behind Profile/Me, the edit form and
// this page; nothing is duplicated here. What differs is WHO IS LOOKING:
//
//   VISITOR  (viewerId !== userId)   public identity · public content · Follow
//   OWNER    (viewerId === userId)   the same public identity · Chỉnh sửa hồ sơ ·
//                                    Thay ảnh bìa · plus the PRIVATE activity tabs
//
// 🚨 WHAT IS PUBLIC HERE IS EXACTLY WHAT THE BACKEND ALREADY PUBLISHES.
//   · identity + counts   GET /api/users/[id]  (profiles: full_name, avatar_url, bio,
//                         cover_url, follower_count, following_count; review_count over
//                         publishable, non-hidden reviews; is_following; is_self)
//   · public content      GET /api/reviews/feed?userId=  (visitor: is_hidden=false AND
//                         the publication gate; the owner's held posts are dropped here
//                         so the owner sees the public list as others see it)
//   · follow              POST /api/users/[id]/follow (existing; anonymous → login)
//   · cover               POST /api/profile (`cover`) · PATCH /api/profile {cover_url:null}
//
// PRIVATE, OWNER-ONLY, LOADED ONLY WHEN THE OWNER OPENS THE TAB (`ownerCollections`):
//   · Đã thích — `review_likes` of the signed-in owner (SELECT-own by RLS since 20260915b)
//   · Đã lưu   — `review_saves`, SELECT-own by RLS
//   · Đã ẩn    — `/api/reviews/mine`, the self-scoped route; the feed never serves them
// A visitor gets no tab for these — not an empty one, none — and this page never
// requests them for a visitor. Hiding a tab is presentation; the policies and the
// self-scoped routes are what keep the data private.
//
// "Chia sẻ" IS public: a share-only post (no place — a YouTube/link/video share) is
// a review row the user published, with the sentinel place name the feed already
// recognises (`isShareOnlyName`). It is the user's shared content, not a history
// log of share actions — none exists.
//
// Nothing is invented: no @handle (nothing writes `profiles.username`), no location,
// no badge, no points. Bio and cover render only when the row carries them.

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, Grid3X3, Share2, Heart, Bookmark, EyeOff, Eye, Loader2, AlertCircle, UserPlus, Check, Pencil,
  ImagePlus, Trash2, Bell, UserRound, Lock,
} from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import { useNotifications } from '@/components/NotificationProvider'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { createClient } from '@/lib/supabase/client'
import LinkPoster from '@/components/LinkPoster'
import { ClipViewer } from '@/app/reviews/ProfileTab'
import { isShareOnlyName, type Review } from '@/app/reviews/feedShared'
import { rejectCoverFile, uploadCover, removeCover } from '@/lib/profile/cover'
import { loadLiked, loadSaved, loadHidden } from './ownerCollections'

type PublicTab = 'posts' | 'shares'
type PrivateTab = 'liked' | 'saved' | 'hidden'
type Tab = PublicTab | PrivateTab

const PRIVATE_TABS: readonly PrivateTab[] = ['liked', 'saved', 'hidden']
const OWNER_TAB_ORDER: readonly Tab[] = ['posts', 'liked', 'saved', 'hidden', 'shares']
const VISITOR_TAB_ORDER: readonly Tab[] = ['posts', 'shares']

interface PublicProfile {
  full_name: string | null
  avatar_url: string | null
  follower_count: number
  following_count: number
  review_count: number
  is_following?: boolean
  is_self?: boolean
  /** Present only when the profile row can carry them (post-migration). */
  bio?: string | null
  cover_url?: string | null
}

type Collection = { status: 'idle' | 'loading' | 'ready' | 'error'; rows: Review[] }
const IDLE: Collection = { status: 'idle', rows: [] }

export interface Viewer { id: string; avatarUrl: string | null }

export default function PublicProfileView({ userId, viewer, onBack }: { userId: string; viewer: Viewer | null; onBack: () => void }) {
  const { t, locale } = useTranslation()
  const { unreadCount } = useNotifications()
  const viewerId = viewer?.id ?? null
  const isOwn = viewerId === userId
  const supabase = useMemo(() => createClient(), [])

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('posts')
  const [collections, setCollections] = useState<Record<PrivateTab, Collection>>({ liked: IDLE, saved: IDLE, hidden: IDLE })
  const [viewerStart, setViewerStart] = useState<number | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  // ── Public data: identity + the public content list ─────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const [p, feed] = await Promise.all([
          fetch(`/api/users/${userId}`).then(r => { if (!r.ok) throw new Error('profile_failed'); return r.json() as Promise<PublicProfile> }),
          fetch(`/api/reviews/feed?userId=${userId}&limit=50&lang=${encodeURIComponent(locale)}`).then(r => { if (!r.ok) throw new Error('feed_failed'); return r.json() }),
        ])
        if (cancelled) return
        setProfile(p)
        setFollowing(!!p.is_following)
        // The owner's own request also returns posts the safety gate is still holding
        // (`publication_state` present and not published). "Bài đăng" is the PUBLIC list,
        // so those rows are dropped rather than rendered as if they were public.
        const rows = ((feed.reviews || []) as Array<Review & { publication_state?: string | null }>)
          .filter(r => !r.publication_state || r.publication_state === 'PUBLISHED')
          .map(r => ({ ...r, is_hidden: false, liked_by_me: r.liked_by_me ?? false, saved_by_me: r.saved_by_me ?? false }))
        setReviews(rows)
        // Open on the section that has something to show: a member whose whole
        // contribution is shared links should not land on an empty "Bài đăng".
        if (!rows.some(r => !isShareOnlyName(r.place_name)) && rows.some(r => isShareOnlyName(r.place_name))) setTab('shares')
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId, locale])

  // ── Private collections: on demand, owner only ───────────────────────────
  const loadCollection = useCallback(async (which: PrivateTab) => {
    if (!isOwn || !viewerId) return
    setCollections(c => ({ ...c, [which]: { ...c[which], status: 'loading' } }))
    try {
      const rows = which === 'liked' ? await loadLiked(supabase, viewerId)
        : which === 'saved' ? await loadSaved(supabase, viewerId)
        : await loadHidden(locale)
      setCollections(c => ({ ...c, [which]: { status: 'ready', rows } }))
    } catch {
      setCollections(c => ({ ...c, [which]: { status: 'error', rows: [] } }))
    }
  }, [isOwn, viewerId, supabase, locale])

  useEffect(() => {
    if (!isPrivate(tab)) return
    if (collections[tab].status === 'idle') void loadCollection(tab)
  }, [tab, collections, loadCollection])

  const posts = useMemo(() => reviews.filter(r => !isShareOnlyName(r.place_name)), [reviews])
  const shares = useMemo(() => reviews.filter(r => isShareOnlyName(r.place_name)), [reviews])
  const shown: Review[] = tab === 'posts' ? posts : tab === 'shares' ? shares : collections[tab].rows
  const tabs = isOwn ? OWNER_TAB_ORDER : VISITOR_TAB_ORDER

  // ── Follow: the existing endpoint, the existing anonymous → login rule ───
  const handleFollow = async () => {
    if (isOwn || followBusy) return
    if (!viewerId) { window.location.href = '/login?returnTo=' + encodeURIComponent(`/users/${userId}`); return }
    setFollowBusy(true)
    const next = !following
    setFollowing(next)
    setProfile(p => p ? { ...p, follower_count: Math.max(0, p.follower_count + (next ? 1 : -1)) } : p)
    try {
      const res = await fetch(`/api/users/${userId}/follow`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      // The server's own line: no account behind this session → sign in, then come back here.
      if (res.status === 401 || res.status === 403) { window.location.href = '/login?returnTo=' + encodeURIComponent(`/users/${userId}`); return }
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

  // ── Cover: owner only, through the one shared client path ───────────────
  const coverSupported = !!profile && profile.cover_url !== undefined
  const onCoverPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isOwn) return
    const rejection = rejectCoverFile(file)
    if (rejection) { setCoverError(t(rejection === 'tooLarge' ? 'v3.publicProfile.coverErrTooLarge' : 'v3.publicProfile.coverErrNotImage')); return }
    setCoverBusy(true)
    setCoverError(null)
    try {
      const url = await uploadCover(file)
      setProfile(p => p ? { ...p, cover_url: url } : p)
    } catch (err) {
      setCoverError(err instanceof Error && err.message ? err.message : t('v3.publicProfile.coverErrUpload'))
    } finally {
      setCoverBusy(false)
    }
  }
  const onCoverRemove = async () => {
    if (!isOwn || coverBusy) return
    setCoverBusy(true)
    setCoverError(null)
    try {
      await removeCover()
      setProfile(p => p ? { ...p, cover_url: null } : p)
    } catch (err) {
      setCoverError(err instanceof Error && err.message ? err.message : t('v3.publicProfile.coverErrUpload'))
    } finally {
      setCoverBusy(false)
    }
  }

  // ── Owner item actions: hide / show, the existing PATCH; delete via the viewer ─
  const setHidden = async (r: Review, hide: boolean, e: MouseEvent) => {
    e.stopPropagation()
    if (!isOwn) return
    // Optimistic move between the public list and the hidden collection; put back on failure.
    const moveOut = () => {
      if (hide) {
        setReviews(p => p.filter(x => x.id !== r.id))
        setCollections(c => ({ ...c, hidden: { status: 'ready', rows: [{ ...r, is_hidden: true } as Review, ...c.hidden.rows.filter(x => x.id !== r.id)] } }))
      } else {
        setCollections(c => ({ ...c, hidden: { ...c.hidden, rows: c.hidden.rows.filter(x => x.id !== r.id) } }))
        setReviews(p => [{ ...r, is_hidden: false } as Review, ...p.filter(x => x.id !== r.id)])
      }
    }
    const moveBack = () => {
      if (hide) {
        setCollections(c => ({ ...c, hidden: { ...c.hidden, rows: c.hidden.rows.filter(x => x.id !== r.id) } }))
        setReviews(p => [r, ...p.filter(x => x.id !== r.id)])
      } else {
        setReviews(p => p.filter(x => x.id !== r.id))
        setCollections(c => ({ ...c, hidden: { ...c.hidden, rows: [r, ...c.hidden.rows.filter(x => x.id !== r.id)] } }))
      }
    }
    moveOut()
    try {
      const res = await fetch(`/api/reviews/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: hide }) })
      // `fetch` resolves on 4xx/5xx — the status is the verdict.
      if (!res.ok) moveBack()
    } catch {
      moveBack()
    }
  }
  const onDeleted = (id: string) => {
    setReviews(p => p.filter(x => x.id !== id))
    setCollections(c => ({
      liked: { ...c.liked, rows: c.liked.rows.filter(x => x.id !== id) },
      saved: { ...c.saved, rows: c.saved.rows.filter(x => x.id !== id) },
      hidden: { ...c.hidden, rows: c.hidden.rows.filter(x => x.id !== id) },
    }))
  }

  const name = profile?.full_name || t('reviews.anonymous')
  const initial = (profile?.full_name || '?').trim().charAt(0).toUpperCase()
  const coverUrl = profile?.cover_url || null

  const navLinks = [
    { href: '/reviews', key: 'v3.explore.navExplore', current: true },
    { href: '/chat', key: 'v3.explore.navAsk', current: false },
    { href: '/planner', key: 'v3.explore.navPlan', current: false },
    { href: '/music', key: 'v3.explore.navMusic', current: false },
  ]

  // ── Compact top bar in the shell's header slot: the same bar vocabulary as the
  //    Explore stage (`.v3-xp-bar`), minus the feed search — this page has no feed. ──
  const topBar = (
    <header className="v3-xp-bar v3-pp-bar" data-pp-bar>
      <div className="flex min-w-0 items-center gap-1.5">
        <button type="button" onClick={onBack} className="v3-xp-tool" aria-label={t('common.back')} data-pp-back>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        {/* The wordmark only where the shell's sidebar — which carries the brand — is hidden. */}
        <Link href="/" className="v3-xp-logo lg:hidden" aria-label="TappyAI">Tappy</Link>
      </div>
      <nav className="v3-xp-nav" aria-label={t('v3.explore.title')}>
        {navLinks.map(l => (
          <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined}>{t(l.key)}</Link>
        ))}
      </nav>
      <div className="v3-xp-tools">
        <Link href="/profile/notifications" className="v3-xp-tool" aria-label={t('v3.explore.navInbox')}>
          <Bell size={20} aria-hidden="true" />
          {unreadCount > 0 && <span className="v3-xp-badge" aria-hidden="true" />}
        </Link>
        {viewer
          ? <Link href="/profile" aria-label={t('v3.explore.navProfile')} className="ml-1">
              {viewer.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element -- the session's own avatar URL, any host
                ? <img src={viewer.avatarUrl} alt="" className="v3-xp-avatar" />
                : <span className="v3-xp-avatar-empty"><UserRound size={18} aria-hidden="true" /></span>}
            </Link>
          : <Link href={`/login?returnTo=${encodeURIComponent(`/users/${userId}`)}`} aria-label={t('v3.explore.signIn')} className="ml-1">
              <span className="v3-xp-avatar-empty"><UserRound size={18} aria-hidden="true" /></span>
            </Link>}
      </div>
    </header>
  )

  const tabLabel = (k: Tab) => t(
    k === 'posts' ? 'v3.publicProfile.tabPosts' : k === 'shares' ? 'v3.publicProfile.tabShares'
      : k === 'liked' ? 'v3.publicProfile.tabLiked' : k === 'saved' ? 'v3.publicProfile.tabSaved' : 'v3.publicProfile.tabHidden')
  const TabIcon = ({ k, size }: { k: Tab; size: number }) =>
    k === 'posts' ? <Grid3X3 size={size} aria-hidden="true" /> : k === 'shares' ? <Share2 size={size} aria-hidden="true" />
      : k === 'liked' ? <Heart size={size} aria-hidden="true" /> : k === 'saved' ? <Bookmark size={size} aria-hidden="true" />
      : <EyeOff size={size} aria-hidden="true" />
  // A count is shown only when it is known: public sections immediately, a private one
  // once it has loaded. Never a 0 standing in for "not fetched yet".
  const tabCount = (k: Tab): number | null =>
    k === 'posts' ? posts.length : k === 'shares' ? shares.length : collections[k].status === 'ready' ? collections[k].rows.length : null
  const emptyKey = (k: Tab) =>
    k === 'posts' ? 'v3.publicProfile.emptyPosts' : k === 'shares' ? 'v3.publicProfile.emptyShares'
      : k === 'liked' ? 'v3.publicProfile.emptyLiked' : k === 'saved' ? 'v3.publicProfile.emptySaved' : 'v3.publicProfile.emptyHidden'

  const section = isPrivate(tab) ? collections[tab] : null

  return (
    <V3Shell title={t('v3.publicProfile.title')} activeTab="/reviews" header={topBar} flush>
      {/* Always the dark media treatment — the surface this page continues is the Explore stage. */}
      <div className="v3-theme dark v3-pp" data-public-profile data-mode={isOwn ? 'owner' : 'visitor'}>
        {loading ? (
          <div className="flex justify-center pt-24"><Loader2 size={22} className="animate-spin text-white/70" /></div>
        ) : loadError || !profile ? (
          <div className="flex flex-col items-center gap-2 py-24 text-white/60">
            <AlertCircle size={34} className="opacity-40" />
            <p className="text-sm">{t('reviews.profileLoadError')}</p>
          </div>
        ) : (
          <>
            {/* ── Cover: the user's own image, or the stage gradient. Owner: change / remove. ── */}
            <section className="v3-pp-cover" data-pp-cover data-has-cover={coverUrl ? 'true' : 'false'} aria-label={coverUrl ? t('v3.publicProfile.coverAlt') : undefined}>
              {coverUrl && (
                <Image src={coverUrl} alt="" fill priority sizes="100vw" className="object-cover" data-pp-cover-img />
              )}
              <span className="v3-pp-cover-scrim" aria-hidden="true" />
              {coverBusy && (
                <span className="v3-pp-cover-busy" role="status">
                  <Loader2 size={22} className="animate-spin" aria-hidden="true" />
                  <span>{t('v3.publicProfile.coverUploading')}</span>
                </span>
              )}
              {isOwn && coverSupported && (
                <div className="v3-pp-cover-actions">
                  <button type="button" onClick={() => coverInput.current?.click()} disabled={coverBusy} className="v3-pp-cover-btn" data-pp-cover-change>
                    <ImagePlus size={15} aria-hidden="true" /><span>{t('v3.publicProfile.coverChange')}</span>
                  </button>
                  {coverUrl && (
                    <button type="button" onClick={onCoverRemove} disabled={coverBusy} className="v3-pp-cover-btn" aria-label={t('v3.publicProfile.coverRemove')} title={t('v3.publicProfile.coverRemove')} data-pp-cover-remove>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                  <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={onCoverPick} data-pp-cover-input />
                </div>
              )}
            </section>

            <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
              {coverError && (
                <p className="v3-pp-cover-error" role="alert" data-pp-cover-error>{coverError}</p>
              )}

              {/* ── Identity: overlaps the cover. Real fields only. ── */}
              <section className="v3-pp-identity" aria-labelledby="pp-name" data-pp-identity>
                <div className="v3-pp-avatar" aria-hidden={!profile.avatar_url}>
                  {profile.avatar_url
                    ? <Image src={profile.avatar_url} alt={name} width={96} height={96} className="h-full w-full object-cover" />
                    : <span className="v3-pp-avatar-initial">{initial}</span>}
                </div>
                <div className="v3-pp-text min-w-0">
                  <h2 id="pp-name" className="truncate text-[20px] font-bold leading-tight text-white sm:text-[24px]">{name}</h2>
                  {profile.bio && <p className="v3-pp-bio" data-pp-bio>{profile.bio}</p>}
                </div>
                <dl className="v3-pp-stats" data-pp-stats>
                  <div><dt>{t('v3.publicProfile.posts')}</dt><dd>{posts.length + shares.length}</dd></div>
                  <div><dt>{t('v3.publicProfile.followers')}</dt><dd>{profile.follower_count ?? 0}</dd></div>
                  <div><dt>{t('v3.publicProfile.following')}</dt><dd>{profile.following_count ?? 0}</dd></div>
                </dl>
                <div className="v3-pp-action">
                  {isOwn ? (
                    <Link href="/profile/edit" className="v3-pp-btn" data-pp-edit>
                      <Pencil size={15} aria-hidden="true" />{t('v3.publicProfile.edit')}
                    </Link>
                  ) : (
                    <button type="button" onClick={handleFollow} disabled={followBusy} className="v3-pp-btn" data-on={following ? 'true' : 'false'} data-pp-follow aria-pressed={following}>
                      {followBusy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : following ? <Check size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                      {following ? t('reviews.following') : t('reviews.follow')}
                    </button>
                  )}
                </div>
              </section>

              {/* ── Sections: public for everyone; the owner also gets their private activity. ── */}
              <nav className="v3-pp-tabs" aria-label={t('v3.publicProfile.contentAria')} data-pp-tabs>
                {tabs.map(k => {
                  const n = tabCount(k)
                  return (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setViewerStart(null) }} className="v3-pp-tab" data-pp-tab={k} data-private={isPrivate(k) ? 'true' : undefined}>
                      <TabIcon k={k} size={16} />{tabLabel(k)}
                      {n !== null && <span className="v3-pp-tab-n">{n}</span>}
                    </button>
                  )
                })}
              </nav>

              {section && <p className="v3-pp-private-note" data-pp-private-note><Lock size={12} aria-hidden="true" />{t('v3.publicProfile.privateNote')}</p>}

              {section && (section.status === 'loading' || section.status === 'idle') ? (
                <div className="flex justify-center py-16" data-pp-section-loading><Loader2 size={22} className="animate-spin text-white/70" /></div>
              ) : section && section.status === 'error' ? (
                <div className="v3-pp-empty" data-pp-section-error>
                  <AlertCircle size={30} aria-hidden="true" />
                  <p>{t('v3.publicProfile.tabError')}</p>
                  <button type="button" className="v3-pp-cover-btn" onClick={() => void loadCollection(tab as PrivateTab)} data-pp-section-retry>{t('v3.publicProfile.retry')}</button>
                </div>
              ) : shown.length === 0 ? (
                <div className="v3-pp-empty" data-pp-empty={tab}>
                  <TabIcon k={tab} size={30} />
                  <p>{t(emptyKey(tab))}</p>
                </div>
              ) : (
                <div className="v3-pp-grid" data-pp-grid>
                  {shown.map(r => {
                    const canToggleHide = isOwn && r.user_id === viewerId && (tab === 'posts' || tab === 'hidden')
                    return (
                      <div key={r.id} className="v3-pp-tile" data-pp-tile>
                        <button type="button" onClick={() => setViewerStart(shown.findIndex(p => p.id === r.id))} className="v3-pp-tile-open" aria-label={isShareOnlyName(r.place_name) ? t('v3.publicProfile.tabShares') : r.place_name}>
                          {/* Shared poster: photo → thumbnail → platform placeholder. Never blank, never invented. */}
                          <LinkPoster review={r} />
                          <span className="v3-pp-tile-scrim" aria-hidden="true" />
                          <span className="v3-pp-tile-meta">
                            {!isShareOnlyName(r.place_name) && <span className="v3-pp-tile-name">{r.place_name}</span>}
                            {r.rating > 0 && <span className="v3-pp-tile-stars">{'★'.repeat(Math.min(5, r.rating))}</span>}
                          </span>
                        </button>
                        {canToggleHide && (
                          <button type="button" onClick={e => void setHidden(r, tab === 'posts', e)} className="v3-pp-tile-act"
                            aria-label={tab === 'posts' ? t('v3.publicProfile.hidePost') : t('v3.publicProfile.showPost')}
                            title={tab === 'posts' ? t('v3.publicProfile.hidePost') : t('v3.publicProfile.showPost')} data-pp-hide-toggle={tab === 'posts' ? 'hide' : 'show'}>
                            {tab === 'posts' ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* The same swipeable clip viewer Explore and the owner tab use — one clip UX.
            me={viewerId}: who is logged in, not whose profile this is, so a visitor never
            sees the owner's delete/hide menu. */}
        {viewerStart !== null && (
          <ClipViewer posts={shown} startIndex={viewerStart} me={viewerId} onClose={() => setViewerStart(null)} onDelete={isOwn ? onDeleted : undefined} />
        )}
      </div>
    </V3Shell>
  )
}

function isPrivate(k: Tab): k is PrivateTab {
  return (PRIVATE_TABS as readonly string[]).includes(k)
}
