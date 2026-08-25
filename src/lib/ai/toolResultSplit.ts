// ── Model-facing vs server-side tool results ─────────────────────────────────
//
// Place tools return two kinds of thing in one object:
//
//   1. facts the model reasons and writes with — name, address, ratings,
//      maps_link, website_uri, cuisine, opening hours, prices…
//   2. enrichment the model is explicitly FORBIDDEN to write — photos, order
//      links, platform links. The system prompt says so in as many words
//      ("HE THONG TU CHEN, BAN KHONG VIET"), and applyPlaceEnrichmentStreamFilter
//      injects them positionally after generation, stripping any copy the model
//      wrote itself.
//
// Sending (2) into the model is paid context that cannot legally be used, and it
// is the bulk of the payload: gstatic photo URLs run 180–250 chars each and a
// place carries up to three, plus three order links. So the tool hands the model
// only (1) and pushes (2) into a request-scoped collector the stream filter
// reads instead.
//
// Why a collector and not the AI SDK's own hook: experimental_toToolResultContent
// rewrites BOTH the model-facing content and the `result` that reaches the client
// stream (ai@4.3.19 dist lines 1835-1840 / 1930-1935), so it cannot make the two
// differ — which is the entire point here.

// `tiktok_review_url` is system-owned like the rest: the stream filter injects it positionally
// and the model must never write a TikTok URL of its own. The model still learns WHETHER one
// exists, because `has_tiktok_review` (a boolean, not a URL) stays model-facing — that is what
// lets it say "no TikTok review found" truthfully without being able to invent a link.
export const ENRICHMENT_KEYS = ['photo_url', 'photo_urls', 'order_links', 'platform_links', 'tiktok_review_url'] as const

export interface PlatformLink { name: string; url: string }

/** A place's enrichment, plus the name needed to match it back to the prose. */
export interface PlaceEnrichment {
  name?: string
  photo_url?: string
  photo_urls?: string[]
  order_links?: PlatformLink[]
  platform_links?: PlatformLink[]
  tiktok_review_url?: string
}

/** Request-scoped. One per HTTP request, created in the route and never shared. */
export interface EnrichmentCollector {
  readonly places: PlaceEnrichment[]
  add(items: PlaceEnrichment[]): void
  /**
   * The batch-level TikTok link, if any tool produced one this turn.
   *
   * Deliberately NOT a `PlaceEnrichment`: it belongs to the search, not to a place, and modelling
   * it as one is how it ended up captioned as a restaurant's review in the first place.
   */
  batchTikTokUrl?: string
  setBatchTikTokUrl(url: string | undefined): void
  /**
   * The Phase-9 shopping-decision marker, appended once to the very end of the
   * reply text so it PERSISTS with the message (a tool-result field does not —
   * see synthesisView.renderShoppingMarker). Batch-level like the TikTok URL:
   * one decision per shopping turn, owned by the app, never written by the model.
   */
  shoppingMarker?: string
  setShoppingMarker(marker: string | undefined): void
}

/** Tools whose results carry enrichment. Mirrors PLACE_TOOLS in streamEnrichment. */
const PLACE_TOOLS = new Set(['search_places', 'get_hotel_prices', 'search_products'])

const hasEnrichment = (p: PlaceEnrichment) =>
  !!(p.photo_url || (p.photo_urls && p.photo_urls.length > 0) ||
    (p.order_links && p.order_links.length > 0) || (p.platform_links && p.platform_links.length > 0) ||
    p.tiktok_review_url)

const hasPhoto = (p: PlaceEnrichment) => !!(p.photo_url || (p.photo_urls && p.photo_urls.length > 0))

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Splits one tool result into what the model sees and what the server keeps.
 *
 * Never throws: a malformed or unexpected result is passed through untouched
 * rather than failing the turn — a tool that returned something odd should
 * degrade to "no enrichment", not to "no answer".
 */
export function splitToolResult(
  toolName: string,
  result: unknown,
): { model: unknown; enrichment: PlaceEnrichment[]; batchTikTokUrl?: string } {
  if (!PLACE_TOOLS.has(toolName) || !isRecord(result)) return { model: result, enrichment: [] }

  /**
   * A TikTok result the search found but could NOT tie to any one place.
   *
   * Root-level rather than per-place, because that is exactly what it is: the query was one search
   * for the whole batch. It is carved off like every other link so the model never writes it — and
   * so it can be rendered under wording that says "related video", not "this restaurant's review".
   */
  const { tiktok_discovery_url, ...withoutBatch } = result as Record<string, unknown>
  const batchTikTokUrl = typeof tiktok_discovery_url === 'string' ? tiktok_discovery_url : undefined
  result = withoutBatch

  // search_places carries results[] keyed by `name`; get_hotel_prices and
  // search_products carry search_results[] where `title` stands in for the name.
  // Raw titles read "Hotel Name - City - Booking.com" but the model writes just
  // "Hotel Name", so match on the part before the first " - " — the same rule
  // the stream filter already used when it parsed these frames itself.
  const root = result as Record<string, unknown>
  const listKey = Array.isArray(root.results) ? 'results'
    : Array.isArray(root.search_results) ? 'search_results'
      : null
  if (!listKey) return { model: root, enrichment: [], batchTikTokUrl }

  const items = root[listKey] as unknown[]
  const enrichment: PlaceEnrichment[] = []
  const slimItems = items.map((item) => {
    if (!isRecord(item)) return item
    const { photo_url, photo_urls, order_links, platform_links, tiktok_review_url, ...rest } = item as PlaceEnrichment & Record<string, unknown>
    const name = listKey === 'results'
      ? (item.name as string | undefined)
      : String((item.title as string | undefined) ?? '').split(' - ')[0].trim() || undefined
    const carved: PlaceEnrichment = { name, photo_url, photo_urls, order_links, platform_links, tiktok_review_url }
    if (name && hasEnrichment(carved)) enrichment.push(carved)
    return rest
  })

  return { model: { ...root, [listKey]: slimItems }, enrichment, batchTikTokUrl }
}

/**
 * Per-request enrichment store.
 *
 * Deliberately a closure over a local array rather than a module-level map:
 * there is no key to collide on, nothing to evict, nothing to clean up, and no
 * way for one request to read another's data or for a warm serverless instance
 * to carry data across invocations. It also survives any number of concurrent
 * requests on the same instance for free.
 */
export function createEnrichmentCollector(): EnrichmentCollector {
  const places: PlaceEnrichment[] = []
  /** Every photo URL already claimed by an earlier entry, so no image is used twice. */
  const claimedPhotos = new Set<string>()

  /**
   * Drops photo URLs another entry already owns.
   *
   * Two shopping listings from the same seller routinely carry the SAME provider image, and two
   * venues occasionally do through a provider glitch. Rendering it under both is worse than
   * rendering it once: it tells the reader the two entries are the same thing, which for a shopping
   * result — where the rows genuinely differ in chip, condition and price — is exactly the false
   * merge this pipeline must never imply. First claimant keeps it; later ones simply go without.
   */
  const claim = (p: PlaceEnrichment): PlaceEnrichment => {
    // Each field is filtered in place. The shape is NOT rewritten — an entry that arrived with
    // `photo_urls` keeps `photo_urls`, even when only one URL survives, because the stream filter
    // and its tests read the two fields separately.
    const take = (url: string | undefined): string | undefined => {
      const u = (url ?? '').trim()
      if (!u || claimedPhotos.has(u)) return undefined
      claimedPhotos.add(u)
      return u
    }
    const out: PlaceEnrichment = { ...p }
    if (out.photo_urls) {
      const kept = out.photo_urls.map(take).filter((u): u is string => !!u)
      if (kept.length > 0) out.photo_urls = kept
      else delete out.photo_urls
    }
    if (out.photo_url) {
      const kept = take(out.photo_url)
      // A `photo_url` already listed in this entry's own `photo_urls` was claimed a line ago;
      // keeping it is correct, so only a URL claimed by a DIFFERENT entry removes it.
      if (kept) out.photo_url = kept
      else if (!p.photo_urls?.includes(out.photo_url)) delete out.photo_url
    }
    return out
  }

  return {
    places,
    batchTikTokUrl: undefined as string | undefined,
    setBatchTikTokUrl(url) {
      // First one wins: a trip plan runs several place searches and the answer carries one
      // "related video" line, not one per search.
      if (url && !this.batchTikTokUrl) this.batchTikTokUrl = url
    },
    shoppingMarker: undefined as string | undefined,
    setShoppingMarker(marker) {
      // First one wins, mirroring the TikTok URL: one shopping decision per turn.
      if (marker && !this.shoppingMarker) this.shoppingMarker = marker
    },
    add(items) {
      for (const raw of items ?? []) {
        const key = (raw?.name || '').trim().toLowerCase()
        if (!key) continue
        const existing = places.find(q => (q.name || '').trim().toLowerCase() === key)
        // Accumulate across EVERY place-tool call — a trip plan runs several
        // searches and each item needs its own photo. If a later call carries a
        // photo for a name we already saw without one, upgrade to it.
        if (!existing) places.push(claim(raw))
        else if (!hasPhoto(existing) && hasPhoto(raw)) Object.assign(existing, claim(raw))
      }
    },
  }
}
