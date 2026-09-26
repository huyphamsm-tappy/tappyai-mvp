'use client'

// The Explore profile. The URL stays /users/[id]; the page is `PublicProfileView`,
// which renders in the Explore shell and decides from viewer vs owner what it may
// show: the public identity and content for everyone, the owner's private activity
// (liked / saved / hidden), edit and cover controls for the owner alone.
//
// viewer is who is logged in, userId is whose profile this is — the view uses the
// difference; the server routes and RLS enforce it.
//
// 🚨 Your OWN id is not a creator page (2026-09-17). The signed-in user's own profile — with
// its five private collections — has exactly one implementation, the V3 `/profile` hub, so
// `/users/<me>` goes there instead of rendering a second own-profile with a different model.
// Anyone else's id renders the public creator profile. (`PublicProfileView` still carries its
// owner branch from the cool-vaughan line; this redirect is what keeps it unreached.)
//
// 🔑 Split out of page.tsx (U12) so the route can be a server component and export
// `generateMetadata`. A 'use client' module cannot, which is why a shared profile
// link previewed with the generic site title while /reviews/[id] previewed with
// the review's own subject. Same split as /profile/account and /profile/bookings.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'
import { goBack } from '@/lib/nav/inAppBack'
import PublicProfileView, { type Viewer } from './PublicProfileView'

export default function UserProfileView({ userId }: { userId: string }) {
  const router = useRouter()
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      // B17: an anonymous session is authenticated but is not an account. For this page
      // that means "not signed in" — following is a social write the server refuses for
      // it (403), so the Follow button sends such a visitor to login up front. It is also
      // never an owner: /profile would only show it the guest screen.
      const u = data.user && !isAnonymousUser(data.user) ? data.user : null
      if (u && u.id === userId) { router.replace('/profile'); return }
      setViewer(u ? { id: u.id, avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null } : null)
      setReady(true)
    })
  }, [userId, router])

  // Wait for the session before the first render: the view decides owner vs
  // visitor from the viewer, so mounting with a not-yet-known null would briefly
  // render your own profile as if you were a stranger.
  if (!ready) return <div className="h-dvh bg-black" />

  // One page for every viewer — the COMMUNITY profile. Who is looking changes what
  // is unlocked: follow for a visitor; the owner is sent to /profile above. Back
  // returns to where the visitor came from (Explore, a clip, a QR scan); with no
  // in-app history it lands on Explore rather than leaving the site
  // (`lib/nav/inAppBack` — `history.length` counted a fresh tab's blank entry).
  return (
    <PublicProfileView
      userId={userId}
      viewer={viewer}
      onBack={() => goBack(router, '/reviews')}
    />
  )
}
