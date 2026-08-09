// ---------------------------------------------------------------------------
// The post-login return destination — ONE parameter name, shared by producers
// and the consumer.
//
// WHY THIS MODULE EXISTS (a real, shipped bug)
// The Controller guards sent `/login?redirect=/admin` while `/login` only ever
// read `returnTo`. The parameter was therefore silently dropped and every
// unauthenticated visit to `/admin` finished on the consumer home page `/`,
// which looks exactly like "the Controller is broken". Nothing threw; the two
// halves simply disagreed on a string.
//
// The fix is not "rename the literal in three files" — that can drift again the
// next time someone adds a guard. Both sides now import the SAME constant, so a
// mismatch is not expressible: a producer built by `loginUrlFor` is always
// readable by `readReturnTo`, and `returnTo.test.ts` round-trips them to prove it.
//
// `returnTo` is the canonical name because it is what the other ~30 call sites
// across chat, reviews, service, sound and profile already send; `/admin` was
// the outlier, not the standard.
// ---------------------------------------------------------------------------

/** The one query parameter that carries a post-login destination. */
export const RETURN_TO_PARAM = 'returnTo'

/**
 * Historic spelling used only by the Controller guards. Still ACCEPTED on read
 * so any bookmark, in-flight redirect or external link of the form
 * `/login?redirect=/admin` keeps working; never PRODUCED any more.
 */
export const LEGACY_RETURN_TO_PARAM = 'redirect'

/** Where a login lands when no destination was supplied (or it was rejected). */
export const DEFAULT_RETURN_DEST = '/'

/**
 * True only for a same-origin, path-absolute destination.
 *
 * The three rejected shapes are all open-redirect vectors:
 *   - `https://evil.example`  — absolute URL, does not start with "/"
 *   - `//evil.example`        — protocol-relative; the browser treats it as an
 *                               absolute URL to another host
 *   - `/\evil.example`        — browsers normalise the backslash to "/", so this
 *                               is protocol-relative in disguise
 * `javascript:` and `data:` URIs are covered by the leading-"/" rule.
 */
export function isSafeReturnTo(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false
  if (value.startsWith('/\\')) return false
  return true
}

/**
 * Reads the destination out of a location search string, accepting the canonical
 * name first and the legacy one second. Always returns something safe to hand to
 * `router.replace`, so callers never need their own validation.
 */
export function readReturnTo(search: string | URLSearchParams): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const candidate = params.get(RETURN_TO_PARAM) ?? params.get(LEGACY_RETURN_TO_PARAM)
  return isSafeReturnTo(candidate) ? candidate : DEFAULT_RETURN_DEST
}

/**
 * The `?returnTo=…` search string for a login redirect. Separate from
 * [loginUrlFor] because middleware redirects by mutating a cloned `NextURL`
 * (which preserves the request origin) rather than by string concatenation.
 */
export function loginSearchFor(destination: string): string {
  return `?${RETURN_TO_PARAM}=${encodeURIComponent(destination)}`
}

/** The full relative login URL that will return the user to [destination]. */
export function loginUrlFor(destination: string): string {
  return `/login${loginSearchFor(destination)}`
}
