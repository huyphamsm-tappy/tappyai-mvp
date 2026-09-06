import { getCache, setCache, serperSearch } from './common'
import { normalizeVN } from '@/lib/ai/intent'
import { createClient } from '@/lib/supabase/server'
import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { attributeTikTok } from '@/lib/links/tiktokAttribution'
import { buildSpaLinks } from '@/lib/platformLinks/spa'
import { buildEntertainmentLinks } from '@/lib/platformLinks/entertainment'
import { reviewActionsForPlace } from '@/lib/ai/consultative/reviewAction'
import { messages, isVi } from '@/lib/ai/messages'
import { detectFoodConstraints, osmFilterFor, unmetConstraintNote } from '@/lib/ai/foodConstraints'
import { newsCacheKey, placesCacheKey } from './cacheKeys'
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
  const loc = location || 'Ha Noi'
  const googleMapsUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + loc)
  try {
    const cityCoords: Record<string, [number, number]> = {
      'ha noi': [21.0285, 105.8542], 'hanoi': [21.0285, 105.8542], 'hn': [21.0285, 105.8542],
      'ho chi minh': [10.7769, 106.7009], 'hcm': [10.7769, 106.7009], 'saigon': [10.7769, 106.7009], 'sai gon': [10.7769, 106.7009],
      'da nang': [16.0544, 108.2022], 'danang': [16.0544, 108.2022],
      'hue': [16.4637, 107.5909], 'can tho': [10.0452, 105.7469],
      'hai phong': [20.8449, 106.6881], 'nha trang': [12.2388, 109.1967],
      'da lat': [11.9404, 108.4583], 'vung tau': [10.3460, 107.0843],
      'hoi an': [15.8801, 108.3380],
    }
    // normalizeVN strips Vietnamese diacritics — without this, real user input like
    // "Hà Nội"/"Hoàn Kiếm Hà Nội" never matches the ASCII-only keys below, silently
    // falling through to slower Nominatim geocoding and skipping the dense-metro radius.
    const locKey = normalizeVN(loc.toLowerCase())
    const preset = Object.entries(cityCoords).find(([k]) => locKey.includes(k))
    // Dense metro search radius: a 5km amenity radius times out against public Overpass
    // mirrors in Hanoi/HCMC (measured: 504 after 12.7s at 5km vs 0.98s at 1.5km, same query).
    // Other cities/locations are less venue-dense — keep the larger 5km radius there.
    const DENSE_METRO_KEYS = new Set(['ha noi', 'hanoi', 'hn', 'ho chi minh', 'hcm', 'saigon', 'sai gon'])
    let lat: number
    let lon: number
    let searchRadius: number
    if (locationBias) {
      // Real device GPS → search around the user's ACTUAL position with a tight
      // "right here, right now" radius (MFS 3.7 Nearby). Skip geocoding a city string;
      // the precise coords are what "gần đây" actually means.
      lat = locationBias.lat
      lon = locationBias.lng
      searchRadius = 2000
    } else {
      lat = preset ? preset[1][0] : 21.0285
      lon = preset ? preset[1][1] : 105.8542
      searchRadius = preset && DENSE_METRO_KEYS.has(preset[0]) ? 1500 : 5000
      if (!preset) {
        try {
          const geoResp = await Promise.race([
            fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(loc + ' Vietnam') + '&format=json&limit=1', {
              headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
          ])
          const geoData = await (geoResp as Response).json()
          if (geoData[0]) { lat = parseFloat(geoData[0].lat); lon = parseFloat(geoData[0].lon) }
        } catch { /* use default */ }
      }
    }
    const ql = query.toLowerCase()
    // OSM tag key differs by category. Hotels are tagged tourism=hotel, NOT amenity=hotel —
    // querying amenity=hotel returned 0 rows every time (verified: amenity=hotel→0 vs
    // tourism=hotel→60 at Nha Trang), so the OSM hotel_list was silently always empty.
    const qn = normalizeVN(ql)
    let osmKey = 'amenity'
    let osmValue = 'restaurant'
    let osmOp = '=' // '~' for a regex alternation (attractions span several tourism subtypes)
    // Attractions are tagged tourism=attraction/museum/viewpoint/... — NOT an amenity.
    // 'artwork' deliberately excluded (heavily mistagged in VN OSM data).
    const setAttraction = () => { osmKey = 'tourism'; osmValue = 'attraction|museum|viewpoint|theme_park|zoo|gallery'; osmOp = '~' }
    // An explicit type from the tool call is authoritative over query-keyword guessing —
    // the model chose it deliberately (e.g. type=attraction even if the query is a place name).
    if (type === 'attraction') setAttraction()
    else if (type === 'hotel') { osmKey = 'tourism'; osmValue = 'hotel' }
    else if (type && ['cafe', 'spa', 'bar', 'gym', 'cinema', 'restaurant'].includes(type)) osmValue = type
    else if (ql.match(/cafe|ca phe|coffee/)) osmValue = 'cafe'
    else if (ql.match(/spa|massage/)) osmValue = 'spa'
    else if (ql.match(/hotel|khach san|resort/)) { osmKey = 'tourism'; osmValue = 'hotel' }
    // Without this branch, "diem tham quan Da Nang" fell through to the restaurant default.
    else if (qn.match(/tham quan|thang canh|diem du lich|diem den|danh lam|bao tang|khu du lich|sightsee|attraction|museum/)) setAttraction()
    else if (ql.match(/bar|pub/)) osmValue = 'bar'
    else if (ql.match(/gym|fitness/)) osmValue = 'gym'
    else if (ql.match(/cinema|phim|rap/)) osmValue = 'cinema'
    else if (ql.match(/benh vien|hospital|clinic/)) osmValue = 'hospital'
    else if (ql.match(/pharmacy|thuoc/)) osmValue = 'pharmacy'
    else if (ql.match(/atm|ngan hang|bank/)) osmValue = 'bank'
    const amenity = osmOp === '~' ? 'attraction' : osmValue

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
    const sel = (extra: string) =>
      'node["' + osmKey + '"' + osmOp + '"' + osmValue + '"]["name"]' + extra + '(around:' + searchRadius + ',' + lat + ',' + lon + ');' +
      'way["' + osmKey + '"' + osmOp + '"' + osmValue + '"]["name"]' + extra + '(around:' + searchRadius + ',' + lat + ',' + lon + ');'
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
        if ((resp as Response).ok) { overpassData = await (resp as Response).json(); break }
      } catch { continue }
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
          if ((resp as Response).ok) { overpassData = await (resp as Response).json(); break }
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
      return {
        name: tags['name:vi'] || tags.name || '',
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || messages.places.seeMap(lang),
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
  if (key) {
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
      }
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_places_debug', error: String(e) }))
    }
  }
  if (!result) result = await searchPlacesOSM(query, location, type, locationBias, lang)

  // ===== Gia tham khao tu Serper (an uong / spa / giai tri) =====
  const qNorm = normalizeVN(query.toLowerCase())
  const isFood = type === 'restaurant' || type === 'cafe' || /nha hang|quan an|an gi|an ngon|mon an|thuc don|\bcafe\b|ca phe|coffee|quan nhau|bun|pho|com/.test(qNorm)
  const isSpa = type === 'spa' || /\bspa\b|massage|lam dep|tham my|nail|cham soc da|goi dau/.test(qNorm)
  const isEntertainment = type === 'cinema' || type === 'bar' || type === 'gym' || /rap chieu|cinema|xem phim|ve phim|karaoke|cong vien|khu vui choi|giai tri|bowling|billiard|\bgym\b|fitness|\bbar\b|\bpub\b|ve vao cong/.test(qNorm)
  /**
   * The resolved place domain, carried on the result.
   *
   * 🔑 The three booleans below are computed HERE and nowhere else, from the
   * query text and the caller's `type`. The canonical entity builder needs the
   * same answer, and re-deriving it downstream would be a second classifier that
   * could disagree with the one that actually chose the enrichment. One
   * classifier, one answer, carried as data.
   *
   * A place query that matches none of the three (a generic "địa điểm ở Quận 1")
   * stays `place` — a real place with no domain-specific enrichment, not a
   * miscategorised restaurant.
   */
  if (result && typeof result === 'object') {
    (result as Record<string, unknown>)._tappy_place_domain =
      isFood ? 'food' : isSpa ? 'spa' : isEntertainment ? 'entertainment' : 'place'
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
      const suffix = isFood ? 'gia menu thuc don' : isSpa ? 'gia dich vu bang gia spa massage' : 'gia ve dich vu'
      const [priceResults, orderResults, tiktokResults] = await Promise.all([
        serperSearch(query + ' ' + (location || '') + ' ' + suffix),
        isFood ? serperSearch(query + ' ' + (location || '') + ' (site:shopeefood.vn OR site:food.grab.com OR site:baemin.vn)') : Promise.resolve(null),
        // TikTok review discovery (consultative only, product decision 2026-08-16). Same shape as
        // the order-link search above: a real provider query, whose results are then VALIDATED —
        // nothing here is constructed from the place name, so a place with no coverage simply
        // ends up without a link.
        serperSearch(query + ' ' + (location || '') + ' review site:tiktok.com'),
      ])
      if (result && typeof result === 'object') {
        const extra: Record<string, unknown> = {}
        if (priceResults && priceResults.length > 0) {
          extra.price_search_results = priceResults
          extra.price_note = messages.places.priceNote(lang)
          // A5.1: grade the evidence WITH the data. Snippet prices are search-text
          // (REVIEW-level), never a structured/authoritative price — the model reads
          // this and must qualify accordingly (evidence policy block), never FACT.
          extra.price_evidence = { evidence_type: classifyEvidence('search_snippet'), source_type: 'search_snippet' }
        }
        if (isFood) {
          const directOrder = (orderResults || []).filter(r => isDirectFoodOrderLink(r.link))
          if (directOrder.length > 0) extra.order_search_results = directOrder
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
