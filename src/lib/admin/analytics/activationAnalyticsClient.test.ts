import { describe, it, expect } from 'vitest'
import { buildActivationQuery, formatInt, formatPct } from './activationAnalyticsClient'

describe('buildActivationQuery', () => {
  it('serializes view + filters + options', () => {
    const p = new URLSearchParams(buildActivationQuery(
      'trend',
      { from: '2026-07-01', to: '2026-07-31', platform: 'web', rule_version: 'v1' },
      { limit: 25, offset: 50 },
    ))
    expect(p.get('view')).toBe('trend')
    expect(p.get('from')).toBe('2026-07-01')
    expect(p.get('to')).toBe('2026-07-31')
    expect(p.get('platform')).toBe('web')
    expect(p.get('rule_version')).toBe('v1')
    expect(p.get('limit')).toBe('25')
    expect(p.get('offset')).toBe('50')
  })

  it('omits empty filter fields and unset options', () => {
    const p = new URLSearchParams(buildActivationQuery('summary', {}))
    expect(p.get('view')).toBe('summary')
    expect(p.has('from')).toBe(false)
    expect(p.has('rule_version')).toBe(false)
    expect(p.has('limit')).toBe(false)
  })
})

describe('formatters', () => {
  it('formatInt handles null and formats thousands', () => {
    expect(formatInt(null)).toBe('0')
    expect(formatInt(1234)).toMatch(/1.?234/)
  })
  it('formatPct handles null and ratios', () => {
    expect(formatPct(null)).toBe('0.0%')
    expect(formatPct(0.4)).toBe('40.0%')
  })
})
