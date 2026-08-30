import { createClient } from '@/lib/supabase/client'
import { emitAuthLogout } from '@/lib/analytics/authEvents'
import { releaseOwnPushClaim } from '@/lib/notifications/pushIdentity'

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

  // Give up this browser as this account's push device — BEFORE the session
  // goes, because the call is authorised by that session.
  //
  // 🚨 WHY THIS IS HERE AT ALL. A push subscription belongs to the browser; the
  // row belongs to the account. Leaving the claim behind means the next person
  // at this machine sees notifications addressed to the person who just left —
  // on a lock screen, without signing in. The next account's login reconcile
  // also closes this, but only once somebody actually signs in; the gap in
  // between is exactly the shared-machine case.
  //
  // Bounded and best effort BY CONTRACT. It never throws, never runs past its
  // timeout, and its failure changes nothing about what happens next: the
  // caller's very next act is to leave an authenticated surface, and delaying
  // that on a slow network would be the worse outcome. See the note above about
  // never leaving somebody looking at a screen that appears signed in.
  //
  // Wrapped even though releaseOwnPushClaim does not throw by contract: this
  // function's own contract is NEVER THROWS, and it must not depend on a promise
  // made in another file staying true. If that ever regresses, sign-out still
  // happens rather than leaving somebody on a screen that looks signed in.
  try {
    await releaseOwnPushClaim({ timeoutMs: 1500 })
  } catch {
    // Best effort — the next account's login reconcile is the backstop.
  }

  try {
    await createClient().auth.signOut()
  } catch {
    // Deliberately swallowed — see the note above.
  }
}
