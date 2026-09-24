import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SavedView from './SavedView'

// ── V3 Web · Saved ──────────────────────────────────────────────────────────
//
// 🚨 NOW AUTH-GATED ON THE SERVER, WHICH IT WAS NOT. This route was a pure client component: a
// signed-out visitor reached it, both fetches returned 401, and the screen rendered a generic
// "couldn't load" error for what was actually "you are not signed in". Saved content is private
// user data, so the check belongs before the render — the same `redirect('/login')` shape
// `/profile/notifications` and `/planner` already use, and the shape `GuestProfileView` already
// assumes when it links here as `/login?returnTo=/profile/favorites`.
//
// 🚨 NO DATA IS READ HERE. Owner scoping and the publication/media safety filters live in
// `GET /api/favorites` and `GET /api/reviews/saved`, which the view calls; duplicating either
// query server-side would mean a second place for the RLS and the safety gate to be got wrong.
// The session is read only to gate the route and to give the shell an avatar.

export default async function SavedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?returnTo=%2Fprofile%2Ffavorites')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  // Email always from session (auth.users.email); profiles.email is being removed.
  const userInfo = {
    full_name: profile?.full_name ?? user.user_metadata?.full_name,
    avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url,
    email: user.email,
  }

  // `SavedView` reads `?type=` with `useSearchParams`, which Next requires to sit under a
  // Suspense boundary.
  return (
    <Suspense>
      <SavedView user={userInfo} />
    </Suspense>
  )
}
