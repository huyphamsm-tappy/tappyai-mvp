import { describe, it, expect } from 'vitest'
import { splitReport, reportViewOf } from './reportView'

// Owner 11/11: the whole report landed in the chat as the answer (14-19 pages). The chat now shows the key points (the report's own "Tóm tắt" section, already a numbered list of the main findings) and a line
// with the number of sources; the details and the sources list are in the report, one click away, and the saved message still holds the whole report (exports and reloads are unchanged).

const section = (title: string, body: string) => `## ${title}\n${body}\n`
const REPORT = ['# Xu hướng trà sữa\n*Phạm vi: Hà Nội.*\n', section('1. Tóm tắt', '1. Giá rẻ bùng lên [1].\n2. Thị trường phân cực [2].'), section('2. Quy mô', 'Chi tiết quy mô ' + 'x'.repeat(2500)), section('3. Chuỗi lớn', 'Chi tiết chuỗi ' + 'y'.repeat(2500)), section('4. Giá', 'z'.repeat(2500)), section('5. Khuyến nghị', 'k'.repeat(1200)), '## Nguồn tham khảo\n1. A — a.vn\n2. B — b.vn\n3. C — c.vn\n'].join('\n')

describe('splitReport', () => {
  it('head = the title and scope line, summary = the first section, rest = everything from the second section on', () => {
    const s = splitReport(REPORT)
    expect(s.hasRest).toBe(true)
    expect(s.head).toContain('# Xu hướng trà sữa')
    expect(s.head).not.toContain('Tóm tắt')
    expect(s.summary).toContain('1. Tóm tắt')
    expect(s.summary).toContain('Thị trường phân cực')
    expect(s.summary).not.toContain('Quy mô')
    expect(s.rest.startsWith('## 2. Quy mô')).toBe(true)
    expect(s.rest).toContain('Nguồn tham khảo')
  })
  it('nothing is lost: head + summary + rest is the text', () => {
    const s = splitReport(REPORT)
    expect(s.head + s.summary + s.rest).toBe(REPORT)
  })
  it('while the report is still being written (only the first section so far) there is no rest to hide', () => {
    const partial = '# T\n\n## 1. Tóm tắt\n1. Một ý đang viết'
    const s = splitReport(partial)
    expect(s.hasRest).toBe(false)
    expect(s.summary).toContain('Một ý đang viết')
  })
  it('text with no level-2 heading is not split; a level-3 heading is not a section boundary', () => {
    expect(splitReport('chỉ một đoạn').hasRest).toBe(false)
    expect(splitReport('# T\n## 1. Tóm tắt\nÝ\n### Mục con\nCon\n').hasRest).toBe(false)
  })
})

describe('reportViewOf', () => {
  const on = (o: Partial<Parameters<typeof reportViewOf>[0]> = {}) => reportViewOf({ text: REPORT, research: true, expanded: false, links: 0, enabled: true, ...o })
  it('collapsed: the chat shows the title, the key points and nothing of the details or the sources list; the bar says how many sources', () => {
    const v = on()
    expect(v.collapsed).toBe(true)
    expect(v.shown).toContain('Giá rẻ bùng lên')
    expect(v.shown).not.toContain('Chi tiết quy mô')
    expect(v.shown).not.toContain('Nguồn tham khảo')
    expect(v.bar).toEqual({ sources: 3, expanded: false })
  })
  it('expanded: the whole report, and the bar offers to fold it', () => {
    const v = on({ expanded: true })
    expect(v.collapsed).toBe(false)
    expect(v.shown).toBe(REPORT)
    expect(v.bar).toEqual({ sources: 3, expanded: true })
  })
  it('the source count is the larger of the live links and the lines of the list in the text', () => {
    expect(on({ links: 12 }).bar!.sources).toBe(12)
  })
  it('a reloaded report (no live research card) is recognised by its text; a short answer is left alone', () => {
    expect(on({ research: false }).collapsed).toBe(true)
    const short = on({ text: 'Trả lời ngắn.', research: false })
    expect(short.collapsed).toBe(false)
    expect(short.bar).toBeNull()
    expect(short.shown).toBe('Trả lời ngắn.')
  })
  it('flag off: exactly the text as before, no bar', () => {
    const v = on({ enabled: false })
    expect(v.shown).toBe(REPORT)
    expect(v.collapsed).toBe(false)
    expect(v.bar).toBeNull()
  })
  it('while the research is live and only the summary has been written, the summary shows and there is no bar yet', () => {
    const v = on({ text: '# T\n\n## 1. Tóm tắt\n1. Ý đang viết' })
    expect(v.shown).toContain('Ý đang viết')
    expect(v.collapsed).toBe(false)
    expect(v.bar).toBeNull()
  })
})
