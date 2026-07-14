import { describe, it, expect } from 'vitest'
import { buildAuthQuery, formatInt, formatPct } from './authAnalyticsClient'

describe('buildAuthQuery', () => {
  it('serializes view + filters + options', () => {
    const p = new URLSearchParams(buildAuthQuery(
      'acquisition',
      { from: '2026-07-01', to: '2026-07-31', platform: 'web', app_version: '1.2', country: 'VN', language: 'vi' },
      { dimension: 'country', limit: 25, offset: 50 },
    ))
    expect(p.get('view')).toBe('acquisition')
    expect(p.get('dimension')).toBe('country')
    expect(p.get('from')).toBe('2026-07-01')
    expect(p.get('platform')).toBe('web')
    expect(p.get('app_version')).toBe('1.2')
    expect(p.get('country')).toBe('VN')
    expect(p.get('language')).toBe('vi')
    expect(p.get('limit')).toBe('25')
    expect(p.get('offset')).toBe('50')
  })

  it('omits empty filter fields and unset options', () => {
    const p = new URLSearchParams(buildAuthQuery('summary', {}))
    expect(p.get('view')).toBe('summary')
    expect(p.has('from')).toBe(false)
    expect(p.has('limit')).toBe(false)
    expect(p.has('dimension')).toBe(false)
  })
})

describe('formatters', () => {
  it('formatInt handles null and formats thousands', () => {
    expect(formatInt(null)).toBe('0')
    expect(formatInt(0)).toBe('0')
    expect(formatInt(1234)).toMatch(/1.?234/)
  })
  it('formatPct handles null and ratios', () => {
    expect(formatPct(null)).toBe('0.0%')
    expect(formatPct(0)).toBe('0.0%')
    expect(formatPct(0.9)).toBe('90.0%')
    expect(formatPct(0.795)).toBe('79.5%')
  })
})
