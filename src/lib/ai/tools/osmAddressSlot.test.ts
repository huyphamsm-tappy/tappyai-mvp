import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchPlacesOSM } from './food'
import { __clearToolCache } from './common'

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 A UI LABEL WAS RENDERING IN THE ADDRESS SLOT.
//
// When OSM carried no `addr:*` tags, the row was built with
// `address: messages.places.seeMap(lang)` — literally the words "Xem ban do".
// The card has no way to tell that apart from a street, so the address line of
// a Food result read "Xem ban do" as though that were where the venue is.
// Seen in the owner's Food UAT screenshot 2026-09-08.
//
// This is the same defect class `liveView.ts` already guards for the
// `KHONG CO DU LIEU` sentinel: an unknown field is ABSENT, never a stand-in
// string. `buildEntity` maps a missing address to `unknownClaim` and
// `PlaceDecision` renders the address line only when present, so the whole
// pipeline below this point already expects the field to be omitted.
// ─────────────────────────────────────────────────────────────────────────────

const rows = (tags: Record<string, string>) => ({
  elements: [{ type: 'node', lat: 10.77, lon: 106.7, tags: { name: 'Quán Thử', ...tags } }],
})

function stub(tags: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    if (url.includes('nominatim')) return new Response(JSON.stringify([{ lat: '10.7756', lon: '106.7019' }]), { status: 200 })
    if (url.includes('overpass') || url.includes('maps.mail.ru')) return new Response(JSON.stringify(rows(tags)), { status: 200 })
    return new Response('{}', { status: 200 })
  }))
}

beforeEach(() => { __clearToolCache() })
afterEach(() => { vi.unstubAllGlobals() })

interface Row { name: string; address?: string }
const first = async (): Promise<Row> => {
  const r = await searchPlacesOSM('quán ăn', 'Quận 1', 'restaurant', null, 'vi') as { results?: Row[] }
  return (r.results ?? [])[0]
}

describe('OSM address slot', () => {
  it('omits address entirely when OSM has no addr:* tags', async () => {
    stub({})
    const row = await first()
    expect(row.name).toBe('Quán Thử')
    expect(row.address).toBeUndefined()
  })

  it('never puts the "see map" UI label where an address belongs', async () => {
    stub({})
    const row = await first()
    // The exact regression: a call-to-action rendered as a location.
    expect(row.address ?? '').not.toMatch(/xem ban do|xem bản đồ|see map/i)
  })

  it('still reports a real address when OSM carries one', async () => {
    stub({ 'addr:housenumber': '12', 'addr:street': 'Lê Lợi' })
    expect((await first()).address).toBe('12 Lê Lợi')
  })

  it('falls back to addr:full when the parts are absent', async () => {
    stub({ 'addr:full': '12 Lê Lợi, Quận 1' })
    expect((await first()).address).toBe('12 Lê Lợi, Quận 1')
  })
})
