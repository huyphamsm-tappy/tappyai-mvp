import { describe, it, expect } from 'vitest'
import { validateSelection } from './validateSelection'

describe('validateSelection', () => {
  it('accepts a valid selection', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: 0.5 })).toBe(true)
  })

  it('rejects an empty trackId', () => {
    expect(validateSelection({ trackId: '', startSec: 0, volume: 0.5 })).toBe(false)
  })

  it('rejects a whitespace-only trackId', () => {
    expect(validateSelection({ trackId: '   ', startSec: 0, volume: 0.5 })).toBe(false)
  })

  it('rejects a negative startSec', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: -1, volume: 0.5 })).toBe(false)
  })

  it('rejects a non-finite startSec', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: Infinity, volume: 0.5 })).toBe(false)
    expect(validateSelection({ trackId: 'track-1', startSec: NaN, volume: 0.5 })).toBe(false)
  })

  it('accepts startSec of exactly zero (boundary)', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: 0.5 })).toBe(true)
  })

  it('rejects volume below zero', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: -0.1 })).toBe(false)
  })

  it('rejects volume above one', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: 1.1 })).toBe(false)
  })

  it('accepts volume boundaries of exactly 0 and 1', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: 0 })).toBe(true)
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: 1 })).toBe(true)
  })

  it('rejects a non-finite volume', () => {
    expect(validateSelection({ trackId: 'track-1', startSec: 0, volume: NaN })).toBe(false)
  })
})
