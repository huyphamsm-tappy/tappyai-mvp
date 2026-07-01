import { getCache, setCache, serperSearch, webSearch, fetchPlacePhotosByName } from './common'
import { normalizeVN } from '@/lib/ai/intent'
import { LUXURY_KEYWORDS } from '@/lib/ai/budget'
import { searchPlacesOSM } from './food'

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

export async function getFlightPrices(origin: string, destination: string) {
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
export async function getHotelPrices(location: string, checkIn?: string, checkOut?: string, maxBudgetVnd?: number) {
  const cacheKey = 'hotels:' + location.toLowerCase().trim() + ':' + (checkIn || '') + ':' + (checkOut || '') + ':' + (maxBudgetVnd || '')
  const cached = getCache(cacheKey)
  if (cached) return cached

  const bookingUrl = 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(location)
    + (checkIn ? '&checkin=' + checkIn : '') + (checkOut ? '&checkout=' + checkOut : '')
  const agodaUrl = 'https://www.agoda.com/vi-vn/search?q=' + encodeURIComponent(location)
    + (checkIn ? '&checkIn=' + checkIn : '') + (checkOut ? '&checkOut=' + checkOut : '')
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
    // Tim rieng tung ten → Google tra ve trang hotel cu the, khong phai trang search chung
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

    // search_results (Booking/Agoda snippets) is the PRIMARY content the AI describes with
    // names/prices, but has no image field of its own — only hotel_list (OSM) did. Attach
    // photos by hotel name here too, same Serper-image mechanism food.ts already uses.
    if (searchResults && searchResults.length > 0) {
      const topResults = searchResults.slice(0, 5)
      const photoLists = await Promise.all(topResults.map(r => fetchPlacePhotosByName(r.link, r.title)))
      searchResults = searchResults.map((r, idx) =>
        idx < photoLists.length && photoLists[idx].length > 0
          ? { ...r, photo_url: photoLists[idx][0], photo_urls: photoLists[idx] }
          : r
      )
    }

    if (searchResults && searchResults.length > 0) {
      result = {
        location,
        source,
        search_results: searchResults,
        hotel_list: hotelList,
        booking_link: bookingUrl,
        agoda_link: agodaUrl,
        _debug_budget: maxBudgetVnd ? 'detected:' + maxBudgetVnd : 'null',
        note: 'Gia trong search_results la tham khao tu ket qua tim kiem hien tai, co the khong dung loai phong/ngay user hoi va da thay doi - bam booking_link de xem gia chinh xac realtime theo ngay cu the.'
      }
    } else {
      result = {
        error: 'Khong tim duoc thong tin gia phong luc nay',
        hotel_list: hotelList,
        booking_link: bookingUrl,
        agoda_link: agodaUrl,
        _debug_budget: maxBudgetVnd ? 'detected:' + maxBudgetVnd : 'null',
        note: 'Xem va dat phong tai: ' + bookingUrl,
        search_url: bookingUrl,
      }
    }
  } catch {
    result = { error: 'Khong lay duoc gia phong khach san luc nay', booking_link: bookingUrl, agoda_link: agodaUrl, note: 'Xem va dat phong tai: ' + bookingUrl, search_url: bookingUrl }
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
export async function getTransportOptions(origin: string, destination: string, mode?: string) {
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
