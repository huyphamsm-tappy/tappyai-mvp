import { describe, it, expect } from 'vitest'
import { reconcileWindow } from './rollupWindow'

describe('reconcileWindow', () => {
  it('covers the last N VN days inclusive of today', () => {
    expect(reconcileWindow('2026-07-13', 4)).toEqual({ from: '2026-07-10', to: '2026-07-13' })
  })

  it('returns a single day for days=1', () => {
    expect(reconcileWindow('2026-07-13', 1)).toEqual({ from: '2026-07-13', to: '2026-07-13' })
  })

  it('crosses month boundaries correctly', () => {
    expect(reconcileWindow('2026-07-02', 4)).toEqual({ from: '2026-06-29', to: '2026-07-02' })
  })

  it('clamps days below 1 to a single day', () => {
    expect(reconcileWindow('2026-07-13', 0)).toEqual({ from: '2026-07-13', to: '2026-07-13' })
  })
})
