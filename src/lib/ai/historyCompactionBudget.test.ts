import { describe, it, expect } from 'vitest'
import { compactHistory, compactHistoryToBudget, compactOldAssistant, MAX_OLD_ASSISTANT_CHARS } from './historyCompaction'
import { REQUEST_HISTORY_BUDGET } from '@/lib/chat/requestHistory'

// P0-1 (29/10 audit): the one-brain history keeps every message whole while it fits the existing request budget; over it, the OLDEST assistant replies
// give way first (the same compaction the other routes use) and the last assistant reply, every user turn, the roles and the order are never touched.

const reply = (tag: string, n = 40) => `Quyết định ${tag}.\n\n` + `Chi tiết dài của ${tag}, kèm bảng và danh sách. `.repeat(n) + `\n\n**Nhà Hàng ${tag}** là lựa chọn.`
const len = (ms: Array<{ content: unknown }>) => ms.reduce((n, m) => n + String(m.content).length, 0)

describe('compactHistoryToBudget', () => {
  const thread = [
    { role: 'user', content: 'u1' }, { role: 'assistant', content: reply('A1') },
    { role: 'user', content: 'u2' }, { role: 'assistant', content: reply('A2') },
    { role: 'user', content: 'u3' }, { role: 'assistant', content: reply('A3') },
    { role: 'user', content: 'u4' },
  ]
  it('inside the budget: the very same messages, none compacted (compactHistory alone would shrink the old ones)', () => {
    const total = len(thread)
    expect(compactHistoryToBudget(thread, total + 1)).toBe(thread) // the very array: nothing was touched
    expect(compactHistory(thread)[1].content).not.toBe(thread[1].content)
  })
  it('over the budget: oldest assistant first, stops as soon as it fits, the last assistant reply and all user turns whole', () => {
    const budget = len(thread) - 300
    const out = compactHistoryToBudget(thread, budget)
    expect(len(out)).toBeLessThanOrEqual(budget)
    expect(out[1].content).toBe(compactOldAssistant(thread[1].content as string))
    expect(out[3].content).toBe(thread[3].content) // not needed to fit: untouched
    expect(out[5].content).toBe(thread[5].content) // the last assistant reply
    expect(out.filter(m => m.role === 'user').map(m => m.content)).toEqual(['u1', 'u2', 'u3', 'u4'])
    expect(out.map(m => m.role)).toEqual(thread.map(m => m.role))
  })
  it('far over the budget: every older assistant reply is compacted, the last one is never touched, entities survive', () => {
    const out = compactHistoryToBudget(thread, 100)
    expect(out[1].content).toContain('Quyết định A1.')
    expect(out[1].content).toContain('**Nhà Hàng A1**')
    expect(out[3].content).toContain('**Nhà Hàng A2**')
    expect(out[5].content).toBe(thread[5].content)
    expect((out[1].content as string).length).toBeLessThanOrEqual(MAX_OLD_ASSISTANT_CHARS + 80)
  })
  it('array content (text parts) is compacted too and other parts pass through; the input is not mutated', () => {
    const parts = [{ type: 'text', text: reply('B1') }, { type: 'image', image: 'x' }]
    const msgs = [{ role: 'user', content: 'q' }, { role: 'assistant', content: parts }, { role: 'user', content: 'q2' }, { role: 'assistant', content: reply('B2') }, { role: 'user', content: 'q3' }]
    const before = JSON.stringify(msgs)
    const out = compactHistoryToBudget(msgs, 100)
    expect(JSON.stringify(msgs)).toBe(before)
    const p = out[1].content as Array<{ type: string; text?: string }>
    expect(p[0].text!.length).toBeLessThan(reply('B1').length)
    expect(p[1]).toEqual({ type: 'image', image: 'x' })
  })
  it('a long USER turn is never compacted, whatever the budget; the default budget is the web client\'s request budget', () => {
    const longUser = 'Yêu cầu dài của người dùng, nêu ràng buộc rõ ràng: '.repeat(30)
    const msgs = [{ role: 'user', content: longUser }, { role: 'assistant', content: reply('D1') }, { role: 'user', content: 'tiếp' }, { role: 'assistant', content: reply('D2') }, { role: 'user', content: 'nữa' }]
    expect(compactHistoryToBudget(msgs, 100)[0].content).toBe(longUser)
    const filler = { role: 'assistant', content: 'x'.repeat(REQUEST_HISTORY_BUDGET) }
    const over = [{ role: 'user', content: 'a' }, { role: 'assistant', content: reply('E1') }, { role: 'user', content: 'b' }, filler, { role: 'user', content: 'c' }]
    expect(compactHistoryToBudget(over)[1].content).not.toBe(reply('E1')) // over the default budget: the oldest assistant gave way
    const under = [{ role: 'user', content: 'a' }, { role: 'assistant', content: reply('E1') }, { role: 'user', content: 'b' }]
    expect(compactHistoryToBudget(under)).toBe(under)
  })
  it('no assistant message, or one only: nothing to compact', () => {
    const one = [{ role: 'user', content: 'a' }, { role: 'assistant', content: reply('C1') }, { role: 'user', content: 'b' }]
    expect(compactHistoryToBudget(one, 10)).toEqual(one)
    expect(compactHistoryToBudget([{ role: 'user', content: 'a' }], 1)).toEqual([{ role: 'user', content: 'a' }])
  })
})
