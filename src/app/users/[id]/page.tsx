'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Viewing ANOTHER user's profile (tapped from the Explore feed, a comment, a
// follower list, or a deep link) now reuses the exact same TikTok-style
// ProfileTab as your own profile — same video grid, same swipeable
// ClipViewer, same scroll-position-preserving delete sync — instead of the
// old, separate review-card list this page used to render (no video grid,
// no ClipViewer, never rendered `content_type: 'video'` at all).
//
// ProfileTab lives inside src/app/reviews/page.tsx and isn't exported —
// Next.js's route-module contract for a `page.tsx` file forbids extra named
// exports (any component export beyond the page contract fails the build:
// "Property 'X' is incompatible with index signature"). Splitting ProfileTab
// and everything it renders (ClipViewer, Post, CommentDrawer, ShareModal,
// their shared types) into its own module is the eventual clean fix, but is
// a much larger, riskier move than this bug calls for. Redirecting to the
// existing profile tab's own route is the minimal, safe way to reuse it
// without duplicating the whole video-grid implementation a second time.
export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string

  useEffect(() => {
    router.replace(`/reviews?tab=profile&userId=${encodeURIComponent(userId)}`)
  }, [userId, router])

  return <div className="h-dvh bg-black" />
}
