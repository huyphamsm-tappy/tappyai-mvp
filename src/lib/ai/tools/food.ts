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
import { withSingleFlight } from './common'
import type { PlacesBudget } from './placesBudget'
import { osmCategoryFor, osmUnionFor, placeDomainFor } from './osmCategory'
import { cityForName, cityInText, isSameCity, type VietnamCity } from './vietnamCities'
import { usableOverpass } from './overpassResponse'
import { classifyEvidence } from '@/lib/ai/consultative/evidenceProvenance'
import { serperPlaces, serperPlaceToRow } from './serperPlaces'
import { serperMapsQuery } from './serperLocation'
import { placesProvider } from './placesProvider'
import { SERPER_PLACES_SOURCE } from '@/lib/recommendation/buildEntity'

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

/**
 * Where a place search is allowed to look — BUG-011.
 *
 * ============================================================================
 * THE DEFECT THIS EXISTS TO CLOSE
 * ============================================================================
 * Production, verified: the user asked about **Quy Nhơn** while standing in Ho Chi Minh City, and
 * the reply recommended "Công viên bờ sông Sài Gòn (~0.9km)". Nothing hallucinated it — the OSM
 * search had replaced the requested destination with the caller's GPS and returned a real Saigon
 * park, with a real distance measured from the user. The ranker then scored it 0.91 on proximity
 * and promoted it to the recommendation.
 *
 * THE RULE: a destination the caller NAMED is never silently replaced by their current position.
 * GPS answers "near me"; it does not answer "in Quy Nhơn".
 *
 * `remote` is decided with `isSameCity` — the repository's existing, measured answer to "is this
 * the same place" (25 km, see vietnamCities.ts). Using the SAME predicate for the search centre
 * (D1) and the output guard (D3) keeps them in lockstep: the guard can never reject a result that
 * the centre choice would legitimately have produced.
 *
 * Resolution reads the ORIGINAL `location` argument, never `searchPlacesOSM`'s `'Ha Noi'` default —
 * resolving the default would make every location-less "near me" search look like a Hanoi trip.
 */
export function resolveSearchScope(
  location: string | undefined,
  locationBias: { lat: number; lng: number } | null | undefined,
): { destination: VietnamCity | null; remote: boolean } {
  // Exact alias first, then a phrase match, mirroring how weatherPlaceResolution orders the two.
  const destination = location ? (cityForName(location) ?? cityInText(location)) : null
  const remote = !!destination && !!locationBias
    && !isSameCity(destination.coords, [locationBias.lat, locationBias.lng])
  return { destination, remote }
}

/**
 * Does a result belong to the requested destination? BUG-011 output guard (D3).
 *
 * Deliberately asymmetric, and that asymmetry is the whole design:
 *   • coordinates present   → keep only what is within CITY_MATCH_RADIUS_KM of the destination.
 *   • address resolves to a DIFFERENT known city → reject.
 *   • nothing resolvable    → KEEP.
 *
 * The last line is the one that matters. "I cannot tell which city this is" must never become
 * "this is the wrong city": inventing a classification would quietly drop legitimate places whose
 * OSM tags happen to carry no address, which is most of them.
 */
export function belongsToDestination(
  destination: VietnamCity | null,
  coords: readonly [number, number] | null,
  address: string | null | undefined,
): boolean {
  if (!destination) return true
  if (coords) return isSameCity(destination.coords, coords)
  const addressCity = cityInText(address)
  if (!addressCity) return true
  return addressCity.query === destination.query
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
    // ── BUG-011 (D1): a NAMED destination outranks the caller's GPS ───────────
    // `remote` is true only when the caller named a city we know AND they are not in it. Every
    // other shape — no location, an unresolvable location, or a location that IS the city they
    // are standing in — leaves the branches below exactly as they shipped. It resolves through
    // the SAME shared city table as `city` above, so the two can never disagree about which
    // cities exist.
    const { destination, remote: remoteDestination } = resolveSearchScope(location, locationBias)
    let lat: number
    let lon: number
    let searchRadius: number
    // Did we actually establish WHERE to search, or only assume it?
    let located = false
    /** True when the centre IS the user's position. Gates `distance_km` below (D2). */
    let centeredOnUser = false
    if (locationBias && !remoteDestination) {
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
      centeredOnUser = true
    } else if (remoteDestination && destination) {
      // The user is asking about somewhere else. Centre on the destination and drop the GPS
      // entirely — a bias toward where they happen to be standing is what produced a Saigon park
      // for a Quy Nhơn question. Only the centre moves: the radius is the same 1500 every other
      // branch settled on, so the measured Overpass budget is untouched.
      located = true
      lat = destination.coords[0]
      lon = destination.coords[1]
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
    // ── BUG-011 (D3): geographic output guard ────────────────────────────────
    // Applied BEFORE the slice, so dropping an out-of-scope row lets an in-scope one take its
    // place instead of shortening the list. Inert when no destination resolved, and a no-op on a
    // nearby search (a 2km radius around the user is trivially inside their own city).
    const inScope = ((overpassData.elements || []) as El[]).filter(el => {
      const la = el.lat ?? el.center?.lat
      const lo = el.lon ?? el.center?.lon
      return belongsToDestination(
        destination,
        typeof la === 'number' && typeof lo === 'number' ? [la, lo] : null,
        null,
      )
    })
    const baseResults = inScope.slice(0, 10).map(el => {
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
        //
        // BUG-011 (D2): and ONLY when the search was actually centred on the user. On a remote
        // destination search this used to emit a GPS-relative number that promptBuilder renders as
        // "cách bạn ~0.9km" — the exact sentence that shipped a Saigon park as a Quy Nhơn
        // recommendation. There is no correct distance to report for a place the user is not near,
        // so the field is omitted; the prompt only mentions distance when the field exists, and
        // the ranker only scores it when present, so both degrade to silence rather than to a lie.
        ...((centeredOnUser && locationBias && elat && elon) ? { distance_km: Math.round(haversineKmLocal(locationBias.lat, locationBias.lng, elat, elon) * 10) / 10 } : {}),
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
 *
 * 🚨 AND THE ONE THING IT MAY NEVER COST US: THE RECOVERY CALL.
 *
 * The two refusals are not the same event, so they no longer arm the same way.
 *
 *   403 — permission / Maps Platform onboarding. A project CONFIGURATION state.
 *         It cannot change between two turns, so re-asking inside the window
 *         buys nothing: it arms on the first refusal, exactly as before.
 *
 *   429 — quota. The allowance resets on GOOGLE's clock, not ours, and with an
 *         effective 100/day the request right after that reset is the single
 *         most valuable one we make. Arming on the first 429 would close the
 *         door for ten minutes precisely when it had just been unlocked — so
 *         the first 429 records the refusal and nothing more, and the VERY NEXT
 *         call still reaches Google. Only a SECOND consecutive 429 — evidence
 *         that the allowance really is still spent — arms the breaker.
 *
 * The cost of that guarantee is exactly one extra refused request per window,
 * and what it buys is that a reset is never missed by up to ten minutes.
 */
const PLACES_BREAKER_MS = 10 * 60 * 1000
let placesUnavailableUntil = 0
/** Consecutive 429s with no Google answer in between. The first one does not arm. */
let placesQuotaRefusals = 0

/** Read by tests; also the one place that decides whether to try Google. */
export function googlePlacesLikelyAvailable(now = Date.now()): boolean {
  return now >= placesUnavailableUntil
}

/** Arm the breaker after a refusal Google will keep repeating (quota/permission). */
function notePlacesRefusal(status: number, now = Date.now()): void {
  // Configuration, not allowance: nothing about it can change inside the window.
  if (status === 403) { placesUnavailableUntil = now + PLACES_BREAKER_MS; return }
  // Allowance: the next call is the recovery call and must not be sacrificed.
  if (status === 429 && ++placesQuotaRefusals >= 2) placesUnavailableUntil = now + PLACES_BREAKER_MS
}

/** Google answered — the allowance is back, so the refusal streak starts over. */
function notePlacesSuccess(): void {
  placesQuotaRefusals = 0
}

/** Test seam — the breaker is module state, like the tool cache. */
export function __resetPlacesBreaker(): void {
  placesUnavailableUntil = 0
  placesQuotaRefusals = 0
}

/**
 * Serper `/maps` — the PRIMARY structured place source for Vietnam.
 *
 * 🚨 WHY IT SITS ABOVE OSM AND BELOW GOOGLE. Google Places is the richest source
 * when the key works; in this product's environment it 403s and every turn fell
 * to OSM, which has no rating, no review count and no price at all. Measured
 * 2026-09-10, `/maps` answers the same question with rating, ratingCount,
 * priceLevel, phone, a published week of hours, website, category and a
 * thumbnail — for FEWER credits than the `/search` + `/images` combination it
 * replaces. OSM stays underneath as the genuine no-results fallback, because
 * `/places` was measured returning zero rows for a narrow query.
 *
 * The BUG-011 contract is enforced here exactly as on the other two branches:
 * the search is centred with `ll` (the only targeting that works — a `location`
 * string returned zero rows), out-of-scope rows are rejected by coordinates
 * BEFORE the slice, and `distance_km` exists only when the centre was the user.
 */
async function searchPlacesSerper(
  query: string,
  location: string | undefined,
  lang: string,
  locationBias: { lat: number; lng: number } | null | undefined,
  scope: { destination: VietnamCity | null; remote: boolean },
  priceRetry = true,
): Promise<Record<string, unknown> | null> {
  const { destination, remote } = scope
  const centeredOnUser = !!locationBias && !remote
  const centre = centeredOnUser
    ? { lat: locationBias!.lat, lng: locationBias!.lng }
    : destination
      ? { lat: destination.coords[0], lng: destination.coords[1] }
      : locationBias
        ? { lat: locationBias.lat, lng: locationBias.lng }
        : null

  // The place string is normalised (city alias → Maps name, no commas) so `/maps` answers with
  // `priceLevel` consistently — see serperLocation.ts for the measurement. Serper only.
  const sq = serperMapsQuery(query, location)
  const records = await serperPlaces(sq, centre, { priceRetry })
  if (!records || records.length === 0) return null

  const rows = records
    .map(rec => serperPlaceToRow(rec, {
      ratingText: (r, c) => messages.places.googleRating(lang, r, c),
      userAt: centeredOnUser ? locationBias : null,
      distanceKm: haversineKmLocal,
    }))
    // BUG-011 (D3), applied BEFORE the slice so an out-of-scope row does not
    // consume a result slot. Every `/maps` row carries coordinates, so the
    // judgement here is exact rather than address-shaped.
    .filter(r => belongsToDestination(
      destination,
      typeof r.lat === 'number' && typeof r.lng === 'number' ? [r.lat as number, r.lng as number] : null,
      typeof r.address === 'string' ? r.address : undefined,
    ))

  if (rows.length === 0) return null
  console.log(JSON.stringify({
    type: 'tappyai_places_debug', provider: 'serper_maps',
    returned: records.length, inScope: rows.length,
    destination: destination?.query ?? null, centeredOnUser,
  }))
  return {
    source: SERPER_PLACES_SOURCE,
    count: rows.length,
    location: location ?? '',
    results: rows.slice(0, 10),
    google_maps_search: 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + (location ?? '')),
  }
}


/**
 * The retrieval itself. Reached only through [searchPlaces], which owns the cache, the retrieval
 * budget and in-flight deduplication — this function owns the Google path, the field-mask readers
 * above, the availability breaker and the OSM fallback, and nothing else.
 */
async function searchPlacesUncached(
  query: string, location?: string, type?: string, lang = 'vi',
  locationBias?: { lat: number; lng: number } | null,
  priceRetry = true,
): Promise<{ result: unknown; googleOk: boolean }> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  // BUG-011: resolved once here and used by BOTH providers, so the Google call and the OSM
  // fallback can never disagree about which city this search is for.
  const { destination, remote: remoteDestination } = resolveSearchScope(location, locationBias)
  console.log(JSON.stringify({
    type: 'tappyai_tool_called', tool: 'searchPlaces', step: 'fn_entry', hasKey: !!key, query, location, placeType: type,
    // Operational only — a city name we resolved, never user text.
    destination: destination?.query ?? null, remoteDestination,
    // A5 (2026-09-20): the GPS the search is centred on, to TWO decimals (≈1 km — a district, never
    // a doorstep), and whether the search actually centred on it (`centeredOnUser`, the same rule
    // the provider applies: a bias with no remote destination). The UAT that found the emulator
    // in Mountain View needed exactly this line and had to read the provider debug for it.
    gps: locationBias ? { lat: Math.round(locationBias.lat * 100) / 100, lng: Math.round(locationBias.lng * 100) / 100 } : null,
    centeredOnUser: !!locationBias && !remoteDestination,
  }))
  let result: unknown = null
  /**
   * True only when Google returned usable, in-scope rows. It is what decides whether the answer is
   * worth caching: an OSM fallback answers a different (weaker) question, and a 403/429/timeout
   * answers none at all.
   */
  let googleOk = false
  // 🚨 THE PROVIDER IS A SETTING, NOT A SECRET'S PRESENCE (placesProvider.ts, 2026-09-19): Google
  // runs only under PLACES_PROVIDER=google. With the default (serper) a valid key changes nothing.
  const provider = placesProvider()
  console.log(JSON.stringify({ type: 'tappyai_places_provider', provider, hasKey: !!key }))
  // The breaker is asked here, inside the uncached path: a refusal Google will repeat for the next
  // ten minutes must not be paid for again, and the wrapper above has no business knowing why.
  if (provider === 'google' && key && googlePlacesLikelyAvailable()) {
    try {
      const sq = location ? query + ' ' + location : query
      // Map legacy type values to Places API (New) includedType names
      const typeMap: Record<string, string> = { hotel: 'lodging', cinema: 'movie_theater' }
      const includedType = type ? (typeMap[type] || type) : undefined
      const bodyObj: Record<string, unknown> = { textQuery: sq, languageCode: lang, regionCode: 'VN' }
      if (includedType) bodyObj.includedType = includedType
      // BUG-011 (D1): the bias is dropped for a remote destination. `textQuery` already carries
      // the city name, and `locationBias` is only a SOFT hint — Google is free to honour it, which
      // is how a "công viên Quy Nhơn" query could still surface Saigon parks for a caller in
      // Saigon. Nearby searches are untouched: without a resolved remote destination the bias is
      // applied exactly as before.
      if (locationBias && !remoteDestination) {
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
      // An answer — of any shape — proves the allowance is not spent.
      if ((resp as Response).ok) notePlacesSuccess()
      // ── BUG-011 (D3): geographic output guard, address-based ───────────────
      // The field mask does not request coordinates, so scope is judged from `formattedAddress`
      // via the same city resolver the rest of the repo uses. Reject only when the address
      // resolves to a DIFFERENT known city; an address that resolves to nothing is KEPT, because
      // "unrecognised" must never be treated as "wrong".
      //
      // Filtered BEFORE the slice, so an out-of-scope row does not consume one of the 8 places.
      // If nothing survives, `result` stays null and the OSM fallback below runs — now correctly
      // centred on the destination — instead of returning an empty set for a real city.
      const inScope = ((resp as Response).ok && Array.isArray(d.places))
        ? (d.places as Record<string, unknown>[]).filter(r =>
          belongsToDestination(destination, null, r.formattedAddress as string | undefined))
        : []
      if (inScope.length) {
        googleOk = true
        const placesData = inScope.slice(0, 8)
        console.log(JSON.stringify({
          type: 'tappyai_photo_debug', step: 'places_textsearch_new',
          // Both numbers: what the provider returned, and what survived the destination guard.
          // A large gap is the signal that a search was being pulled out of scope.
          placesCount: (d.places as unknown[]).length,
          inScopeCount: inScope.length,
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
          // The count the model reads must describe the rows it was GIVEN, not the rows the
          // provider offered before the destination guard ran (main #248, kept in the merge).
          source: 'Google Maps', count: inScope.length,
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
              // The SAME two numbers under the keys `toolResultSplit` carves for the place card
              // (`rating` / `review_count`). Two readers, two names, one source: the canonical
              // entity reads `rating_value`/`rating_count`, the card reads these, and neither
              // parses them back out of the localized `google_rating` sentence. Absent stays absent.
              ...(ratingValue !== undefined ? { rating: ratingValue } : {}),
              ...(ratingCount !== undefined ? { review_count: ratingCount } : {}),
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
              // BUG-011 (D2), mirrored on the Google branch. `distance_km` means ONE thing:
              // how far from YOU. This branch gained the field after 3fade82 was written, so
              // it never inherited the gate — and on a remote destination it would have
              // measured a Da Nang hotel from the user's Saigon GPS and reported ~600km as if
              // it were a proximity signal. Absent beats measured-from-the-wrong-origin.
              ...(coords && locationBias && !remoteDestination
                ? { distance_km: Math.round(haversineKmLocal(locationBias.lat, locationBias.lng, coords.lat, coords.lng) * 10) / 10 }
                : {}),
            }
          })
        }
      } else {
        const status = (resp as Response).status
        console.log(JSON.stringify({
          type: 'tappyai_places_debug', apiVersion: 'new', httpStatus: status,
          // Named so quota exhaustion is distinguishable from a key problem at a glance.
          outcome: status === 429 ? 'quota_exhausted' : status === 403 ? 'permission_denied' : 'http_error',
          errorMessage: (d.error as { message?: string })?.message || null,
        }))
        notePlacesRefusal(status)
      }
    } catch (e) {
      const msg = String(e)
      console.log(JSON.stringify({
        type: 'tappyai_places_debug',
        outcome: msg.includes('timeout') ? 'timeout' : 'exception',
        error: msg,
      }))
    }
  }
  /**
   * 🔑 SERPER `/maps` BEFORE OSM, AND BOTH AFTER GOOGLE.
   *
   * A place turn now degrades through three real providers instead of two, and
   * each step down loses information rather than gaining a fabrication. OSM is
   * reached only when the two structured sources genuinely returned nothing.
   *
   * A Serper answer is a STRUCTURED answer (rating, count, band, hours) — it is cached
   * exactly like a Google one (`googleOk` below reads as "a structured provider answered";
   * see the wrapper). Only the OSM fallback and failures stay uncached.
   */
  if (!result && provider !== 'osm') {
    result = await searchPlacesSerper(query, location, lang, locationBias, { destination, remote: remoteDestination }, priceRetry)
    if (result) googleOk = true
  }
  if (!result) {
    console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'osm_fallback_used' }))
    result = await searchPlacesOSM(query, location, type, locationBias, lang)
  }

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
       * 🚨 THE AREA-TARGETED TIKTOK SEARCH IS GONE FROM HERE, AND SO IS THE GATE
       * THAT TRIED TO MAKE IT AFFORDABLE.
       *
       * What used to run: `"<user query> <location> review site:tiktok.com"` —
       * one search about a DISTRICT, whose results `attributeTikTok` then tried
       * to tie to a specific venue. It produced 0 attributed links across 17 live
       * turns, and the response was a `wantsReviewContent` gate that stopped
       * paying for it.
       *
       * 🔑 THE MEASUREMENT WAS RIGHT AND THE DIAGNOSIS WAS WRONG. Re-measured
       * 2026-09-10, that same area query returns EIGHT valid TikTok posts —
       * "13 Quán Bún Bò Ngon Nhất Sài Gòn", "Top 5 Quán Bún Bò", a review of a
       * different restaurant. Retrieval always worked; an area question simply
       * cannot yield entity evidence, and the attributor was right to refuse it.
       *
       * So the search moved rather than shrank. `tiktokEnrichment` asks about the
       * venues that SURVIVED ADMISSION, batched into one request — the same
       * single search per turn this used to cost, now attributable. See
       * `lib/links/tiktokEnrichment.ts` for the measured comparison.
       */
      /**
       * 🚨 THE PRICE SNIPPET SEARCH RAN ON EVERY FOOD/SPA/ENTERTAINMENT TURN,
       * AND MOST TURNS DID NOT ASK ABOUT PRICE.
       *
       * It is one billed `/search` per turn whose entire yield is AREA-level
       * prose the guards then refuse to attach to any venue — measured
       * 2026-09-10: 18 items retrieved across three domains, 18 of them `area`,
       * 0 reaching an entity. Meanwhile Serper `/maps` now carries the
       * provider's OWN band (`priceLevel`, "1-100.000 ₫") on the row itself, at
       * no extra call, entity-attributed by construction.
       *
       * So the snippet search stops being the default and becomes what the
       * TikTok gate already is: paid for when the user actually asked. A price
       * question still gets the deeper search; "quán bún bò ngon" gets the band
       * that came free with the place record.
       *
       * Deliberately reads the USER'S words, not the domain — same reasoning,
       * same shape as `wantsReviewContent` below.
       */
      const wantsPriceDetail = /gia|giá|bao nhieu|bao nhiêu|re |rẻ |dat |đắt |chi phi|chi phí|menu|thuc don|thực đơn|bang gia|bảng giá|budget|price|cost|combo|khuyen mai|khuyến mãi/i
        .test(normalizeVN(query.toLowerCase()) + ' ' + query.toLowerCase())
      const suffix = isFood ? 'gia menu thuc don' : isSpa ? 'gia dich vu bang gia spa massage' : 'gia ve dich vu'
      /**
       * Item 5 (2026-09-19): the order-page search ("… site:shopeefood.vn OR site:food.grab.com OR
       * site:baemin.vn", one credit on EVERY food turn) is no longer issued. Measured over 30 food
       * turns / 230 food cards (2026-09-18 + 19): not one card received a direct order page from
       * it — the results never attributed to a retrieved venue — and the card's order action is
       * the GrabFood search built from the name. `order_search_results` stays absent; every reader
       * of it already handles absence.
       */
      const [priceResults, orderResults, tiktokResults] = await Promise.all([
        wantsPriceDetail ? serperSearch(query + ' ' + (location || '') + ' ' + suffix) : Promise.resolve(null),
        Promise.resolve(null as Awaited<ReturnType<typeof serperSearch>> | null),
        // TikTok review discovery (consultative only, product decision 2026-08-16). Same shape as
        // the order-link search above: a real provider query, whose results are then VALIDATED —
        // nothing here is constructed from the place name, so a place with no coverage simply
        // ends up without a link.
        Promise.resolve(null),
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

  return { result, googleOk }
}

/**
 * Places retrieval, with the three protections that stand between one conversation and the whole
 * project's daily SearchText quota.
 *
 * 1. CACHE — unchanged: same normalized key, 30 minutes.
 * 2. SINGLE-FLIGHT — concurrent callers on one key share one upstream request.
 * 3. BUDGET — a turn may retrieve a bounded number of distinct intents; see [PlacesBudget].
 *
 * Only a GOOGLE answer is cached. An OSM fallback is a weaker answer to a different question, and
 * caching it under the Google key meant a single 403 poisoned that query for thirty minutes — so
 * the first request after quota recovered still got the fallback. Failures are never cached at all.
 */
export async function searchPlaces(
  query: string, location?: string, type?: string, lang = 'vi',
  locationBias?: { lat: number; lng: number } | null,
  budget?: PlacesBudget,
  opts: {
    /** Item 5: pay the `/maps` price-band retry only when price is part of this decision. */
    priceRetry?: boolean
  } = {},
) {
  const cacheKey = placesCacheKey(query, location, type, locationBias, lang)
  const cached = getCache(cacheKey)
  if (cached) {
    console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'cache_hit', cacheKey }))
    return cached
  }

  return withSingleFlight(cacheKey, async () => {
    // A flight that finished while this one waited has already filled the cache.
    const fresh = getCache(cacheKey)
    if (fresh) {
      console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'cache_hit_after_join', cacheKey }))
      return fresh
    }

    if (budget) {
      const verdict = budget.claim(type, location)
      if (!verdict.allowed) {
        console.log(JSON.stringify({
          type: 'tappyai_places_budget', step: 'blocked', reason: verdict.reason,
          used: budget.used, limit: budget.limit, placeType: type ?? null,
        }))
        // No search, and nothing invented to stand in for one. The turn answers from its prose and
        // from whatever it already retrieved — a thinner answer, never a fabricated one.
        return {
          source: 'budget', count: 0, results: [],
          note: messages.places.searchOnMaps(lang, 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + (location || ''))),
        }
      }
    }

    console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'provider_attempt', provider: placesProvider(), placeType: type ?? null }))
    const { result, googleOk } = await searchPlacesUncached(query, location, type, lang, locationBias, opts.priceRetry !== false)
    if (googleOk) {
      setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut, dia diem it thay doi
      console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'google_ok_cached' }))
    } else {
      console.log(JSON.stringify({ type: 'tappyai_places_budget', step: 'not_cached', reason: 'no_google_result' }))
    }
    return result
  })
}
