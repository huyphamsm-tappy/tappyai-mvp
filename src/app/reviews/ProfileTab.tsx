'use client'

// The TikTok-style Profile tab + its swipeable clip viewer, extracted verbatim from
// page.tsx: the profile-grid delete-reflow regression test imports ProfileTab, and
// Next.js forbids extra named exports from a page file.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Heart, Bookmark, ChevronLeft, ChevronUp, ChevronDown,
  Trash2, EyeOff, Eye, Loader2, Plus, Grid3X3, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getUserPreferences } from '@/lib/userMemory'
import type { UserPreferences } from '@/lib/userMemory'
import SoundSheet from './SoundSheet'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Post, CommentDrawer, ShareModal, isShareOnlyName, type Review } from './feedShared'

/* ─── Swipeable clip viewer — opens from the profile grid with the SAME UX as
   the main feed: swipe/arrow between clips, single-tap pause, double-tap like,
   like/comment/save/share, own-post delete/hide. Reuses Post/CommentDrawer/ShareModal. */
function ClipViewer({ posts, startIndex, me, onClose, onDelete }: { posts: Review[]; startIndex: number; me: string | null; onClose: () => void; onDelete?: (id: string) => void }) {
  const [items, setItems] = useState<Review[]>(posts)
  const [activeIndex, setActiveIndex] = useState(startIndex)
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [soundTrackId, setSoundTrackId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Jump straight to the tapped clip on open.
  useEffect(() => {
    const c = containerRef.current
    if (c) c.scrollTo({ top: startIndex * c.clientHeight, behavior: 'auto' })
  }, [startIndex])

  const requireLogin = () => { if (me) return false; window.location.href = '/login?returnTo=/reviews'; return true }

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
              onComment={setCommentOf} onShare={setShareOf} onDelete={del} onSoundTap={setSoundTrackId} />
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
      {soundTrackId && <SoundSheet trackId={soundTrackId} onClose={() => setSoundTrackId(null)} />}
    </div>
  )
}

/* ─── Profile Tab (TikTok style) ───
   Shared between viewing your OWN profile (reviews?tab=profile, viewerId===userId)
   and viewing ANOTHER user's profile (/users/[id]) — same grid, same swipeable
   viewer, same everything, so the two experiences can never drift apart again. */
// Exported for the profile-grid delete-reflow regression test (profileGridDelete.test.tsx).
export function ProfileTab({ userId, viewerId, showBackButton, onBack }: { userId: string; viewerId: string | null; showBackButton?: boolean; onBack?: () => void }) {
  const { t } = useTranslation()
  const isOwnProfile = viewerId === userId
  const [profile, setProfile] = useState<{
    full_name: string | null; avatar_url: string | null
    follower_count: number; following_count: number; review_count: number
  } | null>(null)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [posts, setPosts] = useState<Review[]>([])
  const [hidden, setHidden] = useState<Review[]>([])
  const [likedPosts, setLikedPosts] = useState<Review[]>([])
  const [savedPosts, setSavedPosts] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'liked'>('posts')
  const [sel, setSel] = useState<Review | null>(null)
  const [viewerStart, setViewerStart] = useState<number | null>(null) // index into displayPosts when the swipe viewer is open
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const [profileRes, reviewsRes, likedRes, savedRes, prefsRes] = await Promise.all([
          fetch(`/api/users/${userId}`).then(r => { if (!r.ok) throw new Error('profile_failed'); return r.json() }),
          fetch(`/api/reviews/feed?userId=${userId}&limit=50`).then(r => { if (!r.ok) throw new Error('feed_failed'); return r.json() }),
          // Hidden posts, saved and liked are fetched ONLY for your own profile.
          // On someone else's profile they are not merely hidden from the UI —
          // they are never requested, so a misconfigured RLS policy cannot leak
          // another user's private lists to a visitor.
          isOwnProfile
            ? supabase.from('review_likes').select('review_id').eq('user_id', userId).then(r => { if (r.error) throw r.error; return r.data || [] })
            : Promise.resolve([]),
          isOwnProfile
            ? supabase.from('review_saves').select('review_id').eq('user_id', userId).then(r => { if (r.error) throw r.error; return r.data || [] })
            : Promise.resolve([]),
          isOwnProfile ? getUserPreferences(userId) : Promise.resolve(null),
        ])
        setProfile(profileRes)
        setFollowing(!!profileRes.is_following)
        setPrefs(prefsRes)
        const allPosts = (reviewsRes.reviews || []).map((r: Review) => ({ ...r, is_hidden: false }))
        setPosts(allPosts)
        if (isOwnProfile) {
          const { data: hiddenData, error: hiddenError } = await supabase.from('reviews').select('id,place_name,body,photos,rating,is_hidden,like_count,comment_count,created_at,content_type,media_url,thumbnail,source_type,source_url').eq('user_id', userId).eq('is_hidden', true).order('created_at', { ascending: false })
          if (hiddenError) throw hiddenError
          setHidden((hiddenData || []).map((r: any) => ({ ...r } as Review)))
        }
        if (likedRes.length > 0) {
          const likedIds = (likedRes as { review_id: string }[]).map(l => l.review_id)
          const { data: likedData, error: likedError } = await supabase.from('reviews').select('id,user_id,place_name,place_address,rating,body,photos,is_verified,like_count,comment_count,created_at,content_type,media_url,thumbnail,source_type,source_url').in('id', likedIds).or('is_hidden.is.null,is_hidden.eq.false').order('created_at', { ascending: false }).limit(30)
          if (likedError) throw likedError
          setLikedPosts((likedData || []).map((r: any) => ({ ...r, liked_by_me: true, saved_by_me: false })))
        }
        if (savedRes.length > 0) {
          const savedIds = (savedRes as { review_id: string }[]).map(s => s.review_id)
          const { data: savedData, error: savedError } = await supabase.from('reviews').select('id,user_id,place_name,place_address,rating,body,photos,is_verified,like_count,comment_count,created_at,content_type,media_url,thumbnail,source_type,source_url').in('id', savedIds).or('is_hidden.is.null,is_hidden.eq.false').order('created_at', { ascending: false }).limit(30)
          if (savedError) throw savedError
          setSavedPosts((savedData || []).map((r: any) => ({ ...r, liked_by_me: false, saved_by_me: true })))
        }
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isOwnProfile, supabase])

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
    if (res.ok) { setPosts(p => p.filter(r => r.id !== id)); setHidden(h => h.filter(r => r.id !== id)); setSel(null) }
  }
  const doHide = async (id: string, hide: boolean) => {
    const res = await fetch(`/api/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: hide }) })
    if (!res.ok) return
    if (hide) { const p = posts.find(r => r.id === id); if (p) { setPosts(prev => prev.filter(r => r.id !== id)); setHidden(prev => [{ ...p, is_hidden: true } as Review, ...prev]) } }
    else { const h = hidden.find(r => r.id === id); if (h) { setHidden(prev => prev.filter(r => r.id !== id)); setPosts(prev => [{ ...h, is_hidden: false } as Review, ...prev]) } }
    setSel(null)
  }

  const firstName = profile?.full_name?.split(' ').pop() || t('reviews.me')
  const handle = '@' + (profile?.full_name?.replace(/\s+/g, '').toLowerCase() || 'user')
  const allMyPosts = [...posts, ...hidden].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as (Review & { is_hidden?: boolean })[]
  const displayPosts = activeTab === 'posts' ? allMyPosts : activeTab === 'saved' ? savedPosts : likedPosts

  // Tapping any grid tile opens the swipeable clip viewer at that clip — same
  // feed UX (swipe, tap-pause, double-tap like, comment/save/share) instead of
  // a dead-end single detail page.
  const handleGridClick = (r: Review) => {
    const idx = displayPosts.findIndex(p => p.id === r.id)
    if (idx >= 0) setViewerStart(idx)
  }

  const emptyState = {
    posts: { icon: <Grid3X3 size={36} className="mb-3 opacity-30" />, text: t('reviews.emptyPosts'), cta: <Link href="/reviews/new" className="mt-4 bg-[#fe2c55] text-white px-5 py-2 rounded-full text-sm font-semibold">{t('reviews.emptyPostsCta')}</Link> },
    saved: { icon: <Bookmark size={36} className="mb-3 opacity-30" />, text: t('reviews.emptySaved'), cta: null },
    liked: { icon: <Heart size={36} className="mb-3 opacity-30" />, text: t('reviews.emptyLiked'), cta: null },
  }

  return (
    <div className="h-dvh overflow-y-auto bg-black pb-16" style={{ scrollbarWidth: 'none' }}>
      {/* Gradient header */}
      <div style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, #0d0618 60%, #000 100%)' }} className="relative pt-14 pb-4 px-4 flex flex-col items-center">
        {/* Back button — only when this profile is its own stacked route
            (/users/[id]), not when it's the bottom-nav "Hồ sơ" tab. Same visual
            treatment as ClipViewer's back button, for consistency. */}
        {showBackButton && (
          <button onClick={onBack} aria-label={t('common.back')}
            className="absolute top-4 left-4 z-10 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="relative mb-3">
          {profile?.avatar_url
            ? <Image src={profile.avatar_url} alt={firstName} width={96} height={96} className="w-24 h-24 rounded-full object-cover ring-2 ring-purple-500/40" />
            : <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-2 ring-purple-500/40">{firstName[0]?.toUpperCase()}</div>}
          {isOwnProfile && (
            <Link href="/reviews/new" className="absolute bottom-0 right-0 w-6 h-6 bg-[#fe2c55] rounded-full flex items-center justify-center border-2 border-black">
              <Plus size={13} className="text-white" strokeWidth={3} />
            </Link>
          )}
        </div>
        <h2 className="text-white font-bold text-[17px] mb-0.5">{profile?.full_name || t('reviews.anonymous')}</h2>
        <p className="text-gray-400 text-sm mb-4 max-w-full truncate">{handle}</p>
        <div className="flex gap-10 mb-4">
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
        {isOwnProfile ? (
          <Link href="/profile" className="w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold py-2 rounded-md text-center transition-colors">
            {t('reviews.editProfile')}
          </Link>
        ) : (
          <button onClick={handleFollow} disabled={followBusy}
            className={`w-full py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60 ${
              following ? 'bg-white/10 hover:bg-white/15 border border-white/20 text-white' : 'bg-[#fe2c55] hover:bg-[#ef2950] text-white'
            }`}>
            {followBusy ? <Loader2 size={15} className="animate-spin mx-auto" /> : following ? t('reviews.following') : t('reviews.follow')}
          </button>
        )}
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

      {/* Tab bar — Saved/Liked are this account's own private lists (same convention
          as TikTok's default-private Likes tab), so someone else's profile only ever
          shows their public posts grid. */}
      {isOwnProfile ? (
        <div className="flex border-b border-gray-800">
          <button onClick={() => setActiveTab('posts')} className={`flex-1 py-2.5 flex flex-col justify-center items-center gap-0.5 transition-colors ${activeTab === 'posts' ? 'border-b-2 border-white' : ''}`}>
            <Grid3X3 size={18} className={activeTab === 'posts' ? 'text-white' : 'text-gray-500'} />
            <span className={`text-[10px] ${activeTab === 'posts' ? 'text-white' : 'text-gray-500'}`}>{t('reviews.profileTabPosts')}</span>
          </button>
          <button onClick={() => setActiveTab('saved')} className={`flex-1 py-2.5 flex flex-col justify-center items-center gap-0.5 transition-colors ${activeTab === 'saved' ? 'border-b-2 border-white' : ''}`}>
            <Bookmark size={18} className={activeTab === 'saved' ? 'text-white' : 'text-gray-500'} />
            <span className={`text-[10px] ${activeTab === 'saved' ? 'text-white' : 'text-gray-500'}`}>{t('reviews.profileTabSaved')}</span>
          </button>
          <button onClick={() => setActiveTab('liked')} className={`flex-1 py-2.5 flex flex-col justify-center items-center gap-0.5 transition-colors ${activeTab === 'liked' ? 'border-b-2 border-white' : ''}`}>
            <Heart size={18} className={activeTab === 'liked' ? 'text-white' : 'text-gray-500'} />
            <span className={`text-[10px] ${activeTab === 'liked' ? 'text-white' : 'text-gray-500'}`}>{t('reviews.profileTabLiked')}</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 py-2.5 border-b border-gray-800 text-white">
          <Grid3X3 size={16} />
          <span className="text-xs font-semibold">{t('reviews.profileTabPosts')}</span>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center pt-16"><Loader2 size={20} className="text-white animate-spin" /></div>
      ) : loadError ? (
        <div className="flex flex-col items-center py-16 text-gray-500 gap-2">
          <AlertCircle size={36} className="opacity-30" />
          <p className="text-sm">{t('reviews.profileLoadError')}</p>
        </div>
      ) : displayPosts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-500">
          {emptyState[activeTab].icon}
          <p className="text-sm">{emptyState[activeTab].text}</p>
          {emptyState[activeTab].cta}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-gray-800">
          {displayPosts.map(r => {
            // Video posts have no photos[] — their poster frame lives in `thumbnail`.
            // Without this the tile fell through to the body-text placeholder, so a
            // profile of clips showed only captions instead of the video thumbnails.
            const thumb = r.photos?.[0] || (r.content_type === 'video' ? r.thumbnail : null)
            const isHidden = activeTab === 'posts' && (r as Review & { is_hidden?: boolean }).is_hidden
            return (
              <button key={r.id} onClick={() => handleGridClick(r as Review)}
                className={`relative aspect-[9/16] bg-gray-900 ${sel?.id === r.id ? 'ring-2 ring-inset ring-[#fe2c55]' : ''}`}>
                {thumb ? <Image src={thumb} alt="" fill className="object-cover" sizes="33vw" />
                  : <div className="absolute inset-0 flex items-center justify-center p-2"><p className="text-white text-xs text-center line-clamp-4">{r.body}</p></div>}
                {/* Overlay: place name + stars */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-1.5 pt-4 pb-1.5">
                  {!isShareOnlyName(r.place_name) && <p className="text-white text-[9px] font-semibold leading-tight line-clamp-1">{r.place_name}</p>}
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {'★'.repeat(r.rating).split('').map((_, i) => (
                      <span key={i} className="text-amber-400 text-[8px] leading-none">★</span>
                    ))}
                  </div>
                </div>
                {isHidden && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><EyeOff size={20} className="text-white" /></div>}
              </button>
            )
          })}
        </div>
      )}

      {/* Action sheet for my posts */}
      {sel && activeTab === 'posts' && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setSel(null)} />
          <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-40 bg-[#1a1a1a] rounded-t-3xl px-5 pt-3 pb-8">
            <div className="flex justify-center mb-3"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
            <p className="text-white text-sm font-semibold text-center mb-3 line-clamp-1">{isShareOnlyName(sel.place_name) ? 'Bài chia sẻ' : sel.place_name}</p>
            <div className="space-y-2">
              <Link href={`/reviews/${sel.id}`} onClick={() => { sessionStorage.setItem('reviews_tab', 'profile'); setSel(null) }}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                <Eye size={18} className="text-blue-400" /> {t('reviews.sheetViewPost')}
              </Link>
              <button onClick={() => doHide(sel.id, !(sel as Review & { is_hidden?: boolean }).is_hidden)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:bg-gray-700">
                {(sel as Review & { is_hidden?: boolean }).is_hidden ? <><Eye size={18} className="text-green-400" /> {t('reviews.sheetShowPost')}</> : <><EyeOff size={18} className="text-orange-400" /> {t('reviews.sheetHidePost')}</>}
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
        <ClipViewer posts={displayPosts} startIndex={viewerStart} me={viewerId} onClose={() => setViewerStart(null)}
          onDelete={(id) => { setPosts(p => p.filter(r => r.id !== id)); setHidden(h => h.filter(r => r.id !== id)) }} />
      )}
    </div>
  )
}
