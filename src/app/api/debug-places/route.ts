export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return Response.json({ hasKey: false, error: 'GOOGLE_PLACES_API_KEY khong duoc set' })
  }
  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri',
      },
      body: JSON.stringify({
        textQuery: 'nha hang hai san Quan 1 Ho Chi Minh',
        languageCode: 'vi',
        regionCode: 'VN',
      }),
    })
    const d = await resp.json()
    return Response.json({
      hasKey: true,
      keyLength: key.length,
      keyPrefix: key.slice(0, 6),
      httpStatus: resp.status,
      resultsCount: d.places?.length || 0,
      sampleResult: d.places?.[0]?.displayName?.text || null,
      error: d.error || null,
    })
  } catch (e) {
    return Response.json({ hasKey: true, keyLength: key.length, fetchError: String(e) })
  }
}
