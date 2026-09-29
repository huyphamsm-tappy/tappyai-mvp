// A street or a dish named after a city is not that city (UAT 36d2941, 29/09: "dạo phố đi bộ Nguyễn Huệ"
// planned an evening in HUẾ — the situation's location was read by substring, "nguyen hue" ⊃ "hue").
// Same class as placeGeoGuard's street-segment rule ("Nguyễn Thái Bình" ≠ Thái Bình), for the detectors
// that read the USER's text.

const CITY_WORDS = 'hue|ha noi|hai phong|da nang|can tho|nha trang|da lat|vung tau|quy nhon|phan thiet|ha long|ninh binh|hoi an|sai gon|thai binh'

const STREET_OR_DISH = new RegExp(
  `\\b(?:nguyen hue|nguyen thai binh|bun bo hue|com hen hue|(?:duong|pho di bo|street|dai lo|ngo|hem)\\s+(?:${CITY_WORDS}))\\b`,
  'g',
)

/**
 * Diacritic-folded, lower-case text with street / dish names that contain a city word blanked out —
 * same length, so index-aligned views stay aligned. Only city matching reads the masked view.
 */
export function maskStreetNames(folded: string): string {
  return folded.replace(STREET_OR_DISH, m => ' '.repeat(m.length))
}
