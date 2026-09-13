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
}

/** Scopes for the adapters that are ON and can serve this domain + intent. */
export function discoveryScopesFor(domain: CommerceDomain, intentType: IntentType, flags: Record<string, boolean> = CCP_ADAPTERS): DiscoveryScope[] {
  const out: DiscoveryScope[] = []
  for (const e of PROVIDER_REGISTRY) {
    if (!e.discovery || (e.tier !== 'mvp' && e.handoffPassthrough !== true)) continue
    if (flags[e.enabledFlag] !== true) continue
    if (!e.domains.includes(domain) || !e.intents.includes(intentType)) continue
    out.push({ providerId: e.providerId, merchantName: e.merchantName, site: e.discovery.site, subjectKind: e.discovery.subjectKind })
  }
  return out
}

/** The merchant-page bookability signals a provider declares, if any. */
export function bookabilitySignalsFor(providerId: string): ProviderRegistryEntry['bookability'] | null {
  return PROVIDER_REGISTRY.find(e => e.providerId === providerId)?.bookability ?? null
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
