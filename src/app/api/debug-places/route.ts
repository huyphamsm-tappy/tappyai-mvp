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
          body: JSON.stringify({ q: 'Hải Sản Hoàng Gia nhà hàng Hồ Chí Minh', gl: 'vn', hl: 'vi', num: 3 }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      const sd = await (sr as Response).json()
      const imgs = (sd?.images as Array<{ imageUrl?: string; thumbnailUrl?: string }>) || []
      serperResult = {
        httpStatus: (sr as Response).status,
        ok: (sr as Response).ok,
        imageCount: imgs.length,
        firstImageUrl: imgs[0]?.imageUrl?.slice(0, 100) ?? null,
        firstThumbnailUrl: imgs[0]?.thumbnailUrl?.slice(0, 100) ?? null,
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
    // Step 1: text search via Places API (New)
    const searchFieldMask = 'places.id,places.displayName'
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': searchFieldMask,
      },
      body: JSON.stringify({ textQuery: 'nha hang hai san Quan 1 Ho Chi Minh', languageCode: 'vi', regionCode: 'VN' }),
    })
    const d = await resp.json()
    const firstPlace = d.places?.[0]
    const placeId = firstPlace?.id

    // Step 2A: Place details via Places API (NEW) with photos field mask
    const newDetailFieldMask = 'id,photos'
    let newDetailStatus = 0
    let newDetailRaw: unknown = null
    let newPhotoName: string | null = null
    if (placeId) {
      const nr = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': newDetailFieldMask,
        },
      })
      newDetailStatus = nr.status
      const nd = await nr.json()
      const photosArray = nd.photos as Array<{ name: string }> | undefined
      newDetailRaw = {
        keysInResponse: Object.keys(nd),
        photosFieldPresent: 'photos' in nd,
        photosIsArray: Array.isArray(nd.photos),
        photosLength: photosArray?.length ?? null,
        firstPhotoName: photosArray?.[0]?.name?.slice(0, 60) ?? null,
        errorIfAny: nd.error ?? null,
      }
      newPhotoName = photosArray?.[0]?.name ?? null
    }

    // Step 2B: NEW API photo media (skipHttpRedirect=true → returns photoUri JSON)
    let newPhotoStatus = 0
    let newPhotoUri: string | null = null
    if (newPhotoName) {
      const pr = await fetch(
        `https://places.googleapis.com/v1/${newPhotoName}/media?key=${key}&maxHeightPx=400&skipHttpRedirect=true`
      )
      newPhotoStatus = pr.status
      if (pr.ok) {
        const pd = await pr.json()
        newPhotoUri = (pd?.photoUri as string | undefined)?.slice(0, 80) ?? null
      }
    }

    // Step 3A: OLD Places Details API (maps.googleapis.com)
    let oldDetailStatus = 0
    let oldDetailResult: Record<string, unknown> | null = null
    let photoRef: string | null = null
    if (placeId) {
      const dr = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`
      )
      oldDetailStatus = dr.status
      const dd = await dr.json()
      oldDetailResult = { status: dd.status, photoCount: dd.result?.photos?.length || 0, firstRef: dd.result?.photos?.[0]?.photo_reference?.slice(0, 30) || null }
      photoRef = dd.result?.photos?.[0]?.photo_reference || null
    }

    // Step 3B: OLD Places Photo API (redirect → CDN URL)
    let oldPhotoStatus = 0
    let oldPhotoUrl: string | null = null
    if (photoRef) {
      const pr = await fetch(
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${key}`,
        { redirect: 'follow' }
      )
      oldPhotoStatus = pr.status
      oldPhotoUrl = pr.ok ? pr.url?.slice(0, 80) || null : null
    }

    return Response.json({
      hasGoogleKey: true,
      hasSerperKey: !!serperKey,
      serper: serperResult,
      searchStatus: resp.status,
      placeId,
      placeName: firstPlace?.displayName?.text || null,
      newApi: {
        detailFieldMask: newDetailFieldMask,
        detailStatus: newDetailStatus,
        detail: newDetailRaw,
        photoName: newPhotoName?.slice(0, 60) ?? null,
        photoStatus: newPhotoStatus,
        photoUri: newPhotoUri,
        success: !!newPhotoUri && !newPhotoUri.includes('places.googleapis.com'),
      },
      oldApi: {
        detailStatus: oldDetailStatus,
        detail: oldDetailResult,
        photoRef: photoRef?.slice(0, 30) ?? null,
        photoStatus: oldPhotoStatus,
        photoUrl: oldPhotoUrl,
        success: !!oldPhotoUrl && !oldPhotoUrl.includes('maps.googleapis.com'),
      },
    })
  } catch (e) {
    return Response.json({ error: String(e) })
  }
}
