// IMAGE PIPELINE PROOF endpoint
// Tests the CORRECTED pipeline (old Places Details API → photo_reference → old Maps photo URL)
// Query: "Highlands Coffee Nguyen Hue Ho Chi Minh"

const TEST_QUERY = 'Highlands Coffee Nguyen Hue Ho Chi Minh'
// places.photos excluded — key is restricted to old Places API for photos; new API silently returns 0
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri'

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const serperKey = process.env.SERPER_API_KEY
  const trace: Record<string, unknown> = {}

  // ── Stage 1: Google Places API (New) text search ──
  let places: Array<Record<string, unknown>> = []
  try {
    const resp = await Promise.race([
      fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key ?? '',
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({ textQuery: TEST_QUERY, languageCode: 'vi', regionCode: 'VN' }),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ])
    const d = await (resp as Response).json()
    places = (d.places ?? []) as Array<Record<string, unknown>>
    const top = places[0]
    trace.stage1 = {
      query: TEST_QUERY,
      field_mask: FIELD_MASK,
      http_status: (resp as Response).status,
      ok: (resp as Response).ok,
      places_count: places.length,
      api_error: d.error ?? null,
      top_result: top ? {
        place_id: top.id,
        name: (top.displayName as { text?: string })?.text,
        address: top.formattedAddress,
        rating: top.rating,
        websiteUri: top.websiteUri ?? null,
        googleMapsUri: top.googleMapsUri,
      } : null,
      verdict: places.length > 0 ? '✅ PASS — place found' : '❌ FAIL — no places returned',
    }
  } catch (e) {
    trace.stage1 = { error: String(e), verdict: '❌ FAIL — exception' }
  }

  const top = places[0]
  const placeId = top?.id as string | undefined
  const placeName = (top?.displayName as { text?: string })?.text ?? null

  // ── Stage 2: Old Places Details API → photo_reference ──
  let photoRef: string | null = null
  if (!key) {
    trace.stage2 = { verdict: '❌ FAIL — GOOGLE_PLACES_API_KEY not set' }
  } else if (!placeId) {
    trace.stage2 = { verdict: '❌ FAIL — no placeId from Stage 1' }
  } else {
    const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`
    try {
      const resp = await Promise.race([
        fetch(detailUrl),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ])
      const d = await (resp as Response).json()
      const photos = d.result?.photos as Array<{ photo_reference: string }> | undefined
      photoRef = photos?.[0]?.photo_reference ?? null
      trace.stage2 = {
        url: detailUrl.replace(key, '<KEY>'),
        http_status: (resp as Response).status,
        ok: (resp as Response).ok,
        api_status: d.status,
        photos_count: photos?.length ?? 0,
        photo_reference: photoRef ? `${photoRef.slice(0, 30)}...` : null,
        photo_reference_format: photoRef
          ? (photoRef.startsWith('AF1Qip') ? 'Old API format (AF1Qip...) ✅' : `Unknown format: ${photoRef.slice(0, 10)}`)
          : null,
        verdict: photoRef
          ? '✅ PASS — photo_reference obtained from old Places Details API'
          : '❌ FAIL — no photo_reference returned',
      }
    } catch (e) {
      trace.stage2 = { url: detailUrl.replace(key, '<KEY>'), error: String(e), verdict: '❌ FAIL — exception' }
    }
  }

  // ── Stage 3: fetchPlacePhoto() — old Maps photo URL with redirect:follow ──
  let googleCdnUrl: string | null = null
  if (!photoRef) {
    trace.stage3 = { verdict: '❌ FAIL — no photo_reference from Stage 2' }
  } else {
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${key}`
    try {
      const resp = await Promise.race([
        fetch(photoUrl, { redirect: 'follow' }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ])
      const finalUrl = (resp as Response).url
      const safe = !!finalUrl && !finalUrl.includes('maps.googleapis.com')
      googleCdnUrl = (resp as Response).ok && safe ? finalUrl : null
      trace.stage3 = {
        url_called: photoUrl.replace(key ?? '', '<KEY>'),
        http_status: (resp as Response).status,
        ok: (resp as Response).ok,
        final_url_after_redirect: finalUrl?.slice(0, 120) ?? null,
        final_url_host: finalUrl ? (() => { try { return new URL(finalUrl).hostname } catch { return 'invalid' } })() : null,
        is_google_cdn: finalUrl?.includes('lh3.googleusercontent.com') ?? false,
        safe_for_embed: safe,
        cdn_url: googleCdnUrl?.slice(0, 120) ?? null,
        verdict: googleCdnUrl
          ? '✅ PASS — lh3.googleusercontent.com CDN URL returned (no hotlink protection)'
          : (resp as Response).ok
            ? '⚠️ Response OK but redirect did not produce CDN URL'
            : '❌ FAIL — HTTP error',
      }
    } catch (e) {
      trace.stage3 = { error: String(e), verdict: '❌ FAIL — exception' }
    }
  }

  // ── Stage 3b: Serper fallback (for comparison) ──
  let serperUrl: string | null = null
  if (serperKey && placeName) {
    try {
      const sr = await Promise.race([
        fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: placeName, gl: 'vn', hl: 'vi', num: 3 }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      const sd = await (sr as Response).json()
      const imgs = (sd?.images as Array<{ imageUrl?: string }>) ?? []
      serperUrl = imgs[0]?.imageUrl ?? null
      trace.stage3b_serper = {
        images_count: imgs.length,
        first_url: serperUrl?.slice(0, 120) ?? null,
        host: serperUrl ? (() => { try { return new URL(serperUrl).hostname } catch { return 'invalid' } })() : null,
        verdict: serperUrl ? '⚠️ URL returned but third-party host — hotlink protection risk' : '❌ No image',
      }
    } catch (e) {
      trace.stage3b_serper = { error: String(e), verdict: '❌ FAIL' }
    }
  }

  const finalPhotoUrl = googleCdnUrl ?? serperUrl

  // ── Stage 4: Tool output ──
  const placeObject = top ? {
    place_id: placeId,
    name: placeName,
    address: top.formattedAddress,
    google_rating: top.rating ? `${top.rating}⭐` : null,
    maps_link: top.googleMapsUri,
    website_uri: (top.websiteUri as string | undefined) ?? null,
    photo_url: finalPhotoUrl,
    photo_source: googleCdnUrl ? 'Google CDN (lh3.googleusercontent.com) ✅' : serperUrl ? 'Serper ⚠️ hotlink risk' : null,
    order_links: placeName ? [
      { name: 'ShopeeFood', url: `https://shopeefood.vn/tim-kiem?q=${encodeURIComponent(placeName + ' Ho Chi Minh')}` },
      { name: 'GrabFood', url: `https://food.grab.com/vn/en/s?searchKeyword=${encodeURIComponent(placeName + ' Ho Chi Minh')}` },
      { name: 'BeFood', url: 'https://be.com.vn/' },
    ] : [],
  } : null

  trace.stage4_tool_output = {
    place_object: placeObject,
    checks: {
      '✓ image_exists': !!placeObject?.photo_url,
      '✓ image_is_google_cdn': !!googleCdnUrl,
      '✓ order_links_exist': (placeObject?.order_links?.length ?? 0) > 0,
      '✓ website_uri_exists': !!placeObject?.website_uri,
    },
  }

  // ── Stage 5: Prompt Builder ──
  const imageMarkdown = placeObject?.photo_url ? `![Ảnh địa điểm](${placeObject.photo_url})` : null
  const orderMd = (placeObject?.order_links ?? []).map((l: { name: string; url: string }) => `[${l.name}](${l.url})`).join(' · ')
  trace.stage5_prompt_builder = {
    image_markdown: imageMarkdown,
    order_links_markdown: orderMd,
    website_line: placeObject?.website_uri ? `[Website](${placeObject.website_uri})` : null,
  }

  // ── Stage 6: Renderer ──
  const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  const foundImages: Array<{ alt: string; src: string; host: string }> = []
  let m: RegExpExecArray | null
  const sampleText = imageMarkdown ?? ''
  while ((m = imgRegex.exec(sampleText)) !== null) {
    const src = m[2]
    foundImages.push({ alt: m[1], src, host: (() => { try { return new URL(src).hostname } catch { return 'invalid' } })() })
  }
  trace.stage6_renderer = {
    images_found: foundImages,
    rendered_img_tag: foundImages[0] ? `<img src="${foundImages[0].src.slice(0, 80)}..." onerror="..." />` : null,
    src_is_google_cdn: foundImages[0]?.host === 'lh3.googleusercontent.com',
  }

  // ── Final verdict ──
  const allChecks = {
    'Stage 1 — Google Places API: place found': places.length > 0,
    'Stage 1 — websiteUri returned': !!(top?.websiteUri),
    'Stage 2 — Old Details API: photo_reference obtained': !!photoRef,
    'Stage 3 — fetchPlacePhoto: Google CDN URL returned': !!googleCdnUrl,
    'Stage 3 — CDN is lh3.googleusercontent.com': googleCdnUrl?.includes('lh3.googleusercontent.com') ?? false,
    'Stage 4 — Tool output has photo_url': !!placeObject?.photo_url,
    'Stage 4 — Tool output has order_links': (placeObject?.order_links?.length ?? 0) > 0,
    'Stage 4 — Tool output has website_uri': !!placeObject?.website_uri,
    'Stage 5 — Prompt Builder includes image markdown': !!imageMarkdown,
    'Stage 6 — Renderer generates <img>': foundImages.length > 0,
    'Stage 6 — img src is Google CDN (no hotlink block)': foundImages[0]?.host === 'lh3.googleusercontent.com',
  }
  const failures = Object.entries(allChecks).filter(([, v]) => !v).map(([k]) => k)
  const allPass = failures.length === 0

  return Response.json({
    test_query: TEST_QUERY,
    timestamp: new Date().toISOString(),
    env: {
      GOOGLE_PLACES_API_KEY: key ? `SET (${key.slice(0, 8)}...)` : 'MISSING',
      SERPER_API_KEY: serperKey ? `SET (${serperKey.slice(0, 6)}...)` : 'MISSING',
    },
    pipeline_trace: trace,
    final_verdict: {
      checks: allChecks,
      failures,
      conclusion: allPass ? '🟢 VERIFIED FIXED' : `🔴 NOT FIXED — ${failures.length} check(s) failed`,
      google_cdn_url: googleCdnUrl?.slice(0, 120) ?? null,
      serper_fallback_url: serperUrl?.slice(0, 120) ?? null,
    },
  })
}
