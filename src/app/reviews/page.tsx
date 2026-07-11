'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Heart, MessageCircle, Bookmark, Share2,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, MoreVertical, Trash2, EyeOff, Eye,
  X, Send, Loader2, Home, Search, Plus, Bell, User, Grid3X3, ArrowLeft, AlertCircle, Compass
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/tracking/tracker'
import { logUserEvent, getUserPreferences, inferPreferencesFromEvents } from '@/lib/userMemory'
import type { UserPreferences } from '@/lib/userMemory'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/explore/VideoPlayer'
import { attachWatchTracker } from '@/lib/explore/behaviorTracker'
import ReviewMusicDisc from './ReviewMusicDisc'
import SoundSheet from './SoundSheet'
import { useTranslation } from '@/lib/i18n/useTranslation'

/* ─── types ─── */
interface Profile { full_name: string | null; avatar_url: string | null }
interface Comment { id: string; body: string; created_at: string; user_id: string; profiles: Profile | null }
interface Review {
  id: string; user_id: string; place_name: string; place_address: string | null
  rating: number; body: string; photos: string[] | null
  like_count: number; comment_count: number; save_count?: number; created_at: string
  liked_by_me: boolean; saved_by_me: boolean; profiles: Profile | null
  content_type?: string | null; media_url?: string | null; thumbnail?: string | null
  source_type?: string | null; source_url?: string | null; hashtags?: string[] | null
  watch_time_avg?: number; score?: number
  music?: { version: number; trackId: string; startSec: number; volume: number; origin?: 'original' | 'attached' } | null
}

interface Notification { id: string; type: string; actor_id: string; actor_name: string; actor_avatar: string | null; text: string; url: string; created_at: string }
interface HotPlace { place_name: string; count: number }
interface GroupedNotif {
  id: string; type: string; url: string
  actors: { name: string; avatar: string | null; id: string }[]
  text: string; comment_body?: string
  created_at: string; count: number
}
const NOTIF_COLOR: Record<string, string> = {
  like: '#ff6b35', follow: '#1D9E75', profile_view: '#534AB7', comment: '#378ADD',
}
// A "share-only" post (clip/photo posted without adding a place) carries a
// sentinel place_name, so it must not show a 📍 chip or count as a hot place.
// Includes the legacy no-diacritic value written by older builds.
const SHARE_ONLY_NAMES = new Set(['Chia sẻ', 'Chia se'])
const isShareOnlyName = (n?: string | null) => !n?.trim() || SHARE_ONLY_NAMES.has(n.trim())
function groupNotifs(notifs: Notification[]): GroupedNotif[] {
  const map = new Map<string, GroupedNotif>()
  for (const n of notifs) {
    const key = n.type === 'like' ? `like:${n.url}` : n.type === 'profile_view' ? 'profile_view' : n.id
    const existing = map.get(key)
    if (existing) {
      if (!existing.actors.find(a => a.id === n.actor_id))
        existing.actors.push({ name: n.actor_name, avatar: n.actor_avatar, id: n.actor_id })
      existing.count++
      if (new Date(n.created_at) > new Date(existing.created_at)) existing.created_at = n.created_at
    } else {
      map.set(key, {
        id: n.id, type: n.type, url: n.url,
        actors: [{ name: n.actor_name, avatar: n.actor_avatar, id: n.actor_id }],
        text: n.text, comment_body: n.type === 'comment' ? n.text : undefined,
        created_at: n.created_at, count: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
function notifSection(created_at: string): string {
  const ms = Date.now() - new Date(created_at).getTime()
  if (ms < 60 * 60 * 1000) return 'VỪA XONG'
  if (ms < 24 * 60 * 60 * 1000) return 'HÔM NAY'
  return 'TUẦN NÀY'
}

function ago(d: string, t: (key: string, vars?: Record<string, string>) => string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return t('reviews.agoJustNow')
  if (m < 60) return t('reviews.agoMinutes', { n: String(m) })
  if (m < 1440) return t('reviews.agoHours', { n: String(Math.floor(m / 60)) })
  return t('reviews.agoDays', { n: String(Math.floor(m / 1440)) })
}

/* ─── Photo carousel ─── */
// Controlled by the parent Post so the feed's gesture layer (which sits above the
// media and would otherwise swallow horizontal swipes) can drive the image change.
function Carousel({ photos, index, onIndexChange }: { photos: string[]; index: number; onIndexChange: (i: number) => void }) {
  const i = Math.max(0, Math.min(photos.length - 1, index))
  return (
    <div className="absolute inset-0 select-none">
      <Image src={photos[i]} alt="" fill className="object-cover" sizes="100vw" priority={i === 0} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      {photos.length > 1 && <>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {photos.map((_, j) => <div key={j} className={`h-0.5 rounded-full transition-all ${j === i ? 'w-6 bg-white' : 'w-3 bg-white/40'}`} />)}
        </div>
        {i > 0 && <button onClick={() => onIndexChange(i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center"><ChevronLeft size={16} className="text-white" /></button>}
        {i < photos.length - 1 && <button onClick={() => onIndexChange(i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center"><ChevronRight size={16} className="text-white" /></button>}
        <span className="absolute top-3 right-3 text-white text-xs bg-black/40 px-1.5 py-0.5 rounded-full z-10">{i + 1}/{photos.length}</span>
      </>}
    </div>
  )
}

/* ─── Comment drawer ─── */
function CommentDrawer({ review, me, onClose, onAdded }: { review: Review; me: string | null; onClose: () => void; onAdded: (id: string, count: number) => void }) {
  const { t } = useTranslation()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  // Local, authoritative count so the header updates the moment a comment is
  // posted or deleted (the review.comment_count prop is a stale snapshot).
  const [count, setCount] = useState(review.comment_count)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setLoadError(false)
    fetch(`/api/reviews/${review.id}/comments`)
      .then(r => { if (!r.ok) throw new Error('load_failed'); return r.json() })
      .then(d => { setComments(d.comments || []); if (typeof d.count === 'number') setCount(d.count) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [review.id])
  const del = async (commentId: string) => {
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments?commentId=${commentId}`, { method: 'DELETE' })
      if (!res.ok) return
      const d = await res.json()
      setComments(p => p.filter(c => c.id !== commentId))
      const newCount = typeof d.count === 'number' ? d.count : Math.max(0, count - 1)
      setCount(newCount)
      onAdded(review.id, newCount) // keep the feed rail count in sync
    } catch { /* leave the comment in place on failure */ }
  }
  const send = async () => {
    // Anonymous can read comments but must log in to post one.
    if (!me) { window.location.href = '/login?returnTo=' + encodeURIComponent('/reviews'); return }
    if (!text.trim() || sending) return
    setSending(true)
    setSendError(false)
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text.trim() }) })
      const d = await res.json()
      if (res.ok) {
        setComments(p => [...p, d.comment])
        setText('')
        if (typeof d.count === 'number') setCount(d.count)
        onAdded(review.id, d.count)
        setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else {
        setSendError(true)
      }
    } catch {
      setSendError(true)
    } finally {
      setSending(false)
    }
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-50 bg-[#1a1a1a] rounded-t-3xl max-h-[60vh] flex flex-col">
        <div className="flex justify-center py-2 flex-shrink-0"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
        <div className="flex items-center px-4 pb-3 flex-shrink-0">
          <h3 className="font-semibold text-white flex-1">{t('reviews.commentsTitle', { n: String(count) })}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2 min-h-0">
          {loading ? <div className="flex justify-center py-6"><Loader2 size={18} className="text-white animate-spin" /></div>
            : loadError ? <div className="flex flex-col items-center gap-2 py-6 text-gray-500"><AlertCircle size={20} className="opacity-60" /><p className="text-sm">{t('reviews.commentsLoadError')}</p></div>
            : comments.length === 0 ? <p className="text-center text-gray-500 text-sm py-6">{t('reviews.commentsEmpty')}</p>
            : comments.map(c => {
              const n = c.profiles?.full_name?.split(' ').pop() || t('reviews.anonymous')
              return <div key={c.id} className="flex gap-2.5">
                {c.profiles?.avatar_url ? <Image src={c.profiles.avatar_url} alt={n} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">{n[0]?.toUpperCase()}</div>}
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-white">{n} <span className="text-gray-500 font-normal">{ago(c.created_at, t)}</span></p><p className="text-sm text-gray-300 mt-0.5">{c.body}</p></div>
                {c.user_id === me && (
                  <button onClick={() => del(c.id)} aria-label={t('reviews.commentDelete')} className="flex-shrink-0 self-start p-1 -mr-1 text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            })}
          <div ref={ref} />
        </div>
        {sendError && <p className="px-4 text-xs text-red-400 flex-shrink-0">{t('reviews.commentSendError')}</p>}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={t('reviews.commentPlaceholder')} maxLength={300}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 text-sm px-4 py-2 rounded-full focus:outline-none" />
          <button onClick={send} disabled={!text.trim() || sending} className="text-pink-500 font-semibold text-sm disabled:opacity-40">{sending ? <Loader2 size={16} className="animate-spin" /> : t('reviews.commentSend')}</button>
        </div>
      </div>
    </>
  )
}

/* ─── Share modal ─── */
function ShareModal({ review, onClose }: { review: Review; onClose: () => void }) {
  const { t } = useTranslation()
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/reviews/${review.id}`
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const share = () => navigator.share ? navigator.share({ url }) : copy()
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-50 bg-[#1a1a1a] rounded-t-3xl px-5 pt-3 pb-8">
        <div className="flex justify-center mb-4"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
        <p className="text-white font-semibold text-center mb-5">{t('reviews.shareTitle')}</p>
        <div className="flex gap-4 justify-center mb-6">
          {[
            { emoji: '📋', label: copied ? t('reviews.shareCopied') : t('reviews.shareCopy'), fn: copy },
            { emoji: '🔗', label: t('reviews.shareAction'), fn: share },
          ].map(a => (
            <button key={a.label} onClick={a.fn} className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-2xl">{a.emoji}</div>
              <span className="text-white text-xs">{a.label}</span>
            </button>
          ))}
        </div>
        <div className="bg-gray-800 rounded-xl px-4 py-2.5 text-gray-400 text-xs truncate">{url}</div>
      </div>
    </>
  )
}

/* ─── Single post (TikTok style) ─── */
function Post({ r, me, feedType, renderVideo, active = false, showFeedTabs = true, onFeedTypeChange, onLike, onLikeDouble, onSave, onComment, onShare, onDelete, onSoundTap }: {
  r: Review; me: string | null
  // Only the active slide (± 1 neighbour) mounts a real <video>. Off-screen
  // slides render just the thumbnail. iOS Safari caps how many HTMLMediaElements
  // can buffer at once, so mounting every feed video froze the media pipeline —
  // new uploads wouldn't play and scrolling stalled until the tab was reloaded.
  renderVideo: boolean
  // Whether this is THE slide in view — drives play/pause in VideoPlayer.
  active?: boolean
  // The for-you/following/latest switcher only belongs on the main feed — hidden
  // when the same Post powers the profile clip viewer.
  showFeedTabs?: boolean
  feedType: 'for-you' | 'latest' | 'following'; onFeedTypeChange: (ft: 'for-you' | 'latest' | 'following') => void
  onLike: (id: string) => void; onLikeDouble: (id: string) => void; onSave: (id: string) => void
  onComment: (r: Review) => void; onShare: (r: Review) => void; onDelete: (id: string) => void
  onSoundTap?: (trackId: string) => void
}) {
  const { t } = useTranslation()
  const photos = (r.photos || []).filter(Boolean)
  const isMe = me === r.user_id
  const name = r.profiles?.full_name || t('reviews.anonymous')
  const handle = '@' + name.replace(/\s+/g, '').toLowerCase()
  const [menu, setMenu] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const durationRef = useRef<number | null>(null)
  const videoHandleRef = useRef<VideoPlayerHandle>(null)

  useEffect(() => {
    if (r.content_type !== 'video' || !containerRef.current) return
    return attachWatchTracker(containerRef.current, r.id, () => durationRef.current)
  }, [r.id, r.content_type])

  // ── Feed gestures (TikTok-standard) ──────────────────────────────────
  // Single tap → pause/resume the video. Double tap → like (+ big heart burst
  // + haptic). Telling them apart needs a 300ms wait: a lone tap only pauses
  // once that window passes with no second tap; a second tap inside it cancels
  // the pending pause and likes instead. A gesture layer over the media owns
  // these; the action rail / mute button sit above it and keep their own taps.
  // touchAction:'pan-y' leaves vertical feed-scrolling native.
  const [heartBurst, setHeartBurst] = useState(0)
  const [carIdx, setCarIdx] = useState(0) // current image in a multi-photo post
  const lastTapRef = useRef(0)
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPtRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)

  const buzz = (ms: number) => { try { navigator.vibrate?.(ms) } catch { /* unsupported */ } }
  const cancelPendingTap = () => { if (singleTapTimer.current) { clearTimeout(singleTapTimer.current); singleTapTimer.current = null } }
  useEffect(() => cancelPendingTap, [])

  const doubleTapLike = () => {
    setHeartBurst((b) => b + 1) // always animate, even if already liked
    buzz(20)
    if (!r.liked_by_me) onLikeDouble(r.id) // like-only + optimistic; no re-like if liked
  }

  const onPointerDown = (e: React.PointerEvent) => {
    startPtRef.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = startPtRef.current
    if (!s) return
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) movedRef.current = true
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (movedRef.current) {
      // A drag, not a tap. If it was a mostly-horizontal swipe over a multi-photo
      // post, page the carousel (the gesture layer sits above the Carousel, so it
      // has to forward the swipe itself). Vertical drags stay native feed-scroll.
      const s = startPtRef.current
      if (s && photos.length > 1) {
        const dx = e.clientX - s.x, dy = e.clientY - s.y
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          setCarIdx(p => dx < 0 ? Math.min(photos.length - 1, p + 1) : Math.max(0, p - 1))
        }
      }
      return
    }
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      // second tap within the window → double-tap like; drop the pending pause
      lastTapRef.current = 0
      cancelPendingTap()
      doubleTapLike()
    } else {
      // first tap → wait; if no second tap lands, it's a single tap → pause/resume
      lastTapRef.current = now
      cancelPendingTap()
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null
        videoHandleRef.current?.togglePlay()
      }, 300)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-dvh flex-shrink-0 snap-start bg-black overflow-hidden">
      {/* BG */}
      {r.content_type === 'video' && r.media_url
        ? (renderVideo
            ? <VideoPlayer
                ref={videoHandleRef}
                url={r.media_url}
                thumbnail={r.thumbnail ?? undefined}
                sourceType={r.source_type ?? 'upload'}
                sourceUrl={r.source_url ?? undefined}
                active={active}
                onDurationKnown={d => { durationRef.current = d }}
              />
            // Off-screen: thumbnail only, no <video> element (frees iOS media slots)
            : <div className="absolute inset-0 bg-black">
                {r.thumbnail && <img src={r.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
              </div>)
        : photos.length > 0
        ? <Carousel photos={photos} index={carIdx} onIndexChange={setCarIdx} />
        : <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />}

      {/* Gesture layer — single-tap pause / double-tap like. Sits above the
          media but below the carousel nav (z-10) and the action rail (z-20). */}
      <div
        className="absolute inset-0 z-[5]"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { movedRef.current = true; cancelPendingTap() }}
      />

      {/* Big heart burst on double-tap (key remount replays the animation) */}
      {heartBurst > 0 && (
        <div key={heartBurst} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <Heart size={112} className="fill-[#fe2c55] text-[#fe2c55] drop-shadow-2xl animate-heart-pop" />
        </div>
      )}

      {/* Top: for you / following */}
      <div className="absolute top-0 left-0 right-0 z-20 pt-12 px-4 flex items-center justify-center gap-6">
        {showFeedTabs && <>
          <button onClick={() => onFeedTypeChange('following')} className={`text-xs font-medium ${feedType === 'following' ? 'text-white font-bold border-b-2 border-white pb-0.5' : 'text-white/60'}`}>{t('reviews.tabFollowing')}</button>
          <button onClick={() => onFeedTypeChange('for-you')} className={`text-xs font-medium ${feedType === 'for-you' ? 'text-white font-bold border-b-2 border-white pb-0.5' : 'text-white/60'}`}>{t('reviews.tabForYou')}</button>
          <button onClick={() => onFeedTypeChange('latest')} className={`text-xs font-medium ${feedType === 'latest' ? 'text-white font-bold border-b-2 border-white pb-0.5' : 'text-white/60'}`}>{t('reviews.tabLatest')}</button>
        </>}
        {isMe && (
          <div className="absolute right-4 top-12">
            <button onClick={() => setMenu(v => !v)} className="w-8 h-8 flex items-center justify-center">
              <MoreVertical size={20} className="text-white drop-shadow" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-9 z-40 bg-[#1a1a1a] border border-gray-700 rounded-2xl overflow-hidden w-40 shadow-2xl">
                  <button onClick={async () => { if (!confirm(t('reviews.deleteConfirmShort'))) return; const res = await fetch(`/api/reviews/${r.id}`, { method: 'DELETE' }); if (res.ok) { onDelete(r.id) } setMenu(false) }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-red-400 text-sm font-medium hover:bg-gray-800">
                    <Trash2 size={15} /> {t('reviews.deletePost')}
                  </button>
                  <button onClick={async () => { const res = await fetch(`/api/reviews/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: true }) }); if (res.ok) { onDelete(r.id) } setMenu(false) }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 text-sm font-medium hover:bg-gray-800 border-t border-gray-800">
                    <EyeOff size={15} /> {t('reviews.hidePost')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right actions (TikTok style) */}
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5">
        {/* Avatar */}
        <div className="relative mb-1">
          <Link href={`/users/${r.user_id}`}>
            {r.profiles?.avatar_url
              ? <Image src={r.profiles.avatar_url} alt={name} width={48} height={48} className="w-12 h-12 rounded-full ring-2 ring-white object-cover" />
              : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 ring-2 ring-white flex items-center justify-center text-white font-bold">{name[0]?.toUpperCase()}</div>}
          </Link>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 bg-[#fe2c55] rounded-full flex items-center justify-center">
            <Plus size={12} className="text-white" strokeWidth={3} />
          </div>
        </div>

        {/* Like */}
        <RAction icon={<Heart size={28} className={r.liked_by_me ? 'fill-[#fe2c55] text-[#fe2c55]' : 'text-white'} />} label={r.like_count} onClick={() => onLike(r.id)} />
        {/* Comment */}
        <RAction icon={<MessageCircle size={26} className="text-white" />} label={r.comment_count} onClick={() => onComment(r)} />
        {/* Save */}
        <RAction icon={<Bookmark size={24} className={r.saved_by_me ? 'fill-amber-400 text-amber-400' : 'text-white'} />} label={t('reviews.railSave')} onClick={() => onSave(r.id)} />
        {/* Share */}
        <RAction icon={<Share2 size={24} className="text-white" />} label={t('reviews.railShare')} onClick={() => onShare(r)} />
        {/* The clip's sound — tap to open its sound page ("use this sound").
            Shown for ALL upload video clips. If the clip has a registered track
            (music.trackId), the disc links to the sound page; otherwise it's
            a visual-only indicator (migrations may not be applied yet). */}
        {r.content_type === 'video' && (r.source_type === 'upload' || !r.source_type) && r.media_url && (
          <ReviewMusicDisc trackId={r.music?.trackId} onTap={onSoundTap} />
        )}
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-3 right-20 z-20">
        <Link href={`/users/${r.user_id}`}>
          <p className="text-white font-bold text-[15px] mb-1 drop-shadow truncate">{handle}</p>
        </Link>
        {r.body ? <p className="text-white text-sm leading-snug line-clamp-3 drop-shadow">{r.body}</p> : null}
        {!isShareOnlyName(r.place_name) && (
          <p className="text-white/70 text-xs mt-1.5 flex items-center gap-1">
            <span className="text-sm">📍</span> {r.place_name}
            {r.rating > 0 && <span className="ml-2 text-amber-400">{'★'.repeat(r.rating)}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

function RAction({ icon, label, onClick }: { icon: React.ReactNode; label?: string | number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
      {icon}
      {label !== undefined && <span className="text-white text-xs font-semibold drop-shadow-md">{label}</span>}
    </button>
  )
}

/* ─── Swipeable clip viewer — opens from the profile grid with the SAME UX as
   the main feed: swipe/arrow between clips, single-tap pause, double-tap like,
   like/comment/save/share, own-post delete/hide. Reuses Post/CommentDrawer/ShareModal. */
function ClipViewer({ posts, startIndex, me, onClose }: { posts: Review[]; startIndex: number; me: string | null; onClose: () => void }) {
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
  const del = (id: string) => { setItems(p => p.filter(r => r.id !== id)) }
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

/* ─── Profile Tab (TikTok style) ─── */
function ProfileTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<{
    full_name: string | null; avatar_url: string | null
    follower_count: number; following_count: number; review_count: number
  } | null>(null)
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
          supabase.from('review_likes').select('review_id').eq('user_id', userId).then(r => { if (r.error) throw r.error; return r.data || [] }),
          supabase.from('review_saves').select('review_id').eq('user_id', userId).then(r => { if (r.error) throw r.error; return r.data || [] }),
          getUserPreferences(userId),
        ])
        setProfile(profileRes)
        setPrefs(prefsRes)
        const allPosts = (reviewsRes.reviews || []).map((r: Review) => ({ ...r, is_hidden: false }))
        setPosts(allPosts)
        const { data: hiddenData, error: hiddenError } = await supabase.from('reviews').select('id,place_name,body,photos,rating,is_hidden,like_count,comment_count,created_at,content_type,media_url,thumbnail,source_type,source_url').eq('user_id', userId).eq('is_hidden', true).order('created_at', { ascending: false })
        if (hiddenError) throw hiddenError
        setHidden((hiddenData || []).map((r: any) => ({ ...r } as Review)))
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
  }, [userId, supabase])

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
      <div style={{ background: 'linear-gradient(180deg, #1a0a2e 0%, #0d0618 60%, #000 100%)' }} className="pt-14 pb-4 px-4 flex flex-col items-center">
        <div className="relative mb-3">
          {profile?.avatar_url
            ? <Image src={profile.avatar_url} alt={firstName} width={96} height={96} className="w-24 h-24 rounded-full object-cover ring-2 ring-purple-500/40" />
            : <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-2 ring-purple-500/40">{firstName[0]?.toUpperCase()}</div>}
          <Link href="/reviews/new" className="absolute bottom-0 right-0 w-6 h-6 bg-[#fe2c55] rounded-full flex items-center justify-center border-2 border-black">
            <Plus size={13} className="text-white" strokeWidth={3} />
          </Link>
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
        <Link href="/profile" className="w-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold py-2 rounded-md text-center transition-colors">
          {t('reviews.editProfile')}
        </Link>
      </div>

      {/* Tappy memory chip — only shown when preferences are inferred */}
      {prefs && prefs.preferred_style && prefs.preferred_style.length > 0 && (
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

      {/* 3-tab bar */}
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

      {/* Swipeable clip viewer — opens on grid tap */}
      {viewerStart !== null && (
        <ClipViewer posts={displayPosts} startIndex={viewerStart} me={userId} onClose={() => setViewerStart(null)} />
      )}
    </div>
  )
}

/* ─── TikTok Bottom Nav ─── */
function TikNav({ tab, setTab, userId }: { tab: string; setTab: (t: string) => void; userId: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur border-t border-gray-800 flex items-center h-[60px]">
      {/* App Home — TappyAI has exactly one Home: the AI Chat home at "/". Reviews never redefines it. */}
      <Link href="/" className="flex-1 flex flex-col items-center gap-0.5 py-1 text-gray-500">
        <Home size={24} /><span className="text-[10px]">{t('reviews.navHome')}</span>
      </Link>
      {[
        { id: 'home', icon: <Compass size={24} />, label: t('reviews.navDiscover') },
        { id: 'explore', icon: <Search size={24} />, label: t('reviews.navSearch') },
      ].map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === item.id ? 'text-white' : 'text-gray-500'}`}>
          {item.icon}<span className="text-[10px]">{item.label}</span>
        </button>
      ))}
      {/* Post button */}
      <Link href="/reviews/new" className="flex-1 flex justify-center">
        <div className="relative w-11 h-7 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#69c9d0] rounded-lg" style={{ right: 4 }} />
          <div className="absolute inset-0 bg-[#fe2c55] rounded-lg" style={{ left: 4 }} />
          <div className="relative bg-white rounded-lg w-[38px] h-full flex items-center justify-center">
            <Plus size={20} className="text-black" strokeWidth={2.5} />
          </div>
        </div>
      </Link>
      <button onClick={() => setTab('inbox')} className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === 'inbox' ? 'text-white' : 'text-gray-500'}`}>
        <Bell size={24} /><span className="text-[10px]">{t('reviews.navInbox')}</span>
      </button>
      <button onClick={() => setTab('profile')} className={`flex-1 flex flex-col items-center gap-0.5 py-1 ${tab === 'profile' ? 'text-white' : 'text-gray-500'}`}>
        <User size={24} /><span className="text-[10px]">{t('reviews.navProfile')}</span>
      </button>
    </div>
  )
}

/* ─── Desktop sidebar ─── */
function Sidebar({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
  const { t } = useTranslation()
  return (
    <aside className="hidden md:flex flex-col w-[240px] xl:w-[260px] fixed left-[max(0px,calc(50vw-500px))] top-0 h-screen py-6 px-4 gap-1 border-r border-gray-800">
      {/* Logo returns to the app's single Home (AI Chat at "/") */}
      <Link href="/" className="text-white font-black text-2xl px-3 mb-4 block">TappyAI</Link>
      {/* App Home — TappyAI has exactly one Home: the AI Chat home at "/". Reviews never redefines it. */}
      <Link href="/" className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-[15px] font-medium text-gray-300 hover:bg-white/5 transition-colors">
        <Home size={22} />{t('reviews.navHome')}
      </Link>
      {[
        { id: 'home', icon: <Compass size={22} />, label: t('reviews.navDiscover') },
        { id: 'explore', icon: <Search size={22} />, label: t('reviews.navSearch') },
        { id: 'profile', icon: <User size={22} />, label: t('reviews.navProfileAndPosts') },
      ].map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-xl text-[15px] font-${tab === item.id ? 'bold text-white bg-white/10' : 'medium text-gray-300 hover:bg-white/5'} transition-colors`}>
          {item.icon}{item.label}
        </button>
      ))}
      <Link href="/reviews/new" className="mt-4 mx-1 bg-[#fe2c55] hover:bg-[#ef2950] text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
        <Plus size={18} />{t('reviews.sidebarPost')}
      </Link>
    </aside>
  )
}

/* ─── Notification row ─── */
function NotifRow({ g, onNav }: { g: GroupedNotif; onNav: () => void }) {
  const { t } = useTranslation()
  const color = NOTIF_COLOR[g.type] || '#666'
  const [followed, setFollowed] = useState(false)
  const notifRouter = useRouter()
  const actors = g.actors.slice(0, 3)
  const actorLabel = g.actors.length === 1
    ? g.actors[0].name
    : g.actors.length === 2
    ? t('reviews.notifTwoActors', { a: g.actors[0].name, b: g.actors[1].name })
    : t('reviews.notifManyActors', { a: g.actors[0].name, b: g.actors[1]?.name ?? '', n: String(g.actors.length - 2) })

  const avatarStack = (
    <div className="relative flex-shrink-0 mr-3" style={{ width: 48, height: 44 }}>
      {actors.map((actor, i) => {
        const n = actor.name.split(' ').pop() || '?'
        return (
          <div key={i} className="absolute rounded-full overflow-hidden border-2 border-black"
            style={{ left: i * 8, top: 0, zIndex: 3 - i, width: 36, height: 36 }}>
            {actor.avatar
              ? <Image src={actor.avatar} alt={n} width={36} height={36} className="object-cover w-full h-full" />
              : <div className="w-full h-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{n[0]?.toUpperCase()}</div>}
          </div>
        )
      })}
      <div className="absolute rounded-full flex items-center justify-center border-2 border-black"
        style={{ background: color, width: 20, height: 20, bottom: -4, right: 0, zIndex: 10 }}>
        {g.type === 'like' && <Heart size={9} className="text-white fill-white" />}
        {g.type === 'follow' && <User size={9} className="text-white" />}
        {g.type === 'comment' && <MessageCircle size={9} className="text-white" />}
      </div>
    </div>
  )

  const mainText = (
    <div className="flex-1 min-w-0">
      <p className="text-white text-sm leading-snug">
        <span className="font-semibold">{actorLabel}</span>{' '}
        <span className="text-gray-300">
          {g.type === 'like' ? t('reviews.notifLiked') : g.type === 'follow' ? t('reviews.notifFollowed') : t('reviews.notifCommented')}
        </span>
      </p>
      {g.type === 'comment' && g.comment_body && (
        <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">&quot;{g.comment_body}&quot;</p>
      )}
      <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at, t)}</p>
    </div>
  )

  const rowBase = "flex items-center px-4 py-3.5 border-l-[3px] active:bg-gray-900/40 transition-colors"

  const handleReviewNav = () => {
    const match = g.url?.match(/\/reviews\/([0-9a-f-]{36})/i)
    const reviewId = match?.[1]
    if (reviewId) {
      notifRouter.push('/reviews/' + reviewId)
    } else {
      onNav()
    }
  }

  if (g.type === 'profile_view') {
    return (
      <div className={rowBase} style={{ borderColor: color }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 mr-3" style={{ background: `${color}22` }}>
          <User size={20} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm"><span className="font-bold">{g.count}</span> {t('reviews.notifProfileViews')}</p>
          <p className="text-gray-500 text-xs mt-0.5">{ago(g.created_at, t)}</p>
        </div>
        <button className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ml-2" style={{ background: `${color}22`, color }}>{t('reviews.notifSeeWho')}</button>
      </div>
    )
  }

  if (g.type === 'follow') {
    const profileUrl = g.actors[0]?.id ? `/users/${g.actors[0].id}` : '#'
    return (
      <Link href={profileUrl} className={rowBase} style={{ borderColor: color }}>
        {avatarStack}{mainText}
        <button
          onClick={async e => { e.preventDefault(); e.stopPropagation(); if (followed || !g.actors[0]?.id) return; setFollowed(true); await fetch(`/api/users/${g.actors[0].id}/follow`, { method: 'POST' }) }}
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ml-2 transition-all"
          style={{ background: followed ? 'rgba(255,255,255,0.08)' : `${color}22`, color: followed ? '#666' : color }}>
          {followed ? t('reviews.followed') : t('reviews.followBack')}
        </button>
      </Link>
    )
  }

  return (
    <div role="button" onClick={handleReviewNav} className={rowBase + ' cursor-pointer'} style={{ borderColor: color }}>
      {avatarStack}{mainText}
      <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center ml-2 flex-shrink-0">
        <span className="text-base">🍽️</span>
      </div>
    </div>
  )
}

/* ─── Inbox Tab ─── */
function InboxTab({ notifs, notifsLoading, notifsError, hotPlaces, hotPlacesLoading, onSetTab, onFeedTypeChange, userPrefs }: {
  notifs: Notification[]
  notifsLoading: boolean
  notifsError: boolean
  hotPlaces: HotPlace[]
  hotPlacesLoading: boolean
  onSetTab: (t: string) => void
  onFeedTypeChange: (ft: 'for-you' | 'following') => void
  userPrefs: UserPreferences | null
}) {
  const { t } = useTranslation()
  const grouped = groupNotifs(notifs)
  const prefStyles = userPrefs?.preferred_style ?? []
  const bannerSubtext = prefStyles.length > 0
    ? t('reviews.bannerPersonalized', { styles: prefStyles.slice(0, 2).join(', ') })
    : t('reviews.bannerDefault')
  const bySection = new Map<string, GroupedNotif[]>()
  for (const g of grouped) {
    const s = notifSection(g.created_at)
    if (!bySection.has(s)) bySection.set(s, [])
    bySection.get(s)!.push(g)
  }
  const sectionLabel: Record<string, string> = {
    'VỪA XONG': t('reviews.sectionJustNow'),
    'HÔM NAY': t('reviews.sectionToday'),
    'TUẦN NÀY': t('reviews.sectionThisWeek'),
  }
  const sections = ['VỪA XONG', 'HÔM NAY', 'TUẦN NÀY'].filter(l => bySection.has(l)).map(l => ({ label: l, items: bySection.get(l)! }))

  return (
    <div className="h-dvh flex flex-col bg-black overflow-hidden">
      <div className="flex-shrink-0 pt-14 px-4 pb-3 border-b border-gray-800">
        <h2 className="text-white font-bold text-lg">{t('reviews.notificationsTitle')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {notifsLoading ? (
          <div className="flex justify-center pt-16"><Loader2 size={22} className="text-white animate-spin" /></div>
        ) : (
          <>
            {/* AI Digest Banner */}
            <div className="px-4 mt-4 mb-1">
              <button onClick={() => { onFeedTypeChange('following'); onSetTab('home') }} className="w-full text-left rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #1c0d00 0%, #2a1500 100%)', border: '1px solid rgba(255,107,53,0.28)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,107,53,0.15)' }}>
                  <span className="text-lg">✨</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-xs mb-0.5" style={{ color: '#ff6b35' }}>{t('reviews.bannerTitle')}</p>
                  <p className="text-white text-sm leading-snug">{bannerSubtext}</p>
                </div>
                <ChevronRight size={16} className="text-gray-500 flex-shrink-0" />
              </button>
            </div>

            {/* Hot places row */}
            {!hotPlacesLoading && hotPlaces.length > 0 && (
              <div className="mb-1">
                <p className="text-gray-500 text-[10px] font-bold px-4 pt-4 pb-2 tracking-widest">{t('reviews.hotNearYou')}</p>
                <div className="flex gap-3 px-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
                  {hotPlaces.map((p, i) => (
                    <button key={p.place_name} onClick={() => onSetTab('explore')}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gray-800"
                        style={i === 0 ? { boxShadow: '0 0 0 2px #ff6b35' } : {}}>
                        <span className="text-2xl">🍽️</span>
                      </div>
                      <p className="text-white text-[10px] text-center font-medium leading-tight line-clamp-2" style={{ width: 64 }}>{p.place_name}</p>
                      <p className="text-gray-500 text-[9px]">{t('reviews.hotCount', { n: String(p.count) })}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications grouped by section */}
            {notifsError ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <AlertCircle size={40} className="opacity-30" />
                <p className="text-sm">{t('reviews.notifsLoadError')}</p>
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <Bell size={40} className="opacity-30" />
                <p className="text-sm">{t('reviews.notifsEmpty')}</p>
              </div>
            ) : sections.length === 0 ? (
              <div className="flex flex-col items-center pt-16 text-gray-500 gap-3">
                <Bell size={40} className="opacity-30" />
                <p className="text-sm">{t('reviews.notifsNoNew')}</p>
              </div>
            ) : (
              sections.map(({ label, items }) => (
                <div key={label}>
                  <p className="text-gray-500 text-[10px] font-bold px-4 pt-4 pb-1.5 tracking-widest">{sectionLabel[label] ?? label}</p>
                  {items.map(g => <NotifRow key={g.id} g={g} onNav={() => onSetTab('home')} />)}
                </div>
              ))
            )}
            <div className="h-6" />
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Main ─── */
export default function ReviewsPage() {
  const { t } = useTranslation()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [feedError, setFeedError] = useState(false)
  // Index of the slide currently in view — only this one (± 1) mounts a <video>.
  const [activeIndex, setActiveIndex] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'home'
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    if (fromUrl) return fromUrl
    const saved = sessionStorage.getItem('reviews_tab')
    if (saved) { sessionStorage.removeItem('reviews_tab'); return saved }
    return 'home'
  })
  useEffect(() => {
    const fromUrl = searchParams?.get('tab')
    if (fromUrl) setTab(fromUrl)
  }, [searchParams])
  const handleSetTab = useCallback((t: string) => {
    setTab(t)
    router.replace(window.location.pathname + '?tab=' + t, { scroll: false })
  }, [router])
  const [feedType, setFeedType] = useState<'for-you' | 'latest' | 'following'>('for-you')
  const [city, setCity] = useState('')
  const [topHashtags, setTopHashtags] = useState<string[]>([])
  const cityRef = useRef(city)
  const topHashtagsRef = useRef(topHashtags)
  cityRef.current = city
  topHashtagsRef.current = topHashtags
  const abortRef = useRef<AbortController | null>(null)
  const fetchRef = useRef<(p: number, append: boolean, ft: 'for-you' | 'latest' | 'following', signal?: AbortSignal) => Promise<void>>(null as any)
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [soundTrackId, setSoundTrackId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [notifsLoading, setNotifsLoading] = useState(false)
  const [notifsError, setNotifsError] = useState(false)
  const [hotPlaces, setHotPlaces] = useState<HotPlace[]>([])
  const [hotPlacesLoading, setHotPlacesLoading] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const hasMore = useRef(true)
  const supabase = createClient()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Review[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // User search state
  const [searchMode, setSearchMode] = useState<'review' | 'user'>('review')
  const [userResults, setUserResults] = useState<{ id: string; full_name: string | null; avatar_url: string | null; follower_count: number; following_count: number; is_following: boolean }[]>([])
  const [userSearching, setUserSearching] = useState(false)
  const [userSearchError, setUserSearchError] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)).catch(() => {})
  }, [supabase])
  useEffect(() => {
    if (!me) return
    let cancelled = false
    getUserPreferences(me).then(p => { if (!cancelled) setUserPrefs(p) }).catch(() => {})

    const cityP = supabase.from('reviews').select('place_address').eq('user_id', me).order('created_at', { ascending: false }).limit(5).then(({ data }) => {
      const candidates = (data || []).map(r => r.place_address).filter(Boolean).map((a: string) => a.split(',').pop()?.trim() || '').filter(Boolean)
      if (candidates.length === 0) return
      const freq = new Map<string, number>()
      for (const c of candidates) freq.set(c, (freq.get(c) || 0) + 1)
      if (!cancelled) setCity(Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0][0])
    }, () => {})

    const hashP = supabase.from('review_interactions').select('review_id').eq('user_id', me).order('created_at', { ascending: false }).limit(20).then(async ({ data: interData }) => {
      try {
        const ids = (interData || []).map(r => r.review_id as string)
        if (ids.length === 0) return
        const { data: hashData } = await supabase.from('reviews').select('hashtags').in('id', ids)
        const freq = new Map<string, number>()
        for (const row of hashData || []) for (const tag of row.hashtags || []) freq.set(tag, (freq.get(tag) || 0) + 1)
        if (!cancelled) setTopHashtags(Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t))
      } catch { /* best-effort personalization, degrade silently */ }
    }, () => {})

    // Re-fetch feed once with personalization signals after both settle (single call, not cascade)
    Promise.allSettled([cityP, hashP]).then(() => {
      if (cancelled) return
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      fetchRef.current(0, false, 'for-you', ac.signal)
    })

    return () => { cancelled = true }
  }, [me, supabase])

  // Load notifications + hot places when inbox tab opens
  useEffect(() => {
    if (tab !== 'inbox') return
    setNotifsLoading(true)
    setNotifsError(false)
    fetch('/api/notifications')
      .then(r => { if (!r.ok) throw new Error('notifs_failed'); return r.json() })
      .then(d => setNotifs(d.notifications || []))
      .catch(() => setNotifsError(true))
      .finally(() => setNotifsLoading(false))
    setHotPlacesLoading(true)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('review_likes')
          .select('reviews!inner(place_name)')
          .gte('created_at', since)
          .limit(200)
        const counts = new Map<string, number>()
        for (const row of (data || []) as any[]) {
          const name = row.reviews?.place_name
          if (name && !isShareOnlyName(name)) counts.set(name, (counts.get(name) || 0) + 1)
        }
        setHotPlaces(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([place_name, count]) => ({ place_name, count })))
      } catch {
        // Best-effort personalization row — degrade silently, section just won't render (no misleading empty-state message exists for it)
      } finally {
        setHotPlacesLoading(false)
      }
    })()
  }, [tab])

  const fetch_ = useCallback(async (p: number, append = false, ft: 'for-you' | 'latest' | 'following' = 'for-you', signal?: AbortSignal) => {
    let url = `/api/reviews/feed?page=${p}&limit=12`
    if (ft === 'for-you') {
      const c = cityRef.current
      url += `&sort=trending${c ? `&city=${encodeURIComponent(c)}` : ''}`
    } else if (ft === 'latest') {
      url += '&sort=latest'
    } else {
      url += '&sort=latest&following=true'
    }
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error('feed_failed')
      const data = await res.json()
      const ht = topHashtagsRef.current
      let rows: Review[] = (data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false }))
      if (ft === 'for-you' && ht.length > 0) {
        rows = [...rows].sort((a, b) => {
          const sa = (a.hashtags || []).filter(t => ht.includes(t)).length
          const sb = (b.hashtags || []).filter(t => ht.includes(t)).length
          return sb - sa
        })
      }
      if (signal?.aborted) return
      setReviews(prev => append ? [...prev, ...rows] : rows)
      hasMore.current = rows.length >= 12
      if (!append) setFeedError(false)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      if (append) {
        hasMore.current = true
      } else {
        setReviews([])
        setFeedError(true)
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])
  fetchRef.current = fetch_

  useEffect(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    fetch_(0, false, feedType, ac.signal)
    return () => ac.abort()
  }, [fetch_, feedType])

  const handleFeedTypeChange = (ft: 'for-you' | 'latest' | 'following') => {
    if (ft === feedType) return
    setFeedType(ft)
    setLoading(true)
    pageRef.current = 0
    hasMore.current = true
    setActiveIndex(0)
  }

  // Desktop has no swipe — scroll one slide up/down via on-screen arrows.
  // Uses instant scroll: with scroll-snap-type: mandatory a programmatic *smooth*
  // scroll is cancelled (the container re-snaps to the current slide before the
  // animation advances), so we jump to the neighbouring slide and let snap align it.
  const scrollFeed = (dir: 1 | -1) => {
    const c = containerRef.current
    if (!c) return
    const cur = Math.round(c.scrollTop / c.clientHeight)
    const next = Math.max(0, Math.min(reviews.length - 1, cur + dir))
    c.scrollTo({ top: next * c.clientHeight, behavior: 'auto' })
    setActiveIndex(next) // update immediately so the arrows' disabled state + video window track it
  }

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); setSearchError(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reviews/feed?search=${encodeURIComponent(q)}&limit=20`)
        if (!res.ok) throw new Error('search_failed')
        const data = await res.json()
        setSearchResults((data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false })))
        setSearchError(false)
        track('review_search', { query: q })
      } catch {
        setSearchResults([])
        setSearchError(true)
      } finally { setSearching(false) }
    }, 400)
  }, [])

  // User search
  const doUserSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setUserResults([]); setUserSearchError(false); return }
    setUserSearching(true)
    try {
      const res = await fetch('/api/users/search?q=' + encodeURIComponent(q))
      if (!res.ok) throw new Error('user_search_failed')
      const d = await res.json()
      setUserResults(d.users || [])
      setUserSearchError(false)
    } catch {
      setUserResults([])
      setUserSearchError(true)
    } finally { setUserSearching(false) }
  }, [])

  const toggleFollow = async (targetId: string) => {
    if (!me) { window.location.href = '/login?returnTo=' + encodeURIComponent('/reviews'); return }
    setUserResults(prev => prev.map(u => u.id === targetId
      ? { ...u, is_following: !u.is_following, follower_count: u.follower_count + (u.is_following ? -1 : 1) }
      : u))
    const res = await fetch(`/api/users/${targetId}/follow`, { method: 'POST' })
    if (res.ok) {
      const d = await res.json()
      setUserResults(prev => prev.map(u => u.id === targetId ? { ...u, is_following: d.following, follower_count: d.follower_count } : u))
    } else {
      // revert — undo the optimistic delta. u.is_following here is the ALREADY-
      // flipped (optimistic) value, so the sign must match the optimistic line
      // above (? -1 : 1), not its inverse. (Bug: it was ? 1 : -1, which pushed
      // the count 2 further off — a failed follow read 12 instead of back to 10.)
      setUserResults(prev => prev.map(u => u.id === targetId
        ? { ...u, is_following: !u.is_following, follower_count: u.follower_count + (u.is_following ? -1 : 1) }
        : u))
    }
  }

  // Infinite scroll + active-slide tracking (drives which slide mounts a <video>)
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onScroll = () => {
      // Each slide is exactly one viewport tall (h-dvh + snap), so the active
      // index is simply how many viewports we've scrolled. Only setState when it
      // actually changes so we don't re-render the whole feed on every scroll tick.
      const idx = Math.round(c.scrollTop / c.clientHeight)
      setActiveIndex(prev => (prev === idx ? prev : idx))
      if (hasMore.current && c.scrollTop + c.clientHeight >= c.scrollHeight - c.clientHeight * 0.5) {
        hasMore.current = false
        pageRef.current += 1
        fetch_(pageRef.current, true, feedType)
      }
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    return () => c.removeEventListener('scroll', onScroll)
  }, [loading, fetch_, feedType])

  // Anonymous visitors can browse the feed but not interact — send them to login
  // (with a returnTo) the moment they try to like / save / follow / comment.
  const requireLogin = () => {
    if (me) return false
    window.location.href = '/login?returnTo=' + encodeURIComponent('/reviews')
    return true
  }

  const like = async (id: string) => {
    if (requireLogin()) return
    const r = reviews.find(r => r.id === id)
    // Validate the response before mutating counts — a 401/500 (or non-JSON
    // error page) previously left `liked` undefined and DECREMENTED the count.
    let liked: boolean
    try {
      const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data.liked !== 'boolean') return
      liked = data.liked
    } catch { return }
    setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: liked, like_count: Math.max(0, r.like_count + (liked ? 1 : -1)) } : r))
    track('review_like', { review_id: id, place: r?.place_name, liked })
    if (liked && me) {
      logUserEvent(me, 'like', { review_id: id })
      const count = parseInt(localStorage.getItem('tappy_like_count') || '0') + 1
      localStorage.setItem('tappy_like_count', String(count))
      if (count % 5 === 0) inferPreferencesFromEvents(me)
    }
  }
  // Double-tap like: like-only (never unlikes) + OPTIMISTIC with rollback, so
  // the heart/count react instantly. The right-rail heart keeps the plain
  // toggle `like`. Caller only invokes this when the post isn't already liked.
  const likeOnly = async (id: string) => {
    if (requireLogin()) return
    const cur = reviews.find(r => r.id === id)
    if (!cur || cur.liked_by_me) return
    setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: true, like_count: r.like_count + 1 } : r))
    track('review_like', { review_id: id, place: cur.place_name, liked: true })
    if (me) {
      logUserEvent(me, 'like', { review_id: id })
      const count = parseInt(localStorage.getItem('tappy_like_count') || '0') + 1
      localStorage.setItem('tappy_like_count', String(count))
      if (count % 5 === 0) inferPreferencesFromEvents(me)
    }
    try {
      const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('like failed')
      const data = await res.json()
      // Server toggled OFF (it was already liked server-side) → reconcile to truth.
      if (data.liked === false) {
        setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: false, like_count: Math.max(0, r.like_count - 1) } : r))
      }
    } catch {
      // rollback the optimistic like
      setReviews(p => p.map(r => r.id === id ? { ...r, liked_by_me: false, like_count: Math.max(0, r.like_count - 1) } : r))
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
    setReviews(p => p.map(r => r.id === id ? { ...r, saved_by_me: saved } : r))
    track('place_save', { review_id: id })
  }
  const del = (id: string) => setReviews(p => p.filter(r => r.id !== id))
  const addComment = (id: string, count: number) => setReviews(p => p.map(r => r.id === id ? { ...r, comment_count: count } : r))

  const handleShare = (r: Review) => {
    setShareOf(r)
    track('review_share', { review_id: r.id, place: r.place_name })
  }

  return (
    <div className="bg-black h-dvh overflow-hidden flex">
      <Sidebar tab={tab} setTab={handleSetTab} />

      {/* Content */}
      <div className="flex-1 md:ml-[240px] xl:ml-[260px] flex justify-center">
        <div className="w-full max-w-container-compact relative">

          {/* Home Feed */}
          {tab === 'home' && (
            loading
              ? <div className="h-dvh flex items-center justify-center"><Loader2 size={28} className="text-white animate-spin" /></div>
              : feedError
              ? <div className="h-dvh flex flex-col items-center justify-center text-white gap-3">
                  <AlertCircle size={36} className="opacity-60" />
                  <p className="font-semibold">{t('reviews.feedLoadError')}</p>
                </div>
              : reviews.length === 0
              ? <div className="h-dvh flex flex-col items-center justify-center text-white gap-3">
                  <p className="text-4xl">{feedType === 'following' ? '👥' : '📸'}</p>
                  <p className="font-semibold">{feedType === 'following' ? t('reviews.feedEmptyFollowing') : t('reviews.feedEmpty')}</p>
                  {feedType === 'following'
                    ? <button onClick={() => handleFeedTypeChange('for-you')} className="bg-white text-black px-6 py-2.5 rounded-full font-semibold">{t('reviews.seeForYou')}</button>
                    : feedType === 'latest'
                    ? <button onClick={() => handleFeedTypeChange('for-you')} className="bg-white text-black px-6 py-2.5 rounded-full font-semibold">{t('reviews.seeForYou')}</button>
                    : <Link href="/reviews/new" className="bg-[#fe2c55] text-white px-6 py-2.5 rounded-full font-semibold">{t('reviews.postNow')}</Link>}
                </div>
              : <>
                  <div ref={containerRef} className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                    {reviews.map((r, i) => <Post key={r.id} r={r} me={me} feedType={feedType} renderVideo={Math.abs(i - activeIndex) <= 1} active={i === activeIndex} onFeedTypeChange={handleFeedTypeChange} onLike={like} onLikeDouble={likeOnly} onSave={save} onComment={setCommentOf} onShare={handleShare} onDelete={del} onSoundTap={setSoundTrackId} />)}
                  </div>
                  {/* Desktop prev/next — no swipe on desktop, so surface arrows to the right of the column. */}
                  <div className="hidden md:flex flex-col gap-3 absolute left-full ml-4 top-1/2 -translate-y-1/2 z-20">
                    <button onClick={() => scrollFeed(-1)} disabled={activeIndex <= 0} aria-label={t('reviews.prevPost')}
                      className="w-11 h-11 rounded-full bg-gray-800/90 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors">
                      <ChevronUp size={22} />
                    </button>
                    <button onClick={() => scrollFeed(1)} disabled={activeIndex >= reviews.length - 1} aria-label={t('reviews.nextPost')}
                      className="w-11 h-11 rounded-full bg-gray-800/90 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors">
                      <ChevronDown size={22} />
                    </button>
                  </div>
                </>
          )}

          {/* Explore / Search */}
          {tab === 'explore' && (
            <div className="h-dvh flex flex-col bg-black overflow-hidden">
              {/* Search bar + mode toggle */}
              <div className="flex-shrink-0 pt-12 px-4 pb-3 border-b border-gray-800 space-y-2">
                <div className="flex items-center gap-2 bg-gray-900 rounded-2xl px-4 py-2.5">
                  <Search size={18} className="text-gray-500 flex-shrink-0" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); searchMode === 'review' ? doSearch(e.target.value) : doUserSearch(e.target.value) }}
                    placeholder={searchMode === 'review' ? t('reviews.searchPlaceholderReview') : t('reviews.searchPlaceholderUser')}
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchResults([]); setUserResults([]); setSearchError(false); setUserSearchError(false) }}>
                      <X size={16} className="text-gray-500" />
                    </button>
                  )}
                </div>
                {/* Segmented control */}
                <div className="flex bg-gray-900 rounded-xl p-1 gap-1">
                  <button onClick={() => { setSearchMode('review'); setUserResults([]); if (searchQuery) doSearch(searchQuery) }} className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors ${searchMode === 'review' ? 'bg-white text-black' : 'text-gray-400'}`}>{t('reviews.searchModePlaces')}</button>
                  <button onClick={() => { setSearchMode('user'); setSearchResults([]); if (searchQuery) doUserSearch(searchQuery) }} className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-colors ${searchMode === 'user' ? 'bg-white text-black' : 'text-gray-400'}`}>{t('reviews.searchModeUsers')}</button>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto">
                {searchMode === 'review' && searching && (
                  <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>
                )}
                {searchMode === 'review' && !searching && searchQuery && searchError && (
                  <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                    <AlertCircle size={36} className="opacity-20" />
                    <p className="text-sm">{t('reviews.searchError')}</p>
                  </div>
                )}
                {searchMode === 'review' && !searching && !searchError && searchQuery && searchResults.length === 0 && (
                  <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                    <Search size={36} className="opacity-20" />
                    <p className="text-sm">{t('reviews.searchNoResults', { q: searchQuery })}</p>
                  </div>
                )}
                {searchMode === 'review' && !searching && searchResults.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-xs px-4 py-3">{t('reviews.searchResultCount', { n: String(searchResults.length) })}</p>
                    <div className="grid grid-cols-2 gap-px bg-gray-800">
                      {searchResults.map(r => {
                        const thumb = r.photos?.[0]
                        return (
                          <div key={r.id} className="relative aspect-[4/5] bg-gray-900">
                            {thumb
                              ? <Image src={thumb} alt="" fill className="object-cover" sizes="50vw" />
                              : <div className="absolute inset-0 flex items-center justify-center p-3"><p className="text-white text-xs text-center line-clamp-5">{r.body}</p></div>}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-2">
                              <p className="text-white text-xs font-semibold line-clamp-1">{r.place_name}</p>
                              {r.body && <p className="text-gray-300 text-[10px] line-clamp-1 mt-0.5">{r.body}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-white text-[10px] flex items-center gap-0.5"><Heart size={9} className="fill-white" /> {r.like_count}</span>
                                {r.rating > 0 && <span className="text-amber-400 text-[10px]">{'\u2605'.repeat(r.rating)}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!searchQuery && searchMode === 'review' && (
                  <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                    <Search size={48} className="opacity-20" />
                    <p className="text-sm">{t('reviews.searchHintReview')}</p>
                  </div>
                )}
                {/* User search results */}
                {searchMode === 'user' && <>
                  {userSearching && <div className="flex justify-center pt-12"><Loader2 size={22} className="text-white animate-spin" /></div>}
                  {!userSearching && searchQuery && userSearchError && (
                    <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                      <AlertCircle size={36} className="opacity-20" />
                      <p className="text-sm">{t('reviews.searchError')}</p>
                    </div>
                  )}
                  {!userSearching && !userSearchError && searchQuery && userResults.length === 0 && (
                    <div className="flex flex-col items-center pt-16 text-gray-500 gap-2">
                      <User size={36} className="opacity-20" />
                      <p className="text-sm">{t('reviews.userSearchNoResults')}</p>
                    </div>
                  )}
                  {!userSearching && userResults.length > 0 && (
                    <div className="divide-y divide-gray-800">
                      {userResults.map(u => {
                        const uname = u.full_name || t('reviews.anonymous')
                        return (
                          <Link key={u.id} href={`/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors">
                            {u.avatar_url
                              ? <Image src={u.avatar_url} alt={uname} width={44} height={44} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                              : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-bold">{uname[0]?.toUpperCase()}</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{uname}</p>
                              <p className="text-gray-500 text-xs">{t('reviews.userFollowStats', { followers: String(u.follower_count), following: String(u.following_count) })}</p>
                            </div>
                            <button onClick={e => { e.preventDefault(); toggleFollow(u.id) }} className={`text-xs font-semibold px-4 py-1.5 rounded-full flex-shrink-0 transition-colors ${u.is_following ? 'bg-gray-700 text-white' : 'bg-white text-black'}`}>{u.is_following ? t('reviews.following') : t('reviews.follow')}</button>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                  {!searchQuery && (
                    <div className="flex flex-col items-center pt-20 text-gray-600 gap-3 px-8 text-center">
                      <User size={48} className="opacity-20" />
                      <p className="text-sm">{t('reviews.searchHintUser')}</p>
                    </div>
                  )}
                </>}
              </div>
            </div>
          )}

          {/* Profile (TikTok style) */}
          {tab === 'profile' && (
            me
              ? <ProfileTab userId={me} />
              : <div className="h-dvh flex items-center justify-center">
                  <Link href="/login" className="text-[#fe2c55] text-sm font-semibold">{t('reviews.loginToViewProfile')}</Link>
                </div>
          )}

          {/* Inbox - notifications */}
          {tab === 'inbox' && (
            <InboxTab
              notifs={notifs}
              notifsLoading={notifsLoading}
              notifsError={notifsError}
              hotPlaces={hotPlaces}
              hotPlacesLoading={hotPlacesLoading}
              onSetTab={handleSetTab}
              onFeedTypeChange={handleFeedTypeChange}
              userPrefs={userPrefs}
            />
          )}
        </div>
      </div>

      <TikNav tab={tab} setTab={handleSetTab} userId={me} />

      {commentOf && <CommentDrawer review={commentOf} me={me} onClose={() => setCommentOf(null)} onAdded={addComment} />}
      {shareOf && <ShareModal review={shareOf} onClose={() => setShareOf(null)} />}
      {soundTrackId && <SoundSheet trackId={soundTrackId} onClose={() => setSoundTrackId(null)} />}
    </div>
  )
}
