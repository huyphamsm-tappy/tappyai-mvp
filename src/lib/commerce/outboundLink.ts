// ── OUTBOUND COMMERCE LINKS — depth, tier, tracking, and the telemetry (A3.3 / A3.4, 2026-09-20)
//
// THE UX RULE, ABSOLUTE: a commerce link goes to the DEEPEST merchant page available — the
// product, the specific hotel, the specific cinema / film, the specific route. Never a homepage,
// never a search results page, never a Google Shopping / Google Flights intermediary. This module
// is where that rule is (1) decided, from the URL alone and from a Commerce Link's own depth when
// it has one, and (2) reported: every outbound commerce link is logged with provider, tier,
// tracked-or-not and destination depth, an ERROR is logged the moment a homepage- or search-depth
// link is about to be emitted, and a per-provider daily counter of UNTRACKED click-outs is kept
// so the deeplinks worth chasing are ranked by real traffic.
//
// Not a fetch anywhere: depth is read off the URL shape, never off the page.

import { PROVIDER_REGISTRY, providerOwning, providerTier, getProvider } from '@/lib/ccp'
import { incrDailyCounter } from '@/lib/security/kvCounter'

export type LinkDepthClass = 'product' | 'category' | 'search' | 'homepage' | 'intermediary'

const SEARCH_PATH = /(^|\/)(search|searchresults(\.[a-z-]+)?\.html|tim-kiem|s|results|restaurants)(\/|$)/i
const SEARCH_QUERY = /(^|[?&])(q|ss|query|search|keyword|searchKeyword|textToSearch|k)=/i
const INTERMEDIARY_HOST = /(^|\.)google\.[a-z.]+$|(^|\.)bing\.com$/i
const CATEGORY_PATH = /(^|\/)(danh-muc|category|categories|collections?|c|brand|thuong-hieu|shop)(\/|$)/i

/** Where a URL lands, judged from its shape. Exported for the tests and the telemetry. */
export function linkDepthClass(url: string, commerceDepth?: number, commerceKind?: string, route = false): LinkDepthClass {
  let u: URL
  try { u = new URL(url) } catch { return 'homepage' }
  if (INTERMEDIARY_HOST.test(u.hostname)) return 'intermediary'
  // A Commerce Link states its own depth: L1–L2 is a search / landing, L3+ is the subject's page.
  // A ROUTE has no deeper page than its dated fare list (L2): that list IS the route's page.
  if (typeof commerceDepth === 'number') {
    if (route) return commerceDepth >= 2 ? 'product' : 'homepage'
    if (commerceKind === 'SEARCH_HANDOFF' || commerceDepth <= 2) return 'search'
    return 'product'
  }
  const path = u.pathname.replace(/\/+$/, '')
  if (SEARCH_PATH.test(path) || SEARCH_QUERY.test(u.search)) return 'search'
  const segments = path.split('/').filter(Boolean)
  // "/", "/vi-vn", "/vn/vi" — a locale root is still the front door.
  if (segments.length === 0 || segments.every(s => /^[a-z]{2}(-[a-z]{2})?$/i.test(s))) return 'homepage'
  // A listing shape (`/danh-muc/…`, `/category/…`, `/collections/…`) is a category, not a subject.
  if (CATEGORY_PATH.test(path)) return 'category'
  return 'product'
}

/** The merchant behind a URL, when it is a registry provider. */
export function providerOfUrl(url: string): string | null {
  try { return providerOwning(url) } catch { return null }
}

const WRAPPER_HOST = /(^|\.)(go\.isclix\.com|isclix\.com)$/i

export interface OutboundLinkFacts {
  providerId: string | null
  tier: 1 | 2 | null
  tracked: boolean
  depth: LinkDepthClass
  /** The card action kind (purchase / booking / order / ticket) or the commerce link kind. */
  kind: string
}

export function outboundLinkFacts(url: string, kind: string, opts: { commerceDepth?: number; commerceKind?: string; tracked?: boolean; providerId?: string | null; route?: boolean } = {}): OutboundLinkFacts {
  let host = ''
  try { host = new URL(url).hostname } catch { /* judged below */ }
  const tracked = opts.tracked ?? WRAPPER_HOST.test(host)
  // A wrapped link's provider is the destination's; the wrapper hides it, so the caller passes it.
  const providerId = opts.providerId ?? providerOfUrl(url)
  const entry = providerId ? getProvider(providerId) : null
  return { providerId, tier: entry ? providerTier(entry) : null, tracked, depth: linkDepthClass(url, opts.commerceDepth, opts.commerceKind, opts.route), kind }
}

/** True when the link may be emitted as a commerce CTA at all: only the subject's own page. */
export function isDeepEnough(facts: OutboundLinkFacts): boolean {
  return facts.depth === 'product'
}

/**
 * Report one outbound commerce link. Never throws, never awaits anything the caller sees. The
 * untracked counter is per provider per VN day (kvCounter: shared when KV is configured).
 */
export function reportOutboundLink(url: string, facts: OutboundLinkFacts, context: { domain: string; surface?: string } = { domain: 'unknown' }): void {
  const line = { type: 'tappyai_commerce_link', provider: facts.providerId ?? 'unknown', tier: facts.tier, tracked: facts.tracked, depth: facts.depth, kind: facts.kind, domain: context.domain, host: (() => { try { return new URL(url).hostname } catch { return null } })() }
  if (facts.depth === 'homepage' || facts.depth === 'search' || facts.depth === 'intermediary') {
    console.error(JSON.stringify({ ...line, error: 'shallow_commerce_link', rule: 'deepest page only — never homepage / search / intermediary' }))
  } else {
    console.log(JSON.stringify(line))
  }
  if (!facts.tracked && facts.providerId) {
    void incrDailyCounter(`commerce:untracked:${facts.providerId}`, 1).then(r => {
      // One line per emission carries the running count, so a log query ranks providers without a store read.
      console.log(JSON.stringify({ type: 'tappyai_commerce_untracked', provider: facts.providerId, tier: facts.tier, today: r.count, scope: r.scope }))
    }).catch(() => {})
  }
}

/** The providers the owner should chase, by name — the registry order, for a report. */
export function providerNames(): string[] { return PROVIDER_REGISTRY.map(p => p.providerId) }
