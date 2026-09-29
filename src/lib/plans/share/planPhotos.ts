// Stop photos for a SHARED plan, from the place cards of the same turn.
//
// A consult plan reaches the client without `photo_url` on its stops (the photo injection runs on
// the classic plan path only), so its share image had no hero — owner UAT 29/09: "tấm plan … có
// ảnh nền … sao ở đây ko có". The same turn usually carries the place cards for those very stops,
// each with the place's own photo. This copies that photo onto the stop it names — never a stock
// or area picture:
//
//  - only a canonical place photo (`isPlanPhotoUrl`: Google place-photo CDNs), the same allow-list
//    the share snapshot and /plan/<id> enforce;
//  - only by NAME: exact (case/diacritics-insensitive), else containment either way with the
//    shorter side ≥ 4 characters — the rule the server-side injection uses;
//  - a stop that already has a photo keeps it; a stop with no matching card stays without one.
//
// Pure; the plan passed in is not mutated.

import { isPlanPhotoUrl } from './planShare'

export interface PlacePhotoSource {
  name: string
  image?: string
}

interface PhotoStop {
  name: string
  photo_url?: string
}

export function normalisePlaceName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function matches(stop: string, place: string): boolean {
  if (!stop || !place) return false
  if (stop === place) return true
  const [short, long] = stop.length <= place.length ? [stop, place] : [place, stop]
  return short.length >= 4 && long.includes(short)
}

/** The plan with `photo_url` filled from the turn's place cards where a stop names one of them. */
export function withPlacePhotos<P extends { days: { items: PhotoStop[] }[] }>(plan: P, places: readonly PlacePhotoSource[] | null | undefined): P {
  const sources = (places ?? [])
    .filter(p => isPlanPhotoUrl(p.image))
    .map(p => ({ key: normalisePlaceName(p.name), image: p.image as string }))
    .filter(p => p.key)
  if (!sources.length) return plan
  let changed = false
  const days = plan.days.map(d => ({
    ...d,
    items: d.items.map(it => {
      if (it.photo_url) return it
      const key = normalisePlaceName(it.name ?? '')
      const hit = sources.find(s => s.key === key) ?? sources.find(s => matches(key, s.key))
      if (!hit) return it
      changed = true
      return { ...it, photo_url: hit.image }
    }),
  }))
  return changed ? { ...plan, days } : plan
}
