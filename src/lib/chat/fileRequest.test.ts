import { describe, it, expect } from 'vitest'
import { wantsFileExport, showsExportBar } from './fileRequest'

describe('wantsFileExport', () => {
  it.each([
    'Viết cho mình một báo cáo ngắn về chi phí đi Đà Lạt, rồi xuất ra file để mình tải về.',
    'làm báo cáo này và cho mình tải về file PDF nhé',
    'xuất file word giúp mình',
    'Lưu thành file docx',
    'cho mình file pdf của bảng này',
    'Please export this as a PDF file',
    'write a short report and let me download it as a file',
    'xuat ra file pdf',
  ])('is true for: %s', q => { expect(wantsFileExport(q)).toBe(true) })

  it.each([
    'Viết cho mình một báo cáo ngắn về chi phí đi Đà Lạt',
    'Tôi đang mở một file excel, hàm VLOOKUP dùng thế nào?',
    'file PDF này có an toàn không',
    'Tải app Tappy ở đâu',
    'explain how a file system works',
    '',
  ])('is false for: %s', q => { expect(wantsFileExport(q)).toBe(false) })
})

describe('showsExportBar', () => {
  const ANSWER = 'x'.repeat(500)
  it('shows under a real answer when the person asked for a file', () => {
    expect(showsExportBar({ answer: ANSWER, previousUserText: 'xuất ra file pdf cho mình', streaming: false })).toBe(true)
  })
  it('does not show for a short answer (a refusal, a question back), while streaming, or when no file was asked for and the answer is not a long report', () => {
    expect(showsExportBar({ answer: 'ok', previousUserText: 'xuất ra file pdf', streaming: false })).toBe(false)
    expect(showsExportBar({ answer: ANSWER, previousUserText: 'xuất ra file pdf', streaming: true })).toBe(false)
    expect(showsExportBar({ answer: ANSWER, previousUserText: 'chào bạn', streaming: false })).toBe(false)
  })
  it('keeps the old rule: a long report with several sections shows it with no request', () => {
    const REPORT = Array.from({ length: 5 }, (_, i) => `## Phần ${i}\n${'nội dung '.repeat(400)}`).join('\n')
    expect(showsExportBar({ answer: REPORT, previousUserText: 'viết báo cáo', streaming: false })).toBe(true)
  })
})
