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
  | 'facebook' | 'messenger' | 'zalo' | 'whatsapp' | 'telegram' | 'viber' | 'line' | 'tiktok'
  | 'email' | 'inbox' | 'save' | 'copy' | 'native'

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
 * The product-required target set, in display order: the messaging apps first,
 * then the actions. This list is the contract the Android and iOS clients
 * mirror (crossPlatformShare.test.ts) — same ids, same order, on all three.
 *
 * Each app target is a documented public entry point of the platform itself:
 *
 *  - Facebook   the sharer dialog with the BRAND url.
 *  - Messenger  `fb-messenger://share?link=` — Messenger's own share deep link.
 *               There is no web equivalent without a Facebook App ID (the
 *               send dialog requires one, and this project has none), so the
 *               web menu offers it only where the scheme can be opened — see
 *               `canOpenMessenger`. It is never faked on desktop.
 *  - Zalo       the share plugin with the BRAND url.
 *  - WhatsApp   `https://wa.me/?text=` — WhatsApp's "click to chat", which
 *               opens the app on a phone and WhatsApp Web on a desktop.
 *  - Telegram   `https://t.me/share/url?url=&text=` — Telegram's share widget
 *               endpoint, app or web alike.
 *  - Viber      `viber://forward?text=`.
 *  - LINE       `https://line.me/R/share?text=`.
 *
 * TikTok is the social app. It is deliberately NOT the commerce partner that
 * appears in Deals, and must never be labelled "TikTok Shop".
 */
export const SHARE_TARGETS: readonly ShareTarget[] = [
  { id: 'facebook', labelKey: 'share.facebook', kind: 'url-handoff', color: '#1877F2' },
  { id: 'messenger', labelKey: 'share.messenger', kind: 'url-handoff', color: '#0084FF' },
  { id: 'zalo', labelKey: 'share.zalo', kind: 'url-handoff', color: '#0068FF' },
  { id: 'whatsapp', labelKey: 'share.whatsapp', kind: 'text-handoff', color: '#25D366' },
  { id: 'telegram', labelKey: 'share.telegram', kind: 'text-handoff', color: '#26A5E4' },
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

/** Everything the web menu shows — the same contract, nothing web-only. */
export const WEB_SHARE_TARGETS: readonly ShareTarget[] = SHARE_TARGETS

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
    // Messenger's own share deep link (developers.facebook.com/docs/sharing/messenger).
    // A custom scheme, so the caller copies first — nothing reports whether the app opened.
    case 'messenger':
      return `fb-messenger://share?link=${encoded}`
    // 🚨 Zalo publishes NO standalone web share URL. the former `sp.zalo.me` plugin url
    // was a guess: it answers 200 with an EMPTY document (measured 2026-09-14, curl
    // and Chromium alike), so the tab opened blank and nothing was shared. Zalo's
    // own sdk.js draws an inline iframe widget on desktop and, on a phone, hands
    // the link straight to the app — see `zaloMobileHandoff`. Desktop callers copy
    // the link and say so, the same honest answer as TikTok.
    case 'zalo':
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
 * Zalo on a PHONE'S browser: the two URIs Zalo's own web SDK uses to hand a link
 * to the installed app (`sp.zalo.me/plugins/sdk.js`, `shareOnMobile`, read
 * 2026-09-14 — not guessed): an Android SEND intent aimed at `zaloapp.com`, and
 * the iOS share-extension scheme. The app then unfurls the url itself, so the
 * recipient gets the plan page's own card. Null on desktop, where the SDK has
 * only an in-page widget and no URL a page could open.
 */
export function zaloMobileHandoff(
  canonicalUrl: string,
  userAgent: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!isShareableUrl(canonicalUrl, env)) return null
  const encoded = encodeURIComponent(canonicalUrl)
  if (/android/i.test(userAgent)) {
    return `intent://zaloapp.com/#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.SUBJECT=;S.android.intent.extra.TEXT=${encoded};B.hidePostFeed=false;B.backToSource=true;end`
  }
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return `zaloshareext://shareext?url=${encoded}&type=8&version=1`
  }
  return null
}

/**
 * Whether this browser can hand a link to the Zalo app at all — a phone. On a
 * desktop the Zalo tile is honest about what it does: it copies the link.
 *
 * Why not the official web Share Button on desktop: it needs an Official
 * Account id (`data-oaid`, the SDK refuses without one) and its widget host,
 * `button-share.zalo.me`, does not resolve in public DNS (NXDOMAIN, measured
 * 2026-09-14 while `button-follow`/`button-call.zalo.me` resolve) — the iframe
 * it builds loads zero bytes. Nothing a page can embed opens a Zalo composer.
 */
export function canHandoffToZalo(userAgent: string | undefined): boolean {
  return !!userAgent && (/android/i.test(userAgent) || /iPad|iPhone|iPod/.test(userAgent))
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
