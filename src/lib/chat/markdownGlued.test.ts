import { describe, it, expect } from 'vitest'
import { repairGluedTables, splitGluedBullets, normalizeReplyMarkdown } from './markdownNormalize'

// UAT 18/11 (cases 34, 41, 48): items of a list and rows of a table written with no line break between them.
describe('rows of a table glued on one line (case 41)', () => {
  const head = '| Khía cạnh | Nhật Bản | Hàn Quốc |\n|---|---|---|\n| **Ra quyết định** | a | b |\n'
  const glued = '| **Giao tiếp** | c | d | **Làm việc nhóm** | e | f | **Giờ làm** | g | h |'
  it('is split back into one row per line', () => {
    const out = repairGluedTables(head + glued).split('\n')
    expect(out).toHaveLength(6)
    expect(out[3]).toBe('| **Giao tiếp** | c | d |')
    expect(out[4]).toBe('| **Làm việc nhóm** | e | f |')
    expect(out[5]).toBe('| **Giờ làm** | g | h |')
  })
  it('a normal row, a row with a missing cell and a table with one row are untouched', () => {
    const ok = head + '| **x** | y | z |'
    expect(repairGluedTables(ok)).toBe(ok)
    const odd = head + '| **x** | y | z | w |' // 4 cells in 3 columns: not a whole number of rows, never guessed
    expect(repairGluedTables(odd)).toBe(odd)
    expect(repairGluedTables('| a | b | c | d |')).toBe('| a | b | c | d |') // no header and separator: nothing to count against
  })
  it('a code fence is left alone, and the renderer sees the rows through normalizeReplyMarkdown', () => {
    const fenced = '```\n' + head + glued + '\n```'
    expect(repairGluedTables(fenced)).toBe(fenced)
    expect(normalizeReplyMarkdown(head + glued).split('\n')).toHaveLength(6)
  })
})

describe('items of a list glued on one line (cases 34, 48)', () => {
  it('"- **A** ... - **B** ..." becomes one bullet per item', () => {
    const t = '- **Bánh bèo** — Petites bouchées. - **Cà phê sữa đá** — Café vietnamien glacé.'
    expect(splitGluedBullets(t)).toBe('- **Bánh bèo** — Petites bouchées.\n- **Cà phê sữa đá** — Café vietnamien glacé.')
  })
  it('the French answer of case 48, as it was stored, comes out with one item per line', () => {
    const stored = '- **Bún bò Huế** — Soupe de nouilles de Huế au bouillon parfumé à la citronnelle. Plus relevée et corsée que le phở. - **Cao lầu** — Plat associé à Hội An : nouilles épaisses. - **Mì Quảng** — Nouilles du Quảng Nam, souvent jaunes. - **Bánh xèo** — Crêpe fine et croustillante.'
    const lines = normalizeReplyMarkdown(stored).split('\n')
    expect(lines).toHaveLength(4)
    expect(lines.every(l => l.startsWith('- **'))).toBe(true)
  })
  it('keeps the indent, splits more than two, and leaves an ordinary dash, a single item and a fenced line alone', () => {
    expect(splitGluedBullets('  - **A:** x - **B:** y - **C:** z')).toBe('  - **A:** x\n  - **B:** y\n  - **C:** z')
    expect(splitGluedBullets('- giá 5 - 7 triệu, **tốt**')).toBe('- giá 5 - 7 triệu, **tốt**')
    expect(splitGluedBullets('- **A:** one item')).toBe('- **A:** one item')
    const fenced = '```\n- **A** x - **B** y\n```'
    expect(splitGluedBullets(fenced)).toBe(fenced)
    expect(splitGluedBullets('a plain sentence - **bold** is not a list line')).toBe('a plain sentence - **bold** is not a list line')
  })
})
