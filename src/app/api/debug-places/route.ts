export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return Response.json({ hasKey: false })
  try {
    // Step 1: text search — include photos in field mask
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
      },
      body: JSON.stringify({ textQuery: 'nha hang hai san Quan 1 Ho Chi Minh', languageCode: 'vi', regionCode: 'VN' }),
    })
    const d = await resp.json()
    const firstPlace = d.places?.[0]
    const placeId = firstPlace?.id
    const firstPhotoFromSearch = firstPlace?.photos?.[0]?.name || null

    let photoUrl = null
    if (firstPhotoFromSearch) {
      const photoResp = await fetch(
        `https://places.googleapis.com/v1/${firstPhotoFromSearch}/media?key=${key}&maxHeightPx=400&skipHttpRedirect=true`
      )
      const photoData = await photoResp.json()
      photoUrl = photoData?.photoUri?.slice(0, 100) || null
    }

    // Also try getting detail separately
    let detailPhotos = null
    if (placeId) {
      const dr = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,photos' },
      })
      const dd = await dr.json()
      detailPhotos = { status: dr.status, count: dd.photos?.length || 0, firstPhotoName: dd.photos?.[0]?.name || null, rawKeys: Object.keys(dd) }
    }

    return Response.json({
      searchStatus: resp.status, placeId,
      photosFromSearch: firstPlace?.photos?.length || 0,
      firstPhotoNameFromSearch: firstPhotoFromSearch,
      photoUrl,
      detailPhotos,
      rawFirstPlaceKeys: firstPlace ? Object.keys(firstPlace) : null,
    })
  } catch (e) {
    return Response.json({ error: String(e) })
  }
}
