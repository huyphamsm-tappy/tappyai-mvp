// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { noPageReadNote } from './unreadableSources'

describe('noPageReadNote — one more official page when none could be read (flag on)', () => {
  it('a search ran, no page read, read_page not tried → the note (vi / en)', () => {
    expect(noPageReadNote({ webSearchOk: 1, readPageCalls: 0, pagesRead: 0 }, 'vi')).toMatch(/read_page[\s\S]*host khác/)
    expect(noPageReadNote({ webSearchOk: 1, readPageCalls: 0, pagesRead: 0 }, 'en')).toMatch(/different host/)
  })
  it('never when a page was read, read_page was already called, or nothing was searched', () => {
    expect(noPageReadNote({ webSearchOk: 1, readPageCalls: 0, pagesRead: 1 }, 'vi')).toBeNull()
    expect(noPageReadNote({ webSearchOk: 1, readPageCalls: 1, pagesRead: 0 }, 'vi')).toBeNull()
    expect(noPageReadNote({ webSearchOk: 0, readPageCalls: 0, pagesRead: 0 }, 'vi')).toBeNull()
  })
})
