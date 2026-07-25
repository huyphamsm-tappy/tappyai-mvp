// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildFlightLinks } from './travel'

describe('buildFlightLinks — VN-recognizable flight links (replaces Aviasales)', () => {
  it('returns Traveloka + Google Flights, route-specific, with a valid future date', () => {
    const links = buildFlightLinks('SGN', 'PQC', '2026-07-28')
    expect(links.map(l => l.name)).toEqual(['Traveloka', 'Google Flights'])

    const traveloka = links[0].url
    // Traveloka one-way deep-link: route via ap=O.D and date as DD-MM-YYYY (verified in-browser).
    expect(traveloka).toContain('traveloka.com/vi-VN/flight/fullsearch')
    expect(traveloka).toContain('ap=SGN.PQC')
    expect(traveloka).toContain('dt=28-07-2026.null')

    const google = links[1].url
    expect(google).toContain('google.com/travel/flights?q=')
    expect(decodeURIComponent(google)).toContain('Flights from SGN to PQC on 2026-07-28')

    // Never the broken foreign link.
    expect(traveloka).not.toContain('aviasales')
    expect(google).not.toContain('aviasales')
  })

  it('uppercases codes and falls back to the Traveloka landing (never an error page) when no date', () => {
    const links = buildFlightLinks('han', 'dad')
    expect(links[0].url).toBe('https://www.traveloka.com/vi-VN/flight') // safe landing, no date params
    expect(decodeURIComponent(links[1].url)).toContain('Flights from HAN to DAD')
    expect(decodeURIComponent(links[1].url)).not.toContain(' on ') // no date appended
  })
})
