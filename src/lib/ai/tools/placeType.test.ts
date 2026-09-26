import { describe, it, expect } from 'vitest'
import { coercePlaceType } from './placeType'

// Measured 2026-09-18 (E1, four runs): `type: "entertainment"` failed the enum before execute()
// ran and the turn ended with "An error occurred." — a wrong category must never cost the turn.
describe('coercePlaceType', () => {
  it('keeps a known type as is', () => {
    for (const t of ['restaurant', 'cafe', 'spa', 'hotel', 'bar', 'gym', 'cinema', 'attraction', 'mall']) expect(coercePlaceType(t)).toBe(t)
    expect(coercePlaceType(' Cinema ')).toBe('cinema')
  })
  it('maps the synonyms the model actually writes', () => {
    expect(coercePlaceType('entertainment')).toBe('attraction')
    expect(coercePlaceType('karaoke')).toBe('bar')
    expect(coercePlaceType('night_club')).toBe('bar')
    expect(coercePlaceType('movie theater')).toBe('cinema')
    expect(coercePlaceType('resort')).toBe('hotel')
    expect(coercePlaceType('massage')).toBe('spa')
    expect(coercePlaceType('shopping')).toBe('mall')
    expect(coercePlaceType('amusement park')).toBe('attraction')
  })
  it('drops what it cannot place (a type-less search still runs)', () => {
    expect(coercePlaceType('zzz')).toBeUndefined()
    expect(coercePlaceType(undefined)).toBeUndefined()
    expect(coercePlaceType(42)).toBeUndefined()
  })
})
