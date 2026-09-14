import type { Action } from './actions'

// ── A LABEL IS A PROMISE ABOUT WHERE A BUTTON GOES ──────────────────────────
//
// 🚨 THE MEASURED DEFECT. Every card labelled its buttons from `kind` alone, so
// a `review` action rendered "Xem review" / "Read reviews" whether its URL was
// an attributed TikTok video or a bare YouTube *search* for the venue's name.
// On a travel turn that read as a promise of a review and opened a search page —
// and the same shape mislabelled a `booking` search on Booking.com as "Đặt
// phòng" and an order platform's search page as "Đặt món".
//
// Nothing was missing from the data. `Action` has carried the two fields that
// settle it since the action layer was built:
//
//   · `urlKind`    'direct' → this URL IS the thing;  'search' → it is a query
//   · `attributed` only meaningful for `review`: true when the URL is a specific
//                  piece of content rather than somewhere to go looking
//
// The cards simply never read them. This resolver is the one place that turns
// (kind, urlKind, attributed, url) into a label key, so every surface makes the
// same promise and a new surface cannot quietly invent a looser one.
//
// 🔑 IT NEVER CHANGES A DESTINATION. Given a URL that goes to a search page, the
// answer is to SAY "search", not to swap in a different URL. Fabricating a
// direct link to make a label true is the failure this exists to prevent.

/** The platform a URL actually opens, for interpolation into a label. */
const HOST_BRAND: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)shopee\./, 'Shopee'],
  [/(^|\.)lazada\./, 'Lazada'],
  [/(^|\.)tiki\.vn$/, 'Tiki'],
  [/(^|\.)shopeefood\./, 'ShopeeFood'],
  [/(^|\.)grab\.com$/, 'GrabFood'],
  [/(^|\.)be\.com\.vn$/, 'BeFood'],
  [/(^|\.)booking\.com$/, 'Booking.com'],
  [/(^|\.)agoda\./, 'Agoda'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)vexere\./, 'Vexere'],
]

/**
 * A human name for where this link goes.
 *
 * The provider's own `platform` wins when it set one — it knows the merchant.
 * Otherwise the host is read, because a label that names the wrong site is the
 * defect this file exists to stop. Unknown hosts return null and the caller
 * falls back to a label that names no platform at all.
 */
export function platformOf(action: Pick<Action, 'url' | 'platform'>): string | null {
  if (action.platform) return action.platform
  let host: string
  try { host = new URL(action.url).hostname.replace(/^www\./, '') } catch { return null }
  for (const [re, brand] of HOST_BRAND) if (re.test(host)) return brand
  const first = host.split('.')[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : null
}

export interface ResolvedLabel {
  /** i18n key to render. */
  key: string
  /** Interpolation params, when the key takes a platform. */
  params?: { platform: string }
}

/**
 * The label this action has earned.
 *
 * A `search` destination always says so. A `review` says "review" only when the
 * URL is attributed content; otherwise it says it is a place to go looking.
 */
export function resolveActionLabel(
  action: Pick<Action, 'kind' | 'urlKind' | 'url' | 'platform' | 'attributed' | 'commerce'>,
): ResolvedLabel {
  const platform = platformOf(action)
  const withPlatform = (key: string, fallback: string): ResolvedLabel =>
    platform ? { key, params: { platform } } : { key: fallback }
  // 🔑 A COMMERCE LINK NAMES ITS MERCHANT AND ITS LOGIN BOUNDARY. "Đặt phòng" on
  // a Trip.com page the platform verified is a promise the URL keeps; "Mua vé
  // trên CGV · cần đăng nhập" says, before the tap, that CGV asks for a login
  // before the seat map (authRequiredAt = before_selection). A search handoff
  // is still labelled as a search — the branch below never runs for one.
  if (action.commerce && action.urlKind === 'direct') {
    const key = COMMERCE_LABEL[action.kind]
    if (key) {
      // Phase 8 (P1-4): a ShopeeFood restaurant page shows the menu on the web but takes the order
      // only in the app — "Đặt món trên ShopeeFood" would promise a web checkout the page cannot
      // keep, so the label states the app boundary instead.
      if (action.commerce.authRequiredAt === 'app_only') return withPlatform(`${key}AppOn`, key)
      return action.commerce.loginRequired
        ? withPlatform(`${key}LoginOn`, key)
        : withPlatform(`${key}On`, key)
    }
  }

  if (action.kind === 'review') {
    // Attribution, not the host, decides this. A TikTok video the pipeline tied
    // to THIS place is a review; a YouTube search for its name is not.
    return action.attributed
      ? withPlatform('v3.action.reviewOn', 'v3.action.review')
      : withPlatform('v3.action.reviewSearch', 'v3.action.reviewSearchGeneric')
  }

  if (action.urlKind === 'search') {
    // A CCP SEARCH_HANDOFF whose merchant asks for a login before the results (Shopee web) says so.
    if (action.commerce?.loginRequired) return withPlatform('v3.action.searchLoginOn', 'v3.action.searchGeneric')
    switch (action.kind) {
      case 'booking': return withPlatform('v3.action.bookingSearch', 'v3.action.searchGeneric')
      case 'reservation': return withPlatform('v3.action.bookingSearch', 'v3.action.searchGeneric')
      case 'ticket': return withPlatform('v3.action.ticketSearch', 'v3.action.searchGeneric')
      case 'order':
      case 'delivery': return withPlatform('v3.action.orderSearch', 'v3.action.searchGeneric')
      case 'purchase': return withPlatform('v3.action.searchOn', 'v3.action.searchGeneric')
      default: return withPlatform('v3.action.searchOn', 'v3.action.searchGeneric')
    }
  }

  // A direct destination keeps the plain verb it always had.
  switch (action.kind) {
    case 'maps': return { key: 'v3.action.maps' }
    case 'directions': return { key: 'v3.action.directions' }
    case 'website': return { key: 'v3.action.website' }
    case 'call': return { key: 'v3.action.call' }
    case 'order': return { key: 'v3.action.order' }
    case 'delivery': return { key: 'v3.action.delivery' }
    case 'booking': return { key: 'v3.action.booking' }
    case 'reservation': return { key: 'v3.action.reservation' }
    case 'ticket': return { key: 'v3.action.ticket' }
    case 'purchase': return { key: 'v3.action.purchase' }
    case 'social': return { key: 'v3.action.social' }
    default: return { key: 'v3.action.website' }
  }
}

/**
 * Kinds a commerce intent can map to (see src/lib/ccp/cta/projection.ts
 * `actionKindFor`) and the base key each renders with. "${key}On" takes the
 * merchant; "${key}LoginOn" additionally states the login boundary.
 */
const COMMERCE_LABEL: Partial<Record<Action['kind'], string>> = {
  purchase: 'v3.action.purchase',
  booking: 'v3.action.booking',
  reservation: 'v3.action.reservation',
  ticket: 'v3.action.ticket',
  order: 'v3.action.order',
  delivery: 'v3.action.delivery',
}

/** Convenience for a component: the finished string. */
export function actionLabel(
  action: Pick<Action, 'kind' | 'urlKind' | 'url' | 'platform' | 'attributed' | 'commerce'>,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  const { key, params } = resolveActionLabel(action)
  return params ? t(key, params) : t(key)
}
