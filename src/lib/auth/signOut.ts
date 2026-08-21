import { createClient } from '@/lib/supabase/client'
import { emitAuthLogout } from '@/lib/analytics/authEvents'

// The ONE place a session is torn down.
//
// 🔑 ONE PRIMITIVE, TWO SURFACES. The consumer app and the Controller both end
// sessions, and before this they would have done it with two separate copies of
// the same three lines. That is how the two drift into clearing different
// things — one of them forgets the analytics event, or stops awaiting the call,
// or starts clearing local storage the other does not. A test asserts this file
// holds the only `auth.signOut()` call site in `src/`.
//
// It performs NO navigation. Where a signed-out person belongs is a property of
// the surface they were on — the consumer app sends them to `/login`, the
// Controller to `/login?returnTo=%2Fadmin` so they land back on the Controller
// card — so the caller decides, and this stays a pure teardown.

/**
 * End the current session.
 *
 * NEVER THROWS. A failed network call may still have cleared the session
 * locally, and the caller's next act is to leave the authenticated surface. If
 * this rejected, that navigation would be skipped and the person would be left
 * looking at an admin screen that appears signed in — the worse of the two
 * outcomes, and the one that gets somebody walking away from an unlocked
 * Controller.
 */
export async function performSignOut(): Promise<void> {
  // Emitted BEFORE the teardown: afterwards there is no identity left to
  // attribute the event to.
  emitAuthLogout()
  try {
    await createClient().auth.signOut()
  } catch {
    // Deliberately swallowed — see the note above.
  }
}
