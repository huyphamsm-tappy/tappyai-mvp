// IMAGE PIPELINE PROOF endpoint
// Tests the EXACT pipeline used by searchPlaces() + fetchPlacePhoto() after Session 2 fixes
// Query: "Highlands Coffee Nguyen Hue Ho Chi Minh"

const TEST_QUERY = 'Highlands Coffee Nguyen Hue Ho Chi Minh'
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.photos,places.websiteUri'

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const serperKey = process.env.SERPER_API_KEY
  const trace: Record<string, unknown> = {}

  // ── Stage 1: Google Places API (New) — text search with photos field mask ──
  let places: Array<Record<string, unknown>> = []
  let stage1Error: string | null = null
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
    const topPhotos = top?.photos as Array<{ name?: string }> | undefined
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
        photos_count: topPhotos?.length ?? 0,
        'photos[0].name': topPhotos?.[0]?.name ?? null,
        'photos[0].name_contains_slash': topPhotos?.[0]?.name?.includes('/') ?? null,
        googleMapsUri: top.googleMapsUri,
      } : null,
      verdict: places.length > 0 && topPhotos && topPhotos.length > 0
        ? '✅ PASS — Google returned photos'
        : places.length > 0
          ? '⚠️ PARTIAL — place found but NO photos returned'
          : '❌ FAIL — no places returned',
    }
  } catch (e) {
    stage1Error = String(e)
    trace.stage1 = { error: stage1Error, verdict: '❌ FAIL — exception' }
  }

  // ── Stage 2: fetchPlacePhoto() logic — exact code from common.ts after fix ──
  const top = places[0]
  const placeId = top?.id as string | undefined
  const topPhotos = top?.photos as Array<{ name?: string }> | undefined
  const photoName = topPhotos?.[0]?.name as string | undefined

  let googleCdnUrl: string | null = null
  let stage2Error: string | null = null

  if (!key) {
    trace.stage2 = { verdict: '❌ FAIL — GOOGLE_PLACES_API_KEY not set in env' }
  } else if (!photoName) {
    trace.stage2 = {
      verdict: '❌ FAIL — no photoName from Stage 1',
      note: 'Stage 1 did not return photos — check field mask and billing',
    }
  } else {
    const isNewApiFormat = photoName.includes('/')
    const photoApiUrl = isNewApiFormat
      ? `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&key=${key}`
      : `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoName}&key=${key}`

    const apiChosen = isNewApiFormat
      ? 'NEW Places API v1 media endpoint (places.googleapis.com/v1/...)'
      : 'OLD Maps API endpoint (maps.googleapis.com/maps/api/place/photo)'

    try {
      const resp = await Promise.race([
        fetch(photoApiUrl, { redirect: 'follow' }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
      ])
      const finalUrl = (resp as Response).url
      const safe = !!finalUrl && !finalUrl.includes('maps.googleapis.com')
      googleCdnUrl = (resp as Response).ok && safe ? finalUrl : null

      trace.stage2 = {
        photo_name_input: photoName,
        photo_name_contains_slash: isNewApiFormat,
        api_chosen: apiChosen,
        url_called: photoApiUrl.replace(key, '<KEY>'),
        http_status: (resp as Response).status,
        ok: (resp as Response).ok,
        final_url_after_redirect: finalUrl?.slice(0, 120) ?? null,
        final_url_host: finalUrl ? (() => { try { return new URL(finalUrl).hostname } catch { return 'invalid' } })() : null,
        is_google_cdn: finalUrl?.includes('lh3.googleusercontent.com') ?? false,
        safe_for_embed: safe,
        cdn_url: googleCdnUrl?.slice(0, 120) ?? null,
        verdict: googleCdnUrl
          ? '✅ PASS — Google CDN URL returned (lh3.googleusercontent.com)'
          : (resp as Response).ok
            ? '⚠️ PARTIAL — response OK but URL failed safe check (still maps.googleapis.com, redirect may not have followed)'
            : '❌ FAIL — HTTP error from photo API',
      }
    } catch (e) {
      stage2Error = String(e)
      trace.stage2 = {
        photo_name_input: photoName,
        api_chosen: apiChosen,
        url_called: photoApiUrl.replace(key, '<KEY>'),
        error: stage2Error,
        verdict: '❌ FAIL — exception',
      }
    }
  }

  // ── Stage 2b: Serper fallback (run regardless, for comparison) ──
  let serperUrl: string | null = null
  const placeName = (top?.displayName as { text?: string })?.text ?? null
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
      trace.stage2b_serper_fallback = {
        query: placeName,
        http_status: (sr as Response).status,
        ok: (sr as Response).ok,
        images_count: imgs.length,
        first_image_url: serperUrl?.slice(0, 120) ?? null,
        first_image_host: serperUrl ? (() => { try { return new URL(serperUrl).hostname } catch { return 'invalid' } })() : null,
        note: 'Third-party host — MAY have hotlink protection blocking browser <img> embed',
        verdict: serperUrl ? '⚠️ URL returned but hotlink protection risk' : '❌ No image returned',
      }
    } catch (e) {
      trace.stage2b_serper_fallback = { error: String(e), verdict: '❌ FAIL' }
    }
  } else {
    trace.stage2b_serper_fallback = {
      skipped: true,
      reason: !serperKey ? 'SERPER_API_KEY not set' : 'no place name from Stage 1',
    }
  }

  // ── Stage 3: Tool output object ──
  const finalPhotoUrl = googleCdnUrl ?? serperUrl
  const placeObject = top ? {
    place_id: placeId,
    name: placeName,
    address: top.formattedAddress,
    google_rating: top.rating ? `${top.rating}⭐` : null,
    maps_link: top.googleMapsUri,
    website_uri: (top.websiteUri as string | undefined) ?? null,
    photo_url: finalPhotoUrl,
    photo_source: googleCdnUrl ? 'Google CDN (✅ no hotlink protection)' : serperUrl ? 'Serper (⚠️ hotlink risk)' : null,
    order_links: placeName ? [
      { name: 'ShopeeFood', url: `https://shopeefood.vn/tim-kiem?q=${encodeURIComponent(placeName + ' Ho Chi Minh')}` },
      { name: 'GrabFood', url: `https://food.grab.com/vn/en/s?searchKeyword=${encodeURIComponent(placeName + ' Ho Chi Minh')}` },
      { name: 'BeFood', url: 'https://be.com.vn/' },
    ] : [],
  } : null

  trace.stage3_tool_output = {
    place_object: placeObject,
    checks: {
      '✓ image_exists': !!placeObject?.photo_url,
      '✓ image_is_google_cdn': !!googleCdnUrl,
      '✓ order_links_exist': (placeObject?.order_links?.length ?? 0) > 0,
      '✓ website_uri_exists': !!placeObject?.website_uri,
    },
    verdict: placeObject?.photo_url ? '✅ PASS' : '❌ FAIL — no photo_url in output',
  }

  // ── Stage 4: Prompt Builder simulation ──
  const imageMarkdown = placeObject?.photo_url
    ? `![Ảnh địa điểm](${placeObject.photo_url})`
    : null
  const orderMd = (placeObject?.order_links ?? []).map((l: { name: string; url: string }) => `[${l.name}](${l.url})`).join(' · ')

  trace.stage4_prompt_builder = {
    image_markdown_generated: imageMarkdown,
    order_links_markdown: orderMd,
    website_line: placeObject?.website_uri ? `[Website](${placeObject.website_uri})` : null,
    checks: {
      '✓ image_in_prompt': !!imageMarkdown,
      '✓ order_links_in_prompt': orderMd.length > 0,
      '✓ website_in_prompt': !!placeObject?.website_uri,
    },
    verdict: imageMarkdown ? '✅ PASS' : '❌ FAIL — no image in prompt',
  }

  // ── Stage 5 & 6: Renderer simulation ──
  const sampleResponse = imageMarkdown
    ? `**${placeName}**\n${imageMarkdown}\n${placeObject?.google_rating ?? ''}\n${orderMd}`
    : `**${placeName}**\n(no image)`

  const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  const foundImages: Array<{ alt: string; src: string; host: string }> = []
  let m: RegExpExecArray | null
  while ((m = imgRegex.exec(sampleResponse)) !== null) {
    const src = m[2]
    foundImages.push({ alt: m[1], src, host: (() => { try { return new URL(src).hostname } catch { return 'invalid' } })() })
  }

  trace.stage5_6_renderer = {
    sample_response_excerpt: sampleResponse.slice(0, 300),
    images_in_markdown: foundImages,
    rendered_img_tag: foundImages[0]
      ? `<img src="${foundImages[0].src.slice(0, 80)}..." alt="${foundImages[0].alt}" onerror="..." />`
      : null,
    checks: {
      '✓ img_tag_would_render': foundImages.length > 0,
      '✓ src_is_google_cdn': foundImages[0]?.host === 'lh3.googleusercontent.com',
      '✓ src_not_blocked_by_maps_api': !foundImages[0]?.src?.includes('maps.googleapis.com'),
    },
    verdict: foundImages[0]?.host === 'lh3.googleusercontent.com'
      ? '✅ PASS — Google CDN, no hotlink protection'
      : foundImages.length > 0
        ? '⚠️ Image present but from third-party host — hotlink protection risk'
        : '❌ FAIL — no image in response',
  }

  // ── Final verdict ──
  const allChecks = {
    'Stage 1 — Google returns photos': !!(topPhotos?.[0]?.name),
    'Stage 2 — fetchPlacePhoto returns Google CDN URL': !!googleCdnUrl,
    'Stage 2 — CDN is lh3.googleusercontent.com': googleCdnUrl?.includes('lh3.googleusercontent.com') ?? false,
    'Stage 3 — Tool output has photo_url': !!placeObject?.photo_url,
    'Stage 3 — Tool output has order_links': (placeObject?.order_links?.length ?? 0) > 0,
    'Stage 3 — Tool output has website_uri': !!placeObject?.website_uri,
    'Stage 4 — Prompt Builder includes image markdown': !!imageMarkdown,
    'Stage 5/6 — Chat renderer would generate <img>': foundImages.length > 0,
    'Stage 5/6 — img src is Google CDN (no hotlink block)': foundImages[0]?.host === 'lh3.googleusercontent.com',
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
      conclusion: allPass ? '🟢 VERIFIED FIXED' : '🔴 NOT FIXED',
      google_cdn_url: googleCdnUrl?.slice(0, 120) ?? null,
      serper_url: serperUrl?.slice(0, 120) ?? null,
    },
  })
}
