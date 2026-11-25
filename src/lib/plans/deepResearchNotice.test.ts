import { describe, it, expect } from 'vitest'
import { nextMonthStartVn, displayResetDate, DEEP_RESET_HEADER } from './deepResearchNotice'

describe('nextMonthStartVn', () => {
  it('is the first day of the next month, in Vietnam time', () => {
    expect(nextMonthStartVn('2026-11-20')).toBe('2026-12-01')
    expect(nextMonthStartVn('2026-01-31')).toBe('2026-02-01')
  })
  it('rolls the year over in December', () => { expect(nextMonthStartVn('2026-12-15')).toBe('2027-01-01') })
})

describe('displayResetDate', () => {
  it('shows the day first, as people write it in Vietnam', () => {
    expect(displayResetDate('2026-12-01')).toBe('01/12/2026')
    expect(displayResetDate('not a date')).toBe('not a date')
  })
})

describe('the header', () => {
  it('is lower case (HTTP headers are read case-insensitively; the page reads it by this name)', () => { expect(DEEP_RESET_HEADER).toBe('x-tappy-deep-reset') })
})
