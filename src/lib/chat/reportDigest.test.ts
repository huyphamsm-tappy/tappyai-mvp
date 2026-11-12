import { describe, expect, it } from 'vitest'
import { reportDigest, reportProgress, stripSourceMarks } from '@/lib/chat/reportDigest'

const REPORT = [
  '# Xu hướng trà sữa', '', '*Phạm vi: Hà Nội.*', '',
  '## 1. Tóm tắt', '', '- Giá rẻ bùng lên [1] theo [báo giá](https://example.com/a).', '- Thị trường phân cực [2].', '',
  '## 2. Quy mô', '', 'CHI TIẾT-QUY-MÔ-KHÔNG-ĐƯỢC-LỌT.', '',
  '## 3. Giá', '', '| A | B |', '| - | - |', '| 1 | 2 |', '',
  '## Nguồn tham khảo', '', '1. Giá trà sữa 2026 — vnexpress.net', '2. Báo cáo ngành — cafef.vn', '',
].join('\n')

describe('stripSourceMarks', () => {
  it('keeps link labels, drops addresses and footnote marks', () => {
    expect(stripSourceMarks('Giá [1] xem [báo giá](https://x.test/a) và https://y.test/b nữa')).toBe('Giá xem báo giá và  nữa')
    expect(stripSourceMarks('mảng a[0] giữ')).toBe('mảng a giữ')
  })
})

describe('reportDigest', () => {
  const d = reportDigest(REPORT)
  it('the key points are the first section only, without its heading, links or marks', () => {
    expect(d.bullets).toContain('Giá rẻ bùng lên')
    expect(d.bullets).toContain('báo giá')
    expect(d.bullets).not.toMatch(/example\.com|\[1\]|\[2\]|^#/)
    expect(d.bullets).not.toContain('CHI TIẾT-QUY-MÔ')
    expect(d.bullets).not.toContain('Tóm tắt')
  })
  it('counts the sources and lists the section titles without the sources list', () => {
    expect(d.sources).toBe(2)
    expect(d.titles).toEqual(['1. Tóm tắt', '2. Quy mô', '3. Giá'])
    expect(JSON.stringify(d)).not.toMatch(/vnexpress|cafef/)
  })
  it('the live card\'s link count wins when it is larger', () => {
    expect(reportDigest(REPORT, 9).sources).toBe(9)
  })
  it('a report with no second-level heading yields its body (title stripped); empty text yields nothing', () => {
    expect(reportDigest('# Tiêu đề\n\nMột đoạn ngắn.').bullets).toBe('Một đoạn ngắn.')
    expect(reportDigest('').bullets).toBe('')
  })
  it('long key points are cut at a line end', () => {
    const long = '# T\n\n## A\n\n' + Array.from({ length: 80 }, (_, i) => `- điểm số ${i} khá là dài dòng để vượt trần`).join('\n') + '\n\n## B\n\nx\n'
    const b = reportDigest(long).bullets
    expect(b.length).toBeLessThanOrEqual(1600)
    expect(b.endsWith('trần')).toBe(true)
  })
})

describe('reportProgress', () => {
  it('lists complete section titles and the one being written, never any text', () => {
    const p = reportProgress('# T\n\n## 1. Một\n\nVĂN-BẢN-MỘT\n\n## 2. Hai\n\nđang viết dở')
    expect(p.done).toEqual(['1. Một'])
    expect(p.writing).toBe('2. Hai')
    expect(JSON.stringify(p)).not.toContain('VĂN-BẢN')
  })
  it('nothing yet before the first section', () => {
    expect(reportProgress('# T\n\nmở đầu')).toEqual({ done: [], writing: null })
  })
})
