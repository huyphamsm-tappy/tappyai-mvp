export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return Response.json({ hasKey: false, error: 'GOOGLE_PLACES_API_KEY khong duoc set' })
  }
  try {
    // Step 1: text search
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: 'nha hang hai san Quan 1 Ho Chi Minh',
        languageCode: 'vi',
        regionCode: 'VN',
      }),
    })
    const d = await resp.json()
    const firstPlace = d.places?.[0]
    const placeId = firstPlace?.id

    let photoDebug: Record<string, unknown> = { placeId: placeId || null }

    if (placeId) {
      const detailResp = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,photos' },
      })
      const detail = await detailResp.json()
      const photoName = (detail.photos as Array<{ name: string }>)?.[0]?.name
      photoDebug = { ...photoDebug, detailStatus: detailResp.status, photoName: photoName || null, photosCount: detail.photos?.length || 0, detailError: detail.error || null }

      if (photoName) {
        const photoResp = await fetch(
          `https://places.googleapis.com/v1/${photoName}/media?key=${key}&maxHeightPx=400&skipHttpRedirect=true`
        )
        const photoData = await photoResp.json()
        photoDebug = { ...photoDebug, photoStatus: photoResp.status, photoUri: photoData?.photoUri?.slice(0, 80) || null, photoError: photoData?.error || null }
      }
    }

    return Response.json({
      hasKey: true,
      keyLength: key.length,
      keyPrefix: key.slice(0, 6),
      searchStatus: resp.status,
      resultsCount: d.places?.length || 0,
      sampleResult: firstPlace?.displayName?.text || null,
      searchError: d.error || null,
      photo: photoDebug,
    })
  } catch (e) {
    return Response.json({ hasKey: true, keyLength: key.length, fetchError: String(e) })
  }
}
