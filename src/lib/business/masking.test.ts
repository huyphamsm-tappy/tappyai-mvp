import { describe, it, expect } from 'vitest'
import { maskAddress, maskName, maskPhone } from './masking'

// Tappy Business — what a leaked tracking link reveals.
//
// The reader of a tracking page is not necessarily the customer: the URL is a
// bearer credential they are told to share, and P0 §24 assumes it leaks. These
// tests are about the gap between "useful enough for the customer to recognise
// their order" and "a place to read a stranger's contact details".

describe('phone', () => {
  it('shows enough to recognise, not enough to dial', () => {
    expect(maskPhone('0901234567')).toBe('09••••567')
  })

  it('normalises the way a customer wrote it before masking', () => {
    // The same number typed three ways must not mask three ways, or a customer
    // comparing two orders would think they went to different numbers.
    for (const written of ['0901234567', '090 123 4567', '+84 901 234 567']) {
      expect(maskPhone(written).endsWith('567'), written).toBe(true)
    }
  })

  it('🔑 uses a FIXED-WIDTH mask, so the number’s length is not leaked', () => {
    // Following maskEmail's rule: repeating the real length narrows a guess.
    const short = maskPhone('12345678')
    const long = maskPhone('123456789012345')
    expect(short.length).toBe(long.length)
    expect(short).toContain('••••')
  })

  it('🔑 reveals nothing for a value too short to mask safely', () => {
    // Showing five characters of a six-digit value would reveal most of it.
    for (const value of ['1234567', '123', '', 'abc']) {
      expect(maskPhone(value), value).toBe('•••')
    }
  })

  it('never contains the middle of the number', () => {
    const masked = maskPhone('0901234567')
    expect(masked).not.toContain('1234')
    expect(masked).not.toContain('0901234567')
  })
})

describe('address', () => {
  it('drops the house number and keeps the street', () => {
    // The locked P0 §24 example, verbatim.
    expect(maskAddress('128 Nguyễn Văn Cừ, Q5')).toBe('••• Nguyễn Văn Cừ, Q5')
  })

  it('🔑 never contains the house number', () => {
    expect(maskAddress('128 Nguyễn Văn Cừ, Q5')).not.toContain('128')
    expect(maskAddress('72/15 Trần Duy Hưng, Cầu Giấy')).not.toContain('72/15')
  })

  it('reveals nothing when there is no first token to drop', () => {
    // One long token has no house number to separate; guessing where to cut is
    // exactly when a naive split leaks the part it meant to hide.
    expect(maskAddress('NguyenVanCu')).toBe('•••')
    expect(maskAddress('abc')).toBe('•••')
    expect(maskAddress('   ')).toBe('•••')
  })

  it('caps a very long address rather than echoing it wholesale', () => {
    const masked = maskAddress(`12 ${'x'.repeat(200)}`)
    expect(masked.length).toBeLessThan(80)
    expect(masked.endsWith('…')).toBe(true)
  })

  it('⚠️ reveals the street — a documented trade, not an oversight', () => {
    // An address a customer cannot verify defeats the purpose of echoing it.
    // A street without a number does not reach anybody's door, but this is not
    // anonymity and the doc says so.
    expect(maskAddress('128 Nguyễn Văn Cừ, Q5')).toContain('Nguyễn Văn Cừ')
  })
})

describe('name', () => {
  it('reduces the last name-part to an initial', () => {
    expect(maskName('Nguyễn Thị Lan')).toBe('Nguyễn Thị L.')
  })

  it('handles a single-word name', () => {
    expect(maskName('Lan')).toBe('L.')
  })

  it('reveals nothing for an empty value', () => {
    expect(maskName('   ')).toBe('•••')
  })

  it('collapses irregular spacing rather than producing empty parts', () => {
    expect(maskName('  Nguyễn   Thị   Lan  ')).toBe('Nguyễn Thị L.')
  })
})
