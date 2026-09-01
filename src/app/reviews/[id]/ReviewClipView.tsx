'use client'

// The route-level mount of the app's ONE clip viewer.
//
// ============================================================================
// WHY THIS FILE EXISTS AND WHY IT IS THIS SMALL
// ============================================================================
// `ClipViewer` is the existing Explore/TikTok presentation, already reused by the profile grid and
// the Inbox. It is a client component that takes a `Review[]` and an `onClose`. A route has no
// "close" — there is nothing above it in the page — so this adapter supplies one, and does nothing
// else. There is deliberately no second viewer, no copy of the rail, and no visual change.
//
// 🔑 It is handed exactly ONE review, the one the URL names, with `startIndex` 0. No feed is
// fetched and nothing is recommended, so a shared link can never open somebody else's clip.
//
// 🚨 The server decided this row was readable BEFORE this component exists — `getReview` applies
// the hidden and publication filters and the page calls `notFound()` otherwise. Nothing here can
// widen visibility, and BUG-004's real HTTP 404 is untouched.

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ClipViewer } from '@/app/reviews/ProfileTab'
import type { Review } from '@/app/reviews/feedShared'

export default function ReviewClipView({ review, me }: { review: Review; me: string | null }) {
  const router = useRouter()

  // Back where they came from, but only when "there" is inside this app.
  //
  // 🚨 `window.history.length > 1` is NOT that test, and using it was a bug: a browser's blank new
  // tab already counts as an entry, so a shared link opened in a fresh tab measured 2 and
  // `router.back()` walked out of the site to `about:blank`. Measured, not reasoned about.
  //
  // The referrer is the honest signal. Same-origin means an app page loaded this one, so going
  // back lands on it. Empty (a pasted URL, a push notification's `openWindow`) or cross-origin (a
  // link shared into a chat app) means there is nothing of ours behind us, and the feed is the
  // right home. The worst case is now "lands on the feed", never "leaves the product".
  const close = useCallback(() => {
    let cameFromThisApp = false
    try {
      cameFromThisApp = !!document.referrer && new URL(document.referrer).origin === window.location.origin
    } catch { cameFromThisApp = false }
    if (cameFromThisApp) router.back()
    else router.push('/reviews')
  }, [router])

  return <ClipViewer posts={[review]} startIndex={0} me={me} onClose={close} />
}
