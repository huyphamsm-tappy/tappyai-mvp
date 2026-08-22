import { describe, it, expect } from 'vitest'
import { UserAnalyticsQuerySchema, buildFilter, rangeIsValid } from './schema'

// The query contract for GET /api/admin/analytics/users (Module 04).
//
// Added with the retention view: `view` is now a four-way enum, and a
// mistyped value has to be a 422 rather than a silent fall-through to growth.
// The handler's `q.view === ...` chain ends in a bare `else`, so an enum that
// accepted anything would render the GROWTH panel under the RETENTION tab —
// wrong numbers under a correct-looking heading, which is the failure mode
// hardest to notice.

const parse = (q: Record<string, string>) => UserAnalyticsQuerySchema.safeParse(q)

describe('view', () => {
  it.each(['growth', 'engagement', 'funnel', 'retention'])('accepts %s', (view) => {
    const r = parse({ view })
    expect(r.success && r.data.view).toBe(view)
  })

  it('defaults to growth when absent', () => {
    const r = parse({})
    expect(r.success && r.data.view).toBe('growth')
  })

  it('🔑 rejects an unknown view instead of falling back to growth', () => {
    expect(parse({ view: 'churn' }).success).toBe(false)
  })

  it('is case-sensitive — `Retention` is not the retention view', () => {
    expect(parse({ view: 'Retention' }).success).toBe(false)
  })
})

describe('dates', () => {
  it('accepts YYYY-MM-DD', () => {
    const r = parse({ from: '2026-08-01', to: '2026-08-20' })
    expect(r.success).toBe(true)
  })

  it('rejects any other date shape', () => {
    for (const bad of ['2026-8-1', '20260801', '01/08/2026', '2026-08-01T00:00:00Z']) {
      expect(parse({ from: bad }).success, bad).toBe(false)
    }
  })

  it('🔑 rejects an unknown parameter rather than ignoring it', () => {
    // A caller passing `?platform=android` would otherwise believe the series
    // was filtered by platform when it was not.
    expect(parse({ view: 'retention', platform: 'android' }).success).toBe(false)
  })
})

describe('rangeIsValid', () => {
  it('an inverted range is INVALID — a 422, not an empty series', () => {
    // An empty answer to an inverted range is indistinguishable from "the
    // rollup has not run", which is the one thing Module 04 must never blur.
    expect(rangeIsValid({ view: 'retention', from: '2026-08-20', to: '2026-08-01' })).toBe(false)
  })

  it('an equal from/to is a valid single day', () => {
    expect(rangeIsValid({ view: 'retention', from: '2026-08-01', to: '2026-08-01' })).toBe(true)
  })

  it('a half-open range is valid — either bound may be omitted', () => {
    expect(rangeIsValid({ view: 'retention', from: '2026-08-01' })).toBe(true)
    expect(rangeIsValid({ view: 'retention', to: '2026-08-01' })).toBe(true)
    expect(rangeIsValid({ view: 'retention' })).toBe(true)
  })
})

describe('buildFilter', () => {
  it('carries the bounds through and nothing else', () => {
    expect(buildFilter({ view: 'retention', from: '2026-08-01', to: '2026-08-20' }))
      .toEqual({ from: '2026-08-01', to: '2026-08-20' })
  })

  it('leaves absent bounds undefined rather than inventing a default window', () => {
    expect(buildFilter({ view: 'retention' })).toEqual({ from: undefined, to: undefined })
  })
})
