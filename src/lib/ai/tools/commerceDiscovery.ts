import { discoveryScopesFor, providerOwning, bookabilitySignalsFor, type DiscoveryScope } from '@/lib/ccp'
import type { CommerceDomain, IntentType } from '@/lib/ccp'
import { safeGetText } from '@/lib/security/safeFetch'
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
//   · MERCHANT-PAGE verification (P1-1). PasGo indexes venues that have left its
//     reservation programme; the hold URL for them is a 404. `verifyMerchantPage`
//     performs one bounded, SSRF-guarded, read-only GET of the merchant page on
//     its allow-listed host and reports what the page says, using the signals the
//     registry declares (merchant knowledge stays in CCP). Nothing is submitted.
//
// 🚨 BUDGET. Serper is billed per request. Discovery runs at most
// MAX_QUERIES_PER_TURN searches per tool call, only for subjects that do not
// already carry an owned URL, and only while CCP is enabled (the caller gates).
// Page verification is capped at MAX_VERIFY_PER_TURN and 5 s each.
// `serperSearch` memoises non-empty results for its own TTL; nothing here adds
// a longer-lived cache (owner rule: no permanent caching).

export const MAX_QUERIES_PER_TURN = 3
export const MAX_VERIFY_PER_TURN = 3
const MAX_LINKS_PER_SCOPE = 2
const VERIFY_TIMEOUT_MS = 5_000

export type SearchFn = (query: string) => Promise<Array<{ title: string; link: string; snippet: string }> | null>
export type FetchTextFn = (url: string, maxBytes: number) => Promise<string | null>

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

async function runSearches(
  tasks: Array<{ subjectId: string; scope: DiscoveryScope; query: string }>,
  search: SearchFn,
  perScope = MAX_LINKS_PER_SCOPE,
): Promise<DiscoveredHint[]> {
  const out: DiscoveredHint[] = []
  const results = await Promise.all(tasks.map(async t => {
    try { return await search(t.query) } catch { return null }
  }))
  tasks.forEach((t, i) => {
    const rows = results[i] ?? []
    let taken = 0
    for (const r of rows) {
      if (taken >= perScope) break
      if (typeof r?.link !== 'string' || providerOwning(r.link) !== t.scope.providerId) continue
      out.push({ subjectId: t.subjectId, providerId: t.scope.providerId, url: r.link, ...(typeof r.title === 'string' ? { title: r.title } : {}) })
      taken++
    }
  })
  return out
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
  const tasks: Array<{ subjectId: string; scope: DiscoveryScope; query: string }> = []
  for (const subject of subjects) {
    const name = subject.subject.trim()
    if (!name) continue
    for (const scope of scopesNeeded(scopes, subject.knownUrls ?? [])) {
      if (budget <= 0) break
      budget--
      const locality = subject.locality?.trim()
      tasks.push({ subjectId: subject.id, scope, query: `${quote(name)}${locality ? ` ${locality}` : ''} site:${scope.site}` })
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
  const tasks = scopes.map(scope => ({ subjectId: 'subject', scope, query: `${name}${locality ? ` ${locality.trim()}` : ''} site:${scope.site}` }))
  return runSearches(tasks, search, opts.perScope ?? 3)
}

export interface MerchantPageVerdict {
  bookable: boolean | null
  checkedAt: string
  source: 'merchant_page'
}

async function defaultFetchText(url: string, maxBytes: number): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await safeGetText(url, controller.signal, { maxBytes, maxRedirects: 3 })
    return res.text
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * What the merchant page says about booking this subject, per the signals the
 * provider's registry entry declares. `bookable: null` when the provider declares
 * none, the URL is not the provider's, or the fetch failed — never a guess.
 */
export async function verifyMerchantPage(url: string, opts: { fetchText?: FetchTextFn; now?: Date } = {}): Promise<MerchantPageVerdict> {
  const checkedAt = (opts.now ?? new Date()).toISOString()
  const providerId = providerOwning(url)
  const signals = providerId ? bookabilitySignalsFor(providerId) : null
  if (!signals) return { bookable: null, checkedAt, source: 'merchant_page' }
  const text = await (opts.fetchText ?? defaultFetchText)(url, signals.maxBytes)
  if (typeof text !== 'string' || !text) return { bookable: null, checkedAt, source: 'merchant_page' }
  const norm = text.normalize('NFC')
  if (signals.refuses.some(s => norm.includes(s.normalize('NFC')))) return { bookable: false, checkedAt, source: 'merchant_page' }
  if (signals.requires.every(s => norm.includes(s.normalize('NFC')))) return { bookable: true, checkedAt, source: 'merchant_page' }
  // Page loaded but shows no booking widget: the merchant does not offer booking here.
  return { bookable: false, checkedAt, source: 'merchant_page' }
}
