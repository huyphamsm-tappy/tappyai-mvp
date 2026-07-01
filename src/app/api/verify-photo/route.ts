// FINAL PHOTO VERIFICATION — diagnostic endpoint only. Contains NO application logic and
// changes NO app behavior. Runs the exact calls requested to settle code-vs-config:
//   STEP 1: Places API (New) Place Details  GET places/{PLACE_ID}  mask=displayName,photos,websiteUri
//   STEP 2: Legacy Place Details            GET maps/api/place/details/json?fields=photos

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  const out: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: { GOOGLE_PLACES_API_KEY: key ? `SET (${key.slice(0, 8)}...)` : 'MISSING' },
  }

  // ── Get a fresh, valid place_id via Text Search (New) ──
  let placeId: string | null = null
  try {
    const sr = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key ?? '',
        'X-Goog-FieldMask': 'places.id,places.displayName',
      },
      body: JSON.stringify({ textQuery: 'Highlands Coffee Nguyen Hue Ho Chi Minh', languageCode: 'vi', regionCode: 'VN' }),
    })
    const sd = await sr.json()
    placeId = sd.places?.[0]?.id ?? null
    out.place_lookup = {
      http_status: sr.status,
      place_id: placeId,
      name: sd.places?.[0]?.displayName?.text ?? null,
      error: sd.error ?? null,
    }
  } catch (e) {
    out.place_lookup = { error: String(e) }
  }

  // ── STEP 1 — Places API (New) Place Details with photos in the field mask ──
  const step1Mask = 'displayName,photos,websiteUri'
  if (placeId) {
    const step1Url = `https://places.googleapis.com/v1/places/${placeId}`
    try {
      const resp = await fetch(step1Url, {
        headers: { 'X-Goog-Api-Key': key ?? '', 'X-Goog-FieldMask': step1Mask },
      })
      const json = await resp.json()
      out.step1_new_place_details = {
        request_url: `${step1Url}  [Header X-Goog-FieldMask: ${step1Mask}]`,
        field_mask: step1Mask,
        http_status: resp.status,
        full_response: json,
        photos_field_present: Object.prototype.hasOwnProperty.call(json, 'photos'),
        photos_is_array: Array.isArray(json.photos),
        photos_count: Array.isArray(json.photos) ? json.photos.length : null,
        first_photo_object: Array.isArray(json.photos) ? (json.photos[0] ?? null) : null,
        websiteUri: json.websiteUri ?? null,
      }
    } catch (e) {
      out.step1_new_place_details = { request_url: step1Url, error: String(e) }
    }
  } else {
    out.step1_new_place_details = { skipped: 'no place_id from lookup' }
  }

  // ── STEP 2 — Legacy Place Details ──
  if (placeId) {
    const step2Url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`
    try {
      const resp = await fetch(step2Url)
      const json = await resp.json()
      out.step2_legacy_place_details = {
        request_url: step2Url.replace(key ?? '', '<KEY>'),
        http_status: resp.status,
        full_response: json,
        api_status: json.status ?? null,
        error_message: json.error_message ?? null,
        photos_count: json.result?.photos?.length ?? 0,
      }
    } catch (e) {
      out.step2_legacy_place_details = { error: String(e) }
    }
  } else {
    out.step2_legacy_place_details = { skipped: 'no place_id from lookup' }
  }

  return Response.json(out)
}
