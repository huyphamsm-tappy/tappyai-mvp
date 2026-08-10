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

export const ENRICHMENT_KEYS = ['photo_url', 'photo_urls', 'order_links', 'platform_links'] as const

export interface PlatformLink { name: string; url: string }

/** A place's enrichment, plus the name needed to match it back to the prose. */
export interface PlaceEnrichment {
  name?: string
  photo_url?: string
  photo_urls?: string[]
  order_links?: PlatformLink[]
  platform_links?: PlatformLink[]
}

/** Request-scoped. One per HTTP request, created in the route and never shared. */
export interface EnrichmentCollector {
  readonly places: PlaceEnrichment[]
  add(items: PlaceEnrichment[]): void
}

/** Tools whose results carry enrichment. Mirrors PLACE_TOOLS in streamEnrichment. */
const PLACE_TOOLS = new Set(['search_places', 'get_hotel_prices', 'search_products'])

const hasEnrichment = (p: PlaceEnrichment) =>
  !!(p.photo_url || (p.photo_urls && p.photo_urls.length > 0) ||
    (p.order_links && p.order_links.length > 0) || (p.platform_links && p.platform_links.length > 0))

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
): { model: unknown; enrichment: PlaceEnrichment[] } {
  if (!PLACE_TOOLS.has(toolName) || !isRecord(result)) return { model: result, enrichment: [] }

  // search_places carries results[] keyed by `name`; get_hotel_prices and
  // search_products carry search_results[] where `title` stands in for the name.
  // Raw titles read "Hotel Name - City - Booking.com" but the model writes just
  // "Hotel Name", so match on the part before the first " - " — the same rule
  // the stream filter already used when it parsed these frames itself.
  const listKey = Array.isArray(result.results) ? 'results'
    : Array.isArray(result.search_results) ? 'search_results'
      : null
  if (!listKey) return { model: result, enrichment: [] }

  const items = result[listKey] as unknown[]
  const enrichment: PlaceEnrichment[] = []
  const slimItems = items.map((item) => {
    if (!isRecord(item)) return item
    const { photo_url, photo_urls, order_links, platform_links, ...rest } = item as PlaceEnrichment & Record<string, unknown>
    const name = listKey === 'results'
      ? (item.name as string | undefined)
      : String((item.title as string | undefined) ?? '').split(' - ')[0].trim() || undefined
    const carved: PlaceEnrichment = { name, photo_url, photo_urls, order_links, platform_links }
    if (name && hasEnrichment(carved)) enrichment.push(carved)
    return rest
  })

  return { model: { ...result, [listKey]: slimItems }, enrichment }
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
  return {
    places,
    add(items) {
      for (const p of items ?? []) {
        const key = (p?.name || '').trim().toLowerCase()
        if (!key) continue
        const existing = places.find(q => (q.name || '').trim().toLowerCase() === key)
        // Accumulate across EVERY place-tool call — a trip plan runs several
        // searches and each item needs its own photo. If a later call carries a
        // photo for a name we already saw without one, upgrade to it.
        if (!existing) places.push(p)
        else if (!hasPhoto(existing) && hasPhoto(p)) Object.assign(existing, p)
      }
    },
  }
}
