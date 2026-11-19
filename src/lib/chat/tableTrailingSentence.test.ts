// Final UAT 19/11 (hotel, three runs): the model wrote the sentence and the links right after the last table row on the same line; it became a third cell and the table showed "231." and merged rows.
import { describe, it, expect } from 'vitest'
import { repairGluedTables, repairGluedMarkdown } from './markdownNormalize'

const head = '| Hotel | Price |\n|---|---:|\n| **A** | 215.063d |\n| **B** | 231.481d |\n'

describe('a sentence glued to the last table row', () => {
  it('is split off as a paragraph and the row keeps its own cells', () => {
    const t = `${head}| **C** | 259.259d | Price checked at **21:54**, taxes not included. [See A](https://x.test/a) · [See B](https://x.test/b)`
    const r = repairGluedTables(t)
    expect(r).toBe(`${head}| **C** | 259.259d |\n\nPrice checked at **21:54**, taxes not included. [See A](https://x.test/a) · [See B](https://x.test/b)`)
  })
  it('a pipe inside the glued sentence stays in the sentence', () => {
    const r = repairGluedTables(`${head}| **C** | 259.259d | note a | note b`)
    expect(r.split('\n').slice(-1)[0]).toBe('note a | note b')
  })
  it('a row that already ends with a pipe, a row with fewer cells, and a table with no separator are untouched', () => {
    expect(repairGluedTables(`${head}| **C** | 259.259d |`)).toBe(`${head}| **C** | 259.259d |`)
    expect(repairGluedTables(`${head}| **C** | 259.259d`)).toBe(`${head}| **C** | 259.259d`)
    expect(repairGluedTables('| a | b | c')).toBe('| a | b | c')
  })
  it('runs inside repairGluedMarkdown and is idempotent', () => {
    const once = repairGluedMarkdown(`${head}| **C** | 1 | tail`)
    expect(repairGluedMarkdown(once)).toBe(once)
  })
})
