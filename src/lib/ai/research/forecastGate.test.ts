// 20/11 (three judges): a scenario model of a number of workers with a "price and mix" driver of 0%, and a model of a credit stock for a question about house prices, were "a model of the wrong thing".
import { describe, it, expect } from 'vitest'
import { groundForecast, isMonetaryUnit } from './forecastModel'
import { numberInText } from './deepResearch'

const rate = (b: number) => ({ low: b - 1, base: b, high: b + 1, basis: 'assumption' as const, note: 'n' })
const spec = (over: Record<string, unknown>) => ({
  unit: 'nghìn tỷ đồng', baseYear: 2026, base: { value: 100, source: 1, scope: 'toàn quốc' }, years: [2027, 2028], volume: rate(5), price: rate(2), ...over,
}) as never
const findings = [{ step: 1, source: 1, text: 'Quy mô thị trường năm 2026 khoảng 100 nghìn tỷ đồng', figure: { series: 'Quy mô', label: '2026', value: 100, unit: 'nghìn tỷ đồng', subject: 'x', scope: 'toàn quốc', period: '2026' } }] as never

describe('isMonetaryUnit', () => {
  it('money units are monetary, counts and shares are not', () => {
    for (const u of ['nghìn tỷ đồng', 'tỷ USD', 'triệu đồng', 'VND', 'USD', 'doanh thu']) expect(isMonetaryUnit(u), u).toBe(true)
    for (const u of ['triệu người', 'triệu xe', '%', 'nghìn xe', 'điểm', '']) expect(isMonetaryUnit(u), u).toBe(false)
  })
})

describe('groundForecast gate', () => {
  it('a unit that is not money runs no model (no price in a count of people)', () => {
    expect(groundForecast(spec({ unit: 'triệu người', base: { value: 11.5, source: 1, scope: 'x' } }), findings, numberInText)).toEqual({ ok: false, reason: 'not_a_value_metric' })
  })
  it('a base level that measures only a related quantity runs no model', () => {
    expect(groundForecast(spec({ measuresSubject: false }), findings, numberInText)).toEqual({ ok: false, reason: 'not_the_subject' })
  })
  it('a money base level that measures the subject, or one that was not asked about, goes on to the usual checks', () => {
    expect((groundForecast(spec({ measuresSubject: true }), findings, numberInText) as { reason?: string }).reason).not.toBe('not_the_subject')
    expect((groundForecast(spec({}), findings, numberInText) as { reason?: string }).reason).not.toBe('not_a_value_metric')
  })
})
