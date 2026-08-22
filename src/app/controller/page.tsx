import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ControllerPublicHome } from '@/components/controller/ControllerPublicHome'

// Controller V2 — Public Home (`/controller`).
//
// The Controller's front door. PUBLIC: no authentication, no permission, no
// audit — there is nothing here to authorize, because the page reads no data.
//
// 🔑 NO NEW AUTHENTICATION MECHANISM. The existing contract was already enough:
// this reads the same session every other server component reads, and hands off
// to `/login` (via the view's one link) or `/admin`. It adds no OTP, no SSO, no
// token handling, and — because it never calls `permissionEngine` — no second
// authorization decision path.
//
// WHY AN AUTHENTICATED VISITOR IS SENT AWAY: this page's entire purpose is to
// offer a sign-in. Somebody who already has a session has answered it; leaving
// them here would present a dead "Sign in" button as the main action. `/admin`
// is the Controller flow, and ITS `requirePagePermission` guard decides whether
// they may actually see the Control Center — this page never pre-judges that.

export const metadata: Metadata = {
  title: 'TappyAI Controller',
  description: 'Complete oversight. Intelligent operations.',
}

/**
 * Is somebody signed in?
 *
 * FAILS OPEN, and the try/catch is the point: this page renders identical
 * markup for everyone, so an auth backend that is missing or unreachable is not
 * a reason to refuse a PUBLIC page. Failing closed would 500 the Controller's
 * front door for the exact visitor it exists to serve — which is precisely what
 * it did in a worktree with no `.env.local`, while the comment above it claimed
 * otherwise.
 *
 * Nothing is leaked by guessing "anonymous" wrongly: the worst case is that a
 * signed-in visitor sees the sign-in pitch instead of being forwarded, and
 * `/admin` still guards itself.
 */
async function isSignedIn(): Promise<boolean> {
  try {
    const { data } = await createClient().auth.getUser()
    return Boolean(data?.user)
  } catch {
    return false
  }
}

export default async function ControllerPublicHomePage() {
  if (await isSignedIn()) redirect('/admin')

  return <ControllerPublicHome />
}
