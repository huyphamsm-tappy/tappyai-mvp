'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * The Explore profile tab's body: a hand-over to `/profile`.
 *
 * The signed-in user's own profile has ONE implementation — the V3 `/profile` hub with the five
 * personal collections (Posts / Liked / Saved / Hidden / Shared). Explore used to render
 * a second one here, so the two could (and did) show different tabs over different reads. The tab
 * keeps its URL contract (`/reviews?tab=profile` is what the composer pushes after publishing and
 * what a history entry restores); its body is this redirect. `replace`, not `push`: the hub takes
 * the tab's own history slot, so Back still returns to the feed clip (DFR-001).
 *
 * No auth decision is made here — `/profile`'s server gate shows a guest, anonymous session
 * included, the guest screen with a sign-in action.
 */
export function OwnProfileRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/profile') }, [router])
  return (
    <div className="h-dvh flex items-center justify-center" data-own-profile-redirect>
      <Loader2 size={20} className="text-white animate-spin" />
    </div>
  )
}
