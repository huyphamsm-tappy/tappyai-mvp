'use client'

// The ONE shared poster component for review tiles. Used by the Profile Grid,
// Explore feed, Search results and Post Detail. It ALWAYS renders a non-empty
// <img> — never a blank/black tile:
//   priority: real photo → stored thumbnail → platform placeholder
//   + onError: a failed/expired thumbnail falls back to the platform placeholder
//     (self-hosted SVG, cannot 404).
//
// It uses a plain <img> on purpose: YouTube (i.ytimg.com) and TikTok CDN hosts
// are NOT in next.config images.remotePatterns, so <Image> would 400 them. CSP
// img-src allows any https, so <img> is the correct, working choice here.
// Platform business logic lives in @/lib/links/platforms, never in this UI.

import { useState } from 'react'
import { posterFor, placeholderFor } from '@/lib/links/platforms'

export interface LinkPosterReview {
  photos?: string[] | null
  thumbnail?: string | null
  content_type?: string | null
  source_type?: string | null
}

export default function LinkPoster({
  review,
  className = '',
  alt = '',
  eager = false,
}: {
  review: LinkPosterReview
  className?: string
  alt?: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const src = failed ? placeholderFor(review.source_type) : posterFor(review)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 w-full h-full object-cover ${className}`}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => { if (!failed) setFailed(true) }}
    />
  )
}
