import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { buildSpaLinks } from '@/lib/platformLinks/spa'
import { buildEntertainmentLinks } from '@/lib/platformLinks/entertainment'
import { reviewActionsForPlace, type ReviewAction } from '@/lib/ai/consultative/reviewAction'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

// ── ONE ACTION LIST, ONE AUTHORITY ───────────────────────────────────────────
//
// Three shapes used to describe the same idea — `order_links`, `platform_links`
// and `review_actions` — and a fourth, `[CTA_BUTTONS]`, was written by the model
// from URL templates in the system prompt. Same platforms, same venues, two
// authorities, one of which was a language model typing URLs.
//
// 🔑 THE APPLICATION IS THE ONLY URL AUTHORITY. Every URL below is either a real
// provider URL that arrived in a tool result, or one this file constructed from
// an allow-listed template plus an encoded real name. Construction IS the
// validation: there is no code path here that accepts a URL from the model.
//
// 🚨 The existing builders are WRAPPED, not rewritten. `buildFoodOrderLinks`,
// `buildSpaLinks`, `buildEntertainmentLinks` and `reviewActionsForPlace` stay
// the source of truth for what a link should be; this module only gives their
// output one shape and one ordering.

export type ActionKind =
  | 'maps' | 'directions' | 'website' | 'order' | 'delivery' | 'booking'
  | 'reservation' | 'ticket' | 'purchase' | 'review' | 'call' | 'social'

/**
 * 🚨 THE HONESTY FIELD.
 *
 * A Serper product `link` goes to the product. A ShopeeFood order link goes to a
 * SEARCH RESULTS PAGE for the venue's name, and the venue may not be listed
 * there at all. Rendering both as "Order now" makes a promise the second cannot
 * keep, so the difference is carried as data rather than left to whoever writes
 * the button copy to remember.
 */
export type UrlKind = 'direct' | 'search'

export interface Action {
  kind: ActionKind
  urlKind: UrlKind
  url: string
  /** i18n key — never model-written text, and never a pre-translated string. */
  labelKey: string
  /** 'ShopeeFood', 'Booking.com', 'Tiki' — for the label's interpolation and for analytics. */
  platform?: string
  /** Deterministic ordering. Lower sorts first. */
  priority: number
  /** Only meaningful for `review`: true when the URL is attributed content rather than a search. */
  attributed?: boolean
}

/**
 * Per-domain priority. A table, not a judgement call at render time — and
 * certainly not the model's opinion about which platform matters.
 */
const PRIORITY: Record<string, ActionKind[]> = {
  food: ['order', 'delivery', 'maps', 'review', 'website', 'call', 'directions'],
  shopping: ['purchase', 'website', 'review'],
  travel: ['booking', 'maps', 'website', 'review', 'call', 'directions'],
  entertainment: ['website', 'maps', 'review', 'call', 'ticket', 'directions'],
  spa: ['website', 'maps', 'call', 'review', 'reservation', 'directions'],
  place: ['maps', 'website', 'review', 'call', 'directions'],
}

const priorityFor = (domain: string, kind: ActionKind): number => {
  const order = PRIORITY[domain] ?? PRIORITY.place
  const i = order.indexOf(kind)
  // An action with no place in this domain's table sorts after everything that
  // has one, rather than silently jumping to the front on index -1.
  return i === -1 ? order.length : i
}

/** Platforms whose links this module builds are search pages, not destinations. */
const SEARCH_PLATFORMS = new Set(['ShopeeFood', 'GrabFood', 'BeFood', 'Booking.com', 'Agoda', 'Shopee', 'Tiki', 'Lazada', 'Vexere'])

/**
 * Label keys, one per kind. The label is resolved by the client from its own
 * dictionaries, which is what removed the prompt rule requiring the MODEL to
 * translate its own button text into the response language.
 */
const LABEL_KEY: Record<ActionKind, string> = {
  maps: 'v3.action.maps',
  directions: 'v3.action.directions',
  website: 'v3.action.website',
  order: 'v3.action.order',
  delivery: 'v3.action.delivery',
  booking: 'v3.action.booking',
  reservation: 'v3.action.reservation',
  ticket: 'v3.action.ticket',
  purchase: 'v3.action.purchase',
  review: 'v3.action.review',
  call: 'v3.action.call',
  social: 'v3.action.social',
}

/**
 * The only way an Action is created.
 *
 * Returns `null` for anything that is not a usable https URL, so a malformed or
 * unsafe value drops out of the list instead of reaching a button. `tel:` is the
 * one non-https scheme allowed, and only for `call`.
 */
function action(
  kind: ActionKind,
  url: string | undefined | null,
  domain: string,
  opts: { urlKind?: UrlKind; platform?: string; attributed?: boolean } = {},
): Action | null {
  const u = (url ?? '').trim()
  if (!u) return null
  if (kind === 'call') {
    if (!u.startsWith('tel:')) return null
  } else if (!isSafeHttpsUrl(u)) {
    return null
  }
  const platform = opts.platform
  return {
    kind,
    urlKind: opts.urlKind ?? (platform && SEARCH_PLATFORMS.has(platform) ? 'search' : 'direct'),
    url: u,
    labelKey: LABEL_KEY[kind],
    ...(platform ? { platform } : {}),
    priority: priorityFor(domain, kind),
    ...(opts.attributed !== undefined ? { attributed: opts.attributed } : {}),
  }
}

/** The row shape this builder reads. Structural — any tool result row satisfying it works. */
export interface ActionSource {
  name?: string
  address?: string
  place_id?: string
  maps_link?: string
  website_uri?: string
  phone?: string
  link?: string
  booking_link?: string
  agoda_link?: string
  order_links?: { name: string; url: string }[]
  platform_links?: { name: string; url: string }[]
  review_actions?: readonly ReviewAction[]
  tiktok_review_url?: string
  has_tiktok_review?: boolean
}

/** Maps a `ReviewAction.kind` onto whether the URL is content or a place to look. */
const REVIEW_IS_SEARCH = new Set(['youtube_search_fallback'])

/**
 * Build the deterministic action list for one result row.
 *
 * `location` is the user's stated area, passed through to the order-link builder
 * exactly as `searchPlaces` passes it today — it is what makes "Highlands Quận 1"
 * search for the right branch.
 */
export function buildActions(
  src: ActionSource,
  domain: string,
  location?: string,
): Action[] {
  const out: (Action | null)[] = []
  const name = (src.name || '').trim()

  // ── Ordering / delivery — food only, and only from the shipped builder ─────
  // Recomputed here when the row did not carry them, so an entity built outside
  // the food enrichment path still gets the same links the same way. Never
  // hand-assembled: one builder, one set of templates.
  const orderLinks = src.order_links ?? (domain === 'food' && name ? buildFoodOrderLinks(name, src.address, location) : [])
  for (const l of orderLinks) out.push(action('order', l.url, domain, { platform: l.name, urlKind: 'search' }))

  // ── Platform links — spa and entertainment: website + maps, nothing more ───
  const platformLinks = src.platform_links ?? (
    name && domain === 'spa' ? buildSpaLinks(name, src.website_uri, src.maps_link)
      : name && domain === 'entertainment' ? buildEntertainmentLinks(name, src.website_uri, src.maps_link)
        : []
  )
  for (const l of platformLinks) {
    const kind: ActionKind = /maps/i.test(l.name) ? 'maps' : 'website'
    out.push(action(kind, l.url, domain, { platform: l.name }))
  }

  // ── Travel ────────────────────────────────────────────────────────────────
  out.push(action('booking', src.booking_link, domain, { platform: 'Booking.com', urlKind: 'search' }))
  out.push(action('booking', src.agoda_link, domain, { platform: 'Agoda', urlKind: 'search' }))

  // ── Shopping — the one genuinely direct commerce link in the system ────────
  out.push(action('purchase', src.link, domain, { urlKind: 'direct' }))

  // ── Universal ─────────────────────────────────────────────────────────────
  out.push(action('maps', src.maps_link, domain, { urlKind: 'direct' }))
  out.push(action('website', src.website_uri, domain, { urlKind: 'direct' }))
  if (src.phone) out.push(action('call', `tel:${src.phone.replace(/[^\d+]/g, '')}`, domain, { urlKind: 'direct' }))

  // ── Reviews — the ladder, with its `attributed` flag intact ────────────────
  const reviews = src.review_actions ?? (name || src.place_id ? reviewActionsForPlace({
    name,
    place_id: src.place_id,
    maps_link: src.maps_link,
    website_uri: src.website_uri,
    tiktok_review_url: src.tiktok_review_url,
    has_tiktok_review: src.has_tiktok_review,
  }) : [])
  for (const r of reviews) {
    // Maps and website already have their own entries above; re-adding them as
    // "review" would show the same URL twice under two different promises.
    if (r.kind === 'google_maps' || r.kind === 'official_website') continue
    out.push(action('review', r.url, domain, {
      urlKind: REVIEW_IS_SEARCH.has(r.kind) ? 'search' : 'direct',
      attributed: r.attributed,
    }))
  }

  return dedupe(out.filter((a): a is Action => a !== null)).sort((a, b) => a.priority - b.priority)
}

/**
 * One URL, one button.
 *
 * The same address legitimately arrives from two builders — `platform_links`
 * carries a Google Maps URL and so does `maps_link` — and showing it twice reads
 * as two different destinations. First claimant wins, which preserves the
 * kind the higher-priority producer chose.
 */
function dedupe(actions: Action[]): Action[] {
  const seen = new Set<string>()
  const out: Action[] = []
  for (const a of actions) {
    const key = `${a.kind}|${a.url}`
    if (seen.has(key)) continue
    // A URL already claimed by ANOTHER kind is also a duplicate destination.
    if ([...seen].some(k => k.endsWith(`|${a.url}`))) continue
    seen.add(key)
    out.push(a)
  }
  return out
}
