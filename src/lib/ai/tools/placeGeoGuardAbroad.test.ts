// 01/11 (owner UAT, 10 plan questions): every search_places for Singapore and Bali came back empty - the log said
// {"guard":"place_geography","area":"Bali, Indonesia","dropped":10,"reasons":["foreign" x10]}. The guard (R13, Android 29/09) was written for a
// Vietnam-only product: any address outside Việt Nam goes. Tappy now answers a trip to Bali too, and its search is centred on the place's OWN
// coordinates (food.ts, 02/11), so the rows are the right ones and the guard threw all of them away. A search centred abroad keeps the rows
// near that centre; the "outside Việt Nam" drop stays for a search that is about Việt Nam.
import { describe, it, expect } from 'vitest'
import { guardPlaceGeography } from './placeGeoGuard'

const BALI = { lat: -8.8, lng: 115.22 }
const row = (name: string, address: string, lat?: number, lng?: number) => ({ name, address, ...(lat !== undefined ? { lat, lng } : {}) })
const result = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ source: 'serper_maps', count: rows.length, results: rows, ...extra })

describe('a search centred abroad (centre_abroad)', () => {
  const rows = [
    row('Jajan by the Sea', 'Jl. Pantai Mengiat, Nusa Dua, Bali 80363, Indonesia', -8.805, 115.23),
    row('Bawang Merah Beachfront', 'Jl. Four Seasons, Jimbaran, Bali, Indonesia', -8.78, 115.16),
    row('Saigon | Vietnamese Cuisine', '12100 W Center Rd, Omaha, NE 68144', 41.23, -96.1),
    row('No coordinates', 'Nusa Dua, Bali, Indonesia'),
  ]
  const out = guardPlaceGeography(result(rows, { centre_abroad: BALI }), 'Bali, Indonesia')
  it('keeps the rows near the centre, whatever country their address names', () => {
    const names = (out.result as { results: Array<{ name: string }> }).results.map(r => r.name)
    expect(names).toContain('Jajan by the Sea')
    expect(names).toContain('Bawang Merah Beachfront')
  })
  it('still drops a row far from the centre (a namesake restaurant on another continent)', () => {
    expect(out.dropped).toEqual([{ name: 'Saigon | Vietnamese Cuisine', reason: 'too_far' }])
  })
  it('keeps a row with no coordinates, as before', () => {
    expect((out.result as { results: Array<{ name: string }> }).results.map(r => r.name)).toContain('No coordinates')
  })
})

describe('a search about Việt Nam (no centre_abroad)', () => {
  it('still drops a row whose address is outside Việt Nam', () => {
    const out = guardPlaceGeography(result([row('Jajan by the Sea', 'Nusa Dua, Bali, Indonesia', -8.8, 115.2), row('Phở 24', '1 Lê Lợi, Quận 1, TP.HCM', 10.77, 106.7)]), 'Quận 1, TP.HCM')
    expect(out.dropped).toEqual([{ name: 'Jajan by the Sea', reason: 'foreign' }])
  })
})
