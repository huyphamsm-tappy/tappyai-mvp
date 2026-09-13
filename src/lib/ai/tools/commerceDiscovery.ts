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
// 🚨 BUDGET. Serper is billed per request. Discovery runs at most
// MAX_QUERIES_PER_TURN searches per tool call, only for subjects that do not
// already carry an owned URL, and only while CCP is enabled (the caller gates).
// `serperSearch` memoises non-empty results for its own TTL; nothing here adds
// a longer-lived cache (owner rule: no permanent caching).

export const MAX_QUERIES_PER_TURN = 3
const MAX_LINKS_PER_SCOPE = 2

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
}

export interface DiscoveredHint {
  subjectId: string
  providerId: string
  url: string
  title?: string
}

const quote = (s: string) => `"${s.replace(/["\n\r]/g, ' ').trim()}"`

function scopesNeeded(scopes: DiscoveryScope[], knownUrls: string[]): DiscoveryScope[] {
  const owned = new Set(knownUrls.map(providerOwning).filter((p): p is string => !!p))
  return scopes.filter(s => !owned.has(s.providerId))
}

/**
 * Discover merchant pages for the given subjects within the scopes CCP allows
 * for this domain + intent. Pure with respect to everything except `search`.
 * Never throws; a failed or empty search simply yields no hint for that subject.
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
  const out: DiscoveredHint[] = []
  const tasks: Array<{ subject: DiscoverySubject; scope: DiscoveryScope; query: string }> = []
  for (const subject of subjects) {
    const name = subject.subject.trim()
    if (!name) continue
    for (const scope of scopesNeeded(scopes, subject.knownUrls ?? [])) {
      if (budget <= 0) break
      budget--
      const locality = subject.locality?.trim()
      const query = `${quote(name)}${locality ? ` ${locality}` : ''} site:${scope.site}`
      tasks.push({ subject, scope, query })
    }
    if (budget <= 0) break
  }
  const results = await Promise.all(tasks.map(async t => {
    try { return await search(t.query) } catch { return null }
  }))
  tasks.forEach((t, i) => {
    const rows = results[i] ?? []
    let taken = 0
    for (const r of rows) {
      if (taken >= MAX_LINKS_PER_SCOPE) break
      if (typeof r?.link !== 'string' || providerOwning(r.link) !== t.scope.providerId) continue
      out.push({ subjectId: t.subject.id, providerId: t.scope.providerId, url: r.link, ...(typeof r.title === 'string' ? { title: r.title } : {}) })
      taken++
    }
  })
  return out
}
