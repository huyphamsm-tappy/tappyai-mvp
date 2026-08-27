'use client'

// The ONE shared poster component for review tiles. Used by the Profile Grid,
// Explore feed, Search results and Post Detail. It ALWAYS renders a non-empty
// <img> — never a blank/black tile:
//   priority: real photo → stored thumbnail → platform placeholder
//   + self-healing: a transient failure or an indefinitely-stalled load is
//     RETRIED a bounded number of times with a short backoff; only after the
//     retries (or the load timeout) are exhausted does it fall back to the
//     platform placeholder (self-hosted SVG, cannot 404).
//
// Why the retry: the served object lives on GCS and its edge can return a rare,
// retryable 503 (RCA 2026-08-25 — object valid, 60/60 server + 30/30 browser
// requests 200, one transient edge 503). A single flaky response used to leave a
// permanently gray tile until manual reload; Google's own guidance for GCS 5xx
// is "retry with exponential backoff", so that is what this does — on the client.
//
// It uses a plain <img> on purpose: YouTube (i.ytimg.com) and TikTok CDN hosts
// are NOT in next.config images.remotePatterns, so <Image> would 400 them. CSP
// img-src allows any https, so <img> is the correct, working choice here.
// Platform business logic lives in @/lib/links/platforms, never in this UI.

import { useCallback, useEffect, useRef, useState } from 'react'
import { posterFor, placeholderFor } from '@/lib/links/platforms'

export interface LinkPosterReview {
  photos?: string[] | null
  thumbnail?: string | null
  content_type?: string | null
  source_type?: string | null
}

// Small, bounded policy. Two retries (three attempts total) clears a transient
// edge 503; the timeout catches a load that never resolves or errors at all.
const MAX_RETRIES = 2
const RETRY_BASE_MS = 400   // backoff grows per attempt: 400ms, 800ms
const LOAD_TIMEOUT_MS = 8000

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
  const poster = posterFor(review)
  const placeholder = placeholderFor(review.source_type)

  // `attempt` doubles as the <img> key: bumping it remounts the element so the
  // browser issues a fresh request for the SAME url (no cache-buster, no url
  // change). `usePlaceholder` is the terminal state once retries are spent.
  const [attempt, setAttempt] = useState(0)
  const [usePlaceholder, setUsePlaceholder] = useState(false)
  const loadedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  // A new poster target (component reused for a different review) starts over.
  useEffect(() => {
    loadedRef.current = false
    setAttempt(0)
    setUsePlaceholder(false)
  }, [poster])

  const handleFailure = useCallback(() => {
    clearTimer()
    if (loadedRef.current || usePlaceholder) return   // success or already given up → nothing to do
    if (attempt < MAX_RETRIES) {
      timerRef.current = setTimeout(() => setAttempt(a => a + 1), RETRY_BASE_MS * (attempt + 1))
    } else {
      setUsePlaceholder(true)
    }
  }, [attempt, usePlaceholder])

  // Per-attempt stall guard: if the real poster neither loads nor errors within
  // the window, treat it as a failure. Not armed for the placeholder (local SVG).
  useEffect(() => {
    if (usePlaceholder) return
    loadedRef.current = false
    timerRef.current = setTimeout(handleFailure, LOAD_TIMEOUT_MS)
    return clearTimer   // clears on the next attempt AND on unmount
  }, [attempt, usePlaceholder, handleFailure])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={usePlaceholder ? placeholder : poster}
      alt={alt}
      className={`absolute inset-0 w-full h-full object-cover ${className}`}
      loading={eager ? 'eager' : 'lazy'}
      onLoad={() => { loadedRef.current = true; clearTimer() }}
      onError={handleFailure}
    />
  )
}
