import { describe, it, expect } from 'vitest'
import { coerceTransportMode } from './transportMode'

// Same class as E1 (placeType.ts): an off-enum `mode` used to fail SDK validation before
// execute() ran and cost the whole turn. Any word the model writes must map or be dropped.
describe('coerceTransportMode', () => {
  it('keeps a known mode as is', () => {
    expect(coerceTransportMode('intercity')).toBe('intercity')
    expect(coerceTransportMode('taxi')).toBe('taxi')
    expect(coerceTransportMode(' Taxi ')).toBe('taxi')
    expect(coerceTransportMode('inter-city')).toBe('intercity')
  })
  it('maps the synonyms the model actually writes', () => {
    expect(coerceTransportMode('bus')).toBe('intercity')
    expect(coerceTransportMode('train')).toBe('intercity')
    expect(coerceTransportMode('xe khách')).toBe('intercity')
    expect(coerceTransportMode('xe khách giường nằm')).toBe('intercity')
    expect(coerceTransportMode('tàu hỏa')).toBe('intercity')
    expect(coerceTransportMode('limousine')).toBe('intercity')
    expect(coerceTransportMode('grab')).toBe('taxi')
    expect(coerceTransportMode('Xanh SM')).toBe('taxi')
    expect(coerceTransportMode('xe công nghệ')).toBe('taxi')
    expect(coerceTransportMode('ride_hailing')).toBe('taxi')
    expect(coerceTransportMode('xe ôm')).toBe('taxi')
    expect(coerceTransportMode('be')).toBe('taxi')
  })
  it('drops what it cannot place (the tool then infers from the route)', () => {
    expect(coerceTransportMode('bell')).toBeUndefined()
    expect(coerceTransportMode('zzz')).toBeUndefined()
    expect(coerceTransportMode('')).toBeUndefined()
    expect(coerceTransportMode(undefined)).toBeUndefined()
    expect(coerceTransportMode(3)).toBeUndefined()
  })
})
