import { describe, it, expect } from 'vitest'
import { ActivationAnalyticsQuerySchema, buildFilter, paginate } from './schema'

describe('ActivationAnalyticsQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const q = ActivationAnalyticsQuerySchema.parse({})
    expect(q).toMatchObject({ view: 'summary', limit: 100, offset: 0 })
  })

  it('accepts all views', () => {
    for (const view of ['summary', 'by_source', 'by_platform', 'trend', 'rule']) {
      expect(ActivationAnalyticsQuerySchema.safeParse({ view }).success).toBe(true)
    }
  })

  it('rejects an invalid view', () => {
    expect(ActivationAnalyticsQuerySchema.safeParse({ view: 'nope' }).success).toBe(false)
  })

  it('validates YYYY-MM-DD dates', () => {
    expect(ActivationAnalyticsQuerySchema.safeParse({ from: '2026-07-13', to: '2026-07-20' }).success).toBe(true)
    expect(ActivationAnalyticsQuerySchema.safeParse({ from: '07/13/2026' }).success).toBe(false)
  })

  it('coerces limit/offset from strings and enforces bounds', () => {
    expect(ActivationAnalyticsQuerySchema.parse({ limit: '50', offset: '10' })).toMatchObject({ limit: 50, offset: 10 })
    expect(ActivationAnalyticsQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(ActivationAnalyticsQuerySchema.safeParse({ limit: '501' }).success).toBe(false)
    expect(ActivationAnalyticsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })

  it('passes through platform and rule_version', () => {
    const q = ActivationAnalyticsQuerySchema.parse({ platform: 'web', rule_version: 'v1' })
    expect(q).toMatchObject({ platform: 'web', rule_version: 'v1' })
  })
})

describe('buildFilter', () => {
  it('extracts only the service filter fields (rule_version omitted → undefined, resolved by the service)', () => {
    const q = ActivationAnalyticsQuerySchema.parse({ view: 'trend', from: '2026-07-01', to: '2026-07-31', platform: 'ios' })
    expect(buildFilter(q)).toEqual({ from: '2026-07-01', to: '2026-07-31', platform: 'ios', rule_version: undefined })
  })
})

describe('paginate', () => {
  const rows = [1, 2, 3, 4, 5]
  it('slices and reports meta.page', () => {
    expect(paginate(rows, 2, 1)).toEqual({ items: [2, 3], page: { limit: 2, offset: 1, total: 5, hasMore: true } })
  })
  it('empty input', () => {
    expect(paginate([], 10, 0)).toEqual({ items: [], page: { limit: 10, offset: 0, total: 0, hasMore: false } })
  })
})
