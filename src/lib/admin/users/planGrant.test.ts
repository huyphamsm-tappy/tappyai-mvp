import { describe, it, expect } from 'vitest'
import { addMonths, isLifetimeEnd } from './planGrant'

describe('addMonths (calendar months, UTC, clamped to a shorter month)', () => {
  it('adds whole months', () => {
    expect(addMonths(new Date('2026-11-26T10:00:00Z'), 1).toISOString()).toBe('2026-12-26T10:00:00.000Z')
    expect(addMonths(new Date('2026-11-26T10:00:00Z'), 12).toISOString()).toBe('2027-11-26T10:00:00.000Z')
    expect(addMonths(new Date('2026-11-26T10:00:00Z'), 3).toISOString()).toBe('2027-02-26T10:00:00.000Z')
  })
  it('clamps the 31st (and 29-31 in a short February)', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z')
    expect(addMonths(new Date('2026-08-31T00:00:00Z'), 1).toISOString()).toBe('2026-09-30T00:00:00.000Z')
  })
  it('100 years is 1200 months and lands on the same day', () => {
    expect(addMonths(new Date('2026-11-26T00:00:00Z'), 1200).toISOString()).toBe('2126-11-26T00:00:00.000Z')
  })
})

describe('isLifetimeEnd', () => {
  const now = new Date('2026-11-26T00:00:00Z')
  it('a date a century away is "no expiry"; an ordinary end date is not', () => {
    expect(isLifetimeEnd('2126-11-26T00:00:00Z', now)).toBe(true)
    expect(isLifetimeEnd('2027-11-26T00:00:00Z', now)).toBe(false)
    expect(isLifetimeEnd('2066-11-26T00:00:00Z', now)).toBe(false) // forty years is a very long plan, not "no expiry"
  })
  it('null, empty and garbage are not lifetime', () => {
    expect(isLifetimeEnd(null, now)).toBe(false)
    expect(isLifetimeEnd('', now)).toBe(false)
    expect(isLifetimeEnd('not a date', now)).toBe(false)
  })
})
