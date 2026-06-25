'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { Heart, Star, MessageCircle, X, Send, Loader2, PenLine, ChevronLeft, ChevronRight, MoreVertical, Trash2, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày`
  return `${Math.floor(days / 30)} tháng`
}

interface ReviewProfile { full_name: string | null; avatar_url: string | null }
interface Comment { id: string; body: string; created_at: string; user_id: string; profiles: ReviewProfile | null }
interface Review {
  id: string; user_id: string; place_name: string; place_address: string | null
  rating: number; body: string; photos: string[] | null; is_verified: boolean
  like_count: number; comment_count: number; created_at: string
  liked_by_me: boolean; profiles: ReviewProfile | null
}

// Photo carousel with swipe
function PhotoCarousel({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0)
  const startX = useRef(0)

  const prev = () => setIdx(i => Math.max(0, i - 1))
  const next = () => setIdx(i => Math.min(photos.length - 1, i + 1))

  return (
    <div
      className="absolute inset-0"
      onTouchStart={e => { startX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        const dx = startX.current - e.changedTouches[0].clientX
        if (dx > 50) next()
        else if (dx < -50) prev()
      }}
    >
      <Image
        src={photos[idx]}
        alt=""
        fill
        className="object-cover"
        sizes="100vw"
        priority={idx === 0}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

      {/* Nav arrows */}
      {photos.length > 1 && (
        <>
          {idx > 0 && (
            <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 rounded-full flex items-center justify-center">
              <ChevronLeft size={18} className="text-white" />
            </button>
          )}
          {idx < photos.length - 1 && (
            <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 rounded-full flex items-center justify-center">
              <ChevronRight size={18} className="text-white" />
            </button>
          )}
          {/* Dots */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white scale-125' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Comment drawer
function CommentDrawer({ review, onClose, onCommentAdded }: {
  review: Review; onClose: () => void; onCommentAdded: (id: string) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/reviews/${review.id}/comments`)
      .then(r => r.json()).then(d => setComments(d.comments || []))
      .finally(() => setLoading(false))
  }, [review.id])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.comment) {
        setComments(prev => [...prev, data.comment])
        setText('')
        onCommentAdded(review.id)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } finally { setSending(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 rounded-t-3xl max-h-[70vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800 flex-shrink-0">
          <h3 className="font-semibold text-white">Bình luận ({comments.length})</h3>
          <button onClick={onClose} className="text-gray-400 p-1"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="text-white animate-spin" /></div>
          ) : comments.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">Chưa có bình luận nào</p>
          ) : comments.map(c => {
            const name = c.profiles?.full_name?.split(' ').pop() || 'Ẩn danh'
            return (
              <div key={c.id} className="flex gap-2.5">
                {c.profiles?.avatar_url ? (
                  <Image src={c.profiles.avatar_url} alt={name} width={32} height={32} className="rounded-full flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{name[0]?.toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1">
                  <span className="text-xs font-semibold text-white">{name}</span>
                  <span className="text-[10px] text-gray-500 ml-2">{timeAgo(c.created_at)}</span>
                  <p className="text-sm text-gray-300 mt-0.5">{c.body}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800 flex-shrink-0">
          <input type="text" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Viết bình luận..." maxLength={300}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-700 bg-gray-900 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <button onClick={handleSend} disabled={!text.trim() || sending}
            className="w-9 h-9 bg-primary-500 disabled:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
            {sending ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
          </button>
        </div>
      </div>
    </>
  )
}

// Menu options (delete/hide) for own posts
function PostMenu({ reviewId, onDelete, onClose }: { reviewId: string; onDelete: () => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Xoá bài viết này?')) return
    setLoading(true)
    const res = await fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' })
    if (res.ok) onDelete()
    setLoading(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="absolute top-10 right-0 z-50 bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl w-44">
        <button onClick={handleDelete} disabled={loading}
          className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-gray-800 text-sm font-medium transition-colors">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          Xoá bài
        </button>
        <button onClick={async () => {
          setLoading(true)
          await fetch(`/api/reviews/${reviewId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: true }) })
          setLoading(false); onDelete(); onClose()
        }} disabled={loading} className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-gray-800 text-sm font-medium transition-colors border-t border-gray-800">
          <EyeOff size={16} /> Ẩn bài
        </button>
      </div>
    </>
  )
}

// Single TikTok-style post
function TikTokPost({ review, currentUserId, onLike, onComment, onDelete }: {
  review: Review; currentUserId: string | null
  onLike: (id: string) => void; onComment: (r: Review) => void; onDelete: (id: string) => void
}) {
  const author = review.profiles
  const firstName = author?.full_name?.split(' ').pop() || 'Ẩn danh'
  const photos = review.photos?.filter(Boolean) || []
  const isOwner = currentUserId === review.user_id
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="relative w-full h-dvh flex-shrink-0 bg-black snap-start overflow-hidden">
      {/* Background photo */}
      {photos.length > 0 ? (
        <PhotoCarousel photos={photos} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-950" />
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-12 pb-4">
        <span className="text-white/70 text-xs bg-black/30 px-2 py-1 rounded-full">{timeAgo(review.created_at)} trước</span>
        {isOwner && (
          <div className="relative">
            <button onClick={() => setShowMenu(v => !v)} className="w-8 h-8 bg-black/30 rounded-full flex items-center justify-center">
              <MoreVertical size={18} className="text-white" />
            </button>
            {showMenu && <PostMenu reviewId={review.id} onDelete={() => onDelete(review.id)} onClose={() => setShowMenu(false)} />}
          </div>
        )}
      </div>

      {/* Right action bar */}
      <div className="absolute right-3 bottom-32 z-10 flex flex-col items-center gap-5">
        {/* Avatar */}
        <Link href={`/users/${review.user_id}`} className="relative">
          {author?.avatar_url ? (
            <Image src={author.avatar_url} alt={firstName} width={44} height={44} className="rounded-full ring-2 ring-white" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-primary-500 ring-2 ring-white flex items-center justify-center">
              <span className="text-white text-sm font-bold">{firstName[0]?.toUpperCase()}</span>
            </div>
          )}
        </Link>

        {/* Like */}
        <button onClick={() => onLike(review.id)} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 bg-black/30 rounded-full flex items-center justify-center">
            <Heart size={24} className={review.liked_by_me ? 'text-red-500 fill-red-500' : 'text-white'} />
          </div>
          <span className="text-white text-xs font-semibold">{review.like_count}</span>
        </button>

        {/* Comment */}
        <button onClick={() => onComment(review)} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 bg-black/30 rounded-full flex items-center justify-center">
            <MessageCircle size={22} className="text-white" />
          </div>
          <span className="text-white text-xs font-semibold">{review.comment_count}</span>
        </button>

        {/* Star rating */}
        {review.rating > 0 && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 bg-black/30 rounded-full flex items-center justify-center">
              <Star size={22} className="text-amber-400 fill-amber-400" />
            </div>
            <span className="text-white text-xs font-semibold">{review.rating}/5</span>
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-3 right-16 z-10">
        <Link href={`/users/${review.user_id}`} className="flex items-center gap-2 mb-2">
          <span className="text-white font-bold text-sm">@{author?.full_name?.replace(/\s+/g, '').toLowerCase() || 'user'}</span>
        </Link>
        {review.place_name !== 'Chia sẻ' && (
          <p className="text-white/80 text-xs mb-1">📍 {review.place_name}</p>
        )}
        {review.body && (
          <p className="text-white text-sm leading-relaxed line-clamp-3">{review.body}</p>
        )}
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [commentReview, setCommentReview] = useState<Review | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null))
  }, [supabase])

  const fetchReviews = useCallback(async (p: number, append = false) => {
    try {
      const res = await fetch(`/api/reviews/feed?page=${p}&sort=latest`)
      const data = await res.json()
      const fetched: Review[] = data.reviews || []
      setReviews(prev => append ? [...prev, ...fetched] : fetched)
      setHasMore(fetched.length >= 12)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchReviews(0) }, [fetchReviews])

  // Infinite scroll via IntersectionObserver on last item
  useEffect(() => {
    if (!hasMore || loading) return
    const last = containerRef.current?.lastElementChild
    if (!last) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setPage(p => { const next = p + 1; fetchReviews(next, true); return next })
      }
    }, { threshold: 0.5 })
    obs.observe(last)
    return () => obs.disconnect()
  }, [reviews, hasMore, loading, fetchReviews])

  const handleLike = async (id: string) => {
    const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
    if (!res.ok) return
    const { liked } = await res.json()
    setReviews(prev => prev.map(r => r.id === id
      ? { ...r, liked_by_me: liked, like_count: r.like_count + (liked ? 1 : -1) } : r))
  }

  const handleDelete = (id: string) => setReviews(prev => prev.filter(r => r.id !== id))
  const handleCommentAdded = (id: string) => setReviews(prev => prev.map(r => r.id === id ? { ...r, comment_count: r.comment_count + 1 } : r))

  if (loading) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <Loader2 size={32} className="text-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-black">
      {/* TikTok-style snap scroll feed */}
      <div ref={containerRef} className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {reviews.map(r => (
          <TikTokPost
            key={r.id}
            review={r}
            currentUserId={currentUserId}
            onLike={handleLike}
            onComment={setCommentReview}
            onDelete={handleDelete}
          />
        ))}
        {reviews.length === 0 && (
          <div className="h-dvh flex flex-col items-center justify-center text-white">
            <p className="text-5xl mb-4">📸</p>
            <p className="text-lg font-semibold mb-1">Chưa có bài nào</p>
            <p className="text-gray-400 text-sm mb-6">Hãy là người đầu tiên chia sẻ!</p>
            <Link href="/reviews/new" className="bg-primary-500 text-white px-6 py-3 rounded-full font-semibold">Đăng bài ngay</Link>
          </div>
        )}
      </div>

      {/* FAB */}
      <Link
        href="/reviews/new"
        className="fixed bottom-20 right-4 z-40 w-12 h-12 bg-primary-500 hover:bg-primary-600 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95"
      >
        <PenLine size={20} className="text-white" />
      </Link>

      {commentReview && (
        <CommentDrawer
          review={commentReview}
          onClose={() => setCommentReview(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}

      <BottomNav />
    </div>
  )
}
