// Crawler metadata for a public review / Explore clip page (`/reviews/<id>`).
//
// Owner UAT 2026-09-28: a shared Explore clip previewed as a bare "TappyAI" card. Every post in
// Explore is a clip, and the old metadata was written for the article review:
//  - og:title was `${place_name} — ${rating}/5 sao` — for a share-only clip that is the composer's
//    sentinel "Chia sẻ — 0/5 sao";
//  - og:image was `photos[0]` only — a clip has no photos, so every clip fell to the brand image
//    even though it has a real thumbnail;
//  - an empty caption produced an empty description.
// This builds the preview from what the post actually has, through the same rules as every other
// crawler-facing page (openGraph.ts): absolute https URLs on the site origin, a branded fallback.

import type { Metadata } from 'next'
import { BRAND, absoluteUrl, brandedOgImage, safeOgImageUrl } from './openGraph'
import { isShareOnlyPlaceName, reviewShareTitle } from './reviewShareTitle'
import { reviewShareVideoUrl } from './reviewShareMedia'

export interface ReviewForMetadata {
  place_name?: string | null
  place_address?: string | null
  rating?: number | null
  body?: string | null
  photos?: string[] | null
  thumbnail?: string | null
  content_type?: string | null
  media_url?: string | null
  source_type?: string | null
}

const DESC_MAX = 160

function snippet(text: string, max = DESC_MAX): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export function buildReviewMetadata(id: string, review: ReviewForMetadata, env: NodeJS.ProcessEnv = process.env): Metadata {
  const subject = reviewShareTitle(review)
  const realPlace = !isShareOnlyPlaceName(review.place_name)
  const rating = typeof review.rating === 'number' && review.rating >= 1 && review.rating <= 5 ? Math.round(review.rating) : 0
  // A rated place keeps its star line; a clip without a place is titled by its caption.
  const ogTitle = realPlace && rating ? `${subject} — ${rating}/5 sao` : subject
  const title = realPlace && rating ? `${'★'.repeat(rating)} ${subject} | ${BRAND.name}` : `${subject} | ${BRAND.name}`

  const description =
    snippet(review.body ?? '') ||
    (realPlace ? snippet([review.place_name, review.place_address].filter(Boolean).join(' — ')) : '') ||
    BRAND.tagline.vi

  // The post's own picture when a crawler can fetch it: the clip's thumbnail first, then the first
  // photo; the branded card otherwise (never a suspended Blob URL — safeOgImageUrl).
  const candidate = [review.thumbnail, review.photos?.[0]].find(u => typeof u === 'string' && u.length > 0)
  const imageUrl = safeOgImageUrl(candidate, env)
  const branded = brandedOgImage(env)
  const image = imageUrl === branded.url ? branded : { url: imageUrl, alt: subject }

  const url = absoluteUrl(`/reviews/${id}`, env)
  const video = reviewShareVideoUrl(review)

  const og = { title: ogTitle, description, url, siteName: BRAND.name, locale: 'vi_VN', images: [image] }

  return {
    title,
    description,
    alternates: { canonical: url },
    // An uploaded clip also advertises its file, so platforms that play og:video can.
    openGraph: video
      ? { ...og, type: 'video.other', videos: [{ url: video, type: 'video/mp4' }] }
      : { ...og, type: 'article' },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [image.url],
    },
  }
}
