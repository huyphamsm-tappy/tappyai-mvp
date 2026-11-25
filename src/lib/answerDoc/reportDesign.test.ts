// 15/11: what the designed PDF reads out of ANY report's markdown (key figures, the highlight, the bar card, the notes). The rules are fixed and carry no topic: the same functions are run on a chip
// report, an electric-vehicle report and a gold report below, and on small hand-made ones for each edge.
import { describe, it, expect } from 'vitest'
import { designModel, keyFigures, barsFrom, plainText, clip } from './reportDesign'
import { parseDoc } from './parse'

const md = (s: string) => parseDoc(s)

describe('plainText and clip', () => {
  it('markdown, citation marks and the space before punctuation are gone', () => {
    expect(plainText('Doanh số **517,7 tỷ USD** [1][2], tăng [SIA](https://x.org) .')).toBe('Doanh số 517,7 tỷ USD, tăng SIA.')
  })
  it('clip cuts at a word and says so; short text is untouched', () => {
    expect(clip('một hai ba bốn năm sáu bảy', 14)).toBe('một hai ba…')
    expect(clip('ngắn', 14)).toBe('ngắn')
  })
})

describe('keyFigures: the number is copied from the report\'s own sentence', () => {
  it('a quantity with a scale word and unit: value, unit, label before it, note after it ("tỷ" ends a word although JavaScript\'s \\b does not know it)', () => {
    const k = keyFigures(md('Doanh số quý 3/2026 đạt 517,7 tỷ USD, tăng 146,8% so với cùng kỳ [1]. WSTS dự báo cả năm 2026 đạt 1.655 tỷ USD [2].'))
    expect(k).toHaveLength(2)
    expect(k[0]).toMatchObject({ value: '517,7', unit: 'TỶ USD', label: 'Doanh số quý 3/2026' })
    expect(k[0].note).toContain('tăng 146,8%')
    expect(k[1]).toMatchObject({ value: '1.655', unit: 'TỶ USD' })
  })
  it('quantities come before percentages, at most three, none repeated, in the order of the text', () => {
    const k = keyFigures(md('Thị trường tăng 12% so với năm trước. Doanh thu đạt 40,2 tỷ USD trong quý. Lợi nhuận đạt 3,5 triệu USD cho cả năm. Số người dùng đạt 8 triệu người. Doanh thu lặp lại 40,2 tỷ USD.'))
    expect(k.map(x => x.value)).toEqual(['40,2', '3,5', '8'])
  })
  it('a price written with its currency and no scale word is a figure, but one end of a range is not', () => {
    expect(keyFigures(md('Giá vàng hiện ở khoảng 3.885 USD/oz theo Kitco. Tăng trưởng thị trường đạt 25%.')).map(x => x.value)).toEqual(['3.885', '25%'])
    expect(keyFigures(md('Dự báo trải rất rộng, từ 4.250 USD đến 6.300 USD cho năm 2027.'))).toEqual([])
  })
  it('a percentage keeps its sign from the words before it ("tăng" / "giảm") and its comparison after it', () => {
    const k = keyFigures(md('Doanh số tăng 24,1% so với quý 2 trong kỳ này. Chi phí giảm 8% so với cùng kỳ năm trước.'))
    expect(k[0]).toMatchObject({ value: '+24,1%', unit: 'SO VỚI QUÝ 2' })
    expect(k[1]).toMatchObject({ value: '−8%' })
  })
  it('nothing numeric, nothing invented', () => {
    expect(keyFigures(md('Thị trường đang chuyển dịch mạnh sang các nền tảng mới và người dùng thay đổi thói quen.'))).toEqual([])
  })
})

describe('barsFrom: the first share table', () => {
  const T = '| Hãng | Doanh thu | Thị phần (%) |\n|---|---|---|\n| Nvidia | 125,7 | 15,8 |\n| Samsung | 72,5 | 9,1 |\n| SK hynix | 60,6 | 7,6 |\n'
  it('a table with a share column over 3 to 8 rows becomes bars with the report\'s own numbers', () => {
    const b = barsFrom(md(T))!
    expect(b.title).toBe('Thị phần')
    expect(b.unit).toBe('%')
    expect(b.rows.map(r => [r.label, r.value, r.text])).toEqual([['Nvidia', 15.8, '15,8'], ['Samsung', 9.1, '9,1'], ['SK hynix', 7.6, '7,6']])
  })
  it('no share column, too few rows, or a value above 100 draws no bars', () => {
    expect(barsFrom(md('| Năm | Giá trị |\n|---|---|\n| 2027 | 1721,70 |\n| 2028 | 1791,08 |\n| 2029 | 1863,26 |\n'))).toBeNull()
    expect(barsFrom(md('| Hãng | Thị phần (%) |\n|---|---|\n| A | 10 |\n| B | 20 |\n'))).toBeNull()
    expect(barsFrom(md('| Hãng | Thị phần (%) |\n|---|---|\n| A | 10 |\n| B | 20 |\n| C | 250 |\n'))).toBeNull()
  })
})

const REPORT = `# Nvidia dẫn đầu doanh thu chip, TSMC thống trị gia công

*Phạm vi: thị trường bán dẫn toàn cầu, giai đoạn 2025–2029.*

## 1. Tóm tắt

Doanh số quý 3/2026 đạt 517,7 tỷ USD, tăng 146,8% so với cùng kỳ [1]. WSTS dự báo cả năm 2026 đạt 1.655 tỷ USD [2].

- Nvidia dẫn đầu doanh thu chip.
- TSMC thống trị gia công.

Kết luận: tăng trưởng bị bộ nhớ và hạ tầng AI kéo, rủi ro nằm ở kiểm soát xuất khẩu và nguồn cung.

## 2. Gia công chip

${'| Hãng | Thị phần (%) | Doanh thu |\n|---|---|---|\n| TSMC | 72,5 | 40,2 |\n| Samsung | 5,9 | 3,26 |\n| SMIC | 5,4 | 3 |\n'}

### Chi tiết

Nội dung chi tiết [3].

## 3. Điều còn nghi ngờ

- Phần lớn số liệu chỉ có một nguồn.
- Các dự báo cũ lệch xa dự báo mới.
- Mục thứ ba không vào hộp lưu ý.

### Nguồn

1. SIA — semiconductors.org
2. WSTS — wsts.org
3. Gartner — gartner.com
`

describe('designModel', () => {
  const m = designModel(REPORT, [])
  it('the title, the scope without its label, the sections without their numbers, the sources apart', () => {
    expect(m.title).toBe('Nvidia dẫn đầu doanh thu chip, TSMC thống trị gia công')
    expect(m.scope).toBe('Thị trường bán dẫn toàn cầu, giai đoạn 2025–2029.')
    expect(m.sections.map(s => [s.index, s.title])).toEqual([[1, 'Tóm tắt'], [2, 'Gia công chip'], [3, 'Điều còn nghi ngờ']])
    expect(m.sources).toHaveLength(1)
    expect(m.sections.every(s => !s.blocks.some(b => b.t === 'heading' && /nguồn/i.test(b.text)))).toBe(true)
  })
  it('key figures from the summary, the closing paragraph as the highlight, the share table as bars, the first two doubts as the note', () => {
    expect(m.kpis.map(k => k.value)).toEqual(['517,7', '1.655'])
    expect(m.highlight).toMatch(/^Kết luận: tăng trưởng bị bộ nhớ/)
    expect(m.bars?.rows.map(r => r.label)).toEqual(['TSMC', 'Samsung', 'SMIC'])
    expect(m.caveats).toEqual(['Phần lớn số liệu chỉ có một nguồn.', 'Các dự báo cũ lệch xa dự báo mới.'])
  })
  it('fewer than two key figures means no key-figure band', () => {
    expect(designModel('# T\n\n## Tóm tắt\n\nDoanh thu đạt 40,2 tỷ USD trong quý này của công ty.\n\n## B\n\nNội dung.', []).kpis).toEqual([])
  })
  it('a report with no "##" sections has no sections to design', () => {
    expect(designModel('# Tiêu đề\n\nChỉ một đoạn văn không có mục nào cả.', []).sections.length).toBeLessThanOrEqual(1)
  })
})
