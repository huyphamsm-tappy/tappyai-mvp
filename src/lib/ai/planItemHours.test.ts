// @vitest-environment node
/**
 * c40 T6 (UAT @ 2bd5c59, 2026-09-28) — "Hội An có gì hay, đi 1 ngày": the plan put "MẸT Hội An"
 * at 08:00 as breakfast while its row says 10:00–22:30. A stop's time must fall inside its row's
 * hours: moved to the opening time when the day stays ascending, otherwise cleared — never invented.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { guardPlanItems, type PlanPlace } from './planItemGuard'

const FIX = JSON.parse(readFileSync('src/lib/ai/__fixtures__/c40T6PlanBeforeOpening.live.json', 'utf8')) as { planBlock: string; rows: PlanPlace[] }
type Plan = { days: Array<{ items: Array<{ time?: string; name: string; description?: string }> }> }
const parse = (text: string): Plan => JSON.parse(text.slice(text.indexOf('[TAPPY_PLAN]') + 12, text.indexOf('[/TAPPY_PLAN]')))
const times = (text: string) => parse(text).days[0].items.map(i => [i.name.slice(0, 12), i.time])

describe('c40 T6 — plan stop times inside the row hours', () => {
  it('clears the 08:00 of a stop that opens at 10:00 when 10:00 would land after the next stop (09:30)', () => {
    const r = guardPlanItems(FIX.planBlock, FIX.rows)
    const items = parse(r.text).days[0].items
    expect(items[0].name).toMatch(/^MẸT Hội An/)
    expect(items[0].time).toBe('')
    expect(r.timesCleared).toBe(1)
    expect(r.timesMoved).toBe(0)
    // Every other stop is inside its hours (Phố cổ "Mở cửa cả ngày", the rest clock ranges) — untouched.
    expect(times(r.text).slice(1)).toEqual(times(FIX.planBlock).slice(1))
    // Nothing else of the item is rewritten.
    expect(items[0].description).toBe(parse(FIX.planBlock).days[0].items[0].description)
  })

  it('moves the stop to the opening time when the day stays ascending', () => {
    const plan = parse(FIX.planBlock)
    plan.days[0].items[1].time = '10:30' // Phố cổ after MẸT's opening
    const text = `[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]`
    const r = guardPlanItems(text, FIX.rows)
    expect(parse(r.text).days[0].items[0].time).toBe('10:00')
    expect(r.timesMoved).toBe(1)
  })

  it('a stop after closing time with no later opening is cleared, not moved backwards out of order', () => {
    const plan = parse(FIX.planBlock)
    plan.days[0].items[6].time = '23:30' // T/T Cocktail Bar: 10:00–23:00
    const r = guardPlanItems(`[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]`, FIX.rows)
    expect(parse(r.text).days[0].items[6].time).toBe('')
  })

  it('a stop whose row states no clock hours is never touched', () => {
    const rows = FIX.rows.map(r => (String(r.name).startsWith('MẸT') ? { ...r, opening_hours: undefined } : r))
    const r = guardPlanItems(FIX.planBlock, rows)
    expect(parse(r.text).days[0].items[0].time).toBe('08:00')
    expect(r.timesCleared + r.timesMoved).toBe(0)
  })
})
