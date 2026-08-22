import { describe, it, expect } from 'vitest'
import { reconcileWindow, cohortWindow } from './rollupWindow'

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

describe('cohortWindow — Module 04 retention', () => {
  it('🔑 reaches 30 days FURTHER BACK than the activity window', () => {
    // A cohort from 30 days before the activity window's first day reaches its
    // D30 milestone inside that window, so its row changes and it must be
    // recomputed. Stopping at the activity window would recompute only the
    // newest cohorts — precisely the rows whose D7 and D30 are still
    // unmeasurable and therefore never change.
    expect(cohortWindow('2026-07-13', 4)).toEqual({ from: '2026-06-10', to: '2026-07-13' })
  })

  it('the span is exactly the reconcile window plus the D30 reach', () => {
    // 4 reconciled days + 30 days of reach = 34 days inclusive. Asserted as a
    // computed span, so shortening either constant fails here rather than
    // silently narrowing what gets reconciled.
    const { from, to } = cohortWindow('2026-07-13', 4)
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
    expect(days).toBe(33) // 34 days inclusive of both ends
  })

  it('ends on TODAY, not yesterday — a cohort that registered today still gets a row', () => {
    // It carries no measurable rate yet. An absent row and an empty one are
    // different facts, and the dashboard has to be able to tell them apart.
    expect(cohortWindow('2026-07-13', 4).to).toBe('2026-07-13')
  })

  it('crosses a year boundary correctly', () => {
    expect(cohortWindow('2026-01-15', 4)).toEqual({ from: '2025-12-13', to: '2026-01-15' })
  })

  it('a single-day reconcile window still reaches back 30 days', () => {
    expect(cohortWindow('2026-07-13', 1)).toEqual({ from: '2026-06-13', to: '2026-07-13' })
  })
})
