import { discoveryScopesFor, providerOwning, type DiscoveryScope } from '@/lib/ccp'
import type { CommerceDomain, IntentType } from '@/lib/ccp'
import { serperSearch } from './common'

// ── Commerce discovery — finding a merchant's page for a subject ─────────────
//
// CCP resolves a Commerce Link FROM a hint the caller already holds (a merchant
// URL, an id). The canonical tools mostly do not hold one: `get_hotel_prices`
// returns Booking/Agoda pages, `search_places` returns Google/OSM venues. This
// module fills that gap the only way the tool layer is allowed to — a scoped web
// search ("<hotel name> site:vn.trip.com/hotels") whose `site:` operand is
// REGISTRY DATA handed out by CCP (`discoveryScopesFor`). No merchant host is
// spelled here; a link is accepted only when `providerOwning` says the registry
// allow-list owns it.
//
// Phase 8 (owner-like UAT R1) added two things the round showed were missing:
//
//   · SUBJECT discovery (P1-6). Klook lists EXPERIENCES ("Ha Spa & Massage in
//     Ho Chi Minh"), not the venues Google Places returns ("Tiệm Massage Hán
//     Cung"), so a venue-name query finds nothing while "spa massage Hồ Chí Minh
//     site:klook.com/vi/activity" finds five. `discoverBySubject` phrases the
//     query from what the USER asked for plus the city.
//
// 🚨 BUDGET. Serper is billed per request. Discovery runs at most
// MAX_QUERIES_PER_TURN searches per tool call, only for subjects that do not
// already carry an owned URL, and only while CCP is enabled (the caller gates).
// `serperSearch` memoises non-empty results for its own TTL; nothing here adds
// a longer-lived cache (owner rule: no permanent caching).

export const MAX_QUERIES_PER_TURN = 3
// Four hints per provider (14 Sep 2026): TikTok Shop keyword pages precede the product page in the index.
const MAX_LINKS_PER_SCOPE = 4

export type SearchFn = (query: string) => Promise<Array<{ title: string; link: string; snippet: string }> | null>

export interface DiscoverySubject {
  /** Stable key the caller uses to attach results back to its row. */
  id: string
  /** The name searched for — a hotel, a restaurant, a product, an attraction. */
  subject: string
  /** Narrows the search: the city / area the user asked about. */
  locality?: string
  /** URLs the row already carries (a Serper `link`, a `website_uri`). Owned ones skip the search. */
  knownUrls?: string[]
  /** The row's full title, for identity checks that need more than the discovery subject. */
  title?: string
}

export interface DiscoveredHint {
  subjectId: string
  providerId: string
  url: string
  title?: string
  /** The index snippet — what the listing itself states (a date, a venue); never a fact of ours. */
  snippet?: string
}

const quote = (s: string) => `"${s.replace(/["\n\r]/g, ' ').trim()}"`

function scopesNeeded(scopes: DiscoveryScope[], knownUrls: string[]): DiscoveryScope[] {
  const owned = new Set(knownUrls.map(providerOwning).filter((p): p is string => !!p))
  return scopes.filter(s => !owned.has(s.providerId))
}

async function runSearches(
  tasks: Array<{ subjectId: string; scopes: DiscoveryScope[]; query: string }>,
  search: SearchFn,
  perScope = MAX_LINKS_PER_SCOPE,
): Promise<DiscoveredHint[]> {
  const out: DiscoveredHint[] = []
  const results = await Promise.all(tasks.map(async t => {
    try { return await search(t.query) } catch { return null }
  }))
  tasks.forEach((t, i) => {
    const rows = results[i] ?? []
    const taken = new Map<string, number>()
    const wanted = new Set(t.scopes.map(s => s.providerId))
    for (const r of rows) {
      if (typeof r?.link !== 'string') continue
      const owner = providerOwning(r.link)
      if (!owner || !wanted.has(owner)) continue
      if ((taken.get(owner) ?? 0) >= perScope) continue
      out.push({ subjectId: t.subjectId, providerId: owner, url: r.link, ...(typeof r.title === 'string' ? { title: r.title } : {}), ...(typeof r.snippet === 'string' && r.snippet ? { snippet: r.snippet } : {}) })
      taken.set(owner, (taken.get(owner) ?? 0) + 1)
    }
  })
  return out
}

/**
 * The `site:` operand for a query group. Measured 14 Sep 2026: an OR of four sites leaks
 * non-scoped hosts and pushes the marketplace pages out; an OR of two holds. So a MARKETPLACE
 * scope always gets its own query (Shopee dominates a shared one and TikTok Shop vanishes),
 * and the remaining scopes are OR-ed in pairs.
 */
const MAX_SITES_PER_QUERY = 2
const siteOperand = (scopes: DiscoveryScope[]): string =>
  scopes.length === 1 ? `site:${scopes[0].site}` : `(${scopes.map(s => `site:${s.site}`).join(' OR ')})`

function queryGroups(scopes: DiscoveryScope[]): DiscoveryScope[][] {
  const groups: DiscoveryScope[][] = scopes.filter(s => s.segment === 'marketplace').map(s => [s])
  const rest = scopes.filter(s => s.segment !== 'marketplace')
  for (let i = 0; i < rest.length; i += MAX_SITES_PER_QUERY) groups.push(rest.slice(i, i + MAX_SITES_PER_QUERY))
  return groups
}

/**
 * Discover merchant pages for the given subjects (venue / hotel / product
 * NAMES) within the scopes CCP allows for this domain + intent. Pure with
 * respect to everything except `search`. Never throws; a failed or empty search
 * simply yields no hint for that subject.
 */
export async function discoverCommerceHints(
  domain: CommerceDomain,
  intentType: IntentType,
  subjects: DiscoverySubject[],
  opts: { search?: SearchFn; maxQueries?: number; scopes?: DiscoveryScope[] } = {},
): Promise<DiscoveredHint[]> {
  const search = opts.search ?? serperSearch
  const scopes = opts.scopes ?? discoveryScopesFor(domain, intentType)
  if (scopes.length === 0 || subjects.length === 0) return []
  let budget = opts.maxQueries ?? MAX_QUERIES_PER_TURN
  const tasks: Array<{ subjectId: string; scopes: DiscoveryScope[]; query: string }> = []
  for (const subject of subjects) {
    const name = subject.subject.trim()
    if (!name) continue
    const needed = scopesNeeded(scopes, subject.knownUrls ?? [])
    if (needed.length === 0) continue
    const locality = subject.locality?.trim()
    for (const group of queryGroups(needed)) {
      if (budget <= 0) break
      budget--
      // A marketplace listing title is long and seller-decorated ("… Chính hãng VN/A [Viettel Store]"), so an
      // exact-phrase query finds nothing there (measured 14 Sep 2026: 0 rows quoted, the product unquoted);
      // the tool layer's product-identity guard keeps the precision. Venue and hotel names stay quoted.
      const term = group.every(s => s.segment === 'marketplace') ? name.replace(/["\n\r]/g, ' ').trim() : quote(name)
      tasks.push({ subjectId: subject.id, scopes: group, query: `${term}${locality ? ` ${locality}` : ''} ${siteOperand(group)}` })
    }
    if (budget <= 0) break
  }
  return runSearches(tasks, search)
}

/**
 * Discover merchant listings for what the USER asked for — "spa massage" in
 * "Hồ Chí Minh" — within the scopes CCP allows for this domain + intent. Used
 * for the experience providers (Klook) whose catalogue is not keyed by venue
 * name. One query per scope; up to `perScope` owned links; no quoting, so the
 * search engine can match the catalogue's own wording.
 */
export async function discoverBySubject(
  domain: CommerceDomain,
  intentType: IntentType,
  subject: string,
  locality: string | undefined,
  opts: { search?: SearchFn; scopes?: DiscoveryScope[]; perScope?: number } = {},
): Promise<DiscoveredHint[]> {
  const search = opts.search ?? serperSearch
  const scopes = opts.scopes ?? discoveryScopesFor(domain, intentType)
  const name = subject.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
  if (scopes.length === 0 || !name) return []
  const tasks = scopes.map(scope => ({ subjectId: 'subject', scopes: [scope], query: `${name}${locality ? ` ${locality.trim()}` : ''} site:${scope.site}` }))
  return runSearches(tasks, search, opts.perScope ?? 3)
}
