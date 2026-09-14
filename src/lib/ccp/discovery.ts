import { CCP_ADAPTERS } from '@/lib/config/product'
import type { CommerceDomain, IntentType } from './domain/types'
import { PROVIDER_REGISTRY } from './registry'
import type { ProviderRegistryEntry } from './registry/types'

// ── Discovery scopes — how the TOOL layer may look for a merchant's pages ────
// CCP never fetches (boundary test: no network I/O in MVP). Discovery — a web
// search for "<hotel name> site:vn.trip.com/hotels" — is the tool layer's job,
// because it already owns Serper, its cache and its call budget. What the tool
// layer must NOT own is the merchant host: that stays registry data here, so
// the query is composed from a scope this module hands out, never spelled.

export type DiscoverySubjectKind = NonNullable<ProviderRegistryEntry['discovery']>['subjectKind']

export interface DiscoveryScope {
  providerId: string
  merchantName: string
  /** `site:` operand for a web search, e.g. "vn.trip.com/hotels". */
  site: string
  subjectKind: DiscoverySubjectKind
  /** Shopping segment (marketplace / retail), when the registry declares one. */
  segment?: ProviderRegistryEntry['segment']
}

/**
 * What kind of page an intent's discovery looks for. A provider serving two intents (Trip.com:
 * hotels AND flights; Traveloka) declares ONE scope, and that scope must fit the intent — a
 * flight request never spends a search on hotel pages. Flights have no discovery: their pages
 * are composed from the verified grammars.
 */
const INTENT_SUBJECT_KIND: Partial<Record<IntentType, DiscoverySubjectKind>> = {
  buy_product: 'product',
  book_hotel: 'hotel',
  book_transport: 'route',
  order_delivery: 'restaurant',
  buy_ticket: 'film',
  book_activity: 'activity',
  buy_spa_voucher: 'activity',
  buy_event_ticket: 'event',
}

/** Scopes for the adapters that are ON and can serve this domain + intent. */
export function discoveryScopesFor(domain: CommerceDomain, intentType: IntentType, flags: Record<string, boolean> = CCP_ADAPTERS): DiscoveryScope[] {
  const out: DiscoveryScope[] = []
  const kind = INTENT_SUBJECT_KIND[intentType]
  if (!kind) return out
  for (const e of PROVIDER_REGISTRY) {
    if (!e.discovery || e.discovery.subjectKind !== kind || (e.tier !== 'mvp' && e.handoffPassthrough !== true)) continue
    if (flags[e.enabledFlag] !== true) continue
    if (!e.domains.includes(domain) || !e.intents.includes(intentType)) continue
    out.push({ providerId: e.providerId, merchantName: e.merchantName, site: e.discovery.site, subjectKind: e.discovery.subjectKind, ...(e.segment ? { segment: e.segment } : {}) })
  }
  return out
}

/**
 * The scope for ONE provider the user named (Final local live UAT, 14 Sep 2026). A provider that
 * declares no discovery (the OTAs — their pages come from the hotel tool's own rows) still gets
 * a scope when it is the request: `site:<its first allow-listed host>`, which is registry data.
 * Null when the provider does not serve the domain + intent, or the adapter flag is off.
 */
export function discoveryScopeForProvider(providerId: string, domain: CommerceDomain, intentType: IntentType, flags: Record<string, boolean> = CCP_ADAPTERS): DiscoveryScope | null {
  const kind = INTENT_SUBJECT_KIND[intentType]
  const e = PROVIDER_REGISTRY.find(p => p.providerId === providerId)
  if (!kind || !e || flags[e.enabledFlag] !== true) return null
  if (e.tier !== 'mvp' && e.handoffPassthrough !== true) return null
  if (!e.domains.includes(domain) || !e.intents.includes(intentType)) return null
  const site = e.discovery?.subjectKind === kind ? e.discovery.site : e.allowedHosts[0]
  return { providerId: e.providerId, merchantName: e.merchantName, site, subjectKind: kind, ...(e.segment ? { segment: e.segment } : {}) }
}

/**
 * Which registered provider owns this URL, by EXACT host match against the
 * registry allow-lists (the same rule `isAllowedHost` applies to emitted links).
 * `null` for anything else — including look-alike subdomains.
 */
export function providerOwning(url: string): string | null {
  let host: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    host = u.hostname.toLowerCase()
  } catch {
    return null
  }
  for (const e of PROVIDER_REGISTRY) if (e.allowedHosts.includes(host)) return e.providerId
  return null
}
