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

export type ShareTargetId =
  | 'facebook' | 'zalo' | 'viber' | 'line' | 'tiktok'
  | 'email' | 'inbox' | 'save' | 'copy' | 'native'
  | 'messenger' | 'whatsapp' | 'telegram'

/**
 * How a target consumes the artifact.
 *
 *  - `url-handoff`  opens the platform's share dialog with the BRAND url. The
 *                   brochure text is copied first, because the url alone cannot
 *                   carry a recommendation (there is no per-recommendation page —
 *                   Places data is live-only and never gets a public URL).
 *  - `text-handoff` opens a platform URI that carries the brochure TEXT itself
 *                   (mailto, viber://forward, line.me/R/share). No copy needed.
 *  - `clipboard`    copies the brochure.
 *  - `inbox`        posts the brochure as a normal Tappy Messenger message.
 *  - `save`         writes the artifact to the device.
 *  - `native`       the OS share sheet, with title + text (+ image when present).
 */
export type ShareTargetKind = 'url-handoff' | 'text-handoff' | 'clipboard' | 'inbox' | 'save' | 'native'

export interface ShareTarget {
  id: ShareTargetId
  /** i18n key — never a literal label, so vi/en both work. */
  labelKey: string
  kind: ShareTargetKind
  /** Brand colour for a surface with no mark to show; the web tile shows the real mark (shareBrands.ts). */
  color?: string
}

/**
 * The product-required target set, in display order.
 *
 * TikTok is the social app. It is deliberately NOT the commerce partner that
 * appears in Deals, and must never be labelled "TikTok Shop".
 */
export const SHARE_TARGETS: readonly ShareTarget[] = [
  // `facebook` is the id the cross-platform parity test pins and the existing
  // sharer handoff serves. It is LABELLED "Facebook / Messenger" because that is
  // the one destination the product asks for; Messenger's own web send-dialog
  // needs a Facebook App ID this project does not have, so both land here.
  { id: 'facebook', labelKey: 'share.facebook', kind: 'url-handoff', color: '#1877F2' },
  { id: 'zalo', labelKey: 'share.zalo', kind: 'url-handoff', color: '#0068FF' },
  { id: 'viber', labelKey: 'share.viber', kind: 'text-handoff', color: '#7360F2' },
  { id: 'line', labelKey: 'share.line', kind: 'text-handoff', color: '#06C755' },
  // TikTok publishes no share endpoint: honestly a clipboard target, shown with the apps.
  { id: 'tiktok', labelKey: 'share.tiktok', kind: 'clipboard', color: '#010101' },
  { id: 'email', labelKey: 'share.email', kind: 'text-handoff', color: '#EA4335' },
  { id: 'inbox', labelKey: 'share.inbox', kind: 'inbox', color: '#F97316' },
  { id: 'save', labelKey: 'share.save', kind: 'save' },
  { id: 'copy', labelKey: 'share.copyLink', kind: 'clipboard' },
  { id: 'native', labelKey: 'share.more', kind: 'native' },
] as const

/**
 * Destinations the WEB menu offers beyond the cross-platform set above. Each is
 * a documented public entry point of the platform itself:
 *
 *  - Messenger  `fb-messenger://share?link=` — Messenger's own share deep link.
 *               There is no web equivalent without a Facebook App ID (the
 *               send dialog requires one, and this project has none), so the
 *               menu offers it only where the scheme can be opened — see
 *               `canOpenMessenger`. It is never faked on desktop.
 *  - WhatsApp   `https://wa.me/?text=` — WhatsApp's "click to chat", which
 *               opens the app on a phone and WhatsApp Web on a desktop.
 *  - Telegram   `https://t.me/share/url?url=&text=` — Telegram's share widget
 *               endpoint, app or web alike.
 *
 * Kept apart from `SHARE_TARGETS` because that list is the contract the
 * Android and iOS clients mirror (crossPlatformShare.test.ts); these three are
 * web-only until the native clients declare them too.
 */
export const WEB_ONLY_SHARE_TARGETS: readonly ShareTarget[] = [
  { id: 'messenger', labelKey: 'share.messenger', kind: 'url-handoff', color: '#0084FF' },
  { id: 'whatsapp', labelKey: 'share.whatsapp', kind: 'text-handoff', color: '#25D366' },
  { id: 'telegram', labelKey: 'share.telegram', kind: 'text-handoff', color: '#26A5E4' },
] as const

const byId = (id: ShareTargetId): ShareTarget =>
  [...SHARE_TARGETS, ...WEB_ONLY_SHARE_TARGETS].find((t) => t.id === id)!

/** Everything the web menu shows, in display order: the messaging apps first, then the actions. */
export const WEB_SHARE_TARGETS: readonly ShareTarget[] = [
  byId('facebook'), byId('messenger'), byId('zalo'), byId('whatsapp'), byId('telegram'),
  byId('viber'), byId('line'), byId('tiktok'), byId('email'),
  byId('inbox'), byId('save'), byId('copy'), byId('native'),
]

/**
 * Messenger's share scheme only resolves where the Messenger APP can be
 * installed. On a desktop browser nothing handles `fb-messenger://`, so the
 * menu leaves the tile out rather than opening a dead link (the Facebook
 * sharer, which is offered everywhere, carries a "Send in Messenger" option).
 */
export function canOpenMessenger(userAgent: string | undefined): boolean {
  return /android|iphone|ipad|ipod/i.test(userAgent ?? '')
}

export function shareTarget(id: ShareTargetId): ShareTarget {
  const found = WEB_SHARE_TARGETS.find((t) => t.id === id)
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
    // Messenger's own share deep link (developers.facebook.com/docs/sharing/messenger).
    // A custom scheme, so the caller copies first — nothing reports whether the app opened.
    case 'messenger':
      return `fb-messenger://share?link=${encoded}`
    // TikTok: no public web share endpoint exists. Saying so is the feature.
    // Text, inbox, save, clipboard and native are not url handoffs at all.
    case 'tiktok':
    case 'viber':
    case 'line':
    case 'email':
    case 'whatsapp':
    case 'telegram':
    case 'inbox':
    case 'save':
    case 'copy':
    case 'native':
      return null
  }
}

/**
 * Text carried inside a handoff URI has a practical ceiling. Mail clients,
 * Viber and LINE each truncate somewhere past this; the Inbox body bound is a
 * conservative, already-tested number that fits all of them.
 */
export const TEXT_HANDOFF_MAX = 4000

/**
 * The URI that opens a target WITH THE BROCHURE TEXT IN IT, or null.
 *
 * These are the channels that can carry a recommendation without a public
 * page: a mailto body, Viber's forward scheme, LINE's share scheme. Each is a
 * documented public entry point, not a guessed one — and each is still only an
 * OPEN, never a send: the user finishes the action in the other app, so no
 * caller may report delivery.
 *
 * Null for every other target, and null when `text` is empty — an empty
 * brochure is not a share.
 */
export function buildTextShareUrl(id: ShareTargetId, subject: string, text: string, url = ''): string | null {
  const body = (text ?? '').trim()
  if (!body) return null
  const clipped = body.length > TEXT_HANDOFF_MAX ? body.slice(0, TEXT_HANDOFF_MAX) : body
  const enc = encodeURIComponent(clipped)
  switch (id) {
    case 'email':
      return `mailto:?subject=${encodeURIComponent(subject)}&body=${enc}`
    case 'viber':
      return `viber://forward?text=${enc}`
    case 'line':
      return `https://line.me/R/share?text=${enc}`
    // WhatsApp "click to chat" (faq.whatsapp.com/5913398998672934): the text is the message.
    case 'whatsapp':
      return `https://wa.me/?text=${enc}`
    // Telegram share widget (core.telegram.org/widgets/share): a link plus an optional text.
    // When the text IS the link (a review), it goes once, as the url.
    case 'telegram': {
      const link = (url ?? '').trim() || clipped
      const withText = clipped !== link
      return `https://t.me/share/url?url=${encodeURIComponent(link)}${withText ? `&text=${enc}` : ''}`
    }
    default:
      return null
  }
}
