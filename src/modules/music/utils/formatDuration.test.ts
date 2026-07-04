import { describe, it, expect } from 'vitest'
import { formatDuration } from './formatDuration'

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00')
  })

  it('pads seconds under 10', () => {
    expect(formatDuration(5)).toBe('0:05')
  })

  it('formats over a minute', () => {
    expect(formatDuration(65)).toBe('1:05')
  })

  it('formats an exact multiple of a minute', () => {
    expect(formatDuration(600)).toBe('10:00')
  })

  it('does not wrap minutes at 60 (no hour formatting)', () => {
    expect(formatDuration(3661)).toBe('61:01')
  })

  it('clamps negative input to zero', () => {
    expect(formatDuration(-5)).toBe('0:00')
  })

  it('floors fractional seconds', () => {
    expect(formatDuration(12.9)).toBe('0:12')
  })
})
