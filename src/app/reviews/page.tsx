'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import BottomNav from '@/components/BottomNav'
import {
  Heart, Star, MessageCircle, X, Send, Loader2, PenLine,
  ChevronLeft, ChevronRight, MoreVertical, Trash2, EyeOff,
  Bookmark, Share2, Home, Search, Compass
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ`
  const dy = Math.floor(h / 24)
  return dy < 30 ? `${dy} ngày` : `${Math.floor(dy / 30)} tháng`
}

interface P { full_name: string | null; avatar_url: string | null }
interface Comment { id: string; body: string; created_at: string; user_id: string; profiles: P | null }
interface Review {
  id: string; user_id: string; place_name: string; place_address: string | null
  rating: number; body: string; photos: string[] | null
  like_count: number; comment_count: number; created_at: string
  liked_by_me: boolean; saved_by_me: boolean; profiles: P | null
}

function PhotoCarousel({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0)
  const sx = useRef(0)
  const prev = () => setIdx(i => Math.max(0, i - 1))
  const next = () => setIdx(i => Math.min(photos.length - 1, i + 1))
  return (
    <div className="absolute inset-0"
      onTouchStart={e => { sx.current = e.touches[0].clientX }}
      onTouchEnd={e => { const dx = sx.current - e.changedTouches[0].clientX; if (dx > 50) next(); else if (dx < -50) prev() }}>
      <Image src={photos[idx]} alt="" fill className="object-cover" sizes="100vw" priority={idx === 0} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/40" />
      {photos.length > 1 && <>
        {idx > 0 && <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm"><ChevronLeft size={18} className="text-white" /></button>}
        {idx < photos.length - 1 && <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm"><ChevronRight size={18} className="text-white" /></button>}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1">
          {photos.map((_, i) => <div key={i} className={`transition-all rounded-full ${i === idx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'}`} />)}
        </div>
      </>}
    </div>
  )
}

function CommentDrawer({ review, onClose, onCommentAdded }: { review: Review; onClose: () => void; onCommentAdded: (id: string) => void }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/reviews/${review.id}/comments`).then(r => r.json()).then(d => setComments(d.comments || [])).finally(() => setLoading(false))
  }, [review.id])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text.trim() }) })
      const data = await res.json()
      if (res.ok && data.comment) { setComments(p => [...p, data.comment]); setText(''); onCommentAdded(review.id); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) }
    } finally { setSending(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 rounded-t-3xl max-h-[70vh] flex flex-col lg:left-1/2 lg:-translate-x-1/2 lg:w-[420px]">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 bg-gray-700 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800 flex-shrink-0">
          <h3 className="font-semibold text-white">Bình luận ({comments.length})</h3>
          <button onClick={onClose} className="text-gray-400 p-1"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="text-white animate-spin" /></div>
            : comments.length === 0 ? <p className="text-center text-gray-500 text-sm py-8">Chưa có bình luận nào</p>
            : comments.map(c => {
              const n = c.profiles?.full_name?.split(' ').pop() || 'Ẩn danh'
              return <div key={c.id} className="flex gap-2.5">
                {c.profiles?.avatar_url ? <Image src={c.profiles.avatar_url} alt={n} width={32} height={32} className="rounded-full flex-shrink-0 mt-0.5" />
                  : <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-white text-xs font-bold">{n[0]?.toUpperCase()}</span></div>}
                <div><span className="text-xs font-semibold text-white">{n}</span><span className="text-[10px] text-gray-500 ml-2">{timeAgo(c.created_at)}</span><p className="text-sm text-gray-300 mt-0.5">{c.body}</p></div>
              </div>
            })}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0">
          <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Viết bình luận..." maxLength={300}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-700 bg-gray-900 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <button onClick={send} disabled={!text.trim() || sending} className="w-9 h-9 bg-primary-500 disabled:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
            {sending ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
          </button>
        </div>
      </div>
    </>
  )
}

function PostMenu({ reviewId, onDelete, onHide, onClose }: { reviewId: string; onDelete: () => void; onHide: () => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const del = async () => {
    if (!confirm('Xoá bài viết này?')) return
    setLoading(true)
    const res = await fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' })
    if (res.ok) onDelete()
    setLoading(false); onClose()
  }
  const hide = async () => {
    setLoading(true)
    await fetch(`/api/reviews/${reviewId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: true }) })
    setLoading(false); onHide(); onClose()
  }
  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="absolute top-10 right-0 z-50 bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl w-44">
        <button onClick={del} disabled={loading} className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-gray-800 text-sm font-medium">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Xoá bài
        </button>
        <button onClick={hide} disabled={loading} className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-gray-800 text-sm font-medium border-t border-gray-800">
          <EyeOff size={16} /> Ẩn bài
        </button>
      </div>
    </>
  )
}

function TikTokPost({ review, currentUserId, onLike, onSave, onComment, onDelete, onShare }: {
  review: Review; currentUserId: string | null
  onLike: (id: string) => void; onSave: (id: string) => void
  onComment: (r: Review) => void; onDelete: (id: string) => void
  onShare: (r: Review) => void
}) {
  const author = review.profiles
  const handle = '@' + (author?.full_name?.replace(/\s+/g, '').toLowerCase() || 'user')
  const photos = review.photos?.filter(Boolean) || []
  const isOwner = currentUserId === review.user_id
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative w-full h-dvh flex-shrink-0 bg-black snap-start overflow-hidden">
      {photos.length > 0 ? <PhotoCarousel photos={photos} /> : <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-950" />}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-12 pb-4">
        <span className="text-white/60 text-xs">{timeAgo(review.created_at)} trước</span>
        {isOwner && (
          <div className="relative">
            <button onClick={() => setShowMenu(v => !v)} className="w-8 h-8 bg-black/30 rounded-full flex items-center justify-center backdrop-blur-sm">
              <MoreVertical size={18} className="text-white" />
            </button>
            {showMenu && <PostMenu reviewId={review.id} onDelete={() => onDelete(review.id)} onHide={() => onDelete(review.id)} onClose={() => setShowMenu(false)} />}
          </div>
        )}
      </div>

      {/* Right actions */}
      <div className="absolute right-3 bottom-28 z-10 flex flex-col items-center gap-5">
        <Link href={`/users/${review.user_id}`}>
          {author?.avatar_url
            ? <Image src={author.avatar_url} alt={handle} width={44} height={44} className="rounded-full ring-2 ring-white" />
            : <div className="w-11 h-11 rounded-full bg-primary-500 ring-2 ring-white flex items-center justify-center"><span className="text-white text-sm font-bold">{(author?.full_name?.[0] || 'U').toUpperCase()}</span></div>}
        </Link>

        <ActionBtn icon={<Heart size={26} className={review.liked_by_me ? 'fill-red-500 text-red-500' : 'text-white'} />}
          label={review.like_count} onClick={() => onLike(review.id)} active={review.liked_by_me} />
        <ActionBtn icon={<MessageCircle size={24} className="text-white" />}
          label={review.comment_count} onClick={() => onComment(review)} />
        <ActionBtn icon={<Bookmark size={22} className={review.saved_by_me ? 'fill-amber-400 text-amber-400' : 'text-white'} />}
          label="Lưu" onClick={() => onSave(review.id)} active={review.saved_by_me} />
        <ActionBtn icon={<Share2 size={22} className="text-white" />}
          label="Chia sẻ" onClick={() => onShare(review)} />
        {review.rating > 0 && (
          <ActionBtn icon={<Star size={22} className="fill-amber-400 text-amber-400" />} label={`${review.rating}/5`} />
        )}
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-4 right-16 z-10">
        <Link href={`/users/${review.user_id}`} className="mb-1 block">
          <span className="text-white font-bold text-sm">{handle}</span>
        </Link>
        {review.place_name !== 'Chia sẻ' && (
          <p className="text-white/70 text-xs mb-1 flex items-center gap-1">📍 {review.place_name}</p>
        )}
        {review.body && <p className="text-white text-[13px] leading-relaxed line-clamp-3">{review.body}</p>}
      </div>
    </div>
  )
}

function ActionBtn({ icon, label, onClick, active }: { icon: React.ReactNode; label?: string | number; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-transform active:scale-90 ${active ? '' : 'opacity-90'}`}>
      <div className="w-11 h-11 bg-black/30 rounded-full flex items-center justify-center backdrop-blur-sm">{icon}</div>
      {label !== undefined && <span className="text-white text-xs font-semibold drop-shadow">{label}</span>}
    </button>
  )
}

// Share modal
function ShareModal({ review, onClose }: { review: Review; onClose: () => void }) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://tappyai.com'}/reviews/${review.id}`
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const nativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: review.place_name, text: review.body || 'Xem bài viết trên TappyAI', url })
    } else copy()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 rounded-t-3xl px-5 pt-5 pb-8 lg:left-1/2 lg:-translate-x-1/2 lg:w-[420px]">
        <div className="flex justify-center mb-4"><div className="w-10 h-1 bg-gray-700 rounded-full" /></div>
        <h3 className="text-white font-bold text-center mb-5">Chia sẻ bài viết</h3>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={nativeShare} className="flex flex-col items-center gap-2 p-4 bg-gray-900 rounded-2xl hover:bg-gray-800 transition-colors">
            <Share2 size={24} className="text-primary-400" />
            <span className="text-white text-sm font-medium">Chia sẻ</span>
          </button>
          <button onClick={copy} className="flex flex-col items-center gap-2 p-4 bg-gray-900 rounded-2xl hover:bg-gray-800 transition-colors">
            <div className="text-xl">{copied ? '✅' : '🔗'}</div>
            <span className="text-white text-sm font-medium">{copied ? 'Đã chép!' : 'Sao chép link'}</span>
          </button>
        </div>
        <p className="text-gray-500 text-xs text-center mt-4 truncate">{url}</p>
      </div>
    </>
  )
}

// Desktop left sidebar
function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-60 xl:w-72 px-4 py-8 gap-2 fixed left-[max(0px,calc(50%-630px))] top-0 h-full">
      <Link href="/" className="text-white font-black text-2xl mb-6 px-3">TappyAI</Link>
      {[
        { icon: <Home size={22} />, label: 'Trang chủ', href: '/' },
        { icon: <Compass size={22} />, label: 'Khám phá', href: '/reviews' },
        { icon: <Search size={22} />, label: 'Tìm kiếm', href: '/search' },
        { icon: <PenLine size={22} />, label: 'Đăng bài', href: '/reviews/new' },
        { icon: <Bookmark size={22} />, label: 'Đã lưu', href: '/profile/saved' },
        { icon: <MoreVertical size={22} />, label: 'Bài của tôi', href: '/profile/posts' },
      ].map(item => (
        <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:bg-white/10 transition-colors font-medium">
          {item.icon}<span>{item.label}</span>
        </Link>
      ))}
    </aside>
  )
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [commentReview, setCommentReview] = useState<Review | null>(null)
  const [shareReview, setShareReview] = useState<Review | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(0)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null))
  }, [supabase])

  const fetchReviews = useCallback(async (p: number, append = false) => {
    try {
      const res = await fetch(`/api/reviews/feed?page=${p}&sort=latest`)
      const data = await res.json()
      const fetched: Review[] = (data.reviews || []).map((r: Review) => ({ ...r, saved_by_me: r.saved_by_me ?? false }))
      setReviews(prev => append ? [...prev, ...fetched] : fetched)
      setHasMore(fetched.length >= 12)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReviews(0) }, [fetchReviews])

  useEffect(() => {
    if (!hasMore || loading) return
    const last = containerRef.current?.lastElementChild
    if (!last) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { pageRef.current += 1; fetchReviews(pageRef.current, true) }
    }, { threshold: 0.5 })
    obs.observe(last)
    return () => obs.disconnect()
  }, [reviews, hasMore, loading, fetchReviews])

  const handleLike = async (id: string) => {
    const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
    if (!res.ok) return
    const { liked } = await res.json()
    setReviews(prev => prev.map(r => r.id === id ? { ...r, liked_by_me: liked, like_count: r.like_count + (liked ? 1 : -1) } : r))
  }

  const handleSave = async (id: string) => {
    const res = await fetch(`/api/reviews/${id}/save`, { method: 'POST' })
    if (!res.ok) return
    const { saved } = await res.json()
    setReviews(prev => prev.map(r => r.id === id ? { ...r, saved_by_me: saved } : r))
  }

  const handleDelete = (id: string) => setReviews(prev => prev.filter(r => r.id !== id))
  const handleCommentAdded = (id: string) => setReviews(prev => prev.map(r => r.id === id ? { ...r, comment_count: r.comment_count + 1 } : r))

  if (loading) return <div className="min-h-dvh bg-black flex items-center justify-center"><Loader2 size={32} className="text-white animate-spin" /></div>

  return (
    <div className="bg-black min-h-dvh">
      <DesktopSidebar />

      {/* Feed — centered on desktop */}
      <div className="lg:ml-60 xl:ml-72 flex justify-center">
        <div ref={containerRef} className="w-full max-w-[420px] h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
          {reviews.map(r => (
            <TikTokPost key={r.id} review={r} currentUserId={currentUserId}
              onLike={handleLike} onSave={handleSave}
              onComment={setCommentReview} onDelete={handleDelete} onShare={setShareReview} />
          ))}
          {reviews.length === 0 && (
            <div className="h-dvh flex flex-col items-center justify-center text-white">
              <p className="text-5xl mb-4">📸</p>
              <p className="text-lg font-semibold mb-1">Chưa có bài nào</p>
              <Link href="/reviews/new" className="mt-4 bg-primary-500 text-white px-6 py-3 rounded-full font-semibold">Đăng bài ngay</Link>
            </div>
          )}
        </div>
      </div>

      {/* FAB mobile */}
      <Link href="/reviews/new" className="fixed bottom-20 right-4 z-40 w-12 h-12 bg-primary-500 rounded-full shadow-lg flex items-center justify-center lg:hidden active:scale-95 transition-all">
        <PenLine size={20} className="text-white" />
      </Link>

      {commentReview && <CommentDrawer review={commentReview} onClose={() => setCommentReview(null)} onCommentAdded={handleCommentAdded} />}
      {shareReview && <ShareModal review={shareReview} onClose={() => setShareReview(null)} />}
      <BottomNav />
    </div>
  )
}
