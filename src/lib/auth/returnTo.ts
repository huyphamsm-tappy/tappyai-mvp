// THE post-login destination contract — one module, used by BOTH sides.
//
// WHY THIS EXISTS
// ---------------
// The Controller guards sent users to `/login?redirect=/admin` while the login
// page only ever read `returnTo`. The names never matched, so `getReturnDest()`
// fell through to '/' and a successful sign-in landed on the consumer home page
// instead of the Controller. It reproduced 100% of the time and survived several
// rounds of investigation because both halves read as correct in isolation.
//
// The fix is not "rename the parameter" — that would just move the same latent
// bug. It is to make producer and consumer share ONE exported constant, so the
// two sides cannot drift apart without a compile-visible change, and to pin that
// with a behavioural test rather than a string-presence assertion.

/** The canonical query parameter carrying the post-login destination. */
export const RETURN_TO_PARAM = 'returnTo'

/**
 * The historical parameter name some callers (and any bookmarked/stale link)
 * still use. Accepted on READ only — never emitted. Kept because we cannot
 * prove no external link uses it.
 */
export const LEGACY_RETURN_TO_PARAM = 'redirect'

/** Where we land when no usable destination was supplied. */
export const DEFAULT_RETURN_TO = '/'

/**
 * Validate a candidate destination.
 *
 * SECURITY: same-origin only. A destination must be a site-relative path, so
 * `https://evil.example`, protocol-relative `//evil.example`, and
 * `javascript:` URLs can never be reached. This preserves the guard that
 * already existed inline in the login page — it is centralised, not relaxed.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return DEFAULT_RETURN_TO
  // `//host` is protocol-relative and leaves the origin; `/\host` does too in
  // several browsers, which is why the backslash form is rejected as well.
  if (!raw.startsWith('/')) return DEFAULT_RETURN_TO
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_RETURN_TO
  return raw
}

/**
 * Read the post-login destination from a query string, accepting the canonical
 * parameter and the legacy one. Always returns a safe, site-relative path.
 */
export function readReturnTo(search: string): string {
  const params = new URLSearchParams(search)
  const raw = params.get(RETURN_TO_PARAM) ?? params.get(LEGACY_RETURN_TO_PARAM)
  return safeReturnTo(raw)
}

/**
 * Build the login URL for a protected destination.
 *
 * Producers MUST use this rather than hand-writing the query string: it is what
 * makes the producer/consumer contract mechanical instead of remembered.
 */
/**
 * The page the visitor is on right now, as a destination to come back to.
 *
 * 🚨 Producers kept writing `'/reviews'` by hand, which was true for the page that literal was
 * written on and false everywhere the component was later reused. `ClipViewer` is the case that
 * proved it: once it became the destination of every share link and push notification, signing in
 * from a shared clip returned to the feed and the clip was gone.
 *
 * Reading the location instead of naming it removes the class, not one instance of it.
 */
export function currentDestination(): string {
  if (typeof window === 'undefined') return DEFAULT_RETURN_TO
  return window.location.pathname + window.location.search
}

export function loginPathFor(destination: string): string {
  const dest = safeReturnTo(destination)
  if (dest === DEFAULT_RETURN_TO) return '/login'
  return `/login?${RETURN_TO_PARAM}=${encodeURIComponent(dest)}`
}
