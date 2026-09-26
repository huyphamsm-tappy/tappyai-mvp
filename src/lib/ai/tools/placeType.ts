// ── search_places `type`: tolerant, never fatal ─────────────────────────────
//
// Measured 2026-09-18 (E1 "Tối nay đi chơi gì với hội bạn 5 người ở Quận 1", four runs in a
// row): the model called search_places with a `type` outside the enum ("entertainment"), the AI
// SDK rejected the arguments before execute() ran, the stream ended with `3:"An error occurred."`
// and the user saw "Tôi sẽ tìm…" and nothing else. A wrong category is not a reason to lose the
// turn: the value is mapped to the nearest known type, or dropped (a type-less search still runs).

export const PLACE_TYPES = ['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema', 'attraction', 'mall'] as const
export type PlaceType = (typeof PLACE_TYPES)[number]

const SYNONYMS: Record<string, PlaceType> = {
  food: 'restaurant', eatery: 'restaurant', 'quan an': 'restaurant', 'nha hang': 'restaurant', dining: 'restaurant',
  coffee: 'cafe', 'ca phe': 'cafe', 'coffee shop': 'cafe',
  massage: 'spa', wellness: 'spa', salon: 'spa',
  resort: 'hotel', homestay: 'hotel', hostel: 'hotel', 'khach san': 'hotel', lodging: 'hotel',
  karaoke: 'bar', pub: 'bar', club: 'bar', nightlife: 'bar', 'night_club': 'bar', lounge: 'bar',
  fitness: 'gym', yoga: 'gym',
  movie: 'cinema', movies: 'cinema', theater: 'cinema', theatre: 'cinema', 'rap phim': 'cinema',
  entertainment: 'attraction', amusement: 'attraction', park: 'attraction', tourist: 'attraction', sightseeing: 'attraction',
  playground: 'attraction', museum: 'attraction', 'vui choi': 'attraction', 'giai tri': 'attraction', activity: 'attraction',
  shopping: 'mall', market: 'mall', store: 'mall', supermarket: 'mall',
}

/** The enum value for whatever the model wrote, or undefined (search without a type). */
export function coercePlaceType(raw: unknown): PlaceType | undefined {
  if (typeof raw !== 'string') return undefined
  const t = raw.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if ((PLACE_TYPES as readonly string[]).includes(t)) return t as PlaceType
  if (SYNONYMS[t]) return SYNONYMS[t]
  for (const [k, v] of Object.entries(SYNONYMS)) if (t.includes(k)) return v
  for (const p of PLACE_TYPES) if (t.includes(p)) return p
  return undefined
}
