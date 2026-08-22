import { readReturnTo } from './returnTo'

// WHICH sign-in card `/login` shows.
//
// `/login` is ONE page serving TWO products. The consumer app's real users sign
// in there with Google and Zalo; the Controller's sign-in is email-only and
// `@tappyai.com`-only. Deleting the consumer providers to satisfy the Controller
// would sign every real user out of the product, so the card is chosen by where
// the visitor is HEADED — the destination the guard already put in `returnTo`.
//
// 🔑 PRESENTATION ROUTING, NOT A SECURITY DECISION. This authenticates nobody
// and authorizes nobody. Showing the wrong card shows the wrong buttons; it
// cannot admit anyone, because `/admin` still runs the Option B corporate
// boundary and the PDP server-side afterwards, on whatever session results.
//
// It reads the destination through `readReturnTo`, so an off-site value is
// already collapsed to `/` by `safeReturnTo` before it is classified — a
// `returnTo=https://evil.com/admin` must never be seen as "the Controller".

/** The Controller's own entry point (its public front door). */
const CONTROLLER_HOME = '/controller'

/** The Controller application root. Its sub-paths count; look-alikes do not. */
const CONTROLLER_ROOT = '/admin'

/**
 * True iff this `/login` visit was sent here from the Controller.
 *
 * EXACT match or a `/` separated child — never a bare prefix. `/administrators`
 * and `/admin-guide` both start with `/admin`, and a consumer route added under
 * either name must not start handing out the Controller's card.
 */
export function isControllerLoginEntry(search: string | null | undefined): boolean {
  const destination = readReturnTo(search ?? '')

  return (
    destination === CONTROLLER_ROOT ||
    destination.startsWith(`${CONTROLLER_ROOT}/`) ||
    destination === CONTROLLER_HOME
  )
}
