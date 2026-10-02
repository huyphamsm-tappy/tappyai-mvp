import { isServableMediaUrl } from '@/lib/media/servableMedia'

/**
 * The video FILE an Explore post can hand to TikTok, or undefined.
 *
 * Only a clip UPLOADED to TappyAI has a file of ours. A clip imported from YouTube (or TikTok /
 * Facebook) is an embed of the source — no file to share, and not ours to redistribute — so it
 * shares the card image with the link in the caption instead. Mirrors Android `shareMediaFor`.
 */
export function reviewShareVideoUrl(review: {
  content_type?: string | null
  media_url?: string | null
  source_type?: string | null
}): string | undefined {
  const native = !review.source_type || review.source_type === 'upload'
  if (review.content_type !== 'video' || !native) return undefined
  const url = review.media_url ?? ''
  return /^https:\/\//i.test(url) && isServableMediaUrl(url) ? url : undefined
}
