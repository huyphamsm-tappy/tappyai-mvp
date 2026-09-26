import { describe, it, expect } from 'vitest'
import { coerceTransportMode } from './transportMode'

// Same class as E1 (placeType.ts): an off-enum `mode` used to fail SDK validation before
// execute() ran and cost the whole turn. Any value the model writes must map, or come back as an
// explicit unknown that still carries what the model wrote — never a silent default.
describe('coerceTransportMode', () => {
  it('keeps a known mode as is', () => {
    expect(coerceTransportMode('intercity')).toEqual({ mode: 'intercity', raw: 'intercity', coerced: false })
    expect(coerceTransportMode('taxi')).toEqual({ mode: 'taxi', raw: 'taxi', coerced: false })
    expect(coerceTransportMode(' Taxi ')).toMatchObject({ mode: 'taxi', coerced: true })
    expect(coerceTransportMode('inter-city')).toMatchObject({ mode: 'intercity' })
  })
  it('maps the synonyms the model actually writes', () => {
    for (const [v, m] of [['bus', 'intercity'], ['train', 'intercity'], ['xe khách', 'intercity'], ['xe khách giường nằm', 'intercity'],
      ['tàu hỏa', 'intercity'], ['limousine', 'intercity'], ['grab', 'taxi'], ['Xanh SM', 'taxi'], ['xe công nghệ', 'taxi'],
      ['ride_hailing', 'taxi'], ['xe ôm', 'taxi'], ['be', 'taxi']] as const) {
      expect(coerceTransportMode(v), v).toMatchObject({ mode: m, raw: v, coerced: true })
    }
  })
  it('omitted / empty ⇒ the tool default (undefined), never an unknown', () => {
    expect(coerceTransportMode(undefined)).toEqual({ mode: undefined, raw: undefined, coerced: false })
    expect(coerceTransportMode(null)).toEqual({ mode: undefined, raw: undefined, coerced: false })
    expect(coerceTransportMode('')).toEqual({ mode: undefined, raw: undefined, coerced: false })
  })
  it('a value that names neither kind of trip is an explicit unknown carrying the original', () => {
    expect(coerceTransportMode('bell')).toEqual({ mode: 'unknown', raw: 'bell', coerced: false })
    expect(coerceTransportMode('zzz')).toEqual({ mode: 'unknown', raw: 'zzz', coerced: false })
    expect(coerceTransportMode(3)).toEqual({ mode: 'unknown', raw: '3', coerced: false })
  })
})
