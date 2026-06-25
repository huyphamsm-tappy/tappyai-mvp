'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import BottomNav from '@/components/BottomNav'
import { Heart, Star, MapPin, CheckCircle, MessageCircle, X, Send, Loader2, PenLine } from 'lucide-react'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày trước`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} tháng trước`
  return `${Math.floor(months / 12)} năm trước`
}

interface ReviewProfile {
  full_name: string | null
  avatar_url: string | null
}

interface Comment {
  id: string
  body: string
  created_at: string
  user_id: string
  profiles: ReviewProfile | null
}

interface Review {
  id: string
  user_id: string
  place_id: string
  place_name: string
  place_address: string | null
  rating: number
  body: string
  photos: string[] | null
  is_verified: boolean
  like_count: number
  comment_count: number
  created_at: string
  liked_by_me: boolean
  profiles: ReviewProfile | null
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
      ))}
    </div>
  )
}

function CommentDrawer({ review, onClose, onCommentAdded }: {
  review: Review
  onClose: () => void
  onCommentAdded: (reviewId: string) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/reviews/${review.id}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .finally(() => setLoading(false))
  }, [review.id])

  const handleSend = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.comment) {
        setComments(prev => [...prev, data.comment])
        setText('')
        onCommentAdded(review.id)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-950 rounded-t-3xl max-h-[70vh] flex flex-col shadow-2xl">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <h3 className="font-semibold text-gray-900 dark:text-white">Bình luận ({comments.length})</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="text-primary-500 animate-spin" /></div>
          ) : comments.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
          ) : comments.map(c => {
            const name = c.profiles?.full_name?.split(' ').pop() || 'Ẩn danh'
            return (
              <div key={c.id} className="flex gap-2.5">
                {c.profiles?.avatar_url ? (
                  <Image src={c.profiles.avatar_url} alt={name} width={32} height={32} className="rounded-full flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">{name[0]?.toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <Link href={`/users/${c.user_id}`} className="text-xs font-semibold text-gray-900 dark:text-white hover:underline">{name}</Link>
                    <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed">{c.body}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <input
            type="text" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Viết bình luận..." maxLength={300}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 dark:text-white"
          />
          <button onClick={handleSend} disabled={!text.trim() || sending}
            className="w-9 h-9 bg-primary-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            {sending ? <Loader2 size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
          </button>
        </div>
      </div>
    </>
  )
}

function ReviewCard({ review, onLike, onComment }: {
  review: Review
  onLike: (id: string) => void
  onComment: (review: Review) => void
}) {
  const author = review.profiles
  const firstName = author?.full_name?.split(' ').pop() || 'Ẩn danh'
  const ago = timeAgo(review.created_at)

  return (
    <article className="card overflow-hidden">
      {review.photos && review.photos.length > 0 && (
        <div className="relative w-full aspect-video bg-gray-100 dark:bg-gray-800">
          <Image src={review.photos[0]} alt={review.place_name} fill className="object-cover" sizes="(max-width: 672px) 100vw, 672px" />
          {review.photos.length > 1 && (
            <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">+{review.photos.length - 1} ảnh</span>
          )}
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-tight">{review.place_name}</h3>
            <StarRating rating={review.rating} />
          </div>
          {review.place_address && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={11} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-400 truncate">{review.place_address}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{review.body}</p>
        <div className="flex items-center justify-between pt-1">
          <Link href={`/users/${review.user_id}`} className="flex items-center gap-2 group">
            {author?.avatar_url ? (
              <Image src={author.avatar_url} alt={firstName} width={28} height={28} className="rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:underline">{firstName}</span>
                {review.is_verified && <CheckCircle size={11} className="text-blue-500" />}
              </div>
              <span className="text-[10px] text-gray-400">{ago}</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={() => onLike(review.id)} className="flex items-center gap-1.5 group" aria-label={review.liked_by_me ? 'Bỏ thích' : 'Thích'}>
              <Heart size={18} className={`transition-all ${review.liked_by_me ? 'text-red-500 fill-red-500 scale-110' : 'text-gray-400 group-hover:text-red-400'}`} />
              <span className={`text-xs font-medium ${review.liked_by_me ? 'text-red-500' : 'text-gray-400'}`}>{review.like_count}</span>
            </button>
            <button onClick={() => onComment(review)} className="flex items-center gap-1.5 text-gray-400 hover:text-primary-500 transition-colors" aria-label="Bình luận">
              <MessageCircle size={16} />
              <span className="text-xs font-medium">{review.comment_count}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [sort, setSort] = useState<'latest' | 'trending'>('latest')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [commentReview, setCommentReview] = useState<Review | null>(null)

  const fetchReviews = useCallback(async (p: number, s: string, append = false) => {
    if (p === 0) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await fetch(`/api/reviews/feed?page=${p}&sort=${s}`)
      const data = await res.json()
      const fetched: Review[] = data.reviews || []
      setReviews(prev => append ? [...prev, ...fetched] : fetched)
      setHasMore(fetched.length >= 12)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    setPage(0)
    setReviews([])
    fetchReviews(0, sort)
  }, [sort, fetchReviews])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchReviews(next, sort, true)
  }

  const handleLike = async (id: string) => {
    const res = await fetch(`/api/reviews/${id}/like`, { method: 'POST' })
    if (!res.ok) return
    const { liked } = await res.json()
    setReviews(prev => prev.map(r => r.id === id
      ? { ...r, liked_by_me: liked, like_count: r.like_count + (liked ? 1 : -1) }
      : r
    ))
  }

  const handleCommentAdded = (reviewId: string) => {
    setReviews(prev => prev.map(r => r.id === reviewId
      ? { ...r, comment_count: r.comment_count + 1 }
      : r
    ))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Cộng đồng</h1>
          <div className="flex gap-1.5">
            {(['latest', 'trending'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sort === s ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                {s === 'latest' ? '🕐 Mới nhất' : '🔥 Trending'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="text-primary-500 animate-spin" /></div>
        ) : (
          <>
            {reviews.map(r => (
              <ReviewCard key={r.id} review={r} onLike={handleLike} onComment={setCommentReview} />
            ))}
            {hasMore && (
              <button onClick={loadMore} disabled={loadingMore} className="w-full py-3 text-sm text-primary-500 font-medium disabled:opacity-50">
                {loadingMore ? 'Đang tải...' : 'Xem thêm'}
              </button>
            )}
            {reviews.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-sm">Chưa có review nào. Hãy là người đầu tiên!</p>
              </div>
            )}
          </>
        )}
      </div>

      {commentReview && (
        <CommentDrawer
          review={commentReview}
          onClose={() => setCommentReview(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}

      {/* FAB — Viết rev