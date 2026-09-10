import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectFoodConstraints, osmFilterFor, rowSatisfies, unmetConstraintNote } from './foodConstraints'

// ── BUG 2 — "nhà hàng buffet ở Hà Nội" must not become "restaurants in Hanoi" ─

describe('the constraint is detected', () => {
  it('buffet, in Vietnamese word order', () => {
    expect(detectFoodConstraints('Tìm nhà hàng buffet ở Hà Nội').map(c => c.kind)).toEqual(['buffet'])
  })
  it('buffet, in English', () => {
    expect(detectFoodConstraints('find a buffet restaurant in Hanoi').map(c => c.kind)).toEqual(['buffet'])
  })
  it('chay / vegetarian', () => {
    expect(detectFoodConstraints('quán chay ngon').map(c => c.kind)).toEqual(['vegetarian'])
    expect(detectFoodConstraints('vegetarian restaurant').map(c => c.kind)).toEqual(['vegetarian'])
  })
  it('vegan is distinct from vegetarian', () => {
    expect(detectFoodConstraints('nhà hàng thuần chay').map(c => c.kind)).toContain('vegan')
  })
  it('cafe', () => {
    expect(detectFoodConstraints('quán cà phê view đẹp').map(c => c.kind)).toEqual(['cafe'])
  })
  it('hải sản and lẩu, with and without diacritics', () => {
    expect(detectFoodConstraints('quán hải sản').map(c => c.kind)).toEqual(['seafood'])
    expect(detectFoodConstraints('quan lau ngon').map(c => c.kind)).toEqual(['hotpot'])
  })
  it('a plain request carries no constraint', () => {
    expect(detectFoodConstraints('quán ăn ngon ở Quận 1')).toEqual([])
  })
  it('two constraints are both kept', () => {
    const kinds = detectFoodConstraints('buffet chay ở Hà Nội').map(c => c.kind)
    expect(kinds).toContain('buffet')
    expect(kinds).toContain('vegetarian')
  })
})

describe('the constraint reaches the provider as a real OSM filter', () => {
  it('buffet becomes a cuisine tag filter', () => {
    expect(osmFilterFor(detectFoodConstraints('nhà hàng buffet'))).toBe('["cuisine"~"buffet",i]')
  })
  it('chay becomes a diet tag filter', () => {
    expect(osmFilterFor(detectFoodConstraints('quán chay'))).toBe('["diet:vegetarian"~"yes|only",i]')
  })
  it('cafe contributes no tag filter — amenity=cafe is already stronger', () => {
    // 🔑 Not a dropped constraint: the existing keyword ladder turns this into
    // `amenity=cafe`, which is a harder filter than any cuisine tag would be.
    expect(osmFilterFor(detectFoodConstraints('quán cà phê'))).toBe('')
    expect(detectFoodConstraints('quán cà phê')).toHaveLength(1)
  })
  it('only tags that actually exist in OSM are emitted', () => {
    for (const q of ['buffet', 'chay', 'vegan', 'hải sản', 'lẩu']) {
      const f = osmFilterFor(detectFoodConstraints(q))
      if (f) expect(f).toMatch(/^\[("cuisine"|"diet:vegetarian"|"diet:vegan")~/)
    }
  })
})

describe('the query the retrieval layer actually builds', () => {
  // Source-level, because the Overpass call itself is network work. What must
  // hold is that the constraint is IN the query string that gets sent.
  const SRC = readFileSync(resolve(process.cwd(), 'src/lib/ai/tools/food.ts'), 'utf8')

  it('the selector is built with the constraint filter appended', () => {
    expect(SRC).toContain('const constraintFilter = osmFilterFor(foodConstraints)')
    expect(SRC).toContain('const oql = buildOql(constraintFilter)')
  })

  it('an unmet constraint falls back to the unconstrained set rather than an empty one', () => {
    expect(SRC).toContain('constraintUnmet = true')
    expect(SRC).toContain("buildOql('')")
  })

  it('the constraint travels on the result envelope', () => {
    expect(SRC).toContain('requested_constraints')
    expect(SRC).toContain('constraint_unmet')
    expect(SRC).toContain('constraint_note')
  })
})

describe('rowSatisfies reports evidence, and does not confuse silence with failure', () => {
  const buffet = detectFoodConstraints('buffet')[0]
  const chay = detectFoodConstraints('chay')[0]

  it('a cuisine tag saying buffet satisfies it', () => {
    expect(rowSatisfies({ name: 'X', cuisine: 'buffet;asian' }, buffet)).toBe(true)
  })
  it('a name saying buffet satisfies it', () => {
    expect(rowSatisfies({ name: 'Sen Tây Hồ Buffet' }, buffet)).toBe(true)
  })
  it('a cuisine tag saying something else fails it', () => {
    expect(rowSatisfies({ name: 'X', cuisine: 'pizza' }, buffet)).toBe(false)
  })
  it('NO cuisine tag is UNKNOWN, not failure — OSM tagging is sparse', () => {
    expect(rowSatisfies({ name: 'Cây Si' }, buffet)).toBeNull()
  })
  it('a Vietnamese name containing "Chay" is real vegetarian evidence', () => {
    expect(rowSatisfies({ name: 'Nhà Hàng Chay Phương Nam' }, chay)).toBe(true)
  })
  it('the diet tag satisfies vegetarian', () => {
    expect(rowSatisfies({ name: 'X', vegetarian: true }, chay)).toBe(true)
  })
})

describe('an unmet constraint produces an instruction to be honest', () => {
  const note = unmetConstraintNote(detectFoodConstraints('nhà hàng buffet'), 'vi')
  it('names the constraint', () => expect(note).toContain('buffet'))
  it('tells the model the venues are NOT confirmed', () => {
    expect(note).toMatch(/CHƯA được xác nhận/)
  })
  it('has an English form', () => {
    expect(unmetConstraintNote(detectFoodConstraints('buffet'), 'en')).toMatch(/not confirmed/i)
  })
})
