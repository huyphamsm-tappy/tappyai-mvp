import { describe, it, expect } from 'vitest'
import { clipField } from './fields'

describe('clipField: what a person types into a group', () => {
  it('trims, squeezes spaces, removes control characters and clips to the length', () => {
    expect(clipField('  Minh   Anh  ', 60)).toBe('Minh Anh')
    expect(clipField('a\u0000b\u0007c\nd', 60)).toBe('a b c d')
    expect(clipField('x'.repeat(500), 80)).toHaveLength(80)
  })
  it('anything that is not a string is empty (so a required field fails)', () => {
    for (const v of [undefined, null, 42, {}, ['a']]) expect(clipField(v, 10)).toBe('')
  })
})
