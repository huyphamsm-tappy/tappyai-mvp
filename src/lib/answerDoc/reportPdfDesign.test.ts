// 15/11: the designed PDF page. The definition is tested as data (hero, decorations, key-figure cards only when there are figures, the highlight beside the bars only when there are bars, the notes in one
// piece, numbered section chips, two columns of sources); one real file is written with pdfmake and read back, so the Tappy logo path, the Vietnamese letters and the design's text are proved in the FILE.
import { describe, it, expect, vi } from 'vitest'
import { reportPdfDesigned } from './reportPdfDesign'
import { reportPdf } from './reportPdf'
import { pdfToText } from '@/lib/ai/retrievalV5/pdfText'
import { pdfCoverOf } from '@/components/chat/reportPdfCover'

const T = (k: string, v?: Record<string, string>) => ({
  'report.eyebrow': 'Báo cáo nghiên cứu · TappyAI', 'report.tier.advanced': 'Báo cáo nâng cao', 'report.tier.standard': 'Báo cáo tiêu chuẩn',
  'report.updated': `Cập nhật ${v?.date}`, 'report.sources': `${v?.n} nguồn`, 'report.design.scope': 'Phạm vi', 'report.design.caveats': 'Lưu ý dữ liệu', 'report.design.sources': 'Nguồn', 'report.design.footer': 'Cập nhật',
} as Record<string, string>)[k] ?? k

const REPORT = `# Nvidia dẫn đầu doanh thu chip, TSMC thống trị gia công

*Phạm vi: thị trường bán dẫn toàn cầu, giai đoạn 2025–2029.*

## 1. Tóm tắt

Doanh số quý 3/2026 đạt 517,7 tỷ USD, tăng 146,8% so với cùng kỳ [1]. WSTS dự báo cả năm 2026 đạt 1.655 tỷ USD [2].

- Nvidia dẫn đầu doanh thu chip.
- TSMC thống trị gia công.

Kết luận: tăng trưởng bị bộ nhớ và hạ tầng AI kéo.

## 2. Gia công chip

| Hãng | Thị phần (%) | Doanh thu |
|---|---|---|
| TSMC | 72,5 | 40,2 |
| Samsung | 5,9 | 3,26 |
| SMIC | 5,4 | 3 |

## 3. Điều còn nghi ngờ

- Phần lớn số liệu chỉ có một nguồn.
- Các dự báo cũ lệch xa dự báo mới.

### Nguồn

1. SIA — semiconductors.org
2. WSTS — wsts.org
3. Gartner — gartner.com
4. Deloitte — deloitte.com
5. McKinsey — mckinsey.com
6. IDC — idc.com
7. TrendForce — trendforce.com
`

// the cover's date is "today": the clock is held at the day the footer assertion below names, so the test does not depend on the day it runs
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date(2026, 10, 15, 12))
const cover = pdfCoverOf(T, 'vi', 'Báo cáo thị trường chip toàn cầu', 'advanced', 34)
vi.useRealTimers()
type Node = Record<string, unknown>
const def = reportPdfDesigned(REPORT, [], { cover, now: new Date(2026, 10, 15) }) as { content: Node[]; pageMargins: number[]; footer: (p: number, n: number) => { columns: Array<{ text: string }> }; pageBreakBefore: (n: { headlineLevel?: number }, f: unknown[]) => boolean; background: (p: number, s: { width: number; height: number }) => { canvas: Array<{ color: string }> } }
const flat = (n: unknown): string => JSON.stringify(n)

describe('reportPdfDesigned: the designed page as data', () => {
  it('the page has a light ground, margins of 36, and a footer with the update date and "01 / 07" on every page', () => {
    expect(def.pageMargins).toEqual([36, 36, 36, 56])
    expect(def.background(1, { width: 595, height: 842 }).canvas[0].color).toBe('#F6F8FD')
    const f = def.footer(1, 7).columns.map(c => c.text)
    expect(f[0]).toBe('CẬP NHẬT 15/11/2026  ·  TAPPYAI RESEARCH')
    expect(f[1]).toBe('01 / 07')
  })
  it('the hero comes first, full-bleed and dark, with the brand, the two pills (kind and sources), the title and the tri-colour rule', () => {
    const hero = flat(def.content[0])
    expect(hero).toContain('"fillColor":"#0A1A33"')
    expect(hero).toContain('TAPPYAI')
    expect(hero).toContain('RESEARCH  /  INTELLIGENCE')
    expect(hero).toContain('BÁO CÁO NÂNG CAO')
    expect(hero).toContain('34 NGUỒN')
    expect(hero).toContain('Nvidia dẫn đầu doanh thu chip, TSMC thống trị gia công')
    expect(hero).toContain('#F5A800') // amber, coral and blue in the rule
    expect(hero).toContain('#F0786A')
    expect(def.content[0].margin).toEqual([-36, -36, -36, 18])
  })
  it('without a logo the hero shows a blue tile with a "T"; with one it shows the picture on a white tile', () => {
    expect(flat(def.content[0])).toContain('"text":"T"')
    const withLogo = reportPdfDesigned(REPORT, [], { cover, logo: 'data:image/jpeg;base64,/9j/AA==' }) as { content: Node[] }
    expect(flat(withLogo.content[0])).toContain('"image":"data:image/jpeg;base64,/9j/AA=="')
    expect(flat(withLogo.content[0])).not.toContain('"text":"T"')
  })
  it('the circles on the right and the "research note" line are drawn after the band, in absolute positions, with the month', () => {
    const abs = def.content.filter(n => n.absolutePosition)
    expect(abs).toHaveLength(2)
    expect(flat(abs[0])).toContain('"type":"ellipse"')
    expect(flat(abs[1])).toContain('RESEARCH NOTE   2026.11')
  })
  it('the section chips are numbered 01, 02, 03 in rotating colours, and a section header may not end a page', () => {
    const chips = def.content.filter(n => n.headlineLevel).map(flat)
    expect(chips.map(c => /"text":"(0\d)"/.exec(c)?.[1])).toEqual(['01', '02', '03', undefined]) // the last one is the sources label
    expect(chips[0]).toContain('"color":"#2F6BFF"')
    expect(chips[1]).toContain('"color":"#F5A800"')
    expect(chips[2]).toContain('"color":"#F0786A"')
    expect(def.pageBreakBefore({ headlineLevel: 1 }, [])).toBe(true)
  })
  it('after the summary: the key-figure cards, the highlight beside the bar card, then the two notes in one piece', () => {
    const idx = (s: string) => def.content.findIndex(n => flat(n).includes(s))
    const kpi = idx('517,7'), high = idx('ĐIỂM CHÍNH'), notes = idx('LƯU Ý DỮ LIỆU'), sec2 = idx('GIA CÔNG CHIP')
    expect(kpi).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(kpi)
    expect(notes).toBeGreaterThan(high)
    expect(sec2).toBeGreaterThan(notes)
    const n = def.content[notes] as { table: { dontBreakRows: boolean; widths: unknown[] } }
    expect(n.table.dontBreakRows).toBe(true)
    expect(n.table.widths).toEqual(['*', 12, '*'])
    expect(flat(def.content[high])).toContain('THỊ PHẦN') // the bar card: the share column's name
    expect(flat(def.content[high])).toContain('Kết luận: tăng trưởng bị bộ nhớ và hạ tầng AI kéo.')
  })
  it('the share table is a card-like table whose share column is coloured row by row; the sources are in two columns', () => {
    const table = def.content.find(n => n.table && flat(n).includes('"HÃNG"')) as { table: { body: Array<Array<{ text: unknown; color?: string }>> } }
    expect(table.table.body[1][1].color).toBe('#2F6BFF')
    expect(table.table.body[2][1].color).toBe('#F5A800')
    const src = def.content[def.content.length - 1] as { columns: unknown[] }
    expect(src.columns).toHaveLength(2)
  })
  it('nothing to design: no key-figure cards without figures, no bar card without a share table, a lone highlight is a full-width card, and no sections returns null', () => {
    const plain = reportPdfDesigned('# T\n\n## Tóm tắt\n\nThị trường đang chuyển dịch mạnh sang các nền tảng mới và người dùng thay đổi thói quen mua sắm của mình.\n\n## B\n\nNội dung.', [], { cover }) as { content: Node[] }
    const text = JSON.stringify(plain.content)
    expect(text).not.toContain('"text":"517,7"')
    expect(text).toContain('ĐIỂM CHÍNH')
    expect(reportPdfDesigned('Chỉ có một đoạn không có mục.', [], { cover })).toBeNull()
  })
})

describe('the real file', () => {
  it('is a PDF with the hero, the cards, the section chips, the table, the notes and the footer in its text; the logo goes in as a JPEG', async () => {
    // a 2 x 2 white JPEG: pdfmake takes a JPEG as it is (a PNG would be decoded by a Web Worker)
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
    const blob = await reportPdf(REPORT, [], 'Chip', cover, jpeg)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-')
    const text = ((await pdfToText(bytes, { chars: 30_000 })) ?? '').replace(/\s+/g, ' ')
    for (const s of ['TAPPYAI', 'BÁO CÁO NÂNG CAO', '34 NGUỒN', 'Nvidia dẫn đầu doanh thu chip', '517,7', 'TỶ USD', 'ĐIỂM CHÍNH', 'THỊ PHẦN', 'LƯU Ý DỮ LIỆU', 'GIA CÔNG CHIP', 'RESEARCH NOTE', 'CẬP NHẬT']) expect(text).toContain(s)
  }, 60_000)
})
