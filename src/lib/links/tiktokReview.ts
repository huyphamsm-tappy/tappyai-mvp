// TikTok review/video links for AI Consultative answers.
//
// Product decision (2026-08-16): a consultative answer MAY carry a TikTok review/video link, but
// only one the backend validated out of a REAL provider result. The model is never the source —
// it cannot invent, guess, or assemble a URL from a place name, because nothing it writes reaches
// the user unless it matches a URL this module already approved.
//
// SCOPE: consultative only. The review composer's own contract
// (config/product.ts LINK_VIDEO_PROVIDERS = ['youtube']) is separate and deliberately unchanged.
//
// The rule is an ALLOWLIST OF CONTENT SHAPES, not a domain check. A profile, a search page, a
// hashtag feed and the homepage are all on tiktok.com and none of them is a review — and
// `/@quan-an/video/<place name>` is exactly what a fabricated link looks like, so the id must be
// numeric as TikTok's real ones are.

/** Hosts TikTok actually serves content from. Matched exactly — never by suffix. */
const CONTENT_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'])
/** Short-link hosts, where the path is an opaque code that resolves to one post. */
const SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com'])

/** `/@handle/video/123…` or `/@handle/photo/123…` — a numeric id, as TikTok issues them. */
const CONTENT_PATH = /^\/@[A-Za-z0-9._-]+\/(video|photo)\/\d+\/?$/
/** `/t/<code>` on a content host, and `/<code>` on a short host. */
const SHORT_PATH = /^\/(t\/)?[A-Za-z0-9]{5,}\/?$/

/**
 * True only for a URL that is a specific piece of TikTok content.
 *
 * Anything unparseable, non-https, off-host, or merely *on* TikTok without being a post is
 * false. Never widen this to "host ends with tiktok.com" — `tiktok.com.evil.example` ends with
 * it too.
 */
export function isValidTikTokContentUrl(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase()
  if (SHORT_HOSTS.has(host)) return SHORT_PATH.test(url.pathname)
  if (!CONTENT_HOSTS.has(host)) return false
  // A query string is how search pages present themselves; real post URLs need none.
  if (url.search.length > 0) return false
  return CONTENT_PATH.test(url.pathname) || SHORT_PATH.test(url.pathname)
}

/**
 * The one TikTok review link for a place, chosen from what a provider actually returned.
 *
 * Returns null whenever nothing in the results is valid content — "no source" is a real answer
 * and the caller must be able to say so rather than fall back to something weaker.
 */
export function pickTikTokReviewUrl(
  results: ReadonlyArray<{ link?: string | null }> | null | undefined,
): string | null {
  for (const r of results ?? []) {
    if (isValidTikTokContentUrl(r?.link)) return r!.link as string
  }
  return null
}
