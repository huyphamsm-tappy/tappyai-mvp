export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const serperKey = process.env.SERPER_API_KEY

  // Step 0: Test Serper images API
  let serperResult: unknown = null
  if (serperKey) {
    try {
      const sr = await Promise.race([
        fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: 'Hai San Hoang Gia nha hang Ho Chi Minh', gl: 'vn', hl: 'vi', num: 3 }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      const sd = await (sr as Response).json()
      const imgs = (sd?.images as Array<{ imageUrl?: string }>) || []
      serperResult = {
        httpStatus: (sr as Response).status,
        ok: (sr as Response).ok,
        imageCount: imgs.length,
        firstImageUrl: imgs[0]?.imageUrl?.slice(0, 100) ?? null,
        rawKeys: Object.keys(sd || {}),
        success: imgs.length > 0 && !!imgs[0]?.imageUrl,
      }
    } catch (e) {
      serperResult = { error: String(e) }
    }
  } else {
    serperResult = { error: 'SERPER_API_KEY not set' }
  }

  if (!key) {
    return Response.json({ hasGoogleKey: false, hasSerperKey: !!serperKey, serper: serperResult })
  }

  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName',
      },
      body: JSON.stringify({ textQuery: 'nha hang hai san Quan 1 Ho Chi Minh', languageCode: 'vi', regionCode: 'VN' }),
    })
    const d = await resp.json()
    const firstPlace = d.places?.[0]
    return Response.json({
      hasGoogleKey: true,
      hasSerperKey: !!serperKey,
      serper: serperResult,
      searchStatus: resp.status,
      placeId: firstPlace?.id,
      placeName: firstPlace?.displayName?.text || null,
    })
  } catch (e) {
    return Response.json({ error: String(e) })
  }
}
