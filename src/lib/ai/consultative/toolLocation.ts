// ── Unwind S1D (28/10/2026): a hotel lookup's location argument, and what one such call may spend ─────────────────────────────────────────
//
// Measured on localhost 28/10 (turn 6b, "2 người" after a Quy Nhơn trip plan): the model called get_hotel_prices with a location that was
// a description ("điểm du lịch gần Quy Nhơn"); /maps found nothing for it, the fallback path ran, and that ONE call sent 14 Serper requests
// (1 /maps + 1 search + 3 per-hotel searches + 1 supplement + 8 photo lookups, travel.ts).
//
// (i) THE LOCATION CHECK. The code does not judge wording (no word list, no string comparison): it reads the argument and the area of the
//     conversation through the city table the hotel tool already uses (vietnamCities.ts). It refuses ONLY a clear contradiction: the argument
//     names a city far (> CONTRADICTION_KM) from the area the user or the intent layer stated, and the user never named that city. The refusal
//     is a structured result the model can act on (it calls again with the stated area). Anything it cannot decide - no stated area, an
//     argument that names no known city (a description, a ward, a landmark) - passes, and is counted in the log (no user words).
//     Telling "a description" from "a place" in general needs a language judgement or a geocoder call; that is NOT done here (stated in the report).
// (ii) THE PER-CALL CAP. One get_hotel_prices call runs inside its own Serper credit scope (serperToolBudget.withSerperToolBudget, the
//     mechanism the bounded agent already uses). It is EXTRA: the turn cap (serperRequestCap.ts) and the daily ceiling still apply on top.
//     A request over the cap is refused before it is sent; the tool already reads a refused request as "no result" (photos, then links, are
//     what a refused fallback loses - the rows come first in travel.ts).
// Pure except for the city table.

import { cityForName, cityInText, haversineKm, textNamesCity, type VietnamCity } from '../tools/vietnamCities'

/** Credits one get_hotel_prices call may spend with S1D on: the /maps path (3) or the data part of the fallback (1 search + 3 per-hotel + 1 supplement + the /maps attempt) - not the photo lookups. */
export const HOTEL_CALL_CREDIT_CAP = 8
/** Two cities closer than this are one trip (Hội An - Đà Nẵng is about 25 km): never a contradiction. */
export const CONTRADICTION_KM = 100

const cityOf = (text: string | null | undefined): VietnamCity | null => cityForName(text) ?? cityInText(text)

export type LocationVerdict =
  | { ok: true; reason: 'matches' | 'near' | 'no_stated_area' | 'unknown_place' | 'user_named_it' }
  | { ok: false; reason: 'contradicts_stated_area'; statedArea: string; km: number }

/** Pure. Does this location argument contradict the area the conversation stated? See (i) above. */
export function checkToolLocation(location: string, statedArea: string | null | undefined, userTexts: readonly string[]): LocationVerdict {
  const stated = cityOf(statedArea)
  if (!stated) return { ok: true, reason: 'no_stated_area' }
  const arg = cityOf(location)
  if (!arg) return { ok: true, reason: 'unknown_place' }
  if (arg.query === stated.query) return { ok: true, reason: 'matches' }
  const km = haversineKm(arg.coords, stated.coords)
  if (km <= CONTRADICTION_KM) return { ok: true, reason: 'near' }
  if (userTexts.some(t => textNamesCity(t, arg))) return { ok: true, reason: 'user_named_it' }
  return { ok: false, reason: 'contradicts_stated_area', statedArea: String(statedArea), km: Math.round(km) }
}

/** The structured result the model reads when its location was refused: what was wrong and what to send instead. No user words are logged from it. */
export function locationRefusal(v: Extract<LocationVerdict, { ok: false }>, lang: string): Record<string, unknown> {
  return {
    error: 'location_contradicts_stated_area',
    stated_area: v.statedArea,
    distance_km: v.km,
    hint: lang === 'en'
      ? `The location is about ${v.km} km from the area the user stated. Call again with location set to the stated area (or a place inside it).`
      : `Dia diem nay cach khu vuc user da neu khoang ${v.km} km. Goi lai voi location la khu vuc user da neu (hoac mot dia danh ben trong no).`,
  }
}
