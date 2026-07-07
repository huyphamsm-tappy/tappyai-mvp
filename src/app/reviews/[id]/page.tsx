import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReviewDetailView from './ReviewDetailView'

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
      content_type, media_url, thumbnail, source_type, source_url,
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

export default async function ReviewDetailPage({ params }: Props) {
  const [review, initialLiked, initialSaved, commentCount] = await Promise.all([
    getReview(params.id),
    getLikeStatus(params.id),
    getSaveStatus(params.id),
    getCommentCount(params.id),
  ])
  if (!review) notFound()

  return (
    <ReviewDetailView
      reviewId={params.id}
      review={review as unknown as React.ComponentProps<typeof ReviewDetailView>['review']}
      initialLiked={initialLiked}
      initialSaved={initialSaved}
      commentCount={commentCount}
    />
  )
}
