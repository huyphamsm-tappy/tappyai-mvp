import { describe, it, expect } from 'vitest'
import { HISTORY_PAGE_SIZE, type HistoryConversation } from '@/lib/chat/workspace/historyModel'
import { mergeFirstPage } from './useConversationList'

const row = (id: string, minutesAgo: number): HistoryConversation => ({ id, title: id, updated_at: new Date(Date.UTC(2026, 10, 10, 12, 0) - minutesAgo * 60_000).toISOString() })
const page = (n: number, from = 0) => Array.from({ length: n }, (_, i) => row(`p${from + i}`, from + i))

describe('mergeFirstPage (history paging)', () => {
  it('a short first page is the whole list: nothing older is kept, and there is nothing more to load', () => {
    const prev = [...page(5), row('old', 9000)]
    const { items, keptOlder } = mergeFirstPage(prev, page(3))
    expect(items.map(c => c.id)).toEqual(['p0', 'p1', 'p2'])
    expect(keptOlder).toBe(0)
  })

  it('a full first page keeps the older pages the person already loaded, without duplicates', () => {
    const first = page(HISTORY_PAGE_SIZE)
    const olderLoaded = page(10, HISTORY_PAGE_SIZE + 5) // older than everything on the first page
    const prev = [...first.slice(0, 5), ...olderLoaded]
    const { items, keptOlder } = mergeFirstPage(prev, first)
    expect(keptOlder).toBe(10)
    expect(items.length).toBe(HISTORY_PAGE_SIZE + 10)
    expect(new Set(items.map(c => c.id)).size).toBe(items.length)
    expect(items.slice(0, HISTORY_PAGE_SIZE).map(c => c.id)).toEqual(first.map(c => c.id))
  })

  it('a conversation that moved to the top is not duplicated by the older copy', () => {
    const first = page(HISTORY_PAGE_SIZE)
    const stale = { ...row('p0', 5000) } // the same id as the newest row, remembered with an old time
    const { items } = mergeFirstPage([stale], first)
    expect(items.filter(c => c.id === 'p0').length).toBe(1)
  })

  it('an empty first page empties the list', () => {
    expect(mergeFirstPage(page(4), []).items).toEqual([])
  })
})
