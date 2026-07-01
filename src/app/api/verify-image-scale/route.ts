// THROWAWAY large-scale validation endpoint — 105 real Vietnam places across 7 categories.
// Measures each image source (official website / Google Places / Serper) INDEPENDENTLY
// (not short-circuited) to get true per-source success rates, plus the actual final source
// the real production chain (website > google > serper > none) would pick.
// No application logic touched. Removed after data collection.

import { fetchOfficialWebsiteImage, fetchPlacePhoto, fetchPlacePhotoByName } from '@/lib/ai/tools/common'

export const maxDuration = 60

type Place = { q: string; loc: string; cat: string; fame: 'famous' | 'lesser-known' }

const PLACES: Place[] = [
  // Restaurants
  { q: "Pizza 4P's Hai Ba Trung", loc: 'Ho Chi Minh', cat: 'restaurant', fame: 'famous' },
  { q: 'Cuc Gach Quan', loc: 'Ho Chi Minh', cat: 'restaurant', fame: 'famous' },
  { q: 'Quan An Ngon', loc: 'Hanoi', cat: 'restaurant', fame: 'famous' },
  { q: 'Bun Cha Huong Lien', loc: 'Hanoi', cat: 'restaurant', fame: 'famous' },
  { q: 'Banh Xeo 46A', loc: 'Ho Chi Minh', cat: 'restaurant', fame: 'famous' },
  { q: 'Nha Hang Ngon Restaurant', loc: 'Ho Chi Minh', cat: 'restaurant', fame: 'famous' },
  { q: 'Secret Garden Restaurant', loc: 'Ho Chi Minh', cat: 'restaurant', fame: 'famous' },
  { q: 'Skewers Restaurant', loc: 'Hoi An', cat: 'restaurant', fame: 'famous' },
  { q: 'Madam Lan', loc: 'Hue', cat: 'restaurant', fame: 'famous' },
  { q: 'Bun Bo Hue Dong Ba', loc: 'Hue', cat: 'restaurant', fame: 'lesser-known' },
  { q: 'Pho Thin Lo Duc', loc: 'Hanoi', cat: 'restaurant', fame: 'famous' },
  { q: 'Quan Bui Restaurant', loc: 'Ho Chi Minh', cat: 'restaurant', fame: 'famous' },
  { q: 'Cha Ca La Vong', loc: 'Hanoi', cat: 'restaurant', fame: 'famous' },
  { q: 'nha hang hai san binh dan', loc: 'Vung Tau', cat: 'restaurant', fame: 'lesser-known' },
  { q: 'quan com tam binh dan', loc: 'Quan 3 Ho Chi Minh', cat: 'restaurant', fame: 'lesser-known' },
  { q: 'quan bun rieu nho', loc: 'Quan 5 Ho Chi Minh', cat: 'restaurant', fame: 'lesser-known' },
  // Cafes
  { q: 'The Coffee House Nguyen Hue', loc: 'Ho Chi Minh', cat: 'cafe', fame: 'famous' },
  { q: 'Highlands Coffee Landmark 81', loc: 'Ho Chi Minh', cat: 'cafe', fame: 'famous' },
  { q: 'Cong Caphe', loc: 'Hanoi', cat: 'cafe', fame: 'famous' },
  { q: 'Cheese Coffee', loc: 'Da Lat', cat: 'cafe', fame: 'famous' },
  { q: "L'Usine Le Loi", loc: 'Ho Chi Minh', cat: 'cafe', fame: 'famous' },
  { q: 'Trung Nguyen Legend Cafe', loc: 'Ho Chi Minh', cat: 'cafe', fame: 'famous' },
  { q: 'Loading T Cafe', loc: 'Da Lat', cat: 'cafe', fame: 'famous' },
  { q: 'An Cafe', loc: 'Hoi An', cat: 'cafe', fame: 'lesser-known' },
  { q: 'Runam Bistro', loc: 'Ho Chi Minh', cat: 'cafe', fame: 'famous' },
  { q: 'quan ca phe nho pho co', loc: 'Hoi An', cat: 'cafe', fame: 'lesser-known' },
  { q: 'ca phe vot Cheo Leo', loc: 'Ho Chi Minh', cat: 'cafe', fame: 'lesser-known' },
  { q: 'quan ca phe san vuon', loc: 'Da Lat', cat: 'cafe', fame: 'lesser-known' },
  { q: 'ca phe trung Giang', loc: 'Hanoi', cat: 'cafe', fame: 'famous' },
  { q: 'quan ca phe goc pho', loc: 'Hoan Kiem Hanoi', cat: 'cafe', fame: 'lesser-known' },
  { q: 'Phin Coffee House', loc: 'Ho Chi Minh', cat: 'cafe', fame: 'lesser-known' },
  // Hotels
  { q: 'InterContinental Danang Sun Peninsula', loc: 'Da Nang', cat: 'hotel', fame: 'famous' },
  { q: 'Vinpearl Resort', loc: 'Nha Trang', cat: 'hotel', fame: 'famous' },
  { q: 'Sofitel Legend Metropole', loc: 'Hanoi', cat: 'hotel', fame: 'famous' },
  { q: 'Reverie Saigon', loc: 'Ho Chi Minh', cat: 'hotel', fame: 'famous' },
  { q: 'JW Marriott Phu Quoc', loc: 'Phu Quoc', cat: 'hotel', fame: 'famous' },
  { q: 'Fusion Maia', loc: 'Da Nang', cat: 'hotel', fame: 'famous' },
  { q: 'Ana Mandara', loc: 'Nha Trang', cat: 'hotel', fame: 'famous' },
  { q: 'Anantara Hoi An Resort', loc: 'Hoi An', cat: 'hotel', fame: 'famous' },
  { q: 'Dalat Palace Heritage Hotel', loc: 'Da Lat', cat: 'hotel', fame: 'famous' },
  { q: 'Caravelle Saigon', loc: 'Ho Chi Minh', cat: 'hotel', fame: 'famous' },
  { q: 'Rex Hotel Saigon', loc: 'Ho Chi Minh', cat: 'hotel', fame: 'famous' },
  { q: 'khach san nho pho co', loc: 'Hoi An', cat: 'hotel', fame: 'lesser-known' },
  { q: 'homestay trung tam', loc: 'Da Lat', cat: 'hotel', fame: 'lesser-known' },
  { q: 'khach san ven bien', loc: 'Vung Tau', cat: 'hotel', fame: 'lesser-known' },
  { q: 'nha nghi binh dan', loc: 'Nha Trang', cat: 'hotel', fame: 'lesser-known' },
  { q: 'khach san 2 sao gan trung tam', loc: 'Can Tho', cat: 'hotel', fame: 'lesser-known' },
  // Attractions
  { q: 'Ba Na Hills', loc: 'Da Nang', cat: 'attraction', fame: 'famous' },
  { q: 'Hoi An Ancient Town', loc: 'Hoi An', cat: 'attraction', fame: 'famous' },
  { q: 'Cu Chi Tunnels', loc: 'Ho Chi Minh', cat: 'attraction', fame: 'famous' },
  { q: 'My Son Sanctuary', loc: 'Quang Nam', cat: 'attraction', fame: 'famous' },
  { q: 'Trang An Scenic Landscape', loc: 'Ninh Binh', cat: 'attraction', fame: 'famous' },
  { q: 'Sword Lake Hoan Kiem', loc: 'Hanoi', cat: 'attraction', fame: 'famous' },
  { q: 'Marble Mountains', loc: 'Da Nang', cat: 'attraction', fame: 'famous' },
  { q: 'Dalat Railway Station', loc: 'Da Lat', cat: 'attraction', fame: 'famous' },
  { q: 'Con Dao National Park', loc: 'Con Dao', cat: 'attraction', fame: 'lesser-known' },
  { q: 'Fansipan Legend', loc: 'Sapa', cat: 'attraction', fame: 'famous' },
  { q: 'Golden Bridge Ba Na Hills', loc: 'Da Nang', cat: 'attraction', fame: 'famous' },
  { q: 'Notre Dame Cathedral', loc: 'Ho Chi Minh', cat: 'attraction', fame: 'famous' },
  { q: 'Thien Mu Pagoda', loc: 'Hue', cat: 'attraction', fame: 'famous' },
  { q: 'Mui Ne Sand Dunes', loc: 'Phan Thiet', cat: 'attraction', fame: 'famous' },
  { q: 'Phong Nha Cave', loc: 'Quang Binh', cat: 'attraction', fame: 'famous' },
  // Shopping
  { q: 'Vincom Center Dong Khoi', loc: 'Ho Chi Minh', cat: 'shopping', fame: 'famous' },
  { q: 'Ben Thanh Market', loc: 'Ho Chi Minh', cat: 'shopping', fame: 'famous' },
  { q: 'Takashimaya', loc: 'Ho Chi Minh', cat: 'shopping', fame: 'famous' },
  { q: 'Aeon Mall Tan Phu', loc: 'Ho Chi Minh', cat: 'shopping', fame: 'famous' },
  { q: 'Dong Xuan Market', loc: 'Hanoi', cat: 'shopping', fame: 'famous' },
  { q: 'Saigon Centre', loc: 'Ho Chi Minh', cat: 'shopping', fame: 'famous' },
  { q: 'Han Market', loc: 'Da Nang', cat: 'shopping', fame: 'famous' },
  { q: 'Vincom Plaza', loc: 'Da Lat', cat: 'shopping', fame: 'famous' },
  { q: 'Lotte Mart', loc: 'Nha Trang', cat: 'shopping', fame: 'famous' },
  { q: 'cho dem', loc: 'Hoi An', cat: 'shopping', fame: 'lesser-known' },
  { q: 'cua hang luu niem pho co', loc: 'Hanoi', cat: 'shopping', fame: 'lesser-known' },
  { q: 'Cho Da Lat', loc: 'Da Lat', cat: 'shopping', fame: 'famous' },
  { q: 'Cho Han', loc: 'Da Nang', cat: 'shopping', fame: 'famous' },
  { q: 'cua hang do thu cong my nghe', loc: 'Hue', cat: 'shopping', fame: 'lesser-known' },
  // Spa
  { q: 'Anam QT Spa', loc: 'Ho Chi Minh', cat: 'spa', fame: 'famous' },
  { q: "L'Apothiquaire Spa", loc: 'Ho Chi Minh', cat: 'spa', fame: 'famous' },
  { q: 'Zen Spa', loc: 'Hoi An', cat: 'spa', fame: 'famous' },
  { q: 'Amanoi Wellness Spa', loc: 'Ninh Thuan', cat: 'spa', fame: 'famous' },
  { q: 'Serenity Spa', loc: 'Nha Trang', cat: 'spa', fame: 'lesser-known' },
  { q: 'Le Spa du Metropole', loc: 'Hanoi', cat: 'spa', fame: 'famous' },
  { q: 'Tia Wellness Resort', loc: 'Nha Trang', cat: 'spa', fame: 'famous' },
  { q: 'Golden Lotus Spa', loc: 'Hanoi', cat: 'spa', fame: 'famous' },
  { q: 'quan massage chan binh dan', loc: 'Quan 1 Ho Chi Minh', cat: 'spa', fame: 'lesser-known' },
  { q: 'spa goi dau duong sinh', loc: 'Da Lat', cat: 'spa', fame: 'lesser-known' },
  { q: 'Vietnamese Massage', loc: 'Hoi An', cat: 'spa', fame: 'lesser-known' },
  { q: 'spa nho pho co', loc: 'Hoi An', cat: 'spa', fame: 'lesser-known' },
  { q: 'massage body gia re', loc: 'Nha Trang', cat: 'spa', fame: 'lesser-known' },
  { q: 'foot massage', loc: 'Vung Tau', cat: 'spa', fame: 'lesser-known' },
  { q: 'Miss Ao Dai Spa', loc: 'Ho Chi Minh', cat: 'spa', fame: 'lesser-known' },
  // Entertainment
  { q: 'CGV Vincom Landmark 81', loc: 'Ho Chi Minh', cat: 'entertainment', fame: 'famous' },
  { q: 'Lotte Cinema', loc: 'Hanoi', cat: 'entertainment', fame: 'famous' },
  { q: 'Bui Vien Walking Street', loc: 'Ho Chi Minh', cat: 'entertainment', fame: 'famous' },
  { q: 'Sun World Ba Na Hills', loc: 'Da Nang', cat: 'entertainment', fame: 'famous' },
  { q: 'VinWonders', loc: 'Nha Trang', cat: 'entertainment', fame: 'famous' },
  { q: 'Dam Sen Water Park', loc: 'Ho Chi Minh', cat: 'entertainment', fame: 'famous' },
  { q: 'Sky36 Bar', loc: 'Da Nang', cat: 'entertainment', fame: 'famous' },
  { q: 'Bitexco Skydeck', loc: 'Ho Chi Minh', cat: 'entertainment', fame: 'famous' },
  { q: 'Saigon Water Park', loc: 'Ho Chi Minh', cat: 'entertainment', fame: 'famous' },
  { q: 'karaoke ICOOL', loc: 'Quan 1 Ho Chi Minh', cat: 'entertainment', fame: 'lesser-known' },
  { q: 'quan bar nho pho Tay', loc: 'Bui Vien Ho Chi Minh', cat: 'entertainment', fame: 'lesser-known' },
  { q: 'khu vui choi tre em Times City', loc: 'Hanoi', cat: 'entertainment', fame: 'famous' },
  { q: 'bowling', loc: 'Vincom Da Lat', cat: 'entertainment', fame: 'lesser-known' },
  { q: 'rap chieu phim nho', loc: 'Can Tho', cat: 'entertainment', fame: 'lesser-known' },
]

const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.websiteUri'

async function resolvePlace(p: Place) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const resp = await Promise.race([
    fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key ?? '', 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({ textQuery: `${p.q} ${p.loc}`, languageCode: 'vi', regionCode: 'VN' }),
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('search_timeout')), 6000)),
  ])
  const d = await (resp as Response).json()
  const top = d.places?.[0]
  if (!top) return null
  return {
    place_id: top.id as string,
    name: (top.displayName as { text?: string })?.text ?? '',
    websiteUri: top.websiteUri as string | undefined,
  }
}

async function timeIt<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T | null; error: string | null }> {
  const start = Date.now()
  try {
    const value = await fn()
    return { ms: Date.now() - start, value, error: null }
  } catch (e) {
    return { ms: Date.now() - start, value: null, error: String(e).slice(0, 100) }
  }
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  async function next(): Promise<void> {
    const i = idx++
    if (i >= items.length) return
    results[i] = await worker(items[i])
    return next()
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
  return results
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const batch = url.searchParams.get('batch') ?? '1'
  const half = Math.ceil(PLACES.length / 2)
  const slice = batch === '2' ? PLACES.slice(half) : PLACES.slice(0, half)

  const runStart = Date.now()
  const rows = await runPool(slice, 10, async (p) => {
    const row: Record<string, unknown> = { query: p.q, location: p.loc, category: p.cat, fame: p.fame }
    try {
      const resolved = await resolvePlace(p)
      if (!resolved) {
        row.resolved = false
        row.runtime_error = 'place_not_found'
        return row
      }
      row.resolved = true
      row.resolved_name = resolved.name
      row.has_website = !!resolved.websiteUri

      const [website, google, serper] = await Promise.all([
        resolved.websiteUri
          ? timeIt(() => fetchOfficialWebsiteImage(resolved.websiteUri as string))
          : Promise.resolve({ ms: 0, value: null, error: 'no_website' }),
        timeIt(async () => {
          const detailResp = await Promise.race([
            fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${resolved.place_id}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('detail_timeout')), 2500)),
          ])
          const detail = await (detailResp as Response).json()
          const photoRef = (detail.result?.photos as Array<{ photo_reference: string }>)?.[0]?.photo_reference
          if (!photoRef) return null
          return fetchPlacePhoto(resolved.place_id, photoRef)
        }),
        timeIt(() => fetchPlacePhotoByName(resolved.place_id, resolved.name)),
      ])

      row.website_success = !!website.value
      row.website_ms = website.ms
      row.website_error = website.error
      row.website_url = (website.value as string | null)?.slice(0, 90) ?? null

      row.google_success = !!google.value
      row.google_ms = google.ms
      row.google_error = google.error

      row.serper_success = !!serper.value
      row.serper_ms = serper.ms
      row.serper_error = serper.error
      row.serper_url = (serper.value as string | null)?.slice(0, 90) ?? null

      const finalSource = website.value ? 'website' : google.value ? 'google' : serper.value ? 'serper' : 'none'
      row.final_source = finalSource
      row.final_url = (website.value ?? google.value ?? serper.value ?? null) as string | null
      row.chain_latency_ms =
        finalSource === 'website' ? website.ms :
        finalSource === 'google' ? website.ms + google.ms :
        finalSource === 'serper' ? website.ms + google.ms + serper.ms :
        website.ms + google.ms + serper.ms
      row.runtime_error = null
    } catch (e) {
      row.runtime_error = String(e).slice(0, 150)
    }
    return row
  })

  return Response.json({
    batch,
    tested_in_batch: slice.length,
    total_places: PLACES.length,
    wall_time_ms: Date.now() - runStart,
    rows,
  })
}
