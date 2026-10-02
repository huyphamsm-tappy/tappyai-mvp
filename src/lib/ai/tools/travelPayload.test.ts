import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The hotel tool's result object is sent to the model verbatim (toolResultSplit carves out only
// the four enrichment keys). Anything left in it is paid for on every travel turn, in input
// tokens, forever.
//
// `_debug_budget` was a development probe — it reported whether a budget had been parsed out of
// the user's message. Nothing reads it: not the prompt, not the client, not a test. It was pure
// cost, and it also put an internal field name in front of the model on a user-facing path.
//
// The second half of this file is the part that matters more. Removing a field from a payload is
// exactly how consultative information gets lost by accident, so the same suite that asserts the
// probe is gone also asserts that every link the user acts on is still there.

const SOURCE = 'src/lib/ai/tools/travel.ts'
const source = readFileSync(SOURCE, 'utf8')

describe('the hotel tool payload carries no debug field', () => {
  it('does not emit _debug_budget', () => {
    expect(source).not.toContain('_debug_budget')
  })

  it('no debug-shaped key survives anywhere in the tool payloads', () => {
    // A leading underscore is this codebase's marker for "internal"; none belongs in a payload
    // the model is billed to read.
    const keys = [...source.matchAll(/^\s{6,}(_[a-zA-Z0-9_]+)\s*:/gm)].map((m) => m[1])
    expect(keys).toEqual([])
  })
})

describe('the consultative fields the user acts on are still emitted', () => {
  // PHASE 1C: an optimization that silently drops a hotel row is a regression, not a saving.
  for (const field of ['location', 'hotel_list', 'note', 'search_results']) {
    it(`still emits ${field}`, () => {
      expect(source).toContain(`${field}:`)
    })
  }

  // A3.3 (owner, 2026-09-20): the Booking.com results page, Agoda's front door and `search_url`
  // are SEARCH / HOMEPAGE depth — never emitted. A hotel's link is its own OTA page (a row) or a
  // Commerce Link with the stay applied. Superseded here: PHASE 1C's "every branch hands back the
  // booking links".
  const hotelBody = () => {
    const start = source.indexOf('export async function getHotelPrices')
    expect(start, 'getHotelPrices not found').toBeGreaterThan(-1)
    const next = source.indexOf('\nexport async function', start + 1)
    return source.slice(start, next === -1 ? undefined : next)
  }
  for (const field of ['booking_link', 'agoda_link', 'search_url']) {
    it(`no longer emits ${field} from getHotelPrices`, () => {
      expect(hotelBody()).not.toContain(`${field}:`)
    })
  }

  it('every branch of getHotelPrices is honest: three exits, none with a results page or a front door', () => {
    const body = hotelBody()
    const branches = [...body.matchAll(/result = \{/g)].length
    expect(branches, 'getHotelPrices should have three result branches').toBe(3)
    expect(body).not.toContain('_debug_budget')
  })
})
