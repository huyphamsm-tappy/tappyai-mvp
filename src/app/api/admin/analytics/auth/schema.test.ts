import { describe, it, expect } from 'vitest'
import { AuthAnalyticsQuerySchema, buildFilter, paginate } from './schema'

describe('AuthAnalyticsQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const q = AuthAnalyticsQuerySchema.parse({})
    expect(q).toMatchObject({ view: 'summary', dimension: 'method', limit: 100, offset: 0 })
  })

  it('accepts all views and dimensions', () => {
    for (const view of ['summary', 'provider', 'platform', 'trend', 'acquisition']) {
      expect(AuthAnalyticsQuerySchema.safeParse({ view }).success).toBe(true)
    }
    for (const dimension of ['method', 'platform', 'app_version', 'country', 'language', 'source']) {
      expect(AuthAnalyticsQuerySchema.safeParse({ view: 'acquisition', dimension }).success).toBe(true)
    }
  })

  it('rejects an invalid view / dimension', () => {
    expect(AuthAnalyticsQuerySchema.safeParse({ view: 'nope' }).success).toBe(false)
    expect(AuthAnalyticsQuerySchema.safeParse({ view: 'acquisition', dimension: 'nope' }).success).toBe(false)
  })

  it('validates YYYY-MM-DD dates', () => {
    expect(AuthAnalyticsQuerySchema.safeParse({ from: '2026-07-13', to: '2026-07-20' }).success).toBe(true)
    expect(AuthAnalyticsQuerySchema.safeParse({ from: '07/13/2026' }).success).toBe(false)
    expect(AuthAnalyticsQuerySchema.safeParse({ to: '2026-7-1' }).success).toBe(false)
  })

  it('coerces limit/offset from strings and enforces bounds', () => {
    expect(AuthAnalyticsQuerySchema.parse({ limit: '50', offset: '10' })).toMatchObject({ limit: 50, offset: 10 })
    expect(AuthAnalyticsQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(AuthAnalyticsQuerySchema.safeParse({ limit: '501' }).success).toBe(false)
    expect(AuthAnalyticsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })

  it('passes through filter fields', () => {
    const q = AuthAnalyticsQuerySchema.parse({ platform: 'web', method: 'google', app_version: '1.2.0', country: 'VN', language: 'vi' })
    expect(q).toMatchObject({ platform: 'web', method: 'google', app_version: '1.2.0', country: 'VN', language: 'vi' })
  })
})

describe('buildFilter', () => {
  it('extracts only the service filter fields', () => {
    const q = AuthAnalyticsQuerySchema.parse({ view: 'trend', from: '2026-07-01', to: '2026-07-31', platform: 'ios', country: 'VN' })
    expect(buildFilter(q)).toEqual({
      from: '2026-07-01', to: '2026-07-31', platform: 'ios', method: undefined,
      app_version: undefined, country: 'VN', language: undefined,
    })
  })
})

describe('paginate', () => {
  const rows = [1, 2, 3, 4, 5]
  it('slices and reports meta.page', () => {
    expect(paginate(rows, 2, 1)).toEqual({ items: [2, 3], page: { limit: 2, offset: 1, total: 5, hasMore: true } })
  })
  it('hasMore=false on the last page', () => {
    expect(paginate(rows, 2, 4)).toEqual({ items: [5], page: { limit: 2, offset: 4, total: 5, hasMore: false } })
  })
  it('empty input', () => {
    expect(paginate([], 10, 0)).toEqual({ items: [], page: { limit: 10, offset: 0, total: 0, hasMore: false } })
  })
})
