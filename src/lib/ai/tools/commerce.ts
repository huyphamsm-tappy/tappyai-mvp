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
  type DiscoveryHint,
  type IntentType,
} from '@/lib/ccp'
import { cleanOtaTitle, cityKeyOf, otaCityKeyOf, stripTrailingCity } from '@/lib/links/otaTitle'
import { discoverySubject, productIdentityMatch } from '@/lib/links/productIdentity'
import { discoverBySubject, discoverCommerceHints, verifyMerchantPage, MAX_VERIFY_PER_TURN, type DiscoveredHint, type DiscoverySubject, type FetchTextFn, type SearchFn } from './commerceDiscovery'
import { entertainmentCapabilityOf, foodCapabilityOf, parseReservationSpec, type UserTurns } from './commerceIntent'

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
//   · the capability and the reservation party/time/date are read from the last
//     few USER turns, not the last message (P1-2), and a date is never assumed (P1-3);
//   · PasGo pages are verified read-only before any reservation link is emitted;
//     a venue that left the programme gets no link (P0-1);
//   · food_delivery discovers the platforms' restaurant pages (passthrough, L3)
//     instead of a search URL that drops the query (P1-4) — and never PasGo;
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

export type CommerceToolName = 'search_places' | 'search_products' | 'get_hotel_prices'

export interface CommerceAttachContext {
  /** The user's stated area / city for this turn — narrows discovery and is the request's city constraint. */
  location?: string
  /** The tool's own query argument (what was searched for) — the subject for experience discovery. */
  query?: string
  /** get_hotel_prices arguments, when the user gave dates (YYYY-MM-DD). */
  checkIn?: string
  checkOut?: string
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
  /** Verify the merchant page (read-only) before resolving — providers whose registry entry declares signals. */
  verifyPages: boolean
  /** Discover listings by the user's SUBJECT + city (experience catalogues) and attach them as their own rows. */
  subjectDiscovery: boolean
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

type Row = Record<string, unknown>
const isRecord = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'subject'
const userTurns = (ctx: CommerceAttachContext): UserTurns => ctx.userTexts ?? ctx.userText

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
  sameSubject?(subject: string, hintTitle: string | undefined, known: boolean): boolean
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
 *                           declared) when discovery finds them. PasGo is NOT
 *                           requested — a reservation flow must never answer a
 *                           delivery request.
 *   table_reservation     → reserve_table as PRIMARY, with the party/time/date
 *                           the conversation states (PasGo L5 hold grammar), on
 *                           venues whose PasGo page was verified bookable.
 *   restaurant_discovery  → reserve_table as SECONDARY (offered, not leading),
 *                           verified the same way.
 */
function foodIntents(ctx: CommerceAttachContext, now: Date): PlannedIntent[] {
  const capability = foodCapabilityOf(userTurns(ctx))
  if (capability === 'food_delivery') {
    return [{ intentType: 'order_delivery', primary: true, verifyPages: false, subjectDiscovery: false, configurationFor: noConfiguration }]
  }
  const spec = capability === 'table_reservation' ? parseReservationSpec(userTurns(ctx), now) : null
  return [{
    intentType: 'reserve_table',
    primary: capability === 'table_reservation',
    verifyPages: true,
    subjectDiscovery: false,
    // A hold needs party, time AND a stated date (P1-3: a date is never assumed).
    configurationFor: subject => spec && spec.date
      ? { configuration: { kind: 'reservation', restaurantRef: slug(subject), date: spec.date, time: spec.time, adults: spec.adults }, assumed: spec.assumed.filter(a => a !== 'date') }
      : null,
  }]
}

function entertainmentIntents(ctx: CommerceAttachContext): PlannedIntent[] {
  const cinema = entertainmentCapabilityOf(userTurns(ctx)) === 'cinema_ticket'
  return [
    { intentType: 'buy_ticket', primary: cinema, verifyPages: false, subjectDiscovery: false, configurationFor: noConfiguration },
    { intentType: 'book_activity', primary: !cinema, verifyPages: false, subjectDiscovery: !cinema, configurationFor: noConfiguration },
  ]
}

function planFor(toolName: CommerceToolName, r: Row, ctx: CommerceAttachContext, now: Date): Plan | null {
  if (toolName === 'search_products') {
    return {
      domain: 'shopping',
      intents: [{ intentType: 'buy_product', primary: true, verifyPages: false, subjectDiscovery: false, configurationFor: noConfiguration }],
      listKey: 'search_results',
      // The listing's product core ("Điện thoại Apple iPhone 16 Pro Max 256GB Titan Đen" → "iPhone 16 Pro Max 256GB"):
      // what the marketplaces index by, and what a discovered page must name.
      subjectOf: row => { const t = str(row.title); return t ? discoverySubject(t, str(row.source)) : undefined },
      knownUrlsOf: row => [str(row.link)].filter((u): u is string => !!u),
      // The row's own link IS the listing; a discovered page must name the same product.
      sameSubject: (subject, title, known) => known || productIdentityMatch(subject, title) === 'match',
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
        verifyPages: false,
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
      // P1-8: the OTA title, reduced to the hotel's name ("Book Oc Tien Sa Hotel Danang i Da Nang
      // på Agoda.com" → "Oc Tien Sa Hotel"); the entity builder applies the same cleaner for display.
      subjectOf: row => { const n = stripTrailingCity(cleanOtaTitle(str(row.name) ?? str(row.title))); return n || undefined },
      knownUrlsOf: row => [str(row.link)].filter((u): u is string => !!u),
      // P2-8: an OTA page filed under another city is not a result for this request.
      rejects: row => {
        const rowCity = otaCityKeyOf(str(row.link))
        return requestedCity && rowCity && rowCity !== requestedCity ? `city_mismatch:${rowCity}` : null
      },
    }
  }
  const stated = str(r._tappy_place_domain)
  const domainIntents: Record<string, { domain: CommerceDomain; intents: PlannedIntent[] }> = {
    food: { domain: 'food_drink', intents: foodIntents(ctx, now) },
    entertainment: { domain: 'entertainment', intents: entertainmentIntents(ctx) },
    spa: { domain: 'spa', intents: [{ intentType: 'buy_spa_voucher', primary: true, verifyPages: false, subjectDiscovery: true, configurationFor: noConfiguration }] },
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

/** The rows CCP resolves for: the shortlist when the ranker produced one, else the first `max` (already ranked). */
function candidateRows(rows: Row[], r: Row, max: number): Row[] {
  const sl = Array.isArray(r._tappy_shortlist) ? (r._tappy_shortlist as Array<{ name?: string }>) : []
  const wanted = new Set(sl.map(s => (s.name || '').trim().toLowerCase()).filter(Boolean))
  const named = (row: Row) => String(row.name ?? row.title ?? '').split(' - ')[0].trim().toLowerCase()
  const picked = wanted.size > 0 ? rows.filter(row => wanted.has(named(row))) : []
  return (picked.length > 0 ? picked : rows).slice(0, max)
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

/** A catalogue listing title → a card name: the vendor suffix ("… - Klook", "… | Klook Việt Nam") dropped. */
const listingName = (title: string | undefined, fallback: string): string => {
  const t = (title ?? '').replace(/\s*[-|–]\s*[^-|–]*$/, '').replace(/\s+/g, ' ').trim()
  return t || fallback
}

/** Is this URL filed under a city other than the one requested? (null city on either side = not contradicted) */
const contradictsCity = (url: string | undefined, requestedCity: string | null): boolean => {
  const c = otaCityKeyOf(url)
  return !!requestedCity && !!c && c !== requestedCity
}

/**
 * Resolve Commerce Links for the turn's leading rows and attach them as
 * `commerce_links`. Returns the same `result` object. Never throws.
 */
export async function attachCommerceLinks(toolName: CommerceToolName, result: unknown, ctx: CommerceAttachContext = {}): Promise<unknown> {
  const enabled = ctx.enabled ?? CCP_ENABLED
  if (!enabled || !isRecord(result)) return result
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
    // P2-8: rows that contradict the request (an OTA page filed under another city) leave the
    // result — neither the model nor the card sees them as matches.
    const kept = plan.rejects ? list.filter(row => !(isRecord(row) && plan.rejects!(row))) : list
    r[plan.listKey] = kept
    const rows = kept.filter(isRecord)
    const targets = candidateRows(rows, r, ctx.maxRows ?? plan.maxRows ?? 3)
    const resolve = ctx.resolve ?? resolveCommerce
    const requestedCity = cityKeyOf(ctx.location)
    let verifyBudget = MAX_VERIFY_PER_TURN

    const subjects: DiscoverySubject[] = []
    targets.forEach((row, i) => {
      const subject = plan.subjectOf(row)
      if (subject) subjects.push({ id: String(i), subject, locality: ctx.location, knownUrls: plan.knownUrlsOf(row) })
    })

    const context = { ...(ctx.platform ? { platform: ctx.platform } : {}), ...(ctx.locale ? { locale: ctx.locale } : {}), allowTracking: true }
    const constraints = ctx.location ? { constraints: { city: ctx.location.slice(0, 80) } } : {}

    for (const { intentType, primary, verifyPages, subjectDiscovery, configurationFor } of plan.intents) {
      const capability = capabilityForIntent(intentType)
      // Discovery is one budgeted pass per intent; the search seam lets tests count it.
      let discovered: DiscoveredHint[] = []
      if (subjects.length > 0) {
        try {
          discovered = await discoverCommerceHints(plan.domain, intentType, subjects, { search: ctx.search, ...(plan.maxQueries ? { maxQueries: plan.maxQueries } : {}) })
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
            .filter(d => !plan.sameSubject || plan.sameSubject(s.subject, d.title, false))
            .map(d => ({ url: d.url, title: d.title ?? s.subject })),
        ].filter(h => !contradictsCity(h.url, requestedCity)) // P2-8: a Trip.com page in another city is not this hotel
        if (hints.length > 0) hintsOf.set(s.id, hints)
      }
      // P0-1: read the merchant page before offering a booking. The read budget is spent
      // ROUND-ROBIN — every venue's best hint before any venue's second — so one venue with
      // two pages cannot leave the next venue unread (measured in the Phase 8 live probe). A
      // verified hint carries the verdict; once a venue has one, its unread spare hints are
      // dropped rather than offered as "unverified"; a venue with NO read at all keeps its
      // hints unknown, and the adapter then emits the detail page only, never the hold grammar.
      if (verifyPages) {
        for (let pass = 0; verifyBudget > 0; pass++) {
          let any = false
          for (const hints of hintsOf.values()) {
            const h = hints[pass]
            if (!h?.url) continue
            any = true
            if (verifyBudget <= 0) break
            verifyBudget--
            h.verified = await verifyMerchantPage(h.url, { fetchText: ctx.fetchText, now })
          }
          if (!any) break
        }
        for (const [id, hints] of hintsOf) {
          if (hints.some(h => h.verified)) hintsOf.set(id, hints.filter(h => h.verified))
        }
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
        const projected = out.links.map(l => projectCommerceLinkRow(l, out.requestId, intentType, cfg?.assumed ?? [], { primary }))
        const existing = Array.isArray(row[COMMERCE_LINKS_KEY]) ? (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[]) : []
        row[COMMERCE_LINKS_KEY] = dedupeLinks(existing, projected, plan.maxLinks)
        attachedAny = true
      }

      // P1-6: experience catalogues (Klook) are searched by what the USER asked for, in the city
      // asked for, and each listing becomes its OWN row — a ticket for Bà Nà Hills is never a link
      // on an unrelated bar the places tool returned. Only when no venue row took a link.
      if (subjectDiscovery && primary && !attachedAny) {
        const subject = str(ctx.query) ?? str(r.query)
        if (!subject) continue
        let hits: DiscoveredHint[] = []
        try { hits = await discoverBySubject(plan.domain, intentType, subject, ctx.location, { search: ctx.search, perScope: MAX_EXPERIENCE_ROWS }) } catch { hits = [] }
        const added: Row[] = []
        for (const h of hits) {
          if (added.length >= MAX_EXPERIENCE_ROWS) break
          const name = listingName(h.title, subject)
          const request: CommerceRequest = { domain: plan.domain, intentType, capability, subject: name.slice(0, 200), ...constraints, context }
          const out = resolve(request, { hints: [{ url: h.url, title: name }], now, enabled: true })
          if (!('links' in out) || out.links.length === 0) continue
          added.push({
            name,
            ...(ctx.location ? { address: ctx.location } : {}),
            // A listing discovered for the subject — not a venue the places tool returned.
            _tappy_experience: true,
            _tappy_source: out.links[0].merchantName,
            [COMMERCE_LINKS_KEY]: dedupeLinks([], out.links.map(l => projectCommerceLinkRow(l, out.requestId, intentType, [], { primary: true }))),
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

// The route imports this module once per process; installing the writer performs no I/O.
installCommerceObservability()
