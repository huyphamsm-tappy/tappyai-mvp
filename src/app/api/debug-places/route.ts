export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const serperKey = process.env.SERPER_API_KEY

  // Step 0: Test Serper images API with multiple place name queries
  const testNames = [
    'Atispho - Pho Atiso Quan 3',
    'Hai San Hoang Gia quan 1',
    'Nha Hang Du Ky',
  ]
  const serperTests = await Promise.all(testNames.map(async (q) => {
    if (!serperKey) return { q, error: 'no_key' }
    try {
      const sr = await Promise.race([
        fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 3 }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      const sd = await (sr as Response).json()
      const imgs = (sd?.images as Array<{ imageUrl?: string }>) || []
      return { q, httpStatus: (sr as Response).status, imageCount: imgs.length, firstUrl: imgs[0]?.imageUrl?.slice(0, 80) ?? null }
    } catch (e) {
      return { q, error: String(e).slice(0, 80) }
    }
  }))

  // Step 1: Places API search to get real place names
  let placeNames: string[] = []
  if (key) {
    try {
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName' },
        body: JSON.stringify({ textQuery: 'quan pho ngon quan 3 Ho Chi Minh', languageCode: 'vi', regionCode: 'VN' }),
      })
      const d = await resp.json()
      placeNames = (d.places || []).slice(0, 3).map((p: { displayName?: { text?: string } }) => p.displayName?.text || '')
    } catch { /* ignore */ }
  }

  // Step 2: Test Serper with actual place names from Places API
  const realNameTests = await Promise.all(placeNames.map(async (q) => {
    if (!q || !serperKey) return { q, error: 'no_name_or_key' }
    try {
      const sr = await Promise.race([
        fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q, gl: 'vn', hl: 'vi', num: 3 }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ])
      const sd = await (sr as Response).json()
      const imgs = (sd?.images as Array<{ imageUrl?: string }>) || []
      return { q: q.slice(0, 40), httpStatus: (sr as Response).status, imageCount: imgs.length, firstUrl: imgs[0]?.imageUrl?.slice(0, 80) ?? null }
    } catch (e) {
      return { q: q.slice(0, 40), error: String(e).slice(0, 80) }
    }
  }))

  return Response.json({
    hasGoogleKey: !!key,
    hasSerperKey: !!serperKey,
    serperStaticTests: serperTests,
    placesApiPlaceNames: placeNames,
    serperRealNameTests: realNameTests,
  })
}
