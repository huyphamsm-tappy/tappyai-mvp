import { describe, it, expect } from 'vitest'
import { tableProblems } from './tableIntegrity'

const HEAD = '| Thương hiệu | Mức giá | Ghi chú |\n|---|---|---|\n'

describe('tableProblems', () => {
  it('a clean table has none', () => {
    expect(tableProblems(`${HEAD}| Mixue | 25.000–35.000 đồng [40] | Giá thương hiệu |\n| Ding Tea | 35.000–55.000 đồng [51] | Theo menu |\n`)).toEqual([])
  })
  it('the owner broken row: a price cell cut after "55." and a missing column', () => {
    const p = tableProblems(`${HEAD}| Mixue | 25.000 đồng | x |\n| Ding Tea | 35.000–55.\n| Gong Cha | 40.000 đồng | y |\n`)
    expect(p).toEqual([{ line: 4, kind: 'cell_count' }, { line: 4, kind: 'truncated_number' }])
  })
  it('a truncated number in a cell with the right column count is still found; a citation after it is ignored', () => {
    expect(tableProblems(`${HEAD}| Ding Tea | 35.000–55. | Gong Cha |\n`)).toEqual([{ line: 3, kind: 'truncated_number' }])
    expect(tableProblems(`${HEAD}| Ding Tea | 55. [51] | ok |\n`)).toEqual([{ line: 3, kind: 'truncated_number' }])
  })
  it('a number that ends a sentence outside a table, or a decimal inside a cell, is not a problem', () => {
    expect(tableProblems('Giá là 55.000 đồng. Hết.')).toEqual([])
    expect(tableProblems(`${HEAD}| A | 4,5 sao | tốt |\n`)).toEqual([])
  })
  it('reads several tables and ignores text between them; empty input is fine', () => {
    const two = `${HEAD}| A | 1 | x |\n\nVăn bản.\n\n${HEAD}| B | 2.\n`
    expect(tableProblems(two).map(p => p.line)).toEqual([9, 9])
    expect(tableProblems('')).toEqual([])
    expect(tableProblems(null as unknown as string)).toEqual([])
  })
})
