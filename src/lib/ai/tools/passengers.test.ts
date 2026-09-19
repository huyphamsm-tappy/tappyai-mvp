import { describe, it, expect } from 'vitest'
import { clampPassengers, MAX_PASSENGERS_PER_BOOKING } from './passengers'

// The schema's `.max(9)` used to be enforced by the SDK before execute() — a party of ten ended
// the turn. The cap is now applied here, always with a message, never silently.
describe('clampPassengers', () => {
  it('passes a normal count through with no note', () => {
    expect(clampPassengers(2, 'vi')).toEqual({ passengers: 2, note: null })
    expect(clampPassengers(9, 'vi')).toEqual({ passengers: 9, note: null })
    expect(clampPassengers(undefined, 'vi')).toEqual({ passengers: undefined, note: null })
  })
  it('clamps a party above the per-booking cap and says so (vi + en)', () => {
    const vi = clampPassengers(10, 'vi')
    expect(vi.passengers).toBe(MAX_PASSENGERS_PER_BOOKING)
    expect(vi.note).toMatch(/nhom 10 nguoi can tach ve hoac dat ve doan/)
    expect(clampPassengers(12, 'en').note).toMatch(/12 people need split bookings/)
  })
  it('never crashes on odd input, and never clamps without a note', () => {
    expect(clampPassengers(0, 'vi')).toMatchObject({ passengers: 1 })
    expect(clampPassengers(0, 'vi').note).toBeTruthy()
    expect(clampPassengers(2.6, 'vi')).toMatchObject({ passengers: 3 })
    expect(clampPassengers(2.6, 'vi').note).toMatch(/lam tron/)
    expect(clampPassengers('3 người', 'vi')).toEqual({ passengers: 3, note: null })
    expect(clampPassengers('nhiều', 'vi')).toMatchObject({ passengers: undefined })
    expect(clampPassengers('nhiều', 'vi').note).toMatch(/Khong hieu/)
  })
})
