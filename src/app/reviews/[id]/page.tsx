import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import ReviewBackButton from './ReviewBackButton'
import ReviewCommentButton from './ReviewCommentButton'
import ReviewLikeButton from './ReviewLikeButton'
import ReviewSaveButton from './ReviewSaveButton'
import ReviewShareButton from './ReviewShareButton'
import ReviewMusicCard from '../ReviewMusicCard'

interface Props {
  params: { id: string }
}

async function getReview(id: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('reviews')
    .select(`
      id, user_id, place_name, place_address, rating, body,
      photos, is_verified, like_count, comment_count, created_at, music,
      profiles(full_name, avatar_url)
    `)
    .eq('id', id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .single()
  return data
}

async function getLikeStatus(reviewId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('review_likes')
    .select('id')
    .eq('review_id', reviewId)
    .eq('user_id', user.id)
    .maybeSingle()
  return !!data
}

async function getSaveStatus(reviewId: string): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('review_saves')
    .select('id')
    .eq('review_id', reviewId)
    .eq('user_id', user.id)
    .maybeSingle()
  return !!data
}

// reviews.comment_count drifts from reality (see comments API route for root cause: the
// DB trigger that maintains it is blocked by RLS for ordinary users). Compute the real
// count directly instead of trusting the column, so the page always shows the truth.
async function getCommentCount(reviewId: string): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('review_comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', reviewId)
  return count ?? 0
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const review = await getReview(params.id)
  if (!review) return { title: 'Review | TappyAI' }

  const desc = `${review.body.slice(0, 150)}${review.body.length > 150 ? '...' : ''}`

  return {
    title: `${'★'.repeat(review.rating)} ${review.place_name} | TappyAI`,
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

const RATING_LABEL: Record<number, string> = {
  1: 'Kém', 2: 'Tạm ổn', 3: 'Bình thường', 4: 'Ngon', 5: 'Xuất sắc',
}

export default async function ReviewDetailPage({ params }: Props) {
  const [review, initialLiked, initialSaved, commentCount] = await Promise.all([
    getReview(params.id),
    getLikeStatus(params.id),
    getSaveStatus(params.id),
    getCommentCount(params.id),
  ])
  if (!review) notFound()

  const author = review.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null
  const firstName = author?.full_name?.split(' ').pop() || 'Ẩn danh'
  const heroPhoto = review.photos?.[0] ?? null
  const extraPhotos = review.photos?.slice(1) ?? []

  return (
    <div className="min-h-dvh bg-[#0a0a0a]">

      {/* ─── Hero ─── */}
      <div className="relative w-full h-[55vh]">
        {heroPhoto ? (
          <Image
            src={heroPhoto}
            alt={review.place_name}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #1c0d00 0%, #2a1500 50%, #0f0f0f 100%)' }}
          />
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)' }}
        />

        {/* Back button */}
        <ReviewBackButton />

        {/* Bottom overlay: rating chips + name + address + author */}
        <div className="absolute bottom-0 left-0 right-4 px-5 pb-7 z-10">
          {/* Pills row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-bold text-white"
              style={{ background: 'rgba(255,107,53,0.85)' }}
            >
              {'★'.repeat(review.rating)} {review.rating}/5
            </span>
            {RATING_LABEL[review.rating] && (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                {RATING_LABEL[review.rating]}
              </span>
            )}
            {review.is_verified && (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold text-white"
                style={{ background: 'rgba(29,158,117,0.8)' }}
              >
                ✓ Xác nhận
              </span>
            )}
          </div>

          {/* Place name */}
          <h1
            className="text-white font-black text-2xl leading-tight mb-1.5"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            {review.place_name}
          </h1>

          {/* Address */}
          {review.place_address && (
            <div className="flex items-center gap-1.5 mb-3">
              <MapPin size={12} className="text-gray-300 flex-shrink-0" />
              <span className="text-gray-300 text-sm leading-snug">{review.place_address}</span>
            </div>
          )}

          {/* Author row */}
          <Link href={`/users/${review.user_id}`} className="inline-flex items-center gap-2">
            {author?.avatar_url ? (
              <Image
                src={author.avatar_url}
                alt={firstName}
                width={28}
                height={28}
                className="rounded-full ring-1 ring-white/30 flex-shrink-0"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #ff6b35, #e91e8c)' }}
              >
                {firstName[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-white text-sm font-semibold leading-none">{author?.full_name || 'Ẩn danh'}</span>
            <span className="text-gray-400 text-xs">· {timeAgo(review.created_at)}</span>
          </Link>
        </div>
      </div>

      {/* ─── Action bar — identical layout to main feed right-side buttons ───
          right = max(0.75rem, 50vw - 392px): tracks the max-w-container-content (768px)
          column's right edge on wide screens; below the ~808px crossover it clamps to the
          original 0.75rem (right-3), so mobile/tablet spacing is unchanged. */}
      <div className="fixed right-[max(0.75rem,calc(50vw-392px))] bottom-8 z-40 flex flex-col items-center gap-5">
        {/* ❤️ Like */}
        <ReviewLikeButton
          reviewId={params.id}
          initialLiked={initialLiked}
          initialCount={review.like_count}
        />
        {/* 💬 Comment */}
        <ReviewCommentButton reviewId={params.id} initialCount={commentCount} />
        {/* 🔖 Save */}
        <ReviewSaveButton reviewId={params.id} initialSaved={initialSaved} />
        {/* ↗ Share */}
        <ReviewShareButton
          reviewId={params.id}
          placeName={review.place_name}
          body={review.body}
          variant="bar"
        />
      </div>

      {/* ─── Content card — slides over hero ─── */}
      <div className="relative z-10 -mt-6 rounded-t-[28px] bg-[#111111] min-h-[50vh] px-5 pt-6 pb-28">
        {/* Content column — caps text/photo readability on wide screens; the card's own
            background/padding above stays full-bleed so the "slide over hero" look is unchanged. */}
        <div className="mx-auto w-full max-w-container-content">

        {/* Review body — pr-14 leaves room for the fixed action bar */}
        {review.body ? (
          <p className="text-gray-200 text-base leading-[1.8] whitespace-pre-wrap pr-14">
            {review.body}
          </p>
        ) : (
          <p className="text-gray-600 text-sm italic pr-14">Không có nội dung mô tả.</p>
        )}

        {/* Attached music */}
        {review.music && (
          <div className="mt-6">
            <ReviewMusicCard
              playKey={review.id}
              trackId={review.music.trackId}
              startSec={review.music.startSec}
              volume={review.music.volume}
            />
          </div>
        )}

        {/* Extra photos grid */}
        {extraPhotos.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {extraPhotos.map((url: string, i: number) => (
              <div key={i} className="relative aspect-square rounded-2xl overflow-hidden">
                <Image src={url} alt="" fill className="object-cover" sizes="45vw" />
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="mt-8 border-t border-white/6" />

        {/* CTA */}
        <div
          className="mt-6 p-4 rounded-2xl"
          style={{ background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.18)' }}
        >
          <p className="text-gray-400 text-sm mb-3 leading-snug">
            Muốn biết thêm về <span className="font-semibold text-white">{review.place_name}</span>?
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-full"
            style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #e91e8c 100%)' }}
          >
            🤖 Hỏi Tappy
          </Link>
        </div>
        </div>
      </div>
    </div>
  )
}
