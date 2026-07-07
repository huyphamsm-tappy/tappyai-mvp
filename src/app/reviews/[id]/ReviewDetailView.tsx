'use client'

import Image from 'next/image'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import ReviewBackButton from './ReviewBackButton'
import ReviewCommentButton from './ReviewCommentButton'
import ReviewLikeButton from './ReviewLikeButton'
import ReviewSaveButton from './ReviewSaveButton'
import ReviewShareButton from './ReviewShareButton'
import ReviewMusicCard from '../ReviewMusicCard'
import VideoPlayer from '@/components/explore/VideoPlayer'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Author = { full_name: string | null; avatar_url: string | null } | null

type Review = {
  id: string
  user_id: string
  place_name: string
  place_address: string | null
  rating: number
  body: string
  photos: string[] | null
  is_verified: boolean | null
  like_count: number
  music: { trackId: string; startSec: number; volume: number } | null
  created_at: string
  content_type: string | null
  media_url: string | null
  thumbnail: string | null
  source_type: string | null
  source_url: string | null
  profiles: Author
}

interface Props {
  reviewId: string
  review: Review
  initialLiked: boolean
  initialSaved: boolean
  commentCount: number
}

const RATING_LABEL_KEY: Record<number, string> = {
  1: 'reviewDetail.rating1',
  2: 'reviewDetail.rating2',
  3: 'reviewDetail.rating3',
  4: 'reviewDetail.rating4',
  5: 'reviewDetail.rating5',
}

export default function ReviewDetailView({
  reviewId,
  review,
  initialLiked,
  initialSaved,
  commentCount,
}: Props) {
  const { t } = useTranslation()

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('reviewDetail.timeJustNow')
    if (mins < 60) return t('reviewDetail.timeMinutesAgo', { n: String(mins) })
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return t('reviewDetail.timeHoursAgo', { n: String(hrs) })
    const days = Math.floor(hrs / 24)
    if (days < 30) return t('reviewDetail.timeDaysAgo', { n: String(days) })
    return t('reviewDetail.timeMonthsAgo', { n: String(Math.floor(days / 30)) })
  }

  const author = review.profiles
  const anonymous = t('reviewDetail.anonymous')
  const firstName = author?.full_name?.split(' ').pop() || anonymous
  const heroPhoto = review.photos?.[0] ?? null
  const extraPhotos = review.photos?.slice(1) ?? []
  const isVideo = review.content_type === 'video' && !!review.media_url

  return (
    <div className="min-h-dvh bg-[#0a0a0a]">

      {/* ─── Hero ─── */}
      <div className="relative w-full h-[55vh]">
        {isVideo ? (
          // Video posts have no photos[] — play the clip itself (autoplay muted +
          // loop, tap the pill to unmute). Previously the hero fell through to the
          // dark gradient, so opening a clip showed a black screen.
          <VideoPlayer
            url={review.media_url!}
            thumbnail={review.thumbnail ?? undefined}
            sourceType={review.source_type ?? 'upload'}
            sourceUrl={review.source_url ?? undefined}
          />
        ) : heroPhoto ? (
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
            {RATING_LABEL_KEY[review.rating] && (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                {t(RATING_LABEL_KEY[review.rating])}
              </span>
            )}
            {review.is_verified && (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold text-white"
                style={{ background: 'rgba(29,158,117,0.8)' }}
              >
                ✓ {t('reviewDetail.verified')}
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
                className="w-7 h-7 rounded-full object-cover ring-1 ring-white/30 flex-shrink-0"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #ff6b35, #e91e8c)' }}
              >
                {firstName[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-white text-sm font-semibold leading-none">{author?.full_name || anonymous}</span>
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
          reviewId={reviewId}
          initialLiked={initialLiked}
          initialCount={review.like_count}
        />
        {/* 💬 Comment */}
        <ReviewCommentButton reviewId={reviewId} initialCount={commentCount} />
        {/* 🔖 Save */}
        <ReviewSaveButton reviewId={reviewId} initialSaved={initialSaved} />
        {/* ↗ Share */}
        <ReviewShareButton
          reviewId={reviewId}
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
          <p className="text-gray-600 text-sm italic pr-14">{t('reviewDetail.noBody')}</p>
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
            {t('reviewDetail.ctaPrompt')} <span className="font-semibold text-white">{review.place_name}</span>?
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-full"
            style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #e91e8c 100%)' }}
          >
            🤖 {t('reviewDetail.askTappy')}
          </Link>
        </div>
        </div>
      </div>
    </div>
  )
}
