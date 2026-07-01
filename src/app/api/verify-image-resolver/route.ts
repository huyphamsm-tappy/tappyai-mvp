// THROWAWAY verification endpoint — exercises the real production searchPlaces() function
// for the 5 required MVP test places. No application logic here; removed after verification.

import { searchPlaces } from '@/lib/ai/tools/food'

const TESTS: Array<{ query: string; location: string }> = [
  { query: 'Highlands Coffee Nguyen Hue', location: 'Ho Chi Minh' },
  { query: "Pizza 4P's District 1", location: 'Ho Chi Minh' },
  { query: 'InterContinental Saigon', location: 'Ho Chi Minh' },
  { query: 'CGV Landmark 81', location: 'Ho Chi Minh' },
  { query: 'Anam QT Spa', location: 'Ho Chi Minh' },
]

function hostOf(u: string | null | undefined): string | null {
  if (!u) return null
  try { return new URL(u).hostname } catch { return 'invalid' }
}

export async function GET() {
  const results: Record<string, unknown>[] = []
  let errorCount = 0

  for (const t of TESTS) {
    const entry: Record<string, unknown> = { query: t.query }
    try {
      const r = (await searchPlaces(t.query, t.location)) as Record<string, unknown>
      const places = r?.results as Array<Record<string, unknown>> | undefined
      const top = places?.[0]

      entry.source = r?.source ?? null
      entry.top_place = top
        ? {
            name: top.name,
            address: top.address,
            google_rating: top.google_rating,
            maps_link: top.maps_link,
            website_uri: top.website_uri ?? null,
            photo_url: top.photo_url ?? null,
            photo_host: hostOf(top.photo_url as string | undefined),
            order_links: top.order_links ?? null,
            platform_links: top.platform_links ?? null,
          }
        : null
      entry.has_image = !!top?.photo_url
      entry.has_action_link = !!(top?.order_links || top?.platform_links || top?.maps_link)
    } catch (e) {
      errorCount++
      entry.error = String(e)
    }
    results.push(entry)
  }

  return Response.json({
    timestamp: new Date().toISOString(),
    tested: TESTS.length,
    runtime_errors: errorCount,
    results,
    summary: {
      all_have_image: results.every(r => r.has_image === true),
      all_have_action_link: results.every(r => r.has_action_link === true),
      zero_runtime_errors: errorCount === 0,
    },
  })
}
