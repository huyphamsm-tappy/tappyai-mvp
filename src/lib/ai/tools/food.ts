import { getCache, setCache, serperSearch } from './common'
import { normalizeVN } from '@/lib/ai/intent'
import { createClient } from '@/lib/supabase/server'
import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { buildSpaLinks } from '@/lib/platformLinks/spa'
import { buildEntertainmentLinks } from '@/lib/platformLinks/entertainment'
import { messages, isVi } from '@/lib/ai/messages'
import { newsCacheKey, placesCacheKey } from './cacheKeys'

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
    const oql = '[out:json][timeout:10];(node["' + osmKey + '"' + osmOp + '"' + osmValue + '"]["name"](around:' + searchRadius + ',' + lat + ',' + lon + ');way["' + osmKey + '"' + osmOp + '"' + osmValue + '"]["name"](around:' + searchRadius + ',' + lat + ',' + lon + '););out center 10;'
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
      // places.photos excluded: key is restricted to old Places API only — new API silently returns 0 photos
      const SEARCH_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri'
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
          results: placesData.map((r, idx) => ({
            place_id: r.id as string,
            name: (r.displayName as { text?: string })?.text || '',
            address: r.formattedAddress,
            google_rating: r.rating ? messages.places.googleRating(lang, r.rating as number, r.userRatingCount as number | undefined) : null,
            maps_link: (r.googleMapsUri as string | undefined) || ('https://www.google.com/maps/place/?q=place_id:' + r.id),
            ...(r.websiteUri ? { website_uri: r.websiteUri as string } : {}),
          }))
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
  if (isFood || isSpa || isEntertainment) {
    try {
      const suffix = isFood ? 'gia menu thuc don' : isSpa ? 'gia dich vu bang gia spa massage' : 'gia ve dich vu'
      const [priceResults, orderResults] = await Promise.all([
        serperSearch(query + ' ' + (location || '') + ' ' + suffix),
        isFood ? serperSearch(query + ' ' + (location || '') + ' (site:shopeefood.vn OR site:food.grab.com OR site:baemin.vn)') : Promise.resolve(null),
      ])
      if (result && typeof result === 'object') {
        const extra: Record<string, unknown> = {}
        if (priceResults && priceResults.length > 0) {
          extra.price_search_results = priceResults
          extra.price_note = messages.places.priceNote(lang)
        }
        if (isFood) {
          const directOrder = (orderResults || []).filter(r => isDirectFoodOrderLink(r.link))
          if (directOrder.length > 0) extra.order_search_results = directOrder
          // Inject per-place search links using the exact restaurant name on each platform
          const places = (result as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
          if (Array.isArray(places)) {
            extra.results = places.map(place => ({
              ...place,
              order_links: buildFoodOrderLinks(
                place.name as string || '',
                place.address as string | undefined,
                location
              )
            }))
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
              )
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
              )
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
