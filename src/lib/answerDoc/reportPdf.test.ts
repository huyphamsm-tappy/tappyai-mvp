// 15/11: the PDF file that downloads on one click. The definition is tested as data; one real PDF is written with pdfmake and read back with the repo's own PDF text reader, so the Vietnamese letters,
// the table, the list and the link are proved to be in the FILE, not only in the definition. Set REPORT_PDF_SAMPLE=<folder> to also keep the file for a look.
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportPdf, reportPdfDefinition, pdfRuns } from './reportPdf'
import { reportFileName } from './reportExport'
import { pdfToText } from '@/lib/ai/retrievalV5/pdfText'
import { pdfCoverOf } from '@/components/chat/reportPdfCover'

const REPORT = `# Thị trường chip toàn cầu: Nvidia dẫn đầu, TSMC thống trị gia công

*Phạm vi: toàn cầu, số liệu đến tháng 11/2026.*

## 1. Tóm tắt

Doanh số quý 3/2026 đạt **517,7 tỷ USD**, tăng 24,1% so với quý 2 [1]. Đây là *quý thứ ba liên tiếp* tăng trên 20%. Xem [SIA](https://www.semiconductors.org/x).

- Nvidia dẫn đầu về doanh thu chip
- TSMC chiếm 72% gia công
  - Samsung Foundry 5,9%
  - SMIC 5,4%

1. Bước một: đọc nguồn
2. Bước hai: so sánh

## 2. Bảng số liệu

| Hãng | Thị phần (%) | Doanh thu (tỷ USD) |
|---|---|---|
| TSMC | 72,5 | 40,2 |
| Samsung Foundry | 5,9 | 3,26 |

> Ghi chú: số liệu là ước tính theo giả định, không phải dự báo chắc chắn.

---

### Nguồn
1. Doanh số bán dẫn quý 3 — semiconductors.org
`

describe('pdfRuns', () => {
  it('bold, italic, code and https links; a link that is not https keeps only its label', () => {
    expect(pdfRuns('a **b** *c* `d` [e](https://x.org/p) [f](javascript:void)')).toEqual([
      { text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italics: true }, { text: ' ' }, { text: 'd', background: '#F1F1F1', fontSize: 9.5 }, { text: ' ' },
      { text: 'e', link: 'https://x.org/p', color: '#1155CC', decoration: 'underline' }, { text: ' ' }, { text: 'f' },
    ])
  })
})

describe('reportPdfDefinition', () => {
  const def = reportPdfDefinition(REPORT, [], 'Chip') as { content: Array<Record<string, unknown>>; pageSize: string; info: { title: string }; pageBreakBefore: (n: { headlineLevel?: number }, f: unknown[]) => boolean; footer: (p: number, n: number) => { columns: Array<{ text: string }> } }
  it('A4, the title in the file\'s own properties, the brand and "page / pages" in the footer of every page', () => {
    expect(def.pageSize).toBe('A4')
    expect(def.info.title).toBe('Chip')
    expect(def.footer(2, 5).columns.map(c => c.text)).toEqual(['TappyAI', '2 / 5'])
  })
  it('the report\'s "# " line is the title, "##" sections are h1, "###" h2; each heading may not end a page', () => {
    const heads = def.content.filter(n => n.headlineLevel)
    expect(heads.map(h => h.style)).toEqual(['title', 'h1', 'h1', 'h2'])
    expect(def.pageBreakBefore({ headlineLevel: 1 }, [])).toBe(true)
    expect(def.pageBreakBefore({ headlineLevel: 1 }, [{}])).toBe(false)
    expect(def.pageBreakBefore({}, [])).toBe(false)
  })
  it('a list keeps its nesting, an ordered list its numbers, a table its header row and equal columns, a quote and a rule are there', () => {
    const ul = def.content.find(n => n.ul) as { ul: Array<{ stack?: unknown[] }> }
    expect(ul.ul).toHaveLength(2)
    expect(ul.ul[1].stack).toHaveLength(2) // the item's text and its nested list
    expect(def.content.find(n => n.ol)).toMatchObject({ start: 1 })
    const table = def.content.find(n => n.table) as { table: { headerRows: number; widths: string[]; body: unknown[][] } }
    expect(table.table.headerRows).toBe(1)
    expect(table.table.widths).toEqual(['*', '*', '*'])
    expect(table.table.body).toHaveLength(3)
    expect(def.content.some(n => n.style === 'quote')).toBe(true)
    expect(def.content.some(n => n.canvas)).toBe(true)
  })
})

describe('the cover (owner 15/11: the screen\'s cover layout in the file)', () => {
  const cover = { eyebrow: 'Báo cáo nghiên cứu · TappyAI · Báo cáo nâng cao', title: 'Thị trường chip toàn cầu', facts: ['Cập nhật 15/11/2026', '34 nguồn'] }
  const def = reportPdfDefinition(REPORT, [], 'Chip', cover) as { content: Array<Record<string, unknown>> }
  it('the cover is the first thing on the page, in the brand colour, with the eyebrow in capitals, the title and the facts on one line', () => {
    const t = def.content[0] as { table: { body: Array<Array<{ fillColor: string; stack: Array<{ text: string; style: string }> }>> } }
    const cell = t.table.body[0][0]
    expect(cell.fillColor).toBe('#1A3D7C')
    expect(cell.stack.map(s => s.style)).toEqual(['coverEyebrow', 'coverTitle', 'coverFacts'])
    expect(cell.stack[0].text).toBe('BÁO CÁO NGHIÊN CỨU · TAPPYAI · BÁO CÁO NÂNG CAO')
    expect(cell.stack[1].text).toBe('Thị trường chip toàn cầu')
    expect(cell.stack[2].text).toContain('Cập nhật 15/11/2026')
    expect(cell.stack[2].text).toContain('34 nguồn')
  })
  it('the report\'s own "# " title is not printed a second time; the rest of the report follows', () => {
    expect(def.content.filter(n => n.style === 'title')).toHaveLength(0)
    expect(def.content.filter(n => n.headlineLevel).map(h => h.style)).toEqual(['h1', 'h1', 'h2'])
  })
  it('with no cover the file is as before (title heading, no cover table first)', () => {
    const plain = reportPdfDefinition(REPORT, [], 'Chip') as { content: Array<Record<string, unknown>> }
    expect(plain.content[0].style).toBe('title')
  })
  it('no sources known: the facts say only the day', () => {
    const c = pdfCoverOf((k: string, v?: Record<string, string>) => (k === 'report.updated' ? `Cập nhật ${v?.date}` : k === 'report.sources' ? `${v?.n} nguồn` : k === 'report.eyebrow' ? 'Báo cáo' : k), 'vi', 'T', undefined, 0)
    expect(c.facts).toHaveLength(1)
    const d = pdfCoverOf((k: string, v?: Record<string, string>) => (k === 'report.sources' ? `${v?.n} nguồn` : k.startsWith('report.tier') ? 'Nâng cao' : k === 'report.eyebrow' ? 'Báo cáo' : `x ${v?.date ?? ''}`), 'vi', 'T', 'advanced', 12)
    expect(d.eyebrow).toBe('Báo cáo · Nâng cao')
    expect(d.facts[1]).toBe('12 nguồn')
  })
})

describe('reportPdf: a real file', () => {
  it('is a PDF whose text holds the Vietnamese letters, the numbers, the table, the list and the sources', async () => {
    const blob = await reportPdf(REPORT, [], 'Chip', { eyebrow: 'Báo cáo nghiên cứu · TappyAI', title: 'Thị trường chip toàn cầu: Nvidia dẫn đầu, TSMC thống trị gia công', facts: ['Cập nhật 15/11/2026', '34 nguồn'], updated: 'Cập nhật 15/11/2026', sources: 34 })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(20_000) // the Roboto font is embedded
    if (process.env.REPORT_PDF_SAMPLE) { mkdirSync(process.env.REPORT_PDF_SAMPLE, { recursive: true }); writeFileSync(join(process.env.REPORT_PDF_SAMPLE, 'sample-report.pdf'), bytes) }
    const text = (await pdfToText(bytes, { chars: 20_000 })) ?? ''
    const flat = text.replace(/\s+/g, ' ')
    expect(flat).toContain('BÁO CÁO NGHIÊN CỨU')
    expect(flat).toContain('Thị trường chip toàn cầu')
    expect(flat).toContain('Cập nhật 15/11/2026')
    expect(flat).toContain('34 NGUỒN') // the designed page's pill (the plain layout says "34 nguồn")
    expect(flat).toContain('Nvidia dẫn đầu')
    expect(flat).toContain('517,7 tỷ USD')
    expect(flat).toMatch(/TSMC.*72,5.*40,2/)
    expect(flat).toContain('Bước hai: so sánh')
    expect(flat).toContain('semiconductors.org')
    expect(flat).toContain('1 / ')
  }, 60_000)
})

describe('the file name', () => {
  it('a .pdf name from the title: letters, digits, spaces and dashes only', () => {
    expect(reportFileName('Thị trường chip: Nvidia & TSMC?', 'pdf')).toBe('Thị trường chip Nvidia TSMC.pdf')
  })
})
