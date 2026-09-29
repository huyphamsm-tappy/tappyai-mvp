// A street or a dish named after a city is not that city (UAT 36d2941, 29/09: "dạo phố đi bộ Nguyễn Huệ"
// planned an evening in HUẾ — the situation's location was read by substring, "nguyen hue" ⊃ "hue").
// Same class as placeGeoGuard's street-segment rule ("Nguyễn Thái Bình" ≠ Thái Bình), for the detectors
// that read the USER's text.
//
// 🚨 A REGEX LITERAL, not `new RegExp(\`…\${CONST}…\`)`: on UAT b87219d the constant template version
// matched locally (vitest) and never in the production bundle — "Nguyễn Huệ" still centred the search on
// Huế while every other change of the same commit was live. The literal leaves nothing to fold.
const STREET_OR_DISH = /\b(?:nguyen hue|nguyen thai binh|bun bo hue|com hen hue|(?:duong|pho di bo|street|dai lo|ngo|hem)\s+(?:hue|ha noi|hai phong|da nang|can tho|nha trang|da lat|vung tau|quy nhon|phan thiet|ha long|ninh binh|hoi an|sai gon|thai binh))\b/g

/**
 * Diacritic-folded, lower-case text with street / dish names that contain a city word blanked out —
 * same length, so index-aligned views stay aligned. Only city matching reads the masked view.
 */
export function maskStreetNames(folded: string): string {
  return folded.replace(STREET_OR_DISH, m => ' '.repeat(m.length))
}
