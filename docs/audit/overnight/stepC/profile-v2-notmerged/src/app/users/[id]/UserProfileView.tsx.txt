'use client'

// The Explore profile. The URL stays /users/[id]; the page is `PublicProfileView`,
// which renders in the Explore shell and decides from viewer vs owner what it may
// show: the public identity and content for everyone, the owner's private activity
// (liked / saved / hidden), edit and cover controls for the owner alone.
//
// viewer is who is logged in, userId is whose profile this is — the view uses the
// difference; the server routes and RLS enforce it.
//
// 🔑 Split out of page.tsx (U12) so the route can be a server component and export
// `generateMetadata`. A 'use client' module cannot, which is why a shared profile
// link previewed with the generic site title while /reviews/[id] previewed with
// the review's own subject. Same split as /profile/account and /profile/bookings.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAnonymousUser } from '@/lib/auth/socialWriteAccess'
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
      // it (403), so the Follow button sends such a visitor to login up front.
      const u = data.user && !isAnonymousUser(data.user) ? data.user : null
      setViewer(u ? { id: u.id, avatarUrl: (u.user_metadata?.avatar_url as string | undefined) ?? null } : null)
      setReady(true)
    })
  }, [])

  // Wait for the session before the first render: the view decides owner vs
  // visitor from the viewer, so mounting with a not-yet-known null would briefly
  // render your own profile as if you were a stranger.
  if (!ready) return <div className="h-dvh bg-black" />

  // One page for every viewer — the COMMUNITY profile. Who is looking changes what
  // is unlocked: edit, cover and the private activity tabs for the owner; follow for
  // a visitor. Back returns to where the visitor came from (Explore); with no
  // history it lands on Explore rather than a blank tab.
  return (
    <PublicProfileView
      userId={userId}
      viewer={viewer}
      onBack={() => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/reviews') }}
    />
  )
}
