'use client'

// Author profile. The URL stays /users/[id] — this route renders the very same
// ProfileTab the bottom-nav "Hồ sơ" tab uses, which brings its own clip grid and
// its own ClipViewer (a thin wrapper around the Feed's Post). Before this, the
// page had its own review-card list and linked clips to /reviews/[id], so tapping
// a creator's avatar landed you in a completely different UI from the feed.
//
// viewerId is who is logged in, userId is whose profile this is — ProfileTab uses
// the difference to decide which ACTIONS exist (edit-profile vs follow, delete/hide).
//
// 🚨 Your OWN id is not a creator page (2026-09-17). The signed-in user's own profile — with
// its five private collections — has exactly one implementation, the V3 `/profile` hub, so
// `/users/<me>` goes there instead of rendering a second own-profile with a different model.
// Anyone else's id renders the public creator profile exactly as before.
//
// 🔑 Split out of page.tsx (U12) so the route can be a server component and export
// `generateMetadata`. A 'use client' module cannot, which is why a shared profile
// link previewed with the generic site title while /reviews/[id] previewed with
// the review's own subject. Same split as /profile/account and /profile/bookings.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ProfileTab } from '@/app/reviews/ProfileTab'

export default function UserProfileView({ userId }: { userId: string }) {
  const router = useRouter()
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      // An anonymous session is a viewer, never an owner: its `id` can equal nothing this route
      // is asked for that it may see privately, and /profile would only show it the guest screen.
      const viewer = data.user && data.user.is_anonymous !== true ? data.user.id : null
      if (viewer && viewer === userId) { router.replace('/profile'); return }
      setViewerId(data.user?.id ?? null)
      setReady(true)
    })
  }, [userId, router])

  // Wait for the session before the first render: ProfileTab decides public vs
  // private from viewerId, so mounting with a not-yet-known null would briefly
  // render your own profile as if you were a stranger.
  if (!ready) return <div className="h-dvh bg-black" />

  return (
    // variant="page" fixes this route's LAYOUT for every viewer — owner and
    // visitor see the same shape here. Who is looking (viewerId) only changes
    // permissions: edit vs follow, private tabs, delete/hide.
    <ProfileTab
      userId={userId}
      viewerId={viewerId}
      showBackButton
      onBack={() => router.back()}
      variant="page"
    />
  )
}
