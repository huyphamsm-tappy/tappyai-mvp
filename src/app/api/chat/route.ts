import { streamText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getMemory, buildMemoryBlock, extractMemoryFromConversation, updateMemory, type UserMemory } from '@/lib/memory/memoryService'
import { getModel, type ModelTier } from '@/lib/ai/provider'
import { normalizeVN, classifyIntent, detectLang, detectForcedTool, detectLocationIntent, detectPlanningIntent, isSimpleQuery, isShoppingQuery } from '@/lib/ai/intent'
import { type Budget, extractBudget, applyBudgetFilter, LUXURY_PRICE_FLOOR, LUXURY_KEYWORDS, applyLuxuryStreamFilter } from '@/lib/ai/budget'
import { buildSystem, buildSystemSimple, buildPrefBlock, type UserPrefs } from '@/lib/ai/promptBuilder'

// ===== In-memory cache (theo Vercel instance, giam goi API lap lai cho cung 1 query) =====
type CacheEntry = { data: unknown; expires: number }
const cache = new Map<string, CacheEntry>()

function getCache(key: string): unknown | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) cache.delete(key)
  return null
}
function setCache(key: string, data: unknown, ttlMs: number) {
  if (cache.size > 300) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) cache.delete(firstKey)
  }
  cache.set(key, { data, expires: Date.now() + ttlMs })
}






async function getNews(query: string) {
  const cacheKey = 'news:' + query.toLowerCase().trim()
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
          if (matches) articles.push({ title, description: desc.slice(0, 200), link, source: feed.name, published: pub ? new Date(pub).toLocaleDateString('vi-VN') : 'Moi nhat' })
        }
      } catch { /* skip feed */ }
    }))
    result = articles.length === 0
      ? { note: 'Khong tim thay tin tuc lien quan', articles: [] }
      : { query, total: articles.length, articles: articles.slice(0, 5) }
  } catch {
    result = { error: 'Khong the tai tin tuc', articles: [] }
  }
  setCache(cacheKey, result, 10 * 60 * 1000) // cache 10 phut, tin tuc cap nhat thuong xuyen
  return result
}

// ===== SUPABASE CACHE CLIENT (no-cookie, for place_photos table) =====
let _cacheDb: ReturnType<typeof createSupabaseClient> | null | undefined = undefined
function getCacheClient() {
  if (_cacheDb !== undefined) return _cacheDb
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  _cacheDb = url && key ? createSupabaseClient(url, key) : null
  return _cacheDb
}

// ===== GOOGLE PLACES (NEW) PHOTO with Supabase persistent cache =====
// Each unique place_id costs $0.007 once (Places API New Photos), then cached forever in DB.
// photoName is the full resource path returned by Places API (New), e.g. "places/ChIJ.../photos/AeZ..."
async function fetchPlacePhoto(placeId: string, photoName: string): Promise<string | null> {
  const db = getCacheClient()
  // 1. Check Supabase cache first
  if (db) {
    try {
      const { data, error } = await db
        .from('place_photos')
        .select('photo_url')
        .eq('place_id', placeId)
        .maybeSingle()
      console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'db_cache', placeId, hit: !!data?.photo_url, dbError: error?.message || null }))
      if (data?.photo_url) return data.photo_url as string
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'db_cache_exception', placeId, error: String(e) }))
    }
  } else {
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'db_cache_skipped', reason: 'no_db_client' }))
  }
  // 2. Call Places API (New) photo media endpoint â€” returns JSON with photoUri (no redirect needed)
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || !photoName) {
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_skipped', hasKey: !!key, hasPhotoName: !!photoName }))
    return null
  }
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 3000)
  try {
    const resp = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?key=${key}&maxHeightPx=400&skipHttpRedirect=true`,
      { signal: controller.signal }
    )
    clearTimeout(tid)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_result', status: resp.status, ok: resp.ok }))
    if (!resp.ok) return null
    const data = await resp.json()
    const photoUri = data?.photoUri as string | undefined
    // photoUri should be a CDN URL (lh3.googleusercontent.com), not a places.googleapis.com URL
    const safe = !!photoUri && !photoUri.includes('places.googleapis.com')
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_photoUri', photoUriPrefix: photoUri?.slice(0, 60) || null, safe }))
    if (!photoUri || !safe) return null
    // 3. Persist to Supabase (fire-and-forget)
    if (db) {
      db.from('place_photos')
        .upsert({ place_id: placeId, photo_url: photoUri })
        .then(({ error: e }) => console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'db_write', placeId, ok: !e, dbError: e?.message || null })))
        .catch(e => console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'db_write_exception', error: String(e) })))
    }
    return photoUri
  } catch (e) {
    clearTimeout(tid)
    console.log(JSON.stringify({ type: 'tappyai_photo_debug', step: 'api_exception', error: String(e) }))
    return null
  }
}

async function searchPlacesOSM(query: string, location?: string) {
  const loc = location || 'Ha Noi'
  const googleMapsUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(query + ' ' + loc)
  try {
    const cityCoords: Record<string, [number, number]> = {
      'ha noi': [21.0285, 105.8542], 'hanoi': [21.0285, 105.8542], 'hn': [21.0285, 105.8542],
      'ho chi minh': [10.7769, 106.7009], 'hcm': [10.7769, 106.7009], 'saigon': [10.7769, 106.7009],
      'da nang': [16.0544, 108.2022], 'danang': [16.0544, 108.2022],
      'hue': [16.4637, 107.5909], 'can tho': [10.0452, 105.7469],
      'hai phong': [20.8449, 106.6881], 'nha trang': [12.2388, 109.1967],
      'da lat': [11.9404, 108.4583], 'vung tau': [10.3460, 107.0843],
      'hoi an': [15.8801, 108.3380],
    }
    const locKey = loc.toLowerCase()
    const preset = Object.entries(cityCoords).find(([k]) => locKey.includes(k))
    let lat = preset ? preset[1][0] : 21.0285
    let lon = preset ? preset[1][1] : 105.8542
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
    const ql = query.toLowerCase()
    let amenity = 'restaurant'
    if (ql.match(/cafe|ca phe|coffee/)) amenity = 'cafe'
    else if (ql.match(/spa|massage/)) amenity = 'spa'
    else if (ql.match(/hotel|khach san|resort/)) amenity = 'hotel'
    else if (ql.match(/bar|pub/)) amenity = 'bar'
    else if (ql.match(/gym|fitness/)) amenity = 'gym'
    else if (ql.match(/cinema|phim|rap/)) amenity = 'cinema'
    else if (ql.match(/benh vien|hospital|clinic/)) amenity = 'hospital'
    else if (ql.match(/pharmacy|thuoc/)) amenity = 'pharmacy'
    else if (ql.match(/atm|ngan hang|bank/)) amenity = 'bank'
    const oql = '[out:json][timeout:10];(node["amenity"="' + amenity + '"]["name"](around:5000,' + lat + ',' + lon + ');way["amenity"="' + amenity + '"]["name"](around:5000,' + lat + ',' + lon + '););out center 10;'
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
    let overpassData: { elements?: unknown[] } | null = null
    for (const endpoint of endpoints) {
      try {
        const resp = await Promise.race([
          fetch(endpoint + '?data=' + encodeURIComponent(oql), { headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ])
        if ((resp as Response).ok) { overpassData = await (resp as Response).json(); break }
      } catch { continue }
    }
    if (!overpassData) return { note: 'Tim kiem tren Google Maps: ' + googleMapsUrl, google_maps_search: googleMapsUrl, results: [] }
    type El = { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }
    const results = ((overpassData.elements || []) as El[]).slice(0, 10).map(el => {
      const tags = el.tags || {}
      const elat = el.lat ?? el.center?.lat
      const elon = el.lon ?? el.center?.lon
      return {
        name: tags['name:vi'] || tags.name || '',
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || 'Xem ban do',
        phone: tags.phone || tags['contact:phone'] || null,
        maps_link: elat && elon ? 'https://www.google.com/maps?q=' + elat + ',' + elon : googleMapsUrl
      }
    }).filter(r => r.name)
    return {
      location: loc, amenity_type: amenity, source: 'OpenStreetMap', count: results.length, results,
      google_maps_search: googleMapsUrl,
      note: results.length === 0 ? 'OSM khong co du lieu. Tim them: ' + googleMapsUrl : 'Du lieu tu OpenStreetMap. Xem them: ' + googleMapsUrl
    }
  } catch (e) { return { error: String(e), results: [], google_maps_search: googleMapsUrl } }
}

const FOOD_DELIVERY_LINKS = [
  { name: 'ShopeeFood', url: 'https://shopeefood.vn/' },
  { name: 'GrabFood', url: 'https://food.grab.com/vn/vi/' },
  { name: 'BeFood', url: 'https://be.com.vn/' },
]

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

// Kiem tra link co phai trang CU THE cua 1 khach san tren Booking.com/Agoda/Traveloka
// (khong phai trang tim kiem/danh sach chung theo khu vuc/thanh pho)
function isSpecificOtaHotelPage(link: string): boolean {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.toLowerCase()
    if (!(host.includes('booking.com') || host.includes('agoda.com') || host.includes('traveloka.com'))) return false
    if (path.length <= 1) return false
    if (path.includes('search') || path.includes('/region/') || path.includes('/city/') || path.includes('/budget/') || path.includes('/country/') || path.includes('/maps/') || path.includes('/landmark/')) return false
    return true
  } catch {
    return false
  }
}

async function searchPlaces(query: string, location?: string, type?: string, lang = 'vi', locationBias?: { lat: number; lng: number } | null) {
  const locBiasKey = locationBias ? `:${locationBias.lat.toFixed(2)},${locationBias.lng.toFixed(2)}` : ''
  const cacheKey = 'places:' + query.toLowerCase().trim() + ':' + (location || '').toLowerCase().trim() + ':' + (type || '') + locBiasKey
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
      const SEARCH_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri'
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

        // Fetch photos for all places in parallel via Place Details (Basic SKU)
        const photoUrls = await Promise.all(
          placesData.map(async (r) => {
            const placeId = r.id as string
            if (!placeId) return null
            try {
              const detailResp = await Promise.race([
                fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
                  headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,photos' },
                }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
              ])
              const detail = await (detailResp as Response).json()
              const photoName = (detail.photos as Array<{ name: string }>)?.[0]?.name
              if (photoName) return fetchPlacePhoto(placeId, photoName)
            } catch { /* skip on timeout or error */ }
            return null
          })
        )

        result = {
          source: 'Google Maps', count: d.places.length,
          results: placesData.map((r, idx) => ({
            place_id: r.id as string,
            name: (r.displayName as { text?: string })?.text || '',
            address: r.formattedAddress,
            google_rating: r.rating ? `${r.rating}â­ (${(r.userRatingCount as number | undefined)?.toLocaleString('vi-VN') ?? r.userRatingCount} Ä‘Ã¡nh giÃ¡ Google Maps)` : null,
            maps_link: (r.googleMapsUri as string | undefined) || ('https://www.google.com/maps/place/?q=place_id:' + r.id),
            tiktok_url: `https://www.tiktok.com/search?q=${encodeURIComponent(((r.displayName as { text?: string })?.text || '') + ' review')}`,
            ...(photoUrls[idx] ? { photo_url: photoUrls[idx] } : {})
          }))
        }
      } else {
        console.log(JSON.stringify({ type: 'tappyai_places_debug', apiVersion: 'new', httpStatus: (resp as Response).status, errorMessage: (d.error as { message?: string })?.message || null }))
      }
    } catch (e) {
      console.log(JSON.stringify({ type: 'tappyai_places_debug', error: String(e) }))
    }
  }
  if (!result) result = await searchPlacesOSM(query, location)

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
          extra.price_note = 'Gia tham khao tu ket qua tim kiem hien tai (menu/dich vu/ve...), co the khac theo chi nhanh, thoi diem va da thay doi theo thoi gian.'
        }
        if (isFood) {
          const directOrder = (orderResults || []).filter(r => isDirectFoodOrderLink(r.link))
          if (directOrder.length > 0) extra.order_search_results = directOrder
          extra.order_links = FOOD_DELIVERY_LINKS
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
                return { ...r, tappy_rating: `${avg}/5 (${s.count} nguoi dung TappyAI da danh gia)` }
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

async function searchProducts(query: string) {
  const cacheKey = 'products:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const links = [
    { name: 'Shopee', url: 'https://shopee.vn/search?keyword=' + encodeURIComponent(query) },
    { name: 'Tiki', url: 'https://tiki.vn/search?q=' + encodeURIComponent(query) },
    { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' + encodeURIComponent(query) },
  ]

  let result: unknown
  try {
    const [searchResultsRaw, directResults, shopInfoResults] = await Promise.all([
      serperSearch(query + ' gia Shopee Tiki Lazada'),
      serperSearch(query + ' (site:shopee.vn OR site:tiki.vn OR site:lazada.vn)'),
      serperSearch(query + ' shop website Ä‘á»‹a chá»‰ facebook tiktok'),
    ])

    // Uu tien cac link CU THE den 1 san pham (khong phai trang tim kiem) tren Shopee/Tiki/Lazada
    const directProductLinks = (directResults || []).filter(r => {
      try {
        const u = new URL(r.link)
        const host = u.hostname.replace(/^www\./, '')
        const path = u.pathname.toLowerCase()
        if (host.includes('shopee.vn')) return /-i\.\d+\.\d+/.test(path)
        if (host.includes('tiki.vn')) return /-p\d+\.html/.test(path)
        if (host.includes('lazada.vn')) return path.startsWith('/products/')
        return false
      } catch { return false }
    })

    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined = searchResultsRaw || undefined
    if (directProductLinks.length > 0) {
      const seen = new Set<string>()
      searchResults = [...directProductLinks, ...(searchResults || [])].filter(r => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
      }).slice(0, 8)
    }

    const tiktokShopLink = 'https://www.tiktok.com/search?q=' + encodeURIComponent(query)

    if (searchResults && searchResults.length > 0) {
      result = {
        query,
        source: 'Google Search (Serper)',
        search_results: searchResults,
        shop_info_results: shopInfoResults || [],
        links,
        tiktok_shop_link: tiktokShopLink,
        note: 'Gia tham khao tu ket qua tim kiem hien tai, co the da thay doi theo thoi gian va phien ban san pham - bam link de xem gia chinh xac va mua hang.'
      }
    } else {
      result = {
        note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam',
        links,
        shop_info_results: shopInfoResults || [],
        tiktok_shop_link: tiktokShopLink,
      }
    }
  } catch {
    result = { note: 'Tim "' + query + '" tren cac san thuong mai dien tu Viet Nam', links }
  }
  setCache(cacheKey, result, 15 * 60 * 1000) // cache 15 phut
  return result
}

// ===== WEB SEARCH: DuckDuckGo HTML (free, no API key) =====
async function webSearch(query: string) {
  const cacheKey = 'websearch:' + query.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
  let result: unknown

  const serperResults = await serperSearch(query)
  if (serperResults && serperResults.length > 0) {
    result = { query, source: 'Google (Serper)', results: serperResults, search_url: fallbackUrl }
    setCache(cacheKey, result, 5 * 60 * 1000)
    return result
  }

  try {
    const resp = await Promise.race([
      fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://duckduckgo.com/',
          'Origin': 'https://duckduckgo.com',
          'Sec-Fetch-Mode': 'navigate',
        }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const html = await (resp as Response).text()

    const results: Array<{ title: string; link: string; snippet: string }> = []
    const blockRegex = /<a[^>]*class="result__a"[^>]*href="(.*?)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const stripTags = (s: string) => s
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .trim()

    let match: RegExpExecArray | null
    while ((match = blockRegex.exec(html)) && results.length < 6) {
      let link = match[1]
      const uddg = link.match(/uddg=([^&]+)/)
      if (uddg) link = decodeURIComponent(uddg[1])
      else if (link.startsWith('//')) link = 'https:' + link
      const title = stripTags(match[2])
      const snippet = stripTags(match[3])
      if (title && link) results.push({ title, link, snippet })
    }

    result = results.length === 0
      ? { note: 'Khong tim thay ket qua tu dong cho "' + query + '". HAY hien thi link sau cho user de tu tim: ' + fallbackUrl, results: [], search_url: fallbackUrl }
      : { query, source: 'DuckDuckGo', results, search_url: fallbackUrl }
  } catch {
    result = { note: 'Khong the tim kiem tu dong luc nay. HAY hien thi link sau cho user de tu tim: ' + fallbackUrl, results: [], search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut
  return result
}

// Encode ky tu '(' ')' trong URL de khong vo cu phap markdown link [text](url)
function sanitizeUrlForMarkdown(link: string): string {
  return link.replace(/\(/g, '%28').replace(/\)/g, '%29')
}

// ===== SERPER: Google Search API (can SERPER_API_KEY, 2500 query free) =====
async function serperSearch(query: string): Promise<Array<{ title: string; link: string; snippet: string }> | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null
  try {
    const resp = await Promise.race([
      fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, gl: 'vn', hl: 'vi', num: 8 })
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    if (!(resp as Response).ok) return null
    const data = await (resp as Response).json()
    const organic = (data?.organic || []) as Array<{ title?: string; link?: string; snippet?: string }>
    const results = organic
      .filter(r => r.title && r.link)
      .slice(0, 6)
      .map(r => ({ title: r.title as string, link: sanitizeUrlForMarkdown(r.link as string), snippet: r.snippet || '' }))
    return results
  } catch {
    return null
  }
}

// ===== WEATHER: wttr.in (free, no API key) =====
async function getWeather(location: string) {
  const cacheKey = 'weather:' + (location || '').toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const cityMap: Record<string, string> = {
    'ha noi': 'Hanoi', 'hanoi': 'Hanoi', 'hn': 'Hanoi',
    'ho chi minh': 'Ho Chi Minh City', 'tp hcm': 'Ho Chi Minh City', 'hcm': 'Ho Chi Minh City', 'sai gon': 'Ho Chi Minh City', 'saigon': 'Ho Chi Minh City', 'tphcm': 'Ho Chi Minh City',
    'da nang': 'Da Nang', 'danang': 'Da Nang',
    'hue': 'Hue', 'can tho': 'Can Tho', 'hai phong': 'Hai Phong',
    'nha trang': 'Nha Trang', 'da lat': 'Da Lat', 'dalat': 'Da Lat',
    'vung tau': 'Vung Tau', 'hoi an': 'Hoi An', 'phu quoc': 'Phu Quoc',
  }
  const norm = normalizeVN((location || '').toLowerCase().trim())
  const place = cityMap[norm] || location || 'Hanoi'
  const fallbackUrl = 'https://www.google.com/search?q=' + encodeURIComponent('thoi tiet ' + place)

  let result: unknown
  try {
    const resp = await Promise.race([
      fetch('https://wttr.in/' + encodeURIComponent(place) + '?format=j1', {
        headers: { 'User-Agent': 'curl/8.0', 'Accept': 'application/json' }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const data = await (resp as Response).json()
    const cur = data.current_condition?.[0]
    const today = data.weather?.[0]
    if (!cur) throw new Error('no data')
    result = {
      location: data.nearest_area?.[0]?.areaName?.[0]?.value || place,
      temp_C: cur.temp_C,
      feels_like_C: cur.FeelsLikeC,
      condition: cur.weatherDesc?.[0]?.value?.trim(),
      humidity_percent: cur.humidity,
      wind_kmph: cur.windspeedKmph,
      today_max_C: today?.maxtempC,
      today_min_C: today?.mintempC,
      chance_of_rain_percent: today?.hourly?.find((h: { time: string }) => h.time === '1200')?.chanceofrain ?? today?.hourly?.[4]?.chanceofrain,
      source: 'wttr.in',
    }
  } catch {
    result = { error: 'Khong lay duoc du lieu thoi tiet luc nay', note: 'Xem thoi tiet tai: ' + fallbackUrl, search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut
  return result
}

// ===== GOLD PRICE: vang.today (free, no API key) =====
async function getGoldPrice(query: string) {
  const cacheKey = 'gold:' + (query || '').toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const fallbackUrl = 'https://www.vang.today'
  let result: unknown
  try {
    const resp = await Promise.race([
      fetch('https://www.vang.today/api/prices', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    const data = await (resp as Response).json()
    if (data?.success && data.prices && typeof data.prices === 'object') {
      const wanted = ['SJL1L10', 'SJ9999', 'PQHN24NTT', 'PQHNVM', 'DOHNL', 'XAUUSD']
      type GoldEntry = { name: string; buy: number; sell: number; change_buy: number; change_sell: number; currency: string }
      const entries = Object.entries(data.prices as Record<string, GoldEntry>)
      const filtered = entries.filter(([code]) => wanted.includes(code))
      const list = (filtered.length ? filtered : entries).map(([code, v]) => ({ type_code: code, ...v }))
      result = {
        source: 'vang.today',
        unit: 'VND/luong cho vang trong nuoc (1 luong = 10 chi = 37.5g), USD/oz cho vang the gioi (XAUUSD)',
        updated_time: data.time, updated_date: data.date,
        prices: list,
      }
    } else {
      throw new Error('no data')
    }
  } catch {
    result = { error: 'Khong lay duoc gia vang luc nay', note: 'Xem gia vang tai: ' + fallbackUrl, search_url: fallbackUrl }
  }
  setCache(cacheKey, result, 5 * 60 * 1000) // cache 5 phut, gia vang cap nhat thuong xuyen
  return result
}

// ===== FLIGHT PRICES: Travelpayouts Data API (free, can dang ky token) =====
// Token is read from TRAVELPAYOUTS_TOKEN env var (set in Vercel / .env.local).
// If missing, flight-price lookups are skipped and the AI falls back to the search link.
const TRAVELPAYOUTS_TOKEN = process.env.TRAVELPAYOUTS_TOKEN || ''

const IATA_MAP: Record<string, string> = {
  'ha noi': 'HAN', 'hanoi': 'HAN', 'hn': 'HAN',
  'ho chi minh': 'SGN', 'tp ho chi minh': 'SGN', 'tp hcm': 'SGN', 'hcm': 'SGN', 'sai gon': 'SGN', 'saigon': 'SGN', 'tphcm': 'SGN',
  'da nang': 'DAD', 'danang': 'DAD',
  'phu quoc': 'PQC',
  'nha trang': 'CXR', 'cam ranh': 'CXR',
  'hue': 'HUI',
  'can tho': 'VCA',
  'hai phong': 'HPH',
  'da lat': 'DLI', 'dalat': 'DLI',
  'vinh': 'VII',
  'buon ma thuot': 'BMV',
  'quy nhon': 'UIH',
  'pleiku': 'PXU',
  'con dao': 'VCS',
  'rach gia': 'VKG',
  'ca mau': 'CAH',
  'thanh hoa': 'THD',
  'dong hoi': 'VDH',
  'tuy hoa': 'TBB',
  'bangkok': 'BKK', 'thai lan': 'BKK',
  'singapore': 'SIN',
  'seoul': 'ICN', 'han quoc': 'ICN',
  'tokyo': 'NRT', 'nhat ban': 'NRT', 'nhat': 'NRT',
  'osaka': 'KIX',
  'kuala lumpur': 'KUL', 'malaysia': 'KUL',
  'taipei': 'TPE', 'dai loan': 'TPE',
  'hong kong': 'HKG',
  'sydney': 'SYD',
}

const AIRLINE_NAMES: Record<string, string> = {
  VN: 'Vietnam Airlines', VJ: 'VietJet Air', QH: 'Bamboo Airways', BL: 'Pacific Airlines',
  '3K': 'Jetstar Asia', SQ: 'Singapore Airlines', TG: 'Thai Airways', TR: 'Scoot',
  KE: 'Korean Air', OZ: 'Asiana Airlines', JL: 'Japan Airlines', NH: 'ANA',
  CX: 'Cathay Pacific', MU: 'China Eastern', AK: 'AirAsia',
}

function cityToIATA(name: string): string | null {
  const n = normalizeVN((name || '').toLowerCase().trim())
  if (/^[a-z]{3}$/i.test(n)) return n.toUpperCase()
  for (const [key, code] of Object.entries(IATA_MAP)) {
    if (n.includes(key)) return code
  }
  return null
}

async function getFlightPrices(origin: string, destination: string) {
  const cacheKey = 'flights:' + origin.toLowerCase().trim() + ':' + destination.toLowerCase().trim()
  const cached = getCache(cacheKey)
  if (cached) return cached

  const originCode = cityToIATA(origin)
  const destCode = cityToIATA(destination)
  const searchUrl = 'https://www.aviasales.com/search/' + (originCode || '') + (destCode || '')

  let result: unknown
  if (!originCode || !destCode) {
    result = { error: 'Khong nhan dien duoc san bay tu ten dia diem', note: 'Tim chuyen bay tai: ' + searchUrl, search_url: searchUrl }
  } else if (!TRAVELPAYOUTS_TOKEN) {
    result = { error: 'Chua cau hinh API gia ve may bay', note: 'Tim chuyen bay tai: ' + searchUrl, search_url: searchUrl }
  } else {
    try {
      const params = new URLSearchParams({ origin: originCode, destination: destCode, currency: 'vnd', token: TRAVELPAYOUTS_TOKEN })
      const resp = await Promise.race([
        fetch('https://api.travelpayouts.com/v1/prices/cheap?' + params.toString(), { headers: { 'Accept': 'application/json' } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      ])
      const data = await (resp as Response).json()
      const routeData = data?.data?.[destCode]
      if (data?.success && routeData) {
        type Fare = { price: number; airline: string; flight_number: number; departure_at?: string; return_at?: string }
        const options = Object.values(routeData as Record<string, Fare>)
        result = {
          source: 'Travelpayouts (du lieu Aviasales)',
          origin: originCode, destination: destCode, currency: 'VND',
          flights: options.map(o => ({
            price_vnd: o.price,
            airline: AIRLINE_NAMES[o.airline] || o.airline,
            flight_number: o.airline + o.flight_number,
            departure_at: o.departure_at || null,
            return_at: o.return_at || null,
          })),
          booking_link: 'https://www.aviasales.com/search/' + originCode + destCode,
          note: 'Day la gia ve re gan nhat ma he thong tim duoc cho tuyen nay (khong chac dung ngay user hoi), gia co the da thay doi - bam link de xem gia chinh xac va dat ve theo ngay cu the.'
        }
      } else {
        throw new Error('no data')
      }
    } catch {
      result = { error: 'Khong lay duoc gia ve may bay luc nay', note: 'Tim chuyen bay tai: ' + searchUrl, search_url: searchUrl }
    }
  }
  setCache(cacheKey, result, 60 * 60 * 1000) // cache 1 gio
  return result
}

// ===== HOTEL PRICES: web search (Booking.com/Agoda snippets) + OSM hotel list (free, no API key) =====
async function getHotelPrices(location: string, checkIn?: string, checkOut?: string, maxBudgetVnd?: number) {
  const cacheKey = 'hotels:' + location.toLowerCase().trim() + ':' + (checkIn || '') + ':' + (checkOut || '') + ':' + (maxBudgetVnd || '')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const bookingUrl = 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(location)
    + (checkIn ? '&checkin=' + checkIn : '') + (checkOut ? '&checkout=' + checkOut : '')
  const budgetTag = maxBudgetVnd && maxBudgetVnd < 1_500_000
    ? ' gia re binh dan duoi ' + Math.round(maxBudgetVnd / 1000) + 'k -"5 sao" -pullman -marriott -hilton -sheraton -sofitel -intercontinental -novotel'
    : ''
  const searchQuery = 'khach san ' + location + ' gia phong dem nay booking.com agoda' + budgetTag

  let result: unknown
  try {
    // Buoc 1: lay gia chung + danh sach khach san OSM song song
    const [serperResults, places] = await Promise.all([
      serperSearch(searchQuery),
      searchPlacesOSM('khach san', location) as Promise<{ results?: Array<{ name: string; address: string; maps_link: string }> }>,
    ])
    let hotelList = places?.results?.slice(0, 5) || []
    // Filter luxury brands khoi OSM list neu co budget
    if (maxBudgetVnd && maxBudgetVnd < 1_500_000) {
      hotelList = hotelList.filter(h => {
        const hn = normalizeVN(h.name.toLowerCase())
        return !LUXURY_KEYWORDS.some(k => hn.includes(k))
      })
    }

    // Buoc 2: tim trang dat phong TRUC TIEP tung khach san tren OTA (song song)
    // Tim rieng tung ten â†’ Google tra ve trang hotel cu the, khong phai trang search chung
    let directHotelLinks: Array<{ title: string; link: string; snippet: string }> = []
    {
      const hotelQueries = hotelList.slice(0, 3).map(h =>
        '"' + h.name + '" ' + location + ' site:booking.com OR site:agoda.com'
      )
      // Neu khong co OSM hotel, dung query co path /hotel/ de ep Google tra trang cu the
      const genericFallback = 'khach san ' + location + ' site:booking.com/hotel' + (budgetTag ? ' gia re binh dan' : '')
      const queriesToRun = hotelQueries.length > 0 ? hotelQueries : [genericFallback]

      const allResults = await Promise.all(queriesToRun.map(q => serperSearch(q)))
      directHotelLinks = allResults
        .flatMap(r => r || [])
        .filter(r => isSpecificOtaHotelPage(r.link))
        .filter((r, i, arr) => arr.findIndex(x => x.link === r.link) === i) // dedup

      // Neu van it hon 2 direct link, thu them OR query + site:agoda.com
      if (directHotelLinks.length < 2) {
        const supplementQ = hotelList.length > 0
          ? hotelList.slice(0, 3).map(h => '"' + h.name + '"').join(' OR ') + ' ' + location + ' (site:booking.com OR site:agoda.com)'
          : genericFallback
        const supplement = await serperSearch(supplementQ)
        const seen = new Set(directHotelLinks.map(r => r.link))
        directHotelLinks = [
          ...directHotelLinks,
          ...(supplement || []).filter(r => isSpecificOtaHotelPage(r.link) && !seen.has(r.link))
        ]
      }
      directHotelLinks = directHotelLinks.slice(0, 8)
    }
    let searchResults: Array<{ title: string; link: string; snippet: string }> | undefined = serperResults || undefined
    if (directHotelLinks.length > 0) {
      const seen = new Set<string>()
      searchResults = [...directHotelLinks, ...(searchResults || [])].filter(r => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
      }).slice(0, 8)
    }
    // Neu mot ket qua tro toi trang OTA nhung KHONG phai trang rieng 1 khach san (vd trang city/budget chung),
    // thay link bang bookingUrl de model khong gan nham cho ten khach san cu the
    if (searchResults) {
      searchResults = searchResults.map(r => {
        try {
          const u = new URL(r.link)
          const host = u.hostname.replace(/^www\./, '')
          if ((host.includes('booking.com') || host.includes('agoda.com') || host.includes('traveloka.com')) && !isSpecificOtaHotelPage(r.link)) {
            return { ...r, link: bookingUrl }
          }
          return r
        } catch { return r }
      })
    }
    let source = 'Google Search (Serper) + OpenStreetMap'
    if (!searchResults || searchResults.length === 0) {
      const ddg = await webSearch(searchQuery) as { results?: Array<{ title: string; link: string; snippet: string }> }
      searchResults = ddg?.results
      source = 'Tim kiem web (DuckDuckGo) + OpenStreetMap'
    }

    if (searchResults && searchResults.length > 0) {
      result = {
        location,
        source,
        search_results: searchResults,
        hotel_list: hotelList,
        booking_link: bookingUrl,
        _debug_budget: maxBudgetVnd ? 'detected:' + maxBudgetVnd : 'null',
        note: 'Gia trong search_results la tham khao tu ket qua tim kiem hien tai, co the khong dung loai phong/ngay user hoi va da thay doi - bam booking_link de xem gia chinh xac realtime theo ngay cu the.'
      }
    } else {
      result = {
        error: 'Khong tim duoc thong tin gia phong luc nay',
        hotel_list: hotelList,
        booking_link: bookingUrl,
        _debug_budget: maxBudgetVnd ? 'detected:' + maxBudgetVnd : 'null',
        note: 'Xem va dat phong tai: ' + bookingUrl,
        search_url: bookingUrl,
      }
    }
  } catch {
    result = { error: 'Khong lay duoc gia phong khach san luc nay', booking_link: bookingUrl, note: 'Xem va dat phong tai: ' + bookingUrl, search_url: bookingUrl }
  }
  setCache(cacheKey, result, 30 * 60 * 1000) // cache 30 phut
  return result
}

// ===== TRANSPORT: xe khach/tau lien tinh (Serper search) + uoc tinh taxi/xe cong nghe theo khoang cach =====
const TRANSPORT_CITY_COORDS: Record<string, [number, number]> = {
  'ha noi': [21.0285, 105.8542], 'hanoi': [21.0285, 105.8542], 'hn': [21.0285, 105.8542],
  'ho chi minh': [10.7769, 106.7009], 'hcm': [10.7769, 106.7009], 'saigon': [10.7769, 106.7009], 'sai gon': [10.7769, 106.7009], 'tp hcm': [10.7769, 106.7009], 'tphcm': [10.7769, 106.7009],
  'da nang': [16.0544, 108.2022], 'danang': [16.0544, 108.2022],
  'hue': [16.4637, 107.5909], 'can tho': [10.0452, 105.7469],
  'hai phong': [20.8449, 106.6881], 'nha trang': [12.2388, 109.1967],
  'da lat': [11.9404, 108.4583], 'dalat': [11.9404, 108.4583], 'vung tau': [10.3460, 107.0843],
  'hoi an': [15.8801, 108.3380], 'phu quoc': [10.2270, 103.9648], 'quy nhon': [13.7820, 109.2192],
  'sa pa': [22.3364, 103.8438], 'sapa': [22.3364, 103.8438], 'ninh binh': [20.2506, 105.9745],
}

// San bay lon - khoang cach toi trung tam thanh pho thuong qua xa de dung toa do trung tam
const AIRPORT_COORDS: Record<string, [number, number]> = {
  'tan son nhat': [10.8188, 106.6520], 'sgn': [10.8188, 106.6520],
  'noi bai': [21.2212, 105.8072],
  'cam ranh': [11.9982, 109.2192],
  'lien khuong': [11.7497, 108.3669],
  'cat bi': [20.8197, 106.7247],
  'phu bai': [16.4015, 107.7032],
  'phu cat': [13.9550, 109.0420],
  'tra noc': [10.0851, 105.7117],
}

async function geocodeForTransport(loc: string): Promise<[number, number] | null> {
  const locKey = normalizeVN(loc.toLowerCase())
  const airportPreset = Object.entries(AIRPORT_COORDS).find(([k]) => locKey.includes(normalizeVN(k)))
  if (airportPreset) return airportPreset[1]
  const preset = Object.entries(TRANSPORT_CITY_COORDS).find(([k]) => locKey.includes(normalizeVN(k)))
  if (preset) return preset[1]
  try {
    const geoResp = await Promise.race([
      fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(loc + ' Vietnam') + '&format=json&limit=1', {
        headers: { 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ])
    const geoData = await (geoResp as Response).json()
    if (geoData[0]) return [parseFloat(geoData[0].lat), parseFloat(geoData[0].lon)]
  } catch { /* fallback */ }
  return null
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = (b[0] - a[0]) * Math.PI / 180
  const dLon = (b[1] - a[1]) * Math.PI / 180
  const lat1 = a[0] * Math.PI / 180
  const lat2 = b[0] * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const RIDE_HAILING_APPS = [
  { name: 'Grab', link: 'https://www.grab.com/vn/transport/car/' },
  { name: 'Xanh SM', link: 'https://xanhsm.com/' },
  { name: 'Be', link: 'https://be.com.vn/' },
]

// mode: 'taxi' = uoc tinh gia trong thanh pho/quang duong ngan; khac (hoac khong co) = xe khach/tau lien tinh
async function getTransportOptions(origin: string, destination: string, mode?: string) {
  const cacheKey = 'transport:' + origin.toLowerCase().trim() + ':' + destination.toLowerCase().trim() + ':' + (mode || 'auto')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const isTaxi = mode === 'taxi'
  let result: unknown

  if (!isTaxi) {
    const vexereUrl = 'https://vexere.com/vi-VN/ket-qua-tim-kiem-ve-xe-khach?fromLocationName=' + encodeURIComponent(origin) + '&toLocationName=' + encodeURIComponent(destination)
    const trainUrl = 'https://dsvn.vn/'
    try {
      const [busResults, trainResults] = await Promise.all([
        serperSearch('ve xe khach tu ' + origin + ' di ' + destination + ' gia bao nhieu vexere futa phuong trang'),
        serperSearch('ve tau ' + origin + ' ' + destination + ' duong sat viet nam gia'),
      ])
      if ((busResults && busResults.length > 0) || (trainResults && trainResults.length > 0)) {
        result = {
          type: 'intercity',
          origin, destination,
          bus_search_results: busResults || [],
          train_search_results: trainResults || [],
          vexere_link: vexereUrl,
          train_booking_link: trainUrl,
          note: 'Gia/chuyen xe-tau la tham khao tu ket qua tim kiem hien tai, co the khac theo gio chay, loai ghe va da thay doi.'
        }
      } else {
        result = { error: 'Khong tim duoc ve xe khach/tau luc nay', vexere_link: vexereUrl, train_booking_link: trainUrl }
      }
    } catch {
      result = { error: 'Khong tim duoc ve xe khach/tau luc nay', vexere_link: vexereUrl, train_booking_link: trainUrl }
    }
  } else {
    try {
      const [a, b] = await Promise.all([geocodeForTransport(origin), geocodeForTransport(destination)])
      const rawKm = a && b ? haversineKm(a, b) : null
      const sameLocation = normalizeVN(origin.toLowerCase()).trim() === normalizeVN(destination.toLowerCase()).trim()
      if (rawKm === null || (rawKm < 0.3 && !sameLocation)) {
        // Khong xac dinh duoc toa do cu the cho 1 hoac ca 2 dia diem - khong dua so lieu sai lech
        result = {
          error: 'Khong xac dinh duoc chinh xac khoang cach cho 2 dia diem nay luc nay',
          apps: RIDE_HAILING_APPS,
          note: 'Mo app Grab/Be/Xanh SM va nhap dia chi cu the de app tinh khoang cach + gia chinh xac tu vi tri thuc te.'
        }
      } else {
        const distanceKm = Math.max(0.5, Math.round(rawKm * 10) / 10)
        const lowRate = 11000, highRate = 16000
        const baseFare = 13000
        const estLow = Math.round((baseFare + distanceKm * lowRate) / 1000) * 1000
        const estHigh = Math.round((baseFare + distanceKm * highRate) / 1000) * 1000
        result = {
          type: 'taxi',
          origin, destination,
          distance_km: distanceKm,
          estimated_fare_vnd: { low: estLow, high: estHigh },
          apps: RIDE_HAILING_APPS,
          note: 'Day la gia UOC TINH theo khoang cach duong chim va don gia trung binh xe 4 cho, KHONG phai gia chinh xac tu app - mo app de xem gia thuc te (co the cong them phi gio cao diem, phi cau duong...) va dat xe.'
        }
      }
    } catch {
      result = { error: 'Khong uoc tinh duoc khoang cach/gia xe luc nay', apps: RIDE_HAILING_APPS }
    }
  }

  setCache(cacheKey, result, 20 * 60 * 1000)
  return result
}


export const maxDuration = 60

export async function POST(req: Request) {
  const startTime = Date.now()
  const { messages, userLocation: rawUserLocation, userPreferences: rawUserPrefs } = await req.json()

  const userLocation: { lat: number; lng: number; address?: string } | null =
    rawUserLocation && typeof rawUserLocation.lat === 'number' && typeof rawUserLocation.lng === 'number'
      ? { lat: rawUserLocation.lat, lng: rawUserLocation.lng, address: rawUserLocation.address || '' }
      : null

  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const rawContent = lastUserMsg?.content
  const lastText = typeof rawContent === 'string'
    ? rawContent
    : Array.isArray(rawContent)
      ? rawContent.map((c: { text?: string }) => c.text || '').join(' ')
      : ''

  // Detect if last message contains an image
  const hasImage = Array.isArray(rawContent) && rawContent.some(
    (c: { type?: string }) => c.type === 'image' || c.type === 'image_url'
  )

  const intent = classifyIntent(lastText)
  const budget = extractBudget(lastText)
  const locationIntent = detectLocationIntent(lastText)
  const planningIntent = detectPlanningIntent(lastText)
  const lang = detectLang(lastText)
  const userMessages = messages.filter((m: { role: string }) => m.role === 'user')
  const isFirstReply = userMessages.length <= 1

  // Load user memory + kiá»ƒm tra freemium limit
  const FREE_DAILY_LIMIT = 10
  let memoryBlock = ''
  let prefBlock = ''
  let authedUserId: string | null = null
  let existingMemory: UserMemory | null = null
  let isPro = false
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      authedUserId = user.id
      const [mem, prefResult] = await Promise.all([
        getMemory(user.id),
        supabase.from('user_preferences')
          .select('budget_level, cuisine_likes, dietary_restrictions, inferred_preferences')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])
      existingMemory = mem
      if (existingMemory) memoryBlock = buildMemoryBlock(existingMemory)
      if (prefResult.data) prefBlock = buildPrefBlock(prefResult.data as UserPrefs)

      // Inject Google Calendar events if connected
      try {
        const { getUpcomingEvents, formatEventsForPrompt } = await import('@/lib/integrations/googleCalendar')
        const calEvents = await getUpcomingEvents(user.id)
        if (calEvents.length > 0) {
          memoryBlock = (memoryBlock || '') + formatEventsForPrompt(calEvents)
        }
      } catch { /* calendar optional */ }

      // Kiá»ƒm tra subscription tá»« DB
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .single()
      if (subData?.status === 'active' && subData?.current_period_end) {
        isPro = new Date(subData.current_period_end) > new Date()
      }

      if (!isPro) {
        // Äáº¿m sá»‘ tin nháº¯n user Ä‘Ã£ gá»­i hÃ´m nay (theo giá» VN UTC+7)
        const now = new Date()
        const vnOffset = 7 * 60 * 60 * 1000
        const vnMidnight = new Date(Math.floor((now.getTime() + vnOffset) / 86400000) * 86400000 - vnOffset)
        const { count } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('updated_at', vnMidnight.toISOString())

        // Æ¯á»›c tÃ­nh sá»‘ message tá»« conversations hÃ´m nay â€” Ä‘Æ¡n giáº£n: náº¿u > FREE_DAILY_LIMIT conversations thÃ¬ cháº·n
        // CÃ¡ch chÃ­nh xÃ¡c hÆ¡n cáº§n track message count riÃªng â€” dÃ¹ng táº¡m cÃ¡ch nÃ y cho MVP
        const { data: todayConvs } = await supabase
          .from('conversations')
          .select('messages')
          .eq('user_id', user.id)
          .gte('updated_at', vnMidnight.toISOString())

        const totalMsgs = (todayConvs || []).reduce((sum, c) => {
          const msgs = Array.isArray(c.messages) ? c.messages : []
          return sum + msgs.filter((m: { role: string }) => m.role === 'user').length
        }, 0)

        if (totalMsgs >= FREE_DAILY_LIMIT) {
          return new Response(
            JSON.stringify({
              error: 'free_limit_reached',
              message: `Báº¡n Ä‘Ã£ dÃ¹ng háº¿t ${FREE_DAILY_LIMIT} tin nháº¯n miá»…n phÃ­ hÃ´m nay. NÃ¢ng cáº¥p Pro Ä‘á»ƒ nháº¯n khÃ´ng giá»›i háº¡n! ðŸš€`,
              upgradeUrl: '/subscription',
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    }
  } catch { /* no-op if auth fails */ }

  // Inject freeform user preferences from client request body
  const rawPrefsArr = Array.isArray(rawUserPrefs)
    ? (rawUserPrefs as unknown[]).filter(p => typeof p === 'string').slice(0, 50) as string[]
    : []
  if (rawPrefsArr.length > 0) {
    const freeformBlock = `\n\n===== Sá»ž THÃCH & THÃ”NG TIN CÃ NHÃ‚N Cá»¦A USER =====\n${rawPrefsArr.map(p => `- ${p}`).join('\n')}\nHÃ£y luÃ´n ghi nhá»› vÃ  Ã¡p dá»¥ng nhá»¯ng sá»Ÿ thÃ­ch nÃ y khi gá»£i Ã½.\n==================================================`
    prefBlock = prefBlock ? prefBlock + freeformBlock : freeformBlock
  }

  const tier: ModelTier = (planningIntent || hasImage) ? 'planning' : isSimpleQuery(lastText, isFirstReply) ? 'simple' : 'standard'
  console.log(JSON.stringify({ type: 'tappyai_model', model: tier, planningIntent }))

  // Truncate history to last 10 messages to control token costs
  const trimmedMessages = messages.length > 10 ? messages.slice(-10) : messages

  const result = streamText({
    model: getModel(tier),
    system: intent === 'chitchat'
      ? buildSystemSimple(lang, memoryBlock)
      : buildSystem(budget, locationIntent, isFirstReply, memoryBlock, lang, prefBlock, userLocation, planningIntent, hasImage),
    experimental_providerMetadata: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    },
    messages: trimmedMessages,
    maxTokens: intent === 'chitchat' ? 300 : planningIntent ? 3000 : hasImage ? 1024 : 2048,
    maxSteps: intent === 'chitchat' ? 1 : planningIntent ? 8 : hasImage ? 3 : 5,
    experimental_prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
      if (intent === 'chitchat') return { toolChoice: 'none' as const }
      if (stepNumber === 0) {
        const forced = detectForcedTool(lastText)
        // Offline location + product search â†’ switch to search_places
        if (forced === 'search_products' && locationIntent === 'offline') {
          return { toolChoice: { type: 'tool' as const, toolName: 'search_places' } }
        }
        // No forced tool + offline location â†’ search_places (user wants physical location)
        if (!forced && locationIntent === 'offline') {
          return { toolChoice: { type: 'tool' as const, toolName: 'search_places' } }
        }
        // Unknown intent + shopping keywords â†’ no tool, ask clarification
        if (!forced && locationIntent === 'unknown' && isShoppingQuery(lastText)) {
          return { toolChoice: 'none' as const }
        }
        if (forced) return { toolChoice: { type: 'tool' as const, toolName: forced } }
        return { toolChoice: 'required' as const }
      }
      return { toolChoice: 'none' as const }
    },
    tools: {
      search_places: tool({
        description: 'Tim dia diem, nha hang, cafe, spa, khach san, benh vien, giai tri (rap phim, karaoke, gym, bar...) tai Viet Nam. Voi quan an/nha hang/cafe/spa/giai tri se kem gia mon/dich vu/ve tham khao tu Google Search (Serper)',
        parameters: z.object({
          query: z.string().describe('Tu khoa tim kiem (vd: pho ngon, cafe dep, spa tot)'),
          location: z.string().optional().describe('Khu vuc (vd: Ha Noi, Quan 1 Ho Chi Minh, Da Nang)'),
          type: z.enum(['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema']).optional()
        }),
        execute: async ({ query, location, type }) => {
          console.log(JSON.stringify({ type: 'tappyai_tool_called', tool: 'search_places', query, location, placeType: type, hasLocationBias: !!userLocation }))
          const r = await searchPlaces(query, location, type, lang, userLocation)
          return budget ? applyBudgetFilter(r, budget, query) : r
        }
      }),
      get_news: tool({
        description: 'Lay tin tuc moi nhat tu VnExpress, Tuoi Tre, Dan Tri',
        parameters: z.object({ query: z.string().describe('Tu khoa tin tuc can tim') }),
        execute: async ({ query }) => getNews(query)
      }),
      ...(locationIntent !== 'offline' ? { search_products: tool({
        description: 'Tim san pham/shop mua sam: gia tren Shopee/Tiki/Lazada, website rieng cua shop, dia chi cua hang vat ly (neu co), Facebook/TikTok cua shop - tat ca tu Google Search (Serper)',
        parameters: z.object({ query: z.string().describe('Ten san pham can tim mua') }),
        execute: async ({ query }) => {
          const r = await searchProducts(query)
          return budget ? applyBudgetFilter(r, budget, query) : r
        }
      }) } : {}),
      web_search: tool({
        description: 'Tim kiem tong quat tren internet de lay thong tin moi nhat (ty gia, gia xang, su kien, kien thuc can xac thuc...) khi cac tool khac khong phu hop',
        parameters: z.object({ query: z.string().describe('Tu khoa can tim kiem (vd: ty gia USD hom nay)') }),
        execute: async ({ query }) => webSearch(query)
      }),
      get_weather: tool({
        description: 'Lay thong tin thoi tiet hien tai va du bao hom nay (nhiet do, tinh trang troi, do am, gio) cho mot dia diem tai Viet Nam, du lieu realtime tu wttr.in',
        parameters: z.object({ location: z.string().describe('Ten thanh pho/tinh can xem thoi tiet (vd: Ha Noi, Da Nang, TP HCM)') }),
        execute: async ({ location }) => getWeather(location)
      }),
      get_gold_price: tool({
        description: 'Lay gia vang SJC, PNJ, DOJI, vang the gioi (XAU/USD) realtime, cap nhat moi 5 phut tu vang.today',
        parameters: z.object({ query: z.string().optional().describe('Loai vang user hoi, vd: SJC, PNJ, vang the gioi (khong bat buoc)') }),
        execute: async ({ query }) => getGoldPrice(query || '')
      }),
      get_flight_prices: tool({
        description: 'Tim gia ve may bay re gan nhat giua 2 thanh pho/san bay, du lieu tu Travelpayouts (Aviasales)',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten thanh pho hoac ma san bay IATA, vd: Ha Noi, HAN)'),
          destination: z.string().describe('Diem den (ten thanh pho hoac ma san bay IATA, vd: TP HCM, SGN)'),
        }),
        execute: async ({ origin, destination }) => {
          const r = await getFlightPrices(origin, destination)
          return budget ? applyBudgetFilter(r, budget, 've may bay') : r
        }
      }),
      get_hotel_prices: tool({
        description: 'Tim gia phong khach san/resort tai mot dia diem, ket hop tim kiem web (Booking.com/Agoda) va danh sach khach san tu OpenStreetMap'
          + (budget ? `. BUDGET FILTER: Chi duoc de cap khach san co gia duoi ${budget.max.toLocaleString('vi-VN')} VND. KHONG duoc de cap: Pullman, Marriott, Hilton, Sheraton, Intercontinental, Sofitel, Novotel, Melia, Hyatt, Imperial, hay bat ky khach san 4-5 sao nao (gia > 1.500.000 VND/dem). Chi lay tu search results, khong them tu kien thuc co san.` : ''),
        parameters: z.object({
          location: z.string().describe('Dia diem/thanh pho can tim khach san (vd: Da Nang, Phu Quoc, Ha Noi)'),
          checkIn: z.string().optional().describe('Ngay check-in dang YYYY-MM-DD (khong bat buoc)'),
          checkOut: z.string().optional().describe('Ngay check-out dang YYYY-MM-DD (khong bat buoc)'),
        }),
        execute: async ({ location, checkIn, checkOut }) => {
          const r = await getHotelPrices(location, checkIn, checkOut, budget?.max)
          return budget ? applyBudgetFilter(r, budget, 'khach san') : r
        }
      }),
      get_transport_options: tool({
        description: 'Tim phuong an di chuyen: ve xe khach/tau hoa giua 2 tinh/thanh pho (tim kiem web, kem link dat ve cu the), hoac uoc tinh khoang cach + gia taxi/xe cong nghe (Grab/Be/Xanh SM) cho di chuyen trong thanh pho/quang duong ngan',
        parameters: z.object({
          origin: z.string().describe('Diem di (ten tinh/thanh pho hoac dia diem cu the)'),
          destination: z.string().describe('Diem den (ten tinh/thanh pho hoac dia diem cu the)'),
          mode: z.enum(['intercity', 'taxi']).optional().describe('"intercity" cho xe khach/tau giua 2 tinh thanh, "taxi" cho di chuyen trong thanh pho/quang duong ngan bang taxi/xe cong nghe. Bo trong neu khong ro.'),
        }),
        execute: async ({ origin, destination, mode }) => getTransportOptions(origin, destination, mode === 'taxi' ? 'taxi' : undefined)
      }),
      ...(authedUserId ? {
        save_price_watch: tool({
          description: 'LÆ°u theo dÃµi giÃ¡ sáº£n pháº©m Ä‘á»ƒ thÃ´ng bÃ¡o khi giÃ¡ Ä‘áº¡t má»©c mong muá»‘n. DÃ¹ng khi user nÃ³i "theo dÃµi giÃ¡", "bÃ¡o mÃ¬nh khi giÃ¡ xuá»‘ng", "alert giÃ¡", "Tappy theo dÃµi giÃ¡ X khi dÆ°á»›i Y"',
          parameters: z.object({
            product_name: z.string().describe('TÃªn sáº£n pháº©m cáº§n theo dÃµi, vÃ­ dá»¥: AirPods Pro, Samsung Galaxy S25'),
            target_price: z.number().describe('GiÃ¡ má»¥c tiÃªu báº±ng VND (sá»‘ nguyÃªn), vÃ­ dá»¥: 2000000'),
            search_query: z.string().describe('Query tÃ¬m kiáº¿m giÃ¡ sáº£n pháº©m nÃ y, vÃ­ dá»¥: AirPods Pro 2 giÃ¡ Shopee Tiki'),
          }),
          execute: async ({ product_name, target_price, search_query }) => {
            if (!authedUserId) return { error: 'Cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ theo dÃµi giÃ¡' }
            try {
              const supabaseW = createClient()
              const { count } = await supabaseW
                .from('price_watches')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', authedUserId)
                .eq('status', 'active')
              if ((count ?? 0) >= 10) return { error: 'Báº¡n Ä‘Ã£ theo dÃµi tá»‘i Ä‘a 10 sáº£n pháº©m. Há»§y bá»›t Ä‘á»ƒ thÃªm má»›i.' }
              const { data, error } = await supabaseW
                .from('price_watches')
                .insert({ user_id: authedUserId, product_name, target_price: Math.round(target_price), search_query })
                .select('id')
                .single()
              if (error) return { error: 'Lá»—i lÆ°u theo dÃµi: ' + error.message }
              return { ok: true, id: data.id, product_name, target_price, message: `ÄÃ£ lÆ°u! Tappy sáº½ kiá»ƒm tra giÃ¡ ${product_name} má»—i 6 tiáº¿ng vÃ  bÃ¡o báº¡n khi xuá»‘ng dÆ°á»›i ${(target_price / 1000000).toFixed(1)} triá»‡u.` }
            } catch (e) {
              return { error: String(e) }
            }
          }
        }),
      } : {}),
    },
    onFinish: async ({ usage, finishReason, text }) => {
      console.log(JSON.stringify({
        type: 'tappyai_usage',
        intent,
        finishReason,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        elapsedMs: Date.now() - startTime,
        cacheSize: cache.size,
      }))
      // Extract + save memory from this conversation (server-side, same auth context)
      if (authedUserId) {
        try {
          const convMessages = [
            ...messages.map((m: { role: string; content: unknown }) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            { role: 'assistant', content: text },
          ]
          const extracted = await extractMemoryFromConversation(convMessages, existingMemory)
          if (Object.keys(extracted).length > 0) {
            await updateMemory(authedUserId, {
              location_base: extracted.location_base ?? existingMemory?.location_base ?? null,
              companions: extracted.companions ?? existingMemory?.companions ?? null,
              timing: extracted.timing ?? existingMemory?.timing ?? null,
              personality: extracted.personality ?? existingMemory?.personality ?? null,
              preferences: { ...(existingMemory?.preferences || {}), ...(extracted.preferences || {}) },
              budget: { ...(existingMemory?.budget || {}), ...(extracted.budget || {}) },
              history: extracted.history ?? existingMemory?.history ?? [],
            })
          }
        } catch (e) {
          console.error('Memory extract/save error:', e)
        }
      }
    },
  })
  const baseResponse = result.toDataStreamResponse()
  return (budget && budget.max < LUXURY_PRICE_FLOOR)
    ? applyLuxuryStreamFilter(baseResponse)
    : baseResponse
}

