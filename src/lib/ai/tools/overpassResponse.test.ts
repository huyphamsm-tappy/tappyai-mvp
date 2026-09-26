import { describe, it, expect } from 'vitest'
import { usableOverpass } from './overpassResponse'

// The exact body Overpass returned for the food query at the GPS radius the
// locationBias branch used to send (r=2000, District 1 HCMC), captured live.
const TIMED_OUT = {
  version: 0.6,
  generator: 'Overpass API 0.7.62.11 87bfad18',
  elements: [],
  remark: 'runtime error: Query timed out in "query" at line 1 after 14 seconds.',
}

describe('🚨 usableOverpass — a 200 is not a result', () => {
  it('rejects a timed-out query that arrived as a successful empty answer', () => {
    expect(usableOverpass(TIMED_OUT)).toBeNull()
  })

  it('rejects the other runtime failure Overpass words the same way', () => {
    expect(usableOverpass({ elements: [], remark: 'runtime error: Query run out of memory' })).toBeNull()
  })

  it('🚨 accepts a genuinely empty area — it carries NO remark', () => {
    // The distinction the whole file exists for: absence and failure both have
    // zero elements, and only the remark separates them.
    const empty = { version: 0.6, elements: [] }
    expect(usableOverpass(empty)).toBe(empty)
  })

  it('accepts a normal payload with rows', () => {
    const ok = { elements: [{ type: 'node', tags: { name: 'Quán Ăn' } }] }
    expect(usableOverpass(ok)).toBe(ok)
  })

  it('keeps a remark that is not a failure', () => {
    // Overpass also emits informational remarks; only failures are rejected.
    const info = { elements: [{ type: 'node' }], remark: 'considered 1 element' }
    expect(usableOverpass(info)).toBe(info)
  })

  it('degrades to null on anything that is not an object', () => {
    for (const bad of [null, undefined, '', 'oops', 42, true]) {
      expect(usableOverpass(bad)).toBeNull()
    }
  })

  it('an HTML error page parsed into a string is not a payload', () => {
    // The kumi.systems shape: HTTP 200 carrying markup.
    expect(usableOverpass('<html><body>error</body></html>')).toBeNull()
  })
})
