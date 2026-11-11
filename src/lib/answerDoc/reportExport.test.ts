// 31/10: a finished deep research report as files (Markdown, a printable page for PDF, Word) - built on the client from what is on screen.
import { describe, it, expect } from 'vitest'
import { reportFileName, reportMarkdown, reportHtml, withChartTables } from './reportExport'
import { chartSvg } from './reportChart'
import { inlineRuns, tableRows, reportDocx } from './reportDocx'

const REPORT = '# Xe điện 2026\n- Tóm tắt [1]\n## Doanh số\n1. BYD dẫn đầu [1].\n2. Tesla thứ hai.\n\n| Hãng | Xe |\n|---|---|\n| BYD | 2,26 tr |\n\n### Nguồn\n1. BYD sales — byd.com\n2. Không có link — x.example\n'
const LINKS = [{ id: 1, title: 'BYD [sales]', url: 'https://byd.com/a' }, { id: 2, title: 'bad', url: 'javascript:alert(1)' }]
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

describe('reportMarkdown', () => {
  it('links the sources list (the last section) to the card\'s https sources of the same number; the rest is the text as written', () => {
    const md = reportMarkdown(REPORT, LINKS)
    expect(md).toContain('1. [BYD sales](https://byd.com/a)')
    expect(md).toContain('2. Không có link — x.example') // no https link: stays text
    expect(md).not.toContain('javascript:')
    expect(md).toContain('- Tóm tắt [1]') // a numbered citation in the body is never a link
    expect(md).toContain('\n1. BYD dẫn đầu [1].\n') // nor a numbered list of the body: only the last section's lines are sources
    expect(md.startsWith('# Xe điện 2026')).toBe(true)
  })
})

describe('reportFileName', () => {
  it('keeps letters (any script), digits, spaces and dashes', () => {
    expect(reportFileName('Xe điện: 2026/../x?', 'md')).toBe('Xe điện 2026 x.md')
    expect(reportFileName('***', 'docx')).toBe('report.docx')
    expect(reportFileName('a'.repeat(100), 'md')).toBe(`${'a'.repeat(60)}.md`)
  })
})

describe('reportHtml', () => {
  it('a printable page: each section picture under its heading, sources linked, attributes escaped, no script', () => {
    const html = reportHtml(REPORT, { title: 'Xe "điện"', images: [{ title: 'Doanh số', src: 'https://i.example/a.jpg?x="1"' }, { title: 'Không có mục', src: 'https://i.example/b.jpg' }, { title: 'Xe điện 2026', src: 'http://i.example/c.jpg' }], links: LINKS, format: esc, lang: 'vi' })
    expect(html).toMatch(/<h2>Doanh số<\/h2><figure><img src="https:\/\/i\.example\/a\.jpg\?x=&quot;1&quot;"/)
    expect(html).not.toContain('b.jpg') // a picture whose section is not in the report is not shown
    expect(html).not.toContain('c.jpg') // not https
    expect(html).toContain('<title>Xe &quot;điện&quot;</title>')
    expect(html).toContain('[BYD sales](https://byd.com/a)') // the formatter given decides how a link renders; here it is escaped text
    expect(html).not.toMatch(/<script/i)
  })
})

// Measured 11/11 (real exports of a reloaded report): the cover said "0 nguồn" because the export bar has no live link list, though the sources list is in the text.
describe('the cover of layout A counts the sources', () => {
  const cover = (text: string, links: Parameters<typeof reportHtml>[1]['links'], lang = 'vi') => /<header class="cover">.*?<\/header>/.exec(reportHtml(text, { title: 'T', images: [], links, format: esc, lang, design: 'a' }))?.[0] ?? ''
  it('with no link list it counts the numbered lines of the sources section in the text', () => {
    expect(cover(REPORT, [])).toContain('2 nguồn')
    expect(cover(REPORT, [], 'en')).toContain('2 sources')
  })
  it('with a link list longer than the lines it uses the list; the larger of the two', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: `t${i}`, url: `https://a${i}.example/` }))
    expect(cover(REPORT, five)).toContain('5 nguồn')
  })
  it('a report with no sources list and no links shows no source count at all (never "0 nguồn")', () => {
    const c = cover('# Báo cáo\n\n## Mục\nNội dung.\n', [])
    expect(c).not.toContain('nguồn')
    expect(c).toContain('Cập nhật')
  })
  it('only the lines after the last heading count: a numbered list in the body is not a source', () => {
    expect(cover('# T\n## Mục\n1. một\n2. hai\n3. ba\n### Nguồn\n1. a — x\n', [])).toContain('1 nguồn')
  })
})

describe('section charts in the files', () => {
  const chart = { section: 'Doanh số', title: 'Bán <script>x</script>', unit: 'triệu xe', kind: 'bar' as const, points: [{ label: 'BYD & co', value: 2.26, source: 1 }, { label: 'Tesla', value: 1.64, source: 2 }, { label: 'Geely', value: 1.2, source: 3 }] }
  it('the SVG escapes every text and shows the values in the reader\'s locale with their sources', () => {
    const svg = chartSvg(chart, 'vi')
    expect(svg).not.toContain('<script')
    expect(svg).toContain('Bán &lt;script&gt;x&lt;/script&gt;')
    expect(svg).toContain('BYD &amp; co')
    expect(svg).toContain('2,26 [1]')
    expect(svg).toContain('Nguồn [1][2][3]')
    expect(chartSvg({ ...chart, kind: 'line', points: [{ label: '2023', value: 14, source: 1 }, { label: '2024', value: 17, source: 1 }] }, 'en')).toContain('<polyline')
  })
  it('Markdown / Word: the figures as a table under the section heading; the PDF draws the chart instead of the picture', () => {
    const md = withChartTables('# T\n## 2. Doanh số\nx\n## 3. Khác\ny', [chart], 'vi')
    expect(md).toContain('## 2. Doanh số\n\n| Mục | Giá trị |\n|---|---|\n| BYD & co | 2,26 triệu xe [1] |')
    expect(md.indexOf('Biểu đồ: Bán')).toBeLessThan(md.indexOf('## 3. Khác'))
    const html = reportHtml('# T\n## 2. Doanh số\nx', { title: 'T', images: [{ title: 'Doanh số', src: 'https://i.example/a.jpg' }], links: [], format: esc, lang: 'vi', charts: [chart] })
    expect(html).toContain('<figure class="chart"><svg')
    expect(html).not.toContain('a.jpg')
  })
})

describe('Word (.docx)', () => {
  it('inline runs: bold, italic, code, https links only', () => {
    expect(inlineRuns('a **b** *c* `d` [e](https://x.example/) [f](javascript:y)')).toEqual([
      { text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italics: true }, { text: ' ' }, { text: 'd', code: true }, { text: ' ' },
      { text: 'e', link: 'https://x.example/' }, { text: ' ' }, { text: 'f' },
    ])
  })
  it('table rows without the separator; a block that is not a table is null', () => {
    expect(tableRows('| A | B |\n|---|---|\n| 1 | 2 |')).toEqual([['A', 'B'], ['1', '2']])
    expect(tableRows('```\ncode\n```')).toBeNull()
  })
  it('builds a real .docx (a zip) from the report', async () => {
    const blob = await reportDocx(REPORT, LINKS, 'Xe điện 2026')
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2)
    expect(String.fromCharCode(...head)).toBe('PK')
    expect(blob.size).toBeGreaterThan(3000)
  })
})
