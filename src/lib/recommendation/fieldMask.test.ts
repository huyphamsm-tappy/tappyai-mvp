import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── PART 1 — the widened Google Places field mask, pinned ───────────────────
//
// 🔑 WHY A SOURCE-LEVEL TEST AND NOT A BEHAVIOURAL ONE. The mask decides what
// Google BILLS and what it returns, and neither can be observed from a unit
// test: the local API key is restricted to the legacy Places API and answers
// this endpoint with 403. What CAN be pinned deterministically is the contract —
// which fields are asked for, and that none of them crosses into the tier nobody
// approved. That is the part a future edit could silently break.

const SRC = readFileSync(resolve(process.cwd(), 'src/lib/ai/tools/food.ts'), 'utf8')

/** The mask array literal, brace-matched, so a field in a comment cannot satisfy the assertion. */
function maskLiteral(): string {
  const at = SRC.indexOf('const SEARCH_FIELD_MASK')
  expect(at, 'SEARCH_FIELD_MASK must exist').toBeGreaterThan(-1)
  const open = SRC.indexOf('[', at)
  const close = SRC.indexOf(']', open)
  return SRC.slice(open, close + 1)
}

const APPROVED = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.currentOpeningHours',
  'places.nationalPhoneNumber',
  'places.priceLevel',
  'places.priceRange',
  'places.location',
  'places.types',
  'places.photos',
]

describe('the mask asks for exactly the approved fields', () => {
  const literal = maskLiteral()

  it.each(APPROVED)('%s is requested', (field) => {
    expect(literal).toContain(`'${field}'`)
  })

  it('requests nothing beyond the approved list', () => {
    const asked = [...literal.matchAll(/'(places\.[A-Za-z]+)'/g)].map(m => m[1])
    expect([...new Set(asked)].sort()).toEqual([...APPROVED].sort())
  })
})

describe('the mask stays inside the tier that is already being paid for', () => {
  /**
   * 🚨 THE COST GUARD. Google bills a Text Search request at the HIGHEST tier in
   * the mask. `rating` / `userRatingCount` / `websiteUri` already put it at
   * Enterprise, which is why everything added in rev 2 was free. An
   * Atmosphere-tier field would move the whole request to a more expensive SKU —
   * a commercial decision (architecture rev 2 §4.5, Option B) that was priced
   * and explicitly NOT approved.
   */
  const ATMOSPHERE = [
    'places.editorialSummary', 'places.reviews', 'places.outdoorSeating',
    'places.servesVegetarianFood', 'places.reservable', 'places.takeout',
    'places.delivery', 'places.dineIn', 'places.goodForChildren',
    'places.goodForGroups', 'places.servesBreakfast', 'places.servesCoffee',
    'places.allowsDogs', 'places.parkingOptions', 'places.paymentOptions',
    'places.generativeSummary', 'places.evChargeOptions', 'places.fuelOptions',
  ]

  it.each(ATMOSPHERE)('%s is NOT requested — it would change the SKU', (field) => {
    expect(maskLiteral()).not.toContain(`'${field}'`)
  })
})

describe('the retired legacy photo lookup does not come back', () => {
  const COMMON = readFileSync(resolve(process.cwd(), 'src/lib/ai/tools/common.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n')

  it('nothing calls the legacy Place Details endpoint any more', () => {
    // Separately billed (Places Details Legacy, $17/1 000) and entirely
    // redundant once `places.photos` rides on the search response.
    expect(COMMON).not.toContain('place/details/json')
  })

  it('the photo media call is still made, from the resource name', () => {
    // The retirement removed a LOOKUP, not the photo itself.
    expect(COMMON).toContain('places.googleapis.com/v1/${photoName}/media')
  })
})
