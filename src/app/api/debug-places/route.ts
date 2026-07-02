// PRODUCTION RESPONSE VERIFICATION endpoint
// Tests the COMPLETE image + platform-link pipeline with real execution across all categories.
// Uses the SAME functions production uses (pickEmbeddableImageUrl + platformLinks builders).

import { pickEmbeddableImageUrl } from '@/lib/ai/tools/common'
import { buildFoodOrderLinks } from '@/lib/platformLinks/food'
import { buildShoppingLinks } from '@/lib/platformLinks/shopping'
import { buildTravelLinks } from '@/lib/platformLinks/travel'
import { buildSpaLinks } from '@/lib/platformLinks/spa'
import { buildEntertainmentLinks } from '@/lib/platformLinks/entertainment'

const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri'

type Cat = 'food' | 'travel' | 'spa' | 'entertainment' | 'shopping'
const QUERIES: Array<{ q: string; cat: Cat; city?: string }> = [
  { q: 'Highlands Coffee Nguyen Hue', cat: 'food', city: 'Ho Chi Minh' },
  { q: "Pizza 4P's District 1", cat: 'food', city: 'Ho Chi Minh' },
  { q: 'InterContinental Saigon', cat: 'travel', city: 'Ho Chi Minh' },
  { q: 'Anam QT Spa', cat: 'spa', city: 'Ho Chi Minh' },
  { q: 'CGV Landmark 81', cat: 'entertainment', city: 'Ho Chi Minh' },
  { q: 'iPhone 15 Pro Max', cat: 'shopping' },
]

function hostOf(u: string | null | undefined): string | null {
  if (!u) return null
  try { return new URL(u).hostname } catch { return 'invalid' }
}

// Dev works without a token; production requires Bearer CRON_SECRET so this
// paid-API diagnostic can't be hit anonymously (cost + info-disclosure).
function authorized(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const key = process.env.GOOGLE_PLACES_API_KEY
  const serperKey = process.env.SERPER_API_KEY
  const results: Record<string, unknown>[] = []

  for (const { q, cat, city } of QUERIES) {
    const r: Record<string, unknown> = { query: q, category: cat }

    // ── Shopping: no place search; just generate product links ──
    if (cat === 'shopping') {
      const links = buildShoppingLinks(q)
      // image via Serper for the product
      let imageUrl: string | null = null
      let imageHost: string | null = null
      if (serperKey) {
        try {
          const sr = await fetch('https://google.serper.dev/images', {
            method: 'POST',
            headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 5 }),
          })
          const sd = await sr.json()
          imageUrl = pickEmbeddableImageUrl(sd?.images)
          imageHost = hostOf(imageUrl)
        } catch { /* ignore */ }
      }
      r.platform_links = links
      r.image = { chosen_url: imageUrl?.slice(0, 100) ?? null, host: imageHost, embeddable: imageHost?.includes('gstatic') || imageHost?.includes('googleusercontent') || false }
      r.checks = {
        '✓ shopping_links_count': links.length,
        '✓ has_shopee': links.some(l => l.url.includes('shopee.vn')),
        '✓ has_lazada': links.some(l => l.url.includes('lazada.vn')),
        '✓ has_tiki': links.some(l => l.url.includes('tiki.vn')),
        '✓ has_tiktok': links.some(l => l.url.includes('tiktok.com')),
        '✓ no_tappyai_booking': !JSON.stringify(links).includes('TappyAI') && !JSON.stringify(links).includes('/service/'),
      }
      results.push(r)
      continue
    }

    // ── Stage 1: Places search ──
    let place: Record<string, unknown> | null = null
    try {
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key ?? '', 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify({ textQuery: city ? `${q} ${city}` : q, languageCode: 'vi', regionCode: 'VN' }),
      })
      const d = await resp.json()
      place = (d.places ?? [])[0] ?? null
      r.stage1_place_search = {
        http_status: resp.status,
        found: !!place,
        name: place ? (place.displayName as { text?: string })?.text : null,
        place_id: place?.id ?? null,
        address: place?.formattedAddress ?? null,
        rating: place?.rating ?? null,
        website_uri: place?.websiteUri ?? null,
        maps_link: place?.googleMapsUri ?? null,
        api_error: d.error?.message ?? null,
      }
    } catch (e) {
      r.stage1_place_search = { error: String(e), found: false }
    }

    const placeName = place ? (place.displayName as { text?: string })?.text ?? q : q
    const websiteUri = (place?.websiteUri as string | undefined) ?? undefined
    const mapsLink = (place?.googleMapsUri as string | undefined) ?? undefined

    // ── Stage 2: Image via Serper (using REAL pickEmbeddableImageUrl) ──
    let chosenImage: string | null = null
    let imgServerLoad: Record<string, unknown> = {}
    let serperDump: unknown[] = []
    if (serperKey) {
      try {
        const sr = await fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: placeName, gl: 'vn', hl: 'vi', num: 5 }),
        })
        const sd = await sr.json()
        const imgs = (sd?.images ?? []) as Array<{ imageUrl?: string; thumbnailUrl?: string }>
        serperDump = imgs.slice(0, 3).map(i => ({
          imageUrl_host: hostOf(i.imageUrl),
          thumbnailUrl_host: hostOf(i.thumbnailUrl),
        }))
        chosenImage = pickEmbeddableImageUrl(imgs)
        // Server-side load check (note: hotlink protection is browser-Referer based, so this is
        // only a sanity check that the URL resolves; gstatic host guarantees browser embeddability)
        if (chosenImage) {
          try {
            const ir = await fetch(chosenImage, { method: 'GET' })
            imgServerLoad = {
              http_status: ir.status,
              content_type: ir.headers.get('content-type'),
              is_image: (ir.headers.get('content-type') ?? '').startsWith('image/'),
            }
          } catch (e) {
            imgServerLoad = { error: String(e) }
          }
        }
      } catch (e) {
        serperDump = [{ error: String(e) }]
      }
    }
    const imgHost = hostOf(chosenImage)
    const embeddable = !!imgHost && (imgHost.includes('gstatic') || imgHost.includes('googleusercontent') || imgHost.includes('ggpht') || imgHost.includes('bing'))
    r.stage2_image = {
      serper_first3_hosts: serperDump,
      chosen_url: chosenImage?.slice(0, 110) ?? null,
      chosen_host: imgHost,
      is_embeddable_google_or_bing_cdn: embeddable,
      server_load: imgServerLoad,
      image_markdown: chosenImage ? `![Ảnh địa điểm](${chosenImage.slice(0, 60)}...)` : null,
    }

    // ── Stage 3: Platform links (REAL builder functions) ──
    let links: Array<{ name: string; url: string }> = []
    if (cat === 'food') links = buildFoodOrderLinks(placeName, place?.formattedAddress as string | undefined, city)
    else if (cat === 'travel') links = buildTravelLinks(placeName, city)
    else if (cat === 'spa') links = buildSpaLinks(placeName, websiteUri, mapsLink)
    else if (cat === 'entertainment') links = buildEntertainmentLinks(placeName, websiteUri, mapsLink)
    r.stage3_platform_links = links

    // ── Per-category checks ──
    const checks: Record<string, unknown> = {
      '✓ place_found': !!place,
      '✓ image_present': !!chosenImage,
      '✓ image_embeddable_cdn': embeddable,
      '✓ no_tappyai_booking_in_links': !JSON.stringify(links).includes('/service/') && !JSON.stringify(links).toLowerCase().includes('qua tappyai'),
    }
    if (cat === 'food') {
      checks['✓ has_shopeefood'] = links.some(l => l.url.includes('shopeefood.vn'))
      checks['✓ has_grabfood'] = links.some(l => l.url.includes('food.grab.com'))
      checks['✓ has_befood'] = links.some(l => l.url.includes('be.com.vn'))
    } else if (cat === 'travel') {
      checks['✓ has_booking'] = links.some(l => l.url.includes('booking.com'))
      checks['✓ has_agoda'] = links.some(l => l.url.includes('agoda.com'))
      checks['✓ has_grab'] = links.some(l => l.name === 'Grab')
      checks['✓ has_xanhsm'] = links.some(l => l.name === 'Xanh SM')
      checks['✓ booking_uses_hotel_name'] = links.some(l => l.url.includes('booking.com') && l.url.toLowerCase().includes(encodeURIComponent(placeName.split(' ')[0]).toLowerCase()))
    } else if (cat === 'spa' || cat === 'entertainment') {
      checks['✓ has_google_maps'] = links.some(l => l.name === 'Google Maps')
      checks['✓ official_website_if_available'] = websiteUri ? links.some(l => l.name === 'Official Website') : 'N/A (no websiteUri)'
    }
    r.checks = checks
    results.push(r)
  }

  // ── Overall verdict ──
  const flatChecks = results.flatMap(r => Object.entries((r.checks ?? {}) as Record<string, unknown>))
  const failed = flatChecks.filter(([k, v]) => k.startsWith('✓') && (v === false)).map(([k]) => k)
  const imageWorks = results.filter(r => r.category !== 'shopping').every(r => (r.checks as Record<string, unknown>)?.['✓ image_embeddable_cdn'] === true)
  const noBooking = results.every(r => {
    const c = r.checks as Record<string, unknown>
    return c?.['✓ no_tappyai_booking_in_links'] === true || c?.['✓ no_tappyai_booking'] === true
  })

  return Response.json({
    report: 'PRODUCTION RESPONSE VERIFICATION',
    timestamp: new Date().toISOString(),
    env: {
      GOOGLE_PLACES_API_KEY: key ? 'SET' : 'MISSING',
      SERPER_API_KEY: serperKey ? 'SET' : 'MISSING',
    },
    note_on_images: 'Google CDN (lh3.googleusercontent.com) is UNAVAILABLE — the API key has no Places Photo billing (proven: new API returns 0 photos, old API REQUEST_DENIED). Images are sourced from Serper and now prefer the Google-hosted gstatic thumbnail (encrypted-tbn0.gstatic.com), which is a Google CDN with NO hotlink protection and renders reliably in the browser.',
    per_query: results,
    summary: {
      all_images_embeddable: imageWorks,
      no_tappyai_booking_anywhere: noBooking,
      failed_checks: failed,
      conclusion: imageWorks && noBooking && failed.length === 0 ? '🟢 PRODUCTION READY' : `🔴 ${failed.length} check(s) failed`,
    },
  })
}
