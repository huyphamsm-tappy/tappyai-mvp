import { describe, it, expect } from 'vitest'
import { nextMonthStartVn, deepExhaustedBlock } from './deepResearchNotice'

describe('nextMonthStartVn', () => {
  it('is the first day of the next month, in Vietnam time', () => {
    expect(nextMonthStartVn('2026-11-20')).toBe('2026-12-01')
    expect(nextMonthStartVn('2026-01-31')).toBe('2026-02-01')
  })
  it('rolls the year over in December', () => { expect(nextMonthStartVn('2026-12-15')).toBe('2027-01-01') })
})

describe('deepExhaustedBlock', () => {
  const b = deepExhaustedBlock({ limit: 15, resetOn: '2026-12-01' })
  it('states the facts the model needs: the allowance is used up, when it comes back, and that this turn runs as Thinking', () => {
    expect(b).toContain('15')
    expect(b).toContain('2026-12-01')
    expect(b).toMatch(/Thinking/)
  })
  it('tells the model to say it once, briefly, in the person\'s language, and still answer fully', () => {
    expect(b).toMatch(/once/i)
    expect(b).toMatch(/language/i)
    expect(b).toMatch(/answer/i)
  })
  it('never names two kinds of report: the person knows only one allowance', () => {
    expect(b).not.toMatch(/standard|advanced/i)
  })
})
