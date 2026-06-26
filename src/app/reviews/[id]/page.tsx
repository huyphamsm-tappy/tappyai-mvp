import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Star, MapPin, CheckCircle, Heart, ArrowLeft } from 'lucide-react'
import ReviewShareButton from './ReviewShareButton'

interface Props {
  params: { id: string }
}

async function getReview(id: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('reviews')
    .select(`
      id, user_id, place_name, place_address, rating, body,
      photos, is_verified, like_count, comment_count, created_at,
      profiles(full_name, avatar_url)
    `)
    .eq('id', id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .single()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const review = await getReview(params.id)
  if (!review) return { title: 'Review | TappyAI' }

  const desc = `${review.body.slice(0, 150)}${review.body.length > 150 ? '...' : ''}`
  const stars = '⭐'.repeat(review.rating)

  return {
    title: `${stars} ${review.place_name} | TappyAI`,
    description: desc,
    openGraph: {
      title: `${review.place_name} — ${review.rating}/5 sao`,
      description: desc,
      images: review.photos?.[0] ? [{ url: review.photos[0] }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${review.place_name} — ${review.rating}/5 sao`,
      description: desc,
      images: review.photos?.[0] ? [review.photos[0]] : [],
    },
  }
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={18} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
      ))}
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} ngày trước`
  return `${Math.floor(days / 30)} tháng trước`
}

export default async function ReviewDetailPage({ params }: Props) {
  const review = await getReview(params.id)
  if (!review) notFound()

  const author = review.profiles as { full_name: string | null; avatar_url: string | null } | null
  const firstName = author?.full_name?.split(' ').pop() || 'Ẩn danh'

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header showBack backHref="/reviews" />

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/reviews" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="font-bold text-gray-900 dark:text-white truncate">{review.place_name}</h1>
          </div>
          <ReviewShareButton reviewId={params.id} placeName={review.place_name} body={review.body} />
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Photos */}
        {review.photos && review.photos.length > 0 && (
          <div className={`grid gap-2 ${review.photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {review.photos.map((url, i) => (
              <div key={i} className={`relative rounded-2xl overflow-hidden bg-gray-100 ${review.photos!.length === 1 ? 'aspect-video' : 'aspect-square'} ${i === 0 && review.photos!.length === 3 ? 'col-span-2' : ''}`}>
                <Image src={url} alt={`Ảnh ${i + 1}`} fill className="object-cover" sizes="(max-width: 672px) 50vw, 336px" />
              </div>
            ))}
          </div>
        )}

        {/* Review card */}
        <div className="card p-5 space-y-4">
          {/* Place + rating */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold text-gray-900 dark:text-white text-xl leading-tight">{review.place_name}</h2>
              <StarRating rating={review.rating} />
            </div>
            {review.place_address && (
              <div className="flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500">{review.place_address}</span>
              </div>
            )}
          </div>

          {/* Body */}
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{review.body}</p>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-3">
            <span className="flex items-center gap-1">
              <Heart size={14} className="text-red-400" /> {review.like_count} lượt thích
            </span>
            <span>💬 {review.comment_count ?? 0} bình luận</span>
          </div>

          {/* Author */}
          <Link href={`/users/${review.user_id}`} className="flex items-center gap-3 group">
            {author?.avatar_url ? (
              <Image src={author.avatar_url} alt={firstName} width={40} height={40} className="rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">{firstName[0]?.toUpperCase()}</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-900 dark:text-white group-hover:underline">{author?.full_name || 'Ẩn danh'}</span>
                {review.is_verified && (
                  <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-500 text-xs px-2 py-0.5 rounded-full">
                    <CheckCircle size={11} />
                    Đã xác nhận
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400">{timeAgo(review.created_at)}</span>
            </div>
          </Link>
        </div>

        {/* CTA for non-users */}
        <div className="card p-4 text-center space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">Tìm quán ngon, spa xịn, deal hot cùng Tappy!</p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            🤖 Mở TappyAI
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
