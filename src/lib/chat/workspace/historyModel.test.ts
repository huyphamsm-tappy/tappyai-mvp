import { describe, it, expect } from 'vitest'
import {
  normalizeVietnamese, matchesQuery, messageText, conversationMatches, timeGroupOf, groupByTime,
  buildTranscriptMarkdown, exportFileName, itemsForTab, itemsForProject, tabCounts, buildGroups, type HistoryConversation,
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

describe('tabs: all / pinned / archived', () => {
  const mk = (id: string, flags: { p?: boolean | null; a?: boolean | null }, h = 12): HistoryConversation => ({ id, title: id, updated_at: at(2026, 11, 10, h), is_pinned: flags.p, is_archived: flags.a })
  const list = [mk('plain', {}), mk('pin', { p: true }, 9), mk('arch', { a: true }), mk('pinarch', { p: true, a: true }), mk('legacy', { p: null, a: null }), mk('unset', {}, 8)]
  it('"all" hides archived; "pinned" shows pinned and not archived; "archived" shows archived (pinned or not)', () => {
    expect(itemsForTab(list, 'all').map(c => c.id)).toEqual(['plain', 'pin', 'legacy', 'unset'])
    expect(itemsForTab(list, 'pinned').map(c => c.id)).toEqual(['pin'])
    expect(itemsForTab(list, 'archived').map(c => c.id)).toEqual(['arch', 'pinarch'])
  })
  it('counts agree with the tabs, and a row without the flags (older server) counts as plain', () => {
    expect(tabCounts(list)).toEqual({ all: 4, pinned: 1, archived: 2, projects: 0 })
    expect(tabCounts([{ id: 'x', title: 'x', updated_at: at(2026, 11, 10) }], 3)).toEqual({ all: 1, pinned: 0, archived: 0, projects: 3 })
  })
  it('a project shows its own conversations, hides the archived ones, and ignores rows without a project (older server)', () => {
    const rows: HistoryConversation[] = [
      { id: 'a', title: 'a', updated_at: at(2026, 11, 10), project_id: 'p1' },
      { id: 'b', title: 'b', updated_at: at(2026, 11, 10), project_id: 'p1', is_archived: true },
      { id: 'c', title: 'c', updated_at: at(2026, 11, 10), project_id: 'p2' },
      { id: 'd', title: 'd', updated_at: at(2026, 11, 10) },
      { id: 'e', title: 'e', updated_at: at(2026, 11, 10), project_id: null },
    ]
    expect(itemsForProject(rows, 'p1').map(c => c.id)).toEqual(['a'])
    expect(itemsForProject(rows, 'none').map(c => c.id)).toEqual([])
  })
  it('on "all" the pinned come first in their own group, newest first; the rest follow by day', () => {
    const groups = buildGroups(itemsForTab(list, 'all'), 'all', NOW)
    expect(groups.map(g => g.key)).toEqual(['pinned', 'today'])
    expect(groups[0].items.map(c => c.id)).toEqual(['pin'])
    expect(groups[1].items.map(c => c.id)).toEqual(['plain', 'legacy', 'unset'])
  })
  it('on "pinned" and "archived" there is no pinned group, only days', () => {
    expect(buildGroups(itemsForTab(list, 'pinned'), 'pinned', NOW).map(g => g.key)).toEqual(['today'])
    expect(buildGroups(itemsForTab(list, 'archived'), 'archived', NOW).map(g => g.key)).toEqual(['today'])
    expect(buildGroups([], 'all', NOW)).toEqual([])
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
