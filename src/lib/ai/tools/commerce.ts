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
import { discoverCommerceHints, type DiscoveredHint, type DiscoverySubject, type SearchFn } from './commerceDiscovery'
import { entertainmentCapabilityOf, foodCapabilityOf, parseReservationSpec } from './commerceIntent'

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
// 🔑 IDENTITY-PRESERVING. Rows are mutated in place, the way rankForModel does
// it, because the route keys shortlists and pick payloads on row identity.
//
// 🚨 OFF BY DEFAULT. `CCP_ENABLED` is false; with it off this function returns
// its input untouched and performs no search. Every test passes `enabled`.

export type CommerceToolName = 'search_places' | 'search_products' | 'get_hotel_prices'

export interface CommerceAttachContext {
  /** The user's stated area / city for this turn — narrows discovery and is the request's city constraint. */
  location?: string
  /** get_hotel_prices arguments, when the user gave dates (YYYY-MM-DD). */
  checkIn?: string
  checkOut?: string
  platform?: 'web' | 'android' | 'ios'
  locale?: 'vi' | 'en'
  /**
   * The user's latest message. Owner correction 13 Sep 2026: the WORDS decide the
   * capability ("giao tận nhà" → food_delivery, "đặt bàn cho 2 lúc 19h" →
   * table_reservation, "vé xem phim" → cinema_ticket). Without it a food turn is
   * treated as restaurant_discovery and any reservation link is secondary.
   */
  userText?: string
  /** Rows considered per tool call — the shortlist size. */
  maxRows?: number
  // ── seams (tests) ──
  enabled?: boolean
  search?: SearchFn
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
  configurationFor(subject: string): { configuration: CommerceRequest['configuration']; assumed: string[] } | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_LINKS_PER_ROW = 2
const DEFAULT_ADULTS = 2

type Row = Record<string, unknown>
const isRecord = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'subject'

interface Plan {
  domain: CommerceDomain
  intents: PlannedIntent[]
  /** Which carved list key the rows live under — only `results` / `search_results` are carved by toolResultSplit. */
  listKey: 'results' | 'search_results'
  subjectOf(row: Row): string | undefined
  knownUrlsOf(row: Row): string[]
}

const noConfiguration = () => null

/**
 * Food & Drink is a domain with several capabilities (owner correction). The
 * plan for a place turn depends on what the sentence asked for:
 *   food_delivery         → order_delivery. No CCP adapter serves it (GrabFood /
 *                           ShopeeFood are handoff-only facts; the legacy order
 *                           links already on the row are the handoff). PasGo is
 *                           NOT requested — a reservation flow must never answer
 *                           a delivery request.
 *   table_reservation     → reserve_table as PRIMARY, with the party/date/time
 *                           the sentence states (PasGo L5 hold grammar).
 *   restaurant_discovery  → reserve_table as SECONDARY (offered, not leading).
 */
function foodIntents(ctx: CommerceAttachContext, now: Date): PlannedIntent[] {
  const capability = foodCapabilityOf(ctx.userText)
  if (capability === 'food_delivery') return [{ intentType: 'order_delivery', primary: true, configurationFor: noConfiguration }]
  const spec = capability === 'table_reservation' ? parseReservationSpec(ctx.userText, now) : null
  return [{
    intentType: 'reserve_table',
    primary: capability === 'table_reservation',
    configurationFor: subject => spec
      ? { configuration: { kind: 'reservation', restaurantRef: slug(subject), date: spec.date, time: spec.time, adults: spec.adults }, assumed: spec.assumed }
      : null,
  }]
}

function entertainmentIntents(ctx: CommerceAttachContext): PlannedIntent[] {
  const cinema = entertainmentCapabilityOf(ctx.userText) === 'cinema_ticket'
  return [
    { intentType: 'buy_ticket', primary: cinema, configurationFor: noConfiguration },
    { intentType: 'book_activity', primary: !cinema, configurationFor: noConfiguration },
  ]
}

function planFor(toolName: CommerceToolName, r: Row, ctx: CommerceAttachContext, now: Date): Plan | null {
  if (toolName === 'search_products') {
    return {
      domain: 'shopping',
      intents: [{ intentType: 'buy_product', primary: true, configurationFor: noConfiguration }],
      listKey: 'search_results',
      subjectOf: row => str(row.title),
      knownUrlsOf: row => [str(row.link)].filter((u): u is string => !!u),
    }
  }
  if (toolName === 'get_hotel_prices') {
    const checkIn = str(ctx.checkIn), checkOut = str(ctx.checkOut)
    const dated = !!checkIn && !!checkOut && ISO_DATE.test(checkIn) && ISO_DATE.test(checkOut) && checkOut > checkIn
    return {
      domain: 'travel',
      intents: [{
        intentType: 'book_hotel',
        primary: true,
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
      // "Hotel Name - City - Booking.com" → "Hotel Name" (same rule the entity builder applies).
      subjectOf: row => str(String(row.name ?? row.title ?? '').split(' - ')[0]),
      knownUrlsOf: row => [str(row.link)].filter((u): u is string => !!u),
    }
  }
  const stated = str(r._tappy_place_domain)
  const domainIntents: Record<string, { domain: CommerceDomain; intents: PlannedIntent[] }> = {
    food: { domain: 'food_drink', intents: foodIntents(ctx, now) },
    entertainment: { domain: 'entertainment', intents: entertainmentIntents(ctx) },
    spa: { domain: 'spa', intents: [{ intentType: 'buy_spa_voucher', primary: true, configurationFor: noConfiguration }] },
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
    const list = r[plan.listKey]
    if (!Array.isArray(list)) return result
    const rows = list.filter(isRecord)
    // 🚨 IDEMPOTENT ON A CACHED RESULT. The tools memoise their result OBJECT for minutes and
    // rankForModel mutates it in place; a second turn reaches this seam with last turn's
    // attachment still on the rows. Resolution is re-run (a hold URL may have expired), so the
    // previous attachment is dropped first — appending would duplicate buttons turn after turn.
    for (const row of rows) delete row[COMMERCE_LINKS_KEY]
    const targets = candidateRows(rows, r, ctx.maxRows ?? 3)
    if (targets.length === 0) return result
    const resolve = ctx.resolve ?? resolveCommerce

    const subjects: DiscoverySubject[] = []
    targets.forEach((row, i) => {
      const subject = plan.subjectOf(row)
      if (subject) subjects.push({ id: String(i), subject, locality: ctx.location, knownUrls: plan.knownUrlsOf(row) })
    })

    for (const { intentType, primary, configurationFor } of plan.intents) {
      const capability = capabilityForIntent(intentType)
      // Discovery is one budgeted pass per intent; the search seam lets tests count it.
      let discovered: DiscoveredHint[] = []
      try {
        discovered = await discoverCommerceHints(plan.domain, intentType, subjects, { search: ctx.search })
      } catch {
        discovered = []
      }
      for (const s of subjects) {
        const row = targets[Number(s.id)]
        const hints: DiscoveryHint[] = [
          ...(s.knownUrls ?? []).map(url => ({ url, title: s.subject })),
          ...discovered.filter(d => d.subjectId === s.id).map(d => ({ url: d.url, title: d.title ?? s.subject })),
        ]
        if (hints.length === 0) continue
        const cfg = configurationFor(s.subject)
        const request: CommerceRequest = {
          domain: plan.domain,
          intentType,
          capability,
          subject: s.subject.slice(0, 200),
          ...(cfg ? { configuration: cfg.configuration } : {}),
          ...(ctx.location ? { constraints: { city: ctx.location.slice(0, 80) } } : {}),
          context: { ...(ctx.platform ? { platform: ctx.platform } : {}), ...(ctx.locale ? { locale: ctx.locale } : {}), allowTracking: true },
        }
        const out = resolve(request, { hints, now, enabled: true })
        if (!('links' in out) || out.links.length === 0) continue
        const projected = out.links.slice(0, MAX_LINKS_PER_ROW).map(l => projectCommerceLinkRow(l, out.requestId, intentType, cfg?.assumed ?? [], { primary }))
        const existing = Array.isArray(row[COMMERCE_LINKS_KEY]) ? (row[COMMERCE_LINKS_KEY] as CommerceLinkRow[]) : []
        row[COMMERCE_LINKS_KEY] = [...existing, ...projected]
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
