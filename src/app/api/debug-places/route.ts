export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return Response.json({ hasKey: false, error: 'GOOGLE_PLACES_API_KEY khong duoc set' })
  }
  const p = new URLSearchParams({
    query: 'nha hang hai san Quan 1 Ho Chi Minh',
    key,
    language: 'vi',
    region: 'vn',
  })
  try {
    const resp = await fetch('https://maps.googleapis.com/maps/api/place/textsearch/json?' + p)
    const d = await resp.json()
    return Response.json({
      hasKey: true,
      keyLength: key.length,
      keyPrefix: key.slice(0, 6),
      httpStatus: resp.status,
      apiStatus: d.status,
      errorMessage: d.error_message || null,
      resultsCount: d.results?.length || 0,
      sampleResult: d.results?.[0]?.name || null,
    })
  } catch (e) {
    return Response.json({ hasKey: true, keyLength: key.length, fetchError: String(e) })
  }
}
