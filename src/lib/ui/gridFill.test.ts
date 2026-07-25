// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { trailingFillerCount } from './gridFill'

describe('trailingFillerCount', () => {
  it('fills a partial last row in a 3-col grid (the reported 5-post case → 1 filler)', () => {
    expect(trailingFillerCount(5, 3)).toBe(1) // 5 posts → row of [tile,tile,FILLER]
    expect(trailingFillerCount(4, 3)).toBe(2)
    expect(trailingFillerCount(1, 3)).toBe(2)
  })

  it('adds no filler when the last row is already full', () => {
    expect(trailingFillerCount(3, 3)).toBe(0)
    expect(trailingFillerCount(6, 3)).toBe(0)
    expect(trailingFillerCount(9, 3)).toBe(0)
  })

  it('handles the 2-col grid (search results) and empty/degenerate inputs', () => {
    expect(trailingFillerCount(3, 2)).toBe(1)
    expect(trailingFillerCount(4, 2)).toBe(0)
    expect(trailingFillerCount(0, 3)).toBe(0)
    expect(trailingFillerCount(5, 0)).toBe(0)
  })
})
