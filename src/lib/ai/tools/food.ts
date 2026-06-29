import { getCache, setCache, serperSearch, fetchPlacePhoto } from './common'
import { normalizeVN } from '@/lib/ai/intent'
import { createClient } from '@/lib/supabase/server'

export async function getNews(query: string) {
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


export async function searchPlacesOSM(query: string, location?: string) {
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

export async function searchPlaces(query: string, location?: string, type?: string, lang = 'vi', locationBias?: { lat: number; lng: number } | null) {
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
                fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
              ])
              const detail = await (detailResp as Response).json()
              const photoRef = (detail.result?.photos as Array<{ photo_reference: string }>)?.[0]?.photo_reference
              if (photoRef) return fetchPlacePhoto(placeId, photoRef)
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
            google_rating: r.rating ? `${r.rating}⭐ (${(r.userRatingCount as number | undefined)?.toLocaleString('vi-VN') ?? r.userRatingCount} đánh giá Google Maps)` : null,
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
