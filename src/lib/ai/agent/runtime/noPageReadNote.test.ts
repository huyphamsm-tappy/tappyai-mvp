// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { noPageReadNote, noFigureReadNote, PRICE_INTENT } from './unreadableSources'

describe('noFigureReadNote — pages were read but state no figure for a price question', () => {
  it('only for a price question, with pages read, none stating money, read_page not tried', () => {
    expect(noFigureReadNote({ priceIntent: true, pagesRead: 1, pagesWithMoney: 0, readPageCalls: 0 }, 'vi')).toMatch(/MỘT trang bài viết/)
    expect(noFigureReadNote({ priceIntent: false, pagesRead: 1, pagesWithMoney: 0, readPageCalls: 0 }, 'vi')).toBeNull()
    expect(noFigureReadNote({ priceIntent: true, pagesRead: 0, pagesWithMoney: 0, readPageCalls: 0 }, 'vi')).toBeNull()
    expect(noFigureReadNote({ priceIntent: true, pagesRead: 1, pagesWithMoney: 1, readPageCalls: 0 }, 'vi')).toBeNull() // a figure was found
    expect(noFigureReadNote({ priceIntent: true, pagesRead: 1, pagesWithMoney: 0, readPageCalls: 1 }, 'vi')).toBeNull() // already tried once
  })
  it('price intent on folded text', () => {
    for (const q of ['gia xang ron 95 iii hom nay bao nhieu mot lit', 'ty gia usd vnd hom nay', 'how much is gold today']) expect(PRICE_INTENT.test(` ${q} `), q).toBe(true)
    for (const q of ['thu tuc lam ho chieu', 'tin tuc moi ve etna', 'giai thich lai don lai kep']) expect(PRICE_INTENT.test(` ${q} `), q).toBe(false)
  })
})

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
