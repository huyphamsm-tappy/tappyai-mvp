import { describe, it, expect } from 'vitest'
import { structuredConflicts, nextRepairAction, reconcileByDate, REPAIR_BOUNDS } from './conflictMetadata'
import type { Finding } from './deepResearch'
import type { ClaimCheck } from './claimVerifier'

const f = (source: number, value: number, over: Partial<NonNullable<Finding['figure']>> = {}): Finding => ({ step: 1, text: 't', source, figure: { series: 'Doanh thu', label: '2024', value, unit: 'tỷ', ...over } })

describe('structuredConflicts', () => {
  it('two sources with different values are a structured record, not prose', () => {
    const r = structuredConflicts([f(1, 100), f(2, 120)])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'SOURCES_DIFFER', series: 'Doanh thu', unit: 'tỷ', low: 100, high: 120, display: 'TWO_SOURCES_DIFFER', values: [{ value: 100, source: 1 }, { value: 120, source: 2 }] })
    expect(r[0].relativeGap).toBeCloseTo(0.1667, 3)
  })
  it('rounding is not a conflict; one source twice is not a conflict; different units or labels are different facts', () => {
    expect(structuredConflicts([f(1, 100), f(2, 101)])).toEqual([])
    expect(structuredConflicts([f(1, 100), f(1, 150)])).toEqual([])
    expect(structuredConflicts([f(1, 100), f(2, 150, { unit: 'triệu' })])).toEqual([])
    expect(structuredConflicts([f(1, 100), f(2, 150, { label: '2023' })])).toEqual([])
  })
  it('three or more sources read DATA_NOT_AGREED; values very far apart read NEEDS_VERIFICATION', () => {
    expect(structuredConflicts([f(1, 100), f(2, 120), f(3, 110)])[0].display).toBe('DATA_NOT_AGREED')
    expect(structuredConflicts([f(1, 10), f(2, 100)])[0].display).toBe('NEEDS_VERIFICATION')
  })
  it('findings without a figure are ignored; the same source and value is listed once', () => {
    expect(structuredConflicts([{ step: 1, text: 'x', source: 1 }])).toEqual([])
    expect(structuredConflicts([f(1, 100), f(1, 100), f(2, 150)])[0].values).toHaveLength(2)
  })
  it('the record carries no sentence text from the report', () => {
    expect(JSON.stringify(structuredConflicts([f(1, 100), f(2, 150)]))).not.toContain('"t"')
  })
})

describe('reconcileByDate', () => {
  const conflicts = structuredConflicts([f(1, 54), f(2, 1304)])
  it('different publication years: likely a different as-of date, and the newest source value is named (not a verdict)', () => {
    const r = reconcileByDate(conflicts, [{ id: 1, published: '2023-03-01' }, { id: 2, published: '2026-08-10' }])
    expect(r[0]).toMatchObject({ likelyReason: 'DIFFERENT_AS_OF_DATE', newestValue: 1304 })
    expect(r[0].asOf).toEqual([{ value: 54, source: 1, year: 2023 }, { value: 1304, source: 2, year: 2026 }])
  })
  it('the same year, or missing dates: the reason stays UNKNOWN and nothing is preferred', () => {
    expect(reconcileByDate(conflicts, [{ id: 1, published: '2026-01-01' }, { id: 2, published: '2026-09-09' }])[0]).toMatchObject({ likelyReason: 'UNKNOWN', newestValue: null })
    expect(reconcileByDate(conflicts, [{ id: 1 }, { id: 2, published: '2026-09-09' }])[0]).toMatchObject({ likelyReason: 'UNKNOWN', newestValue: null })
    expect(reconcileByDate(conflicts, [])[0].asOf.every(a => a.year === null)).toBe(true)
  })
  it('keeps the original record fields', () => {
    expect(reconcileByDate(conflicts, [])[0]).toMatchObject({ kind: 'SOURCES_DIFFER', series: 'Doanh thu', low: 54, high: 1304 })
  })
})

describe('nextRepairAction', () => {
  const flag = (sentence: number, status: ClaimCheck['status'] = 'number_not_in_source'): ClaimCheck => ({ sentence, status, figures: [], cited: [1] })
  it('nothing flagged is done; an unreadable source is not a failure', () => {
    expect(nextRepairAction({ tier: 'STANDARD', round: 0, msLeft: 99_000, flagged: [] })).toEqual({ action: 'done', reason: 'nothing_flagged' })
    expect(nextRepairAction({ tier: 'ADVANCED', round: 0, msLeft: 99_000, flagged: [flag(2, 'source_unreadable')] }).action).toBe('done')
  })
  it('repairs while a round and the time remain, naming the failing sentences', () => {
    expect(nextRepairAction({ tier: 'ADVANCED', round: 0, msLeft: 99_000, flagged: [flag(2), flag(5, 'bad_citation')] })).toEqual({ action: 'repair', claims: [2, 5] })
    expect(nextRepairAction({ tier: 'ADVANCED', round: 1, msLeft: 99_000, flagged: [flag(2)] }).action).toBe('repair')
  })
  it('after the round limit what still fails is dropped (the rewording did not make it true)', () => {
    expect(nextRepairAction({ tier: 'STANDARD', round: REPAIR_BOUNDS.STANDARD.maxRounds, msLeft: 99_000, flagged: [flag(2)] })).toEqual({ action: 'drop', claims: [2], reason: 'round_limit' })
    expect(nextRepairAction({ tier: 'ADVANCED', round: REPAIR_BOUNDS.ADVANCED.maxRounds, msLeft: 99_000, flagged: [flag(2)] }).action).toBe('drop')
  })
  it('without time left it drops instead of starting a repair it cannot finish', () => {
    expect(nextRepairAction({ tier: 'STANDARD', round: 0, msLeft: 1_000, flagged: [flag(2)] })).toEqual({ action: 'drop', claims: [2], reason: 'time_limit' })
  })
  it('Standard gets fewer rounds than Advanced', () => {
    expect(REPAIR_BOUNDS.STANDARD.maxRounds).toBeLessThan(REPAIR_BOUNDS.ADVANCED.maxRounds)
  })
})
