'use client'

// Shared building blocks of the Reviews feed — the types, time/name helpers, and the
// Post / CommentDrawer / ShareModal components used by BOTH the main feed (page.tsx)
// and the profile clip viewer (ProfileTab.tsx). Extracted verbatim from page.tsx:
// Next.js forbids extra named exports from a page file, and ProfileTab (which the
// profile-grid regression test imports) had to move out for exactly that reason.

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Heart, MessageCircle, Bookmark, Share2,
  ChevronLeft, ChevronRight, MoreVertical, Trash2, EyeOff,
  X, Loader2, Plus, AlertCircle,
} from 'lucide-react'
import VideoPlayer, { type VideoPlayerHandle } from '@/components/explore/VideoPlayer'
import { attachWatchTracker } from '@/lib/explore/behaviorTracker'
import ReviewMusicDisc from './ReviewMusicDisc'
import { useTranslation } from '@/lib/i18n/useTranslation'

/* ─── types ─── */
export interface Profile { full_name: string | null; avatar_url: string | null }
export interface Comment { id: string; body: string; created_at: string; user_id: string; parent_comment_id: string | null; profiles: Profile | null; reactions: Record<string, number>; my_reaction: string | null }
export interface Review {
  id: string; user_id: string; place_name: string; place_address: string | null
  rating: number; body: string; photos: string[] | null
  like_count: number; comment_count: number; save_count?: number; created_at: string
  liked_by_me: boolean; saved_by_me: boolean; profiles: Profile | null
  content_type?: string | null; media_url?: string | null; thumbnail?: string | null
  source_type?: string | null; source_url?: string | null; hashtags?: string[] | null
  watch_time_avg?: number; score?: number
  music?: { version: number; trackId: string; startSec: number; volume: number; origin?: 'original' | 'attached' } | null
}

// A "share-only" post (clip/photo posted without adding a place) carries a
// sentinel place_name, so it must not show a 📍 chip or count as a hot place.
// Includes the legacy no-diacritic value written by older builds.
const SHARE_ONLY_NAMES = new Set(['Chia sẻ', 'Chia se'])
export const isShareOnlyName = (n?: string | null) => !n?.trim() || SHARE_ONLY_NAMES.has(n.trim())

export function ago(d: string, t: (key: string, vars?: Record<string, string>) => string) {
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

/* ─── Comment reactions (free-text keys; must mirror ALLOWED in the reactions API) ─── */
const COMMENT_REACTIONS: { key: string; emoji: string }[] = [
  { key: 'like', emoji: '👍' },
  { key: 'love', emoji: '❤️' },
  { key: 'haha', emoji: '😂' },
  { key: 'wow', emoji: '😮' },
  { key: 'sad', emoji: '😢' },
  { key: 'angry', emoji: '😡' },
]
const reactionEmoji = (key: string) => COMMENT_REACTIONS.find(r => r.key === key)?.emoji || '👍'

/* ─── Comment drawer ─── */
export function CommentDrawer({ review, me, onClose, onAdded }: { review: Review; me: string | null; onClose: () => void; onAdded: (id: string, count: number) => void }) {
  const { t } = useTranslation()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  // Local, authoritative count so the header updates the moment a comment is
  // posted or deleted (the review.comment_count prop is a stale snapshot).
  const [count, setCount] = useState(review.comment_count)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadComments = useCallback(() => {
    setLoadError(false)
    return fetch(`/api/reviews/${review.id}/comments`)
      .then(r => { if (!r.ok) throw new Error('load_failed'); return r.json() })
      .then(d => { setComments(d.comments || []); if (typeof d.count === 'number') setCount(d.count) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [review.id])
  useEffect(() => { loadComments() }, [loadComments])

  const del = async (commentId: string) => {
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments?commentId=${commentId}`, { method: 'DELETE' })
      if (!res.ok) return
      const d = await res.json()
      // Deleting a parent cascades to its replies in the DB — mirror that locally.
      setComments(p => p.filter(c => c.id !== commentId && c.parent_comment_id !== commentId))
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
    // One-level threading (web/TikTok parity): replying to a reply attaches to the same top-level
    // thread (its parent), not under the reply itself — so threads never nest deeper than one level.
    const parentId = replyTo ? (replyTo.parent_comment_id ?? replyTo.id) : null
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text.trim(), parentId }) })
      const d = await res.json()
      if (res.ok) {
        setComments(p => [...p, d.comment])
        setText('')
        setReplyTo(null)
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
  // One reaction per user: change shifts it, tapping the current one removes it.
  const react = async (commentId: string, key: string) => {
    if (!me) { window.location.href = '/login?returnTo=' + encodeURIComponent('/reviews'); return }
    setPickerFor(null)
    const target = comments.find(c => c.id === commentId)
    if (!target) return
    const removing = target.my_reaction === key
    setComments(p => p.map(c => {
      if (c.id !== commentId) return c
      const reactions = { ...c.reactions }
      if (c.my_reaction) reactions[c.my_reaction] = (reactions[c.my_reaction] || 0) - 1
      if (!removing) reactions[key] = (reactions[key] || 0) + 1
      Object.keys(reactions).forEach(k => { if (reactions[k] <= 0) delete reactions[k] })
      return { ...c, reactions, my_reaction: removing ? null : key }
    }))
    try {
      const res = removing
        ? await fetch(`/api/comments/${commentId}/reactions`, { method: 'DELETE' })
        : await fetch(`/api/comments/${commentId}/reactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction: key }) })
      if (!res.ok) throw new Error('react_failed')
    } catch {
      loadComments() // reconcile with the server on failure
    }
  }
  const startReply = (c: Comment) => { setReplyTo(c); setPickerFor(null); setTimeout(() => inputRef.current?.focus(), 50) }
  const replyName = (c: Comment) => c.profiles?.full_name?.split(' ').pop() || t('reviews.anonymous')

  const renderComment = (c: Comment, isReply: boolean) => {
    const n = replyName(c)
    const total = Object.values(c.reactions || {}).reduce((a, b) => a + b, 0)
    const shown = Object.keys(c.reactions || {}).filter(k => c.reactions[k] > 0)
    const av = isReply ? 26 : 32
    return (
      <div key={c.id} className={`flex gap-2.5 ${isReply ? 'ml-10 mt-3' : ''}`}>
        {c.profiles?.avatar_url ? <Image src={c.profiles.avatar_url} alt={n} width={av} height={av} className="rounded-full object-cover flex-shrink-0" style={{ width: av, height: av }} />
          : <div className="rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ width: av, height: av }}>{n[0]?.toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white">{n} <span className="text-gray-500 font-normal">{ago(c.created_at, t)}</span></p>
          <p className="text-sm text-gray-300 mt-0.5 break-words">{c.body}</p>
          <div className="flex items-center gap-3 mt-1 relative">
            <button onClick={() => setPickerFor(pickerFor === c.id ? null : c.id)}
              className={`text-xs font-medium transition-colors ${c.my_reaction ? 'text-pink-400' : 'text-gray-500 hover:text-pink-300'}`}>
              {c.my_reaction ? reactionEmoji(c.my_reaction) + ' ' + t('reviews.commentReact') : t('reviews.commentReact')}
            </button>
            <button onClick={() => startReply(c)} className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">{t('reviews.commentReply')}</button>
            {total > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                {shown.slice(0, 3).map(k => <span key={k}>{reactionEmoji(k)}</span>)}
                <span className="ml-0.5">{total}</span>
              </span>
            )}
            {pickerFor === c.id && (
              <div className="absolute -top-9 left-0 z-10 flex gap-1 bg-[#2a2a2a] rounded-full px-2 py-1.5 shadow-lg border border-gray-700">
                {COMMENT_REACTIONS.map(r => (
                  <button key={r.key} onClick={() => react(c.id, r.key)}
                    className={`text-lg leading-none hover:scale-125 transition-transform ${c.my_reaction === r.key ? 'scale-125' : ''}`}>{r.emoji}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {c.user_id === me && (
          <button onClick={() => del(c.id)} aria-label={t('reviews.commentDelete')} className="flex-shrink-0 self-start p-1 -mr-1 text-gray-500 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    )
  }

  const topLevel = comments.filter(c => !c.parent_comment_id)
  const repliesByParent = comments.reduce((acc, c) => {
    if (c.parent_comment_id) (acc[c.parent_comment_id] = acc[c.parent_comment_id] || []).push(c)
    return acc
  }, {} as Record<string, Comment[]>)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-[60px] left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] z-50 bg-[#1a1a1a] rounded-t-3xl max-h-[60vh] flex flex-col">
        <div className="flex justify-center py-2 flex-shrink-0"><div className="w-8 h-1 bg-gray-600 rounded-full" /></div>
        <div className="flex items-center px-4 pb-3 flex-shrink-0">
          <h3 className="font-semibold text-white flex-1">{t('reviews.commentsTitle', { n: String(count) })}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2 min-h-0" onClick={() => pickerFor && setPickerFor(null)}>
          {loading ? <div className="flex justify-center py-6"><Loader2 size={18} className="text-white animate-spin" /></div>
            : loadError ? <div className="flex flex-col items-center gap-2 py-6 text-gray-500"><AlertCircle size={20} className="opacity-60" /><p className="text-sm">{t('reviews.commentsLoadError')}</p></div>
            : topLevel.length === 0 ? <p className="text-center text-gray-500 text-sm py-6">{t('reviews.commentsEmpty')}</p>
            : topLevel.map(c => (
              <div key={c.id}>
                {renderComment(c, false)}
                {(repliesByParent[c.id] || []).map(rep => renderComment(rep, true))}
              </div>
            ))}
          <div ref={ref} />
        </div>
        {sendError && <p className="px-4 text-xs text-red-400 flex-shrink-0">{t('reviews.commentSendError')}</p>}
        {replyTo && (
          <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 bg-[#222]">
            <span className="text-xs text-gray-400 truncate">{t('reviews.commentReplyingTo', { name: replyName(replyTo) })}</span>
            <button onClick={() => setReplyTo(null)} className="text-xs text-gray-500 hover:text-gray-300 flex-shrink-0 ml-2">{t('reviews.commentCancelReply')}</button>
          </div>
        )}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0">
          <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={replyTo ? t('reviews.commentReplyingTo', { name: replyName(replyTo) }) : t('reviews.commentPlaceholder')} maxLength={300}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 text-sm px-4 py-2 rounded-full focus:outline-none" />
          <button onClick={send} disabled={!text.trim() || sending} className="text-pink-500 font-semibold text-sm disabled:opacity-40">{sending ? <Loader2 size={16} className="animate-spin" /> : t('reviews.commentSend')}</button>
        </div>
      </div>
    </>
  )
}

/* ─── Share modal ─── */
export function ShareModal({ review, onClose }: { review: Review; onClose: () => void }) {
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
export function Post({ r, me, feedType, renderVideo, active = false, showFeedTabs = true, onFeedTypeChange, onLike, onLikeDouble, onSave, onComment, onShare, onDelete, onSoundTap }: {
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
