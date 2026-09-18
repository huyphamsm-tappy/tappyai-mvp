import { describe, it, expect } from 'vitest'
import { plainRequestTopic, appendHistoryTopic, TOPIC_CHARS, HISTORY_KEEP } from './memoryTopic'

describe('plainRequestTopic — the history entry a plain request leaves without a model call', () => {
  it('records the first request of a thread, normalised and clipped', () => {
    expect(plainRequestTopic({ text: '  tim quan   bun bo ngon o q1 duoi 80k ', intent: 'tool', isFirstReply: true }))
      .toBe('tim quan bun bo ngon o q1 duoi 80k')
    const long = 'Cả nhà 6 người có con nít ăn trưa cuối tuần, cần chỗ đậu xe ô tô, Phú Nhuận'
    const t = plainRequestTopic({ text: long, intent: 'tool', isFirstReply: true })!
    expect(t.length).toBeLessThanOrEqual(TOPIC_CHARS)
    expect(t.endsWith('…')).toBe(true)
  })
  it('is null for chitchat, for a follow-up inside a thread and for a too-short text', () => {
    expect(plainRequestTopic({ text: 'xin chào bạn nhé', intent: 'chitchat', isFirstReply: true })).toBeNull()
    expect(plainRequestTopic({ text: 'quán này mở mấy giờ?', intent: 'tool', isFirstReply: false })).toBeNull()
    expect(plainRequestTopic({ text: 'massage', intent: 'tool', isFirstReply: true })).toBeNull()
  })
})

describe('appendHistoryTopic', () => {
  it('appends newest-last, de-duplicates case/space-insensitively, keeps the last HISTORY_KEEP', () => {
    const existing = { location_base: null, preferences: {}, budget: {}, history: ['spa Quận 3', 'Bún bò  Quận 1'] }
    expect(appendHistoryTopic(existing, 'bún bò quận 1')).toEqual(['spa Quận 3', 'bún bò quận 1'])
    const many = { ...existing, history: Array.from({ length: 12 }, (_, i) => `t${i}`) }
    const out = appendHistoryTopic(many, 'new')
    expect(out.length).toBe(HISTORY_KEEP)
    expect(out[out.length - 1]).toBe('new')
    expect(appendHistoryTopic(null, 'first')).toEqual(['first'])
  })
})
