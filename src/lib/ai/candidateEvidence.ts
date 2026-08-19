import type { Candidate } from './conversationState'

/**
 * Turns a MODEL-FACING tool result into normalized candidates (Task 3D).
 *
 * WHY THE MODEL-FACING HALF: B4 (`splitToolResult`) carves out only
 * ENRICHMENT_KEYS — photos and order/platform links. Every fact the tool
 * returned (place_id, address, google_rating, maps_link, website_uri, price…)
 * stays on the `model` side. Task 3C captured candidates from the *enrichment*
 * collector instead, which by construction carries `{name, photo_*, *_links}`
 * and nothing else — that, not B4's slimming, is why candidates persisted with
 * `facts: {}`. B4 therefore needs no widening at all.
 *
 * RULE: a field is copied only when the tool actually supplied it. A missing
 * fact stays missing, so "not in the evidence" is always distinguishable from
 * "zero"/"unknown" downstream. Nothing here derives, parses or guesses a value.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Copy `key` into facts only if the tool gave a usable scalar. */
function put(facts: Record<string, string | number>, key: string, raw: unknown): void {
  if (typeof raw === 'number' && Number.isFinite(raw)) { facts[key] = raw; return }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t) facts[key] = t
  }
}

/** `"Hotel Name - City - Booking.com"` → `"Hotel Name"`, matching B4's own rule. */
/**
 * A web-search hit's title is a headline; everything after the first " - " is
 * usually site furniture, so it is dropped.
 */
function titleToName(title: unknown): string {
  return String(title ?? '').split(' - ')[0].trim()
}

/**
 * A SHOPPING listing's title is its identity, and must survive whole.
 *
 * Splitting on " - " turned "Macbook Pro 13 2020 - Core i7/32GB/512GB - Like
 * New" into "Macbook Pro 13 2020" and "Mac Studio M4 Max chip 32-Core GPU (Ram
 * 36GB - SSD 512GB) - Pre-Order" into a string cut mid-parenthesis. Two
 * consequences, both measured: the model saw names stripped of the very specs
 * that distinguish one listing from another and merged a 16-inch listing with
 * a 14-inch listing's 29.550.000 ₫ price; and two different listings could
 * collapse to the same name, which then keys rejection and ranking.
 */
function listingToName(title: unknown): string {
  return String(title ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Stable per-listing identity, most authoritative first.
 *
 * `productId` is the provider's own product key; `link` is unique per listing;
 * the title is the last resort. Never the name alone — two sellers listing the
 * same machine are two candidates with two prices.
 */
function listingIdentity(item: Record<string, unknown>, fallback: string): string {
  if (typeof item.product_id === 'string' && item.product_id) return `pid:${item.product_id}`
  if (typeof item.link === 'string' && item.link) return item.link
  return fallback
}

/**
 * @param toolName  the tool that produced `result` — becomes each candidate's provenance.
 * @param result    the MODEL-facing half returned by `splitToolResult`.
 */
export function normalizeToolCandidates(toolName: string, result: unknown, now: number): Candidate[] {
  if (!isRecord(result)) return []

  if (toolName === 'search_places' && Array.isArray(result.results)) {
    const out: Candidate[] = []
    for (const item of result.results) {
      if (!isRecord(item)) continue
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      if (!name) continue // no identity => not a candidate
      const facts: Record<string, string | number> = {}
      put(facts, 'address', item.address)
      // Already a display string from the tool ("4.9⭐ (10,656 reviews)") — kept
      // verbatim rather than re-parsed, so the number can never drift.
      put(facts, 'google_rating', item.google_rating)
      put(facts, 'cuisine', item.cuisine)
      put(facts, 'stars', item.stars)
      put(facts, 'opening_hours', item.opening_hours)
      put(facts, 'maps_link', item.maps_link)
      out.push({
        candidateId: typeof item.place_id === 'string' && item.place_id ? item.place_id : name,
        name,
        type: 'place',
        source: toolName,
        retrievedAt: now,
        facts,
        ...(typeof item.website_uri === 'string' && item.website_uri ? { url: item.website_uri } : {}),
      })
    }
    return out
  }

  // get_hotel_prices / search_products expose search_results[], where `title`
  // stands in for the name. These are web search hits: title/link/snippet are
  // real, a per-item `price` only sometimes exists, and nothing else does.
  if (Array.isArray(result.search_results)) {
    const type: Candidate['type'] = toolName === 'get_hotel_prices' ? 'hotel' : 'product'
    const out: Candidate[] = []
    // Deduplication is by IDENTITY, never by name: the same listing repeated in
    // one response collapses, while two sellers offering the same machine at
    // different prices stay two candidates with two prices.
    const seen = new Set<string>()
    for (const item of result.search_results) {
      if (!isRecord(item)) continue
      // Only a Google Shopping row carries `product_id`/`price_vnd`. Hotel rows
      // and web-search products keep the old headline trim, whose titles really
      // are site furniture ("Muong Thanh - Da Nang - Booking.com").
      const isListing = type === 'product' && (item.product_id !== undefined || item.price_vnd !== undefined)
      const name = isListing ? listingToName(item.title) : titleToName(item.title)
      if (!name) continue
      const facts: Record<string, string | number> = {}
      put(facts, 'price', item.price)
      put(facts, 'snippet', item.snippet)
      put(facts, 'source_site', item.source)
      // Shopping listings (Google Shopping via Serper). Each of these is a
      // value the SELLER published; specs are absent unless the listing title
      // stated them, and `spec_source` carries the text they were read from so
      // a claim about RAM can be traced back to the words that support it.
      put(facts, 'price_vnd', item.price_vnd)
      put(facts, 'ram_gb', item.ram_gb)
      put(facts, 'storage_gb', item.storage_gb)
      put(facts, 'condition', item.condition)
      put(facts, 'condition_label', item.condition_label)
      put(facts, 'spec_source', item.spec_source)
      put(facts, 'rating', item.rating)
      put(facts, 'rating_count', item.rating_count)
      put(facts, 'product_id', item.product_id)
      const candidateId = listingIdentity(item, name)
      if (seen.has(candidateId)) continue
      seen.add(candidateId)
      out.push({
        candidateId,
        name,
        type,
        source: toolName,
        retrievedAt: now,
        facts,
        ...(typeof item.link === 'string' && item.link ? { url: item.link } : {}),
      })
    }
    return out
  }

  return []
}

/** Newest-wins de-dup by candidateId, preserving first-seen order. */
export function mergeCandidates(existing: Candidate[], fresh: Candidate[]): Candidate[] {
  const byId = new Map<string, Candidate>()
  for (const c of existing) byId.set(c.candidateId, c)
  for (const c of fresh) byId.set(c.candidateId, c)
  return [...byId.values()]
}
