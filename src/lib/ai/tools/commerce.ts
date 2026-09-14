import { CCP_ENABLED } from '@/lib/config/product'
import {
  resolveCommerce,
  projectCommerceLinkRow,
  installCommerceObservability,
  COMMERCE_LINKS_KEY,
  type CommerceDomain,
  type CommerceLinkRow,
  type CommerceRequest,
  capabilityForIntent,
  discoveryScopeForProvider,
  getProvider,
  providerOwning,
  type DiscoveryHint,
  type DiscoveryScope,
  type IntentType,
} from '@/lib/ccp'
import { cleanOtaTitle, cityKeyOf, otaCityKeyOf, sameCityKey, stripTrailingCity } from '@/lib/links/otaTitle'
import { discoverySubject, productIdentityMatch } from '@/lib/links/productIdentity'
import { discoverBySubject, discoverCommerceHints, type DiscoveredHint, type DiscoverySubject, type SearchFn } from './commerceDiscovery'
import { entertainmentCapabilityOf, filmTitleMatches, filmTitleOf, foodCapabilityOf, requestedProviderOf, type UserTurns } from './commerceIntent'
import { cityToIATA } from './travel'
import { fetchEventPageText, scheduleFacts, scheduleIsPast, statedScheduleOf, type FetchTextFn } from './eventSchedule'

// ── The Phase-6 seam: tool result → CCP → `commerce_links` on the row ────────
//
// Owner decisions 13 Sep 2026: P6-A (no CTA flag flip), P6-B (row-level
// attachment through the canonical entity → actions → liveView/cta/marker
// architecture), P6-C (events to observability). This module is the ONLY place
// the chat pipeline talks to the Commerce Capability Platform:
//
//   route.ts executor ──rankForModel──▶ attachCommerceLinks ──▶ setPlacesRecommendations
//                                            │                       (reads commerce_links
//                                            ▼                        through buildActions)
//                                      resolveCommerce
//                                     (src/lib/ccp, pure)
//
// It is deliberately NOT a tool of its own and NOT a prompt rule: the model
// never sees a merchant URL (toolResultSplit carves `commerce_links` away and
// hands it `has_direct_handoff: true` instead) and never composes one.
//
// Phase 8 (owner-like UAT R1 remediation), in this file:
//   · the capability is read from the last few USER turns, not the last message (P1-2);
//   · food_delivery discovers the platforms' restaurant pages (passthrough, L3)
//     instead of a search URL that drops the query (P1-4);
//
// Owner decision 14 Sep 2026: table_reservation is NOT an active capability
// (PasGo removed from scope; see ADR-028 addendum). A reservation sentence gets
// NO commerce request — no provider, no link, no fabricated CTA — and the
// discovery results stand on their own. The vocabulary stays for reactivation.
//   · hotel subjects are cleaned OTA titles, wrong-city OTA rows are removed
//     from the result, Trip.com hits in another city are refused (P1-8, P2-8);
//   · experience providers (Klook) are discovered by SUBJECT + city and attached
//     as their own result rows, never as a link on an unrelated venue (P1-6);
//   · one link per provider per row (P2-1).
//
// 🔑 IDENTITY-PRESERVING. Rows are mutated in place, the way rankForModel does
// it, because the route keys shortlists and pick payloads on row identity.
//
// 🚨 OFF BY DEFAULT. `CCP_ENABLED` is false; with it off this function returns
// its input untouched and performs no search. Every test passes `enabled`.

export type CommerceToolName = 'search_places' | 'search_products' | 'get_hotel_prices' | 'get_flight_prices' | 'get_transport_options' | 'web_search'

export interface CommerceAttachContext {
  /** The user's stated area / city for this turn — narrows discovery and is the request's city constraint. */
  location?: string
  /** The tool's own query argument (what was searched for) — the subject for experience discovery. */
  query?: string
  /** get_hotel_prices arguments, when the user gave dates (YYYY-MM-DD). */
  checkIn?: string
  checkOut?: string
  /**
   * get_flight_prices / get_transport_options arguments (Completion Pass, 14 Sep 2026). Origin and
   * destination are the user's words; a flight needs IATA codes, which the tool layer maps. The
   * departure date DEFAULTS when the user gave none and is recorded as assumed.
   */
  origin?: string
  destination?: string
  departDate?: string
  returnDate?: string
  passengers?: number
  transportMode?: 'intercity' | 'taxi'
  platform?: 'web' | 'android' | 'ios'
  locale?: 'vi' | 'en'
  /**
   * The user's latest message (kept for callers that have only that).
   * Prefer `userTexts`: the last few user turns, oldest first.
   */
  userText?: string
  /**
   * Owner correction 13 Sep 2026 + Phase 8: the WORDS decide the capability
   * ("giao tận nhà" → food_delivery, "đặt bàn cho 2 lúc 19h" → table_reservation,
   * "vé xem phim" → cinema_ticket) — read across the recent user turns so a reply
   * to Tappy's clarifying question does not lose them.
   */
  userTexts?: readonly string[]
  /** Rows considered per tool call — the shortlist size. */
  maxRows?: number
  // ── seams (tests) ──
  enabled?: boolean
  search?: SearchFn
  /** Read-only page read for an EVENT's stated schedule (registry hosts only); tests stub it. */
  fetchText?: FetchTextFn
  resolve?: typeof resolveCommerce
  now?: Date
}

/** One CCP request the plan will issue: an intent, and whether it is what the user ASKED for. */
interface PlannedIntent {
  intentType: IntentType
  /**
   * True when the intent's capability is the one the user requested — its links may lead the
   * action list. False for a capability the row also supports but the user did not ask for
   * (a PasGo reservation on a discovery turn): resolved, offered, never ranked first.
   */
  primary: boolean
  /** Discover listings by the user's SUBJECT + city (experience catalogues) and attach them as their own rows. */
  subjectDiscovery: boolean
  /** The subject to discover by, when it is not the tool's query (a film the user named). */
  discoverySubject?: string
  /**
   * False when the provider's catalogue is not keyed by the ROW's name (films, events on a venue
   * turn): no per-row discovery query is spent, and a page found for a venue's name can never be
   * attached to the venue as if it were the venue.
   */
  rowDiscovery?: boolean
  /** Keep only discovered listings whose title (and snippet) fit: film identity, not a past event. */
  subjectFilter?(title: string | undefined, snippet?: string): boolean
  configurationFor(subject: string): { configuration: CommerceRequest['configuration']; assumed: string[] } | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_LINKS_PER_ROW = 2
/** Shopping (14 Sep 2026): one handoff per provider — Shopee, TikTok Shop, Lazada, DMX, CellphoneS side by side. */
const MAX_SHOPPING_LINKS_PER_ROW = 5
const MAX_SHOPPING_QUERIES = 8
const MAX_LINKS_PER_PROVIDER = 1
const MAX_EXPERIENCE_ROWS = 2
const DEFAULT_ADULTS = 2
/** Hotels (Completion Pass): Trip.com + the row's own OTA page + one more OTA, side by side. */
const MAX_HOTEL_LINKS_PER_ROW = 3
const MAX_HOTEL_QUERIES = 4
/**
 * A ROW never carries a landing page (L0/L1): a venue or a hotel with a merchant homepage under it
 * would be a duplicate, subject-less CTA. Landing fallbacks exist for the route-level handoffs
 * (flights, coaches), where the merchant's front door with the route typed on site is the truth.
 */
const MIN_ROW_LINK_DEPTH = 2
/** The departure the flight / coach tools assume when the user gave no date (+7 days, VN). */
const DEFAULT_DEPART_OFFSET_MS = 7 * 86_400_000 + 7 * 3_600_000

type Row = Record<string, unknown>
const isRecord = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'subject'
const userTurns = (ctx: CommerceAttachContext): UserTurns => ctx.userTexts ?? ctx.userText

/**
 * The merchant the user NAMED (Final local live UAT, 14 Sep 2026): the CCP request is narrowed to
 * it (`merchantAllowList`) and discovery is spent only on it. "Mua iPhone trên TikTok Shop" had
 * come back with Shopee buttons and no TikTok Shop link. A request for a named merchant that has
 * no page and no search grammar yields NO link — the honest answer, never another merchant.
 */
interface RequestedProvider {
  providerId: string
  merchantAllowList: string[]
  scopesFor(domain: CommerceDomain, intentType: IntentType): DiscoveryScope[]
}
function requestedProvider(ctx: CommerceAttachContext): RequestedProvider | null {
  const providerId = requestedProviderOf(userTurns(ctx))
  const entry = providerId ? getProvider(providerId) : null
  if (!providerId || !entry) return null
  return {
    providerId,
    merchantAllowList: [entry.merchantId],
    scopesFor: (domain, intentType) => { const s = discoveryScopeForProvider(providerId, domain, intentType); return s ? [s] : [] },
  }
}

interface Plan {
  domain: CommerceDomain
  intents: PlannedIntent[]
  /** Which carved list key the rows live under — only `results` / `search_results` are carved by toolResultSplit. */
  listKey: 'results' | 'search_results'
  subjectOf(row: Row): string | undefined
  knownUrlsOf(row: Row): string[]
  /** Rows that must not be resolved (or shown) because they contradict the request — wrong city. */
  rejects?(row: Row): string | null
  /**
   * Is a discovered page the SAME subject as the row (owner decision 14 Sep 2026, §8 product
   * identity)? A hint that fails is dropped before it reaches CCP; the marketplace then offers its
   * search page instead of a different product presented as the requested one.
   */
  sameSubject?(subject: string, hintTitle: string | undefined, known: boolean, rowTitle?: string): boolean
  /** Links kept per row (ranked); default MAX_LINKS_PER_ROW. */
  maxLinks?: number
  /** Discovery searches per tool call; default MAX_QUERIES_PER_TURN (one group per subject). */
  maxQueries?: number
  /** Rows resolved per tool call; default 3. */
  maxRows?: number
}

const noConfiguration = () => null

/**
 * Food & Drink is a domain with several capabilities (owner correction). The
 * plan for a place turn depends on what the conversation asked for:
 *   food_delivery         → order_delivery. Served by the delivery platforms'
 *                           RESTAURANT PAGES (passthrough, L3, login/app boundary
 *                           declared) when discovery finds them.
 *   table_reservation     → NO commerce request (owner decision 14 Sep 2026:
 *                           not an active capability; no provider may answer it).
 *   restaurant_discovery  → NO commerce request; the venue results and their
 *                           legacy order links are the answer.
 */
function foodIntents(ctx: CommerceAttachContext): PlannedIntent[] {
  const capability = foodCapabilityOf(userTurns(ctx))
  if (capability === 'food_delivery') {
    return [{ intentType: 'order_delivery', primary: true, subjectDiscovery: false, configurationFor: noConfiguration }]
  }
  return []
}

/**
 * Entertainment (Completion Pass, 14 Sep 2026): the words decide between three capabilities.
 *   event_ticket    → buy_event_ticket, Ticketbox listings discovered by SUBJECT + city (own rows).
 *   cinema_ticket   → buy_ticket; a CGV FILM page is discovered only when the user NAMED a film,
 *                     and only a page whose title names that film is accepted. Showtimes have no
 *                     source and are never composed — the film page's "Mua vé" picker is the boundary.
 *   activity_booking → book_activity, Klook listings by subject (unchanged).
 */
function entertainmentIntents(ctx: CommerceAttachContext, now: Date): PlannedIntent[] {
  const capability = entertainmentCapabilityOf(userTurns(ctx))
  const cinema = capability === 'cinema_ticket'
  const event = capability === 'event_ticket'
  const film = cinema ? filmTitleOf(userTurns(ctx)) : null
  return [
    { intentType: 'buy_ticket', primary: cinema, subjectDiscovery: cinema && !!film, rowDiscovery: false, ...(film ? { discoverySubject: film, subjectFilter: (title: string | undefined) => filmTitleMatches(film, title) } : {}), configurationFor: noConfiguration },
    // Events are planned only when asked for: a Ticketbox search for a venue's NAME is not a link
    // for that venue, and the discovery query would be spent on every entertainment row otherwise.
    // Events: the current year joins the query (the index favours the upcoming edition) and a
    // listing whose title names only a past year is refused.
    ...(event ? [{ intentType: 'buy_event_ticket' as const, primary: true, subjectDiscovery: true, rowDiscovery: false, discoverySubject: `${str(ctx.query) ?? ''} ${now.getFullYear()}`.trim(), subjectFilter: (title: string | undefined, snippet?: string) => !isPastListing(title, snippet, now), configurationFor: noConfiguration }] : []),
    { intentType: 'book_activity', primary: !cinema && !event, subjectDiscovery: !cinema && !event, configurationFor: noConfiguration },
  ]
}

/**
 * The commerce domain of a places turn. The places tool files an ATTRACTION search under the
 * generic 'place' domain (its eligibility boundary), and an EMPTY result carries no amenity at
 * all — yet "Tìm hoạt động ở Đà Nẵng trên Klook" is exactly what the activity catalogues sell
 * (live UAT 14 Sep 2026: the seam saw 'place' and did nothing). A named provider decides first
 * (Klook → entertainment / spa by its registry domains); an attraction envelope second.
 */
function placeDomainForSeam(r: Row, ctx: CommerceAttachContext): string | undefined {
  const stated = str(r._tappy_place_domain)
  if (stated !== 'place') return stated
  const requested = requestedProvider(ctx)
  const entry = requested ? getProvider(requested.providerId) : null
  if (entry) {
    if (entry.domains.includes('spa') && /spa|massage|làm đẹp|lam dep/iu.test(str(ctx.query) ?? '')) return 'spa'
    if (entry.domains.includes('entertainment')) return 'entertainment'
    if (entry.domains.includes('spa')) return 'spa'
  }
  return str(r.amenity_type) === 'attraction' ? 'entertainment' : stated
}

function planFor(toolName: CommerceToolName, r: Row, ctx: CommerceAttachContext, now: Date): Plan | null {
  if (toolName === 'search_products') {
    return {
      domain: 'shopping',
      intents: [{ intentType: 'buy_product', primary: true, subjectDiscovery: false, configurationFor: noConfiguration }],
      listKey: 'search_results',
      // The listing's product core ("Điện thoại Apple iPhone 16 Pro Max 256GB Titan Đen" → "iPhone 16 Pro Max 256GB"):
      // what the marketplaces index by, and what a discovered page must name.
      subjectOf: row => { const t = str(row.title); return t ? discoverySubject(t, str(row.source)) : undefined },
      knownUrlsOf: row => [str(row.link)].filter((u): u is string => !!u),
      // The row's own link IS the listing; a discovered page must name the same product — judged on
      // the product CORE (what the index was asked for) AND on the row's full title, so a toy or a
      // tool that merely names the product ("iphone 17 … gấu bông") never maps to the product page.
      sameSubject: (subject, title, known, rowTitle) => known || (productIdentityMatch(subject, title) === 'match' && (!rowTitle || productIdentityMatch(rowTitle, title) !== 'mismatch')),
      maxLinks: MAX_SHOPPING_LINKS_PER_ROW,
      // Each marketplace is its own query (see commerceDiscovery); two products per turn, four queries each.
      maxQueries: MAX_SHOPPING_QUERIES,
      maxRows: 2,
    }
  }
  if (toolName === 'get_hotel_prices') {
    const checkIn = str(ctx.checkIn), checkOut = str(ctx.checkOut)
    const dated = !!checkIn && !!checkOut && ISO_DATE.test(checkIn) && ISO_DATE.test(checkOut) && checkOut > checkIn
    const requestedCity = cityKeyOf(ctx.location)
    return {
      domain: 'travel',
      intents: [{
        intentType: 'book_hotel',
        primary: true,
        subjectDiscovery: false,
        configurationFor: subject => dated
          ? {
            // 🚨 `adults` is a DEFAULT, not a fact from the conversation — recorded on the row as
            // assumed so a label can say so; the merchant page lets the user change it.
            configuration: { kind: 'hotel', propertyRef: slug(subject), checkIn: checkIn!, checkOut: checkOut!, adults: DEFAULT_ADULTS },
            assumed: ['adults'],
          }
          : null,
      }],
      listKey: 'search_results',
      maxLinks: MAX_HOTEL_LINKS_PER_ROW,
      maxQueries: MAX_HOTEL_QUERIES,
      // P1-8: the OTA title, reduced to the hotel's name ("Book Oc Tien Sa Hotel Danang i Da Nang
      // på Agoda.com" → "Oc Tien Sa Hotel"); the entity builder applies the same cleaner for display.
      subjectOf: row => { const n = stripTrailingCity(cleanOtaTitle(str(row.name) ?? str(row.title))); return n || undefined },
      knownUrlsOf: row => [str(row.link)].filter((u): u is string => !!u),
      // P2-8: an OTA page filed under another city is not a result for this request.
      rejects: row => {
        const rowCity = otaCityKeyOf(str(row.link))
        return requestedCity && rowCity && !sameCityKey(rowCity, requestedCity) ? `city_mismatch:${rowCity}` : null
      },
    }
  }
  // An ATTRACTION search is filed under the generic 'place' domain by the places tool (its
  // eligibility boundary), yet it is exactly what the activity catalogues sell (live UAT 14 Sep
  // 2026: "Tìm hoạt động ở Đà Nẵng trên Klook" reached the seam as 'place' and got nothing).
  const stated = placeDomainForSeam(r, ctx)
  const domainIntents: Record<string, { domain: CommerceDomain; intents: PlannedIntent[] }> = {
    food: { domain: 'food_drink', intents: foodIntents(ctx) },
    entertainment: { domain: 'entertainment', intents: entertainmentIntents(ctx, now) },
    spa: { domain: 'spa', intents: [{ intentType: 'buy_spa_voucher', primary: true, subjectDiscovery: true, configurationFor: noConfiguration }] },
  }
  const di = stated ? domainIntents[stated] : undefined
  if (!di) return null
  return {
    domain: di.domain,
    intents: di.intents,
    listKey: 'results',
    subjectOf: row => str(row.name),
    knownUrlsOf: row => [str(row.website_uri)].filter((u): u is string => !!u),
  }
}

/**
 * The rows CCP resolves for: the shortlist first (when the ranker produced one), then the leading
 * rows in ranked order, up to `max`. Live UAT 14 Sep 2026 (Nha Trang): a one-entry shortlist left
 * the card's #2 and #3 without a link while the card still showed them — the card and the
 * resolution must cover the same rows.
 */
function candidateRows(rows: Row[], r: Row, max: number): Row[] {
  const sl = Array.isArray(r._tappy_shortlist) ? (r._tappy_shortlist as Array<{ name?: string }>) : []
  const wanted = new Set(sl.map(s => (s.name || '').trim().toLowerCase()).filter(Boolean))
  const named = (row: Row) => String(row.name ?? row.title ?? '').split(' - ')[0].trim().toLowerCase()
  const picked = wanted.size > 0 ? rows.filter(row => wanted.has(named(row))) : []
  const out = [...picked]
  for (const row of rows) { if (out.length >= max) break; if (!out.includes(row)) out.push(row) }
  return out.slice(0, max)
}

/** Keep CCP's ranking order, at most one link per provider, at most `max` overall (P2-1). */
function dedupeLinks(existing: CommerceLinkRow[], incoming: CommerceLinkRow[], max = MAX_LINKS_PER_ROW): CommerceLinkRow[] {
  const out = [...existing]
  const perProvider = new Map<string, number>()
  for (const l of out) perProvider.set(l.providerId, (perProvider.get(l.providerId) ?? 0) + 1)
  for (const l of incoming) {
    if (out.length >= max) break
    if ((perProvider.get(l.providerId) ?? 0) >= MAX_LINKS_PER_PROVIDER) continue
    out.push(l)
    perProvider.set(l.providerId, (perProvider.get(l.providerId) ?? 0) + 1)
  }
  return out
}

/**
 * A catalogue listing title → a card name: the vendor suffix ("… - Klook", "… | Klook Việt Nam")
 * dropped. Only a SHORT trailing segment (≤ 3 words) is a suffix — live probe 14 Sep 2026:
 * "[TP.HCM - NTPMM] Những Thành Phố Mơ Màng Summer 2025" lost everything after "[TP.HCM".
 */
const listingName = (title: string | undefined, fallback: string): string => {
  const t = (title ?? '').replace(/\s*[-|–]\s*((?:[^-|–\s]+\s*){1,3})$/, '').replace(/\s+/g, ' ').trim()
  return t || fallback
}

/**
 * An event page whose title names a PAST year is a past event (Ticketbox keeps them online —
 * live probe 14 Sep 2026 surfaced "Summer 2025"). Availability is never inferred; a year the
 * title itself states is a fact, and a past one is never offered.
 */
const namesPastYear = (title: string | undefined, now: Date): boolean => {
  const years = [...(title ?? '').matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]))
  return years.length > 0 && years.every(y => y < now.getFullYear())
}

/**
 * Dates a listing STATES (title + index snippet): "01/08/2026", "1-8-2026", "ngày 1 tháng 8 năm
 * 2026", "1 thg 8, 2026". Live UAT 14 Sep 2026: a concert dated 01/08/2026 was offered as
 * upcoming. The latest stated date decides; a listing with no stated date is not judged.
 */
const STATED_DATE_RES: RegExp[] = [
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g,
  /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+|[,\s]+)(20\d{2})/giu,
  /\b(\d{1,2})\s+thg\s+(\d{1,2})[,\s]+(20\d{2})\b/giu,
]
function latestStatedDate(text: string): Date | null {
  let latest: Date | null = null
  for (const re of STATED_DATE_RES) {
    for (const m of text.matchAll(re)) {
      const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
      if (d < 1 || d > 31 || mo < 1 || mo > 12) continue
      const at = new Date(Date.UTC(y, mo - 1, d, 12))
      if (!latest || at > latest) latest = at
    }
  }
  return latest
}
/** True when the listing names only past dates (or only a past year). */
const isPastListing = (title: string | undefined, snippet: string | undefined, now: Date): boolean => {
  const text = `${title ?? ''} ${snippet ?? ''}`
  const latest = latestStatedDate(text)
  if (latest) return latest.getTime() < Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return namesPastYear(text, now)
}

/** Is this URL filed under a city other than the one requested? (null city on either side = not contradicted) */
const contradictsCity = (url: string | undefined, requestedCity: string | null): boolean => {
  const c = otaCityKeyOf(url)
  return !!requestedCity && !!c && !sameCityKey(c, requestedCity)
}

/**
 * Resolve Commerce Links for the turn's leading rows and attach them as
 * `commerce_links`. Returns the same `result` object. Never throws.
 */
export async function attachCommerceLinks(toolName: CommerceToolName, result: unknown, ctx: CommerceAttachContext = {}): Promise<unknown> {
  const enabled = ctx.enabled ?? CCP_ENABLED
  if (!enabled || !isRecord(result)) return result
  if (toolName === 'get_flight_prices' || toolName === 'get_transport_options') return attachRouteLinks(toolName, result, ctx)
  if (toolName === 'web_search') return attachWebHandoffs(result, ctx)
  try {
    const r = result
    const now = ctx.now ?? new Date()
    const plan = planFor(toolName, r, ctx, now)
    if (!plan) return result
    if (!Array.isArray(r[plan.listKey])) return result
    // 🚨 IDEMPOTENT ON A CACHED RESULT. The tools memoise their result OBJECT for minutes and
    // rankForModel mutates it in place; a second turn reaches this seam with last turn's
    // attachment still on the rows. Resolution is re-run (a hold URL may have expired), so the
    // previous attachment is dropped first — appending would duplicate buttons turn after turn.
    // Listing rows this seam appended last turn are dropped for the same reason.
    const list = (r[plan.listKey] as unknown[]).filter(row => !(isRecord(row) && row._tappy_experience === true))
    for (const row of list) if (isRecord(row)) delete row[COMMERCE_LINKS_KEY]
    // A NAMED merchant (live UAT 14 Sep 2026): the legacy per-row search links of OTHER registry
    // merchants leave the row too — "qua ShopeeFood" must not render "Tìm trên GrabFood" beside it.
    const requestedEarly = requestedProvider(ctx)
    for (const row of list) {
      if (!isRecord(row)) continue
      delete row._tappy_requested_provider
      if (!requestedEarly) continue
      // The action layer reads this to keep the row's OWN legacy links to the named merchant.
      row._tappy_requested_provider = requestedEarly.providerId
      if (Array.isArray(row.order_links)) row.order_links = (row.order_links as Array<{ url?: string }>).filter(l => { const owner = typeof l.url === 'string' ? providerOwning(l.url) : null; return !owner || owner === requestedEarly.providerId })
    }
    // A NAMED OTA (live UAT 14 Sep 2026): the hotel tool's result-level "see more" links of the
    // other OTAs leave the result, so the prose cannot end with "[Booking.com] · [Agoda]" under a
    // Traveloka request.
    if (requestedEarly && toolName === 'get_hotel_prices') {
      if (requestedEarly.providerId !== 'booking') { delete r.booking_link; delete r.search_url }
      if (requestedEarly.providerId !== 'agoda') delete r.agoda_link
    }
    // P2-8: rows that contradict the request (an OTA page filed under another city) leave the
    // result — neither the model nor the card sees them as matches.
    const kept = plan.rejects ? list.filter(row => !(isRecord(row) && plan.rejects!(row))) : list
    r[plan.listKey] = kept
    const rows = kept.filter(isRecord)
    const targets = candidateRows(rows, r, ctx.maxRows ?? plan.maxRows ?? 3)
    const resolve = ctx.resolve ?? resolveCommerce
    const requestedCity = cityKeyOf(ctx.location)

    const subjects: DiscoverySubject[] = []
    targets.forEach((row, i) => {
      const subject = plan.subjectOf(row)
      if (subject) subjects.push({ id: String(i), subject, locality: ctx.location, knownUrls: plan.knownUrlsOf(row), title: str(row.title) ?? str(row.name) })
    })

    const context = { ...(ctx.platform ? { platform: ctx.platform } : {}), ...(ctx.locale ? { locale: ctx.locale } : {}), allowTracking: true }
    const requested = requestedProvider(ctx)
    const constraints = ctx.location || requested
      ? { constraints: { ...(ctx.location ? { city: ctx.location.slice(0, 80) } : {}), ...(requested ? { merchantAllowList: requested.merchantAllowList } : {}) } }
      : {}

    for (const { intentType, primary, subjectDiscovery, rowDiscovery, discoverySubject, subjectFilter, configurationFor } of plan.intents) {
      const capability = capabilityForIntent(intentType)
      // Discovery is one budgeted pass per intent; the search seam lets tests count it.
      let discovered: DiscoveredHint[] = []
      if (subjects.length > 0 && rowDiscovery !== false) {
        try {
          discovered = await discoverCommerceHints(plan.domain, intentType, subjects, { search: ctx.search, ...(plan.maxQueries ? { maxQueries: plan.maxQueries } : {}), ...(requested ? { scopes: requested.scopesFor(plan.domain, intentType) } : {}) })
        } catch {
          discovered = []
        }
      }
      // Hints per subject: the row's own URL first, then discovery in its rank order.
      const hintsOf = new Map<string, DiscoveryHint[]>()
      for (const s of subjects) {
        const hints: DiscoveryHint[] = [
          ...(s.knownUrls ?? []).map(url => ({ url, title: s.subject })),
          ...discovered
            .filter(d => d.subjectId === s.id)
            // §8: a discovered listing that names another product (a case, the Pro Max) is not a hint for this row.
            .filter(d => !plan.sameSubject || plan.sameSubject(s.subject, d.title, false, s.title))
            .map(d => ({ url: d.url, title: d.title ?? s.subject })),
        ].filter(h => !contradictsCity(h.url, requestedCity)) // P2-8: a Trip.com page in another city is not this hotel
        if (hints.length > 0) hintsOf.set(s.id, hints)
      }
      let attachedAny = false
      for (const s of subjects) {
        const row = targets[Number(s.id)]
        // A shopping row with no page at all still gets the marketplaces' search fallbacks (CCP emits them from the subject).
        const hints = hintsOf.get(s.id) ?? (plan.domain === 'shopping' ? [] : undefined)
        if (!hints) continue
        const cfg = configurationFor(s.subject)
        const request: CommerceRequest = { domain: plan.domain, intentType, capability, subject: s.subject.slice(0, 200), ...(cfg ? { configuration: cfg.configuration } : {}), ...constraints, context }
        const out = resolve(request, { hints, now, enabled: true })
        if (!('links' in out) || out.links.length === 0) continue
        // A ROW carries subject links. A merchant's SEARCH page for the row's name is kept only for
        // shopping (owner decision 14 Sep 2026: the marketplaces' honest fallbacks); a hotel or a
        // venue row never gets "Tìm … trên X" for a capability it was not asked for.
        const projected = out.links
          .filter(l => l.depth >= MIN_ROW_LINK_DEPTH && (plan.domain === 'shopping' || l.kind !== 'SEARCH_HANDOFF'))
          .map(l => projectCommerceLinkRow(l, out.requestId, intentType, cfg?.assumed ?? [], { primary }))
        if (projected.length === 0) continue
        const existing = Array.isArray(row[COMMERCE_LINKS_KEY]) ? (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[]) : []
        row[COMMERCE_LINKS_KEY] = dedupeLinks(existing, projected, plan.maxLinks)
        attachedAny = true
      }

      // P1-6: experience catalogues (Klook) are searched by what the USER asked for, in the city
      // asked for, and each listing becomes its OWN row — a ticket for Bà Nà Hills is never a link
      // on an unrelated bar the places tool returned. Only when no venue row took a link.
      if (subjectDiscovery && primary && !attachedAny) {
        const subject = discoverySubject ?? str(ctx.query) ?? str(r.query)
        if (!subject) continue
        let hits: DiscoveredHint[] = []
        try { hits = await discoverBySubject(plan.domain, intentType, subject, ctx.location, { search: ctx.search, perScope: MAX_EXPERIENCE_ROWS, ...(requested ? { scopes: requested.scopesFor(plan.domain, intentType) } : {}) }) } catch { hits = [] }
        const added: Row[] = []
        const reads = { left: MAX_EVENT_PAGE_READS }
        for (const h of hits) {
          if (added.length >= MAX_EXPERIENCE_ROWS) break
          // A film page that names another film is not the film the user asked for.
          if (subjectFilter && !subjectFilter(h.title, h.snippet)) continue
          const name = listingName(h.title, subject)
          const request: CommerceRequest = { domain: plan.domain, intentType, capability, subject: name.slice(0, 200), ...constraints, context }
          const out = resolve(request, { hints: [{ url: h.url, title: name }], now, enabled: true })
          // A listing row IS the subject: only a page-level link makes one (a search fallback is not a listing).
          const detail = 'links' in out ? out.links.filter(l => l.kind !== 'SEARCH_HANDOFF') : []
          if (!('links' in out) || detail.length === 0) continue
          // An EVENT page states its schedule: a past event is refused; an upcoming one carries the fact.
          const facts = intentType === 'buy_event_ticket' ? await eventScheduleOf(detail[0].directUrl, ctx, now, reads) : undefined
          if (facts === null) continue
          added.push({
            name,
            ...(ctx.location ? { address: ctx.location } : {}),
            // A listing discovered for the subject — not a venue the places tool returned.
            _tappy_experience: true,
            _tappy_source: detail[0].merchantName,
            [COMMERCE_LINKS_KEY]: dedupeLinks([], detail.map(l => ({ ...projectCommerceLinkRow(l, out.requestId, intentType, [], { primary: true }), ...(facts ? { facts } : {}) }))),
          })
        }
        // Placed right after the ranker's #1, not appended: the card shows three rows and a
        // spa turn has eight venues, so an appended package was never visible (Internal UAT
        // R2, spa). The engine's lead stays the lead; the packages follow it.
        if (added.length > 0) {
          const current = r[plan.listKey] as unknown[]
          r[plan.listKey] = [...current.slice(0, 1), ...added, ...current.slice(1)]
        }
      }
    }
    return result
  } catch {
    // A commerce failure must never cost the user the search result it decorates.
    return result
  }
}

// ── Route-level handoffs: flights and coaches (Completion Pass, 14 Sep 2026) ─
//
// A flight or coach turn has no ranked rows and no decision card (the engine
// does not choose between fares), so its handoff channel is the tool result's
// own link fields, which the prompt tells the model to copy verbatim:
// `booking_links` (flights) and `vexere_link` (coaches). Those fields are now
// a PROJECTION of CCP links — the registry decides which merchants exist, the
// adapters compose only their verified grammars, the resolver validates every
// URL and the events fire — instead of a second, hand-written provider list.
// The CommerceLink rows themselves are not left on the result (nothing carves
// them for this tool, and the model must not read them); `_tappy_commerce`
// carries the non-URL facts a native client can read (merchant, depth, login).
//
// Flights: Trip.com and Traveloka dated fare lists (L2, verified), then the
// airlines' entry pages (L1 — they publish no dated URL). Coaches: the Vexere
// route page for the two places (discovered, + date), else Vexere's front door.
export interface RouteHandoffFacts {
  merchantName: string
  providerId: string
  kind: CommerceLinkRow['kind']
  depth: CommerceLinkRow['depth']
  guestDepth: CommerceLinkRow['guestDepth']
  authRequiredAt: CommerceLinkRow['authRequiredAt']
  linkId: string
  requestId: string
  assumedParams: string[]
  limitations: string[]
  /** The schedule the merchant page states (events), when it states one — never inferred. */
  schedule?: { date: string; time?: string }
}

const ISO_DAY = (d: Date) => d.toISOString().slice(0, 10)

async function attachRouteLinks(toolName: 'get_flight_prices' | 'get_transport_options', r: Row, ctx: CommerceAttachContext): Promise<unknown> {
  try {
    const now = ctx.now ?? new Date()
    const flight = toolName === 'get_flight_prices'
    if (!flight && ctx.transportMode === 'taxi') return r
    const origin = str(ctx.origin), destination = str(ctx.destination)
    if (!origin || !destination) return r
    // Flights need IATA codes; coach routes are named by place SLUGS (the request schema refuses whitespace).
    const originRef = flight ? cityToIATA(origin) : slug(origin)
    const destinationRef = flight ? cityToIATA(destination) : slug(destination)
    if (!originRef || !destinationRef) return r
    const assumed: string[] = []
    let departDate = str(ctx.departDate)
    if (!departDate || !ISO_DATE.test(departDate)) { departDate = ISO_DAY(new Date(now.getTime() + DEFAULT_DEPART_OFFSET_MS)); assumed.push('departDate') }
    const returnDate = str(ctx.returnDate)
    const configuration: CommerceRequest['configuration'] = {
      kind: 'transport',
      originRef: originRef.slice(0, 80),
      destinationRef: destinationRef.slice(0, 80),
      departDate,
      ...(returnDate && ISO_DATE.test(returnDate) && returnDate >= departDate ? { returnDate } : {}),
      ...(ctx.passengers && ctx.passengers > 0 ? { passengers: Math.min(20, Math.floor(ctx.passengers)) } : {}),
      mode: flight ? 'flight' : 'bus',
    }
    const intentType: IntentType = flight ? 'book_flight' : 'book_transport'
    const subject = `${origin} → ${destination}`.slice(0, 200)
    // Coaches: the route page carries Vexere's own ids, so it is discovered, never composed.
    let hints: DiscoveryHint[] = []
    if (!flight) {
      try {
        const hits = await discoverBySubject('travel', intentType, `xe khách ${origin} ${destination}`, undefined, { search: ctx.search, perScope: 3 })
        hints = hits.map(h => ({ url: h.url, title: h.title ?? subject }))
      } catch { hints = [] }
    }
    const context = { ...(ctx.platform ? { platform: ctx.platform } : {}), ...(ctx.locale ? { locale: ctx.locale } : {}), allowTracking: true }
    const requested = requestedProvider(ctx)
    const request: CommerceRequest = { domain: 'travel', intentType, capability: capabilityForIntent(intentType), subject, configuration, ...(requested ? { constraints: { merchantAllowList: requested.merchantAllowList } } : {}), context }
    const out = (ctx.resolve ?? resolveCommerce)(request, { hints, now, enabled: true })
    if (!('links' in out) || out.links.length === 0) return r
    const rows = dedupeLinks([], out.links.map(l => projectCommerceLinkRow(l, out.requestId, intentType, assumed, { primary: true })), flight ? 4 : 1)
    if (rows.length === 0) return r
    const projected = rows.map(l => ({ name: l.merchantName, url: l.url }))
    if (flight) r.booking_links = projected
    else r.vexere_link = projected[0].url
    r._tappy_commerce = rows.map((l): RouteHandoffFacts => ({
      merchantName: l.merchantName, providerId: l.providerId, kind: l.kind, depth: l.depth, guestDepth: l.guestDepth, authRequiredAt: l.authRequiredAt,
      linkId: l.linkId, requestId: l.requestId, assumedParams: l.assumedParams, limitations: l.limitations,
    }))
    return r
  } catch {
    return r
  }
}

// ── Event handoffs on a web-search turn (Completion Pass live UAT, 14 Sep 2026) ──
//
// "Có concert nào ở TP.HCM…" is answered by web_search, not by the places
// tool, so the events path on the places seam never ran and the reply had no
// ticket link at all (honest, but empty). On a web turn whose words ask for an
// event, Ticketbox listings are discovered by SUBJECT + city (year included,
// past years refused), resolved and validated by CCP, and projected as
// `event_links` for the prose — the same channel as `booking_links` — with
// `_tappy_commerce` carrying the facts. Nothing is composed: no listing, no link.
const MAX_EVENT_LINKS = 3
/** Event pages read per turn for their stated schedule (bounded, read-only, registry hosts only). */
const MAX_EVENT_PAGE_READS = 4

/**
 * The stated schedule of an event page: past → `null` (refused); stated and upcoming → its facts;
 * no date stated → `undefined` (not judged, no facts). Read through the test seam when given.
 */
async function eventScheduleOf(url: string, ctx: CommerceAttachContext, now: Date, budget: { left: number }): Promise<ReturnType<typeof scheduleFacts> | null | undefined> {
  if (budget.left <= 0) return undefined
  budget.left--
  const html = await (ctx.fetchText ?? fetchEventPageText)(url)
  const stated = statedScheduleOf(html)
  if (!stated) return undefined
  if (scheduleIsPast(stated, now)) return null
  return scheduleFacts(stated, now)
}

async function attachWebHandoffs(r: Row, ctx: CommerceAttachContext): Promise<unknown> {
  try {
    const capability = entertainmentCapabilityOf(userTurns(ctx))
    const now = ctx.now ?? new Date()
    // Films (live UAT 14 Sep 2026: "Tìm phim Mưa Đỏ trên CGV" was answered by web_search, and the
    // model typed CGV URLs of its own): a NAMED film is discovered and title-matched; the page
    // is the boundary — showtimes are never composed.
    const film = capability === 'cinema_ticket' ? filmTitleOf(userTurns(ctx)) : null
    const event = capability === 'event_ticket'
    if (!event && !film) return r
    const subject = event ? str(ctx.query) : film
    if (!subject) return r
    const intentType: IntentType = event ? 'buy_event_ticket' : 'buy_ticket'
    const requested = requestedProvider(ctx)
    const scopes = requested ? requested.scopesFor('entertainment', intentType) : undefined
    let hits: DiscoveredHint[] = []
    try { hits = await discoverBySubject('entertainment', intentType, event ? `${subject} ${now.getFullYear()}` : subject, ctx.location, { search: ctx.search, perScope: MAX_EVENT_LINKS + 2, ...(scopes ? { scopes } : {}) }) } catch { hits = [] }
    const context = { ...(ctx.platform ? { platform: ctx.platform } : {}), ...(ctx.locale ? { locale: ctx.locale } : {}), allowTracking: true }
    const rows: CommerceLinkRow[] = []
    const names: string[] = []
    const reads = { left: MAX_EVENT_PAGE_READS }
    /** Event pages judged PAST (index date or merchant page): they leave the web results too, so the model cannot narrate them. */
    const refused: string[] = []
    for (const h of hits) {
      if (rows.length >= MAX_EVENT_LINKS) break
      if (event && isPastListing(h.title, h.snippet, now)) { refused.push(h.url); continue }
      if (film && !filmTitleMatches(film, h.title)) continue
      const name = listingName(h.title, subject)
      const request: CommerceRequest = { domain: 'entertainment', intentType, capability: capabilityForIntent(intentType), subject: name.slice(0, 200), ...(requested ? { constraints: { merchantAllowList: requested.merchantAllowList } } : {}), context }
      const out = (ctx.resolve ?? resolveCommerce)(request, { hints: [{ url: h.url, title: name }], now, enabled: true })
      const detail = 'links' in out ? out.links.find(l => l.kind !== 'SEARCH_HANDOFF') : undefined
      if (!('links' in out) || !detail) continue
      if (rows.some(x => x.destinationUrl === detail.directUrl)) continue
      // An EVENT page states its schedule: a past event is refused; an upcoming one carries the fact.
      const facts = event ? await eventScheduleOf(detail.directUrl, ctx, now, reads) : undefined
      if (facts === null) { refused.push(h.url); continue }
      rows.push({ ...projectCommerceLinkRow(detail, out.requestId, intentType, [], { primary: true }), ...(facts ? { facts } : {}) })
      names.push(name)
    }
    // A past event the seam refused must not reach the model through the raw web results either
    // (live UAT 14 Sep 2026: "Summer 2025" and a January show were narrated from the snippets).
    if (refused.length > 0 && Array.isArray(r.results)) {
      const gone = new Set(refused.map(u => u.replace(/\/+$/, '')))
      r.results = (r.results as Array<{ link?: string }>).filter(x => !(typeof x?.link === 'string' && gone.has(x.link.replace(/\/+$/, ''))))
    }
    if (rows.length === 0) {
      if (event && refused.length > 0) r.event_links_note = 'Các sự kiện tìm thấy trên nền tảng vé đã diễn ra (ngày trên trang sự kiện); không có sự kiện sắp tới phù hợp — nói rõ điều này, không nêu sự kiện đã qua.'
      return r
    }
    r[event ? 'event_links' : 'film_links'] = rows.map((l, i) => ({ name: names[i], platform: l.merchantName, url: l.url }))
    r._tappy_commerce = rows.map((l): RouteHandoffFacts => ({
      merchantName: l.merchantName, providerId: l.providerId, kind: l.kind, depth: l.depth, guestDepth: l.guestDepth, authRequiredAt: l.authRequiredAt,
      linkId: l.linkId, requestId: l.requestId, assumedParams: l.assumedParams, limitations: l.limitations,
      ...(l.facts?.schedule ? { schedule: l.facts.schedule } : {}),
    }))
    return r
  } catch {
    return r
  }
}

// The route imports this module once per process; installing the writer performs no I/O.
installCommerceObservability()
