'use client'

// Author profile. The URL stays /users/[id] — this route renders the very same
// ProfileTab the bottom-nav "Hồ sơ" tab uses, which brings its own clip grid and
// its own ClipViewer (a thin wrapper around the Feed's Post). Before this, the
// page had its own review-card list and linked clips to /reviews/[id], so tapping
// a creator's avatar landed you in a completely different UI from the feed.
//
// viewerId is who is logged in, userId is whose profile this is — ProfileTab uses
// the difference to decide what is public (the posts grid) and what is private
// (saved/liked/hidden, edit-profile, delete/hide).

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ProfileTab } from '@/app/reviews/ProfileTab'

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setViewerId(data.user?.id ?? null)
      setReady(true)
    })
  }, [])

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
