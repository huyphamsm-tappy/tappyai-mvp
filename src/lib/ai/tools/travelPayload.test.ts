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
  // PHASE 1C: an optimization that silently drops a booking link is a regression, not a saving.
  for (const field of ['location', 'hotel_list', 'booking_link', 'agoda_link', 'note', 'search_url', 'search_results']) {
    it(`still emits ${field}`, () => {
      expect(source).toContain(`${field}:`)
    })
  }

  it('every branch of getHotelPrices still hands back the booking links', () => {
    // Scoped to getHotelPrices, because `booking_link:` appears six times across travel.ts in
    // flight and transport paths this change does not touch — a whole-file count would assert
    // nothing about the branches that matter.
    //
    // getHotelPrices has THREE exits, not two: prices found, no prices, and fetch failed. The
    // last is exactly when a traveller most needs the link, so it is included rather than
    // treated as an error case that can return nothing useful.
    const start = source.indexOf('export async function getHotelPrices')
    expect(start, 'getHotelPrices not found').toBeGreaterThan(-1)
    const next = source.indexOf('\nexport async function', start + 1)
    const body = source.slice(start, next === -1 ? undefined : next)

    const branches = [...body.matchAll(/result = \{/g)].length
    expect(branches, 'getHotelPrices should have three result branches').toBe(3)

    // Each of the three assigns both links; counting occurrences inside the function body is
    // enough and does not depend on brace-matching a formatting style.
    expect((body.match(/booking_link:/g) ?? []).length).toBe(3)
    expect((body.match(/agoda_link:/g) ?? []).length).toBe(3)
    expect(body).not.toContain('_debug_budget')
  })
})
