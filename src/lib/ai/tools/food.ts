import { getCache, setCache, serperSearch } from './common'
import { normalizeVN } from '@/lib/ai/intent'
import { createClient } from '@/lib/supabase/server'
import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { attributeTikTok } from '@/lib/links/tiktokAttribution'
import { placeTokensFor, placeNamedBy } from '@/lib/links/placeAttribution'
import { buildSpaLinks } from '@/lib/platformLinks/spa'
import { buildEntertainmentLinks } from '@/lib/platformLinks/entertainment'
import { reviewActionsForPlace } from '@/lib/ai/consultative/reviewAction'
import { messages, isVi } from '@/lib/ai/messages'
import { detectFoodConstraints, osmFilterFor, unmetConstraintNote } from '@/lib/ai/foodConstraints'
import { rowServesDish } from '@/lib/ai/foodDish'
import { newsCacheKey, placesCacheKey } from './cacheKeys'
import { osmCategoryFor, osmUnionFor, placeDomainFor } from './osmCategory'
import { cityForName, cityInText } from './vietnamCities'
import { usableOverpass } from './overpassResponse'
import { classifyEvidence } from '@/lib/ai/consultative/evidenceProvenance'

export async function getNews(query: string, lang = 'vi') {
  const cacheKey = newsCacheKey(query, lang)
  const cached = getCache(cacheKey)
  if (cached) return cached

  const feeds = [
    { url: 'https://vnexpress.net/rss/tin-moi-nhat.rss', name: 'VnExpress' },
    { url: 'https://tuoitre.vn/rss/tin-moi-nhat.rss', name: 'Tuoi Tre' },
    { url: 'https://dantri.com.vn/rss/home.rss', name: 'Dan Tri' },
  ]
  let result: unknown
  try {
    const queryTerms = query.toLowerCase().split(' ').filter(t => t.length > 2)
    const articles: Array<{ title: string; description: string; link: string; source: string; published: string }> = []
    await Promise.all(feeds.map(async feed => {
      try {
        const resp = await Promise.race([
          fetch(feed.url, { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
        ])
        const xml = await (resp as Response).text()
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
        for (const item of items.slice(0, 30)) {
          if (articles.length >= 8) break
          const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim()
          const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]*>/g, '').trim()
          const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || item.match(/<guid>(.*?)<\/guid>/)?.[1] || '').trim()
          const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
          if (!title) continue
          const tl = title.toLowerCase(), dl = desc.toLowerCase()
          const matches = queryTerms.length === 0 || queryTerms.some(k => tl.includes(k) || dl.includes(k))
          if (matches) articles.push({ title, description: desc.slice(0, 200), link, source: feed.name, published: pub ? new Date(pub).toLocaleDateString(isVi(lang) ? 'vi-VN' : 'en-US') : messages.news.latest(lang) })
        }
      } catch { /* skip feed */ }
    }))
    result = articles.length === 0
      ? { note: messages.news.noResults(lang), articles: [] }
      : { query, total: articles.length, articles: articles.slice(0, 5) }
  } catch {
    result = { error: messages.news.fetchError(lang), articles: [] }
  }
  setCache(cacheKey, result, 10 * 60 * 1000) // cache 10 phut, tin tuc cap nhat thuong xuyen
  return result
}


// Straight-line distance (km) between two lat/lng points — for grounding places in the
// user's surroundings (MFS 3.8 Maps: orientation & sense of surroundings). Local copy to
// avoid a circular import with travel.ts (which imports searchPlacesOSM from here).
function haversineKmLocal(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function searchPlacesOSM(query: string, location?: string, type?: string, locationBias?: { lat: number; lng: number } | null, lang = 'vi') {
  /**
   * 🚨 THE DEFAULT CITY WAS A FABRICATION.
   *
   * This line read `location || 'Ha Noi'`. A query with no area and no GPS -
   * "Quan cafe view dep" - therefore became a Hanoi search, and the reply
   * recommended Hanoi cafes as though the user had asked for Hanoi. Measured on
   * localhost 2026-09-08: tool called with no location, result `location: "Ha
   * Noi"`, ten Hanoi rows, and nothing in the answer disclosing the assumption.
   *
   * There is no honest default. With no stated area and no device position we do
   * not know where to look, so nothing is searched and the caller is told to ask.
   */
  if (!location && !locationBias) {
    return {
      location_required: true,
      results: [],
      no_results_instruction: messages.places.locationRequired(lang),
      note: messages.places.locationRequired(lang),
    }
  }
  // After the guard above, a missing `location` means GPS is driving the search,
  // and the coordinate branch never reads `loc`. Empty is the honest value to
  // report back - the old code reported "Ha Noi" here, which is the fabrication.
  const loc = location ?? ''
  const googleMapsUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + loc)
  try {
    /**
     * 🚨 TWO CITY TABLES, AND THE SMALLER ONE WAS IN CHARGE OF PLACES.
     *
     * This function carried its own 16-alias list. `vietnamCities.ts` — written
     * precisely because "there were three implementations of this in the
     * repository" — carries the full one WITH coordinates, and it is what
     * weather already resolves through. Quy Nhơn is in the shared table and was
     * missing from the private one, so "quán cafe view đẹp ở Quy Nhơn" fell to
     * Nominatim and, when that did not answer inside its 2.5s budget, the turn
     * reported that a city the user had named plainly could not be looked up.
     *
     * `cityInText` also matches a city inside a longer phrase and folds
     * diacritics, so "ở Quy Nhơn" and "quy nhon" both resolve — the private
     * `includes()` scan did neither reliably.
     */
    const city = cityForName(loc) ?? cityInText(loc)
    let lat: number
    let lon: number
    let searchRadius: number
    // Did we actually establish WHERE to search, or only assume it?
    let located = false
    if (locationBias) {
      // Real device GPS → search around the user's ACTUAL position with a tight
      // "right here, right now" radius (MFS 3.7 Nearby). Skip geocoding a city string;
      // the precise coords are what "gần đây" actually means.
      located = true
      lat = locationBias.lat
      lon = locationBias.lng
      /**
       * 🚨 2000 EXCEEDED THE SERVER'S OWN BUDGET IN A DENSE METRO.
       *
       * Measured 2026-09-08 at 10.7756,106.7019 (District 1, HCMC) with the
       * `[timeout:10]` this file sends: r=2000 -> 0 elements, "runtime error:
       * Query timed out ... after 14 seconds"; r=1500 -> 10 elements; r=1000 ->
       * 10 elements. The city-preset branch below already uses 1500 for dense
       * metros on the same measurement; the GPS branch simply never got it, and
       * every GPS-biased query in HCMC came back empty as a result.
       */
      searchRadius = 1500
    } else {
      located = !!city
      lat = city ? city.coords[0] : 21.0285
      lon = city ? city.coords[1] : 105.8542
      /**
       * 🚨 5km RETURNED NOTHING, EVERYWHERE — NOT JUST IN THE DENSE METROS.
       *
       * The split assumed only Hanoi/HCMC could not afford a 5km radius. Measured
       * 2026-09-08 against both endpoints for Quy Nhơn (13.7820,109.2192) with
       * the `[timeout:10]` this file sends:
       *
       *   r=5000 -> 0 rows, "runtime error: Query timed out"  (primary AND mirror)
       *   r=3000 -> 504 Gateway Timeout
       *   r=2000 -> 0 rows, timed out
       *   r=1500 -> 10 named cafés, no remark   ← and Hanoi r=1500 also 10
       *
       * So "quán cafe view đẹp ở Quy Nhơn" retrieved nothing for a city that has
       * plenty of cafés in OSM: the radius, not the data, was the problem. 1500
       * is what the GPS branch and the dense-metro branch already use, and a
       * radius that answers strictly dominates one that times out.
       */
      searchRadius = 1500
      if (!city) {
        try {
          const geoResp = await Promise.race([
            fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(loc + ' Vietnam') + '&format=json&limit=1', {
              headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
          ])
          const geoData = await (geoResp as Response).json()
          if (geoData[0]) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon); located = true }
        } catch { /* use default */ }
      }
    }
    // Which OSM tag shapes this category lives under — see osmCategory.ts. The
    // ladder moved there so it is unit-testable: a wrong tag key does not error,
    // it returns zero rows and reads as "there are none here".
    /**
     * 🚨 AN UNRESOLVED CITY IS NOT A LICENCE TO SEARCH A DIFFERENT ONE.
     *
     * `lat`/`lon` are initialised to Hanoi and only overwritten by a preset hit
     * or a successful geocode, so a failed lookup used to search Hanoi and label
     * the answer with the user's city. Measured: "Quan cafe view dep o Quy Nhon"
     * reported Quy Nhon while the coordinates never left Hanoi.
     */
    if (!located) {
      return {
        location_unresolved: true,
        location: loc,
        results: [],
        no_results_instruction: messages.places.locationUnresolved(lang, loc),
        note: messages.places.locationUnresolved(lang, loc),
        google_maps_search: googleMapsUrl,
      }
    }
    const osmCategory = osmCategoryFor(query, type)
    const amenity = osmCategory.label

    /**
     * 🚨 BUG 2 — THE USER'S CONSTRAINT REACHES THE PROVIDER.
     *
     * "nhà hàng buffet" used to become `amenity=restaurant` and nothing else, so
     * the reply was built from ten ordinary restaurants and the model invented
     * buffet venues to close the gap. `cuisine` and `diet:*` are real, widely
     * used OSM keys — nothing here invents provider syntax.
     *
     * 🔑 CONSTRAINED FIRST, THEN AN HONEST FALLBACK. OSM tagging is sparse, so a
     * constrained query can legitimately return nothing. Rather than show an
     * empty list (or, worse, silently drop the constraint as before), the
     * unconstrained set is fetched and travels with `constraint_unmet` plus a
     * note telling the model to say the constraint was NOT verified.
     */
    const foodConstraints = detectFoodConstraints(query)
    const constraintFilter = osmFilterFor(foodConstraints)
    const sel = (extra: string) => osmUnionFor(osmCategory, extra, searchRadius, lat, lon)
    const buildOql = (extra: string) => '[out:json][timeout:10];(' + sel(extra) + ');out center 10;'
    const oql = buildOql(constraintFilter)
    // overpass.kumi.systems is dead (serves an HTML/XML error page with HTTP 200, so the
    // .json() below throws and the fallback is silently useless). maps.mail.ru is a live,
    // fast Overpass mirror with full VN coverage — verified returning valid JSON. Keeping a
    // real second endpoint matters: the primary intermittently runs ~8s under load, close to
    // the 11s budget, so a working fallback is what actually keeps "surfaces options" reliable.
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
    let overpassData: { elements?: unknown[] } | null = null
    for (const endpoint of endpoints) {
      try {
        const resp = await Promise.race([
          fetch(endpoint + '?data=' + encodeURIComponent(oql), { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
          // Aligned with the query's own [timeout:10] budget + 1s network buffer —
          // previously 5000ms, which aborted before the server's own declared timeout.
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 11000))
        ])
        if ((resp as Response).ok) {
          overpassData = usableOverpass(await (resp as Response).json())
          if (overpassData) break
        }
      } catch { continue }
    }
    /**
     * 🚨 OVERPASS NARROWED THE QUESTION; JAVASCRIPT DECIDES THE ANSWER.
     *
     * The dish filter reaches the provider as `["name"~"bún bò|bun bo",i]`,
     * which is the right question to ask — measured 2026-09-09, it returns six
     * real bún bò restaurants in D1 where the old bare `amenity=restaurant`
     * search returned Jaspas, Au Tresor and Crazy Buffalo. But Overpass matches
     * that regex over raw UTF-8 BYTES, so it is a narrowing device, not a
     * boundary: it can admit a row the dish check would reject.
     *
     * So every returned row is re-checked here through `normalizeVN`, which
     * strips diacritics properly. Rows that survive ARE the dish. If none
     * survive, the list is emptied ON PURPOSE, which drops through to the
     * unconstrained fallback below and travels with `constraint_unmet` — the
     * user gets nearby venues plus a note saying the dish was not confirmed,
     * never a venue relabelled as something it is not.
     */
    const dishConstraint = foodConstraints.find(c => c.kind === 'dish')
    if (dishConstraint?.dish && overpassData) {
      const dish = dishConstraint.dish
      const verified = ((overpassData.elements ?? []) as Array<{ tags?: Record<string, string> }>)
        .filter(el => rowServesDish({ name: el.tags?.['name:vi'] || el.tags?.name, cuisine: el.tags?.cuisine }, dish))
      overpassData = { ...overpassData, elements: verified }
    }

    // The constraint found nothing. Fall back to the unconstrained set so the
    // user still gets nearby options — but flagged, never passed off as matching.
    let constraintUnmet = false
    if (constraintFilter && (!overpassData || (overpassData.elements ?? []).length === 0)) {
      constraintUnmet = true
      const fallbackOql = buildOql('')
      for (const endpoint of endpoints) {
        try {
          const resp = await Promise.race([
            fetch(endpoint + '?data=' + encodeURIComponent(fallbackOql), { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 11000))
          ])
          if ((resp as Response).ok) {
          overpassData = usableOverpass(await (resp as Response).json())
          if (overpassData) break
        }
        } catch { continue }
      }
    }
    if (!overpassData) return { note: messages.places.searchOnMaps(lang, googleMapsUrl), google_maps_search: googleMapsUrl, results: [] }
    type El = { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }
    const baseResults = ((overpassData.elements || []) as El[]).slice(0, 10).map(el => {
      const tags = el.tags || {}
      const elat = el.lat ?? el.center?.lat
      const elon = el.lon ?? el.center?.lon
      // OSM already returns these tags in the same Overpass response — surface the honest,
      // decision-useful ones instead of discarding them (MFS 3.1/3.2/3.3: present useful info,
      // surface RELEVANT options). cuisine ~55% coverage on VN venues; the rest are sparse but
      // real when present. No new API call, no billing, no fabrication — only omit when absent.
      const cuisineRaw = tags.cuisine || ''
      const cuisine = cuisineRaw ? cuisineRaw.split(';').map(c => c.replace(/_/g, ' ').trim()).filter(Boolean).join(', ') : null
      const website = tags.website || tags['contact:website'] || null
      const veg = tags['diet:vegetarian'] || ''
      const vegan = tags['diet:vegan'] || ''
      const vegetarian = (/^(yes|only)$/i.test(veg) || /^(yes|only)$/i.test(vegan)) ? true : null
      // Cafe atmosphere/purpose signals (MFS 3.2: attuned to the FEEL — work/study/meeting).
      // internet_access ~25% coverage on VN cafes; a real wifi signal when present.
      const wifi = /^(wlan|yes|wifi|terminal)$/i.test(tags['internet_access'] || '') ? true : null
      const outdoor = /^yes$/i.test(tags['outdoor_seating'] || '') ? true : null
      // Hotel star rating (MFS 3.4: accommodation quality is core "needs" info). ~13% of
      // tourism=hotel nodes carry it; only accept a sane 1–5 value.
      const stars = /^[1-5]$/.test((tags.stars || '').trim()) ? (tags.stars || '').trim() : null
      // 🚨 AN ADDRESS SLOT IS FOR AN ADDRESS. This used to fall back to
      // `messages.places.seeMap(lang)`, so a venue OSM has no `addr:*` tags for
      // rendered the words "Xem ban do" in the address line of the card — a UI
      // label sitting where a street should be, indistinguishable from a real
      // address to the reader. Same class as the `KHONG CO DU LIEU` sentinel
      // guarded in `liveView.ts`: an unknown field is ABSENT, never a stand-in
      // string. `buildEntity` already maps a missing address to `unknownClaim`
      // and `PlaceDecision` already renders the address line only when present,
      // so omitting it is what the rest of the pipeline expects.
      const addr = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || null
      return {
        name: tags['name:vi'] || tags.name || '',
        ...(addr ? { address: addr } : {}),
        phone: tags.phone || tags['contact:phone'] || null,
        maps_link: elat && elon ? 'https://www.google.com/maps?q=' + elat + ',' + elon : googleMapsUrl,
        ...(cuisine ? { cuisine } : {}),
        ...(tags.opening_hours ? { opening_hours: tags.opening_hours } : {}),
        ...(website ? { website_uri: website } : {}),
        ...(vegetarian ? { vegetarian: true } : {}),
        ...(wifi ? { wifi: true } : {}),
        ...(outdoor ? { outdoor_seating: true } : {}),
        ...(stars ? { stars } : {}),
        // Coordinates are EMITTED now, not just consumed. They were computed here
        // for `maps_link` and `distance_km` and then dropped, which left an
        // OSM-sourced entity with no position of its own.
        ...((elat && elon) ? { lat: elat, lng: elon } : {}),
        // Distance from the user, only when we have both their GPS and the place's coords.
        ...((locationBias && elat && elon) ? { distance_km: Math.round(haversineKmLocal(locationBias.lat, locationBias.lng, elat, elon) * 10) / 10 } : {}),
      }
    }).filter(r => r.name)
    // B7-A: no eager photo lookup here either — this branch used to fire one
    // Serper Images call per result (up to 10) when at most 3 are ever shown.
    const results = baseResults
    return {
      location: loc, amenity_type: amenity, source: 'OpenStreetMap', count: results.length, results,
      google_maps_search: googleMapsUrl,
      // The constraint travels WITH the data, satisfied or not. A model that is
      // told "these are not confirmed buffet" can say so; one that is told
      // nothing fills the gap itself, which is the bug this fixes.
      ...(foodConstraints.length > 0
        ? {
            requested_constraints: foodConstraints.map(c => c.label),
            constraint_unmet: constraintUnmet,
            ...(constraintUnmet ? { constraint_note: unmetConstraintNote(foodConstraints, lang) } : {}),
          }
        : {}),
      note: results.length === 0 ? messages.places.noOsmData(lang, googleMapsUrl) : messages.places.osmSourceNote(lang, googleMapsUrl)
    }
  } catch (e) { return { error: String(e), results: [], google_maps_search: googleMapsUrl } }
}

// Kiem tra 1 link co phai trang CU THE (khong phai trang chu) tren ShopeeFood/GrabFood/Baemin/BeFood
function isDirectFoodOrderLink(link: string): boolean {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    if (path.length <= 1) return false // bo qua trang chu, khong cu the
    return host.includes('shopeefood.vn') || host.includes('food.grab.com') || host.includes('baemin.vn') || host.includes('be.com.vn')
  } catch {
    return false
  }
}

// ── Readers for the widened field mask (approved architecture rev 2, §4) ─────
//
// Each returns `undefined` when Google did not supply the field. NOTHING here
// infers, defaults or reconstructs: an absent value stays absent so the
// canonical entity can mark it UNKNOWN rather than guess. The row keys below are
// the snake_case names the rest of the pipeline already speaks, so the OSM
// fallback rows and the Google rows stay shape-compatible.

interface GoogleOpeningHours { openNow?: boolean; weekdayDescriptions?: string[] }
interface GooglePriceAmount { currencyCode?: string; units?: string | number }
interface GooglePriceRange { startPrice?: GooglePriceAmount; endPrice?: GooglePriceAmount }

/** Weekly hours as Google already formats them for the requested language. */
function readOpeningHours(r: Record<string, unknown>): string | undefined {
  const reg = r.regularOpeningHours as GoogleOpeningHours | undefined
  const lines = reg?.weekdayDescriptions
  if (!Array.isArray(lines) || lines.length === 0) return undefined
  return lines.join('; ')
}

/**
 * Open right now.
 *
 * 🔑 `currentOpeningHours` accounts for holidays and special hours;
 * `regularOpeningHours` does not. Prefer the former, fall back to the latter,
 * and return `undefined` — never `false` — when neither states it. "We don't
 * know" and "closed" are different answers and must not collapse.
 */
function readOpenNow(r: Record<string, unknown>): boolean | undefined {
  const cur = (r.currentOpeningHours as GoogleOpeningHours | undefined)?.openNow
  if (typeof cur === 'boolean') return cur
  const reg = (r.regularOpeningHours as GoogleOpeningHours | undefined)?.openNow
  return typeof reg === 'boolean' ? reg : undefined
}

/** `PRICE_LEVEL_MODERATE` → 2. Unspecified and unknown members yield undefined. */
const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}
function readPriceLevel(r: Record<string, unknown>): number | undefined {
  const raw = r.priceLevel
  return typeof raw === 'string' && raw in PRICE_LEVELS ? PRICE_LEVELS[raw] : undefined
}

/** Provider price band. Only emitted when at least one bound and a currency exist. */
function readPriceRange(r: Record<string, unknown>): { low?: number; high?: number; currency: string } | undefined {
  const pr = r.priceRange as GooglePriceRange | undefined
  if (!pr) return undefined
  const amount = (a?: GooglePriceAmount) => {
    const n = Number(a?.units)
    return Number.isFinite(n) ? n : undefined
  }
  const low = amount(pr.startPrice)
  const high = amount(pr.endPrice)
  const currency = pr.startPrice?.currencyCode || pr.endPrice?.currencyCode
  if ((low === undefined && high === undefined) || !currency) return undefined
  return { ...(low !== undefined ? { low } : {}), ...(high !== undefined ? { high } : {}), currency }
}

function readCoords(r: Record<string, unknown>): { lat: number; lng: number } | undefined {
  const loc = r.location as { latitude?: number; longitude?: number } | undefined
  const lat = loc?.latitude
  const lng = loc?.longitude
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : undefined
}

/**
 * Photo RESOURCE NAMES ("places/ChIJ.../photos/AeZ..."), never URLs.
 *
 * 🚨 These are carved out of the model-facing payload by splitToolResult — the
 * model must never see or write an image reference. They exist so
 * resolvePlacePhotos can skip the legacy Place Details lookup entirely.
 */
function readPhotoNames(r: Record<string, unknown>): string[] | undefined {
  const photos = r.photos as Array<{ name?: string }> | undefined
  if (!Array.isArray(photos)) return undefined
  const names = photos.map(p => p?.name).filter((n): n is string => typeof n === 'string' && n.length > 0)
  return names.length > 0 ? names : undefined
}

/**
 * 🚨 A CALL WE ALREADY KNOW WILL FAIL IS STILL A CALL.
 *
 * MEASURED 2026-09-08: `SearchTextRequest` on this project carries an effective
 * limit of 100/day (Google's own default is 75,000), and once it is spent every
 * place turn still opened a request, waited ~0.5s and threw the answer away
 * before falling through to OSM. That is latency on every turn and, while any
 * allowance remains, a wasted unit of it.
 *
 * So a hard refusal is remembered for a short while and Google is skipped until
 * it expires. Deliberately SHORT and self-healing: this is not a kill switch. A
 * daily quota resets and the onboarding may complete at any time, so the very
 * next turn after the window simply tries again and, on success, the breaker is
 * never armed. Nothing about the OSM fallback, the fields, or the cards changes
 * either way - this only stops paying for a refusal we have already had.
 */
const PLACES_BREAKER_MS = 10 * 60 * 1000
let placesUnavailableUntil = 0

/** Read by tests; also the one place that decides whether to try Google. */
export function googlePlacesLikelyAvailable(now = Date.now()): boolean {
  return now >= placesUnavailableUntil
}

/** Arm the breaker after a refusal Google will keep repeating (quota/permission). */
function notePlacesRefusal(status: number, now = Date.now()): void {
  if (status === 429 || status === 403) placesUnavailableUntil = now + PLACES_BREAKER_MS
}

/** Test seam — the breaker is module state, like the tool cache. */
export function __resetPlacesBreaker(): void {
  placesUnavailableUntil = 0
}

export async function searchPlaces(query: string, location?: string, type?: string, lang = 'vi', locationBias?: { lat: number; lng: number } | null) {
  const cacheKey = placesCacheKey(query, location, type, locationBias, lang)
  const cached = getCache(cacheKey)
  if (cached) {
    console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'searchPlaces', step: 'cache_hit', cacheKey }))
    return cached
  }

  const key = process.env.GOOGLE_PLACES_API_KEY
  console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'searchPlaces', step: 'fn_entry', hasKey: !!key, query, location, placeType: type }))
  let result: unknown = null
  if (key && googlePlacesLikelyAvailable()) {
    try {
      const sq = location ? query + ' ' + location : query
      // Map legacy type values to Places API (New) includedType names
      const typeMap: Record<string, string> = { hotel: 'lodging', cinema: 'movie_theater' }
      const includedType = type ? (typeMap[type] || type) : undefined
      const bodyObj: Record<string, unknown> = { textQuery: sq, languageCode: lang, regionCode: 'VN' }
      if (includedType) bodyObj.includedType = includedType
      if (locationBias) {
        bodyObj.locationBias = {
          circle: { center: { latitude: locationBias.lat, longitude: locationBias.lng }, radius: 5000.0 }
        }
      }
      /**
       * ── FIELD MASK — approved architecture rev 2, Option A ──────────────────
       *
       * 🔑 THE MASK WAS ALREADY BILLED AT ENTERPRISE. `rating`, `userRatingCount`
       * and `websiteUri` are Enterprise-tier fields, and Google bills a Text
       * Search request at the HIGHEST tier present in the mask. Everything added
       * below sits at or under that tier — Pro (`location`, `types`, `photos`) or
       * Enterprise (`regularOpeningHours`, `currentOpeningHours`,
       * `nationalPhoneNumber`, `priceLevel`, `priceRange`) — so the search cost
       * delta is ZERO. Nothing here reaches Enterprise + Atmosphere, which is a
       * separate, unapproved decision (`editorialSummary`, `reviews`).
       *
       * 🚨 `places.photos` returns photo RESOURCE NAMES, not URLs, and it replaces
       * the legacy Place Details lookup in resolvePlacePhotos — that call was
       * billed separately at Places Details Legacy. It was excluded here because
       * the API key is restricted to the legacy Places API; that restriction is
       * an environment problem, and while it stands this whole branch 403s and
       * the OSM fallback answers instead.
       */
      const SEARCH_FIELD_MASK = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.googleMapsUri',
        'places.websiteUri',
        'places.rating',
        'places.userRatingCount',
        'places.regularOpeningHours',
        'places.currentOpeningHours',
        'places.nationalPhoneNumber',
        'places.priceLevel',
        'places.priceRange',
        'places.location',
        'places.types',
        'places.photos',
      ].join(',')
      const resp = await Promise.race([
        fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': SEARCH_FIELD_MASK,
          },
          body: JSON.stringify(bodyObj),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      const d = await (resp as Response).json()
      if ((resp as Response).ok && d.places?.length) {
        const placesData = (d.places as Record<string, unknown>[]).slice(0, 8)
        console.log(JSON.stringify({
          type: 'tappyai_photo_debug', step: 'places_textsearch_new',
          placesCount: d.places.length,
          topName: ((placesData[0]?.displayName as { text?: string })?.text) || null,
        }))

        // B7-A: photos are NOT resolved here any more. The reply names at most 3
        // places (2-3 by prompt rule R1) and the injector enriches at most 3, so
        // resolving all 8 up front discarded roughly five places' worth of
        // billable Places Details / Places Photo / Serper Images calls per
        // search. Resolution moved to applyPlaceEnrichmentStreamFilter, which
        // runs once the reply is known and can ask for exactly the right places
        // (see resolvePlacePhotos in ./common). place_id and website_uri below
        // are what it resolves from.
        result = {
          source: 'Google Maps', count: d.places.length,
          results: placesData.map((r) => {
            const coords = readCoords(r)
            const openingHours = readOpeningHours(r)
            const openNow = readOpenNow(r)
            const priceLevel = readPriceLevel(r)
            const priceRange = readPriceRange(r)
            const photoNames = readPhotoNames(r)
            const types = Array.isArray(r.types) ? (r.types as string[]) : undefined
            const ratingValue = typeof r.rating === 'number' ? r.rating : undefined
            const ratingCount = typeof r.userRatingCount === 'number' ? r.userRatingCount : undefined
            return {
              place_id: r.id as string,
              name: (r.displayName as { text?: string })?.text || '',
              address: r.formattedAddress,
              // The formatted string stays — the prompt, the injector and the
              // ranker's back-parser all read it, and changing it would be an
              // unrelated behavioural change.
              google_rating: ratingValue !== undefined ? messages.places.googleRating(lang, ratingValue, ratingCount) : null,
              // …and the NUMBERS travel beside it. `candidate.ts` currently reads
              // the rating back out of our own formatted string; the canonical
              // entity reads these instead, so the round trip stops here.
              ...(ratingValue !== undefined ? { rating_value: ratingValue } : {}),
              ...(ratingCount !== undefined ? { rating_count: ratingCount } : {}),
              maps_link: (r.googleMapsUri as string | undefined) || ('https://www.google.com/maps/place/?q=place_id:' + r.id),
              ...(r.websiteUri ? { website_uri: r.websiteUri as string } : {}),
              ...(openingHours ? { opening_hours: openingHours } : {}),
              ...(openNow !== undefined ? { open_now: openNow } : {}),
              ...(typeof r.nationalPhoneNumber === 'string' ? { phone: r.nationalPhoneNumber } : {}),
              ...(priceLevel !== undefined ? { price_level: priceLevel } : {}),
              ...(priceRange ? { price_range: priceRange } : {}),
              ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
              ...(types ? { place_types: types } : {}),
              ...(photoNames ? { photo_names: photoNames } : {}),
              ...(coords && locationBias
                ? { distance_km: Math.round(haversineKmLocal(locationBias.lat, locationBias.lng, coords.lat, coords.lng) * 10) / 10 }
                : {}),
            }
          })
        }
      } else {
        console.log(JSON.stringify({ type: 'tappyai_places_debug', apiVersion: 'new', httpStatus: (resp as Response).status, errorMessage: (d.error as { message?: string })?.message || null }))
        notePlacesRefusal((resp as Response).status)
      }
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_places_debug', error: String(e) }))
    }
  }
  if (!result) result = await searchPlacesOSM(query, location, type, locationBias, lang)

  // ===== Gia tham khao tu Serper (an uong / spa / giai tri) =====
  // One classifier, one answer - see `placeDomainFor`, which also records the two
  // measured defects that made it a function rather than three inline regexes.
  const placeDomain = placeDomainFor(query, type)
  const isFood = placeDomain === 'food'
  const isSpa = placeDomain === 'spa'
  const isEntertainment = placeDomain === 'entertainment'
  /**
   * The resolved place domain, carried on the result.
   *
   * 🔑 It is resolved ONCE, above, from the query text and the caller's `type`,
   * and re-deriving it downstream would be a second classifier that could
   * disagree with the one that actually chose the enrichment. One classifier,
   * one answer, carried as data.
   *
   * A place query that matches none of the three (a generic "địa điểm ở Quận 1")
   * stays `place` — a real place with no domain-specific enrichment, not a
   * miscategorised restaurant.
   */
  if (result && typeof result === 'object') {
    (result as Record<string, unknown>)._tappy_place_domain = placeDomain
  }

  /**
   * 🚨🚨 THE RETRIEVAL VERDICT, STAMPED HERE AND NOWHERE ELSE.
   *
   * Computed from the provider's own rows BEFORE any enrichment runs, so nothing added
   * below can turn "found nothing" into something that reads like a find. That ordering is
   * the guarantee, not a convention: the Serper calls in the block underneath fetch price and
   * order SNIPPETS, and snippets are full of venue names. Asked for "spa tốt Hà Nội" the
   * provider returned zero rows, the snippets arrived anyway, and the reply named four spas
   * with addresses and prices that had never been retrieved.
   *
   * DOMAIN-AGNOSTIC BY CONSTRUCTION. It is one line on the shared result of `searchPlaces`,
   * which every place query flows through — food, cafe, spa, entertainment and the generic
   * `place` alike — so there is no per-domain branch to keep in sync, and a sixth domain
   * inherits it for free.
   */
  const placeRows = (result && typeof result === 'object')
    ? (result as { results?: unknown }).results
    : undefined
  const placeSearchEmpty = !Array.isArray(placeRows) || placeRows.length === 0
  if (result && typeof result === 'object') {
    (result as Record<string, unknown>).place_search_status = placeSearchEmpty ? 'empty' : 'has_results'
    if (placeSearchEmpty) {
      // Said in the result itself, because the model reads this and the gate downstream is
      // defence-in-depth rather than the first line of defence. An honest empty answer is
      // still a useful one — offering to widen the search is fine; naming a venue is not.
      (result as Record<string, unknown>).no_results_instruction = messages.places.noResultsInstruction(lang)
    }
  }

  /**
   * 🚨 ENRICHMENT IS SKIPPED ENTIRELY ON AN EMPTY RETRIEVAL.
   *
   * These snippets exist to price and to order FROM the rows above. With no rows there is
   * nothing to price and nothing to order, and handing the model a list of venue-bearing
   * search snippets next to an empty result set is precisely how the fabricated spa prices
   * ("99.000 - 399.000 VND", "massage từ 490.000đ/buổi") got authored. Skipping also keeps
   * `snippetPrices` empty downstream, so the A5 money guard has nothing to license either.
   */
  if (!placeSearchEmpty && (isFood || isSpa || isEntertainment)) {
    try {
      /**
       * 🚨 A BILLED CALL ON EVERY PLACE TURN THAT RETURNED NOTHING.
       *
       * MEASURED across 17 live place turns: this TikTok query ran 17 times and
       * produced 0 attributed links and 0 discovery links. It is one Serper
       * request per turn, every turn, for a result the product almost never got.
       *
       * The capability is NOT removed - `attributeTikTok`, `review_actions` and
       * the `tiktok_verified` rung all stay exactly as they are, and the search
       * still runs whenever the user actually asks about reviews or TikTok. What
       * is removed is paying for it on turns where nobody asked.
       *
       * Deliberately checks the USER'S words, not the domain: "quan cafe view
       * dep" is not a request for video reviews, and "review quan nay" is.
       */
      const wantsReviewContent = /tiktok|review|danh gia|đánh giá|vlog|video|clip|feedback|nhan xet|nhận xét/i
        .test(normalizeVN(query.toLowerCase()) + ' ' + query.toLowerCase())
      const suffix = isFood ? 'gia menu thuc don' : isSpa ? 'gia dich vu bang gia spa massage' : 'gia ve dich vu'
      const [priceResults, orderResults, tiktokResults] = await Promise.all([
        serperSearch(query + ' ' + (location || '') + ' ' + suffix),
        isFood ? serperSearch(query + ' ' + (location || '') + ' (site:shopeefood.vn OR site:food.grab.com OR site:baemin.vn)') : Promise.resolve(null),
        // TikTok review discovery (consultative only, product decision 2026-08-16). Same shape as
        // the order-link search above: a real provider query, whose results are then VALIDATED —
        // nothing here is constructed from the place name, so a place with no coverage simply
        // ends up without a link.
        wantsReviewContent ? serperSearch(query + ' ' + (location || '') + ' review site:tiktok.com') : Promise.resolve(null),
      ])
      if (result && typeof result === 'object') {
        const extra: Record<string, unknown> = {}
        if (priceResults && priceResults.length > 0) {
          /**
           * 🚨 THIS SEARCH IS ABOUT THE AREA, NOT ABOUT ANY RESTAURANT.
           *
           * The query above is `<what the user asked> + <location> + "gia menu
           * thuc don"` — ONE search for the whole batch, exactly like the TikTok
           * query below it. Its results are listicles about a district. Measured
           * 2026-09-09 for "bún bò ở Quận 1": the top result was
           * "Danh sách quán bún bò Quận 1 ngon", and the reply turned it into
           * "Bún Bò Huế Đông Ba — Giá tham khảo khoảng 25.000–50.000 đồng/phần".
           *
           * Both existing provenance axes were satisfied and every guard passed:
           * the price WAS REVIEW_SUPPORTED and it DID come from a retrieved
           * snippet. What nothing recorded was who the snippet was ABOUT.
           *
           * So each snippet is attributed with the same audited matcher the
           * TikTok path uses — a snippet is entity-level only when its own text
           * names exactly ONE place from `results`. Naming two or more is an
           * area fact (a listicle), not a fact about either. `evidence_scope`
           * travels with the data so the guard and the model can both see it.
           */
          const placeRows = (result as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
          const names = Array.isArray(placeRows) ? placeRows.map(r => (r.name as string) || '').filter(Boolean) : []
          const tokens = placeTokensFor(names)
          const scoped = priceResults.map(r => {
            const about = placeNamedBy(r.title, r.snippet, tokens)
            return { ...r, evidence_scope: about ? 'entity' : 'area', ...(about ? { evidence_about: about } : {}) }
          })
          extra.price_search_results = scoped
          extra.price_note = messages.places.priceNote(lang)
          // A5.1: grade the evidence WITH the data. Snippet prices are search-text
          // (REVIEW-level), never a structured/authoritative price — the model reads
          // this and must qualify accordingly (evidence policy block), never FACT.
          // A5.2: and they are AREA-level unless a snippet named one place.
          extra.price_evidence = {
            evidence_type: classifyEvidence('search_snippet'),
            source_type: 'search_snippet',
            evidence_scope: scoped.some(r => r.evidence_scope === 'entity') ? 'entity' : 'area',
          }
        }
        if (isFood) {
          /**
           * 🚨 A DIRECT ORDERING PAGE IS EVIDENCE FOR THE VENUE IT NAMES, AND
           * FOR NO OTHER. Measured 2026-09-09 on "bún bò ở Quận 1": the single
           * direct ShopeeFood link this search returned was
           * "Bún bò Na - Bún Bò Huế - Nguyễn Cảnh Chân", which is not one of the
           * six restaurants that were shown. Handing it to the batch would say
           * "these places deliver" on the strength of a page about a seventh —
           * the same defect `attributeTikTok` exists to stop, in a new costume.
           */
          const directOrder = (orderResults || []).filter(r => isDirectFoodOrderLink(r.link))
          if (directOrder.length > 0) {
            const orderRows = (result as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
            const orderNames = Array.isArray(orderRows) ? orderRows.map(r => (r.name as string) || '').filter(Boolean) : []
            const orderTokens = placeTokensFor(orderNames)
            extra.order_search_results = directOrder.map(r => {
              const about = placeNamedBy(r.title, r.snippet, orderTokens)
              return { ...r, evidence_scope: about ? 'entity' : 'area', ...(about ? { evidence_about: about } : {}) }
            })
          }
          // Inject per-place search links using the exact restaurant name on each platform
          const places = (result as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
          if (Array.isArray(places)) {
            // The TikTok query is "<what the user asked> review site:tiktok.com" — ONE search for
            // the whole batch — so a result is only this restaurant's review if its own title says
            // so. `attributeTikTok` decides that from the text; anything it cannot tie to a place
            // stays a batch-level discovery link and is never captioned as somebody's review.
            //
            // 🚨 This replaces `i === 0`, which handed the first URL to the first row. Measured on
            // production for "bún bò huế phú nhuận": 8 places, 6 videos, none of the six titles
            // naming any of the eight — so the card that showed "Review TikTok" was showing a video
            // about a different restaurant.
            const placeNames = places.map(p => (p.name as string) || '').filter(Boolean)
            const tiktok = attributeTikTok(tiktokResults, placeNames)
            if (tiktok.batch) extra.tiktok_discovery_url = tiktok.batch
            extra.results = places.map((place) => {
              const own = tiktok.perPlace.get((place.name as string) || '')
              const tiktokFields = own
                ? { tiktok_review_url: own, has_tiktok_review: true }
                : { has_tiktok_review: false }
              // Phase A A11 — structural review/social action data. The LLM
              // reads `review_actions` and references URLs; it never invents.
              // Priority order enforced in `reviewActionsForPlace`.
              const reviewActions = reviewActionsForPlace({
                name: place.name as string || '',
                place_id: place.place_id as string | undefined,
                maps_link: place.maps_link as string | undefined,
                website_uri: place.website_uri as string | undefined,
                tiktok_review_url: tiktokFields.has_tiktok_review ? (own as string) : undefined,
                has_tiktok_review: tiktokFields.has_tiktok_review,
              })
              return {
                ...place,
                order_links: buildFoodOrderLinks(
                  place.name as string || '',
                  place.address as string | undefined,
                  location
                ),
                ...tiktokFields,
                review_actions: reviewActions,
              }
            })
          }
        } else if (isSpa) {
          const places = (result as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
          if (Array.isArray(places)) {
            extra.results = places.map(place => ({
              ...place,
              platform_links: buildSpaLinks(
                place.name as string || '',
                place.website_uri as string | undefined,
                place.maps_link as string | undefined
              ),
              review_actions: reviewActionsForPlace({
                name: place.name as string || '',
                place_id: place.place_id as string | undefined,
                maps_link: place.maps_link as string | undefined,
                website_uri: place.website_uri as string | undefined,
              }),
            }))
          }
        } else if (isEntertainment) {
          const places = (result as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
          if (Array.isArray(places)) {
            extra.results = places.map(place => ({
              ...place,
              platform_links: buildEntertainmentLinks(
                place.name as string || '',
                place.website_uri as string | undefined,
                place.maps_link as string | undefined
              ),
              review_actions: reviewActionsForPlace({
                name: place.name as string || '',
                place_id: place.place_id as string | undefined,
                maps_link: place.maps_link as string | undefined,
                website_uri: place.website_uri as string | undefined,
              }),
            }))
          }
        }
        if (Object.keys(extra).length > 0) {
          result = { ...(result as Record<string, unknown>), ...extra }
        }
      }
    } catch { /* bo qua, van tra ve danh sach dia diem */ }
  }

  // Inject TappyAI community ratings (thu that nhanh, khong block ket qua chinh)
  if (result && typeof result === 'object') {
    const resultObj = result as Record<string, unknown>
    const places = resultObj.results as Array<Record<string, unknown>> | undefined
    if (Array.isArray(places)) {
      const placeIds = places.filter(r => r.place_id).map(r => r.place_id as string)
      if (placeIds.length > 0) {
        try {
          const supabaseR = createClient()
          const { data: ratingRows } = await supabaseR
            .from('reviews')
            .select('place_id, rating')
            .in('place_id', placeIds)
            .eq('is_hidden', false)
          if (ratingRows && ratingRows.length > 0) {
            const rMap = new Map<string, { sum: number; count: number }>()
            for (const row of ratingRows) {
              const e = rMap.get(row.place_id) || { sum: 0, count: 0 }
              e.sum += row.rating; e.count += 1
              rMap.set(row.place_id, e)
            }
            result = {
              ...resultObj,
              results: places.map(r => {
                if (!r.place_id) return r
                const s = rMap.get(r.place_id as string)
                if (!s) return r
                const avg = Math.round((s.sum / s.count) * 10) / 10
                return { ...r, tappy_rating: messages.places.rating(lang, avg, s.count) }
              }),
            }
          }
        } catch { /* bo qua, khong anh huong ket qua chinh */ }
      }
    }
  }

  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut, dia diem it thay doi
  return result
}
