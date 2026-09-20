import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { buildSpaLinks } from '@/lib/platformLinks/spa'
import { buildEntertainmentLinks } from '@/lib/platformLinks/entertainment'
import { reviewActionsForPlace, type ReviewAction } from '@/lib/ai/consultative/reviewAction'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { actionKindFor, urlKindFor, isCommerceLinkRow, requiresMerchantLogin, providerOwning, type CommerceLinkRow } from '@/lib/ccp'
import { outboundLinkFacts, isDeepEnough, reportOutboundLink } from '@/lib/commerce/outboundLink'

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
//
// 🔑 COMMERCE LINKS (CCP, owner decisions P6-A/B, 13 Sep 2026). A row may carry
// `commerce_links` — Commerce Links the Commerce Capability Platform resolved,
// validated and ranked (src/lib/ccp). They enter this list as ordinary Actions:
// same shape, same channels, same dedupe. What makes them different is carried
// as DATA on the action (`commerce`): the merchant, how deep the URL lands, and
// whether the merchant asks for a login before the step can be completed. The
// label resolver reads that data; nothing here writes button copy.

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
  /**
   * Present only on an action the Commerce Capability Platform resolved. Facts a
   * label or a handoff event needs; never a second URL and never prose.
   */
  commerce?: CommerceActionFacts
}

/** The CCP facts an Action carries. A projection of `CommerceLinkRow`, kept scalar for the wire. */
export interface CommerceActionFacts {
  linkId: string
  requestId: string
  providerId: string
  /** L0–L5 the URL lands at for a guest. */
  depth: number
  guestDepth: number
  authRequiredAt: CommerceLinkRow['authRequiredAt']
  /** True when the merchant asks for a login BEFORE the landed step can be completed (CGV, Klook). */
  loginRequired: boolean
  /** What the user meets after the tap (Completion Pass, native contract §12). Absent on rows persisted before it existed. */
  handoff?: CommerceLinkRow['handoff']
  /** Deepest verified level after a merchant login; null = not verified. */
  authenticatedDepth?: CommerceLinkRow['authenticatedDepth']
  freshnessType: CommerceLinkRow['freshness']['freshnessType']
  /** Session-bound URLs expire (a dated stay, a hold); null = stable. */
  expiresAt: string | null
  tracked: boolean
  /** The capability the link serves — what ranking compared on. */
  capability?: CommerceLinkRow['capability']
  /** Whether that capability is the one the user asked for this turn. */
  primary: boolean
  /** Observed facts (price / availability / schedule) when a source stated them; never inferred. */
  facts?: CommerceLinkRow['facts']
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
/**
 * Does this URL land somewhere that names the venue, or on a front door?
 *
 * 🚨 THE MEASURED DEFECT: `buildFoodOrderLinks` returns BeFood as the bare site
 * root for every restaurant, because BeFood publishes no search page. Shown
 * beside ShopeeFood and GrabFood — both of which carry the venue's name in the
 * query — it looked like a third way to order this meal and was a homepage.
 *
 * 🔑 A SEARCH URL PASSES. This is NOT `isDirectEntityUrl`, which asks the
 * opposite question for ticket provenance: there a search page proves nothing,
 * here a search page carrying the venue's name is exactly what an order button
 * is allowed to be. Same shape, different question — do not merge them.
 *
 * The rule is about the destination, not the brand: BeFood support stays in the
 * builder and the data, and a venue-specific BeFood URL still shows.
 */
function namesTheVenue(url: string): boolean {
  try {
    const u = new URL(url)
    return u.pathname.replace(/\/+$/, '').length > 1 || u.search.length > 1
  } catch { return false }
}

/** OTA hosts whose own deep page IS the booking. */
const OTA_HOST = /(^|\.)(booking\.com|agoda\.[a-z.]+)$/i

/**
 * What the row's own `link` is, given the domain it came from.
 *
 * Shopping is the one place a link really is a product. On travel an OTA's own
 * hotel page is a booking. Everything else — an unknown host, a spa or an
 * entertainment venue's site — is a website, never guessed into either.
 */
function rowLinkKind(link: string | undefined, domain: string): ActionKind {
  if (!link) return 'website'
  if (domain === 'shopping') return 'purchase'
  let host = ''
  try { host = new URL(link).hostname.replace(/^www\./, '') } catch { return 'website' }
  if (domain === 'travel' && OTA_HOST.test(host)) return 'booking'
  return 'website'
}

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
  /** The registry provider the user NAMED this turn (stamped by the CCP seam); other merchants' legacy links step aside. */
  _tappy_requested_provider?: string
  order_links?: { name: string; url: string }[]
  platform_links?: { name: string; url: string }[]
  /**
   * Entity-scoped ordering evidence, moved here from the result envelope by
   * `withEntityScopedEvidence`. Area-scoped items are never attached.
   */
  order_search_results?: readonly { link?: string; title?: string; snippet?: string }[]
  review_actions?: readonly ReviewAction[]
  tiktok_review_url?: string
  has_tiktok_review?: boolean
  /** CCP row attachment — see src/lib/ccp/row.ts. Structural; a persisted row is re-checked. */
  commerce_links?: readonly CommerceLinkRow[]
}

/**
 * 🚨 A COMMERCE LINK OUTRANKS EVERY TABLE ENTRY — by construction, not by table.
 *
 * The per-domain PRIORITY table orders KINDS ("on a food turn, ordering before
 * maps"). A CCP link is not a kind; it is a verified merchant destination that
 * the platform resolved for THIS subject — deeper than any search handoff of the
 * same kind and the one action the turn exists to offer (P6-A: "→ commerce
 * handoff"). It therefore sorts before index 0 rather than being slotted into a
 * table that has no row for "the real one". Two commerce links keep CCP's own
 * ranking order (they arrive ranked; the array index is the tie-break).
 *
 * 🔑 …BUT ONLY FOR THE CAPABILITY THE USER ASKED FOR (owner correction, 13 Sep
 * 2026). A reservation link on a "find me a restaurant" or "deliver to
 * my door" turn is a capability the user did not request: it is still offered,
 * with the domain table's priority for its kind (after order links and maps),
 * never in front of them. "Deeper" is not "more relevant".
 */
const COMMERCE_PRIORITY = -1

/**
 * Normalised destination identity: scheme-insensitive host, path without a
 * trailing slash, sorted query — so a row's own `link` and a Commerce Link's
 * `destinationUrl` to the same page are recognised as one destination even when
 * the commerce URL is a tracking wrapper.
 */
function destinationKey(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || '/'}?${params}`
  } catch { return null }
}

/** Commerce Links → Actions. Invalid or unsafe rows drop out; nothing is repaired. */
function commerceActions(rows: readonly CommerceLinkRow[] | undefined, domain: string): Action[] {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const out: Action[] = []
  rows.forEach((row, index) => {
    if (!isCommerceLinkRow(row)) return
    // A3.3: a Commerce Link at search / landing depth is not a CTA. The resolver no longer emits
    // one for a row, but a cached result from before still can — judged here, at the last exit.
    const facts = outboundLinkFacts(row.url, row.kind, { commerceDepth: row.depth, commerceKind: row.kind, tracked: row.tracked, providerId: row.providerId })
    if (!isDeepEnough(facts)) { reportOutboundLink(row.url, facts, { domain }); return }
    reportOutboundLink(row.url, facts, { domain })
    const kind = actionKindFor(row.intentType)
    const a = action(kind, row.url, domain, { urlKind: urlKindFor(row.kind), platform: row.merchantName })
    if (!a) return
    const primary = row.primary !== false
    out.push({
      ...a,
      // Ranked order from CCP is preserved; a fraction keeps every PRIMARY commerce action ahead of
      // index 0. A secondary one keeps the table priority of its kind.
      priority: primary ? COMMERCE_PRIORITY + index / 100 : a.priority,
      commerce: {
        linkId: row.linkId,
        requestId: row.requestId,
        providerId: row.providerId,
        depth: row.depth,
        guestDepth: row.guestDepth,
        authRequiredAt: row.authRequiredAt,
        loginRequired: requiresMerchantLogin(row.authRequiredAt),
        ...(row.handoff ? { handoff: row.handoff } : {}),
        ...(row.authenticatedDepth !== undefined ? { authenticatedDepth: row.authenticatedDepth } : {}),
        freshnessType: row.freshness.freshnessType,
        expiresAt: row.expiresAt,
        tracked: row.tracked,
        ...(row.capability ? { capability: row.capability } : {}),
        primary,
        ...(row.facts ? { facts: row.facts } : {}),
      },
    })
  })
  return out
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

  // ── Commerce Links — first, so they claim their destination in the dedupe ──
  // A row whose own `link` IS the merchant page the Commerce Link resolves to
  // (a DMX product found by Google Shopping) would otherwise show twice: once
  // as the platform's verified handoff and once as a bare "view product".
  const commerce = commerceActions(src.commerce_links, domain)
  out.push(...commerce)
  const commerceDestinations = new Set(
    (src.commerce_links ?? []).filter(isCommerceLinkRow).map(r => destinationKey(r.destinationUrl)).filter((k): k is string => !!k),
  )
  // Completion Pass live UAT (14 Sep 2026): the hotel tool's row link is the OTA property page
  // WITHOUT the stay (or in another locale); the Commerce Link is the same page with the stay
  // applied. Same merchant, same subject → the row link is the duplicate, by provider.
  const commerceProviders = new Set((src.commerce_links ?? []).filter(isCommerceLinkRow).map(r => r.providerId))
  const rowOwner = src.link ? providerOwning(src.link) : null
  // Live UAT 14 Sep 2026: "… trên Agoda" must not render a Booking.com row link or a Booking.com
  // search beside the Agoda handoff. A legacy link on ANOTHER registry merchant steps aside when
  // the user named one; links on no registry merchant (Maps, a website) are untouched.
  const requestedProvider = typeof src._tappy_requested_provider === 'string' ? src._tappy_requested_provider : null
  const otherMerchant = (url: string | undefined): boolean => { const o = url ? providerOwning(url) : null; return !!requestedProvider && !!o && o !== requestedProvider }
  const rowLink = commerceDestinations.has(destinationKey(src.link) ?? '') || (rowOwner && commerceProviders.has(rowOwner)) || otherMerchant(src.link) ? undefined : src.link

  // ── Ordering / delivery — food only, and only from the shipped builder ─────
  // Recomputed here when the row did not carry them, so an entity built outside
  // the food enrichment path still gets the same links the same way. Never
  // hand-assembled: one builder, one set of templates.
  /**
   * 🔑 A REAL ORDER PAGE FOR *THIS* VENUE OUTRANKS A SEARCH FOR IT.
   *
   * `order_search_results` is a Serper search whose every item was scored by
   * `placeNamedBy`; only items whose own text names exactly ONE place from the
   * result set are tagged `evidence_scope: 'entity'`, and only those are attached
   * to a row (see `withEntityScopedEvidence`). Such an item IS this venue's page
   * on ShopeeFood/GrabFood/Baemin, so it is a DIRECT destination.
   *
   * 🚨 An `area` item never reaches here. A listicle saying "ShopeeFood has lots
   * of bún bò places" is not evidence that THIS restaurant delivers, and turning
   * one into an order button is the claim `isOrderingClaim` exists to stop in
   * prose. Same rule, same evidence, different surface.
   */
  for (const ev of src.order_search_results ?? []) {
    if (!ev?.link || !namesTheVenue(ev.link)) continue
    const facts = outboundLinkFacts(ev.link, 'order')
    reportOutboundLink(ev.link, facts, { domain })
    if (!isDeepEnough(facts)) continue
    out.push(action('order', ev.link, domain, { urlKind: 'direct', attributed: true }))
  }
  /**
   * A3.3 / A3.6 (owner, 2026-09-20): GrabFood and ShopeeFood are Tier 2 CTAs on the CARD — and a
   * CTA is the venue's OWN page on the platform (the entity-scoped evidence above, or a Commerce
   * Link), never the platform's search for its name and never a front door. The legacy
   * `order_links` (GrabFood search + BeFood homepage) were exactly those and are not emitted;
   * `buildFoodOrderLinks` stays for the prose injector's legacy surfaces only.
   */
  void buildFoodOrderLinks

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
  // The legacy OTA search actions are skipped for a merchant that already has a Commerce Link on
  // the row (its property page beats its results page), and Agoda's link only when it is a real
  // search — Agoda's search URL drops the query (verified 14 Sep 2026), so the tool now hands a
  // front door, which is never a "Tìm phòng trên Agoda" on a hotel.
  // A3.3 (2026-09-20): Booking.com's results page and Agoda's front door are search / homepage
  // depth — never a CTA. A hotel's booking action is its OWN page on the OTA (the row link below,
  // or a Commerce Link with the stay applied).
  void otherMerchant

  // ── The row's own link — and it is not a "product" outside shopping ───────
  //
  // 🚨 MEASURED ON A TRAVEL TURN: every hotel carried a `purchase` action
  // rendering as "Xem sản phẩm" whose URL was
  // `booking.com/hotel/vn/<hotel>.vi.html` — that hotel's OWN page on Booking.
  // A room is not a product, and the label said the wrong thing about a
  // perfectly good destination.
  //
  // The link's HOST decides what it is, because that is the only honest source:
  // an OTA's own hotel page is a booking, anything else is just the venue's
  // website. Nothing is guessed from the domain alone.
  const rowKind = rowLinkKind(rowLink, domain)
  if (rowLink && (rowKind === 'purchase' || rowKind === 'booking')) {
    // A3.3: a purchase / booking CTA is the product's or the hotel's OWN page. A Google Shopping
    // row link (`google.com/…ibp=oshop…`), an OTA results page or a front door is reported and
    // dropped — the card shows no CTA rather than a wrong one.
    const facts = outboundLinkFacts(rowLink, rowKind)
    reportOutboundLink(rowLink, facts, { domain })
    if (isDeepEnough(facts)) out.push(action(rowKind, rowLink, domain, { urlKind: 'direct' }))
  } else {
    out.push(action(rowKind, rowLink, domain, { urlKind: 'direct' }))
  }

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
