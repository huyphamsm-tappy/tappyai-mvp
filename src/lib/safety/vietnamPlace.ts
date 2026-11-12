// Is a device position inside Viet Nam? The ONLY trusted source of "where the person is" for an emergency card (R13 §10.5: never from the language). A coarse polygon, inset from the land
// borders on purpose (a doubtful point is NOT Vietnam, so no number is shown to someone who may be in Laos or Cambodia). Offshore islands are not covered: the person then gets the guidance
// without a card, never a wrong number. Pure.

/** [lng, lat] vertices, clockwise from the north-west. */
const VN_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [105.0, 21.9], [106.4, 21.8], [107.8, 21.6], [108.2, 20.0], [109.0, 16.5], [109.6, 13.0], [109.3, 11.5], [108.0, 10.0], [106.0, 8.5], [104.9, 8.5],
  [105.0, 9.8], [105.3, 10.5], [106.3, 11.1], [107.8, 12.0], [107.9, 13.5], [107.7, 15.0], [107.4, 16.5], [106.1, 17.5], [105.5, 18.5], [105.0, 19.8], [104.8, 21.0],
]

export function insideVietnam(lat: number, lng: number): boolean {
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false
  let inside = false
  for (let i = 0, j = VN_POLYGON.length - 1; i < VN_POLYGON.length; j = i++) {
    const [xi, yi] = VN_POLYGON[i], [xj, yj] = VN_POLYGON[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
