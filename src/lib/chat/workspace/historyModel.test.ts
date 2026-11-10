import { describe, it, expect } from 'vitest'
import {
  normalizeVietnamese, matchesQuery, messageText, conversationMatches, timeGroupOf, groupByTime,
  buildTranscriptMarkdown, exportFileName, type HistoryConversation,
} from './historyModel'

// A fixed "now": Tuesday 10 Nov 2026, 14:00 local time.
const NOW = new Date(2026, 10, 10, 14, 0, 0)
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString()

describe('Vietnamese search', () => {
  it('normalises diacritics and đ', () => {
    expect(normalizeVietnamese('Đà Lạt 3N2Đ')).toBe('da lat 3n2d')
    expect(normalizeVietnamese('  Liên Khương ')).toBe('lien khuong')
    expect(normalizeVietnamese(null)).toBe('')
  })
  it('finds with or without marks, in both directions', () => {
    expect(matchesQuery('Lịch trình Đà Lạt', 'da lat')).toBe(true)
    expect(matchesQuery('Lich trinh Da Lat', 'Đà Lạt')).toBe(true)
    expect(matchesQuery('Lịch trình Đà Lạt', 'phu quoc')).toBe(false)
    expect(matchesQuery('anything', '   ')).toBe(true)
    expect(matchesQuery(null, 'x')).toBe(false)
  })
  it('searches the title and every message', () => {
    const conv: HistoryConversation = {
      id: 'a', title: 'Chuyến đi', updated_at: at(2026, 11, 10),
      messages: [{ role: 'user', content: 'Sân bay Liên Khương cách thành phố bao xa?' }, { role: 'assistant', content: 'Khoảng 30 km.' }],
    }
    expect(conversationMatches(conv, 'lien khuong')).toBe(true)
    expect(conversationMatches(conv, 'chuyen di')).toBe(true)
    expect(conversationMatches(conv, 'hoi an')).toBe(false)
  })
  it('reads string and parts content, and ignores anything else', () => {
    expect(messageText('xin chào')).toBe('xin chào')
    expect(messageText([{ type: 'text', text: 'a' }, { type: 'image' }, 'b'])).toBe('a\nb')
    expect(messageText({ nope: 1 })).toBe('')
    expect(messageText(undefined)).toBe('')
  })
})

describe('time groups', () => {
  it('today = same local calendar day, even just after midnight', () => {
    expect(timeGroupOf(new Date(2026, 10, 10, 0, 1).toISOString(), NOW)).toBe('today')
    expect(timeGroupOf(new Date(2026, 10, 9, 23, 59).toISOString(), NOW)).toBe('sevenDays')
  })
  it('seven days boundary and older, unreadable dates are older', () => {
    expect(timeGroupOf(new Date(2026, 10, 3, 0, 0).toISOString(), NOW)).toBe('sevenDays')
    expect(timeGroupOf(new Date(2026, 10, 2, 23, 59).toISOString(), NOW)).toBe('older')
    expect(timeGroupOf('not a date', NOW)).toBe('older')
  })
  it('groups newest first, drops empty groups, keeps the order today → seven days → older', () => {
    const list = [
      { id: 'old', updated_at: at(2026, 9, 1) },
      { id: 't1', updated_at: at(2026, 11, 10, 9) },
      { id: 't2', updated_at: at(2026, 11, 10, 13) },
      { id: 'w', updated_at: at(2026, 11, 6) },
    ]
    const groups = groupByTime(list, NOW)
    expect(groups.map(g => g.key)).toEqual(['today', 'sevenDays', 'older'])
    expect(groups[0].items.map(i => i.id)).toEqual(['t2', 't1'])
    expect(groupByTime([{ id: 'x', updated_at: at(2026, 11, 10) }], NOW).map(g => g.key)).toEqual(['today'])
    expect(groupByTime([], NOW)).toEqual([])
  })
})

describe('export', () => {
  const labels = { you: 'Bạn', tappy: 'Tappy', exportedFrom: 'Xuất từ TappyAI', messageCount: (n: number) => `${n} tin nhắn`, untitled: 'Cuộc trò chuyện' }
  it('builds a Markdown transcript and skips empty messages', () => {
    const md = buildTranscriptMarkdown({
      id: 'a', title: 'Lịch trình Đà Lạt', updated_at: at(2026, 11, 10),
      messages: [{ role: 'user', content: 'Đi Đà Lạt 3 ngày' }, { role: 'assistant', content: '' }, { role: 'assistant', content: '**Ngày 1:** hồ Tuyền Lâm' }],
    }, labels, NOW)
    expect(md).toContain('# Lịch trình Đà Lạt')
    expect(md).toContain('> Xuất từ TappyAI • 10/11/2026 14:00 • 2 tin nhắn')
    expect(md).toContain('### Bạn\n\nĐi Đà Lạt 3 ngày')
    expect(md).toContain('### Tappy\n\n**Ngày 1:** hồ Tuyền Lâm')
    expect((md.match(/### /g) ?? []).length).toBe(2)
  })
  it('falls back to the untitled label', () => {
    expect(buildTranscriptMarkdown({ id: 'a', title: '  ', updated_at: at(2026, 11, 10), messages: [] }, labels, NOW)).toContain('# Cuộc trò chuyện')
  })
  it('names the file safely', () => {
    expect(exportFileName('Lịch trình Đà Lạt 3N2Đ!', NOW)).toBe('TappyAI_LichTrinhDaLat3n2d_20261110.md')
    expect(exportFileName('???', NOW)).toBe('TappyAI_CuocTroChuyen_20261110.md')
    expect(exportFileName('a'.repeat(100), NOW).length).toBe('TappyAI__20261110.md'.length + 40)
    expect(exportFileName('../../etc/passwd', NOW)).toBe('TappyAI_EtcPasswd_20261110.md')
  })
})
