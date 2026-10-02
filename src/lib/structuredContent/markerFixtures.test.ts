// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePlan, parseCTA, parseFollowups } from '@/components/ChatInterface'
// Phase 1 owns this module. It is imported read-only here so the chain under test is the SAME
// chain ChatInterface runs (see ChatInterface.tsx ~L1300-1306), not a subset of it.
import { parseShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import { parsePlacesMarker } from '@/lib/recommendation/marker'

/**
 * P4-02 — SHARED STRUCTURED-CONTENT CONFORMANCE (Web side).
 *
 * The cases come from `shared/structured-content/marker-fixtures.json`, which Android and iOS read
 * too. One file, three consumers: when the server gains a marker or changes a shape, the fixture is
 * edited once and all three suites fail until all three parsers are fixed.
 *
 * Web is the REFERENCE implementation (V3_PLATFORM_PARITY.md §4.2) — its `findMarkerJson` brace
 * matcher already handles the bare-then-followups shape that leaked on Android. So this file is
 * expected to be green on arrival; its job is to pin that reference behaviour so a future Web
 * change cannot silently move the target the other two platforms are aiming at.
 */

// Resolved from the project root (vitest's cwd) rather than `import.meta.url`: the jsdom
// environment does not give this module a `file:` URL, so fileURLToPath throws there.
export const FIXTURES_PATH = resolve(process.cwd(), 'shared/structured-content/marker-fixtures.json')

const FIXTURES = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as {
  version: number
  cases: Array<{
    id: string
    description: string
    input: string
    expectVisibleContains: string[]
    expectVisibleNotContains: string[]
    expectCtaLabels: string[]
    expectFollowups: string[]
    expectPlanPresent: boolean
    /** Durable places decoded from [TAPPY_PLACES]. Absent on a case that carries none. */
    expectPlacesCount?: number
    expectPlaceNames?: string[]
  }>
}

/**
 * The full client parse chain, in the exact order `ChatInterface` runs it
 * (ChatInterface.tsx ~L1300-1306): plan → CTA → followups → shopping → places.
 * Both the streaming body and the settled body run this identical chain.
 */
function parseAll(content: string) {
  const plan = parsePlan(content)
  const cta = parseCTA(plan.text)
  const followups = parseFollowups(cta.text)
  const shopping = parseShoppingMarker(followups.text)
  const places = parsePlacesMarker(shopping.text)
  return {
    visible: places.text,
    ctaLabels: cta.buttons.map(b => b.label),
    followups: followups.followups,
    planPresent: plan.plan !== null,
    shoppingPresent: shopping.view !== null,
    placeNames: (places.payload?.items ?? []).map(i => i.name ?? ''),
  }
}

describe('structured-content fixtures — Web (reference implementation)', () => {
  it('loads the shared fixture file', () => {
    expect(FIXTURES.version).toBe(1)
    expect(FIXTURES.cases.length).toBeGreaterThan(0)
  })

  for (const c of FIXTURES.cases) {
    describe(`${c.id}`, () => {
      const parsed = () => parseAll(c.input)

      it('the user never reads a marker or its payload', () => {
        const { visible } = parsed()
        for (const forbidden of c.expectVisibleNotContains) {
          expect(visible, `${c.id}: leaked ${JSON.stringify(forbidden)} — ${c.description}`)
            .not.toContain(forbidden)
        }
      })

      it('prose survives', () => {
        const { visible } = parsed()
        for (const required of c.expectVisibleContains) {
          expect(visible, `${c.id}: lost prose ${JSON.stringify(required)}`).toContain(required)
        }
      })

      it('CTA buttons decode into their model', () => {
        expect(parsed().ctaLabels, `${c.id}: CTA labels`).toEqual(c.expectCtaLabels)
      })

      it('follow-ups decode into their model', () => {
        expect(parsed().followups, `${c.id}: followups`).toEqual(c.expectFollowups)
      })

      it('plan presence matches', () => {
        expect(parsed().planPresent, `${c.id}: plan presence`).toBe(c.expectPlanPresent)
      })

      it('durable places decode into their model, in order', () => {
        const { placeNames } = parsed()
        expect(placeNames.length, `${c.id}: places count`).toBe(c.expectPlacesCount ?? 0)
        if (c.expectPlaceNames) {
          expect(placeNames, `${c.id}: place names, in rank order`).toEqual(c.expectPlaceNames)
        }
      })
    })
  }
})

/**
 * D1 — the shopping DECISION reaches every client, and only Web renders it today.
 *
 * The fixture suite pins the half that is already true everywhere: the block is stripped from the
 * visible text on all three platforms. The half that is NOT yet true — Android and iOS rendering
 * the decision card — is P4-06/P4-07 and is asserted by those platforms' own component tests, not
 * here. Web additionally decodes the block into a view, which is what this case pins.
 */
describe('D1 — the shopping block decodes on Web', () => {
  it('shopping-full decodes into a synthesis view', () => {
    const c = FIXTURES.cases.find(x => x.id === 'shopping-full')!
    expect(parseAll(c.input).shoppingPresent, 'Web must decode the decision, not merely strip it')
      .toBe(true)
  })

  it('a truncated shopping block decodes into nothing and leaks nothing', () => {
    const c = FIXTURES.cases.find(x => x.id === 'shopping-unterminated')!
    const { visible, shoppingPresent } = parseAll(c.input)
    expect(shoppingPresent).toBe(false)
    expect(visible).not.toContain('TAPPY_SHOPPING')
    expect(visible).not.toContain('MacBook Air')
  })
})
