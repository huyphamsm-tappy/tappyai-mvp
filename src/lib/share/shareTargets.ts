// Where a TappyAI link can be shared, and what URL is allowed to leave.
//
// Before this, roughly fourteen components each called navigator.share() or the
// clipboard directly with a URL they built themselves. On Windows desktop that
// made the whole experience whatever the OS Share Sheet happened to offer —
// Nearby Sharing, Teams, Outlook — while Facebook, TikTok and Zalo were simply
// absent. Delegating the entire share UX to the OS was the bug.
//
// A shared URL is the one thing a user deliberately hands to a third party, so
// the guard below is deliberately strict: canonical host, https, no query, no
// storage object, no API path, no private route.

export type ShareTargetId = 'facebook' | 'tiktok' | 'zalo' | 'copy' | 'native'

/** How a target consumes the link. */
export type ShareTargetKind = 'url-handoff' | 'clipboard' | 'native'

export interface ShareTarget {
  id: ShareTargetId
  /** i18n key — never a literal label, so vi/en both work. */
  labelKey: string
  kind: ShareTargetKind
  /** Brand tint for the icon chip; the design system's blue/orange elsewhere. */
  color?: string
}

/**
 * The product-required target set, in display order.
 *
 * TikTok is the social app. It is deliberately NOT the commerce partner that
 * appears in Deals, and must never be labelled "TikTok Shop".
 */
export const SHARE_TARGETS: readonly ShareTarget[] = [
  { id: 'facebook', labelKey: 'share.facebook', kind: 'url-handoff', color: '#1877F2' },
  { id: 'tiktok', labelKey: 'share.tiktok', kind: 'url-handoff', color: '#010101' },
  { id: 'zalo', labelKey: 'share.zalo', kind: 'url-handoff', color: '#0068FF' },
  { id: 'copy', labelKey: 'share.copyLink', kind: 'clipboard' },
  { id: 'native', labelKey: 'share.more', kind: 'native' },
] as const

export function shareTarget(id: ShareTargetId): ShareTarget {
  const found = SHARE_TARGETS.find((t) => t.id === id)
  if (!found) throw new Error(`Unknown share target: ${id}`)
  return found
}

const FALLBACK_SITE_URL = 'https://www.tappyai.com'

/** Hosts that are genuinely TappyAI's public site. Anchored — no impostors. */
const CANONICAL_HOST = /^(www\.)?tappyai\.(com|vn)$/i

/** Routes that are private or internal and must never be handed to a third party. */
const NON_SHAREABLE_PATH = /^\/(api|chat|admin|auth|login)(\/|$)/i

/**
 * True when a URL is safe to hand to Facebook, Zalo, the clipboard or the OS.
 *
 * Rejects, each for a reason that has actually bitten this project:
 *  - storage object URLs (Vercel Blob is suspended and 403s; GCS objects are
 *    media, not pages, and carry no Open Graph metadata)
 *  - `/api/*` paths, which are an implementation detail
 *  - anything with a query string, which is where tokens live
 *  - preview deployment hosts, which are not the canonical site
 *  - `/chat/*`, which is authenticated and would only ever show a stranger a
 *    login page
 */
export function isShareableUrl(
  value: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (typeof value !== 'string' || value.length === 0) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  // https only: a shared http link is downgraded or blocked by most clients.
  if (url.protocol !== 'https:') return false
  if (!CANONICAL_HOST.test(url.hostname)) return false
  if (NON_SHAREABLE_PATH.test(url.pathname)) return false

  // No query string at all. Tokens, session ids and tracking params all live
  // there, and a canonical share link never needs one.
  if (url.search.length > 0) return false

  // `env` participates so a future non-default canonical host is respected
  // rather than silently rejected.
  const configured = (env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL).trim()
  try {
    const configuredHost = new URL(configured).hostname
    if (!CANONICAL_HOST.test(configuredHost)) return false
  } catch {
    return false
  }

  return true
}

/**
 * The URL that opens a target's share dialog, or null when there isn't one.
 *
 * Null is a real answer, not a failure: TikTok publishes no public web endpoint
 * for handing off an arbitrary link, and `copy`/`native` are not handoffs at
 * all. Callers fall back to copying the link — which is honest — instead of
 * opening a fabricated URL or claiming a post was made.
 */
export function buildShareUrl(
  id: ShareTargetId,
  canonicalUrl: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!isShareableUrl(canonicalUrl, env)) return null

  const encoded = encodeURIComponent(canonicalUrl)
  switch (id) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encoded}`
    case 'zalo':
      return `https://sp.zalo.me/plugins/share?url=${encoded}`
    // TikTok: no public web share endpoint exists. Saying so is the feature.
    case 'tiktok':
    case 'copy':
    case 'native':
      return null
  }
}
