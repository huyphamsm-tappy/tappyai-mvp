import { createClient } from '@/lib/supabase/server'
import { getReview } from './getReview'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BRAND, absoluteUrl, safeOgImageUrl } from '@/lib/share/openGraph'
import ReviewDetailView from './ReviewDetailView'
import ReviewClipView from './ReviewClipView'
import type { Review } from '@/app/reviews/feedShared'

interface Props {
  params: { id: string }
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
/** Who is looking, for the clip viewer's own-post controls. Null for a signed-out visitor. */
async function getViewerId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

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

  // The review's own photo when a crawler can actually fetch it, otherwise the
  // branded card. Previously this published `photos[0]` unconditionally — those
  // are Vercel Blob URLs, the store is suspended and they 403, so shared review
  // links showed a broken image; a review with no photo published none at all.
  const image = safeOgImageUrl(review.photos?.[0])
  const ogTitle = `${review.place_name} — ${review.rating}/5 sao`

  return {
    title: `${'★'.repeat(review.rating)} ${review.place_name} | TappyAI`,
    description: desc,
    openGraph: {
      title: ogTitle,
      description: desc,
      url: absoluteUrl(`/reviews/${params.id}`),
      siteName: BRAND.name,
      images: [image],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: desc,
      images: [image],
    },
  }
}

/**
 * ============================================================================
 * ONE PRESENTATION PER MEDIA TYPE, DECIDED HERE
 * ============================================================================
 * This route is where every entry point that is not already the feed or the profile grid ends up:
 * a push notification (`push-sw.js` opens the notification's `entity_url`), a shared link
 * (`ReviewShareButton` and the feed's `ShareModal` both publish `absoluteUrl('/reviews/<id>')`), a
 * pasted URL, the saved-places list, the sound page, the creator grid, and the "View post" sheet.
 * All of them rendered the article page, so a CLIP — and every post in this product is a clip —
 * opened as a 55vh hero with a text card instead of the viewer it was watched in.
 *
 * Deciding it here means no link, share URL or push payload changes, and there is exactly one
 * answer to "how does a video look".
 *
 * 🚨 The branch is BELOW `notFound()` on purpose. Deleted, malformed, hidden and under-review rows
 * never reach it, so BUG-004's real HTTP 404 is unaffected — and `generateMetadata` above is
 * untouched, so share previews and OG cards keep working exactly as they did.
 *
 * 🔑 `content_type === 'video' && media_url` is the same pair `ReviewDetailView` already uses to
 * decide whether to mount a player, so the route and the view can never disagree about what a clip
 * is. A row typed video with no media falls through to the detail page rather than a black screen.
 */
export default async function ReviewDetailPage({ params }: Props) {
  const [review, initialLiked, initialSaved, commentCount, viewerId] = await Promise.all([
    getReview(params.id),
    getLikeStatus(params.id),
    getSaveStatus(params.id),
    getCommentCount(params.id),
    getViewerId(),
  ])
  if (!review) notFound()

  const r = review as Record<string, unknown>
  if (r.content_type === 'video' && r.media_url) {
    // The viewer reads its own state off the row, so the server's like/save answers are folded in
    // here rather than fetched again on the client.
    const clip = {
      ...r,
      liked_by_me: initialLiked,
      saved_by_me: initialSaved,
      comment_count: commentCount,
    } as unknown as Review
    return <ReviewClipView review={clip} me={viewerId} />
  }

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
