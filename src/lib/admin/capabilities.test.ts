import { describe, it, expect } from 'vitest'
import { NO_CAPABILITIES } from './capabilities'

// These tests lock the CONTRACT of Actor.capabilities during the window between
// component 2 (the field exists) and component 5 (the registry populates it).
//
// The hazard being guarded against: an empty array read as "this actor has no
// capabilities" would deny every actor, including the Platform Owner, the
// moment any code gates on it. The field is a reserved slot, not an input.

describe('NO_CAPABILITIES — reserved-slot contract', () => {
  it('is empty until the Capability Registry lands (component 5)', () => {
    expect(NO_CAPABILITIES).toEqual([])
  })

  it('is frozen, so accidental mutation of the shared array fails loudly', () => {
    expect(Object.isFrozen(NO_CAPABILITIES)).toBe(true)
    // Actors share this one array; a push would leak across every request on
    // the instance. Strict mode throws; non-strict silently no-ops — either way
    // the array must remain empty.
    expect(() => (NO_CAPABILITIES as unknown as CapabilityArray).push('anything')).toThrow()
    expect(NO_CAPABILITIES).toHaveLength(0)
  })

  it('documents that empty means "registry absent", not "denied everything"', () => {
    // Encoded as an executable reminder: if a future change starts populating
    // this constant, that is a signal the contract moved and every consumer
    // added in the meantime must be re-reviewed.
    expect(NO_CAPABILITIES.length).toBe(0)
  })
})

type CapabilityArray = { push: (v: string) => number }
