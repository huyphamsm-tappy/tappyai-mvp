import { describe, it, expect } from 'vitest'
import { hasMarkdownStructure } from './answerStructure'

describe('Wave 3-FIX R3-03 · hasMarkdownStructure', () => {
  it('a table (header row, dash rule, data row) is structure; so are two headings', () => {
    expect(hasMarkdownStructure('| Quán | Giá |\n|---|---|\n| A | 1 |')).toBe(true)
    expect(hasMarkdownStructure('Tóm lại:\n\n| Quán | Giá |\n| :--- | ---: |\n| A | 1 |\n\nHết.')).toBe(true)
    expect(hasMarkdownStructure('## Giá\nx\n\n## Giờ\ny')).toBe(true)
    expect(hasMarkdownStructure('# A\nx\n### B\ny')).toBe(true)
  })
  it('a short pick, one heading, a lone table row, a rule without data, plain prose and a bulleted list are not', () => {
    for (const t of [
      '**Mình chọn: Cà phê Mây** — gần bạn.', '## Chỉ một tiêu đề\nnội dung', '| a | b |', '| a | b |\n|---|---|', '- một\n- hai\n- ba', 'Dòng 1.\nDòng 2.\nDòng 3.', '', '#không phải tiêu đề\n#cũng không',
      'a | b\n--- | ---\nc | d', // no leading pipe: not a pipe-delimited row by this test
    ]) expect(hasMarkdownStructure(t), JSON.stringify(t)).toBe(false)
  })
  it('never throws on odd input', () => {
    for (const t of [undefined, null, 5, {}] as unknown[]) expect(hasMarkdownStructure(t as string)).toBe(false)
    expect(hasMarkdownStructure('|'.repeat(5000))).toBe(false)
    const t0 = Date.now()
    expect(hasMarkdownStructure('|x|\n|---|\n'.repeat(1000))).toBe(true) // (a header, a rule, a data row: a table) - and fast
    expect(hasMarkdownStructure('# h\n'.repeat(1).repeat(1000).slice(0, 4))).toBe(false)
    expect(Date.now() - t0).toBeLessThan(500)
  })
})
