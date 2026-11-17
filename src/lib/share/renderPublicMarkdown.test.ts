import { describe, it, expect } from 'vitest'
import { renderPublicMarkdown } from './renderPublicMarkdown'

// UAT 17/11, the public page of a shared report: "# title" printed with its hash, "[1][2]" printed in brackets, tables printed as rows of pipes.
describe('renderPublicMarkdown: what a shared report needs', () => {
  it('a "# title" line is a heading, not text with a hash', () => {
    const h = renderPublicMarkdown('# Thị trường trà sữa\n\nNội dung.')
    expect(h).toContain('<h1')
    expect(h).toContain('Thị trường trà sữa</h1>')
    expect(h).not.toContain('# Thị')
  })
  it('citation marks become raised numbers, side by side too; a four-digit year and a markdown link are left alone', () => {
    const h = renderPublicMarkdown('GMV 617 triệu USD [3]. Hai nguồn [7][8]. Năm [2023]. Xem [trang](https://example.com/a).')
    expect(h).toContain('<sup class="text-gray-400 text-[0.7em]">3</sup>')
    expect(h).toContain('>7</sup><sup')
    expect(h).toContain('>8</sup>')
    expect(h).toContain('[2023]')
    expect(h).toContain('<a href="https://example.com/a"')
  })
  it('a "[12]" inside a link address stays part of the address (the href is never cut)', () => {
    const h = renderPublicMarkdown('Xem https://example.com/a/[12]/b và [trang](https://example.com/p[3]).')
    expect(h).not.toMatch(/href="[^"]*<sup/)
    expect(h).toContain('href="https://example.com/a/[12]/b"')
    expect(h).toContain('href="https://example.com/p[3]"')
  })
  it('a markdown table becomes a table; a line of pipes with no separator row stays text', () => {
    const t = renderPublicMarkdown('| Năm | Giá trị |\n|---|---|\n| 2025 | 81,68 |\n| 2026 | 90,10 |\n\nHết.')
    expect(t).toContain('<table')
    expect(t).toContain('<th class="text-left font-semibold p-2 border-b border-gray-300 dark:border-gray-600">Năm</th>')
    expect(t).toContain('>81,68</td>')
    expect(t.match(/<tr>/g)).toHaveLength(3)
    expect(renderPublicMarkdown('| a | b |\nkhông phải bảng')).not.toContain('<table')
  })
  it('nothing in the payload becomes markup: tags in a cell, a heading or a mark are escaped', () => {
    const h = renderPublicMarkdown('# <script>alert(1)</script>\n\n| <img src=x onerror=1> | b |\n|---|---|\n| <b>x</b> | [1] |')
    expect(h).not.toContain('<script')
    expect(h).not.toContain('<img')
    expect(h).not.toContain('<b>x')
    expect(h).toContain('&lt;script&gt;')
  })
})
